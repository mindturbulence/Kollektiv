// ─── Kollektiv Image Editor — File I/O ─────────────────────────────────────
// Image import/export and blank document creation. No React imports.
// Reads the current foreground color from EditorStore only for the
// 'blank' + background:'foreground' case — everything else is pure.

import type { EditorDocument, EditorOpenPayload, ImageLayer } from '../types';
import { LayerPainter } from '../renderer/LayerPainter';
import { getSnapshot } from '../store';

/** Maximum dimension for any bitmap the editor will hold (review H13). 8192 is
 *  the universal safe floor; every brush stroke allocates a full-layer canvas
 *  and the WebGL2 blend path uploads layer-sized textures, so uncapped imports
 *  (a 12k panorama) made the tools throw or the GPU context fail later, far
 *  from the import that caused it. */
export const MAX_DIM = 8192;

/** HEIC MIME types (iPhone photos) — Chrome/Firefox can't decode them and the
 *  generic "Unsupported format" gave the user no path forward. */
const HEIC_TYPES = /^image\/hei[cf]$/i;

function heicHint(fileType: string): string {
  return HEIC_TYPES.test(fileType)
    ? ' — HEIC isn\'t supported by this browser. Convert it via the Converter tab first.'
    : '';
}

/** True when either dimension exceeds MAX_DIM. */
export function exceedsMaxDim(width: number, height: number): boolean {
  return width > MAX_DIM || height > MAX_DIM;
}

/** Builds a flat ImageLayer wrapping a decoded/generated ImageBitmap. */
function bitmapToLayer(bitmap: ImageBitmap, name: string): ImageLayer {
  return {
    id: crypto.randomUUID(),
    name,
    type: 'image',
    bitmap,
    intrinsicWidth: bitmap.width,
    intrinsicHeight: bitmap.height,
    transform: {
      origin: { x: 0, y: 0 },
      size: { width: bitmap.width, height: bitmap.height },
      rotation: 0,
      flipH: false,
      flipV: false,
    },
    opacity: 100,
    blendMode: 'normal',
    visible: true,
  };
}

/** Decodes a File (PNG/JPEG/WebP/HEIC/…) off the main thread into an ImageLayer.
 *  Enforces MAX_DIM (review H13 — oversize imports previously failed later,
 *  silently, inside the tools). */
export async function importImage(file: File): Promise<ImageLayer> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`Unsupported format: ${file.type}${heicHint(file.type)}`);
  }
  if (exceedsMaxDim(bitmap.width, bitmap.height)) {
    bitmap.close();
    throw new Error(
      `Image is ${bitmap.width}×${bitmap.height}px — the editor supports up to ${MAX_DIM}px per side. Scale it down first (Converter tab).`,
    );
  }
  return bitmapToLayer(bitmap, file.name.replace(/\.[^.]+$/, '') || 'Imported Image');
}

async function createBlankBitmap(
  width: number,
  height: number,
  background: 'white' | 'transparent' | 'foreground',
  foregroundColor?: string,
): Promise<ImageBitmap> {
  const oc = new OffscreenCanvas(width, height);
  const ctx = oc.getContext('2d');
  if (!ctx) throw new Error('Failed to acquire 2D context for blank document');
  if (background === 'white') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  } else if (background === 'foreground') {
    ctx.fillStyle = foregroundColor ?? '#000000';
    ctx.fillRect(0, 0, width, height);
  }
  // 'transparent' — leave the canvas empty (alpha 0), nothing to draw.
  return createImageBitmap(oc);
}

/** Creates a new single-layer document filled with the given background.
 *  Enforces MAX_DIM (review H13 — the NewDocumentModal's max=8192 was an HTML
 *  attribute only; typing 30000 made OffscreenCanvas throw silently). */
export async function createBlankDocument(
  width: number,
  height: number,
  background: 'white' | 'transparent' | 'foreground',
  foregroundColor?: string,
): Promise<EditorDocument> {
  const w = Math.round(width);
  const h = Math.round(height);
  if (w < 1 || h < 1) throw new Error('Document dimensions must be at least 1px.');
  if (exceedsMaxDim(w, h)) {
    throw new Error(`Document is ${w}×${h}px — the editor supports up to ${MAX_DIM}px per side.`);
  }
  const bitmap = await createBlankBitmap(w, h, background, foregroundColor);
  const layer = bitmapToLayer(bitmap, 'Background');
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: 'Untitled',
    width,
    height,
    resolution: 72,
    layers: [layer],
    guides: [],
    activeLayerId: layer.id,
    createdAt: now,
    updatedAt: now,
  };
}

