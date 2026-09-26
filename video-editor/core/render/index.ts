// OWNED BY: render agent. Stub — replace with the Canvas2D renderer.
import type { Renderer } from '../types';

export function createRenderer(canvas: HTMLCanvasElement | OffscreenCanvas): Renderer {
  void canvas;
  throw new Error('video-editor: renderer not implemented');
}
