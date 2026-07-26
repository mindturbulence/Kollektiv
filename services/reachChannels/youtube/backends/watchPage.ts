import type { CaptionTrack, TranscriptBackend, TranscriptSegment } from '../types';
import { selectCaptionTrack, fetchTrackSegments } from '../captionUtils';
import { reachFetch } from '../../../reachHttp';

/**
 * Extracts the `captionTracks` array embedded in a YouTube watch page's
 * `ytInitialPlayerResponse` blob. Exported separately so this parsing logic
 * is unit-testable against a static HTML fixture, no network required.
 */
export function extractCaptionTracks(html: string): CaptionTrack[] {
  const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var |<\/script>)/s);
  if (!match) return [];
  let playerResponse: any;
  try {
    playerResponse = JSON.parse(match[1]);
  } catch {
    return [];
  }
  const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(tracks)) return [];
  return tracks.map((t: any) => ({ baseUrl: t.baseUrl, languageCode: t.languageCode, kind: t.kind }));
}

export const watchPageBackend: TranscriptBackend = {
  name: 'watchPage',
  async fetch(videoId: string, lang?: string): Promise<TranscriptSegment[]> {
    const res = await reachFetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`);
    if (!res.ok) throw new Error(`Watch page fetch failed (${res.status})`);
    const html = await res.text();
    const tracks = extractCaptionTracks(html);
    const track = selectCaptionTrack(tracks, lang);
    if (!track) throw new Error('No caption tracks found on the watch page (captions may be disabled).');
    return fetchTrackSegments(track, (url) => reachFetch(url));
  },
};
