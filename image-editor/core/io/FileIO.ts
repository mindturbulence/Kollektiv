// ─── Kollektiv Image Editor — File I/O ─────────────────────────────────────
// Image import/export and blank document creation. No React imports.
// Reads the current foreground color from EditorStore only for the
// 'blank' + background:'foreground' case — everything else is pure.

import type { EditorDocument, EditorOpenPayload, ImageLayer } from '../types';
import { LayerPainter } from '../renderer/LayerPainter';
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
    throw new Error(`Unsupported image format${payload.blob.type ? `: ${payload.blob.type}` : ''}`);
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
