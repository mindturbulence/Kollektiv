// OWNED BY: export agent. Stub — replace with WebCodecs (mediabunny) export + ffmpeg fallback.
import type { Compositor, Exporter, MediaEngine } from '../types';

export function createExporter(deps: { media: MediaEngine; compositor: Compositor }): Exporter {
  void deps;
  throw new Error('video-editor: exporter not implemented');
}
