// ─── Kollektiv Image Editor — TypeTool ───────────────────────────────────────
// State for inline text editing. The React component TypeInput.tsx renders the
// visible <textarea>; this module tracks whether editing is active and the
// click position, and commits the finished text via LayerManager.addTextLayer().
//
// No React imports.

import { addTextLayer } from '../layers/LayerManager';
import { dispatch } from '../store';

export interface TypeSettings {
  fontFamily: string;
  fontSize:   number;
  fontWeight: number;
  color:      string;
}

// ─── Module-scoped state ─────────────────────────────────────────────────────

let _editing      = false;
let _docX         = 0;
let _docY         = 0;
let _settings: TypeSettings = {
  fontFamily: 'sans-serif',
  fontSize:   48,
  fontWeight: 400,
  color:      '#ffffff',
};

let _onDone: (() => void) | null = null;

// ─── Public API ───────────────────────────────────────────────────────────────

export const TypeTool = {
  get isEditing(): boolean { return _editing; },
  get clickPos(): { x: number; y: number } { return { x: _docX, y: _docY }; },
  get settings(): TypeSettings { return _settings; },

  /** Begin a new text-edit session at the given document coords. */
  beginEdit(docX: number, docY: number, onDone?: () => void): void {
    _editing = true;
    _docX    = docX;
    _docY    = docY;
    _onDone  = onDone ?? null;
  },

  /** Commit text and create a TextLayer. Called by TypeInput on blur/Enter. */
  commit(text: string): void {
    if (!_editing) return;
    _editing = false;

    if (text.trim()) {
      const layerId = addTextLayer({
        text,
        x:          _docX,
        y:          _docY,
        fontFamily: _settings.fontFamily,
        fontSize:   _settings.fontSize,
        fontWeight: _settings.fontWeight,
        color:      _settings.color,
      });
      // Select the new layer
      dispatch({ type: 'SET_ACTIVE_LAYER', layerId });
    }

    _onDone?.();
    _onDone = null;
  },

  /** Cancel without creating a layer. */
  cancel(): void {
    _editing = false;
    _onDone?.();
    _onDone = null;
  },

  updateSettings(patch: Partial<TypeSettings>): void {
    _settings = { ..._settings, ...patch };
  },
};
