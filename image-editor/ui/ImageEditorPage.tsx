// ─── Kollektiv Image Editor — Page Entry Point ─────────────────────────────
// Tab-level container mounted when activeTab === 'image_editor'. Owns the
// EditorStore lifecycle (reset on unmount), the min-width guard, the unsaved-
// changes guard, and wires the shared save/export/import handlers used by
// both the toolbar buttons and the page-scoped keyboard shortcuts.

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { dispatch, getSnapshot, resetStore, subscribe } from '../core/store';
import type { EditorOpenPayload } from '../core/types';
import { exportToBlob, importFromPayload, openFilePicker, importImage, createBlankDocument } from '../core/io/FileIO';
import * as AutosaveService from '../core/autosave/AutosaveService';
import { saveToGallery, willConvertToJpeg } from './GalleryBridge';
import EditorToolbar from './EditorToolbar';
import ToolRail from './ToolRail';
import ToolHeader from './ToolHeader';
import CanvasViewport, { type CanvasViewportHandle } from './CanvasViewport';
import LayersPanel from './LayersPanel';
import StatusBar from './StatusBar';
import NewDocumentModal from './NewDocumentModal';
import { useEditorShortcuts } from './hooks/useEditorShortcuts';
import FloatingPanelHost from './FloatingPanelHost';
import LevelsPanel from './adjustments/LevelsPanel';
import CurvesPanel from './adjustments/CurvesPanel';
import HueSaturationPanel from './adjustments/HueSaturationPanel';
import ExposurePanel from './adjustments/ExposurePanel';
import ExportModal from './ExportModal';

const MIN_VIEWPORT_WIDTH = 1024;

export interface ImageEditorPageProps {
  openPayload?: EditorOpenPayload;
  showGlobalFeedback?: (message: string, isError?: boolean) => void;
  isExiting?: boolean;
}

const MinWidthNotice: React.FC = () => (
  <div className="w-full h-full flex items-center justify-center bg-base-100 p-8">
    <p className="max-w-sm text-center text-sm text-base-content/60 font-display">
      The Image Editor requires a larger screen. Please use a desktop or maximize your browser window.
    </p>
  </div>
);

