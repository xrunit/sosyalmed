const GIPHY_API = 'https://api.giphy.com/v1/gifs';
const GIPHY_MEDIA_HOST = /^media\d*\.giphy\.com$/i;
const MAX_RESULTS = 24;
const REQUEST_TIMEOUT_MS = 8000;

function isGiphyMediaUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      GIPHY_MEDIA_HOST.test(url.hostname) &&
      /^\/media\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(gif|webp)$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendError(res, 405, 'Method not allowed.');
  }

  const apiKey = process.env.GIPHY_API_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!apiKey || !supabaseUrl || !supabaseAnonKey) {
    return sendError(res, 503, 'GIF service is not configured.');
  }

  const authorization = req.headers.authorization;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    return sendError(res, 401, 'Sign in to search GIFs.');
  }

  const authController = new AbortController();
  const authTimeout = setTimeout(() => authController.abort(), REQUEST_TIMEOUT_MS);
  let userResponse;
  try {
    userResponse = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
      headers: { apikey: supabaseAnonKey, Authorization: authorization },
      signal: authController.signal,
    });
  } catch {
    return sendError(res, 502, 'Could not verify the current session.');
  } finally {
    clearTimeout(authTimeout);
  }
  if (!userResponse.ok) return sendError(res, 401, 'Sign in to search GIFs.');

  const params = new URL(req.url, 'https://vercel.local').searchParams;
  const query = (params.get('q') ?? '').trim();
  const type = params.get('type') ?? (query ? 'search' : 'trending');
  if (type !== 'search' && type !== 'trending') return sendError(res, 400, 'Invalid GIF search type.');
  if (type === 'search' && (query.length < 2 || query.length > 80)) {
    return sendError(res, 400, 'Search must be between 2 and 80 characters.');
  }

  const requestedLimit = Number(params.get('limit') ?? 18);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), MAX_RESULTS) : 18;
  const endpoint = type === 'search' ? 'search' : 'trending';
  const upstreamUrl = new URL(`${GIPHY_API}/${endpoint}`);
  upstreamUrl.searchParams.set('api_key', apiKey);
  upstreamUrl.searchParams.set('limit', String(limit));
  upstreamUrl.searchParams.set('rating', 'g');
  if (type === 'search') {
    upstreamUrl.searchParams.set('q', query);
    upstreamUrl.searchParams.set('lang', 'en');
  }

  const giphyController = new AbortController();
  const giphyTimeout = setTimeout(() => giphyController.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(upstreamUrl, { signal: giphyController.signal });
    if (!response.ok) {
      console.error(`GIPHY API request failed with status ${response.status}.`);
      return sendError(res, 502, 'GIF search is temporarily unavailable.');
    }

    const payload = await response.json();
    const gifs = (Array.isArray(payload.data) ? payload.data : [])
      .map((gif) => {
        const preview = gif.images?.fixed_width_small?.url ?? gif.images?.fixed_width?.url;
        const url = gif.images?.original?.url;
        if (!isGiphyMediaUrl(preview) || !isGiphyMediaUrl(url)) return null;
        return {
          id: String(gif.id ?? ''),
          title: String(gif.title ?? 'GIF').slice(0, 120),
          preview,
          url,
        };
      })
      .filter(Boolean);

    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.status(200).json({ gifs });
  } catch {
    return sendError(res, 502, 'GIF search is temporarily unavailable.');
  } finally {
    clearTimeout(giphyTimeout);
  }
}
