// Ported from openreel@5f3c85e packages/core/src/export/webcodecs-limits.ts —
// MIT, (c) 2024-2026 Augustus Otu and Contributors. Modified for Kollektiv:
// openreel clamps long/short edge and frame rate for browser memory safety;
// Kollektiv's ExportOptions.width/height/fps are already chosen by the UI, so
// only the even-dimension requirement (yuv420p / most hardware encoders need
// even width & height) is kept here.
export function evenDimensions(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.max(2, Math.round(width / 2) * 2),
    height: Math.max(2, Math.round(height / 2) * 2),
  };
}