const UnsavedChangesModal: React.FC<{
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}> = ({ onSave, onDiscard, onCancel }) => {
  const modalContent = (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-xl z-[1000] flex items-center justify-center p-4 animate-fade-in"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-base-100/95 backdrop-blur-xl w-full max-w-sm rounded-none border border-base-content/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <h3 className="text-sm font-display uppercase tracking-widest text-base-content/80 mb-2">Unsaved Changes</h3>
          <p className="text-sm text-base-content/60">This document has unsaved changes. What would you like to do?</p>
        </div>
        <footer className="panel-footer h-11 p-1.5 gap-1.5">
          <button type="button" className="form-btn flex-1 rounded-none" onClick={onCancel}>Cancel</button>
          <button type="button" className="form-btn flex-1 rounded-none" onClick={onDiscard}>Discard</button>
          <button type="button" className="form-btn form-btn-primary flex-1 rounded-none" onClick={onSave}>Save</button>
        </footer>
      </div>
    </div>
  );

  if (typeof window !== 'undefined' && window.document?.body) {
    return createPortal(modalContent, window.document.body);
  }
  return null;
};
const ImageEditorPage: React.FC<ImageEditorPageProps> = ({ openPayload, showGlobalFeedback, isExiting }) => {
  const viewportRef = useRef<CanvasViewportHandle>(null);
  const isDirty = useSyncExternalStore(subscribe, () => getSnapshot().isDirty);
  const openAdjustments = useSyncExternalStore(subscribe, () => getSnapshot().openAdjustments);
  const activeLayerId = useSyncExternalStore(subscribe, () => getSnapshot().activeLayerId);

  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : MIN_VIEWPORT_WIDTH,
  );
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [isNewDocOpen, setIsNewDocOpen] = useState(!openPayload);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingUnsavedAction, setPendingUnsavedAction] = useState<(() => void) | null>(null);
  const [showRecovery, setShowRecovery] = useState(false);
  const [isRestoring,    setIsRestoring]    = useState(false);
  const [isExportOpen,   setIsExportOpen]   = useState(false);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    let cancelled = false;
    if (openPayload) {
      importFromPayload(openPayload)
        .then((doc) => {
          if (cancelled) return;
          dispatch({ type: 'SET_DOCUMENT', document: doc });
          requestAnimationFrame(() => viewportRef.current?.fitToViewport());
        })
        .catch((err) => {
          showGlobalFeedback?.(`Failed to open image: ${err instanceof Error ? err.message : String(err)}`, true);
        });
    }
    return () => {
      cancelled = true;
      resetStore();
    };
    // Mount-only: openPayload is a one-shot instruction for how this tab session opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    AutosaveService.hasSavedDocument().then((has) => {
      if (has) setShowRecovery(true);
    });
  }, []);

  useEffect(() => {
    return AutosaveService.startAutosave();
  }, []);

  const handleFitToViewport = useCallback(() => viewportRef.current?.fitToViewport(), []);
  const handleZoomIn = useCallback(() => viewportRef.current?.zoomIn(), []);
  const handleZoomOut = useCallback(() => viewportRef.current?.zoomOut(), []);

  const handleSaveToGallery = useCallback(async () => {
    const doc = getSnapshot().document;
    if (!doc || isSaving) return;

    if (willConvertToJpeg()) {
      const proceed = window.confirm(
        'Vault JPG conversion is enabled — saving will flatten transparency. Save as PNG instead?\n\nOK = Save Anyway   Cancel = Abort',
      );
      if (!proceed) return;
    }

    setIsSaving(true);
    try {
      const blob = await exportToBlob(doc, 'png');
      await saveToGallery(blob, { title: doc.title, generationId: doc.sourceGalleryItemId });
      dispatch({ type: 'SET_DIRTY', dirty: false });
      await AutosaveService.clearSavedDocument();
      showGlobalFeedback?.('Saved to library.');
    } catch (err) {
      showGlobalFeedback?.(`Failed to save: ${err instanceof Error ? err.message : String(err)}`, true);
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, showGlobalFeedback]);
  const handleExport = useCallback(() => setIsExportOpen(true), []);

  const handleImport = useCallback(async () => {
    const file = await openFilePicker();
    if (!file) return;
    const layer = await importImage(file);
    dispatch({ type: 'ADD_LAYER', layer, insertAfterIndex: -1 });
  }, []);

  const handleCreateDocument = useCallback(
    async (width: number, height: number, background: 'white' | 'transparent' | 'foreground') => {
      const doc = await createBlankDocument(width, height, background);
      dispatch({ type: 'SET_DOCUMENT', document: doc });
      setIsNewDocOpen(false);
      requestAnimationFrame(() => viewportRef.current?.fitToViewport());
    },
    [],
  );

  /** Any action that discards the current document (New Document) is routed through
   *  this guard so unsaved work always gets a Save/Discard/Cancel choice first. */
  const runWithUnsavedGuard = useCallback((action: () => void) => {
    if (getSnapshot().isDirty) {
      setPendingUnsavedAction(() => action);
    } else {
      action();
    }
  }, []);

  useEditorShortcuts({
    onFitToViewport: handleFitToViewport,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onSave: handleSaveToGallery,
    onImport: handleImport,
  });

  if (viewportWidth < MIN_VIEWPORT_WIDTH) {
    return <MinWidthNotice />;
  }

  return (
    <>
      {showRecovery && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-base-100/80 backdrop-blur-md">
          <div className="bg-base-300 border border-base-content/10 p-6 max-w-sm w-full shadow-2xl">
            <h2 className="font-display text-lg uppercase tracking-widest text-primary mb-2">Unsaved Work Found</h2>
            <p className="text-sm text-base-content/70 mb-6">
              A previous editing session was interrupted. Restore it or start fresh.
            </p>
            <div className="flex gap-3">
              <button
                className="form-btn-primary form-btn rounded-none flex-1 text-xs"
                disabled={isRestoring}
                onClick={async () => {
                  setIsRestoring(true);
                  try {
                    const doc = await AutosaveService.restoreSavedDocument();
                    if (doc) dispatch({ type: 'SET_DOCUMENT', document: doc });
                  } finally {
                    setIsRestoring(false);
                    setShowRecovery(false);
                  }
                }}
              >
                {isRestoring ? 'Restoring…' : 'Restore'}
              </button>
              <button
                className="form-btn rounded-none flex-1 text-xs"
                onClick={() => {
                  AutosaveService.clearSavedDocument();
                  setShowRecovery(false);
                }}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
      <div className={`w-full h-full flex flex-col bg-base-100 overflow-hidden ${isExiting ? 'pointer-events-none opacity-0 transition-opacity duration-200' : ''}`}>
      <EditorToolbar
        onNewDocument={() => runWithUnsavedGuard(() => setIsNewDocOpen(true))}
        onFitToViewport={handleFitToViewport}
        onExport={handleExport}
        onSaveToGallery={handleSaveToGallery}
        isSaving={isSaving}
      />

      <div className="flex-1 flex flex-row min-h-0">
        <ToolRail />
        <div className="flex-1 flex flex-col min-w-0">
          <ToolHeader viewportRef={viewportRef} />
          <CanvasViewport ref={viewportRef} onCursorMove={setCursorPos} />
        </div>
        <LayersPanel />
      </div>

      <StatusBar cursorPos={cursorPos} />

      <NewDocumentModal
        isOpen={isNewDocOpen}
        onClose={() => setIsNewDocOpen(false)}
        onCreate={handleCreateDocument}
      />

      <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />

      {pendingUnsavedAction && (
        <UnsavedChangesModal
          onCancel={() => setPendingUnsavedAction(null)}
          onDiscard={() => {
            const action = pendingUnsavedAction;
            setPendingUnsavedAction(null);
            action();
          }}
          onSave={async () => {
            await handleSaveToGallery();
            const action = pendingUnsavedAction;
            setPendingUnsavedAction(null);
            action?.();
          }}
        />
      )}

    </div>
    <FloatingPanelHost>
      {activeLayerId && openAdjustments.has('levels') && (
        <LevelsPanel layerId={activeLayerId} onClose={() => dispatch({ type: 'CLOSE_ADJUSTMENT', panel: 'levels' })} />
      )}
      {activeLayerId && openAdjustments.has('curves') && (
        <CurvesPanel layerId={activeLayerId} onClose={() => dispatch({ type: 'CLOSE_ADJUSTMENT', panel: 'curves' })} />
      )}
      {activeLayerId && openAdjustments.has('hue-sat') && (
        <HueSaturationPanel layerId={activeLayerId} onClose={() => dispatch({ type: 'CLOSE_ADJUSTMENT', panel: 'hue-sat' })} />
      )}
      {activeLayerId && openAdjustments.has('exposure') && (
        <ExposurePanel layerId={activeLayerId} onClose={() => dispatch({ type: 'CLOSE_ADJUSTMENT', panel: 'exposure' })} />
      )}
    </FloatingPanelHost>
    </>
  );
};

export default ImageEditorPage;
