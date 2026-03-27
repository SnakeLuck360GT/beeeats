const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

async function getSpotifyAccessToken() {
  await refreshTokenIfNeeded();
  const token = localStorage.getItem('spotify_access_token');
  if (!token) {
    throw new Error('Missing Spotify access token. Complete Spotify login first.');
  }
  return token;
}

async function spotifyRequest(path, options = {}) {
  const token = await getSpotifyAccessToken();
  const res = await fetch(`${SPOTIFY_API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('Spotify API error', res.status, body);
    throw new Error(`Spotify API error ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function fetchSpotifyMe() {
  const me = await spotifyRequest('/me');
  return {
    id: me.id,
    displayName: me.display_name,
    product: me.product,
    isPremium: me.product === 'premium',
  };
}

async function fetchUserPlaylists(limit = 50) {
  const data = await spotifyRequest(`/me/playlists?limit=${limit}`);
  return (data.items || []).map(pl => ({
    id: pl.id,
    name: pl.name,
    trackCount: pl.tracks?.total ?? 0,
    image: (pl.images && pl.images[0] && pl.images[0].url) || null,
  }));
}

function mapVibesToAudioFeatures(sliders) {
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const energy         = clamp01(sliders.energy      / 100);
  const danceability   = clamp01(sliders.formation   / 100);
  const valence        = clamp01(sliders.mood        / 100);
  const acousticness   = clamp01(1 - sliders.instrument / 100);
  const popularity     = clamp01(sliders.era         / 100);

  return {
    target_energy:       energy,
    target_danceability: danceability,
    target_valence:      valence,
    target_acousticness: acousticness,
    target_popularity:   Math.round(popularity * 100),
  };
}

async function generateTracksFromPreferences({ seedPlaylists, seedGenres, sliders, limit = 20 }) {
  const audio = mapVibesToAudioFeatures(sliders || {});

  const params = new URLSearchParams();
  params.set('limit', String(limit));

  const pickedGenres   = (seedGenres || []).slice(0, 3);
  const pickedPlaylists = (seedPlaylists || []).slice(0, 2);

  if (pickedGenres.length) {
    params.set('seed_genres', pickedGenres.join(',').toLowerCase().replace(/\s+/g, '-'));
  } else {
    params.set('seed_genres', 'pop');
  }

  Object.entries(audio).forEach(([key, value]) => {
    params.set(key, String(value));
  });

  const recs = await spotifyRequest(`/recommendations?${params.toString()}`);

  return (recs.tracks || []).map((t, idx) => ({
    idx,
    id: t.id,
    uri: t.uri,
    name: t.name,
    artist: (t.artists && t.artists.map(a => a.name).join(', ')) || 'Unknown Artist',
    durationMs: t.duration_ms,
    duration: formatDurationFromMs(t.duration_ms),
    previewUrl: t.preview_url,
    albumImage: (t.album && t.album.images && t.album.images[0] && t.album.images[0].url) || null,
    spotifyUrl: (t.external_urls && t.external_urls.spotify) || null,
  }));
}

function formatDurationFromMs(ms) {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

async function saveTracksToSpotifyLibrary(trackIds) {
  if (!trackIds || !trackIds.length) return;
  const chunkSize = 50;
  for (let i = 0; i < trackIds.length; i += chunkSize) {
    const chunk = trackIds.slice(i, i + chunkSize);
    await spotifyRequest('/me/tracks', {
      method: 'PUT',
      body: JSON.stringify({ ids: chunk }),
    });
  }
}

async function playFullTrackOnActiveDevice(trackUri) {
  if (!trackUri) return;
  await spotifyRequest('/me/player/play', {
    method: 'PUT',
    body: JSON.stringify({ uris: [trackUri] }),
  });
}
