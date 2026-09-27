// ─── Kollektiv Video Editor — media import ───────────────────────────────────
// probe → thumbnail → (audio) waveform → addMedia. One failing file does not
// stop the rest; failures are returned for the caller to report.

import { dispatch } from '../core/store';
import type { MediaEngine, MediaItem } from '../core/types';

let decodeCtx: OfflineAudioContext | null = null;

/** Shared decode context for waveforms; null where WebAudio is unavailable (jsdom, old browsers). */
function getDecodeContext(): OfflineAudioContext | null {
  if (typeof OfflineAudioContext === 'undefined') return null;
  decodeCtx ??= new OfflineAudioContext(1, 1, 44100);
  return decodeCtx;
}

export async function importMediaFiles(
  media: MediaEngine,
  files: Array<{ blob: Blob; name: string }>,
): Promise<{ imported: MediaItem[]; failed: Array<{ name: string; error: string }> }> {
  const imported: MediaItem[] = [];
  const failed: Array<{ name: string; error: string }> = [];
  for (const { blob, name } of files) {
    try {
      const probe = await media.probe(blob, name);
      const id = crypto.randomUUID();
      const thumbnail = await media.thumbnail(blob, probe.kind).catch(() => undefined);
      let waveform: Float32Array | undefined;
      const ctx = probe.hasAudio ? getDecodeContext() : null;
      if (ctx) {
        const buffer = await media.getAudioBuffer(id, blob, ctx).catch(() => null);
        if (buffer) waveform = media.waveform(buffer);
      }
      const item: MediaItem = { id, name, file: blob, ...probe, thumbnail, waveform };
      dispatch({ type: 'addMedia', media: item });
      imported.push(item);
    } catch (err) {
      failed.push({ name, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { imported, failed };
}
