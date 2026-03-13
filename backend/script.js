// Redirect to dashboard if already logged in, refreshing token if needed
(async () => {
  const accessToken  = localStorage.getItem('spotify_access_token');
  const refreshToken = localStorage.getItem('spotify_refresh_token');
  const expiry       = localStorage.getItem('spotify_expiry_timestamp');

  if (!refreshToken) return; // no session at all, stay on login page

  if (accessToken && Date.now() < Number(expiry)) {
    // Token still valid, go straight to dashboard
    window.location.href = 'dashboard.html';
    return;
  }

  // Token expired but refresh token exists — try to refresh
  try {
    const response = await fetch('https://spotifycallback.netlify.app/.netlify/functions/api/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: refreshToken }),
    });

    if (!response.ok) return; // refresh failed, stay on login page

    const { access_token, expires_in } = await response.json();
    localStorage.setItem('spotify_access_token', access_token);
    localStorage.setItem('spotify_expiry_timestamp', Date.now() + expires_in * 1000);

    window.location.href = 'dashboard.html';
  } catch {
    // Network error etc — stay on login page
  }
})();

const scopes = [
  'user-read-currently-playing',
  'user-modify-playback-state',
  'user-read-playback-state',
  'user-library-modify',
  'app-remote-control',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
  'playlist-modify-public',
];

const spotifyAuthUrl = `https://accounts.spotify.com/authorize?client_id=732d056b612e4f82bef5425f2566736a&response_type=code&redirect_uri=${encodeURIComponent('https://spotifycallback.netlify.app')}&scope=${encodeURIComponent(scopes.join(' '))}`;

window.addEventListener('message', async (e) => {
  if (e.data && e.data.type === 'spotify:auth:done' && e.data.code) {
    try {
      const response = await fetch('https://spotifycallback.netlify.app/.netlify/functions/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: e.data.code }),
      });

      const text = await response.text();

      if (!response.ok) {
        console.error('Auth error:', text);
        return;
      }

      const { access_token, refresh_token, expires_in } = JSON.parse(text);

      const expiry_timestamp = Date.now() + expires_in * 1000;

      localStorage.setItem('spotify_access_token', access_token);
      localStorage.setItem('spotify_refresh_token', refresh_token);
      localStorage.setItem('spotify_expiry_timestamp', expiry_timestamp);

      window.location.href = 'dashboard.html';
    } catch (err) {
      console.error('Failed to exchange code for tokens:', err);
    }
  }
});

function SpotifyLogin() {
  localStorage.removeItem('spotify_access_token');
  localStorage.removeItem('spotify_refresh_token');
  localStorage.removeItem('spotify_expiry_timestamp');

  window.open(
    spotifyAuthUrl,
    'Spotify Login',
    'width=500,height=700,top=100,left=100,toolbar=no,scrollbars=yes,resizable=yes'
  );
}