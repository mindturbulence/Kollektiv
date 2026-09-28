// ─── Kollektiv Image Editor — Quick / Pro mode (view state only) ────────────
// Quick mode trims the tool rail, folds the menus into "More" and opens the
// Looks panel; Pro shows everything. It never changes the document (plan §5).
// Opening an image switches to Quick, creating a blank document to Pro; the
// toolbar toggle overrides either way. Persisted per browser.

import { useSyncExternalStore } from 'react';

export type EditorMode = 'quick' | 'pro';
const KEY = 'imageEditor.mode';

const read = (): EditorMode => {
  try { return localStorage.getItem(KEY) === 'pro' ? 'pro' : 'quick'; } catch { return 'quick'; }
};

let _mode: EditorMode = read();
const _listeners = new Set<() => void>();

export function setEditorMode(mode: EditorMode): void {
  if (mode === _mode) return;
  _mode = mode;
  try { localStorage.setItem(KEY, mode); } catch { /* private mode: in-memory only */ }
  _listeners.forEach(fn => fn());
}

export function getEditorMode(): EditorMode {
  return _mode;
}

export function useEditorMode(): EditorMode {
  return useSyncExternalStore(
    (fn) => { _listeners.add(fn); return () => { _listeners.delete(fn); }; },
    getEditorMode,
  );
}

/** Tools shown on the rail in Quick mode (plan §5). */
export const QUICK_TOOLS = new Set(['move', 'crop', 'brush', 'eraser', 'eyedropper', 'hand', 'zoom']);
