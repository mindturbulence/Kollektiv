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
