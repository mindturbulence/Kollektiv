// ─── Kollektiv Image Editor — Keyboard Shortcuts ───────────────────────────
// Page-scoped hook, mounted once in ImageEditorPage. Disabled whenever a text
// input/textarea/contentEditable element has focus, so it never collides with
// the document title / layer name inline-rename inputs or the global
// CommandPalette's own shortcut handling.

import { useEffect } from 'react';
import { dispatch, getSnapshot } from '../../core/store';
import { undo, redo } from '../../core/history/HistoryManager';
import { SelectionEngine } from '../../core/selection/SelectionEngine';
import { TransformEngine } from '../../core/transform/TransformEngine';
import type { ToolId } from '../../core/types';

const TOOL_KEYMAP: Record<string, ToolId> = {
  v: 'move',
  m: 'marquee-rect',
  l: 'lasso-freehand',
  w: 'magic-wand',
  c: 'crop',
  b: 'brush',
  e: 'eraser',
  g: 'gradient',
  u: 'shape-rect',
  t: 'type',
  i: 'eyedropper',
  h: 'hand',
  z: 'zoom',
};

export interface UseEditorShortcutsOptions {
  onFitToViewport: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSave: () => void;
  onImport: () => void;
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/** Page-scoped keyboard shortcuts for the Image Editor tab. */
export function useEditorShortcuts(options: UseEditorShortcutsOptions): void {
  const { onFitToViewport, onZoomIn, onZoomOut, onSave, onImport } = options;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTextEntryTarget(e.target)) return;

      const isMod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (isMod) {
        switch (key) {
          case '0':
            e.preventDefault();
            onFitToViewport();
            return;
          case '1':
            e.preventDefault();
            dispatch({ type: 'SET_VIEWPORT', viewport: { zoom: 1.0 } });
            return;
          case '=':
          case '+':
            e.preventDefault();
            onZoomIn();
            return;
          case '-':
            e.preventDefault();
            onZoomOut();
            return;
          case 'z':
            e.preventDefault();
            if (e.shiftKey) redo(); else undo();
            return;
          case 's':
            e.preventDefault();
            onSave();
            return;
          case 'o':
            e.preventDefault();
            onImport();
            return;
          case 'l':
            e.preventDefault();
            dispatch({ type: 'OPEN_ADJUSTMENT', panel: 'levels' });
            return;
          case 'm':
            e.preventDefault();
            dispatch({ type: 'OPEN_ADJUSTMENT', panel: 'curves' });
            return;
          case 'u':
            e.preventDefault();
            dispatch({ type: 'OPEN_ADJUSTMENT', panel: 'hue-sat' });
            return;
          case 'd':
            e.preventDefault();
            SelectionEngine.deselect();
            return;
          default:
            return;
        }
      }

      // Escape: cancel in-progress transform drag
      if (key === 'escape') {
        TransformEngine.cancelDrag();
        SelectionEngine.cancelDrag();
        return;
      }

      // Unmodified single-letter tool shortcuts.
      const tool = TOOL_KEYMAP[key];
      if (!tool) return;
      e.preventDefault();
      if (getSnapshot().activeTool !== tool) {
        dispatch({ type: 'SET_ACTIVE_TOOL', tool });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onFitToViewport, onZoomIn, onZoomOut, onSave, onImport]);
}
