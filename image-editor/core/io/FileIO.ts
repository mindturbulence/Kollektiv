// ─── Kollektiv Image Editor — File I/O ─────────────────────────────────────
// Image import/export and blank document creation. No React imports.
// Reads the current foreground color from EditorStore only for the
// 'blank' + background:'foreground' case — everything else is pure.

import type { BlendMode, EditorDocument, EditorOpenPayload, ImageLayer } from '../types';
import { getSnapshot } from '../store';

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

/** Decodes a File (PNG/JPEG/WebP/HEIC/…) off the main thread into an ImageLayer. */
export async function importImage(file: File): Promise<ImageLayer> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`Unsupported format: ${file.type}`);
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

/** Creates a new single-layer document filled with the given background. */
export async function createBlankDocument(
  width: number,
  height: number,
  background: 'white' | 'transparent' | 'foreground',
  foregroundColor?: string,
): Promise<EditorDocument> {
  const bitmap = await createBlankBitmap(width, height, background, foregroundColor);
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

/** Resolves any EditorOpenPayload (gallery / blob / blank) into a complete EditorDocument. */
export async function importFromPayload(payload: EditorOpenPayload): Promise<EditorDocument> {
  if (payload.kind === 'blank') {
    const foregroundColor =
      payload.background === 'foreground' ? getSnapshot().colors.foreground : undefined;
    return createBlankDocument(payload.width, payload.height, payload.background, foregroundColor);
  }

  let bitmap: ImageBitmap;
  let title: string;

  if (payload.kind === 'gallery') {
    const response = await fetch(payload.url);
    if (!response.ok) throw new Error(`Failed to fetch gallery image: ${response.status}`);
    const blob = await response.blob();
    bitmap = await createImageBitmap(blob);
    title = 'Untitled';
  } else {
    bitmap = await createImageBitmap(payload.blob);
    title = payload.title ?? 'Untitled';
  }

  const layer = bitmapToLayer(bitmap, 'Background');
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title,
    width: bitmap.width,
    height: bitmap.height,
    resolution: 72,
    layers: [layer],
    guides: [],
    activeLayerId: layer.id,
    createdAt: now,
    updatedAt: now,
    sourceGalleryItemId: payload.kind === 'gallery' ? payload.galleryItemId : undefined,
  };
}

/** Canvas2D has no 'normal' composite op — it's 'source-over'. V2-only modes
 *  (dissolve, linear-*, vivid-light, etc.) have no native equivalent yet and
 *  fall back to 'source-over' until the WebGL2 blend path lands. */
function toCompositeOperation(blendMode: BlendMode): GlobalCompositeOperation {
  if (blendMode === 'normal') return 'source-over';
  const native: readonly string[] = [
    'multiply', 'screen', 'overlay', 'darken', 'lighten',
    'color-dodge', 'color-burn', 'hard-light', 'soft-light',
    'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
  ];
  return native.includes(blendMode) ? (blendMode as GlobalCompositeOperation) : 'source-over';
}

/** Flattens all visible layers into a single Blob for export/save. */
export async function exportToBlob(
  document: EditorDocument,
  format: 'png' | 'jpeg',
  quality?: number,
): Promise<Blob> {
  const oc = new OffscreenCanvas(document.width, document.height);
  const ctx = oc.getContext('2d');
  if (!ctx) throw new Error('Failed to acquire 2D context for export');

  // document.layers: index 0 = topmost — composite bottom-to-top.
  for (const layer of [...document.layers].reverse()) {
    if (!layer.visible || layer.type !== 'image') continue;
    const { origin, size, rotation, flipH, flipV } = layer.transform;
    ctx.save();
    ctx.globalAlpha = layer.opacity / 100;
    ctx.globalCompositeOperation = toCompositeOperation(layer.blendMode);
    const cx = origin.x + size.width / 2;
    const cy = origin.y + size.height / 2;
    ctx.translate(cx, cy);
    if (rotation) ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(layer.bitmap, -size.width / 2, -size.height / 2, size.width, size.height);
    ctx.restore();
  }

  return oc.convertToBlob({
    type: format === 'jpeg' ? 'image/jpeg' : 'image/png',
    quality: quality !== undefined ? quality / 100 : 0.92,
  });
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
