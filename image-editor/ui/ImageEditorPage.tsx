// ─── Kollektiv Image Editor — Page Entry Point ─────────────────────────────
// Tab-level container mounted when activeTab === 'image_editor'. Owns the
// EditorStore lifecycle (reset on unmount), the min-width guard, the unsaved-
// changes guard, and wires the shared save/export/import handlers used by
// both the toolbar buttons and the page-scoped keyboard shortcuts.

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { dispatch, getSnapshot, resetStore, subscribe } from '../core/store';
import type { EditorDocument, EditorOpenPayload } from '../core/types';
import { exportToBlob, importFromPayload, openFilePicker, importImage, createBlankDocument, exportMaskToBlob } from '../core/io/FileIO';
import * as AutosaveService from '../core/autosave/AutosaveService';
import { disposeTools } from '../core/toolsRegistry';
import { addLayer, cropToSelection } from '../core/layers/LayerManager';
import { findLayerById } from '../core/layers/layerTree';
import { getSourceItemMeta, loadGalleryImage, saveToGallery, willConvertToJpeg } from './GalleryBridge';
import EditorToolbar from './EditorToolbar';
import ToolRail from './ToolRail';
import ToolHeader from './ToolHeader';
import CanvasViewport, { type CanvasViewportHandle } from './CanvasViewport';
import LayersPanel from './LayersPanel';
import StatusBar from './StatusBar';
import NewDocumentModal from './NewDocumentModal';
import Modal from '../../components/Modal';
import { ImageSizeDialog, CanvasSizeDialog } from './SizeDialogs';
import { useEditorShortcuts } from './hooks/useEditorShortcuts';
import FloatingPanelHost from './FloatingPanelHost';
import LevelsPanel from './adjustments/LevelsPanel';
import CurvesPanel from './adjustments/CurvesPanel';
import HueSaturationPanel from './adjustments/HueSaturationPanel';
import ExposurePanel from './adjustments/ExposurePanel';
import ExportModal from './ExportModal';
import ColorPicker from './ColorPicker';

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
/** Replaces the open document. Undo history belongs to the previous document —
 *  keeping it would let redo splice the old document's layers into the new one.
 *  Tool singletons are disposed too: a stale clone source or an in-flight
 *  stroke must not bleed across documents (review M12/H6). */
function loadDocument(doc: EditorDocument | null): void {
  disposeTools();
  dispatch({ type: 'SET_DOCUMENT', document: doc });
  dispatch({ type: 'CLEAR_HISTORY' });
  dispatch({ type: 'SET_PENDING_CROP', rect: null });
}

