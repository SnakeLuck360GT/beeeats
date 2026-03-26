
(function () {
  'use strict';
  renderChrome(4);

  const st = getState();
  const playlist = st.selectedPlaylist || { name: 'Custom Mix', emoji: '🎵' };
  const genres   = st.selectedGenres  || [];
  let   tracks   = st.generatedTracks || [];
  const isPremium = !!st.isPremium;

  function getAccessToken() {
    const token = localStorage.getItem('spotify_access_token');
    if (!token) throw new Error('No Spotify access token found. Please log in again.');
    return token;
  }

  async function saveTracksToSpotifyLibrary(trackIds, playlistName) {
    if (!trackIds.length) throw new Error('No track IDs to save.');
    const token = getAccessToken();

    const spotifyFetch = async (url, options = {}) => {
      const res = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      });
      if (res.status === 401) throw new Error('Spotify token expired or invalid.');
      if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);
      return res.status === 204 ? null : res.json();
    };
    const me = await spotifyFetch('https://api.spotify.com/v1/me');

    const st = getState();
    const genres = (st.selectedGenres || []).join(', ');
    const nameToSave = playlistName || `BEEEATS Mix — Remix${genres ? ` (${genres})` : ''}`;

    const playlist = await spotifyFetch(
      `https://api.spotify.com/v1/users/${me.id}/playlists`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: nameToSave,
          description: `Generated remix playlist${genres ? ` · Genres: ${genres}` : ''}`,
          public: false,
        }),
      }
    );

    const uris = trackIds.map(id => `spotify:track:${id}`);
    for (let i = 0; i < uris.length; i += 100) {
      const chunk = uris.slice(i, i + 100);
      await spotifyFetch(
        `https://api.spotify.com/v1/playlists/${playlist.id}/tracks`,
        {
          method: 'POST',
          body: JSON.stringify({ uris: chunk }),
        }
      );
    }

    // Mirror to Supabase so friends can see this playlist
    if (window.supabaseClient) {
      try {
        await mirrorPlaylistToSupabase(
          playlist.id,
          me.id,
          nameToSave,
          playlist.description,
          trackIds.length,
          playlist.external_urls?.spotify ?? null
        );
      } catch (err) { console.warn('Supabase mirror skipped:', err); }
    }

    return playlist;
  }

  async function playFullTrackOnActiveDevice(uri) {
    const token = getAccessToken();
    const res = await fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uris: [uri] }),
    });
    if (res.status === 401) throw new Error('Spotify token expired or invalid.');
    if (res.status === 404) throw new Error('No active Spotify device found. Open Spotify on a device first.');
    if (res.status === 403) throw new Error('Spotify Premium required for full playback.');
    if (!res.ok && res.status !== 204) throw new Error(`Spotify API error: ${res.status}`);
  }

  document.getElementById('previewArt').textContent = playlist.emoji || '🎵';
  document.getElementById('playlistTitle').value = 'BEEEATS Mix — Remix';

  const tagsEl = document.getElementById('genreTags');
  genres.forEach((g, i) => {
    const tag = document.createElement('span');
    tag.className = 'genre-tag';
    tag.textContent = g;
    tag.style.animationDelay = `${0.4 + i * 0.06}s`;
    tagsEl.appendChild(tag);
  });

  document.getElementById('metaTracks').textContent = `${tracks.length} tracks`;

  const totalSecs = tracks.reduce((sum, t) => {
    const [m, s] = (t.duration || '0:00').split(':').map(Number);
    return sum + (m || 0) * 60 + (s || 0);
  }, 0);
  document.getElementById('metaDuration').textContent =
    `${Math.max(1, Math.floor(totalSecs / 60))} min`;

let currentlyPlaying = null;
  let currentAudio = null;

  function stopCurrentAudio() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio = null;
    }
  }

  function renderTracks() {
    const listEl = document.getElementById('trackList');
    listEl.innerHTML = '';

    tracks.forEach((t, i) => {
      const row = document.createElement('div');
      row.className = 'track-item' + (currentlyPlaying === i ? ' playing' : '');
      row.dataset.idx = i;
      row.role = 'listitem';
      row.setAttribute('tabindex', '0');
      row.style.animationDelay = `${0.45 + i * 0.04}s`;
      row.setAttribute('aria-label',
        `${t.name} by ${t.artist}, ${t.duration || ''}${currentlyPlaying === i ? ', playing' : ''}`
      );

      const numCell = document.createElement('div');
      numCell.className = 'track-num';
      if (currentlyPlaying === i) {
        numCell.innerHTML = `
          <div class="eq-bars" aria-hidden="true">
            <span></span><span></span><span></span>
          </div>`;
      } else {
        numCell.textContent = String(i + 1).padStart(2, '0');
      }

      const infoCell = document.createElement('div');
      infoCell.className = 'track-info';
      infoCell.innerHTML = `
        <div class="track-name">${escapeHtml(t.name)}</div>
        <div class="track-artist">${escapeHtml(t.artist)}</div>
      `;

      const badgeCell = document.createElement('div');
      if (t.spotifyUrl) {
        badgeCell.innerHTML =
          `<a class="track-badge new" href="${t.spotifyUrl}" target="_blank" rel="noopener noreferrer">OPEN</a>`;
      }

      const durCell = document.createElement('div');
      durCell.className = 'track-duration';
      durCell.textContent = t.duration || '';

      row.appendChild(numCell);
      row.appendChild(infoCell);
      row.appendChild(badgeCell);
      row.appendChild(durCell);

      row.addEventListener('click', () => togglePlay(i));
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          togglePlay(i);
        }
      });

      listEl.appendChild(row);
    });
  }

  async function togglePlay(idx) {
    const track = tracks[idx];
    if (!track) return;

    if (currentlyPlaying === idx) {
      currentlyPlaying = null;
      stopCurrentAudio();
      renderTracks();
      return;
    }

    currentlyPlaying = idx;
    stopCurrentAudio();

    try {
      if (isPremium && track.uri) {
        await playFullTrackOnActiveDevice(track.uri);
      } else if (track.previewUrl) {
        currentAudio = new Audio(track.previewUrl);
        currentAudio.play().catch(err => {
          console.error('Error playing preview', err);
        });
      } else {
        console.warn('No preview available for this track');
      }
    } catch (err) {
      console.error('Playback error', err);
    }

    renderTracks();
  }

  renderTracks();

  document.getElementById('btnShuffle').addEventListener('click', () => {
    currentlyPlaying = null;
    stopCurrentAudio();
    for (let i = tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    }
    renderTracks();
  });

  document.getElementById('btnSave').addEventListener('click', async function () {
    const btn = this;
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Saving…';
    try {
      const trackIds = tracks.map(t => t.id).filter(Boolean);
      const playlistName = document.getElementById('playlistTitle').value.trim() || 'BEEEATS Mix — Remix';
      const playlist = await saveTracksToSpotifyLibrary(trackIds, playlistName);
      btn.classList.add('saved');
      btn.innerHTML = '<span>✓</span> Playlist Saved!';
      if (playlist?.external_urls?.spotify) {
        btn.onclick = () => window.open(playlist.external_urls.spotify, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.error('Error saving tracks to Spotify library', err);
      btn.disabled = false;
      btn.innerHTML = '<span>!</span> Try again';
      setTimeout(() => {
        btn.innerHTML = '<span>SAVE PLAYLIST</span>';
      }, 2200);
    }
  });

  document.getElementById('btnStartOver').addEventListener('click', () => {
    stopCurrentAudio();
    resetState();
    navigateTo(0);
  });

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

})();