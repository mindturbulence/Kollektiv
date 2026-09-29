/**
 * Assets Manager — recomputable facts per file (plan Tasks 5, 6, 20).
 *
 * Size, mtime, dimensions, an EXIF summary, a 256 px thumbnail and a dHash are
 * all derivable from the file, so they live in an IndexedDB cache keyed by the
 * asset id and stamped with `size:mtime` (a changed file re-extracts, an
 * unchanged one never decodes again). Only user-authored data goes to the vault
 * manifest (assetLibrary.ts). One decode per new file yields all three:
 * dimensions, thumbnail, dHash.
 */
import { openDB, type IDBPDatabase } from 'idb';
import piexifModule from '../../utils/piexif';
import { largestEmbeddedJpeg } from '../../utils/jpegScan';

const piexif = piexifModule as any;

export interface ExifSummary {
  make?: string;
  model?: string;
  lens?: string;
  /** "YYYY:MM:DD HH:MM:SS" as the camera wrote it. */
  taken?: string;
  iso?: number;
  fNumber?: number;
  exposure?: string;
  focalLength?: number;
  artist?: string;
  copyright?: string;
  description?: string;
}

export interface AssetFacts {
  size: number;
  mtime: number;
  width?: number;
  height?: number;
  exif?: ExifSummary;
  /** 64-bit difference hash as 16 hex chars (duplicates / find similar). */
  dhash?: string;
  /** ≤256 px WebP thumbnail. */
  thumb?: Blob;
  /** True when the thumbnail came from a RAW's embedded JPEG preview. */
  fromPreview?: boolean;
}

/** Camera RAW extensions the Assets Manager lists (thumbnails from embedded JPEGs). */
export const RAW_EXTS = ['dng', 'cr2', 'cr3', 'nef', 'nrw', 'arw', 'raf', 'orf', 'rw2', 'pef', 'srw'] as const;
const RAW_SET = new Set<string>(RAW_EXTS);

export const factsStamp = (size: number, mtime: number): string => `${size}:${mtime}`;

interface CachedFacts { id: string; stamp: string; facts: AssetFacts }

let _db: Promise<IDBPDatabase> | null = null;
const db = () => (_db ??= openDB('kollektiv-assets-cache', 1, {
  upgrade(d) { d.createObjectStore('facts', { keyPath: 'id' }); },
}));

export async function getCachedFacts(id: string, stamp: string): Promise<AssetFacts | null> {
  try {
    const row = (await (await db()).get('facts', id)) as CachedFacts | undefined;
    return row && row.stamp === stamp ? row.facts : null;
  } catch { return null; }
}

export async function putCachedFacts(id: string, facts: AssetFacts): Promise<void> {
  try { await (await db()).put('facts', { id, stamp: factsStamp(facts.size, facts.mtime), facts } satisfies CachedFacts); }
  catch { /* cache is best-effort */ }
}

/** Moves a cache row to a new id (rename/move keep their facts). */
export async function relocateCachedFacts(oldId: string, newId: string): Promise<void> {
  try {
    const d = await db();
    const row = (await d.get('facts', oldId)) as CachedFacts | undefined;
    if (!row) return;
    await d.put('facts', { ...row, id: newId });
    await d.delete('facts', oldId);
  } catch { /* best-effort */ }
}

// ── Pure helpers (unit-tested) ──────────────────────────────────────────

