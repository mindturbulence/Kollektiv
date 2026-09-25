// ─── Kollektiv Image Editor — AdjustmentEngine ──────────────────────────────
// Singleton coordinator for the two-tier adjustment pipeline:
//   • Preview tier  — WebGL2 (AdjustmentPreview), synchronous, called on slider drag
//   • Commit tier   — TypeScript worker (adjust.worker.ts), async, called on OK
//
// CanvasRenderer calls getPreviewBitmap(layerId) during layer compositing.
// No React imports.

import { dispatch } from '../store';
import { AdjustmentPreview } from './AdjustmentPreview';
import { buildSelectionClip, buildSelectionCoverage, lerpPixelsInto } from './selectionMask';
import type { AdjustmentDef, HistoryCommand } from '../types';

let _preview: AdjustmentPreview | null = null;
const _previewBitmaps = new Map<string, ImageBitmap>();
let _worker: Worker | null = null;

export const AdjustmentEngine = {
  /**
   * Fast GPU pass — call on every slider onChange.
   * Updates the preview bitmap and triggers a CanvasRenderer repaint via MARK_LAYER_DIRTY.
   */
  async updatePreview(layerId: string, sourceBitmap: ImageBitmap, adjustment: AdjustmentDef): Promise<void> {
    if (!_preview || _preview.needsResize(sourceBitmap.width, sourceBitmap.height)) {
      _preview?.dispose();
      _preview = new AdjustmentPreview(sourceBitmap.width, sourceBitmap.height);
    }
    const adjustedBitmap = _preview.render(sourceBitmap, adjustment);
    // E5 remainder — mask the GPU preview to the active selection so what the
    // user sees matches the masked commit: unadjusted bitmap outside the
    // clip, adjusted bitmap through the clip. Degrades to the unmasked
    // preview when canvas compositing is unavailable (jsdom).
    const clip = buildSelectionClip(layerId, sourceBitmap.width, sourceBitmap.height);
    let bitmap = adjustedBitmap;
    if (clip) {
      const oc = new OffscreenCanvas(sourceBitmap.width, sourceBitmap.height);
      const ctx = oc.getContext('2d');
      if (ctx) {
        ctx.drawImage(sourceBitmap, 0, 0);            // outside: untouched
        ctx.save();
        ctx.clip(clip);
        ctx.drawImage(adjustedBitmap, 0, 0);          // inside: adjusted
        ctx.restore();
        _previewBitmaps.get(layerId)?.close();
        bitmap = await createImageBitmap(oc);
      }
    }
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

      // E5 remainder — the ORIGINAL pixels stay on the main thread for the
      // selection lerp (worker returns adjusted-only). Copied, not aliased:
      // pixelData's buffer is transferred to the worker below.
      const originalPixels = new Uint8ClampedArray(imageData.data); // copy
      // Per-pixel selection coverage (null = no selection, unmasked commit).
      const coverage = buildSelectionCoverage(layerId, w, h);

      const onMessage = (e: MessageEvent) => {
        if (e.data.requestId !== requestId) return;
        _worker!.removeEventListener('message', onMessage);

        if (e.data.type === 'error') { reject(new Error(e.data.message)); return; }

        // E5 remainder — selection lerp: blend the worker's adjusted pixels
        // back toward the originals weighted by selection coverage, so only
        // selected pixels (fully or partially, feather) receive the change.
        if (coverage) {
          lerpPixelsInto(new Uint8ClampedArray(e.data.pixelData), originalPixels, coverage);
        }

        createImageBitmap(
          new ImageData(new Uint8ClampedArray(e.data.pixelData), e.data.width, e.data.height)
        ).then((newBitmap) => {
          const cmd: HistoryCommand = {
            id: crypto.randomUUID(),
            label: `Apply ${adjustment.kind}`,
            timestamp: Date.now(),
            // H3: declare held bitmaps so the byte-cap can account and free them.
            bitmapRefs: { 'new (do)': newBitmap, 'source (undo)': sourceBitmap },
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
