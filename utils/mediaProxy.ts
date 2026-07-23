/**
 * Shared helpers for proxying URLs that refuse to load via iframe.
 * Used by both MediaPanel and WebViewerPanel.
 */

const PROXY_ENDPOINT = '/api/proxy-page?url=';

/** Build the proxy URL for a given target URL. */
export const buildProxyUrl = (url: string): string =>
  PROXY_ENDPOINT + encodeURIComponent(url);

/** Check if a URL can be embedded directly without the proxy.
 *  Known embed CDNs that allow iframing by design. */
export const canEmbedDirectly = (url: string): boolean => {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    return (
      // YouTube embed — youtube.com/embed/... is designed for iframes
      (host === 'youtube.com' && u.pathname.startsWith('/embed/')) ||
      // Spotify embed
      (host === 'open.spotify.com' && u.pathname.startsWith('/embed/')) ||
      (host === 'spotify.com' && u.pathname.startsWith('/embed/'))
    );
  } catch {
    return false;
  }
};

/** Result from the proxy fetch. */
export interface ProxyResult {
  success: boolean;
  html?: string;
  text?: string;
  title?: string;
  error?: string;
  status?: number;
}

/** Fetch a page through the server proxy and return parsed result.
 *  Returns clean reader text for non-HTML or proxy failures. */
export const proxyFetch = async (url: string): Promise<ProxyResult> => {
  try {
    const res = await fetch(buildProxyUrl(url));
    const contentType = res.headers.get('content-type') || '';

    if (!res.ok) {
      // Try to parse error JSON from proxy
      try {
        const err = await res.json();
        return { success: false, error: err.error || err.message || `${res.status} ${res.statusText}`, status: res.status };
      } catch {
        return { success: false, error: `${res.status} ${res.statusText}`, status: res.status };
      }
    }

    if (contentType.includes('text/html')) {
      const html = await res.text();
      return { success: true, html, status: res.status };
    }

    // Non-HTML — return as text if small enough
    const raw = await res.text();
    if (raw.length < 100000) {
      return { success: true, text: raw.slice(0, 100000), status: res.status };
    }
    return { success: true, text: raw.slice(0, 100000), status: res.status };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error', status: 0 };
  }
};

/** Fetch a page through the proxy and extract readable text (reader mode).
 *  Strips scripts, styles, and nav elements. */
export const fetchReaderText = async (url: string): Promise<{ title: string; text: string }> => {
  try {
    const res = await fetch(buildProxyUrl(url));
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const raw = await res.text();
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    doc.querySelectorAll('script, style, noscript, svg, iframe, nav, footer, header').forEach(el => el.remove());
    return {
      title: doc.title || url,
      text: (doc.body?.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(),
    };
  } catch (err: any) {
    return { title: url, text: '' };
  }
};

/** Build a YouTube embed URL with required parameters. */
const buildYouTubeEmbedUrl = (videoId: string): string => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const params = new URLSearchParams({
    autoplay: '1', rel: '0', modestbranding: '1',
    playsinline: '1', controls: '1', fs: '1',
  });
  if (origin) params.set('origin', origin);
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
};

/** Resolve a URL to its embeddable equivalent where possible. */
export const resolveEmbedUrl = (url: string): string => {
  // YouTube: watch → embed
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return buildYouTubeEmbedUrl(ytMatch[1]);

  // YouTube short → embed
  const ytShort = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (ytShort) return buildYouTubeEmbedUrl(ytShort[1]);

  // Spotify: open → embed
  const spMatch = url.match(/open\.spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/);
  if (spMatch) return `https://open.spotify.com/embed/${spMatch[1]}/${spMatch[2]}?autoplay=1`;

  // Already an embed URL
  if (canEmbedDirectly(url)) return url;

  // Fallback: try the original URL via proxy
  return url;
};

/** Check if a URL is an embeddable media type (Youtube/Spotify). */
export const isEmbeddableMedia = (url: string): boolean => {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    return (
      host === 'youtube.com' ||
      host === 'youtu.be' ||
      host === 'open.spotify.com' ||
      host === 'spotify.com'
    );
  } catch {
    return false;
  }
};
