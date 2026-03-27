(function () {
  'use strict';
  renderChrome(3);

  // ── UI step definitions (labels must match generating.html #gs0–#gs4) ──────
  const STEPS = [
    { id: 'gs0', msg: 'Scanning your library'        },
    { id: 'gs1', msg: 'Discovering similar artists'  },
    { id: 'gs2', msg: 'Analyzing vibe tags'          },
    { id: 'gs3', msg: 'Scoring your track pool'      },
    { id: 'gs4', msg: 'Building your flow'           },
  ];

  const msgEl   = document.getElementById('statusMsg');
  const labelEl = document.getElementById('labelStep');
  let stepIdx = 0;

  markActive(0);

  function markActive(idx) {
    const el = document.getElementById(STEPS[idx].id);
    if (el) el.classList.add('active');
    if (labelEl) labelEl.textContent = `Step ${idx + 1} of ${STEPS.length}`;
    setMsg(STEPS[idx].msg);
  }

  function markDone(idx) {
    const el = document.getElementById(STEPS[idx].id);
    if (el) { el.classList.remove('active'); el.classList.add('done'); }
  }

  function setMsg(msg) {
    msgEl.classList.add('fade');
    setTimeout(() => { msgEl.textContent = msg; msgEl.classList.remove('fade'); }, 180);
  }

  function advance() {
    markDone(stepIdx);
    stepIdx++;
    if (stepIdx < STEPS.length) markActive(stepIdx);
  }

  // ── Spotify helpers ──────────────────────────────────────────────────────────
  function getToken() {
    const t = localStorage.getItem('spotify_access_token');
    if (!t) throw new Error('No Spotify token – please log in again.');
    return t;
  }

  async function spotGet(path) {
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.status === 401) throw new Error('Spotify token expired.');
    if (!res.ok) throw new Error(`Spotify error ${res.status} on ${path}`);
    return res.json();
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function extractYear(dateStr) {
    return dateStr ? parseInt(dateStr.substring(0, 4), 10) : null;
  }

  // ── Normalise a raw Spotify track object into our internal shape ─────────────
  function normalise(t, fromLibrary = false) {
    const ms  = t.duration_ms || 0;
    const sec = Math.floor(ms / 1000);
    return {
      id:          t.id,
      uri:         t.uri,
      name:        t.name,
      artist:      t.artists?.[0]?.name  || 'Unknown Artist',
      artistId:    t.artists?.[0]?.id    || null,
      duration:    `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`,
      previewUrl:  t.preview_url          || null,
      image:       t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || null,
      spotifyUrl:  t.external_urls?.spotify  || null,
      popularity:  t.popularity              ?? 50,
      artistCount: t.artists?.length         ?? 1,
      releaseYear: extractYear(t.album?.release_date),
      fromLibrary,
      vibeProfile: null,  // filled by enrichTags()
    };
  }

  // Shape that preview.js expects
  function exportTrack(t, idx) {
    return {
      idx,
      id:         t.id,
      uri:        t.uri,
      name:       t.name,
      artist:     t.artist,
      duration:   t.duration,
      previewUrl: t.previewUrl  || t.preview_url  || null,
      image:      t.image       || t.albumImage    || null,
      spotifyUrl: t.spotifyUrl  || null,
    };
  }

  // ── STEP 1 – Library scan ────────────────────────────────────────────────────
  // Fetches top 50 tracks (6-month window), top 20 artists, and all selected
  // playlist tracks in parallel, deduplicating into one Map keyed by track ID.
  async function scanLibrary(playlistIds) {
    const [topTracksRes, topArtistsRes, ...plResults] = await Promise.all([
      spotGet('/me/top/tracks?limit=50&time_range=medium_term').catch(() => ({ items: [] })),
      spotGet('/me/top/artists?limit=20').catch(() => ({ items: [] })),
      ...playlistIds.map(id =>
        spotGet(
          `/playlists/${id}/tracks?limit=50` +
          `&fields=items(track(id,uri,name,artists,duration_ms,preview_url,external_urls,album,popularity))`
        ).catch(() => ({ items: [] }))
      ),
    ]);

    const topArtists     = topArtistsRes.items || [];
    const topArtistIds   = new Set(topArtists.map(a => a.id));
    const topArtistNames = topArtists.map(a => a.name);

    const trackMap = new Map();

    for (const t of (topTracksRes.items || [])) {
      if (t?.id) trackMap.set(t.id, normalise(t, true));
    }

    for (const res of plResults) {
      for (const item of (res.items || [])) {
        const t = item?.track;
        if (t?.id && !trackMap.has(t.id)) trackMap.set(t.id, normalise(t, true));
      }
    }

    return { trackMap, topArtistIds, topArtistNames };
  }

  // ── STEP 2 – Discover similar artists via Last.fm → search Spotify ───────────
  // For each of the user's top 5 artists we ask Last.fm for 6 similar artists,
  // then search Spotify for their tracks to expand the candidate pool.
  // Genre seeds from the genres step are used as a fill-in if pool is still thin.
  async function discoverSimilar(topArtistNames, seedGenres, trackMap) {
    // Last.fm similar-artist lookups (one per top artist, parallel)
    const similarSets = await Promise.all(
      topArtistNames.slice(0, 5).map(name => lastfmGetSimilarArtists(name, 6))
    );
    const similarArtists = [...new Set(similarSets.flat())].slice(0, 15);

    // Spotify search for each similar artist
    for (const artist of similarArtists) {
      try {
        const q    = encodeURIComponent(`artist:"${artist}"`);
        const data = await spotGet(`/search?type=track&q=${q}&limit=8`);
        for (const t of (data.tracks?.items || [])) {
          if (t?.id && !trackMap.has(t.id)) trackMap.set(t.id, normalise(t, false));
        }
      } catch { /* skip individual artist if search fails */ }
    }

    // Genre search fill-in (if pool is still thin or no top artists exist)
    for (const genre of seedGenres) {
      if (trackMap.size >= 200) break;
      try {
        const q    = encodeURIComponent(`genre:"${genre.toLowerCase()}"`);
        const data = await spotGet(`/search?type=track&q=${q}&limit=20`);
        for (const t of (data.tracks?.items || [])) {
          if (t?.id && !trackMap.has(t.id)) trackMap.set(t.id, normalise(t, false));
        }
      } catch { /* skip */ }
    }

    return trackMap;
  }

  // ── STEP 3 – Enrich candidate pool with Last.fm tags ─────────────────────────
  // We enrich up to 50 tracks (30 from user library, 20 from discovery).
  // Requests are batched in groups of 5 with a 120 ms pause between batches
  // to stay well within Last.fm's rate limits.
  async function enrichTags(trackMap) {
    const all      = Array.from(trackMap.values());
    const toEnrich = [
      ...all.filter(t =>  t.fromLibrary).slice(0, 30),
      ...all.filter(t => !t.fromLibrary).slice(0, 20),
    ];

    const BATCH = 5;
    for (let i = 0; i < toEnrich.length; i += BATCH) {
      await Promise.all(
        toEnrich.slice(i, i + BATCH).map(async track => {
          const tags    = await lastfmGetTrackTags(track.artist, track.name);
          const current = trackMap.get(track.id);
          if (current) {
            const profile = tagsToVibeProfile(tags);
            const artistCount = current.artistCount ?? 1;
            if (artistCount >= 3) {
              profile.formation = Math.min(100, profile.formation + 20);
            } else if (artistCount === 1) {
              profile.formation = Math.max(0, profile.formation - 15);
            }
            trackMap.set(track.id, { ...current, vibeProfile: profile });
          }
        })
      );
      if (i + BATCH < toEnrich.length) await sleep(120);
    }
  }

  // ── STEP 4 – Score every candidate track ─────────────────────────────────────
  // Scoring formula (max ~700 pts):
  //   • Tag-dimensional match × 4 dims  → up to 400 pts  (primary signal)
  //   • Popularity ↔ era slider         → up to 100 pts
  //   • Familiarity bonus (user's artist)→       120 pts
  //   • Source bonus (user's library)   →        80 pts
  function scoreTrack(t, sliders, topArtistIds) {
    let score = 0;

    if (t.vibeProfile) {
      // Energy: blend tag score (70%) with popularity proxy (30%)
      const tagEnergyScore = 100 - Math.abs((sliders.energy ?? 50) - t.vibeProfile.energy);
      const popProxy       = 100 - Math.abs((sliders.energy ?? 50) - (t.popularity ?? 50));
      score += Math.round(tagEnergyScore * 0.7 + popProxy * 0.3);

      for (const dim of ['mood', 'instrument', 'formation']) {
        score += 100 - Math.abs((sliders[dim] ?? 50) - t.vibeProfile[dim]);
      }
    } else {
      score += 200; // neutral if no Last.fm data
    }

    // Era: score based on actual release year vs. user's min/max range
    const eraMin = sliders.eraMin ?? 1960;
    const eraMax = sliders.eraMax ?? 2025;
    if (t.releaseYear) {
      if (t.releaseYear >= eraMin && t.releaseYear <= eraMax) {
        score += 100; // within range: full score
      } else {
        const dist = Math.min(
          Math.abs(t.releaseYear - eraMin),
          Math.abs(t.releaseYear - eraMax)
        );
        score += Math.max(0, 100 - dist * 3); // 3 pts per year outside range, floor 0
      }
    } else {
      score += 50; // no release date: neutral
    }

    // Artist count hint for formation (all tracks, unenriched too)
    const targetFormation = sliders.formation ?? 50;
    const ac = t.artistCount ?? 1;
    if (ac === 1 && targetFormation < 45) score += 15;
    if (ac > 2  && targetFormation > 55) score += 15;

    if (topArtistIds.has(t.artistId)) score += 120;
    if (t.fromLibrary)                score +=  80;

    return score;
  }

  function scoreAll(trackMap, sliders, topArtistIds) {
    return Array.from(trackMap.values()).map(t => ({
      ...t,
      score: scoreTrack(t, sliders, topArtistIds),
    }));
  }

  // ── STEP 5 – Build a playlist with energy arc + artist diversity ─────────────
  // We take the top 120 scored tracks and arrange them into an energy arc
  // that reflects the user's energy slider preference:
  //   High energy  → quick ramp, stays at peak
  //   Low energy   → mellow throughout
  //   Mid energy   → classic journey arc (intro → build → peak → cool-down)
  // Within the arc, no artist appears more than twice consecutively.
  function buildFlow(scored, sliders) {
    const pool = [...scored].sort((a, b) => b.score - a.score).slice(0, 120);

    // Assign each track an effective energy value from its vibe profile
    const targetEnergy = sliders.energy ?? 50;
    const tagged = pool.map(t => ({ ...t, ev: t.vibeProfile?.energy ?? targetEnergy }));

    const low  = tagged.filter(t => t.ev <  40);
    const mid  = tagged.filter(t => t.ev >= 40 && t.ev <= 65);
    const high = tagged.filter(t => t.ev >  65);

    let arc;
    if (targetEnergy >= 65) {
      // High energy: short intro, fast climb, long peak, brief cool-down
      arc = [
        ...low.slice(0, 4),
        ...mid.slice(0, 10),
        ...high.slice(0, 25),
        ...mid.slice(10, 21),
      ];
    } else if (targetEnergy <= 35) {
      // Low energy: mellow throughout with gentle mid-section
      arc = [
        ...low.slice(0, 20),
        ...mid.slice(0, 15),
        ...low.slice(20, 35),
      ];
    } else {
      // Mid energy: classic arc
      arc = [
        ...low.slice(0,   5),
        ...mid.slice(0,  15),
        ...high.slice(0, 15),
        ...mid.slice(15, 25),
        ...low.slice(5,  10),
      ];
    }

    // Enforce no > 2 consecutive same artist, and no duplicate track IDs
    const seen   = new Set();
    const result = [];
    for (const t of arc) {
      if (result.length >= 50) break;
      if (seen.has(t.id)) continue;
      const last2 = result.slice(-2).map(x => x.artistId);
      if (last2.length === 2 && last2.every(id => id === t.artistId)) continue;
      seen.add(t.id);
      result.push(t);
    }

    // Pad to 50 from remaining pool if arc came up short
    for (const t of pool) {
      if (result.length >= 50) break;
      if (!seen.has(t.id)) { seen.add(t.id); result.push(t); }
    }

    return result.slice(0, 50).map(exportTrack);
  }

  // ── Main pipeline ─────────────────────────────────────────────────────────────
  async function run() {
    const st          = getState();
    const sliders     = st.sliders       || {};
    const playlistIds = (st.selectedPlaylists || []).map(p => p.id);
    const seedGenres  = st.selectedGenres || [];

    try {
      // Step 1 – Scan library
      const { trackMap, topArtistIds, topArtistNames } = await scanLibrary(playlistIds);
      advance(); // gs0 → gs1

      // Step 2 – Discover similar artists
      const expanded = await discoverSimilar(topArtistNames, seedGenres, trackMap);
      advance(); // gs1 → gs2

      // Step 3 – Enrich with Last.fm tags
      await enrichTags(expanded);
      advance(); // gs2 → gs3

      // Step 4 – Score all candidates
      const scored = scoreAll(expanded, sliders, topArtistIds);
      advance(); // gs3 → gs4

      // Step 5 – Build the final flow
      const tracks = buildFlow(scored, sliders);
      markDone(stepIdx);
      setMsg('Finalizing your mix…');

      const me = await spotGet('/me').catch(() => ({ product: 'free' }));
      setState({ generatedTracks: tracks, isPremium: me.product === 'premium' });
    } catch (err) {
      console.error('Generating pipeline error:', err);
      setState({ generatedTracks: [], isPremium: false });
    }
  }

  run().then(() => setTimeout(() => navigateTo(4), 500));
})();