/** dHash of a 9×8 grayscale grid: bit = left pixel brighter than its right neighbour. */
export function dhashFromGray(gray: ArrayLike<number>): string {
  let hex = '';
  for (let row = 0; row < 8; row++) {
    let byte = 0;
    for (let col = 0; col < 8; col++) byte = (byte << 1) | (gray[row * 9 + col] > gray[row * 9 + col + 1] ? 1 : 0);
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

export function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < a.length; i += 2) {
    let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

const asText = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.replace(/\0+$/, '').trim();
  return t || undefined;
};
const ratio = (v: unknown): number | undefined =>
  Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number' && v[1] !== 0 ? v[0] / v[1] : undefined;

/** Summarises a piexif `load()` result (0th / Exif IFDs). */
export function summariseExif(ex: any): ExifSummary | undefined {
  if (!ex) return undefined;
  const z = ex['0th'] ?? {}, e = ex['Exif'] ?? {};
  const I = piexif.ImageIFD, X = piexif.ExifIFD;
  const exposure = ratio(e[X.ExposureTime]);
  const out: ExifSummary = {
    make: asText(z[I.Make]), model: asText(z[I.Model]), lens: asText(e[X.LensModel]),
    taken: asText(e[X.DateTimeOriginal]) ?? asText(z[I.DateTime]),
    iso: typeof e[X.ISOSpeedRatings] === 'number' ? e[X.ISOSpeedRatings] : undefined,
    fNumber: ratio(e[X.FNumber]), focalLength: ratio(e[X.FocalLength]),
    exposure: exposure === undefined ? undefined : exposure >= 1 ? `${exposure}s` : `1/${Math.round(1 / exposure)}s`,
    artist: asText(z[I.Artist]), copyright: asText(z[I.Copyright]), description: asText(z[I.ImageDescription]),
  };
  const kept = Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
  return Object.keys(kept).length ? kept as ExifSummary : undefined;
}

// ── Extraction ──────────────────────────────────────────────────────────

async function readExif(file: File): Promise<ExifSummary | undefined> {
  try {
    const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
    let bin = '';
    for (let i = 0; i < head.length; i += 0x8000) bin += String.fromCharCode(...head.subarray(i, i + 0x8000));
    return summariseExif(piexif.load(bin));
  } catch { return undefined; }
}

async function thumbAndHash(bmp: ImageBitmap): Promise<{ thumb?: Blob; dhash?: string }> {
  const k = Math.min(1, 256 / Math.max(bmp.width, bmp.height));
  const tw = Math.max(1, Math.round(bmp.width * k)), th = Math.max(1, Math.round(bmp.height * k));
  const tc = new OffscreenCanvas(tw, th);
  tc.getContext('2d')!.drawImage(bmp, 0, 0, tw, th);
  const thumb = await tc.convertToBlob({ type: 'image/webp', quality: 0.8 }).catch(() => undefined);
  const hc = new OffscreenCanvas(9, 8);
  const hctx = hc.getContext('2d', { willReadFrequently: true })!;
  hctx.drawImage(tc, 0, 0, 9, 8);
  const px = hctx.getImageData(0, 0, 9, 8).data;
  const gray = new Array<number>(72);
  for (let i = 0; i < 72; i++) gray[i] = px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114;
  return { thumb, dhash: dhashFromGray(gray) };
}

/** Reads a file once and derives every fact. Undecodable formats (TIFF/HEIC
 *  in most browsers) still get size, mtime and EXIF — the card shows a type badge. */
export async function extractFacts(file: File, ext: string): Promise<AssetFacts> {
  const facts: AssetFacts = { size: file.size, mtime: file.lastModified };
  let bmp: ImageBitmap | null = null;
  if (RAW_SET.has(ext)) {
    bmp = await largestEmbeddedJpeg(new Uint8Array(await file.arrayBuffer()));
    if (bmp) facts.fromPreview = true;
  } else {
    bmp = await createImageBitmap(file).catch(() => null);
  }
  if (ext === 'jpg' || ext === 'jpeg' || RAW_SET.has(ext)) facts.exif = await readExif(file);
  if (bmp) {
    facts.width = bmp.width;
    facts.height = bmp.height;
    Object.assign(facts, await thumbAndHash(bmp));
    bmp.close();
  }
  return facts;
}

/**
 * Facts for every file, cached ones first: the unchanged ones resolve from
 * IndexedDB without decoding, changed/new ones are extracted and cached.
 * `onFacts` streams results; `isCancelled` stops between files (folder switch).
 */
export async function indexFiles(
  files: { id: string; ext: string; handle: FileSystemFileHandle }[],
  onFacts: (id: string, facts: AssetFacts) => void,
  isCancelled: () => boolean,
): Promise<void> {
  const pending: { id: string; ext: string; file: File }[] = [];
  for (const f of files) {
    if (isCancelled()) return;
    const file = await f.handle.getFile().catch(() => null);
    if (!file) continue;
    const cached = await getCachedFacts(f.id, factsStamp(file.size, file.lastModified));
    if (cached) onFacts(f.id, cached);
    else pending.push({ id: f.id, ext: f.ext, file });
  }
  for (const p of pending) {
    if (isCancelled()) return;
    // A file the browser can't decode (or no canvas, as in tests) still gets size + mtime.
    const facts = await extractFacts(p.file, p.ext).catch((): AssetFacts => ({ size: p.file.size, mtime: p.file.lastModified }));
    await putCachedFacts(p.id, facts);
    if (isCancelled()) return;
    onFacts(p.id, facts);
    await new Promise(r => setTimeout(r, 0)); // keep the UI responsive
  }
}
