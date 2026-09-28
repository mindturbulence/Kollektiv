// ─── Kollektiv Image Editor — favourite looks (per browser) ──────────────────
import { useSyncExternalStore } from 'react';

const KEY = 'imageEditor.favouriteLooks';
const read = (): string[] => {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; } catch { return []; }
};

let _favs: ReadonlySet<string> = new Set(read());
const _listeners = new Set<() => void>();

export function toggleFavourite(key: string): void {
  const next = new Set(_favs);
  if (next.has(key)) next.delete(key); else next.add(key);
  _favs = next;
  try { localStorage.setItem(KEY, JSON.stringify([...next])); } catch { /* private mode: in-memory only */ }
  _listeners.forEach(fn => fn());
}

export function useFavourites(): ReadonlySet<string> {
  return useSyncExternalStore((fn) => { _listeners.add(fn); return () => { _listeners.delete(fn); }; }, () => _favs);
}
