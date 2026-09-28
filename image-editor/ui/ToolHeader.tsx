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
import { GradientTool } from '../core/gradient/GradientTool';
import { wandSettings } from '../core/selection/FloodFill';
import type { ToolId } from '../core/types';

const TOOL_HINTS: Partial<Record<ToolId, string>> = {
  move: 'Move: drag to reposition the active layer',
  'marquee-rect': 'Marquee: drag to select a rectangular region',
  'lasso-freehand': 'Lasso: drag to draw a freehand selection',
  'lasso-poly': 'Polygon Lasso: click to place points, double-click to close',
  'magic-wand': 'Magic Wand: click to select similar-colored pixels',
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
  <label className="flex items-center gap-1.5 text-xs font-mono text-base-content/70 whitespace-nowrap">
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
    return <span className="px-3 text-xs font-mono text-base-content/70">Select a layer to transform</span>;
  }
  const t = layer.transform;
  const setW = (v: number) => dispatch({ type: 'UPDATE_LAYER', layerId: layer.id, patch: { transform: { ...t, size: { ...t.size, width: Math.max(1, v) } } } });
  const setH = (v: number) => dispatch({ type: 'UPDATE_LAYER', layerId: layer.id, patch: { transform: { ...t, size: { ...t.size, height: Math.max(1, v) } } } });
  const setRot = (v: number) => dispatch({ type: 'UPDATE_LAYER', layerId: layer.id, patch: { transform: { ...t, rotation: v } } });

  return (
    <div className="flex items-center gap-3 px-3">
      <label className="flex items-center gap-1 text-xs font-mono text-base-content/70">
        W <input type="number" className="w-16 h-6 bg-transparent border border-base-content/20 px-1.5 text-right text-xs font-mono" value={Math.round(t.size.width)} onChange={e => setW(Number(e.target.value))} />
      </label>
      <label className="flex items-center gap-1 text-xs font-mono text-base-content/70">
        H <input type="number" className="w-16 h-6 bg-transparent border border-base-content/20 px-1.5 text-right text-xs font-mono" value={Math.round(t.size.height)} onChange={e => setH(Number(e.target.value))} />
      </label>
      <label className="flex items-center gap-1 text-xs font-mono text-base-content/70">
        ° <input type="number" className="w-14 h-6 bg-transparent border border-base-content/20 px-1.5 text-right text-xs font-mono" value={Math.round(t.rotation)} onChange={e => setRot(Number(e.target.value))} />
      </label>
      <div className="h-4 w-px bg-base-content/10" />
      <button type="button" className="text-xs font-mono text-base-content/70 hover:text-primary h-6 px-2 border border-base-content/15 hover:border-primary" onClick={() => activeLayerId && TransformEngine.flipHorizontal(activeLayerId)}>↔ Flip H</button>
      <button type="button" className="text-xs font-mono text-base-content/70 hover:text-primary h-6 px-2 border border-base-content/15 hover:border-primary" onClick={() => activeLayerId && TransformEngine.flipVertical(activeLayerId)}>↕ Flip V</button>
      <button type="button" className="text-xs font-mono text-base-content/70 hover:text-primary h-6 px-2 border border-base-content/15 hover:border-primary" onClick={() => activeLayerId && TransformEngine.resetRotation(activeLayerId)}>Reset °</button>
    </div>
  );
};

/** Rect ↔ Ellipse segmented toggle for tools that share a rail slot. */
const VariantToggle: React.FC<{ options: { tool: ToolId; label: string }[] }> = ({ options }) => {
  const activeTool = useSyncExternalStore(subscribe, () => getSnapshot().activeTool);
  return (
    <div className="flex border border-base-content/20">
      {options.map(({ tool, label }) => (
        <button key={tool} type="button" aria-pressed={activeTool === tool}
          className={`h-6 px-2.5 text-xs font-mono uppercase ${activeTool === tool ? 'bg-primary/10 text-primary' : 'text-base-content/60 hover:text-primary'}`}
          onClick={() => dispatch({ type: 'SET_ACTIVE_TOOL', tool })}>
          {label}
        </button>
      ))}
    </div>
  );
};

// ─── Selection controls ────────────────────────────────────────────────────

