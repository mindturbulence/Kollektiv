// ─── Kollektiv Image Editor — ShapeTool ──────────────────────────────────────
// Drag-to-create non-rasterized shape layers (rect / ellipse).
// Reuses SelectionEngine.getLiveBounds() for the live drag rect overlay;
// on pointerup creates a ShapeLayer via LayerManager.addShapeLayer().
//
// No React imports.

import { SelectionEngine } from '../selection/SelectionEngine';
import { addShapeLayer } from '../layers/LayerManager';
import { getSnapshot } from '../store';

export type ShapeKind = 'rect' | 'ellipse';

let _kind: ShapeKind = 'rect';

export const ShapeTool = {
  setKind(kind: ShapeKind): void { _kind = kind; },
  getKind(): ShapeKind { return _kind; },

  beginShape(docX: number, docY: number): void {
    SelectionEngine.beginMarquee(docX, docY);
  },

  updateShape(docX: number, docY: number): void {
    SelectionEngine.updateMarquee(docX, docY);
  },

  commitShape(): string {
    const bounds = SelectionEngine.getLiveBounds();
    SelectionEngine.cancelDrag();

    if (!bounds || bounds.width < 4 || bounds.height < 4) return '';

    const { colors } = getSnapshot();
    return addShapeLayer({
      shape:  _kind,
      bounds,
      fill:   colors.foreground,
    });
  },
};
