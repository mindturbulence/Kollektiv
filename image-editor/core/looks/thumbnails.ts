// ─── Kollektiv Image Editor — look gallery thumbnails ────────────────────────
// Renders every catalog look on the user's own image (plan §5): the
// document's non-look layers are drawn straight into a small proxy (a scaled
// context — no full-resolution raster), then each look runs through ONE
// shared LookRenderer, one per tick so the UI stays responsive. A generation
// counter drops a run when the image changes mid-way.
// ponytail: renders the whole catalog each time (~16 × a 160 px proxy, a few
// ms each); add IntersectionObserver priority if the catalog grows to hundreds.

import { LayerPainter } from '../renderer/LayerPainter';
import { LookRenderer } from './LookRenderer';
import { preloadRecipeLuts } from './lutRegistry';
import type { EditorDocument } from '../types';
import type { LookRecipe } from './recipe';

const THUMB = 160; // longest side, px

let _renderer: LookRenderer | null | undefined;
let _generation = 0;

/** Draws the document minus its look layers into a ≤THUMB px canvas. */
export function renderProxy(doc: EditorDocument): OffscreenCanvas | null {
  const scale = Math.min(1, THUMB / Math.max(doc.width, doc.height));
  const w = Math.max(1, Math.round(doc.width * scale));
  const h = Math.max(1, Math.round(doc.height * scale));
  const oc = new OffscreenCanvas(w, h);
  const ctx = oc.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const painter = new LayerPainter(false);
  try {
    painter.drawLayers(ctx as unknown as CanvasRenderingContext2D, doc.layers.filter(l => l.type !== 'look'));
  } finally {
    painter.dispose();
  }
  return oc;
}

/**
 * Renders `recipes` over the proxy, calling `onThumb(i, bitmap)` as each is
 * ready (the caller owns and closes the bitmaps). Returns false when WebGL2 is
 * unavailable. A newer call cancels an older one.
 */
export async function renderThumbnails(
  doc: EditorDocument,
  recipes: LookRecipe[],
  onThumb: (index: number, bitmap: ImageBitmap) => void,
): Promise<boolean> {
  const gen = ++_generation;
  if (_renderer?.lost) _renderer = undefined; // context loss: rebuild
  if (_renderer === undefined) {
    try { _renderer = new LookRenderer(); } catch { _renderer = null; }
  }
  if (!_renderer) return false;
  const proxy = renderProxy(doc);
  if (!proxy) return false;
  const toDoc = doc.width / proxy.width; // proxy px → document px (uniform scale)
  for (let i = 0; i < recipes.length; i++) {
    await preloadRecipeLuts(recipes[i]);
    await new Promise(r => setTimeout(r, 0));
    if (gen !== _generation) return true; // superseded
    const out = _renderer.render(proxy, proxy.width, proxy.height, recipes[i], 1, [toDoc, 0, 0, toDoc, 0, 0], doc.width, doc.height);
    onThumb(i, out.transferToImageBitmap());
  }
  return true;
}
