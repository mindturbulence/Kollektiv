// ─── Kollektiv Image Editor — TypeTool ───────────────────────────────────────
// State for inline text editing. The React component TypeInput.tsx renders the
// visible <textarea>; this module tracks whether editing is active and the
// click position, and commits the finished text via LayerManager.addTextLayer().
//
// No React imports.

import { addTextLayer, updateTextLayer } from '../layers/LayerManager';
import { dispatch, getSnapshot } from '../store';
import { findLayerById } from '../layers/layerTree';

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
let _settings: TypeSettings | null = null; // lazily seeded from the store foreground (H9)
let _existingLayerId: string | null = null; // set when re-editing an existing text layer (M5 leftover)

function settings(): TypeSettings {
  if (!_settings) {
    _settings = {
      fontFamily: 'sans-serif',
      fontSize:   48,
      fontWeight: 400,
      // Foreground colour, not white: the default white document made a first
      // text layer invisible (review H9).
      color:      getSnapshot().colors.foreground || '#000000',
    };
  }
  return _settings;
}

let _onDone: (() => void) | null = null;

// ─── Public API ───────────────────────────────────────────────────────────────

export const TypeTool = {
  get isEditing(): boolean { return _editing; },
  get clickPos(): { x: number; y: number } { return { x: _docX, y: _docY }; },
  get settings(): TypeSettings { return settings(); },
  /** Id of the text layer being re-edited, or null for a fresh text. (M5) */
  get existingLayerId(): string | null { return _existingLayerId; },

  /** Begin a new text-edit session at the given document coords. */
  beginEdit(docX: number, docY: number, onDone?: () => void): void {
    _editing = true;
    _docX    = docX;
    _docY    = docY;
    _existingLayerId = null;
    _onDone  = onDone ?? null;
  },

  /** M5 leftover — re-edit an existing text layer: seeds the settings and edit
   *  box from the layer itself and commits through LayerManager
   *  .updateTextLayer (undoable) instead of adding a new layer. `docX/docY`
   *  is the click point; TypeInput positions from it as usual. */
  beginEditExisting(
    layerId: string,
    docX: number,
    docY: number,
    onDone?: () => void,
  ): void {
    const { document: doc } = getSnapshot();
    const layer = doc ? findLayerById(doc.layers, layerId) : undefined;
    if (!layer || layer.type !== 'text') return;
    _editing = true;
    _docX    = docX;
    _docY    = docY;
    _existingLayerId = layer.id;
    _onDone  = onDone ?? null;
    _settings = {
      fontFamily: layer.font.family,
      fontSize:   layer.font.size,
      fontWeight: layer.font.weight,
      color:      layer.color,
    };
  },

  /** Commit text: creates a TextLayer for a fresh edit, or updates the
   *  existing layer when re-editing. Called by TypeInput on blur/Enter. */
  commit(text: string): void {
    if (!_editing) return;
    _editing = false;

    if (text.trim()) {
      const s = settings();
      if (_existingLayerId) {
        updateTextLayer(_existingLayerId, {
          text,
          color:      s.color,
          fontFamily: s.fontFamily,
          fontSize:   s.fontSize,
          fontWeight: s.fontWeight,
        });
      } else {
        const layerId = addTextLayer({
          text,
          x:          _docX,
          y:          _docY,
          fontFamily: s.fontFamily,
          fontSize:   s.fontSize,
          fontWeight: s.fontWeight,
          color:      s.color,
        });
        // Select the new layer
        dispatch({ type: 'SET_ACTIVE_LAYER', layerId });
      }
    }

    _existingLayerId = null;
    _onDone?.();
    _onDone = null;
  },

  /** Cancel without creating a layer. */
  cancel(): void {
    _editing = false;
    _existingLayerId = null;
    _onDone?.();
    _onDone = null;
  },

  updateSettings(patch: Partial<TypeSettings>): void {
    _settings = { ...settings(), ...patch };
  },
};
