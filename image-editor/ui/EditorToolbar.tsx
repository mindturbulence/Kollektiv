// ─── Kollektiv Image Editor — Editor Toolbar ───────────────────────────────
// 44px top bar: New / document title (inline-rename) · undo/redo (M1: inert)
// · zoom control · export · Save to Gallery. (Fullscreen lives in the app header.)
// Export/Save handlers are owned by ImageEditorPage (shared with Ctrl+S/keyboard
// shortcuts) and passed down so there is exactly one save/export code path.

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { dispatch, getSnapshot, subscribe } from '../core/store';
import * as HistoryManager from '../core/history/HistoryManager';
import { ZOOM_STOPS, type AdjustmentPanel } from '../core/types';
import { findLayerById } from '../core/layers/layerTree';
import { fillSelection, deleteInSelection } from '../core/layers/LayerManager';
import { SelectionEngine } from '../core/selection/SelectionEngine';
import {
  DocumentIcon, UndoIcon, RedoIcon, ChevronDownIcon,
  DownloadIcon, UploadIcon,
} from '../../components/icons';

interface EditorToolbarProps {
  onNewDocument: () => void;
  onFitToViewport: () => void;
  onExport: () => void;
  onSaveToGallery: () => void;
  isSaving: boolean;
  onImageSize: () => void;
  onCanvasSize: () => void;
  onCropToSelection: () => void;
  onExportMask: () => void;
}

const ADJUSTMENTS: { panel: AdjustmentPanel; label: string; shortcut: string }[] = [
  { panel: 'levels', label: 'Levels…', shortcut: 'Ctrl+L' },
  { panel: 'curves', label: 'Curves…', shortcut: 'Ctrl+M' },
  { panel: 'hue-sat', label: 'Hue / Saturation…', shortcut: 'Ctrl+U' },
  { panel: 'exposure', label: 'Exposure…', shortcut: 'Ctrl+E' },
];

/** Renames the document title. SET_TITLE touches only the title (+ updatedAt,
 *  isDirty) — viewport/selection/active-layer are never disturbed. */
function renameDocument(title: string) {
  dispatch({ type: 'SET_TITLE', title });
}

const DocumentTitle: React.FC = () => {
  const title = useSyncExternalStore(subscribe, () => getSnapshot().document?.title ?? null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(title ?? '');

  if (title === null) {
    return <span className="text-sm font-display text-base-content/60 uppercase tracking-wide">No document</span>;
  }

  if (isEditing) {
    return (
      <input
        autoFocus
        className="bg-transparent border-b border-primary/50 text-sm font-display outline-none min-w-[8rem]"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => {
          renameDocument(draft);
          setIsEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(title);
            setIsEditing(false);
          }
        }}
      />
    );
  }

  return (
    <span
      className="text-sm font-display text-base-content/85 truncate max-w-[16rem] cursor-text"
      title="Double-click to rename"
      onDoubleClick={() => {
        setDraft(title);
        setIsEditing(true);
      }}
    >
      {title}
    </span>
  );
};

