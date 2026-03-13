
(function () {
  'use strict';

  renderChrome(0);

  const gridEl = document.getElementById('playlistsGrid');
  const btnNext = document.getElementById('btnNext');

  let selectedIds = [];

  const st = getState();
  if (Array.isArray(st.selectedPlaylists) && st.selectedPlaylists.length) {
    selectedIds = st.selectedPlaylists.map(p => p.id);
  } else if (st.selectedPlaylist) {
    selectedIds = [st.selectedPlaylist.id];
  }

  async function fetchUserPlaylists(accessToken) {
    const playlists = [];
    let url = 'https://api.spotify.com/v1/me/playlists?limit=50';

    while (url) {
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (res.status === 401) throw new Error('Spotify token expired or invalid.');
      if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);

      const data = await res.json();

      data.items.forEach(pl => {
        playlists.push({
          id: pl.id,
          name: pl.name,
          trackCount: pl.tracks?.total ?? 0,
          image: pl.images?.[0]?.url || null,
        });
      });

      url = data.next; 
    }

    return playlists;
  }

  async function initPlaylists() {
    const accessToken = localStorage.getItem('spotify_access_token');
    if (!accessToken) {
      gridEl.innerHTML = '<p class="loading-msg">No Spotify access token found. Please log in again.</p>';
      btnNext.disabled = true;
      return;
    }

    try {
      gridEl.innerHTML = '<p class="loading-msg">Loading your Spotify playlists…</p>';
      const playlists = await fetchUserPlaylists(accessToken);
      if (!playlists.length) {
        gridEl.innerHTML = '<p class="loading-msg">No playlists found in your Spotify account.</p>';
        btnNext.disabled = true;
        return;
      }

      gridEl.innerHTML = '';
      playlists.forEach((pl, i) => {
        const card = document.createElement('article');
        card.className = 'playlist-card';
        card.dataset.id = pl.id;
        card.dataset.name = pl.name;
        card.dataset.count = pl.trackCount;
        card.dataset.image = pl.image || '';
        card.style.animationDelay = `${0.2 + i * 0.03}s`;

        const isSelected = selectedIds.includes(pl.id);
        if (isSelected) card.classList.add('selected');

        card.innerHTML = `
          <div class="card-check" aria-hidden="true">✓</div>
          <div class="card-art">
            ${pl.image ? `<img src="${pl.image}" alt="Cover for ${escapeHtml(pl.name)}" />` : '<span class="card-emoji" aria-hidden="true">🎵</span>'}
          </div>
          <h3 class="card-name">${escapeHtml(pl.name)}</h3>
          <p class="card-count">${pl.trackCount} tracks</p>
          <div class="card-bar"></div>
        `;

        gridEl.appendChild(card);
      });

      updateNextButtonState();
    } catch (err) {
      console.error(err);
      gridEl.innerHTML = '<p class="loading-msg">Could not load Spotify playlists. Make sure you are logged in.</p>';
      btnNext.disabled = true;
    }
  }

  gridEl.addEventListener('click', function (e) {
    const card = e.target.closest('.playlist-card');
    if (!card) return;

    const id = card.dataset.id;
    const idx = selectedIds.indexOf(id);

    if (idx > -1) {
      selectedIds.splice(idx, 1);
      card.classList.remove('selected');
    } else {
      selectedIds.push(id);
      card.classList.add('selected');
      card.style.animation = 'none';
      requestAnimationFrame(() => { card.style.animation = ''; });
    }

    saveSelection();
    updateNextButtonState();
  });

  function saveSelection() {
    const cards = Array.from(gridEl.querySelectorAll('.playlist-card'))
      .filter(card => selectedIds.includes(card.dataset.id))
      .map(card => ({
        id: card.dataset.id,
        name: card.dataset.name,
        trackCount: parseInt(card.dataset.count || '0', 10),
        image: card.dataset.image || null,
      }));

    setState({
      selectedPlaylists: cards,
      selectedPlaylist: cards[0] || null,
    });
  }

  function updateNextButtonState() {
    btnNext.disabled = selectedIds.length === 0;
  }

  btnNext.addEventListener('click', function () {
    if (!selectedIds.length) return;
    navigateTo(1);
  });

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  initPlaylists();

})();