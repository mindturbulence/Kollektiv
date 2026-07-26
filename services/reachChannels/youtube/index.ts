import type { TranscriptBackend, TranscriptSegment } from './types';
import { watchPageBackend } from './backends/watchPage';
import { innertubeBackend } from './backends/innertube';

const backends: TranscriptBackend[] = [watchPageBackend, innertubeBackend];

export interface TranscriptResult {
  segments: TranscriptSegment[];
  backendUsed: string;
}

/** Tries each backend in order, falling back on throw. Never throws past both failing — the caller decides how to surface that. */
export async function getTranscript(videoId: string, lang?: string): Promise<TranscriptResult> {
  const failures: string[] = [];
  for (const backend of backends) {
    try {
      const segments = await backend.fetch(videoId, lang);
      if (segments.length > 0) return { segments, backendUsed: backend.name };
      failures.push(`${backend.name}: no segments returned`);
    } catch (e: any) {
      failures.push(`${backend.name}: ${e?.message || e}`);
    }
  }
  throw new Error(`All transcript backends failed — ${failures.join('; ')}`);
}

export { watchPageBackend, innertubeBackend };
