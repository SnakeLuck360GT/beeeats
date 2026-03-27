const STORAGE_KEY = 'playlist_builder_state';

const DEFAULT_STATE = {
  currentStep: 0,
  selectedPlaylist: null,
  selectedPlaylists: [],
  selectedGenres: [],
  sliders: {
    energy:     50,
    instrument: 30,
    mood:       40,
    formation:  60,
    eraMin:     1960,
    eraMax:     2025,
  },
  generatedTracks: [],
  isPremium: false,
};

function getState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : { ...DEFAULT_STATE };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function setState(partial) {
  const current = getState();
  const next = { ...current, ...partial };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  return next;
}

function resetState() {
  localStorage.removeItem(STORAGE_KEY);
}

const PAGES = [
  'select-playlist.html',
  'genres.html',
  'vibes.html',
  'generating.html',
  'preview.html',
];

function navigateTo(step) {
  setState({ currentStep: step });
  document.body.style.transition = 'opacity 0.38s ease';
  document.body.style.opacity = '0';
  setTimeout(() => {
    if (typeof markInternalNavigation === 'function') markInternalNavigation();
    window.location.href = PAGES[step];
  }, 380);
}

function renderChrome(activeStep) {
  const state = getState();

  const nav = document.getElementById('stepNav');
  if (!nav) return;
  nav.innerHTML = '';
  for (let i = 0; i < PAGES.length; i++) {
    const dot = document.createElement('button');
    dot.className = 'step-dot' +
      (i === activeStep ? ' active' : i < activeStep ? ' done' : '');
    dot.title = `Step ${i + 1}`;
    dot.disabled = i > activeStep;
    if (!dot.disabled) {
      dot.addEventListener('click', () => {
        if (i < activeStep) navigateTo(i);
      });
    }
    nav.appendChild(dot);
  }
}

function renderSummary(opts = {}) {
  const el = document.getElementById('selectionSummary');
  if (!el) return;
  const st = getState();

  const lines = [];
  if (st.selectedPlaylist && !opts.hidePlaylist) {
    lines.push(`<div class="sum-row">
      <span class="sum-icon">📋</span>
      <span><strong>${st.selectedPlaylist.emoji} ${st.selectedPlaylist.name}</strong></span>
    </div>`);
  }
  if (st.selectedGenres.length > 0 && !opts.hideGenres) {
    lines.push(`<div class="sum-row">
      <span class="sum-icon">🎸</span>
      <span>${st.selectedGenres.map(g => `<strong>${g}</strong>`).join(', ')}</span>
    </div>`);
  }
  el.innerHTML = lines.join('');
  el.style.display = lines.length ? '' : 'none';
}
