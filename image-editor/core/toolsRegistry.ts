// ─── Kollektiv Image Editor — Tools Registry ─────────────────────────────────
// Aggregates teardown of every module-singleton tool/engine (review M12):
// BrushEngine, CloneStampTool, AdjustmentEngine (worker + WebGL context +
// preview map), GradientTool and SelectionEngine drag/lasso state all survive
// unmount and document switches otherwise, leaking bitmaps, a Worker and a
// WebGL2 context, and letting a stale clone source bleed pixels across
// documents (review H6 scenario).
//
// Call sites: ImageEditorPage unmount, and wherever the document is replaced
// (SET_DOCUMENT paths in ui/ImageEditorPage.loadDocument).

import { BrushEngine } from './paint/BrushEngine';
import { CloneStampTool } from './paint/CloneStampTool';
import { AdjustmentEngine } from './adjust/AdjustmentEngine';
import { GradientTool } from './gradient/GradientTool';
import { SelectionEngine } from './selection/SelectionEngine';

export function disposeTools(): void {
  BrushEngine.dispose();
  CloneStampTool.dispose();
  AdjustmentEngine.dispose();
  GradientTool.cancel();
  SelectionEngine.cancelDrag();
  SelectionEngine.cancelLasso();
  SelectionEngine.cancelPolyLasso();
}
