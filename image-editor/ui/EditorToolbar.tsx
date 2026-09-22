// ─── Kollektiv Image Editor — Editor Toolbar ───────────────────────────────
// 44px top bar: New / document title (inline-rename) · undo/redo (M1: inert)
// · zoom control · fullscreen · export · Save to Gallery.
// Export/Save handlers are owned by ImageEditorPage (shared with Ctrl+S/keyboard
// shortcuts) and passed down so there is exactly one save/export code path.

import React, { useState, useSyncExternalStore } from 'react';
import { dispatch, getSnapshot, subscribe } from '../core/store';
import * as HistoryManager from '../core/history/HistoryManager';
import { ZOOM_STOPS } from '../core/types';
import {
  DocumentIcon, UndoIcon, RedoIcon, ChevronDownIcon,
  ArrowsMaximizeIcon, DownloadIcon, UploadIcon,
} from '../../components/icons';

interface EditorToolbarProps {
  onNewDocument: () => void;
  onFitToViewport: () => void;
  onExport: () => void;
  onSaveToGallery: () => void;
  isSaving: boolean;
}

/** Renames the document title while preserving viewport/selection/active-layer —
 *  SET_DOCUMENT itself resets those (it's meant for opening a brand-new doc). */
function renameDocument(title: string) {
  const snapshot = getSnapshot();
  const trimmed = title.trim();
  if (!snapshot.document || !trimmed || trimmed === snapshot.document.title) return;

  const { viewport, activeLayerId, selection, isDirty } = snapshot;
  dispatch({ type: 'SET_DOCUMENT', document: { ...snapshot.document, title: trimmed, updatedAt: Date.now() } });
  dispatch({ type: 'SET_VIEWPORT', viewport });
  dispatch({ type: 'SET_ACTIVE_LAYER', layerId: activeLayerId });
  if (selection) dispatch({ type: 'SET_SELECTION', selection });
  if (isDirty) dispatch({ type: 'SET_DIRTY', dirty: true });
}

const DocumentTitle: React.FC = () => {
  const title = useSyncExternalStore(subscribe, () => getSnapshot().document?.title ?? null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(title ?? '');

  if (title === null) {
    return <span className="text-sm font-display text-base-content/40 uppercase tracking-wide">No document</span>;
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
        <div className="absolute right-0 top-full mt-1 w-32 bg-base-100 border border-base-content/10 shadow-lg z-20 py-1 max-h-72 overflow-y-auto">
          <button
            type="button"
            className="w-full text-left px-3 py-1 text-xs font-mono hover:bg-primary/10 hover:text-primary"
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
              className="w-full text-left px-3 py-1 text-xs font-mono hover:bg-primary/10 hover:text-primary"
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
  onNewDocument, onFitToViewport, onExport, onSaveToGallery, isSaving,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(
    typeof window !== 'undefined' && !!window.document.fullscreenElement,
  );

  const toggleFullscreen = () => {
    if (window.document.fullscreenElement) {
      window.document.exitFullscreen();
      setIsFullscreen(false);
    } else {
      window.document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    }
  };
  return (
    <div className="h-11 flex-shrink-0 flex items-center gap-3 px-3 bg-base-100/85 backdrop-blur-md border-b border-base-content/5">
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

      <div className="flex-1" />

      <UndoRedoGroup />

      <div className="flex-1" />

      <ZoomControl onFitToViewport={onFitToViewport} />

      <button
        type="button"
        className="tooltip tooltip-bottom p-1.5 text-base-content/60 hover:text-base-content"
        data-tip={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        aria-label="Toggle Fullscreen"
        onClick={toggleFullscreen}
      >
        <ArrowsMaximizeIcon className="w-4 h-4" />
      </button>

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
