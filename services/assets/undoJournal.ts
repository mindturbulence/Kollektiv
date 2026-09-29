/**
 * Assets Manager — undo journal (plan Task 16). Every file operation the
 * manager performs (rename, move, copy, metadata write-back) records how to
 * reverse it in IndexedDB, so an undo survives a restart. Undo needs the
 * roots' write permission again; when a root is gone or a file changed since,
 * the undo reports exactly which items it couldn't reverse (honest
 * degradation) instead of guessing.
 */
import { openDB, type IDBPDatabase } from 'idb';
import { entryExists, moveOne, resolveDir, resolveFile, type Transferred } from './fileOps';

export type JournalOp =
  | { kind: 'transfer'; mode: 'move' | 'copy'; label: string; items: Transferred[] }
  | { kind: 'write'; label: string; files: { rootId: string; path: string; original: Blob }[] };

export interface JournalEntry { seq: number; at: number; op: JournalOp }

const KEEP = 50;
let _db: Promise<IDBPDatabase> | null = null;
const db = () => (_db ??= openDB('kollektiv-assets-journal', 1, {
  upgrade(d) { d.createObjectStore('ops', { keyPath: 'seq', autoIncrement: true }); },
}));

const _listeners = new Set<() => void>();
export function onJournalChanged(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}
const emit = () => _listeners.forEach(fn => fn());

export async function recordOp(op: JournalOp): Promise<void> {
  if ((op.kind === 'transfer' ? op.items : op.files).length === 0) return;
  const d = await db();
  await d.add('ops', { at: Date.now(), op });
  const keys = (await d.getAllKeys('ops')) as number[];
  for (const k of keys.slice(0, Math.max(0, keys.length - KEEP))) await d.delete('ops', k);
  emit();
}

export async function latestOp(): Promise<JournalEntry | undefined> {
  const d = await db();
  const cursor = await d.transaction('ops').store.openCursor(null, 'prev');
  return (cursor?.value as JournalEntry | undefined) ?? undefined;
}

export async function dropOp(seq: number): Promise<void> {
  await (await db()).delete('ops', seq);
  emit();
}

export interface UndoResult {
  /** Index relocations to apply (toId → fromId for undone moves). */
  relocations: { from: string; to: string }[];
  /** Ids of copies that were removed again. */
  removed: string[];
  failed: { path: string; error: string }[];
}

/**
 * Reverses one journal entry. `rootHandle` returns a writable root handle (the
 * caller has already asked for permission inside the click) or null when the
 * root is gone. The entry is dropped only when every item was reversed.
 */
export async function undoOp(entry: JournalEntry, rootHandle: (rootId: string) => FileSystemDirectoryHandle | null): Promise<UndoResult> {
  const res: UndoResult = { relocations: [], removed: [], failed: [] };
  const op = entry.op;
  const need = (rootId: string) => {
    const h = rootHandle(rootId);
    if (!h) throw new Error('its folder root is no longer connected');
    return h;
  };
  if (op.kind === 'write') {
    for (const f of op.files) {
      try {
        const { handle } = await resolveFile(need(f.rootId), f.path);
        const w = await handle.createWritable();
        await w.write(f.original);
        await w.close();
      } catch (e) { res.failed.push({ path: f.path, error: e instanceof Error ? e.message : String(e) }); }
    }
  } else {
    for (const t of [...op.items].reverse()) {
      try {
        if (op.mode === 'copy') {
          const { dir, name } = await resolveFile(need(t.toRootId), t.toPath);
          await dir.removeEntry(name);
          res.removed.push(t.toId);
        } else {
          const { dir, handle, name } = await resolveFile(need(t.toRootId), t.toPath);
          const back = await resolveDir(need(t.fromRootId), t.fromPath.includes('/') ? t.fromPath.slice(0, t.fromPath.lastIndexOf('/')) : '');
          const origName = t.fromPath.slice(t.fromPath.lastIndexOf('/') + 1);
          if (await entryExists(back, origName)) throw new Error(`"${origName}" exists again in its old place`);
          await moveOne(handle, dir, name, back, origName);
          res.relocations.push({ from: t.toId, to: t.fromId });
        }
      } catch (e) { res.failed.push({ path: t.toPath, error: e instanceof Error ? e.message : String(e) }); }
    }
  }
  if (res.failed.length === 0) await dropOp(entry.seq);
  return res;
}
