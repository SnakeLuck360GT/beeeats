/**
 * auth.js — session management using old token system (netlify backend)
 * Keys: spotify_access_token, spotify_refresh_token, spotify_expiry_timestamp, spotify_id
 */

function getSession() {
  return {
    access_token:  localStorage.getItem('spotify_access_token'),
    refresh_token: localStorage.getItem('spotify_refresh_token'),
    expires_at:    localStorage.getItem('spotify_expiry_timestamp'),
    spotify_id:    localStorage.getItem('spotify_id'),
  };
}

function setSession(data) {
  if (data.access_token  !== undefined) localStorage.setItem('spotify_access_token',    data.access_token);
  if (data.refresh_token !== undefined) localStorage.setItem('spotify_refresh_token',   data.refresh_token);
  if (data.expires_at    !== undefined) localStorage.setItem('spotify_expiry_timestamp', String(data.expires_at));
  if (data.spotify_id    !== undefined) localStorage.setItem('spotify_id',              data.spotify_id);
}

function clearSession() {
  ['spotify_access_token','spotify_refresh_token','spotify_expiry_timestamp','spotify_id']
    .forEach(k => localStorage.removeItem(k));
}

function _loginUrl() {
  return window.location.pathname.includes('/playlist-mixing/') ? '../login.html' : 'login.html';
}

function requireAuth() {
  const { access_token } = getSession();
  if (!access_token) window.location.href = _loginUrl();
}

function markInternalNavigation() {}
function setupSessionClear() {}

async function refreshTokenIfNeeded() {
  const session = getSession();
  if (!session.refresh_token || !session.expires_at) return;
  const FIVE_MIN = 5 * 60 * 1000;
  if (Date.now() + FIVE_MIN < Number(session.expires_at)) return;
  try {
    const res = await fetch('https://spotifycallback.netlify.app/.netlify/functions/api/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: session.refresh_token }),
    });
    if (!res.ok) { clearSession(); window.location.href = _loginUrl(); return; }
    const { access_token, expires_in } = await res.json();
    setSession({ access_token, expires_at: Date.now() + expires_in * 1000 });
  } catch { /* network error, leave existing token */ }
}

function startOwnershipCheck() {
  const INTERVAL = 5 * 60 * 1000;

  async function runCheck() {
    const { access_token, spotify_id } = getSession();
    if (!access_token || !spotify_id) { clearSession(); window.location.href = _loginUrl(); return; }
    try {
      const res = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (res.status === 401) { clearSession(); window.location.href = _loginUrl(); return; }
      if (!res.ok) return;
      const me = await res.json();
      if (me.id !== spotify_id) { clearSession(); window.location.href = _loginUrl(); return; }
    } catch { }
  }

  const id = setInterval(runCheck, INTERVAL);
  window.addEventListener('pagehide', () => clearInterval(id));
}
