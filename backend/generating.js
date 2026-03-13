(function () {
  'use strict';
  renderChrome(3);

  const STEPS = [
    { id: 'gs0', msg: 'Scanning your library',       duration: 700 },
    { id: 'gs1', msg: 'Matching genre profiles',      duration: 750 },
    { id: 'gs2', msg: 'Analyzing vibe parameters',    duration: 800 },
    { id: 'gs3', msg: 'Curating track selection',     duration: 700 },
    { id: 'gs4', msg: 'Polishing your mix',           duration: 650 },
  ];

  const msgEl = document.getElementById('statusMsg');
  let stepIdx = 0;

  markActive(0);

  const seq = setInterval(() => {
    markDone(stepIdx);

    stepIdx++;
    if (stepIdx < STEPS.length) {
      markActive(stepIdx);
      updateMsg(STEPS[stepIdx].msg);
    } else {
      clearInterval(seq);
      updateMsg('Finalizing your mix…');
      buildTracks().then(() => {
        setTimeout(() => navigateTo(4), 500);
      }).catch(err => {
        console.error('Error building tracks from Spotify', err);
        setTimeout(() => navigateTo(4), 500);
      });
    }
  }, STEPS[stepIdx].duration + 400);

  function markActive(idx) {
    const el = document.getElementById(STEPS[idx].id);
    if (el) el.classList.add('active');
    updateMsg(STEPS[idx].msg);
  }

  function markDone(idx) {
    const el = document.getElementById(STEPS[idx].id);
    if (el) {
      el.classList.remove('active');
      el.classList.add('done');
    }
  }

  function updateMsg(msg) {
    msgEl.classList.add('fade');
    setTimeout(() => {
      msgEl.textContent = msg;
      msgEl.classList.remove('fade');
    }, 180);
  }

  function getAccessToken() {
    const token = localStorage.getItem('spotify_access_token');
    if (!token) throw new Error('No Spotify access token found. Please log in again.');
    return token;
  }

  async function spotifyGet(path) {
    const token = getAccessToken();
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (res.status === 401) throw new Error('Spotify token expired or invalid.');
    if (!res.ok) throw new Error(`Spotify API error ${res.status} on ${path}`);
    return res.json();
  }

  async function fetchSpotifyMe() {
    const data = await spotifyGet('/me');
    return {
      id: data.id,
      isPremium: data.product === 'premium',
    };
  }

  function sortBySliders(tracks, sliders) {
    const popularityTarget = sliders.popularity != null ? sliders.popularity : null;
    if (popularityTarget == null) return tracks;
    return [...tracks].sort((a, b) =>
      Math.abs((a.popularity || 50) - popularityTarget) -
      Math.abs((b.popularity || 50) - popularityTarget)
    );
  }

  function msToDuration(ms) {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = String(totalSec % 60).padStart(2, '0');
    return `${min}:${sec}`;
  }

  function trackToObj(t) {
    return {
      id:         t.id,
      uri:        t.uri,
      name:       t.name,
      artist:     t.artists?.[0]?.name || 'Unknown Artist',
      duration:   msToDuration(t.duration_ms),
      previewUrl: t.preview_url || null,
      spotifyUrl: t.external_urls?.spotify || null,
      image:      t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || null,
      popularity: t.popularity || 50,
    };
  }

  async function generateTracksFromPreferences({ seedPlaylists, seedGenres, sliders, limit }) {
    const totalLimit = limit || 20;
    const trackMap = new Map();

    // 1. Fetch all playlist tracks in parallel, shuffle each individually
    const playlistBuckets = [];
    await Promise.all(seedPlaylists.map(async (plId) => {
      try {
        const data = await spotifyGet(
          `/playlists/${plId}/tracks?limit=50&fields=items(track(id,uri,name,artists,duration_ms,preview_url,external_urls,album,popularity))`
        );
        const items = (data.items || []).map(i => i.track).filter(Boolean);
        // shuffle this playlist's tracks
        for (let i = items.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [items[i], items[j]] = [items[j], items[i]];
        }
        if (items.length) playlistBuckets.push(items);
      } catch (err) {
        console.warn(`Could not fetch tracks from playlist ${plId}:`, err);
      }
    }));

    // 2. Round-robin interleave — one track from each playlist in turn
    if (playlistBuckets.length) {
      const maxLen = Math.max(...playlistBuckets.map(p => p.length));
      for (let i = 0; i < maxLen; i++) {
        for (const bucket of playlistBuckets) {
          const t = bucket[i];
          if (t?.id && !trackMap.has(t.id)) trackMap.set(t.id, t);
        }
      }
    }

    // 3. Fill remaining slots with genre search
    if (trackMap.size < totalLimit && seedGenres.length) {
      const needed = totalLimit * 2 - trackMap.size;
      const perGenre = Math.ceil(needed / seedGenres.length);

      for (const genre of seedGenres) {
        if (trackMap.size >= totalLimit * 2) break;
        try {
          const q = encodeURIComponent(`genre:"${genre.toLowerCase().replace(/-/g, ' ')}"`);
          const data = await spotifyGet(`/search?type=track&q=${q}&limit=${Math.min(perGenre + 5, 50)}`);
          const items = data.tracks?.items || [];
          for (const t of items) {
            if (t?.id && !trackMap.has(t.id)) trackMap.set(t.id, t);
          }
        } catch (err) {
          console.warn(`Could not search genre "${genre}":`, err);
        }
      }
    }

    if (!trackMap.size) throw new Error('Could not retrieve any tracks from Spotify.');

    // 4. Sort by slider targets and trim to limit
    const sorted = sortBySliders(Array.from(trackMap.values()), sliders);
    return sorted.slice(0, totalLimit).map(trackToObj);
  }

  async function buildTracks() {
    const st = getState();
    const genres = st.selectedGenres || [];
    const sliders = st.sliders || {};
    const seedPlaylists = (st.selectedPlaylists || []).map(p => p.id);

    try {
      const me = await fetchSpotifyMe();
      const tracks = await generateTracksFromPreferences({
        seedPlaylists,
        seedGenres: genres,
        sliders,
        limit: 50,
      });

      setState({
        generatedTracks: tracks,
        isPremium: me.isPremium,
      });
    } catch (err) {
      console.error('Falling back to empty track list due to Spotify error', err);
      setState({
        generatedTracks: [],
        isPremium: false,
      });
    }
  }

})();