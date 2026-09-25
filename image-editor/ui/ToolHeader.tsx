// ─── Kollektiv Image Editor — Tool Header ──────────────────────────────────
// 36px context-sensitive row below the toolbar. Renders controls for the
// active tool — brush/eraser get functional sliders wired to EditorStore's
// BrushSettings; every other tool shows a brief usage hint (M1 scope).

import React, { useSyncExternalStore } from 'react';
import { dispatch, getSnapshot, subscribe } from '../core/store';
import { findLayerById } from '../core/layers/layerTree';
import { TransformEngine } from '../core/transform/TransformEngine';
import { SelectionEngine } from '../core/selection/SelectionEngine';
import { TypeTool } from '../core/text/TypeTool';
import { ShapeTool } from '../core/shape/ShapeTool';
import { GradientTool } from '../core/gradient/GradientTool';
import type { ToolId } from '../core/types';
import type { CanvasViewportHandle } from './CanvasViewport';

// CanvasViewportHandle is used by WandControls to update tolerance — passed as a prop
interface ToolHeaderProps {
  viewportRef?: React.RefObject<CanvasViewportHandle | null>;
}

const TOOL_HINTS: Partial<Record<ToolId, string>> = {
  move: 'Move: drag to reposition the active layer',
  'marquee-rect': 'Marquee: drag to select a rectangular region',
  'lasso-freehand': 'Lasso: drag to draw a freehand selection',
  'lasso-poly': 'Polygon Lasso: click to place points, double-click to close',
  'magic-wand': 'Magic Wand: click to select similar-colored pixels',
  crop: 'Crop: drag handles, press Enter to apply',
  'clone-stamp': 'Clone Stamp: Alt+click to set source, then drag to paint',
  gradient: 'Gradient: drag to draw a linear gradient',
  'shape-rect': 'Shape: drag to draw a rectangle',
  type: 'Type: click on the canvas to place a text layer',
  eyedropper: 'Eyedropper: click to sample the foreground color',
  hand: 'Hand: drag to pan the canvas',
  zoom: 'Zoom: click to zoom in, Alt+click to zoom out',
};

const Slider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, step = 1, suffix = '', onChange }) => (
  <label className="flex items-center gap-1.5 text-2xs font-mono text-base-content/60 whitespace-nowrap">
    {label}
    <input
      type="range"
      className="range range-xs range-primary w-24"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
    <span className="w-9 text-right text-base-content/80">{Math.round(value)}{suffix}</span>
  </label>
);

const BrushControls: React.FC = () => {
  const brush = useSyncExternalStore(subscribe, () => getSnapshot().brush);

  return (
    <div className="flex items-center gap-4 px-3">
      <Slider
        label="Size"
        value={brush.size}
        min={1}
        max={500}
        suffix="px"
        onChange={(size) => dispatch({ type: 'SET_BRUSH', brush: { size } })}
      />
      <Slider
        label="Hardness"
        value={brush.hardness * 100}
        min={0}
        max={100}
        suffix="%"
        onChange={(hardness) => dispatch({ type: 'SET_BRUSH', brush: { hardness: hardness / 100 } })}
      />
      <Slider
        label="Opacity"
        value={brush.opacity}
        min={0}
        max={100}
        suffix="%"
        onChange={(opacity) => dispatch({ type: 'SET_BRUSH', brush: { opacity } })}
      />
      <Slider
        label="Flow"
        value={brush.flow}
        min={0}
        max={100}
        suffix="%"
        onChange={(flow) => dispatch({ type: 'SET_BRUSH', brush: { flow } })}
      />
    </div>
  );
};

// ─── Transform controls ────────────────────────────────────────────────────

