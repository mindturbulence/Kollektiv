// ─── Kollektiv Image Editor — camera RAW / DNG import (Looks plan §4) ────────
// LibRaw (libraw-wasm-nothread: LibRaw 0.22.1, LGPL-2.1/CDDL, unmodified, in its
// own worker, lazy chunk) decodes to 16-bit linear sRGB-primaries RGB. The
// Develop component then runs on that float data in the LookRenderer shader and
// the result becomes an ordinary 8-bit image layer carrying `raw` develop
// settings. Re-develop re-decodes the file bytes on demand (owner decision: the
// 400–700 MB float buffer is never kept); the bytes live in memory for this
// session only (Jev 0.44 on persisting them → Claude's call: no).
// Decode failure → the camera's embedded JPEG opens instead (Jev 0.85).

import type LibRawType from 'libraw-wasm-nothread';
import { COMPONENT_DEFAULTS, makeRecipe, type LookComponent } from '../looks/recipe';
import { LookRenderer } from '../looks/LookRenderer';
import { bitmapToLayer, MAX_DIM, resampleBitmap } from './FileIO';
import type { ImageLayer } from '../types';

export type DevelopSettings = Extract<LookComponent, { kind: 'develop' }>;

export interface DecodedRaw { width: number; height: number; data: Uint16Array }

const RAW_EXT = /\.(dng|cr2|cr3|nef|nrw|arw|srf|sr2|raf|orf|rw2|pef|srw|3fr|iiq|erf|kdc|mrw|x3f)$/i;
const DECODE_TIMEOUT_MS = 60_000;

export function isRawFile(file: File): boolean {
  return RAW_EXT.test(file.name) || /^image\/(x-)?(adobe-dng|dng|canon|nikon|sony|fuji|olympus|panasonic)/i.test(file.type);
}

/** Session cache of RAW file bytes by layer id, for Re-develop. */
const rawBytes = new Map<string, Uint8Array<ArrayBuffer>>();
export const getRawBytes = (layerId: string): Uint8Array<ArrayBuffer> | undefined => rawBytes.get(layerId);
export const setRawBytes = (layerId: string, bytes: Uint8Array<ArrayBuffer>): void => { rawBytes.set(layerId, bytes); };

async function withLibRaw<T>(fn: (raw: LibRawType) => Promise<T>): Promise<T> {
  const { default: LibRaw } = await import('libraw-wasm-nothread');
  const raw = new LibRaw();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(raw),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('RAW decode timed out')), DECODE_TIMEOUT_MS); }),
    ]);
  } finally {
    clearTimeout(timer);
    raw.dispose(); // also stops a timed-out decode
  }
}

/** Demosaic to 16-bit linear RGB: camera white balance, sRGB primaries, no
 *  auto-brighten, no tone curve — exposure and tone are the Develop component's job. */
export function decodeRaw(bytes: Uint8Array): Promise<DecodedRaw> {
  return withLibRaw(async (raw) => {
    // open() transfers its buffer to the worker, so hand it a copy.
    await raw.open(bytes.slice(), { outputBps: 16, outputColor: 1, useCameraWb: true, noAutoBright: true, gamm: [1, 1], userQual: 3 });
    const img = await raw.imageData();
    if (!img || !(img.data instanceof Uint16Array) || img.colors !== 3) throw new Error('decoder returned no 16-bit RGB image');
    return { width: img.width, height: img.height, data: img.data };
  });
}

/** Offsets of plausible JPEG starts (FF D8 FF + a marker byte). */
export function jpegStarts(bytes: Uint8Array, limit = 8): number[] {
  const out: number[] = [];
  for (let i = 0; i + 3 < bytes.length && out.length < limit; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff && bytes[i + 3] >= 0xc0) out.push(i);
  }
  return out;
}

/** The largest embedded JPEG. LibRaw's thumbnail first; if LibRaw can't open the
 *  file, decode each JPEG start in the bytes (the browser stops at its EOI). */
