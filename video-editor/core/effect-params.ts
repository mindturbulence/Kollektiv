// ─── Kollektiv Video Editor — structured effect params ───────────────────────
// Shared codec between the Inspector UI (writes) and render (reads) for effects
// whose settings don't fit Effect.params' flat scalar record.
//   colorGrade → params.value = JSON of ColorGrading (wheels/curves/HSL are nested)
//   chromaKey  → flat scalars: keyColor '#rrggbb', tolerance, edgeSoftness, spillSuppression

import type { Effect } from './types';
import type { ColorGrading } from './engines/color-grading';
import { DEFAULT_CHROMA_KEY_SETTINGS, type ChromaKeySettings } from './engines/chroma-key';

export const COLOR_GRADE = 'colorGrade';
export const CHROMA_KEY = 'chromaKey';

export function encodeColorGrading(grading: ColorGrading): Effect['params'] {
  return { value: JSON.stringify(grading) };
}

/** Empty grading (engine treats missing parts as neutral) on bad/missing data. */
export function decodeColorGrading(params: Effect['params']): ColorGrading {
  const raw = params.value;
  if (typeof raw !== 'string') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as ColorGrading) : {};
  } catch {
    return {};
  }
}

const toHex = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');

export function encodeChromaKey(s: ChromaKeySettings): Effect['params'] {
  return {
    keyColor: `#${toHex(s.keyColor.r)}${toHex(s.keyColor.g)}${toHex(s.keyColor.b)}`,
    tolerance: s.tolerance,
    edgeSoftness: s.edgeSoftness,
    spillSuppression: s.spillSuppression,
  };
}

export function decodeChromaKey(params: Effect['params']): ChromaKeySettings {
  const d = DEFAULT_CHROMA_KEY_SETTINGS;
  const num = (k: string, fallback: number) => (typeof params[k] === 'number' ? (params[k] as number) : fallback);
  const hex = typeof params.keyColor === 'string' ? /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(params.keyColor) : null;
  return {
    keyColor: hex
      ? { r: parseInt(hex[1], 16) / 255, g: parseInt(hex[2], 16) / 255, b: parseInt(hex[3], 16) / 255 }
      : d.keyColor,
    tolerance: num('tolerance', d.tolerance),
    edgeSoftness: num('edgeSoftness', d.edgeSoftness),
    spillSuppression: num('spillSuppression', d.spillSuppression),
  };
}
