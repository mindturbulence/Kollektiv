// ─── Kollektiv Video Editor — curve editor ───────────────────────────────────
// Compact SVG curve widget: click empty space to add a point, drag a point to
// move it (endpoints stay fixed in x), double-click a point to remove it.
// Committed once per drag/click, matching the Inspector Slider's one-undo-
// step-per-drag pattern.

import React, { useRef, useState } from 'react';
import type { CurvePoint } from '../../core/engines/color-grading';

interface CurveEditorProps {
  points: CurvePoint[];
  onChange: (points: CurvePoint[]) => void;
}

const SIZE = 160;

const toSvg = (p: CurvePoint) => ({ x: p.x * SIZE, y: (1 - p.y) * SIZE });
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const fromSvg = (x: number, y: number): CurvePoint => ({ x: clamp01(x / SIZE), y: clamp01(1 - y / SIZE) });
const sortPoints = (points: CurvePoint[]) => [...points].sort((a, b) => a.x - b.x);

const CurveEditor: React.FC<CurveEditorProps> = ({ points, onChange }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<CurvePoint[] | null>(null);
  // Refs mirror the drag state and are updated synchronously inside the
  // pointer handlers themselves — state alone can lag a render behind a fast
  // pointerup that follows a pointermove in the same batch, which would
  // make commitDrag read stale (pre-move) values. `draft` state exists only
  // to trigger the re-render that shows the point moving.
  const dragIndexRef = useRef<number | null>(null);
  const draftRef = useRef<CurvePoint[] | null>(null);
  const movedRef = useRef(false);
  const sorted = sortPoints(draft ?? points);

  const coordsFromEvent = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * SIZE, y: ((e.clientY - rect.top) / rect.height) * SIZE };
  };

  const startDrag = (index: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const initial = sortPoints(points);
    dragIndexRef.current = index;
    draftRef.current = initial;
    movedRef.current = false;
    setDraft(initial);
  };

  // Keeps a middle point strictly between its neighbours so sorting after a
  // drag never turns it into a new endpoint (which must stay fixed in x).
  const clampX = (draftPoints: CurvePoint[], index: number, x: number): number => {
    const EPS = 1 / SIZE;
    const prev = draftPoints[index - 1];
    const next = draftPoints[index + 1];
    const lo = prev ? prev.x + EPS : 0;
    const hi = next ? next.x - EPS : 1;
    return Math.min(hi, Math.max(lo, x));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const index = dragIndexRef.current;
    const current = draftRef.current;
    if (index === null || !current) return;
    const { x, y } = coordsFromEvent(e);
    const next = fromSvg(x, y);
    const isEndpoint = index === 0 || index === current.length - 1;
    const nextX = isEndpoint ? current[index].x : clampX(current, index, next.x);
    const updated = current.map((p, i) => (i === index ? { x: nextX, y: next.y } : p));
    draftRef.current = updated;
    movedRef.current = true;
    setDraft(updated);
  };

  const commitDrag = () => {
    if (dragIndexRef.current !== null && draftRef.current && movedRef.current) onChange(sortPoints(draftRef.current));
    dragIndexRef.current = null;
    draftRef.current = null;
    movedRef.current = false;
    setDraft(null);
  };

  const addPoint = (e: React.PointerEvent) => {
    if (dragIndexRef.current !== null) return;
    const { x, y } = coordsFromEvent(e);
    onChange(sortPoints([...points, fromSvg(x, y)]));
  };

  const removePoint = (index: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (index === 0 || index === sorted.length - 1) return;
    onChange(sorted.filter((_, i) => i !== index));
  };

  // Keyboard path: arrows move (Shift = coarse), Delete removes a middle
  // point, +/Insert adds a midpoint toward the next point. One commit per key.
  const onPointKeyDown = (index: number) => (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.01;
    const p = sorted[index];
    const isEndpoint = index === 0 || index === sorted.length - 1;
    let moved: CurvePoint;
    switch (e.key) {
      case 'ArrowUp': moved = { x: p.x, y: clamp01(p.y + step) }; break;
      case 'ArrowDown': moved = { x: p.x, y: clamp01(p.y - step) }; break;
      case 'ArrowLeft':
      case 'ArrowRight':
        if (isEndpoint) return;
        moved = { x: clampX(sorted, index, p.x + (e.key === 'ArrowRight' ? step : -step)), y: p.y };
        break;
      case 'Delete':
      case 'Backspace':
        if (isEndpoint) return;
        e.preventDefault();
        onChange(sorted.filter((_, i) => i !== index));
        return;
      case '+':
      case 'Insert': {
        const q = sorted[index + 1];
        if (!q) return;
        e.preventDefault();
        onChange(sortPoints([...sorted, { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }]));
        return;
      }
      default:
        return;
    }
    e.preventDefault();
    onChange(sorted.map((pt, i) => (i === index ? moved : pt)));
  };

  const path = sorted.map(toSvg).map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <svg ref={svgRef} width={SIZE} height={SIZE} className="bg-base-100 border border-base-content/10 touch-none cursor-crosshair"
      role="group" aria-label="Curve editor"
      onPointerDown={addPoint} onPointerMove={onPointerMove} onPointerUp={commitDrag}>
      <path d={`M0,${SIZE} L${SIZE},0`} className="text-base-content/10" stroke="currentColor" strokeDasharray="2,2" />
      <path d={path} className="text-primary" stroke="currentColor" fill="none" strokeWidth={1.5} />
      {sorted.map((p, i) => {
        const c = toSvg(p);
        return (
          <circle key={i} cx={c.x} cy={c.y} r={4} tabIndex={0} role="button"
            className="fill-primary cursor-pointer outline-none focus-visible:stroke-base-content focus-visible:[stroke-width:2]"
            aria-label={`Curve point ${i + 1}: in ${Math.round(p.x * 100)}%, out ${Math.round(p.y * 100)}%`}
            aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Delete Insert"
            onPointerDown={startDrag(i)} onDoubleClick={removePoint(i)} onKeyDown={onPointKeyDown(i)} />
        );
      })}
    </svg>
  );
};

export default CurveEditor;
