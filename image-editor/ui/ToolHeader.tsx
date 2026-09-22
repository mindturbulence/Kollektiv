// ─── Kollektiv Image Editor — Tool Header ──────────────────────────────────
// 36px context-sensitive row below the toolbar. Renders controls for the
// active tool — brush/eraser get functional sliders wired to EditorStore's
// BrushSettings; every other tool shows a brief usage hint (M1 scope).

import React, { useSyncExternalStore } from 'react';
import { dispatch, getSnapshot, subscribe } from '../core/store';
import { TransformEngine } from '../core/transform/TransformEngine';
import { SelectionEngine } from '../core/selection/SelectionEngine';
import type { ToolId, ImageLayer } from '../core/types';

const TOOL_HINTS: Partial<Record<ToolId, string>> = {
  move: 'Move: drag to reposition the active layer',
  'marquee-rect': 'Marquee: drag to select a rectangular region',
  'lasso-freehand': 'Lasso: drag to draw a freehand selection',
  'magic-wand': 'Magic Wand: click to select similar-colored pixels',
  crop: 'Crop: drag handles, press Enter to apply',
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
  <label className="flex items-center gap-1.5 text-[10px] font-mono text-base-content/60 whitespace-nowrap">
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
  const { activeLayerId, document: doc } = useSyncExternalStore(subscribe, () => ({
    activeLayerId: getSnapshot().activeLayerId,
    document: getSnapshot().document,
  }));
  const layer = doc?.layers.find(l => l.id === activeLayerId) as ImageLayer | undefined;
  if (!layer || layer.type !== 'image') {
    return <span className="px-3 text-[10px] font-mono text-base-content/50">Select a layer to transform</span>;
  }
  const t = layer.transform;
  const setW = (v: number) => dispatch({ type: 'UPDATE_LAYER', layerId: layer.id, patch: { transform: { ...t, size: { ...t.size, width: Math.max(1, v) } } } });
  const setH = (v: number) => dispatch({ type: 'UPDATE_LAYER', layerId: layer.id, patch: { transform: { ...t, size: { ...t.size, height: Math.max(1, v) } } } });
  const setRot = (v: number) => dispatch({ type: 'UPDATE_LAYER', layerId: layer.id, patch: { transform: { ...t, rotation: v } } });

  return (
    <div className="flex items-center gap-3 px-3">
      <label className="flex items-center gap-1 text-[10px] font-mono text-base-content/60">
        W <input type="number" className="w-16 bg-transparent border border-base-content/20 px-1 text-right text-[10px] font-mono" value={Math.round(t.size.width)} onChange={e => setW(Number(e.target.value))} />
      </label>
      <label className="flex items-center gap-1 text-[10px] font-mono text-base-content/60">
        H <input type="number" className="w-16 bg-transparent border border-base-content/20 px-1 text-right text-[10px] font-mono" value={Math.round(t.size.height)} onChange={e => setH(Number(e.target.value))} />
      </label>
      <label className="flex items-center gap-1 text-[10px] font-mono text-base-content/60">
        ° <input type="number" className="w-14 bg-transparent border border-base-content/20 px-1 text-right text-[10px] font-mono" value={Math.round(t.rotation)} onChange={e => setRot(Number(e.target.value))} />
      </label>
      <div className="h-4 w-px bg-base-content/10" />
      <button type="button" className="text-[10px] font-mono text-base-content/60 hover:text-primary px-1 border border-base-content/15 hover:border-primary" onClick={() => activeLayerId && TransformEngine.flipHorizontal(activeLayerId)}>↔ Flip H</button>
      <button type="button" className="text-[10px] font-mono text-base-content/60 hover:text-primary px-1 border border-base-content/15 hover:border-primary" onClick={() => activeLayerId && TransformEngine.flipVertical(activeLayerId)}>↕ Flip V</button>
      <button type="button" className="text-[10px] font-mono text-base-content/60 hover:text-primary px-1 border border-base-content/15 hover:border-primary" onClick={() => activeLayerId && TransformEngine.resetRotation(activeLayerId)}>Reset °</button>
    </div>
  );
};

// ─── Selection controls ────────────────────────────────────────────────────

const SelectionControls: React.FC = () => {
  const hasSelection = useSyncExternalStore(subscribe, () => getSnapshot().selection !== null);
  return (
    <div className="flex items-center gap-3 px-3">
      <span className="text-[10px] font-mono text-base-content/50">Drag to select · Hold Shift to add</span>
      {hasSelection && (
        <button type="button" className="text-[10px] font-mono text-base-content/60 hover:text-primary border border-base-content/15 hover:border-primary px-2 py-0.5" onClick={() => SelectionEngine.deselect()}>
          Deselect (Ctrl+D)
        </button>
      )}
    </div>
  );
};

// ─── ToolHeader ────────────────────────────────────────────────────────────

const ToolHeader: React.FC = () => {
  const activeTool = useSyncExternalStore(subscribe, () => getSnapshot().activeTool);

  return (
    <div className="h-9 flex-shrink-0 flex items-center bg-base-100/85 backdrop-blur-md border-b border-base-content/5 overflow-x-auto">
      {(activeTool === 'brush' || activeTool === 'eraser') ? (
        <BrushControls />
      ) : activeTool === 'move' ? (
        <TransformControls />
      ) : (activeTool === 'marquee-rect' || activeTool === 'marquee-ellipse') ? (
        <SelectionControls />
      ) : (
        <span className="px-3 text-[10px] font-mono text-base-content/50 uppercase tracking-wide truncate">
          {TOOL_HINTS[activeTool] ?? 'No options for this tool'}
        </span>
      )}
    </div>
  );
};

export default ToolHeader;
