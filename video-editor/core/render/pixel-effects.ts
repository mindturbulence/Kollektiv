// Shared CPU pixel-effect resolution for the 'colorGrade' and 'chromaKey'
// Effect types (see core/effect-params.ts for the codec). Used by both the
// Canvas2D renderer (render/index.ts) and the WebGPU renderer's CPU fallback
// (gpu/webgpu-renderer.ts) — no freecut GPU pipeline exists for 'colorGrade'
// (wheels/curves/HSL don't map to any gpu-effects/color.ts shader), and the
// existing 'gpu-chroma-key' shader only supports two preset key colors
// (green/blue) with a different param shape (see gpu/webgpu-renderer.ts for
// why that mapping is excluded rather than reused).
import type { Effect, Transform } from '../types';
import { COLOR_GRADE, CHROMA_KEY, decodeColorGrading, decodeChromaKey } from '../effect-params';
import {
  applyColorGrading,
  applyChromaKey,
  isNeutralColorGrading,
  type ColorGrading,
  type ChromaKeySettings,
} from '../engines';

export type PixelEffectStep =
  | { kind: typeof COLOR_GRADE; grading: ColorGrading }
  | { kind: typeof CHROMA_KEY; settings: ChromaKeySettings };

/**
 * Enabled colorGrade/chromaKey effects, in list order. A neutral colorGrade
 * (empty/identity wheels+curves+hsl, including bad JSON which decodes to
 * `{}`) is skipped; chromaKey has no neutral state, so `enabled: true` alone
 * includes it.
 */
export function resolvePixelEffects(effects: Effect[]): PixelEffectStep[] {
  const steps: PixelEffectStep[] = [];
  for (const effect of effects) {
    if (!effect.enabled) continue;
    if (effect.type === COLOR_GRADE) {
      const grading = decodeColorGrading(effect.params);
      if (!isNeutralColorGrading(grading)) steps.push({ kind: COLOR_GRADE, grading });
    } else if (effect.type === CHROMA_KEY) {
      steps.push({ kind: CHROMA_KEY, settings: decodeChromaKey(effect.params) });
    }
  }
  return steps;
}

/** Applies each step in order, in place, and returns the same ImageData. */
export function applyPixelEffectSteps(imageData: ImageData, steps: PixelEffectStep[]): ImageData {
  for (const step of steps) {
    if (step.kind === COLOR_GRADE) applyColorGrading(imageData, step.grading);
    else applyChromaKey(imageData, step.settings);
  }
  return imageData;
}

/** Drawn box for a source of `sourceWidth x sourceHeight` fit into the canvas. */
export function resolveFitDimensions(
  fit: Transform['fit'],
  sourceWidth: number,
  sourceHeight: number,
  boxWidth: number,
  boxHeight: number,
): { width: number; height: number } {
  if (sourceWidth <= 0 || sourceHeight <= 0 || boxWidth <= 0 || boxHeight <= 0) {
    return { width: boxWidth, height: boxHeight };
  }
  if (fit === 'stretch') return { width: boxWidth, height: boxHeight };

  const sourceAspect = sourceWidth / sourceHeight;
  const boxAspect = boxWidth / boxHeight;
  const fitByHeight = fit === 'cover' ? sourceAspect > boxAspect : sourceAspect <= boxAspect;
  return fitByHeight
    ? { width: boxHeight * sourceAspect, height: boxHeight }
    : { width: boxWidth, height: boxWidth / sourceAspect };
}
