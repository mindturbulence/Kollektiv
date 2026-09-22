// ─── Kollektiv Image Editor — TransformEngine ────────────────────────────────
// Non-destructive transform via on-canvas gizmo (Move tool, `V`).
// Writes to LayerTransform only — never resamples source pixels.
//
// Coordinate convention: all gizmo logic operates in DOCUMENT space.
// Overlay canvas rendering uses docToCanvas() exported from here.
// No React imports.

import { dispatch, getSnapshot } from '../store';
import { pushCommand } from '../history/HistoryManager';
import type { LayerTransform, Point, Viewport, HistoryCommand, ImageLayer } from '../types';

// ─── Handle identifiers ───────────────────────────────────────────────────────

export type HandleId =
  | 'tl' | 'tc' | 'tr'
  | 'ml'         | 'mr'
  | 'bl' | 'bc' | 'br'
  | 'rotate' | 'body';

// ─── Internal drag state ─────────────────────────────────────────────────────

let _dragging    = false;
let _handleId:   HandleId       | null = null;
let _layerId:    string         | null = null;
let _startDoc:   Point          | null = null;
let _startXform: LayerTransform | null = null;
let _liveXform:  LayerTransform | null = null;

const HANDLE_HIT_PX  = 10;  // hit-test radius for corner/edge handles
const ROTATE_LIFT_PX = 22;  // rotate handle pixels above top edge

// ─── Coordinate helpers ───────────────────────────────────────────────────────

/** Convert a document-space point to canvas CSS px. */
export function docToCanvas(
  docX: number, docY: number,
  vp: Viewport, cssW: number, cssH: number, docW: number, docH: number,
): Point {
  return {
    x: vp.zoom * (docX - docW / 2) + cssW / 2 + vp.panX,
    y: vp.zoom * (docY - docH / 2) + cssH / 2 + vp.panY,
  };
}

// ─── Gizmo geometry ───────────────────────────────────────────────────────────

export interface GizmoHandles {
  tl: Point; tc: Point; tr: Point;
  ml: Point;             mr: Point;
  bl: Point; bc: Point; br: Point;
  rotate: Point;
  corners: [Point, Point, Point, Point]; // tl, tr, br, bl — for body hit-test
}

