(function () {
  'use strict';

  const MAX = 5;
  const PROFILE_KEY = 'beeeats_profile_prefs';

  const GENRES = [
    'Hip-Hop',    'R&B',       'Pop',         'Rock',     'Indie',
    'Electronic', 'House',     'Techno',       'Ambient',  'Jazz',
    'Soul',       'Funk',      'Classical',    'Metal',    'Punk',
    'Reggae',     'Latin',     'Afrobeats',    'K-Pop',    'Country',
    'Blues',      'Gospel',    'Trap',         'Lo-Fi',    'Drum & Bass',
    'Shoegaze',   'Post-Rock', 'Neo-Soul',     'Synth-Pop','Alternative',
    'Disco',      'Garage',    'Psychedelic',  'Folk',     'Grunge',
    'New Wave',
  ];

  renderChrome(1);

  const st = getState();

  // Seed: use current wizard state if present, otherwise fall back to profile preferred genres
  let selected;
  if (Array.isArray(st.selectedGenres) && st.selectedGenres.length > 0) {
    selected = [...st.selectedGenres];
  } else {
    try {
      const prefs = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
      selected = Array.isArray(prefs.preferredGenres) ? [...prefs.preferredGenres] : [];
    } catch {
      selected = [];
    }
  }

  const cloud = document.getElementById('genresCloud');

  GENRES.forEach((genre, i) => {
    const btn = document.createElement('button');
    btn.className = 'genre-btn';
    btn.textContent = genre;
    btn.dataset.genre = genre;
    btn.style.animationDelay = `${0.38 + i * 0.018}s`;
    btn.setAttribute('aria-pressed', 'false');

    if (selected.includes(genre)) {
      btn.classList.add('selected');
      btn.setAttribute('aria-pressed', 'true');
    }

    btn.addEventListener('click', () => toggleGenre(btn, genre));
    cloud.appendChild(btn);
  });

  updateUI();

  function toggleGenre(btn, genre) {
    const idx = selected.indexOf(genre);

    if (idx > -1) {
      selected.splice(idx, 1);
      btn.classList.remove('selected', 'pop');
      btn.setAttribute('aria-pressed', 'false');
    } else {
      if (selected.length >= MAX) return;
      selected.push(genre);
      btn.classList.add('selected');
      btn.setAttribute('aria-pressed', 'true');
      btn.classList.remove('pop');
      requestAnimationFrame(() => btn.classList.add('pop'));
    }

    updateUI();
    saveGenres();
  }

  function updateUI() {
    const count = selected.length;
    const full  = count >= MAX;

    document.getElementById('genreCount').textContent = count;

    for (let i = 0; i < MAX; i++) {
      const pip = document.getElementById(`pip${i}`);
      const wasFilled = pip.classList.contains('filled');
      const nowFilled = i < count;

      pip.classList.toggle('filled', nowFilled);

      if (!wasFilled && nowFilled) {
        pip.classList.remove('filling');
        requestAnimationFrame(() => pip.classList.add('filling'));
      }
    }

    cloud.querySelectorAll('.genre-btn').forEach(btn => {
      const isSel = btn.classList.contains('selected');
      btn.disabled = full && !isSel;
    });

    document.getElementById('btnNext').disabled = count < MAX;
  }

  function saveGenres() {
    setState({ selectedGenres: [...selected] });
  }

  document.getElementById('btnBack').addEventListener('click', () => navigateTo(0));
  document.getElementById('btnNext').addEventListener('click', () => {
    if (selected.length === MAX) navigateTo(2);
  });

})();
