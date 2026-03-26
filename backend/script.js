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

const REDIRECT_URI = 'https://spotifycallback.netlify.app';

window.addEventListener('message', async (e) => {
  if (e.data && e.data.type === 'spotify:auth:done' && e.data.code) {
    try {
      const codeVerifier = sessionStorage.getItem('pkce_code_verifier');
      sessionStorage.removeItem('pkce_code_verifier');

      const body = new URLSearchParams({
        grant_type:    'authorization_code',
        code:          e.data.code,
        redirect_uri:  REDIRECT_URI,
        client_id:     CLIENT_ID,
        code_verifier: codeVerifier,
      });

      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!response.ok) {
        console.error('Token exchange failed:', await response.text());
        return;
      }

      const { access_token, refresh_token, expires_in } = await response.json();
      setSession({
        access_token,
        refresh_token,
        expires_at: Date.now() + expires_in * 1000,
      });

      const meRes = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (meRes.ok) {
        const me = await meRes.json();
        setSession({ spotify_id: me.id });
        // Register/update user in Supabase so friends can find them
        if (window.supabaseClient) {
          try { await upsertCurrentUser(me); }
          catch (err) { console.warn('Supabase upsert skipped:', err); }
        }
      }

      markInternalNavigation();
      window.location.href = 'dashboard.html';
    } catch (err) {
      console.error('Failed to exchange code for tokens:', err);
    }
  }
});

async function SpotifyLogin() {
  const verifier = generateCodeVerifier();
  sessionStorage.setItem('pkce_code_verifier', verifier);
  const challenge = await generateCodeChallenge(verifier);

  const url = 'https://accounts.spotify.com/authorize?' +
    `client_id=${CLIENT_ID}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(scopes.join(' '))}` +
    `&code_challenge_method=S256` +
    `&code_challenge=${encodeURIComponent(challenge)}` +
    `&show_dialog=true`;

  window.open(
    url,
    'Spotify Login',
    'width=500,height=700,top=100,left=100,toolbar=no,scrollbars=yes,resizable=yes'
  );
}