const TransformControls: React.FC = () => {
  // Two separate calls, not one object-returning selector: useSyncExternalStore
  // compares snapshots by reference on every render, and a `() => ({...})`
  // selector returns a new object every call — an infinite render loop
  // (React error #185), not just a wasted re-render.
  const activeLayerId = useSyncExternalStore(subscribe, () => getSnapshot().activeLayerId);
  const doc = useSyncExternalStore(subscribe, () => getSnapshot().document);
  // Text and shape layers transform like image layers (review H9 — the old
  // image-only guard made them immovable from the header too).
  const layer = doc && activeLayerId ? findLayerById(doc.layers, activeLayerId) : undefined;
  if (!layer) {
    return <span className="px-3 text-2xs font-mono text-base-content/50">Select a layer to transform</span>;
  }
  const t = layer.transform;
  const setW = (v: number) => dispatch({ type: 'UPDATE_LAYER', layerId: layer.id, patch: { transform: { ...t, size: { ...t.size, width: Math.max(1, v) } } } });
  const setH = (v: number) => dispatch({ type: 'UPDATE_LAYER', layerId: layer.id, patch: { transform: { ...t, size: { ...t.size, height: Math.max(1, v) } } } });
  const setRot = (v: number) => dispatch({ type: 'UPDATE_LAYER', layerId: layer.id, patch: { transform: { ...t, rotation: v } } });

  return (
    <div className="flex items-center gap-3 px-3">
      <label className="flex items-center gap-1 text-2xs font-mono text-base-content/60">
        W <input type="number" className="w-16 bg-transparent border border-base-content/20 px-1 text-right text-2xs font-mono" value={Math.round(t.size.width)} onChange={e => setW(Number(e.target.value))} />
      </label>
      <label className="flex items-center gap-1 text-2xs font-mono text-base-content/60">
        H <input type="number" className="w-16 bg-transparent border border-base-content/20 px-1 text-right text-2xs font-mono" value={Math.round(t.size.height)} onChange={e => setH(Number(e.target.value))} />
      </label>
      <label className="flex items-center gap-1 text-2xs font-mono text-base-content/60">
        ° <input type="number" className="w-14 bg-transparent border border-base-content/20 px-1 text-right text-2xs font-mono" value={Math.round(t.rotation)} onChange={e => setRot(Number(e.target.value))} />
      </label>
      <div className="h-4 w-px bg-base-content/10" />
      <button type="button" className="text-2xs font-mono text-base-content/60 hover:text-primary px-1 border border-base-content/15 hover:border-primary" onClick={() => activeLayerId && TransformEngine.flipHorizontal(activeLayerId)}>↔ Flip H</button>
      <button type="button" className="text-2xs font-mono text-base-content/60 hover:text-primary px-1 border border-base-content/15 hover:border-primary" onClick={() => activeLayerId && TransformEngine.flipVertical(activeLayerId)}>↕ Flip V</button>
      <button type="button" className="text-2xs font-mono text-base-content/60 hover:text-primary px-1 border border-base-content/15 hover:border-primary" onClick={() => activeLayerId && TransformEngine.resetRotation(activeLayerId)}>Reset °</button>
    </div>
  );
};

// ─── Selection controls ────────────────────────────────────────────────────

const SelectionControls: React.FC = () => {
  const hasSelection = useSyncExternalStore(subscribe, () => getSnapshot().selection !== null);
  return (
    <div className="flex items-center gap-3 px-3">
      <span className="text-2xs font-mono text-base-content/50">Drag to select · Hold Shift to add</span>
      {hasSelection && (
        <button type="button" className="text-2xs font-mono text-base-content/60 hover:text-primary border border-base-content/15 hover:border-primary px-2 py-0.5" onClick={() => SelectionEngine.deselect()}>
          Deselect (Ctrl+D)
        </button>
      )}
    </div>
  );
};

// ─── Type controls ────────────────────────────────────────────────────────

const TypeControls: React.FC = () => {
  const s = TypeTool.settings;
  const [, forceUpdate] = React.useState(0);
  const update = () => forceUpdate(n => n + 1);

  return (
    <div className="flex items-center gap-3 px-3">
      <label className="flex items-center gap-1 text-2xs font-mono text-base-content/60">
        Family
        <input type="text" className="w-28 bg-transparent border border-base-content/20 px-1 text-2xs font-mono"
          defaultValue={s.fontFamily}
          onBlur={e => { TypeTool.updateSettings({ fontFamily: e.target.value }); update(); }} />
      </label>
      <label className="flex items-center gap-1 text-2xs font-mono text-base-content/60">
        Size
        <input type="number" className="w-14 bg-transparent border border-base-content/20 px-1 text-right text-2xs font-mono"
          min={6} max={512} defaultValue={s.fontSize}
          onBlur={e => { TypeTool.updateSettings({ fontSize: Number(e.target.value) }); update(); }} />
      </label>
      <label className="flex items-center gap-1 text-2xs font-mono text-base-content/60">
        Color
        <input type="color" className="w-7 h-5 border-none bg-transparent cursor-pointer"
          defaultValue={s.color}
          onInput={e => { TypeTool.updateSettings({ color: (e.target as HTMLInputElement).value }); update(); }} />
      </label>
      <label className="flex items-center gap-1 text-2xs font-mono text-base-content/60">
        Weight
        <select className="bg-transparent border border-base-content/20 text-2xs font-mono"
          defaultValue={String(s.fontWeight)}
          onChange={e => { TypeTool.updateSettings({ fontWeight: Number(e.target.value) }); update(); }}>
          <option value="300">Light</option>
          <option value="400">Regular</option>
          <option value="700">Bold</option>
          <option value="900">Black</option>
        </select>
      </label>
      <span className="text-2xs font-mono text-base-content/35">Click canvas to place text · Ctrl+Enter to confirm</span>
    </div>
  );
};

