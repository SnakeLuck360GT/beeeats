// ── BEEEATS Theme Utility ────────────────────────────────────────────────────
// Include this script on every page (before any CSS-dependent JS).
// It reads the saved theme from localStorage and applies it immediately,
// preventing a flash of the wrong theme on load.

(function () {
  const THEME_KEY = 'beeeats_theme';

  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
    }
  }

  function getSavedTheme() {
    try { return localStorage.getItem(THEME_KEY) || 'dark'; } catch { return 'dark'; }
  }

  function saveTheme(theme) {
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
  }

  // Apply immediately on script parse (before DOM ready) to avoid flash
  applyTheme(getSavedTheme());

  // Expose globally so profile.js and any page can call these
  window.BeeTheme = {
    get:   getSavedTheme,
    set:   function (theme) { saveTheme(theme); applyTheme(theme); },
    toggle: function () {
      const next = getSavedTheme() === 'dark' ? 'light' : 'dark';
      saveTheme(next);
      applyTheme(next);
      return next;
    },
  };
})();
