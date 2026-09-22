// ─── Kollektiv Image Editor — Tool Header ──────────────────────────────────
// 36px context-sensitive row below the toolbar. Renders controls for the
// active tool — brush/eraser get functional sliders wired to EditorStore's
// BrushSettings; every other tool shows a brief usage hint (M1 scope).

import React, { useSyncExternalStore } from 'react';
import { dispatch, getSnapshot, subscribe } from '../core/store';
import type { ToolId } from '../core/types';

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

const ToolHeader: React.FC = () => {
  const activeTool = useSyncExternalStore(subscribe, () => getSnapshot().activeTool);

  return (
    <div className="h-9 flex-shrink-0 flex items-center bg-base-100/85 backdrop-blur-md border-b border-base-content/5 overflow-x-auto">
      {activeTool === 'brush' || activeTool === 'eraser' ? (
        <BrushControls />
      ) : (
        <span className="px-3 text-[10px] font-mono text-base-content/50 uppercase tracking-wide truncate">
          {TOOL_HINTS[activeTool] ?? 'No options for this tool'}
        </span>
      )}
    </div>
  );
};

export default ToolHeader;
