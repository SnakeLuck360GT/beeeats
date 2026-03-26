// Supabase client — loaded after config.js and the Supabase CDN script.
// SUPABASE_URL and SUPABASE_ANON_KEY must be defined in backend/config.js.

window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Called right after a successful Spotify login (in script.js).
// Registers the user in the Supabase users table so friends can find them.
async function upsertCurrentUser(me) {
  const { error } = await window.supabaseClient
    .from('users')
    .upsert({
      spotify_id:   me.id,
      display_name: me.display_name || me.id,
      avatar_url:   me.images?.[0]?.url ?? null,
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'spotify_id' });

  if (error) console.warn('Supabase upsert user failed:', error.message);
}

// Called in preview.js after a playlist is successfully created on Spotify.
// Mirrors the playlist record so friends can see it without Spotify API access.
async function mirrorPlaylistToSupabase(playlistId, ownerId, name, description, trackCount, externalUrl) {
  const { error } = await window.supabaseClient
    .from('remix_playlists')
    .upsert({
      spotify_playlist_id: playlistId,
      owner_spotify_id:    ownerId,
      name,
      description,
      cover_url:   null,
      track_count: trackCount,
      external_url: externalUrl,
      created_at:  new Date().toISOString(),
    }, { onConflict: 'spotify_playlist_id' });

  if (error) console.warn('Supabase mirror playlist failed:', error.message);
}
