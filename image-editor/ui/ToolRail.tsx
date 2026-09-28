// ─── Kollektiv Image Editor — Tool Rail ────────────────────────────────────
// 44px-wide left column of tool buttons. Only Move/Hand/Zoom are functionally
// wired to the canvas in M1 — every other button sets activeTool so the UI
// is fully navigable, but the underlying tool behaviors land in later
// milestones.

import React, { useSyncExternalStore } from 'react';
import { dispatch, getSnapshot, subscribe } from '../core/store';
import type { ToolId } from '../core/types';
import {
  MoveIcon, SquareDashedIcon, LassoIcon, LassoPolyIcon, WandIcon, CropIcon, BrushIcon, EraserIcon,
  StampIcon, GradientIcon, ShapeToolIcon, TypeToolIcon, EyedropperToolIcon, HandToolIcon, ZoomToolIcon,
  ArrowsUpDownIcon, RefreshIcon,
} from '../../components/icons';

interface ToolDef {
  tool: ToolId;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  label: string;
  shortcut: string;
}

const TOOLS: ToolDef[] = [
  { tool: 'move', icon: MoveIcon, label: 'Move', shortcut: 'V' },
  { tool: 'marquee-rect', icon: SquareDashedIcon, label: 'Marquee', shortcut: 'M' },
  { tool: 'lasso-freehand', icon: LassoIcon, label: 'Lasso', shortcut: 'L' },
  { tool: 'lasso-poly', icon: LassoPolyIcon, label: 'Polygon Lasso', shortcut: 'Shift+L' },
  { tool: 'magic-wand', icon: WandIcon, label: 'Magic Wand', shortcut: 'W' },
  { tool: 'crop', icon: CropIcon, label: 'Crop', shortcut: 'C' },
  { tool: 'brush', icon: BrushIcon, label: 'Brush', shortcut: 'B' },
  { tool: 'eraser', icon: EraserIcon, label: 'Eraser', shortcut: 'E' },
  { tool: 'clone-stamp', icon: StampIcon, label: 'Clone Stamp', shortcut: 'S' },
  { tool: 'gradient', icon: GradientIcon, label: 'Gradient', shortcut: 'G' },
  { tool: 'shape-rect', icon: ShapeToolIcon, label: 'Shape', shortcut: 'U' },
  { tool: 'type', icon: TypeToolIcon, label: 'Type', shortcut: 'T' },
  { tool: 'eyedropper', icon: EyedropperToolIcon, label: 'Eyedropper', shortcut: 'I' },
  { tool: 'hand', icon: HandToolIcon, label: 'Hand', shortcut: 'H' },
  { tool: 'zoom', icon: ZoomToolIcon, label: 'Zoom', shortcut: 'Z' },
];

const ToolButton: React.FC<{ def: ToolDef; active: boolean }> = ({ def, active }) => {
  const Icon = def.icon;
  return (
    <button
      type="button"
      className={`tooltip tooltip-right w-11 h-11 flex-shrink-0 flex items-center justify-center border-l-2 transition-colors ${
        active
          ? 'bg-primary/10 text-primary border-primary'
          : 'border-transparent text-base-content/60 hover:text-base-content hover:bg-base-content/5'
      }`}
      data-tip={`${def.label} (${def.shortcut})`}
      aria-label={def.label}
      aria-pressed={active}
      onClick={() => dispatch({ type: 'SET_ACTIVE_TOOL', tool: def.tool })}
    >
      <Icon className="w-5 h-5" />
    </button>
  );
};

const FgBgSwatches: React.FC = () => {
  const colors = useSyncExternalStore(subscribe, () => getSnapshot().colors);
  const colorPickerTarget = useSyncExternalStore(subscribe, () => getSnapshot().colorPickerTarget);

  const swapColors = () => dispatch({
    type: 'SET_COLORS',
    colors: { foreground: colors.background, background: colors.foreground },
  });
  const resetColors = () => dispatch({
    type: 'SET_COLORS',
    colors: { foreground: '#000000', background: '#ffffff' },
  });

  return (
    <div className="relative w-11 h-14 flex-shrink-0 flex items-center justify-center">
      <button
        type="button"
        className="absolute top-4 left-1 p-0.5 text-base-content/60 hover:text-base-content/80"
        aria-label="Reset to black/white"
        title="Reset to black/white (default colors)"
        onClick={resetColors}
      >
        <RefreshIcon className="w-2.5 h-2.5" />
      </button>
      <button
        type="button"
        className="absolute top-0 right-0 p-0.5 text-base-content/60 hover:text-base-content/80"
        aria-label="Swap foreground/background"
        title="Swap foreground/background"
        onClick={swapColors}
      >
        <ArrowsUpDownIcon className="w-2.5 h-2.5" />
      </button>
      <button
        type="button"
        className={`absolute top-5 left-1.5 w-5 h-5 rounded-sm border shadow-sm ${colorPickerTarget === 'background' ? 'border-primary ring-1 ring-primary' : 'border-base-content/30'}`}
        style={{ backgroundColor: colors.background }}
        aria-label="Background color"
        onClick={() => dispatch({ type: 'SET_COLOR_PICKER_TARGET', target: 'background' })}
      />
      <button
        type="button"
        className={`absolute bottom-1.5 right-1.5 w-5 h-5 rounded-sm border shadow-sm ${colorPickerTarget === 'foreground' ? 'border-primary ring-1 ring-primary' : 'border-base-content/30'}`}
        style={{ backgroundColor: colors.foreground }}
        aria-label="Foreground color"
        onClick={() => dispatch({ type: 'SET_COLOR_PICKER_TARGET', target: 'foreground' })}
      />
    </div>
  );
};

const ToolRail: React.FC = () => {
  const activeTool = useSyncExternalStore(subscribe, () => getSnapshot().activeTool);

  return (
    <div className="w-11 flex-shrink-0 flex flex-col items-stretch bg-base-100/85 backdrop-blur-md border-r border-base-content/5 overflow-y-auto overflow-x-hidden">
      <div className="flex flex-col items-stretch">
        {TOOLS.map((def) => (
          <ToolButton key={def.tool} def={def} active={activeTool === def.tool} />
        ))}
      </div>
      <div className="flex-1" />
      <div className="sticky bottom-0 border-t border-base-content/5 bg-base-100/85 backdrop-blur-md">
        <FgBgSwatches />
      </div>
    </div>
  );
};

export default ToolRail;
