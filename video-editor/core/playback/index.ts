// OWNED BY: playback agent. Stub — replace with compositor + clock + WebAudio mixer.
import type { Compositor, MediaEngine, PlaybackController, Renderer } from '../types';

export function createCompositor(media: MediaEngine): Compositor {
  void media;
  throw new Error('video-editor: compositor not implemented');
}

export function createPlaybackController(opts: { media: MediaEngine; renderer: Renderer; compositor: Compositor }): PlaybackController {
  void opts;
  throw new Error('video-editor: playback not implemented');
}