export async function embeddedPreview(bytes: Uint8Array<ArrayBuffer>): Promise<ImageBitmap | null> {
  try {
    const thumb = await withLibRaw(async (raw) => { await raw.open(bytes.slice(), {}); return raw.thumbnailData(); });
    if (thumb?.format === 'jpeg') return await createImageBitmap(new Blob([new Uint8Array(thumb.data)], { type: 'image/jpeg' }));
  } catch { /* fall through to the byte scan */ }
  let best: ImageBitmap | null = null;
  for (const start of jpegStarts(bytes)) {
    const bmp = await createImageBitmap(new Blob([bytes.subarray(start)], { type: 'image/jpeg' })).catch(() => null);
    if (!bmp) continue;
    if (!best || bmp.width * bmp.height > best.width * best.height) { best?.close(); best = bmp; } else bmp.close();
  }
  return best;
}

/** Auto exposure (Claude's call over Jev 0.30): the brightest ~1% of pixels
 *  just reach white, like LibRaw's auto-brighten, from a sparse luma sample. */
export function autoExposure(raw: DecodedRaw): number {
  const hist = new Uint32Array(1024);
  const n = raw.width * raw.height;
  const step = Math.max(1, Math.floor(n / 200_000));
  let count = 0;
  for (let p = 0; p < n; p += step, count++) {
    const j = p * 3;
    const y = 0.2126 * raw.data[j] + 0.7152 * raw.data[j + 1] + 0.0722 * raw.data[j + 2];
    hist[Math.min(1023, y >> 6)]++;
  }
  let acc = 0, bin = 1023;
  for (; bin > 0; bin--) { acc += hist[bin]; if (acc >= count * 0.01) break; }
  const p99 = (bin + 1) / 1024;
  return Math.max(-3, Math.min(3, Math.round(Math.log2(1 / p99) * 20) / 20));
}

/** Output size: the RAW's size, fitted inside MAX_DIM (45 MP bodies exceed it). */
export function developSize(w: number, h: number): { width: number; height: number } {
  const k = Math.min(1, MAX_DIM / Math.max(w, h));
  return { width: Math.round(w * k), height: Math.round(h * k) };
}

/** Holds the decoded RAW on the GPU while the user develops; the CPU copy is dropped. */
export class RawDevelopSession {
  private readonly renderer = new LookRenderer();
  readonly width: number;
  readonly height: number;
  constructor(raw: DecodedRaw) {
    this.renderer.loadLinearSource(raw.data, raw.width, raw.height);
    ({ width: this.width, height: this.height } = developSize(raw.width, raw.height));
  }
  async render(develop: DevelopSettings): Promise<ImageBitmap> {
    const out = this.renderer.render(null, this.width, this.height, makeRecipe('Develop', [{ ...develop, enabled: true }]), 1,
      [1, 0, 0, 1, 0, 0], this.width, this.height);
    return createImageBitmap(out);
  }
  dispose(): void { this.renderer.dispose(); }
}

export interface RawImportResult { layer: ImageLayer; previewOnly: boolean }

/** Decodes and develops a RAW file into an image layer; falls back to its
 *  embedded JPEG (`previewOnly`) when LibRaw or the GPU can't. */
export async function importRaw(file: File): Promise<RawImportResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name.replace(/\.[^.]+$/, '') || 'RAW';
  try {
    const decoded = await decodeRaw(bytes);
    const develop: DevelopSettings = { ...COMPONENT_DEFAULTS.develop, exposure: autoExposure(decoded) };
    const session = new RawDevelopSession(decoded);
    try {
      const layer = bitmapToLayer(await session.render(develop), name);
      layer.raw = { develop, fileName: file.name };
      setRawBytes(layer.id, bytes);
      return { layer, previewOnly: false };
    } finally {
      session.dispose();
    }
  } catch (err) {
    const preview = await embeddedPreview(bytes);
    if (!preview) throw new Error(`Couldn't decode ${file.name} (${err instanceof Error ? err.message : String(err)}) and it has no embedded preview.`);
    const size = developSize(preview.width, preview.height);
    const fitted = size.width === preview.width ? preview : await resampleBitmap(preview, size.width, size.height);
    if (fitted !== preview) preview.close();
    return { layer: bitmapToLayer(fitted, name), previewOnly: true };
  }
}
