// ── Base request ─────────────────────────────────────────────────────────────
async function lastfmRequest(params) {
  const url = new URL(LASTFM_API_BASE);
  url.searchParams.set('api_key', LASTFM_API_KEY);
  url.searchParams.set('format',  'json');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Last.fm HTTP error ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Last.fm error ${data.error}: ${data.message}`);
  return data;
}

// ── Track top tags → [ 'chill', 'indie', 'lo-fi', … ] ───────────────────────
async function lastfmGetTrackTags(artist, track) {
  try {
    const data = await lastfmRequest({
      method: 'track.getTopTags',
      artist,
      track,
      autocorrect: 1,
    });
    return (data.toptags?.tag || []).slice(0, 12).map(t => t.name.toLowerCase());
  } catch {
    return [];
  }
}

// ── Similar artists → [ 'Artist Name', … ] ───────────────────────────────────
async function lastfmGetSimilarArtists(artist, limit = 6) {
  try {
    const data = await lastfmRequest({
      method: 'artist.getSimilar',
      artist,
      limit,
      autocorrect: 1,
    });
    return (data.similarartists?.artist || []).map(a => a.name);
  } catch {
    return [];
  }
}

// ── TAG → VIBE DIMENSION MAPPING ─────────────────────────────────────────────
// Keywords that push each slider dimension toward high (100) or low (0).
// Slider dimensions match vibes.js: energy, mood, instrument, formation
// era/popularity is handled separately via Spotify's popularity field.

const LASTFM_TAG_MAP = {
  energy: {
    high: [
      'energetic', 'intense', 'powerful', 'upbeat', 'fast', 'high energy',
      'aggressive', 'hard rock', 'heavy metal', 'heavy', 'driving', 'fiery',
      'pumping', 'metal', 'punk', 'rave', 'drum and bass', 'dnb',
      'hardcore', 'thrash', 'hyper', 'explosive', 'loud', 'hype',
    ],
    low: [
      'mellow', 'calm', 'chill', 'relaxing', 'slow', 'ambient', 'soft',
      'gentle', 'peaceful', 'quiet', 'soothing', 'dreamy', 'lazy',
      'downtempo', 'lo-fi', 'lofi', 'sleep', 'meditation', 'chillout',
      'chillwave', 'slow burn', 'easy listening',
    ],
  },
  mood: {
    high: [
      'happy', 'joy', 'joyful', 'upbeat', 'fun', 'cheerful', 'bright',
      'positive', 'euphoric', 'feel good', 'uplifting', 'optimistic',
      'catchy', 'playful', 'party', 'summer', 'celebratory', 'feel-good',
      'good vibes', 'sunshine',
    ],
    low: [
      'sad', 'dark', 'melancholic', 'gloomy', 'depressive', 'melancholy',
      'somber', 'emotional', 'heartbreak', 'lonely', 'angst', 'bitter',
      'haunting', 'brooding', 'introspective', 'tragic', 'despair',
      'moody', 'grief', 'hurt', 'emo', 'atmospheric',
    ],
  },
  instrument: {
    high: [
      'electronic', 'synth', 'edm', 'techno', 'digital', 'electro',
      'synthesizer', 'house', 'trance', 'industrial', 'experimental',
      'idm', 'glitch', 'electric', 'dubstep', 'dance', 'club', 'eurodance',
    ],
    low: [
      'acoustic', 'folk', 'unplugged', 'classical', 'piano', 'guitar',
      'organic', 'live', 'banjo', 'strings', 'fingerpicking',
      'ukulele', 'mandolin', 'chamber', 'live session',
    ],
  },
  formation: {
    high: [
      'band', 'group', 'orchestra', 'choir', 'ensemble', 'collective',
      'duo', 'trio', 'quartet', 'supergroup',
    ],
    low: [
      'solo', 'singer-songwriter', 'singer songwriter', 'one man band', 'a cappella',
    ],
  },
};

// Convert a Last.fm tag array to a vibe profile { energy, mood, instrument, formation }
// Each value is 0–100, matching the slider scale used by vibes.js.
function tagsToVibeProfile(tags) {
  const profile = { energy: 50, mood: 50, instrument: 50, formation: 50 };

  for (const [dim, { high, low }] of Object.entries(LASTFM_TAG_MAP)) {
    let delta = 0;
    let hits  = 0;
    for (const tag of tags) {
      if (high.some(kw => tag.includes(kw))) { delta += 25; hits++; }
      if (low.some(kw => tag.includes(kw)))  { delta -= 25; hits++; }
    }
    if (hits > 0) {
      profile[dim] = Math.max(0, Math.min(100, 50 + delta));
    }
  }

  return profile;
}