function rotateAround(px: number, py: number, cx: number, cy: number, rad: number): Point {
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const dx = px - cx, dy = py - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

export function getGizmoHandles(
  t: LayerTransform,
  vp: Viewport, cssW: number, cssH: number, docW: number, docH: number,
): GizmoHandles {
  const { origin: o, size: s, rotation } = t;
  const cx = o.x + s.width  / 2;
  const cy = o.y + s.height / 2;
  const rad = (rotation * Math.PI) / 180;

  const toDC = (dx: number, dy: number) => {
    const rp = rotateAround(dx, dy, cx, cy, rad);
    return docToCanvas(rp.x, rp.y, vp, cssW, cssH, docW, docH);
  };

  const tl = toDC(o.x,             o.y);
  const tr = toDC(o.x + s.width,   o.y);
  const bl = toDC(o.x,             o.y + s.height);
  const br = toDC(o.x + s.width,   o.y + s.height);
  const tc = toDC(cx,               o.y);
  const bc = toDC(cx,               o.y + s.height);
  const ml = toDC(o.x,             cy);
  const mr = toDC(o.x + s.width,  cy);

  const rotHandle = {
    x: tc.x - ROTATE_LIFT_PX * Math.sin(rad),
    y: tc.y - ROTATE_LIFT_PX * Math.cos(rad),
  };

  return { tl, tc, tr, ml, mr, bl, bc, br, rotate: rotHandle, corners: [tl, tr, br, bl] };
}

// ─── Hit-testing ──────────────────────────────────────────────────────────────

function d(a: Point, b: Point) { return Math.hypot(b.x - a.x, b.y - a.y); }

function inPoly(pt: Point, corners: [Point, Point, Point, Point]): boolean {
  let inside = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const xi = corners[i].x, yi = corners[i].y;
    const xj = corners[j].x, yj = corners[j].y;
    if (((yi > pt.y) !== (yj > pt.y)) &&
        pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function hitTestGizmo(cssCursor: Point, handles: GizmoHandles): HandleId | null {
  const EDGE_HIT = HANDLE_HIT_PX * 1.5;
  if (d(cssCursor, handles.rotate) <= HANDLE_HIT_PX) return 'rotate';

  const corners: Array<[HandleId, Point]> = [
    ['tl', handles.tl], ['tc', handles.tc], ['tr', handles.tr],
    ['ml', handles.ml], ['mr', handles.mr],
    ['bl', handles.bl], ['bc', handles.bc], ['br', handles.br],
  ];
  for (const [id, pt] of corners) {
    if (d(cssCursor, pt) <= EDGE_HIT) return id;
  }
  return inPoly(cssCursor, handles.corners) ? 'body' : null;
}

// ─── Transform math ───────────────────────────────────────────────────────────

function applyHandle(base: LayerTransform, handle: HandleId, dx: number, dy: number): LayerTransform {
  const x = base;
  switch (handle) {
    case 'body': return { ...x, origin: { x: x.origin.x + dx, y: x.origin.y + dy } };
    case 'br':   return { ...x, size: { width: Math.max(4, x.size.width + dx), height: Math.max(4, x.size.height + dy) } };
    case 'bc':   return { ...x, size: { ...x.size, height: Math.max(4, x.size.height + dy) } };
    case 'mr':   return { ...x, size: { ...x.size, width: Math.max(4, x.size.width + dx) } };
    case 'tl': return {
      ...x,
      origin: { x: x.origin.x + dx, y: x.origin.y + dy },
      size:   { width: Math.max(4, x.size.width - dx), height: Math.max(4, x.size.height - dy) },
    };
    case 'tr': return {
      ...x,
      origin: { ...x.origin, y: x.origin.y + dy },
      size:   { width: Math.max(4, x.size.width + dx), height: Math.max(4, x.size.height - dy) },
    };
    case 'bl': return {
      ...x,
      origin: { ...x.origin, x: x.origin.x + dx },
      size:   { width: Math.max(4, x.size.width - dx), height: Math.max(4, x.size.height + dy) },
    };
    case 'tc': return {
      ...x,
      origin: { ...x.origin, y: x.origin.y + dy },
      size:   { ...x.size, height: Math.max(4, x.size.height - dy) },
    };
    case 'ml': return {
      ...x,
      origin: { ...x.origin, x: x.origin.x + dx },
      size:   { ...x.size, width: Math.max(4, x.size.width - dx) },
    };
    case 'rotate': return x; // rotation handled separately
    default: return x;
  }
}

// ─── Dispatch helpers ─────────────────────────────────────────────────────────

type LayerPatch = Partial<Omit<ImageLayer, 'bitmap' | 'id' | 'type'>>;

function patchTransform(layerId: string, xform: LayerTransform): void {
  const patch: LayerPatch = { transform: xform };
  dispatch({ type: 'UPDATE_LAYER', layerId, patch });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const TransformEngine = {
  getLiveTransform(): LayerTransform | null { return _liveXform; },
  getDraggingLayerId(): string | null { return _dragging ? _layerId : null; },
  isDragging(): boolean { return _dragging; },

  beginDrag(handle: HandleId, layerId: string, startDoc: Point): void {
    const { document: doc } = getSnapshot();
    const layer = doc?.layers.find(l => l.id === layerId);
    if (!layer || layer.type !== 'image') return;
    _dragging   = true;
    _handleId   = handle;
    _layerId    = layerId;
    _startDoc   = { ...startDoc };
    _startXform = { ...layer.transform, origin: { ...layer.transform.origin }, size: { ...layer.transform.size } };
    _liveXform  = { ..._startXform };
  },

  updateDrag(curDoc: Point): void {
    if (!_dragging || !_startDoc || !_startXform || !_handleId || !_layerId) return;

    let nextXform: LayerTransform;

    if (_handleId === 'rotate') {
      const cx = _startXform.origin.x + _startXform.size.width  / 2;
      const cy = _startXform.origin.y + _startXform.size.height / 2;
      const a0 = Math.atan2(_startDoc.y - cy, _startDoc.x - cx);
      const a1 = Math.atan2(curDoc.y   - cy, curDoc.x   - cx);
      nextXform = { ..._startXform, rotation: _startXform.rotation + (a1 - a0) * (180 / Math.PI) };
    } else {
      const dx = curDoc.x - _startDoc.x;
      const dy = curDoc.y - _startDoc.y;
      nextXform = applyHandle(_startXform, _handleId, dx, dy);
    }

    _liveXform = nextXform;
    patchTransform(_layerId, nextXform);
  },

  endDrag(): void {
    if (!_dragging || !_layerId || !_startXform || !_liveXform) { this.cancelDrag(); return; }
    const layerId   = _layerId;
    const before    = _startXform;
    const after     = _liveXform;
    _dragging = false; _handleId = null; _layerId = null;
    _startDoc = null; _startXform = null; _liveXform = null;

    const cmd: HistoryCommand = {
      id: crypto.randomUUID(), label: 'Transform layer', timestamp: Date.now(),
      do:   () => patchTransform(layerId, after),
      undo: () => patchTransform(layerId, before),
    };
    pushCommand(cmd);
  },

  cancelDrag(): void {
    if (_dragging && _layerId && _startXform) patchTransform(_layerId, _startXform);
    _dragging = false; _handleId = null; _layerId = null;
    _startDoc = null; _startXform = null; _liveXform = null;
  },

  flipHorizontal(layerId: string): void {
    const layer = getSnapshot().document?.layers.find(l => l.id === layerId);
    if (!layer) return;
    const before = layer.transform;
    const after  = { ...before, flipH: !before.flipH };
    pushCommand({
      id: crypto.randomUUID(), label: 'Flip horizontal', timestamp: Date.now(),
      do:   () => patchTransform(layerId, after),
      undo: () => patchTransform(layerId, before),
    });
  },

  flipVertical(layerId: string): void {
    const layer = getSnapshot().document?.layers.find(l => l.id === layerId);
    if (!layer) return;
    const before = layer.transform;
    const after  = { ...before, flipV: !before.flipV };
    pushCommand({
      id: crypto.randomUUID(), label: 'Flip vertical', timestamp: Date.now(),
      do:   () => patchTransform(layerId, after),
      undo: () => patchTransform(layerId, before),
    });
  },

  /** Reset rotation to 0 with undo. */
  resetRotation(layerId: string): void {
    const layer = getSnapshot().document?.layers.find(l => l.id === layerId);
    if (!layer) return;
    const before = layer.transform;
    const after  = { ...before, rotation: 0 };
    pushCommand({
      id: crypto.randomUUID(), label: 'Reset rotation', timestamp: Date.now(),
      do:   () => patchTransform(layerId, after),
      undo: () => patchTransform(layerId, before),
    });
  },
};
