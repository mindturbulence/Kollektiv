/**
 * Assets Manager — metadata write-back (plan Task 22). Writes rating, label,
 * tags, caption and copyright into the image file itself as XMP (what
 * Lightroom/Bridge read): JPEG as an APP1 XMP segment (plus EXIF
 * ImageDescription/Copyright/XPKeywords via piexif), PNG as an iTXt
 * `XML:com.adobe.xmp` chunk. Every other format is index-only and says so —
 * never a silent "success". The caller writes through createWritable (atomic
 * swap on close), re-reads the file and compares with `readXmpFields`.
 */
import piexifModule from '../../utils/piexif';
import type { AssetMeta, ColorLabel } from './assetLibrary';

const piexif = piexifModule as any;

export const WRITABLE_EXTS = ['jpg', 'jpeg', 'png'] as const;
export const canWriteMetadata = (ext: string) => (WRITABLE_EXTS as readonly string[]).includes(ext);

const LABEL_NAMES: Record<ColorLabel, string> = { red: 'Red', yellow: 'Yellow', green: 'Green', blue: 'Blue', purple: 'Purple' };
const XMP_NS_HEADER = 'http://ns.adobe.com/xap/1.0/\0';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const alt = (tag: string, v?: string) => (v ? `<${tag}><rdf:Alt><rdf:li xml:lang="x-default">${esc(v)}</rdf:li></rdf:Alt></${tag}>` : '');

export function buildXmp(m: AssetMeta): string {
  const attrs = [
    m.rating ? ` xmp:Rating="${m.rating}"` : '',
    m.label ? ` xmp:Label="${LABEL_NAMES[m.label]}"` : '',
  ].join('');
  const subject = m.tags?.length ? `<dc:subject><rdf:Bag>${m.tags.map(t => `<rdf:li>${esc(t)}</rdf:li>`).join('')}</rdf:Bag></dc:subject>` : '';
  return '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>'
    + '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    + `<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/"${attrs}>`
    + subject + alt('dc:description', m.caption) + alt('dc:rights', m.copyright)
    + '</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
}

