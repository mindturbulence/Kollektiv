// Ported from openreel@5f3c85e packages/core/src/video/chroma-key-engine.ts —
// MIT, (c) 2024-2026 Augustus Otu and Contributors. Modified for Kollektiv.
//
// Upstream is a stateful class owning an OffscreenCanvas and a per-clip
// settings Map. This is a v2 standalone module with no owner yet, so it's
// reworked into a pure ImageData function; the key/alpha/spill math is
// unchanged from upstream's `applyChromaKeyWithSettings`.

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface ChromaKeySettings {
  /** 0..1 RGB. */
  keyColor: RGB;
  /** 0..1. */
  tolerance: number;
  /** 0..1. */
  edgeSoftness: number;
  /** 0..1. */
  spillSuppression: number;
}

export const DEFAULT_CHROMA_KEY_SETTINGS: ChromaKeySettings = {
  keyColor: { r: 0, g: 1, b: 0 },
  tolerance: 0.3,
  edgeSoftness: 0.1,
  spillSuppression: 0.5,
};

function colorDistance(r: number, g: number, b: number, keyColor: RGB): number {
  const dr = r - keyColor.r;
  const dg = g - keyColor.g;
  const db = b - keyColor.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function calculateAlpha(distance: number, tolerance: number, softness: number): number {
  // Max distance in RGB space is sqrt(3) ~= 1.732; scale tolerance to it.
  const scaledTolerance = tolerance * 1.732;
  const scaledSoftness = softness * 0.5;
  if (distance <= scaledTolerance - scaledSoftness) return 0;
  if (distance >= scaledTolerance + scaledSoftness) return 1;
  const range = scaledSoftness * 2;
  const position = distance - (scaledTolerance - scaledSoftness);
  return range > 0 ? position / range : 1;
}

function suppressSpill(r: number, g: number, b: number, keyColor: RGB, amount: number, alpha: number): RGB {
  if (alpha >= 1 || alpha <= 0) return { r, g, b };
  const spillFactor = 1 - alpha;
  const maxKey = Math.max(keyColor.r, keyColor.g, keyColor.b);

  let newR = r;
  let newG = g;
  let newB = b;
  if (keyColor.g === maxKey) {
    const avgRB = (r + b) / 2;
    const greenExcess = Math.max(0, g - avgRB);
    newG = g - greenExcess * amount * spillFactor;
  } else if (keyColor.b === maxKey) {
    const avgRG = (r + g) / 2;
    const blueExcess = Math.max(0, b - avgRG);
    newB = b - blueExcess * amount * spillFactor;
  } else {
    const avgGB = (g + b) / 2;
    const redExcess = Math.max(0, r - avgGB);
    newR = r - redExcess * amount * spillFactor;
  }

  return {
    r: Math.max(0, Math.min(1, newR)),
    g: Math.max(0, Math.min(1, newG)),
    b: Math.max(0, Math.min(1, newB)),
  };
}

/**
 * Keys `imageData` against `settings.keyColor` in place: writes alpha per
 * tolerance/edgeSoftness and suppresses color spill near the key. Returns
 * the same ImageData for chaining.
 */
export function applyChromaKey(imageData: ImageData, settings: ChromaKeySettings): ImageData {
  const data = imageData.data;
  const { keyColor, tolerance, edgeSoftness, spillSuppression } = settings;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const distance = colorDistance(r, g, b, keyColor);
    const alpha = calculateAlpha(distance, tolerance, edgeSoftness);

    if (spillSuppression > 0 && alpha > 0) {
      const spill = suppressSpill(r, g, b, keyColor, spillSuppression, alpha);
      data[i] = Math.round(spill.r * 255);
      data[i + 1] = Math.round(spill.g * 255);
      data[i + 2] = Math.round(spill.b * 255);
    }
    data[i + 3] = Math.round(alpha * 255);
  }
  return imageData;
}