/** Resolves a blob/blank payload into a complete EditorDocument. Gallery payloads
 *  are resolved to a blob by ui/GalleryBridge first — core never touches the vault. */
export async function importFromPayload(
  payload: Exclude<EditorOpenPayload, { kind: 'gallery' }>,
): Promise<EditorDocument> {
  if (payload.kind === 'blank') {
    const foregroundColor =
      payload.background === 'foreground' ? getSnapshot().colors.foreground : undefined;
    return createBlankDocument(payload.width, payload.height, payload.background, foregroundColor);
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(payload.blob);
  } catch {
    throw new Error(`Unsupported image format${payload.blob.type ? `: ${payload.blob.type}${heicHint(payload.blob.type)}` : ''}`);
  }
  if (exceedsMaxDim(bitmap.width, bitmap.height)) {
    bitmap.close();
    throw new Error(
      `Image is ${bitmap.width}×${bitmap.height}px — the editor supports up to ${MAX_DIM}px per side.`,
    );
  }

  const layer = bitmapToLayer(bitmap, 'Background');
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: payload.title ?? 'Untitled',
    width: bitmap.width,
    height: bitmap.height,
    resolution: 72,
    layers: [layer],
    guides: [],
    activeLayerId: layer.id,
    createdAt: now,
    updatedAt: now,
  };
}

/** Flattens the document exactly as the viewport shows it (groups, masks,
 *  text/shape layers, native + WebGL2 blend modes) into a single Blob. */
export async function exportToBlob(
  document: EditorDocument,
  format: 'png' | 'jpeg',
  quality?: number,
): Promise<Blob> {
  const oc = new OffscreenCanvas(document.width, document.height);
  const ctx = oc.getContext('2d');
  if (!ctx) throw new Error('Failed to acquire 2D context for export');

  if (format === 'jpeg') {
    // JPEG has no alpha; browsers flatten to black by default, the UI promises white.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, document.width, document.height);
  }

  // Same cast CanvasRenderer uses for its offscreen scratch: the two context
  // types share the drawing subset LayerPainter uses but aren't related in lib.dom.
  const painterCtx = ctx as unknown as CanvasRenderingContext2D;
  const painter = new LayerPainter(false);
  try {
    // document.layers: index 0 = topmost — composite bottom-to-top.
    for (let i = document.layers.length - 1; i >= 0; i--) {
      painter.drawLayer(painterCtx, document.layers[i]);
    }
  } finally {
    painter.dispose();
  }

  return oc.convertToBlob({
    type: format === 'jpeg' ? 'image/jpeg' : 'image/png',
    quality: quality !== undefined ? quality / 100 : 0.92,
  });
}

/** Renders the active image layer's mask as a black/white PNG (inpaint prep:
 *  white = masked/inpainted area). Uses the mask bitmap directly — white pixels
 *  are "protected, kept" in most inpainters, so the export maps mask-opaque →
 *  white. Throws when the layer has no mask. */
export async function exportMaskToBlob(layer: ImageLayer): Promise<Blob> {
  if (!layer.mask) throw new Error(`Layer "${layer.name}" has no mask to export.`);
  const oc = new OffscreenCanvas(layer.mask.bitmap.width, layer.mask.bitmap.height);
  const ctx = oc.getContext('2d');
  if (!ctx) throw new Error('Failed to acquire 2D context for mask export');
  ctx.drawImage(layer.mask.bitmap, 0, 0);
  return oc.convertToBlob({ type: 'image/png' });
}

/** Downscales/upscales a bitmap to the target size (Image Size resample).
 *  Returns a NEW bitmap; the caller is responsible for closing the old one
 *  (the source may still be referenced by history undo commands). */
export async function resampleBitmap(
  source: ImageBitmap,
  targetWidth: number,
  targetHeight: number,
): Promise<ImageBitmap> {
  if (targetWidth < 1 || targetHeight < 1) throw new Error('Target size must be at least 1px.');
  if (exceedsMaxDim(targetWidth, targetHeight)) {
    throw new Error(`Target size ${targetWidth}×${targetHeight}px exceeds the ${MAX_DIM}px limit.`);
  }
  const oc = new OffscreenCanvas(targetWidth, targetHeight);
  const ctx = oc.getContext('2d');
  if (!ctx) throw new Error('Failed to acquire 2D context for resample');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
  return createImageBitmap(oc);
}

/** Opens the native file picker restricted to images. Resolves null if the user cancels. */
export function openFilePicker(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    let settled = false;

    const settle = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };

    input.addEventListener('change', () => settle(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => settle(null));

    document.body.appendChild(input);
    input.click();
  });
}
