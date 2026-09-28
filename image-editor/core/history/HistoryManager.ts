// ─── Kollektiv Image Editor — History Manager ──────────────────────────────
// Pure engine module wrapping undo/redo around EditorStore's history slice.
// No direct React imports — components and other engine modules call these.
//
// The store only tracks the command stack + index; it never calls do()/undo()
// itself. This module owns the ordering guarantees:
//   - pushCommand: PUSH_HISTORY (trims redo branch, advances index) BEFORE do()
//   - undo: UNDO (decrements index) BEFORE cmd.undo()
//   - redo: REDO (increments index) BEFORE nextCmd.do()
// so that any store reads triggered by do()/undo() side effects see the
// already-updated historyIndex.

import { dispatch, getSnapshot } from '../store';
import type { HistoryCommand } from '../types';

/** Applies a command and records it on the history stack. */
export function pushCommand(command: HistoryCommand): void {
  dispatch({ type: 'PUSH_HISTORY', command });
  command.do();
}

/** Like pushCommand, but if the newest command (with no redo branch) has the
 *  same `mergeKey`, the two collapse into one undo step: undo() is the older
 *  command's, do() replays the older do() then this one (so a redo after
 *  "add look" + "change recipe" re-adds the layer before restyling it). */
export function pushMergeable(command: HistoryCommand): void {
  const { history, historyIndex } = getSnapshot();
  const top = history[historyIndex];
  if (command.mergeKey && top?.mergeKey === command.mergeKey && historyIndex === history.length - 1) {
    const merged: HistoryCommand = {
      ...command,
      do: () => { top.do(); command.do(); },
      undo: top.undo,
    };
    dispatch({ type: 'REPLACE_TOP_HISTORY', command: merged });
    command.do();
    return;
  }
  pushCommand(command);
}

/** Reverts the most recently applied command, if any. */
export function undo(): void {
  const { history, historyIndex } = getSnapshot();
  if (historyIndex < 0) return;
  const cmd = history[historyIndex];
  dispatch({ type: 'UNDO' });
  cmd.undo();
}

/** Re-applies the next command in the redo branch, if any. */
export function redo(): void {
  const { history, historyIndex } = getSnapshot();
  if (historyIndex >= history.length - 1) return;
  const nextCmd = history[historyIndex + 1];
  dispatch({ type: 'REDO' });
  nextCmd.do();
}

/** Moves to `index` in the stack (-1 = before the first surviving command) by
 *  stepping undo/redo, so every command's do()/undo() runs in order. */
export function jumpTo(index: number): void {
  const target = Math.max(-1, Math.min(index, getSnapshot().history.length - 1));
  while (getSnapshot().historyIndex > target) undo();
  while (getSnapshot().historyIndex < target) redo();
}

/** Whether there is a command available to undo. */
export function canUndo(): boolean {
  return getSnapshot().historyIndex >= 0;
}

/** Whether there is a command available to redo. */
export function canRedo(): boolean {
  const { history, historyIndex } = getSnapshot();
  return historyIndex < history.length - 1;
}

/** Clears the entire undo/redo stack (e.g. on document load/close). */
export function clearHistory(): void {
  dispatch({ type: 'CLEAR_HISTORY' });
}