// ─── Shape controls ───────────────────────────────────────────────────────

const ShapeControls: React.FC = () => {
  const colors = useSyncExternalStore(subscribe, () => getSnapshot().colors);
  const kind = ShapeTool.getKind();

  return (
    <div className="flex items-center gap-3 px-3">
      <span className="text-2xs font-mono text-base-content/50">
        {kind === 'rect' ? 'Rectangle' : 'Ellipse'} · Drag to draw
      </span>
      <label className="flex items-center gap-1 text-2xs font-mono text-base-content/60">
        Fill
        <input type="color" className="w-7 h-5 border-none bg-transparent cursor-pointer"
          value={colors.foreground}
          onChange={e => dispatch({ type: 'SET_COLORS', colors: { foreground: e.target.value } })} />
      </label>
    </div>
  );
};

// ─── Wand controls ────────────────────────────────────────────────────────

const WandControls: React.FC<{ viewportRef?: React.RefObject<CanvasViewportHandle | null> }> = ({ viewportRef }) => {
  const [tolerance, setTolerance] = React.useState(32);
  const hasSelection = useSyncExternalStore(subscribe, () => getSnapshot().selection !== null);
  return (
    <div className="flex items-center gap-3 px-3">
      <label className="flex items-center gap-2 text-2xs font-mono text-base-content/60">
        Tolerance
        <input type="range" className="range range-xs range-primary w-24" min={0} max={255} value={tolerance}
          onChange={e => {
            const v = Number(e.target.value);
            setTolerance(v);
            viewportRef?.current?.setWandTolerance(v);
          }} />
        <span className="w-8 text-right">{tolerance}</span>
      </label>
      <label className="flex items-center gap-1 text-2xs font-mono text-base-content/60">
        <input type="checkbox" className="checkbox checkbox-xs" defaultChecked /> Contiguous
      </label>
      {hasSelection && (
        <button type="button" className="text-2xs font-mono text-base-content/60 hover:text-primary border border-base-content/15 hover:border-primary px-2 py-0.5" onClick={() => SelectionEngine.deselect()}>
          Deselect
        </button>
      )}
    </div>
  );
};

// ─── Gradient controls ────────────────────────────────────────────────────

const GradientControls: React.FC = () => {
  const [, forceUpdate] = React.useState(0);
  const kind = GradientTool.getKind();
  return (
    <div className="flex items-center gap-3 px-3">
      <span className="text-2xs font-mono text-base-content/50">Drag to define gradient direction</span>
      <div className="flex border border-base-content/20">
        {(['linear', 'radial'] as const).map(k => (
          <button key={k} type="button"
            className={`px-2 py-0.5 text-2xs font-mono uppercase ${kind === k ? 'bg-primary/10 text-primary' : 'text-base-content/60 hover:text-primary'}`}
            onClick={() => { GradientTool.setKind(k); forceUpdate(n => n + 1); }}>
            {k}
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── ToolHeader ────────────────────────────────────────────────────────────

const ToolHeader: React.FC<ToolHeaderProps> = ({ viewportRef }) => {
  const activeTool = useSyncExternalStore(subscribe, () => getSnapshot().activeTool);

  return (
    <div className="h-9 flex-shrink-0 flex items-center bg-base-100/85 backdrop-blur-md border-b border-base-content/5 overflow-x-auto">
      {(activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'clone-stamp') ? (
        <BrushControls />
      ) : activeTool === 'move' ? (
        <TransformControls />
      ) : (activeTool === 'marquee-rect' || activeTool === 'marquee-ellipse' || activeTool === 'lasso-freehand' || activeTool === 'lasso-poly') ? (
        <SelectionControls />
      ) : activeTool === 'type' ? (
        <TypeControls />
      ) : (activeTool === 'shape-rect' || activeTool === 'shape-ellipse') ? (
        <ShapeControls />
      ) : activeTool === 'magic-wand' ? (
        <WandControls viewportRef={viewportRef} />
      ) : activeTool === 'gradient' ? (
        <GradientControls />
      ) : (
        <span className="px-3 text-2xs font-mono text-base-content/50 uppercase tracking-wide truncate">
          {TOOL_HINTS[activeTool] ?? 'No options for this tool'}
        </span>
      )}
    </div>
  );
};

export default ToolHeader;
