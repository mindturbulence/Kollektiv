// ─── Kollektiv Image Editor — Adjustment Commit Worker ──────────────────────
// Receives pixel data + adjustment definition, applies the kernel, returns
// the modified ArrayBuffer (zero-copy transfer back to main thread).
//
// Vite resolves: new Worker(new URL('./adjust.worker.ts', import.meta.url), { type: 'module' })

import {
  applyLevels,
  applyCurves,
  buildCurvesLUT,
  applyHueSaturation,
  applyExposure,
} from './kernels';
import type { AdjustmentDef } from '../types';

type AdjustRequest = {
  type: 'adjust';
  requestId: string;
  pixelData: ArrayBuffer;
  width: number;
  height: number;
  adjustment: AdjustmentDef;
};

type AdjustResponse = {
  type: 'result';
  requestId: string;
  pixelData: ArrayBuffer;
  width: number;
  height: number;
};

self.onmessage = (e: MessageEvent<AdjustRequest>) => {
  const { requestId, pixelData, width, height, adjustment } = e.data;
  const pixels = new Uint8ClampedArray(pixelData);

  try {
    switch (adjustment.kind) {
      case 'levels': {
        const ch = adjustment.channel === 'rgb' ? 0
          : adjustment.channel === 'r' ? 1
          : adjustment.channel === 'g' ? 2 : 3;
        applyLevels(pixels, adjustment.inBlack, adjustment.inWhite, adjustment.gamma,
          adjustment.outBlack, adjustment.outWhite, ch);
        break;
      }
      case 'curves': {
        const ch = adjustment.channel === 'rgb' ? 0
          : adjustment.channel === 'r' ? 1
          : adjustment.channel === 'g' ? 2 : 3;
        applyCurves(pixels, buildCurvesLUT(adjustment.points), ch);
        break;
      }
      case 'hue-saturation':
        applyHueSaturation(pixels, adjustment.hue, adjustment.saturation,
          adjustment.lightness, adjustment.colorize);
        break;
      case 'exposure':
        applyExposure(pixels, adjustment.exposure, adjustment.offset,
          adjustment.gammaCorrection);
        break;
    }

    const response: AdjustResponse = {
      type: 'result',
      requestId,
      pixelData: pixels.buffer,
      width,
      height,
    };
    (self as unknown as Worker).postMessage(response, [pixels.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: 'error',
      requestId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
