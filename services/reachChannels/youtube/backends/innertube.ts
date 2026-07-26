import type { CaptionTrack, TranscriptBackend, TranscriptSegment } from '../types';
import { selectCaptionTrack, fetchTrackSegments } from '../captionUtils';
import { reachFetch } from '../../../reachHttp';

const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/player';
// Well-known public "WEB" client API key embedded in YouTube's own web player JS —
// not a secret, the same key widely used by yt-dlp and similar open-source tools.
const INNERTUBE_PUBLIC_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

/**
 * Extracts caption tracks from an InnerTube `player` endpoint JSON response.
 * Exported separately for fixture-based unit testing without a network call.
 * NOTE: this endpoint's request/response shape is not versioned or documented —
 * it has drifted before and should be re-verified against a live response
 * whenever it stops working, not assumed stable.
 */
export function extractCaptionTracksFromPlayerResponse(playerResponse: any): CaptionTrack[] {
  const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(tracks)) return [];
  return tracks.map((t: any) => ({ baseUrl: t.baseUrl, languageCode: t.languageCode, kind: t.kind }));
}

export const innertubeBackend: TranscriptBackend = {
  name: 'innertube',
  async fetch(videoId: string, lang?: string): Promise<TranscriptSegment[]> {
    const res = await reachFetch(`${INNERTUBE_URL}?key=${INNERTUBE_PUBLIC_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00' } },
        videoId,
      }),
    });
    if (!res.ok) throw new Error(`InnerTube request failed (${res.status})`);
    const playerResponse = await res.json();
    const tracks = extractCaptionTracksFromPlayerResponse(playerResponse);
    const track = selectCaptionTrack(tracks, lang);
    if (!track) throw new Error('No caption tracks found via InnerTube (captions may be disabled).');
    return fetchTrackSegments(track, (url) => reachFetch(url));
  },
};