/** Reads the fields buildXmp writes back out of an XMP packet (DOMParser). */
export function parseXmp(xml: string): AssetMeta {
  const doc = new DOMParser().parseFromString(xml.replace(/<\?xpacket[^>]*\?>/g, ''), 'application/xml');
  const desc = doc.getElementsByTagNameNS('http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'Description')[0];
  if (!desc) return {};
  const out: AssetMeta = {};
  const rating = Number(desc.getAttributeNS('http://ns.adobe.com/xap/1.0/', 'Rating'));
  if (rating >= 1 && rating <= 5) out.rating = rating;
  const label = desc.getAttributeNS('http://ns.adobe.com/xap/1.0/', 'Label')?.toLowerCase();
  if (label && label in LABEL_NAMES) out.label = label as ColorLabel;
  const dc = 'http://purl.org/dc/elements/1.1/';
  const lis = (tag: string) => [...(desc.getElementsByTagNameNS(dc, tag)[0]?.getElementsByTagNameNS('http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'li') ?? [])].map(li => li.textContent ?? '');
  const tags = lis('subject');
  if (tags.length) out.tags = tags;
  const caption = lis('description')[0];
  if (caption) out.caption = caption;
  const rights = lis('rights')[0];
  if (rights) out.copyright = rights;
  return out;
}

// ── JPEG ─────────────────────────────────────────────────────────────────

const utf8 = new TextEncoder();
const bin = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return s; };
const unbin = (s: string) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff; return b; };
const ucs2 = (s: string) => { const out: number[] = []; for (const ch of s) { const c = ch.charCodeAt(0); out.push(c & 0xff, c >> 8); } out.push(0, 0); return out; };

/** Splits a JPEG into its header segments (up to SOS) and the rest. */
function jpegSegments(b: Uint8Array): { segs: { marker: number; data: Uint8Array }[]; rest: Uint8Array } {
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error('not a JPEG');
  const segs: { marker: number; data: Uint8Array }[] = [];
  let i = 2;
  while (i + 4 <= b.length && b[i] === 0xff) {
    const marker = b[i + 1];
    if (marker === 0xda) break; // SOS: entropy-coded data follows
    const len = (b[i + 2] << 8) | b[i + 3];
    segs.push({ marker, data: b.subarray(i + 4, i + 2 + len) });
    i += 2 + len;
  }
  return { segs, rest: b.subarray(i) };
}

const isXmpApp1 = (s: { marker: number; data: Uint8Array }) =>
  s.marker === 0xe1 && bin(s.data.subarray(0, XMP_NS_HEADER.length)) === XMP_NS_HEADER;

export function writeJpegMetadata(bytes: Uint8Array, m: AssetMeta): Uint8Array {
  // EXIF first (piexif works on binary strings): caption, copyright, keywords.
  let exif: any;
  try { exif = piexif.load(bin(bytes)); } catch { exif = { '0th': {}, Exif: {}, GPS: {}, Interop: {}, '1st': {}, thumbnail: null }; }
  const z = (exif['0th'] ??= {});
  const I = piexif.ImageIFD;
  const set = (tag: number, v: unknown) => { if (v === undefined) delete z[tag]; else z[tag] = v; };
  set(I.ImageDescription, m.caption);
  set(I.Copyright, m.copyright);
  set(I.XPKeywords, m.tags?.length ? ucs2(m.tags.join(';')) : undefined);
  let withExif: Uint8Array;
  try { withExif = unbin(piexif.insert(piexif.dump(exif), bin(bytes))); }
  catch { withExif = bytes; } // EXIF refused (odd file): XMP below still carries everything

  const { segs, rest } = jpegSegments(withExif);
  const xmp = utf8.encode(XMP_NS_HEADER + buildXmp(m));
  if (xmp.length + 2 > 0xffff) throw new Error('metadata too large for one XMP segment');
  const kept = segs.filter(s => !isXmpApp1(s));
  const at = kept.findIndex(s => !(s.marker === 0xe0 || s.marker === 0xe1)); // after JFIF/EXIF
  kept.splice(at < 0 ? kept.length : at, 0, { marker: 0xe1, data: xmp });
  const parts: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];
  for (const s of kept) parts.push(new Uint8Array([0xff, s.marker, (s.data.length + 2) >> 8, (s.data.length + 2) & 0xff]), s.data);
  parts.push(rest);
  return concat(parts);
}

function readJpegXmp(bytes: Uint8Array): string | null {
  const seg = jpegSegments(bytes).segs.find(isXmpApp1);
  return seg ? new TextDecoder().decode(seg.data.subarray(XMP_NS_HEADER.length)) : null;
}

// ── PNG ──────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface PngChunk { type: string; data: Uint8Array }
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngChunks(b: Uint8Array): PngChunk[] {
  if (!PNG_SIG.every((v, i) => b[i] === v)) throw new Error('not a PNG');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: PngChunk[] = [];
  for (let i = 8; i + 8 <= b.length;) {
    const len = dv.getUint32(i);
    const type = bin(b.subarray(i + 4, i + 8));
    out.push({ type, data: b.subarray(i + 8, i + 8 + len) });
    i += 12 + len;
    if (type === 'IEND') break;
  }
  return out;
}

const XMP_KEYWORD = 'XML:com.adobe.xmp';
const isXmpChunk = (c: PngChunk) => c.type === 'iTXt' && bin(c.data.subarray(0, XMP_KEYWORD.length + 1)) === `${XMP_KEYWORD}\0`;

export function writePngMetadata(bytes: Uint8Array, m: AssetMeta): Uint8Array {
  const chunks = pngChunks(bytes).filter(c => !isXmpChunk(c));
  // keyword\0 compression-flag(0) method(0) language\0 translated\0 text
  const data = concat([utf8.encode(`${XMP_KEYWORD}\0`), new Uint8Array([0, 0, 0, 0]), utf8.encode(buildXmp(m))]);
  chunks.splice(1, 0, { type: 'iTXt', data }); // right after IHDR, before image data
  const parts: Uint8Array[] = [new Uint8Array(PNG_SIG)];
  for (const c of chunks) {
    const head = new Uint8Array(8);
    new DataView(head.buffer).setUint32(0, c.data.length);
    head.set(unbin(c.type), 4);
    const crc = new Uint8Array(4);
    new DataView(crc.buffer).setUint32(0, crc32(concat([head.subarray(4), c.data])));
    parts.push(head, c.data, crc);
  }
  return concat(parts);
}

function readPngXmp(bytes: Uint8Array): string | null {
  const c = pngChunks(bytes).find(isXmpChunk);
  return c ? new TextDecoder().decode(c.data.subarray(XMP_KEYWORD.length + 5)) : null;
}

// ── Shared ───────────────────────────────────────────────────────────────

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function writeMetadata(bytes: Uint8Array, ext: string, m: AssetMeta): Uint8Array {
  if (ext === 'jpg' || ext === 'jpeg') return writeJpegMetadata(bytes, m);
  if (ext === 'png') return writePngMetadata(bytes, m);
  throw new Error(`.${ext} files are index-only: metadata can't be written into them`);
}

/** The XMP fields found in a file, or null when it carries no XMP. */
export function readXmpFields(bytes: Uint8Array, ext: string): AssetMeta | null {
  const xml = ext === 'png' ? readPngXmp(bytes) : ext === 'jpg' || ext === 'jpeg' ? readJpegXmp(bytes) : null;
  return xml ? parseXmp(xml) : null;
}

/** True when the re-read fields equal what was written (order-insensitive tags). */
export function sameMeta(a: AssetMeta, b: AssetMeta): boolean {
  const norm = (m: AssetMeta) => JSON.stringify([m.rating ?? 0, m.label ?? '', [...(m.tags ?? [])].sort(), m.caption ?? '', m.copyright ?? '']);
  return norm(a) === norm(b);
}
