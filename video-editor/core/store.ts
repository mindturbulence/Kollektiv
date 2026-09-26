// ─── Kollektiv Video Editor — store ──────────────────────────────────────────
// Plain module-scoped store, same pattern as image-editor/core/store.ts:
// getSnapshot() / subscribe(fn) / dispatch(action). React reads it through
// useSyncExternalStore (ui/hooks/useEditorState.ts). Edit actions go through
// applyEdit(), which returns the inverse for undo.

import type { EditorAction, EditorState, EditAction } from './types';
import { applyEdit } from './actions/apply';
import { History } from './history/history';

const HISTORY_CAP = 200;

function createDefaultState(): EditorState {
  return {
    project: null,
    selectedClipIds: [],
    playhead: 0,
    isPlaying: false,
    zoom: 80,
    tool: 'select',
    snapping: true,
    isDirty: false,
    canUndo: false,
    canRedo: false,
  };
}

let state: EditorState = createDefaultState();
const history = new History<EditAction>(HISTORY_CAP);
const listeners = new Set<() => void>();

function set(next: EditorState): void {
  state = { ...next, canUndo: history.canUndo(), canRedo: history.canRedo() };
  listeners.forEach(fn => fn());
}

function isEdit(action: EditorAction): action is EditAction {
  switch (action.type) {
    case 'loadProject': case 'setPlayhead': case 'setPlaying': case 'select':
    case 'setZoom': case 'setTool': case 'setSnapping': case 'undo': case 'redo': case 'markSaved':
      return false;
    default:
      return true;
  }
}

/** Drops selected ids whose clips no longer exist (after undo, delete, etc.). */
function pruneSelection(s: EditorState): string[] {
  if (!s.project) return [];
  const ids = new Set(s.project.clips.map(c => c.id));
  return s.selectedClipIds.filter(id => ids.has(id));
}

export function dispatch(action: EditorAction): void {
  if (isEdit(action)) {
    if (!state.project) return;
    const { project, inverse } = applyEdit(state.project, action);
    if (project === state.project) return; // no-op edit (e.g. locked track)
    history.push(action, inverse);
    const next = { ...state, project: { ...project, updatedAt: Date.now() }, isDirty: true };
    set({ ...next, selectedClipIds: pruneSelection(next) });
    return;
  }
  switch (action.type) {
    case 'loadProject':
      history.clear();
      set({ ...createDefaultState(), project: action.project, zoom: state.zoom });
      return;
    case 'setPlayhead':
      set({ ...state, playhead: Math.max(0, action.time) });
      return;
    case 'setPlaying':
      set({ ...state, isPlaying: action.isPlaying });
      return;
    case 'select':
      set({ ...state, selectedClipIds: action.clipIds });
      return;
    case 'setZoom':
      set({ ...state, zoom: Math.min(2000, Math.max(2, action.zoom)) });
      return;
    case 'setTool':
      set({ ...state, tool: action.tool });
      return;
    case 'setSnapping':
      set({ ...state, snapping: action.snapping });
      return;
    case 'undo':
    case 'redo': {
      if (!state.project) return;
      const step = action.type === 'undo' ? history.undo() : history.redo();
      if (!step) return;
      const { project } = applyEdit(state.project, step);
      const next = { ...state, project, isDirty: true };
      set({ ...next, selectedClipIds: pruneSelection(next) });
      return;
    }
    case 'markSaved':
      set({ ...state, isDirty: false });
      return;
  }
}

export function getSnapshot(): EditorState {
  return state;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Test helper: resets store and history. */
export function __resetForTests(): void {
  history.clear();
  state = createDefaultState();
}
