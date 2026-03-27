const CLIENT_ID = '732d056b612e4f82bef5425f2566736a';

function generateCodeVerifier() {
  const array = new Uint8Array(96);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function getSession() {
  return {
    access_token:  localStorage.getItem('spotify_access_token'),
    refresh_token: localStorage.getItem('spotify_refresh_token'),
    expires_at:    localStorage.getItem('spotify_expires_at'),
    spotify_id:    localStorage.getItem('spotify_id'),
  };
}

function setSession(data) {
  const map = {
    access_token:  'spotify_access_token',
    refresh_token: 'spotify_refresh_token',
    expires_at:    'spotify_expires_at',
    spotify_id:    'spotify_id',
  };
  for (const [key, storageKey] of Object.entries(map)) {
    if (data[key] !== undefined) localStorage.setItem(storageKey, String(data[key]));
  }
}

function clearSession() {
  ['spotify_access_token', 'spotify_refresh_token', 'spotify_expires_at', 'spotify_id']
    .forEach(k => localStorage.removeItem(k));
  sessionStorage.removeItem('pkce_code_verifier');
}

function markInternalNavigation() {
  // kept for compatibility — no longer needed for session persistence
}

function _loginUrl() {
  return window.location.pathname.includes('/playlist-mixing/') ? '../login.html' : 'login.html';
}

function requireAuth() {
  const { access_token } = getSession();
  if (!access_token) {
    markInternalNavigation();
    window.location.href = _loginUrl();
  }
}

async function refreshTokenIfNeeded() {
  const session = getSession();
  if (!session.refresh_token || !session.expires_at) return;
  const FIVE_MIN = 5 * 60 * 1000;
  if (Date.now() + FIVE_MIN < Number(session.expires_at)) return;
  try {
    const body = new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: session.refresh_token,
      client_id:     CLIENT_ID,
    });
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      clearSession();
      markInternalNavigation();
      window.location.href = _loginUrl();
      return;
    }
    const { access_token, refresh_token, expires_in } = await res.json();
    setSession({
      access_token,
      ...(refresh_token ? { refresh_token } : {}),
      expires_at: Date.now() + expires_in * 1000,
    });
  } catch { /* network error, leave existing token */ }
}

function startOwnershipCheck() {
  const INTERVAL = 5 * 60 * 1000;

  function clearAndRedirect() {
    clearSession();
    markInternalNavigation();
    window.location.href = _loginUrl();
  }

  async function runCheck() {
    const { access_token, spotify_id } = getSession();
    if (!access_token || !spotify_id) { clearAndRedirect(); return; }
    try {
      const res = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (res.status === 401) { clearAndRedirect(); return; }
      if (!res.ok) return;
      const me = await res.json();
      if (me.id !== spotify_id) { clearAndRedirect(); return; }
    } catch { /* network error, skip tick */ }
  }

  const id = setInterval(runCheck, INTERVAL);
  window.addEventListener('pagehide', () => clearInterval(id));
}

function setupSessionClear() {
  // Session now persists in localStorage — only clearSession() (logout) removes it.
  // This function is kept so existing pages calling it don't break.
}
