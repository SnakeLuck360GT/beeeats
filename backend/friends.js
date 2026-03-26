// Friend CRUD functions — requires supabase.js to have run first.
// All functions assume window.supabaseClient is initialised.

// ── Search ───────────────────────────────────────────────────────────────────

// Returns the user row for a given Spotify ID, or null if not found.
async function getFriendInfo(spotifyId) {
  const { data, error } = await window.supabaseClient
    .from('users')
    .select('spotify_id, display_name, avatar_url')
    .eq('spotify_id', spotifyId)
    .maybeSingle();

  if (error) { console.warn('getFriendInfo error:', error.message); return null; }
  return data;
}

// ── Send request ─────────────────────────────────────────────────────────────

// Tries to send a friend request from myId to targetId.
// Returns { success: true } or { error: 'not_found' | 'already_friends' | 'already_pending' | 'db_error' }
async function sendFriendRequest(myId, targetId) {
  // Check the target user exists in our database
  const { data: targetUser, error: lookupErr } = await window.supabaseClient
    .from('users')
    .select('spotify_id')
    .eq('spotify_id', targetId)
    .maybeSingle();

  if (lookupErr) return { error: 'db_error' };

  // If not in database, try to look them up via Spotify and create a stub entry
  if (!targetUser) {
    const token = localStorage.getItem('spotify_access_token');
    if (!token) return { error: 'not_found' };

    try {
      const res = await fetch(`https://api.spotify.com/v1/users/${encodeURIComponent(targetId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { error: 'not_found' };
      const spotifyUser = await res.json();

      // Create a stub row so friend requests and lookups work
      const { error: stubErr } = await window.supabaseClient
        .from('users')
        .upsert({
          spotify_id:   spotifyUser.id,
          display_name: spotifyUser.display_name || spotifyUser.id,
          avatar_url:   spotifyUser.images?.[0]?.url ?? null,
          updated_at:   new Date().toISOString(),
        }, { onConflict: 'spotify_id' });

      if (stubErr) return { error: 'db_error' };
    } catch {
      return { error: 'not_found' };
    }
  }

  // Check whether a friendship (in either direction) already exists
  const { data: existing, error: existErr } = await window.supabaseClient
    .from('friendships')
    .select('id, status')
    .or(
      `and(requester_id.eq.${myId},addressee_id.eq.${targetId}),` +
      `and(requester_id.eq.${targetId},addressee_id.eq.${myId})`
    )
    .maybeSingle();

  if (existErr) return { error: 'db_error' };
  if (existing?.status === 'accepted') return { error: 'already_friends' };
  if (existing?.status === 'pending')  return { error: 'already_pending' };

  const { error: insertErr } = await window.supabaseClient
    .from('friendships')
    .insert({ requester_id: myId, addressee_id: targetId, status: 'pending' });

  return insertErr ? { error: 'db_error' } : { success: true };
}

// ── Incoming requests ────────────────────────────────────────────────────────

// Returns all pending requests sent TO myId (i.e. requests I need to accept/decline).
async function getPendingRequests(myId) {
  const { data, error } = await window.supabaseClient
    .from('friendships')
    .select(`
      id,
      requester_id,
      users!friendships_requester_id_fkey ( spotify_id, display_name, avatar_url )
    `)
    .eq('addressee_id', myId)
    .eq('status', 'pending');

  if (error) { console.warn('getPendingRequests error:', error.message); return []; }

  return (data || []).map(row => ({
    friendship_id: row.id,
    spotify_id:    row.users.spotify_id,
    display_name:  row.users.display_name,
    avatar_url:    row.users.avatar_url,
  }));
}

// ── Accept / decline ─────────────────────────────────────────────────────────

async function acceptFriendRequest(friendshipId) {
  const { error } = await window.supabaseClient
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId);

  if (error) console.warn('acceptFriendRequest error:', error.message);
}

async function declineFriendRequest(friendshipId) {
  const { error } = await window.supabaseClient
    .from('friendships')
    .delete()
    .eq('id', friendshipId);

  if (error) console.warn('declineFriendRequest error:', error.message);
}

// ── Friends list ─────────────────────────────────────────────────────────────

// Returns all accepted friends for myId (both directions of the relationship).
async function getFriends(myId) {
  const { data, error } = await window.supabaseClient
    .from('friendships')
    .select(`
      requester_id,
      addressee_id,
      requester:users!friendships_requester_id_fkey ( spotify_id, display_name, avatar_url ),
      addressee:users!friendships_addressee_id_fkey ( spotify_id, display_name, avatar_url )
    `)
    .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`)
    .eq('status', 'accepted');

  if (error) { console.warn('getFriends error:', error.message); return []; }

  return (data || []).map(row => {
    const friend = row.requester_id === myId ? row.addressee : row.requester;
    return {
      spotify_id:   friend.spotify_id,
      display_name: friend.display_name,
      avatar_url:   friend.avatar_url,
    };
  });
}

// ── Friend's playlists ───────────────────────────────────────────────────────

// Returns all remix playlists saved by a given Spotify user, newest first.
async function getFriendPlaylists(spotifyId) {
  const { data, error } = await window.supabaseClient
    .from('remix_playlists')
    .select('spotify_playlist_id, name, description, cover_url, track_count, external_url, created_at')
    .eq('owner_spotify_id', spotifyId)
    .order('created_at', { ascending: false });

  if (error) { console.warn('getFriendPlaylists error:', error.message); return []; }
  return data || [];
}
