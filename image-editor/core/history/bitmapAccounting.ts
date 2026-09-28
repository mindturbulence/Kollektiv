// ─── Kollektiv Image Editor — History bitmap accounting ─────────────────────
// Review H3: every brush/clone/adjustment command holds full-layer ImageBitmaps
// (a 4096² layer is 64 MB decoded), MAX_HISTORY was count-based (50), and no
// `.close()` was ever called — 50 strokes on one 4k layer ≈ 3.2 GB, pinned for
// the lifetime of the page because the history stack keeps every command
// reachable.
//
// Fix (the review's short-term plan):
//   1. Commands declare their bitmap references (`bitmapRefs`, bytes computed
//      from width×height). The store caps the stack by UNIQUE decoded bytes
//      (512 MB), not by count.
//   2. When eviction or a redo-branch drop removes commands from the stack,
//      every bitmap that NO surviving command AND no live document layer still
//      references is `.close()`d — freeing the underlying storage immediately
//      instead of waiting for GC.
//
// Shared references are accounted once and never double-closed: an undo chain
// like brush → brush → undo keeps the ORIGINAL layer bitmap alive through the
// surviving undo command, and the current document layer keeps the latest one
// alive. Only bitmaps exclusively owned by dropped commands are freed.

import type { EditorDocument, HistoryCommand } from '../types';

/** 512 MB of decoded pixels — the review's suggested short-term cap. */
const HISTORY_BYTE_CAP = 512 * 1024 * 1024;

export interface BitmapRef {
  bitmap: ImageBitmap;
  label: string;
}

/** Structural bitmap check — `instanceof ImageBitmap` fails in jsdom (and any
 *  environment without the global), and cross-realm bitmaps wouldn't match
 *  anyway. A bitmap is an object with integer width/height and a close fn. */
function isImageBitmap(value: object): value is ImageBitmap {
  const v = value as Partial<ImageBitmap>;
  return typeof v.width === 'number' && typeof v.height === 'number' && typeof v.close === 'function';
}

/** Extracts the bitmap refs a command holds. Commands that don't declare any
 *  (structural ops) contribute nothing and are never closed. */
export function getCommandBitmapRefs(command: HistoryCommand): BitmapRef[] {
  const refs: BitmapRef[] = [];
  const visit = (value: unknown, label: string): void => {
    if (!value || typeof value !== 'object') return;
    if (isImageBitmap(value)) {
      refs.push({ bitmap: value, label });
      return;
    }
    // Plain objects/arrays only — don't walk DOM nodes or closures.
    if (Array.isArray(value)) {
      value.forEach((item, i) => visit(item, `${label}[${i}]`));
      return;
    }
    if (Object.getPrototypeOf(value) === Object.prototype) {
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        visit(item, label ? `${label}.${key}` : key);
      }
    }
  };
  visit(command, '');
  return refs;
}

function bitmapBytes(bitmap: ImageBitmap): number {
  // 4 bytes/px decoded RGBA (ImageBitmap has no alpha-only packing guarantee).
  return bitmap.width * bitmap.height * 4;
}

/** Unique bytes held by a command list — identical references count once. */
export function historyBytes(commands: HistoryCommand[]): number {
  const seen = new Set<ImageBitmap>();
  let total = 0;
  for (const command of commands) {
    for (const { bitmap } of getCommandBitmapRefs(command)) {
      if (seen.has(bitmap)) continue;
      seen.add(bitmap);
      total += bitmapBytes(bitmap);
    }
  }
  return total;
}

/** Every bitmap still referenced by the live document (top-level + nested,
 *  color bitmaps and masks). These are never closed. */
export function collectDocumentBitmaps(doc: EditorDocument | null): Set<ImageBitmap> {
  const live = new Set<ImageBitmap>();
  if (!doc) return live;
  const visit = (layers: EditorDocument['layers']): void => {
    for (const layer of layers) {
      if (layer.type === 'image') {
        live.add(layer.bitmap);
        if (layer.mask) live.add(layer.mask.bitmap);
      } else if (layer.type === 'group') {
        visit(layer.children);
      }
    }
  };
  visit(doc.layers);
  return live;
}

/** Count cap stays alongside the byte cap (review H3 short-term plan kept the
 *  50-command ceiling; structural commands carry no bytes, so the byte cap
 *  alone would never evict them). */
export const HISTORY_MAX_COUNT = 50;

/**
 * Drops commands from the head of `commands` (oldest first) until BOTH the
 * count cap and the unique-byte cap fit, then closes every bitmap that no
 * surviving command and no live document layer still references. Returns the
 * kept commands.
 *
 * `previousHistory` is the stack BEFORE this trim — bitmaps referenced by it
 * but not by the kept commands (byte-evicted, count-evicted, or dropped
 * redo-branch) are the close candidates.
 */
export function trimHistoryToCap(
  commands: HistoryCommand[],
  previousHistory: HistoryCommand[],
  liveDocBitmaps: Set<ImageBitmap>,
  byteCap: number = HISTORY_BYTE_CAP,
  maxCount: number = HISTORY_MAX_COUNT,
): HistoryCommand[] {
  const kept = [...commands];

  // 1a. Byte cap — drop from the oldest end until it fits.
  while (kept.length > 0 && historyBytes(kept) > byteCap) {
    kept.shift();
  }
  // 1b. Count cap — same eviction direction.
  while (kept.length > maxCount) {
    kept.shift();
  }

  // 2. Close bitmaps owned exclusively by dropped commands.
  const survivingRefs = new Set<ImageBitmap>();
  for (const command of kept) {
    for (const { bitmap } of getCommandBitmapRefs(command)) {
      survivingRefs.add(bitmap);
    }
  }

  const seen = new Set<ImageBitmap>();
  for (const command of previousHistory) {
    if (kept.includes(command)) continue; // still on the stack
    for (const { bitmap } of getCommandBitmapRefs(command)) {
      if (seen.has(bitmap)) continue;
      seen.add(bitmap);
      if (survivingRefs.has(bitmap)) continue;
      if (liveDocBitmaps.has(bitmap)) continue;
      closeQuietly(bitmap);
    }
  }

  return kept;
}

/** Closes every bitmap referenced ONLY by a cleared/dropped history (CLEAR_HISTORY,
 *  resetStore) and not by the live document. */
export function closeDroppedHistoryBitmaps(
  droppedCommands: HistoryCommand[],
  liveDocBitmaps: Set<ImageBitmap>,
): void {
  const seen = new Set<ImageBitmap>();
  for (const command of droppedCommands) {
    for (const { bitmap } of getCommandBitmapRefs(command)) {
      if (seen.has(bitmap)) continue;
      seen.add(bitmap);
      if (liveDocBitmaps.has(bitmap)) continue;
      closeQuietly(bitmap);
    }
  }
}

function closeQuietly(bitmap: ImageBitmap): void {
  try {
    bitmap.close();
  } catch {
    // Already closed (double close throws in some engines) — nothing to do.
  }
}
