/**
 * One-shot "open this item when you mount" handoff from Home to the Gallery and
 * the Prompt Library. Same shape as setPendingStudioParams: the caller stashes
 * an id, then navigates; the page takes it once its list has loaded.
 */
type PendingKind = 'gallery' | 'prompt';

const pending: Partial<Record<PendingKind, string>> = {};

export function setPendingOpen(kind: PendingKind, id: string): void {
  pending[kind] = id;
}

export function takePendingOpen(kind: PendingKind): string | null {
  const id = pending[kind] ?? null;
  delete pending[kind];
  return id;
}
