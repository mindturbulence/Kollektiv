// Offsets of plausible embedded JPEG starts (FF D8 FF + a marker byte) — camera
// RAWs carry their previews this way. Shared by the image editor's RAW import
// and the Assets Manager's RAW thumbnails.
export function jpegStarts(bytes: Uint8Array, limit = 8): number[] {
  const out: number[] = [];
  for (let i = 0; i + 3 < bytes.length && out.length < limit; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff && bytes[i + 3] >= 0xc0) out.push(i);
  }
  return out;
}

/** The largest embedded JPEG that decodes (the browser stops at its EOI). */
export async function largestEmbeddedJpeg(bytes: Uint8Array<ArrayBuffer>): Promise<ImageBitmap | null> {
  let best: ImageBitmap | null = null;
  for (const start of jpegStarts(bytes)) {
    const bmp = await createImageBitmap(new Blob([bytes.subarray(start)], { type: 'image/jpeg' })).catch(() => null);
    if (!bmp) continue;
    if (!best || bmp.width * bmp.height > best.width * best.height) { best?.close(); best = bmp; } else bmp.close();
  }
  return best;
}
