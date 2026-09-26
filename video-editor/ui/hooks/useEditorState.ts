import { useSyncExternalStore } from 'react';
import { getSnapshot, subscribe } from '../../core/store';
import type { EditorState } from '../../core/types';

/** Whole editor state; re-renders on every store change. */
export function useEditorState(): EditorState {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Selected slice; re-renders only when the slice changes by Object.is. */
export function useEditorSelector<T>(select: (s: EditorState) => T): T {
  return useSyncExternalStore(subscribe, () => select(getSnapshot()));
}