const ImageEditorPage: React.FC<ImageEditorPageProps> = ({ openPayload, showGlobalFeedback, isExiting }) => {
  const viewportRef = useRef<CanvasViewportHandle>(null);
  const isDirty = useSyncExternalStore(subscribe, () => getSnapshot().isDirty);
  const openAdjustments = useSyncExternalStore(subscribe, () => getSnapshot().openAdjustments);
  const colorPickerTarget = useSyncExternalStore(subscribe, () => getSnapshot().colorPickerTarget);
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
  /** Recovery found while a payload was opening: shown as a non-blocking
   *  banner (M11) — the old modal sat over the just-opened image and Restore
   *  replaced it silently. */
  const [showRecoveryBanner, setShowRecoveryBanner] = useState(false);
  const sourceMetaRef = useRef<{ title?: string; categoryId?: string; tags?: string[]; generationId?: string; prompt?: string } | null>(null);
  /** Gallery item id written by the last save — Ctrl+S again then offers
   *  "Update original" instead of duplicating (review H10). */
  const savedItemIdRef = useRef<string | null>(null);
  /** Non-null when the save flow needs a user decision in the app modal
   *  (E8 leftover): the JPEG-flattening warning and/or the Update-original vs
   *  Save-as-new choice when a library original exists to update. */
  const [saveChoice, setSaveChoice] = useState<null | { jpegWarning: boolean; canUpdateOriginal: boolean }>(null);
  // M5 item 6 — Image Size / Canvas Size dialogs.
  const [isImageSizeOpen, setIsImageSizeOpen] = useState(false);
  const [isCanvasSizeOpen, setIsCanvasSizeOpen] = useState(false);

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
      const load = async () => {
        if (openPayload.kind !== 'gallery') return { doc: await importFromPayload(openPayload), meta: null };
        const [blob, meta] = await Promise.all([
          loadGalleryImage(openPayload.url),
          getSourceItemMeta(openPayload.galleryItemId).catch(() => null),
        ]);
        const doc = await importFromPayload({ kind: 'blob', blob, title: meta?.title });
        doc.sourceGalleryItemId = openPayload.galleryItemId;
        return { doc, meta };
      };
      load()
        .then(({ doc, meta }) => {
          if (cancelled) return;
          sourceMetaRef.current = meta;
          // Update-original target (E8): only meaningful for gallery sources.
          savedItemIdRef.current = openPayload.kind === 'gallery' ? openPayload.galleryItemId : null;
          loadDocument(doc);
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
    void AutosaveService.hasSavedDocument().then((has) => {
      if (!has) return;
      if (openPayload) {
        // A gallery/blob payload is opening — banner, not modal (M11), so the
        // opened image stays visible and Restore requires an explicit choice.
        setShowRecoveryBanner(true);
      } else {
        setShowRecovery(true);
      }
    });
    // Mount-only; openPayload is a one-shot instruction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return AutosaveService.startAutosave();
  }, []);

  const handleFitToViewport = useCallback(() => viewportRef.current?.fitToViewport(), []);
  const handleZoomIn = useCallback(() => viewportRef.current?.zoomIn(), []);
  const handleZoomOut = useCallback(() => viewportRef.current?.zoomOut(), []);

  /** The actual save. `updateOriginal` picks in-place update vs new item.
   *  Resolves true only when the document was actually saved. */
  const doSaveToGallery = useCallback(async (updateOriginal: boolean): Promise<boolean> => {
    const doc = getSnapshot().document;
    if (!doc || isSaving) return false;

    setIsSaving(true);
    try {
      const blob = await exportToBlob(doc, 'png');
      const item = await saveToGallery(blob, {
        title: doc.title,
        // The SOURCE item's generation record id and prompt (E8) — not the
        // gallery item id, which broke lineage lookups (review H10).
        generationId: sourceMetaRef.current?.generationId,
        prompt: sourceMetaRef.current?.prompt,
        categoryId: sourceMetaRef.current?.categoryId,
        tags: sourceMetaRef.current?.tags,
        updateItemId: updateOriginal ? (savedItemIdRef.current ?? undefined) : undefined,
      });
      savedItemIdRef.current = item.id;
      dispatch({ type: 'SET_DIRTY', dirty: false });
      await AutosaveService.clearSavedDocument();
      showGlobalFeedback?.(updateOriginal ? 'Updated original in library.' : 'Saved to library.');
      return true;
    } catch (err) {
      showGlobalFeedback?.(`Failed to save: ${err instanceof Error ? err.message : String(err)}`, true);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, showGlobalFeedback]);

  /** Save entry point. When JPG conversion would flatten alpha, or a library
   *  original exists to update (E8 leftover — the update path was wired but
   *  never user-selectable), the decision goes through the app modal
   *  (window.confirm contradicted its own buttons, review H10). Plain saves
   *  with no original proceed directly with no modal. */
  const handleSaveToGallery = useCallback(async (): Promise<boolean> => {
    const doc = getSnapshot().document;
    if (!doc || isSaving) return false;
    const jpegWarning = willConvertToJpeg();
    const canUpdateOriginal = !!savedItemIdRef.current;
    if (jpegWarning || canUpdateOriginal) {
      setSaveChoice({ jpegWarning, canUpdateOriginal });
      // The modal resolves through doSaveToGallery; report not-saved for now —
      // callers (unsaved-changes guard) treat the modal path as cancelled
      // (same convention as the old jpeg-confirm modal).
      return false;
    }
    return doSaveToGallery(false);
  }, [isSaving, doSaveToGallery]);
  const handleExport = useCallback(() => setIsExportOpen(true), []);

  /** Any action that discards the current document (New Document, Open Image) is routed through
   *  this guard so unsaved work always gets a Save/Discard/Cancel choice first. */
  const runWithUnsavedGuard = useCallback((action: () => void) => {
    if (getSnapshot().isDirty) {
      setPendingUnsavedAction(() => action);
    } else {
      action();
    }
  }, []);

  /** Opens an image file as a new document sized to the image. */
  const openFileAsDocument = useCallback(async (file: File) => {
    try {
      const doc = await importFromPayload({
        kind: 'blob',
        blob: file,
        title: file.name.replace(/\.[^.]+$/, '') || undefined,
      });
      sourceMetaRef.current = null;
      loadDocument(doc);
      setIsNewDocOpen(false);
      requestAnimationFrame(() => viewportRef.current?.fitToViewport());
    } catch (err) {
      showGlobalFeedback?.(`Failed to open image: ${err instanceof Error ? err.message : String(err)}`, true);
    }
  }, [showGlobalFeedback]);

  /** With a document open, a file becomes a new top layer; without one, it becomes the document. */
  const openOrPlaceFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showGlobalFeedback?.(`Not an image: ${file.name}`, true);
      return;
    }
    if (!getSnapshot().document) {
      await openFileAsDocument(file);
      return;
    }
    try {
      addLayer(await importImage(file));
    } catch (err) {
      showGlobalFeedback?.(`Failed to import image: ${err instanceof Error ? err.message : String(err)}`, true);
    }
  }, [openFileAsDocument, showGlobalFeedback]);

  const handleImport = useCallback(async () => {
    const file = await openFilePicker();
    if (file) await openOrPlaceFile(file);
  }, [openOrPlaceFile]);

  /** M5 item 6 — paste an image from the system clipboard (Ctrl+V). Same
   *  routing as a dropped file: no document → becomes the document; with one →
   *  becomes a new layer. */
  const handlePaste = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const ext = imageType.split('/')[1]?.split('+')[0] ?? 'png';
          const file = new File([blob], `pasted-image.${ext}`, { type: imageType });
          await openOrPlaceFile(file);
          return;
        }
      }
      showGlobalFeedback?.('Clipboard has no image to paste.');
    } catch {
      // Clipboard API denied/unavailable (Firefox needs user gesture + paste
      // event; Ctrl+V here IS a gesture, but permission may still be refused).
      showGlobalFeedback?.('Couldn\'t read the clipboard — use "Place image as layer" instead.', true);
    }
  }, [openOrPlaceFile, showGlobalFeedback]);

  /** Exports the active image layer's mask as a B/W PNG (inpaint prep). */
  const handleExportMask = useCallback(async () => {
    const doc = getSnapshot().document;
    const layer = doc && activeLayerId ? findLayerById(doc.layers, activeLayerId) : undefined;
    if (!layer || layer.type !== 'image') {
      showGlobalFeedback?.('Select an image layer to export its mask.', true);
      return;
    }
    if (!layer.mask) {
      showGlobalFeedback?.(`Layer "${layer.name}" has no mask — add one with the +M chip first.`, true);
      return;
    }
    try {
      const blob = await exportMaskToBlob(layer);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `${layer.name}-mask.png`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showGlobalFeedback?.(`Mask export failed: ${err instanceof Error ? err.message : String(err)}`, true);
    }
  }, [activeLayerId, showGlobalFeedback]);

  /** Only reachable from the Open-or-Create modal, which is shown either with no
   *  document or after New already passed the unsaved guard — guarding again would
   *  re-prompt after the user just chose Discard (isDirty is still true then). */
  const handleOpenImage = useCallback(async () => {
    const file = await openFilePicker();
    if (file) await openFileAsDocument(file);
  }, [openFileAsDocument]);

  const [isDragOver, setIsDragOver] = useState(false);
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    e.preventDefault();
    void openOrPlaceFile(file);
  }, [openOrPlaceFile]);

  const handleCreateDocument = useCallback(
    async (width: number, height: number, background: 'white' | 'transparent' | 'foreground') => {
      try {
        const doc = await createBlankDocument(width, height, background);
        loadDocument(doc);
        setIsNewDocOpen(false);
        requestAnimationFrame(() => viewportRef.current?.fitToViewport());
      } catch (err) {
        // H13: oversize/invalid dimensions now throw with a real message.
        showGlobalFeedback?.(err instanceof Error ? err.message : String(err), true);
      }
    },
    [showGlobalFeedback],
  );


  useEditorShortcuts({
    onFitToViewport: handleFitToViewport,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onSave: () => { void handleSaveToGallery(); },
    onImport: () => { void handleImport(); },
    onPaste: () => void handlePaste(),
    onImageSize: () => setIsImageSizeOpen(true),
    onCanvasSize: () => setIsCanvasSizeOpen(true),
    onCropToSelection: () => {
      if (!cropToSelection()) showGlobalFeedback?.('Make a selection first.');
    },
    onExportMask: () => void handleExportMask(),
  });

  if (viewportWidth < MIN_VIEWPORT_WIDTH) {
    return <MinWidthNotice />;
  }

  return (
    <>
      <Modal
        isOpen={showRecovery}
        // Dismissing defers the choice to the banner so the autosave is never dropped silently.
        onClose={() => { setShowRecovery(false); setShowRecoveryBanner(true); }}
        title="Unsaved Work Found"
        size="sm"
      >
        <div className="p-5">
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
                  if (doc) loadDocument(doc);
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
                void AutosaveService.clearSavedDocument();
                setShowRecovery(false);
              }}
            >
              Discard
            </button>
          </div>
        </div>
      </Modal>
      <div className={`w-full h-full flex flex-col bg-base-100 overflow-hidden ${isExiting ? 'pointer-events-none opacity-0 transition-opacity duration-200' : ''}`}>
      {showRecoveryBanner && (
        <div className="flex items-center gap-3 px-4 h-10 flex-shrink-0 bg-warning/15 border-b border-warning/30">
          <span className="text-xs font-mono text-base-content/80 flex-1">
            An autosaved session was found. Restoring will replace the current image.
          </span>
          <button
            type="button"
            className="text-xs font-mono px-2 py-0.5 border border-base-content/20 hover:border-primary hover:text-primary"
            disabled={isRestoring}
            onClick={async () => {
              setIsRestoring(true);
              try {
                const doc = await AutosaveService.restoreSavedDocument();
                if (doc) {
                  sourceMetaRef.current = null;
                  savedItemIdRef.current = null;
                  loadDocument(doc);
                  requestAnimationFrame(() => viewportRef.current?.fitToViewport());
                }
              } finally {
                setIsRestoring(false);
                setShowRecoveryBanner(false);
              }
            }}
          >
            {isRestoring ? 'Restoring…' : 'Restore'}
          </button>
          <button
            type="button"
            className="text-xs font-mono px-2 py-0.5 border border-base-content/20 hover:border-primary hover:text-primary"
            onClick={() => {
              void AutosaveService.clearSavedDocument();
              setShowRecoveryBanner(false);
            }}
          >
            Discard
          </button>
        </div>
      )}
      <EditorToolbar
        onNewDocument={() => runWithUnsavedGuard(() => setIsNewDocOpen(true))}
        onFitToViewport={handleFitToViewport}
        onExport={handleExport}
        onSaveToGallery={handleSaveToGallery}
        isSaving={isSaving}
        onImageSize={() => setIsImageSizeOpen(true)}
        onCanvasSize={() => setIsCanvasSizeOpen(true)}
      />

      <div
        className={`flex-1 flex flex-row min-h-0 ${isDragOver ? 'ring-2 ring-inset ring-primary/60' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setIsDragOver(false); }}
        onDrop={handleDrop}
      >
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
        onOpenImage={handleOpenImage}
        onDropFile={(file) => void openFileAsDocument(file)}
      />

      <ImageSizeDialog isOpen={isImageSizeOpen} onClose={() => setIsImageSizeOpen(false)} />
      <CanvasSizeDialog isOpen={isCanvasSizeOpen} onClose={() => setIsCanvasSizeOpen(false)} />

      <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />

      <Modal isOpen={saveChoice !== null} onClose={() => setSaveChoice(null)} title="Save to library" size="sm">
        <div className="p-5">
          {saveChoice?.jpegWarning && (
            <p className="text-sm text-base-content/60 mb-2">
              The vault will re-encode this image as JPG, flattening transparent areas to a solid background.
            </p>
          )}
          {saveChoice?.canUpdateOriginal && (
            <p className="text-sm text-base-content/60">
              You opened this image from the library. Update the original in place, or save this edit as a new item?
            </p>
          )}
        </div>
        <footer className="panel-footer h-11 p-1.5 gap-1.5">
          <button type="button" className="form-btn flex-1 rounded-none" onClick={() => setSaveChoice(null)}>Cancel</button>
          {saveChoice?.canUpdateOriginal && (
            <button
              type="button"
              className="form-btn flex-1 rounded-none"
              onClick={async () => {
                setSaveChoice(null);
                await doSaveToGallery(true);
              }}
            >
              Update original
            </button>
          )}
          <button
            type="button"
            className="form-btn form-btn-primary flex-1 rounded-none"
            onClick={async () => {
              setSaveChoice(null);
              await doSaveToGallery(false);
            }}
          >
            Save as new{saveChoice?.jpegWarning ? ' (JPG)' : ''}
          </button>
        </footer>
      </Modal>

      {pendingUnsavedAction && (
        <UnsavedChangesModal
          onCancel={() => setPendingUnsavedAction(null)}
          onDiscard={() => {
            const action = pendingUnsavedAction;
            setPendingUnsavedAction(null);
            action();
          }}
          onSave={async () => {
            const saved = await handleSaveToGallery();
            const action = pendingUnsavedAction;
            setPendingUnsavedAction(null);
            if (saved) action?.();
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
      {colorPickerTarget && (
        <ColorPicker target={colorPickerTarget} onClose={() => dispatch({ type: 'SET_COLOR_PICKER_TARGET', target: null })} />
      )}
    </FloatingPanelHost>
    </>
  );
};

export default ImageEditorPage;
