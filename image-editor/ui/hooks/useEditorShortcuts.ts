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
import { GradientTool } from '../../core/gradient/GradientTool';
import { fillSelection, deleteInSelection } from '../../core/layers/LayerManager';
import type { ToolId } from '../../core/types';

const TOOL_KEYMAP: Record<string, ToolId> = {
  v: 'move',
  m: 'marquee-rect',
  l: 'lasso-freehand',
  w: 'magic-wand',
  c: 'crop',
  b: 'brush',
  e: 'eraser',
  s: 'clone-stamp',
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
  onPaste?: () => void;
  onImageSize?: () => void;
  onCanvasSize?: () => void;
  onCropToSelection?: () => void;
  onExportMask?: () => void;
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

      // Brush size [ / ] (review §3 P1). Plain and Shift+ / Ctrl+ variants are
      // left for hardness later — size is the high-frequency one.
      if (!isMod && (key === '[' || key === ']')) {
        const { brush } = getSnapshot();
        const step = key === '[' ? -Math.max(1, Math.round(brush.size * 0.1)) : Math.max(1, Math.round(brush.size * 0.1));
        e.preventDefault();
        dispatch({ type: 'SET_BRUSH', brush: { size: Math.max(1, Math.min(500, brush.size + step)) } });
        return;
      }

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
          case 'e':
            e.preventDefault();
            dispatch({ type: 'OPEN_ADJUSTMENT', panel: 'exposure' });
            return;
          case 'd':
            e.preventDefault();
            SelectionEngine.deselect();
            return;
          // M5 item 6 — paste from clipboard (review §3 P1: AI outputs are
          // commonly copied from other tools).
          case 'v':
            e.preventDefault();
            options.onPaste?.();
            return;
          case 'j':
            e.preventDefault();
            options.onImageSize?.();
            return;
          case 'k':
            e.preventDefault();
            options.onCanvasSize?.();
            return;
          default:
            return;
        }
      }

      // Enter/Esc crop handling lives above; here: Ctrl+Shift+C crop-to-
      // selection, Ctrl+Shift+M export mask.
      if (isMod && e.shiftKey && key === 'c') {
        e.preventDefault();
        options.onCropToSelection?.();
        return;
      }
      if (isMod && e.shiftKey && key === 'm') {
        e.preventDefault();
        options.onExportMask?.();
        return;
      }

      // Enter: apply a pending crop (ToolHeader hint promises this).
      if (key === 'enter') {
        if (getSnapshot().pendingCrop) {
          e.preventDefault();
          SelectionEngine.applyCrop();
        }
        return;
      }

      // Escape: cancel in-progress transform drag or the pending crop
      if (key === 'escape') {
        TransformEngine.cancelDrag();
        SelectionEngine.cancelDrag();
        SelectionEngine.cancelLasso();
        SelectionEngine.cancelPolyLasso();
        SelectionEngine.cancelCrop();
        GradientTool.cancel();
        return;
      }

      // Shift+L: polygon lasso (plain L is freehand lasso).
      if (key === 'l' && e.shiftKey) {
        e.preventDefault();
        if (getSnapshot().activeTool !== 'lasso-poly') {
          dispatch({ type: 'SET_ACTIVE_TOOL', tool: 'lasso-poly' });
        }
        return;
      }

      // M5 leftover — fill / delete inside the active selection (review §3 P1).
      // Shift+F5 = fill with the foreground colour (browser hard-refresh is
      // cancelable, preventDefault stops it). Delete / Alt+Backspace clears;
      // unbound otherwise so plain Backspace keeps native behaviour.
      if (e.shiftKey && key === 'f5') {
        e.preventDefault();
        void fillSelection();
        return;
      }
      if (key === 'delete' || (key === 'backspace' && e.altKey)) {
        if (getSnapshot().selection) {
          e.preventDefault();
          void deleteInSelection();
        }
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
  }, [onFitToViewport, onZoomIn, onZoomOut, onSave, onImport, options]);
}
