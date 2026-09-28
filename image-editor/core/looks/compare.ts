// ─── Kollektiv Image Editor — before/after compare ──────────────────────────
// While held (the Looks panel's Compare button or the `\` key), the on-screen
// painter skips look layers so the user sees the image without its looks.
// Export/flatten never bypass. View state only — not in the document or history.

let _bypass = false;
const _listeners = new Set<() => void>();

export function setLookBypass(on: boolean): void {
  if (on === _bypass) return;
  _bypass = on;
  _listeners.forEach(fn => fn());
}

export function isLookBypassed(): boolean {
  return _bypass;
}

export function onLookBypassChanged(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}
