import type { RGBColor } from './paletteExtract';

const PASS_THROUGH =['image/png', 'image/jpeg', 'image/webp'];

/** Target MIME for a stored reference image: PNG/JPEG/WebP kept, any other image becomes PNG, non-images null. */
export const refTargetType = (mime: string): string | null => {
  const m = mime.toLowerCase();
  if (PASS_THROUGH.includes(m)) return m;
  return m.startsWith('image/') ? 'image/png' : null;
};

/** Scale (w,h) so the longest edge is at most maxEdge. Never upscales, keeps aspect ratio. */
export const fitWithin = (w: number, h: number, maxEdge: number): { width: number; height: number } => {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
};

/**
 * Geometry for the top-of-page crop: scale to at most maxWidth wide (never up), then keep at most
 * maxHeight output rows. `sourceHeight` is the matching source rows; `whole` = nothing was cut off.
 */
export const topCropRect = (w: number, h: number, maxWidth: number, maxHeight: number) => {
  const k = Math.min(1, maxWidth / w);
  const width = Math.max(1, Math.round(w * k));
  const fullHeight = Math.max(1, Math.round(h * k));
  const height = Math.min(fullHeight, maxHeight);
  return { width, height, sourceHeight: Math.min(h, Math.round(height / k)), whole: height === fullHeight };
};

const canvas2d = (width: number, height: number, type: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas context.');
  if (type === 'image/jpeg') { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, width, height); }
  return { canvas, ctx };
};

const draw = async (blob: Blob, maxEdge: number, type: string): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }> => {
  const bmp = await createImageBitmap(blob);
  try {
    const { width, height } = fitWithin(bmp.width, bmp.height, maxEdge);
    const out = canvas2d(width, height, type);
    out.ctx.drawImage(bmp, 0, 0, width, height);
    return out;
  } finally {
    bmp.close();
  }
};

/** Top of the page at (up to) full resolution as a JPEG data URL; see topCropRect. */
export const cropTopToJpeg = async (
  blob: Blob, maxWidth = 1440, maxHeight = 1600, quality = 0.85,
): Promise<{ dataUrl: string; width: number; whole: boolean }> => {
  const bmp = await createImageBitmap(blob);
  try {
    const r = topCropRect(bmp.width, bmp.height, maxWidth, maxHeight);
    const { canvas, ctx } = canvas2d(r.width, r.height, 'image/jpeg');
    ctx.drawImage(bmp, 0, 0, bmp.width, r.sourceHeight, 0, 0, r.width, r.height);
    return { dataUrl: canvas.toDataURL('image/jpeg', quality), width: r.width, whole: r.whole };
  } finally {
    bmp.close();
  }
};

/** Opaque RGB pixels of the image drawn at most maxEdge px (for palette extraction). */
export const readPixels = async (blob: Blob, maxEdge = 200): Promise<RGBColor[]> => {
  const { canvas, ctx } = await draw(blob, maxEdge, 'image/png');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const out: RGBColor[] = [];
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] >= 128) out.push([data[i], data[i + 1], data[i + 2]]);
  return out;
};

/** Downscale to maxEdge (never upscale) and return a JPEG data URL. */
export const downscaleToJpeg = async (blob: Blob, maxEdge = 1600, quality = 0.85): Promise<string> => {
  const { canvas } = await draw(blob, maxEdge, 'image/jpeg');
  return canvas.toDataURL('image/jpeg', quality);
};

/** Return a blob Claude can ingest: PNG/JPEG/WebP pass through untouched, other decodable images become PNG. */
export const normalizeRef = async (blob: Blob): Promise<Blob> => {
  const target = refTargetType(blob.type);
  if (!target) throw new Error(`Not an image: ${blob.type || 'unknown type'}`);
  if (target === blob.type.toLowerCase()) return blob;
  const { canvas } = await draw(blob, Infinity, target);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('PNG conversion failed.'))), target));
};