const SelectionControls: React.FC = () => {
  const hasSelection = useSyncExternalStore(subscribe, () => getSnapshot().selection !== null);
  const activeTool = useSyncExternalStore(subscribe, () => getSnapshot().activeTool);
  const isMarquee = activeTool === 'marquee-rect' || activeTool === 'marquee-ellipse';
  return (
    <div className="flex items-center gap-3 px-3">
      {isMarquee && (
        <VariantToggle options={[{ tool: 'marquee-rect', label: 'Rect' }, { tool: 'marquee-ellipse', label: 'Ellipse' }]} />
      )}
      <span className="text-xs font-mono text-base-content/70">Drag to select</span>
      {hasSelection && (
        <button type="button" className="text-xs font-mono text-base-content/70 hover:text-primary h-6 border border-base-content/15 hover:border-primary px-2" onClick={() => SelectionEngine.deselect()}>
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
      <label className="flex items-center gap-1 text-xs font-mono text-base-content/70">
        Family
        <input type="text" className="w-28 h-6 bg-transparent border border-base-content/20 px-1.5 text-xs font-mono"
          defaultValue={s.fontFamily}
          onBlur={e => { TypeTool.updateSettings({ fontFamily: e.target.value }); update(); }} />
      </label>
      <label className="flex items-center gap-1 text-xs font-mono text-base-content/70">
        Size
        <input type="number" className="w-14 h-6 bg-transparent border border-base-content/20 px-1.5 text-right text-xs font-mono"
          min={6} max={512} defaultValue={s.fontSize}
          onBlur={e => { TypeTool.updateSettings({ fontSize: Number(e.target.value) }); update(); }} />
      </label>
      <label className="flex items-center gap-1 text-xs font-mono text-base-content/70">
        Color
        <input type="color" className="w-7 h-5 border-none bg-transparent cursor-pointer"
          defaultValue={s.color}
          onInput={e => { TypeTool.updateSettings({ color: (e.target as HTMLInputElement).value }); update(); }} />
      </label>
      <label className="flex items-center gap-1 text-xs font-mono text-base-content/70">
        Weight
        <select className="bg-transparent border border-base-content/20 text-xs font-mono"
          defaultValue={String(s.fontWeight)}
          onChange={e => { TypeTool.updateSettings({ fontWeight: Number(e.target.value) }); update(); }}>
          <option value="300">Light</option>
          <option value="400">Regular</option>
          <option value="700">Bold</option>
          <option value="900">Black</option>
        </select>
      </label>
      <span className="text-xs font-mono text-base-content/35">Click canvas to place text · Ctrl+Enter to confirm</span>
    </div>
  );
};

// ─── Shape controls ───────────────────────────────────────────────────────

const ShapeControls: React.FC = () => {
  const colors = useSyncExternalStore(subscribe, () => getSnapshot().colors);

  return (
    <div className="flex items-center gap-3 px-3">
      <VariantToggle options={[{ tool: 'shape-rect', label: 'Rect' }, { tool: 'shape-ellipse', label: 'Ellipse' }]} />
      <span className="text-xs font-mono text-base-content/70">Drag to draw</span>
      <label className="flex items-center gap-1 text-xs font-mono text-base-content/70">
        Fill
        <input type="color" className="w-7 h-5 border-none bg-transparent cursor-pointer"
          value={colors.foreground}
          onChange={e => dispatch({ type: 'SET_COLORS', colors: { foreground: e.target.value } })} />
      </label>
    </div>
  );
};

// ─── Wand controls ────────────────────────────────────────────────────────

const WandControls: React.FC = () => {
  // wandSettings is module state (read by the viewport on click); local
  // re-render only, so the controls survive tool switches without drifting.
  const [, forceUpdate] = React.useState(0);
  const set = (patch: Partial<typeof wandSettings>) => { Object.assign(wandSettings, patch); forceUpdate(n => n + 1); };
  const hasSelection = useSyncExternalStore(subscribe, () => getSnapshot().selection !== null);
  return (
    <div className="flex items-center gap-4 px-3">
      <Slider label="Tolerance" value={wandSettings.tolerance} min={0} max={255} onChange={v => set({ tolerance: v })} />
      <label className="flex items-center gap-1.5 text-xs font-mono text-base-content/70 whitespace-nowrap">
        <input type="checkbox" className="checkbox checkbox-xs" checked={wandSettings.contiguous}
          onChange={e => set({ contiguous: e.target.checked })} /> Contiguous
      </label>
      <label className="flex items-center gap-1.5 text-xs font-mono text-base-content/70 whitespace-nowrap">
        <input type="checkbox" className="checkbox checkbox-xs" checked={wandSettings.sampleAllLayers}
          onChange={e => set({ sampleAllLayers: e.target.checked })} /> Sample all layers
      </label>
      {hasSelection && (
        <button type="button" className="text-xs font-mono text-base-content/70 hover:text-primary h-6 border border-base-content/15 hover:border-primary px-2" onClick={() => SelectionEngine.deselect()}>
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
      <span className="text-xs font-mono text-base-content/70">Drag to define gradient direction</span>
      <div className="flex border border-base-content/20">
        {(['linear', 'radial'] as const).map(k => (
          <button key={k} type="button"
            className={`h-6 px-2.5 text-xs font-mono uppercase ${kind === k ? 'bg-primary/10 text-primary' : 'text-base-content/60 hover:text-primary'}`}
            onClick={() => { GradientTool.setKind(k); forceUpdate(n => n + 1); }}>
            {k}
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── Crop controls ────────────────────────────────────────────────────────

const CropControls: React.FC = () => {
  const pending = useSyncExternalStore(subscribe, () => getSnapshot().pendingCrop);
  if (!pending) {
    return <span className="px-3 text-xs font-mono text-base-content/70">Crop: drag a rectangle on the canvas</span>;
  }
  const btn = 'text-xs font-mono h-6 px-2 border';
  return (
    <div className="flex items-center gap-3 px-3">
      <span className="text-xs font-mono text-base-content/70">
        {Math.round(pending.width)} × {Math.round(pending.height)}px
      </span>
      <button type="button" className={`${btn} border-primary text-primary hover:bg-primary/10`} onClick={() => SelectionEngine.applyCrop()}>
        Apply (Enter)
      </button>
      <button type="button" className={`${btn} border-base-content/15 text-base-content/60 hover:text-primary hover:border-primary`} onClick={() => SelectionEngine.cancelCrop()}>
        Cancel (Esc)
      </button>
    </div>
  );
};

// ─── ToolHeader ────────────────────────────────────────────────────────────

const ToolHeader: React.FC = () => {
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
        <WandControls />
      ) : activeTool === 'crop' ? (
        <CropControls />
      ) : activeTool === 'gradient' ? (
        <GradientControls />
      ) : (
        <span className="px-3 text-xs font-mono text-base-content/70 uppercase tracking-wide truncate">
          {TOOL_HINTS[activeTool] ?? 'No options for this tool'}
        </span>
      )}
    </div>
  );
};

export default ToolHeader;
