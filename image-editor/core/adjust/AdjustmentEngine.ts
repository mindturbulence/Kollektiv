// ─── Kollektiv Image Editor — AdjustmentEngine ──────────────────────────────
// Singleton coordinator for the two-tier adjustment pipeline:
//   • Preview tier  — WebGL2 (AdjustmentPreview), synchronous, called on slider drag
//   • Commit tier   — TypeScript worker (adjust.worker.ts), async, called on OK
//
// CanvasRenderer calls getPreviewBitmap(layerId) during layer compositing.
// No React imports.

import { dispatch } from '../store';
import { AdjustmentPreview } from './AdjustmentPreview';
import type { AdjustmentDef, HistoryCommand } from '../types';

let _preview: AdjustmentPreview | null = null;
const _previewBitmaps = new Map<string, ImageBitmap>();
let _worker: Worker | null = null;

export const AdjustmentEngine = {
  /**
   * Fast GPU pass — call on every slider onChange.
   * Updates the preview bitmap and triggers a CanvasRenderer repaint via MARK_LAYER_DIRTY.
   */
  updatePreview(layerId: string, sourceBitmap: ImageBitmap, adjustment: AdjustmentDef): void {
    if (!_preview || _preview.needsResize(sourceBitmap.width, sourceBitmap.height)) {
      _preview?.dispose();
      _preview = new AdjustmentPreview(sourceBitmap.width, sourceBitmap.height);
    }
    const bitmap = _preview.render(sourceBitmap, adjustment);
    _previewBitmaps.get(layerId)?.close();
    _previewBitmaps.set(layerId, bitmap);
    dispatch({ type: 'MARK_LAYER_DIRTY', layerId });
  },

  /**
   * CanvasRenderer calls this instead of layer.bitmap when a preview is active.
   * Returns null when no active preview for this layer.
   */
  getPreviewBitmap(layerId: string): ImageBitmap | null {
    return _previewBitmaps.get(layerId) ?? null;
  },

  /** Clear the preview override for a layer (called on Cancel or after OK commit). */
  clearPreview(layerId: string): void {
    _previewBitmaps.get(layerId)?.close();
    _previewBitmaps.delete(layerId);
    dispatch({ type: 'MARK_LAYER_DIRTY', layerId });
  },

  /**
   * Runs the TS-worker commit pass.
   * Resolves with a HistoryCommand — caller must call pushCommand(cmd) to apply + record it.
   */
  commitAdjustment(
    layerId: string,
    sourceBitmap: ImageBitmap,
    adjustment: AdjustmentDef,
  ): Promise<HistoryCommand> {
    if (!_worker) {
      _worker = new Worker(new URL('./adjust.worker.ts', import.meta.url), { type: 'module' });
    }

    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();

      // Extract pixels from sourceBitmap via an OffscreenCanvas
      const oc = new OffscreenCanvas(sourceBitmap.width, sourceBitmap.height);
      const ctx = oc.getContext('2d');
      if (!ctx) { reject(new Error('OffscreenCanvas 2D unavailable')); return; }
      ctx.drawImage(sourceBitmap, 0, 0);
      const imageData = ctx.getImageData(0, 0, oc.width, oc.height);
      const pixelData = imageData.data.buffer.slice(0); // copy — transfer below

      const w = sourceBitmap.width, h = sourceBitmap.height;

      const onMessage = (e: MessageEvent) => {
        if (e.data.requestId !== requestId) return;
        _worker!.removeEventListener('message', onMessage);

        if (e.data.type === 'error') { reject(new Error(e.data.message)); return; }

        createImageBitmap(
          new ImageData(new Uint8ClampedArray(e.data.pixelData), e.data.width, e.data.height)
        ).then((newBitmap) => {
          const cmd: HistoryCommand = {
            id: crypto.randomUUID(),
            label: `Apply ${adjustment.kind}`,
            timestamp: Date.now(),
            do:   () => dispatch({ type: 'REPLACE_LAYER_BITMAP', layerId, bitmap: newBitmap }),
            undo: () => dispatch({ type: 'REPLACE_LAYER_BITMAP', layerId, bitmap: sourceBitmap }),
          };
          resolve(cmd);
        }).catch(reject);
      };

      _worker!.addEventListener('message', onMessage);
      _worker!.postMessage(
        { type: 'adjust', requestId, pixelData, width: w, height: h, adjustment },
        [pixelData],
      );
    });
  },

  dispose(): void {
    _preview?.dispose();
    _preview = null;
    _previewBitmaps.forEach(b => b.close());
    _previewBitmaps.clear();
    _worker?.terminate();
    _worker = null;
  },
};