const ZoomControl: React.FC<{ onFitToViewport: () => void }> = ({ onFitToViewport }) => {
  const zoom = useSyncExternalStore(subscribe, () => getSnapshot().viewport.zoom);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        className="flex items-center gap-1 px-2 h-7 text-xs font-mono text-base-content/70 hover:text-base-content border border-base-content/10"
        onClick={() => setIsOpen((v) => !v)}
      >
        {Math.round(zoom * 100)}%
        <ChevronDownIcon className="w-3 h-3" />
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-40 bg-base-100 border border-base-content/10 shadow-lg z-20 py-1 max-h-72 overflow-y-auto">
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs font-mono whitespace-nowrap hover:bg-primary/10 hover:text-primary"
            onClick={() => {
              onFitToViewport();
              setIsOpen(false);
            }}
          >
            Fit to window
          </button>
          {ZOOM_STOPS.map((stop) => (
            <button
              key={stop}
              type="button"
              className="w-full text-left px-3 py-1.5 text-xs font-mono whitespace-nowrap hover:bg-primary/10 hover:text-primary"
              onClick={() => {
                dispatch({ type: 'SET_VIEWPORT', viewport: { zoom: stop } });
                setIsOpen(false);
              }}
            >
              {Math.round(stop * 100)}%
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
interface MenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  /** Shown as the tooltip when disabled, so the user knows why. */
  reason?: string;
  onSelect: () => void;
}

/** Labelled dropdown giving shortcut-only actions an on-screen entry
 *  (frontend plan §4: every action has an on-screen equivalent). */
const ToolbarMenu: React.FC<{ label: string; items: MenuItem[] }> = ({ label, items }) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // Document listener, not a fixed backdrop: the toolbar's backdrop-blur makes
  // it the containing block for fixed children, so a backdrop would only
  // cover the toolbar.
  useEffect(() => {
    if (!isOpen) return;
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={`flex items-center gap-1 px-2.5 h-8 text-xs font-mono whitespace-nowrap ${isOpen ? 'text-primary' : 'text-base-content/70 hover:text-base-content'}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
      >
        {label}
        <ChevronDownIcon className="w-3 h-3" />
      </button>
      {isOpen && (
        <div role="menu" className="absolute left-0 top-full mt-1 min-w-[18rem] bg-base-100 border border-base-content/10 shadow-lg z-dropdown py-1">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className="w-full flex items-center justify-between gap-6 px-3 py-1.5 text-xs font-mono text-left whitespace-nowrap hover:bg-primary/10 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-inherit"
                disabled={item.disabled}
                title={item.disabled ? item.reason : undefined}
                onClick={() => {
                  setIsOpen(false);
                  item.onSelect();
                }}
              >
                <span>{item.label}</span>
                {item.shortcut && <span className="text-base-content/50 tracking-normal">{item.shortcut}</span>}
              </button>
            ))}
        </div>
      )}
    </div>
  );
};

const UndoRedoGroup: React.FC = () => {
  const canUndo = useSyncExternalStore(subscribe, () => HistoryManager.canUndo());
  const canRedo = useSyncExternalStore(subscribe, () => HistoryManager.canRedo());
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        className={`tooltip tooltip-bottom p-1.5 ${canUndo ? 'text-base-content/70 hover:text-primary' : 'text-base-content/25 cursor-not-allowed'}`}
        data-tip="Undo (Ctrl+Z)"
        aria-label="Undo"
        disabled={!canUndo}
        onClick={() => HistoryManager.undo()}
      >
        <UndoIcon className="w-4 h-4" />
      </button>
      <button
        type="button"
        className={`tooltip tooltip-bottom p-1.5 ${canRedo ? 'text-base-content/70 hover:text-primary' : 'text-base-content/25 cursor-not-allowed'}`}
        data-tip="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
        disabled={!canRedo}
        onClick={() => HistoryManager.redo()}
      >
        <RedoIcon className="w-4 h-4" />
      </button>
    </div>
  );
};


const EditorToolbar: React.FC<EditorToolbarProps> = ({
  onNewDocument, onFitToViewport, onExport, onSaveToGallery, isSaving, onImageSize, onCanvasSize,
  onCropToSelection, onExportMask,
}) => {
  const doc = useSyncExternalStore(subscribe, () => getSnapshot().document);
  const activeLayerId = useSyncExternalStore(subscribe, () => getSnapshot().activeLayerId);
  const hasSelection = useSyncExternalStore(subscribe, () => getSnapshot().selection !== null);
  const activeLayer = doc && activeLayerId ? findLayerById(doc.layers, activeLayerId) : undefined;
  const hasDoc = !!doc;
  const activeIsImage = activeLayer?.type === 'image';
  const activeHasMask = activeLayer?.type === 'image' && !!activeLayer.mask;
  const noDoc = 'Open or create a document first';
  const noSelection = 'Make a selection first';

  return (
    // relative z-raised: backdrop-blur makes this a stacking context, so its
    // dropdowns (menus, zoom) can only overlay the tool header if the whole bar does.
    <div className="relative z-raised h-11 flex-shrink-0 flex items-center gap-3 px-3 bg-base-100/85 backdrop-blur-md border-b border-base-content/5">
      <button
        type="button"
        className="tooltip tooltip-bottom p-1.5 text-base-content/60 hover:text-primary"
        data-tip="New Document"
        aria-label="New Document"
        onClick={onNewDocument}
      >
        <DocumentIcon className="w-4 h-4" />
      </button>

      <DocumentTitle />

      <div className="flex items-center border-l border-base-content/10 pl-1">
        <ToolbarMenu
          label="Image"
          items={[
            { label: 'Image Size…', shortcut: 'Ctrl+J', disabled: !hasDoc, reason: noDoc, onSelect: onImageSize },
            { label: 'Canvas Size…', shortcut: 'Ctrl+K', disabled: !hasDoc, reason: noDoc, onSelect: onCanvasSize },
            { label: 'Crop to Selection', shortcut: 'Ctrl+Shift+C', disabled: !hasSelection, reason: noSelection, onSelect: onCropToSelection },
            { label: 'Export Layer Mask…', shortcut: 'Ctrl+Shift+M', disabled: !activeHasMask, reason: 'The active layer has no mask', onSelect: onExportMask },
          ]}
        />
        <ToolbarMenu
          label="Select"
          items={[
            { label: 'Deselect', shortcut: 'Ctrl+D', disabled: !hasSelection, reason: noSelection, onSelect: () => SelectionEngine.deselect() },
            { label: 'Fill with Foreground', shortcut: 'Shift+F5', disabled: !hasSelection, reason: noSelection, onSelect: () => void fillSelection() },
            { label: 'Delete Contents', shortcut: 'Del', disabled: !hasSelection, reason: noSelection, onSelect: () => void deleteInSelection() },
          ]}
        />
        <ToolbarMenu
          label="Adjust"
          items={ADJUSTMENTS.map(({ panel, label, shortcut }) => ({
            label,
            shortcut,
            disabled: !activeIsImage,
            reason: 'Select an image layer to adjust',
            onSelect: () => dispatch({ type: 'OPEN_ADJUSTMENT', panel }),
          }))}
        />
      </div>

      <div className="border-l border-base-content/10 pl-2">
        <UndoRedoGroup />
      </div>

      <div className="flex-1" />

      <ZoomControl onFitToViewport={onFitToViewport} />

      <button
        type="button"
        className="form-btn rounded-none h-8 px-3 text-xs flex items-center gap-1.5"
        onClick={onExport}
      >
        <DownloadIcon className="w-3.5 h-3.5" />
        Export
      </button>

      <button
        type="button"
        className="form-btn form-btn-primary rounded-none h-8 px-3 text-xs flex items-center gap-1.5"
        onClick={onSaveToGallery}
        disabled={isSaving}
      >
        <UploadIcon className="w-3.5 h-3.5" />
        {isSaving ? 'Saving…' : 'Save to Gallery'}
      </button>
    </div>
  );
};

export default EditorToolbar;
