import type { CaptionTrack, TranscriptSegment } from './types';

/** Picks the manual track matching `lang` if present, else auto-generated matching `lang`, else the first track. */
export function selectCaptionTrack(tracks: CaptionTrack[], lang?: string): CaptionTrack | undefined {
  if (tracks.length === 0) return undefined;
  if (lang) {
    const manual = tracks.find((t) => t.languageCode === lang && t.kind !== 'asr');
    if (manual) return manual;
    const auto = tracks.find((t) => t.languageCode === lang);
    if (auto) return auto;
  }
  const manual = tracks.find((t) => t.kind !== 'asr');
  return manual || tracks[0];
}

/** Parses YouTube's json3 caption track format (`?fmt=json3`) into flat segments. */
export function parseJson3Captions(json3: any): TranscriptSegment[] {
  const events = json3?.events || [];
  const segments: TranscriptSegment[] = [];
  for (const ev of events) {
    if (!ev.segs) continue;
    const text = ev.segs.map((s: any) => s.utf8 || '').join('').replace(/\n/g, ' ').trim();
    if (!text) continue;
    segments.push({
      text,
      start: (ev.tStartMs ?? 0) / 1000,
      duration: (ev.dDurationMs ?? 0) / 1000,
    });
  }
  return segments;
}

export async function fetchTrackSegments(track: CaptionTrack, fetchImpl: (url: string) => Promise<Response>): Promise<TranscriptSegment[]> {
  const url = track.baseUrl.includes('fmt=') ? track.baseUrl : `${track.baseUrl}&fmt=json3`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Caption track fetch failed (${res.status})`);
  const json3 = await res.json();
  return parseJson3Captions(json3);
}
