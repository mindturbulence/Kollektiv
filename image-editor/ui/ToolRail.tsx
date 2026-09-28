// ─── Kollektiv Image Editor — Tool Rail ────────────────────────────────────
// 44px-wide left column of tool buttons. Only Move/Hand/Zoom are functionally
// wired to the canvas in M1 — every other button sets activeTool so the UI
// is fully navigable, but the underlying tool behaviors land in later
// milestones.

import React, { useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { dispatch, getSnapshot, subscribe } from '../core/store';
import { useEditorMode, QUICK_TOOLS } from './editorMode';
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
  /** Sub-modes sharing this slot; clicking the active slot cycles them. */
  variants?: ToolId[];
}

/** Rail slots with sub-modes (frontend plan §3: Shift+M / Shift+U cycle). */
export const TOOL_VARIANTS: ToolId[][] = [
  ['marquee-rect', 'marquee-ellipse'],
  ['shape-rect', 'shape-ellipse'],
];

/** Next variant in the active tool's slot, or null when the tool has none. */
export function nextVariant(tool: ToolId): ToolId | null {
  const group = TOOL_VARIANTS.find((g) => g.includes(tool));
  return group ? group[(group.indexOf(tool) + 1) % group.length] : null;
}

const TOOLS: ToolDef[] = [
  { tool: 'move', icon: MoveIcon, label: 'Move', shortcut: 'V' },
  { tool: 'marquee-rect', icon: SquareDashedIcon, label: 'Marquee', shortcut: 'M · Shift+M cycles', variants: TOOL_VARIANTS[0] },
  { tool: 'lasso-freehand', icon: LassoIcon, label: 'Lasso', shortcut: 'L' },
  { tool: 'lasso-poly', icon: LassoPolyIcon, label: 'Polygon Lasso', shortcut: 'Shift+L' },
  { tool: 'magic-wand', icon: WandIcon, label: 'Magic Wand', shortcut: 'W' },
  { tool: 'crop', icon: CropIcon, label: 'Crop', shortcut: 'C' },
  { tool: 'brush', icon: BrushIcon, label: 'Brush', shortcut: 'B' },
  { tool: 'eraser', icon: EraserIcon, label: 'Eraser', shortcut: 'E' },
  { tool: 'clone-stamp', icon: StampIcon, label: 'Clone Stamp', shortcut: 'S' },
  { tool: 'gradient', icon: GradientIcon, label: 'Gradient', shortcut: 'G' },
  { tool: 'shape-rect', icon: ShapeToolIcon, label: 'Shape', shortcut: 'U · Shift+U cycles', variants: TOOL_VARIANTS[1] },
  { tool: 'type', icon: TypeToolIcon, label: 'Type', shortcut: 'T' },
  { tool: 'eyedropper', icon: EyedropperToolIcon, label: 'Eyedropper', shortcut: 'I' },
  { tool: 'hand', icon: HandToolIcon, label: 'Hand', shortcut: 'H' },
  { tool: 'zoom', icon: ZoomToolIcon, label: 'Zoom', shortcut: 'Z' },
];

interface TipState { text: string; top: number; left: number }

/** The rail scrolls (overflow clips a CSS tooltip), so the tooltip is
 *  portalled to <body> and positioned beside the hovered button. */
const RailTooltip: React.FC<{ tip: TipState | null }> = ({ tip }) =>
  tip && typeof document !== 'undefined'
    ? createPortal(
        <div
          role="tooltip"
          className="fixed z-dropdown -translate-y-1/2 pointer-events-none whitespace-nowrap px-2 py-1 text-xs bg-neutral text-neutral-content shadow-lg"
          style={{ top: tip.top, left: tip.left }}
        >
          {tip.text}
        </div>,
        document.body,
      )
    : null;

const ToolButton: React.FC<{ def: ToolDef; activeTool: ToolId; onTip: (tip: TipState | null) => void }> = ({ def, activeTool, onTip }) => {
  const Icon = def.icon;
  const active = def.variants ? def.variants.includes(activeTool) : activeTool === def.tool;
  const showTip = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    onTip({ text: `${def.label} (${def.shortcut})`, top: r.top + r.height / 2, left: r.right + 6 });
  };
  return (
    <button
      type="button"
      className={`w-11 h-11 flex-shrink-0 flex items-center justify-center border-l-2 transition-colors ${
        active
          ? 'bg-primary/10 text-primary border-primary'
          : 'border-transparent text-base-content/60 hover:text-base-content hover:bg-base-content/5'
      }`}
      onMouseEnter={(e) => showTip(e.currentTarget)}
      onFocus={(e) => showTip(e.currentTarget)}
      onMouseLeave={() => onTip(null)}
      onBlur={() => onTip(null)}
      aria-label={def.label}
      aria-keyshortcuts={def.shortcut.split(' ')[0]}
      aria-pressed={active}
      onClick={() => dispatch({
        type: 'SET_ACTIVE_TOOL',
        tool: active && def.variants ? (nextVariant(activeTool) ?? def.tool) : def.tool,
      })}
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
  const [tip, setTip] = useState<TipState | null>(null);
  const mode = useEditorMode();
  const tools = mode === 'quick' ? TOOLS.filter(t => QUICK_TOOLS.has(t.tool)) : TOOLS;

  return (
    <div className="w-11 flex-shrink-0 flex flex-col items-stretch bg-base-100/85 backdrop-blur-md border-r border-base-content/5 overflow-y-auto overflow-x-hidden">
      <div className="flex flex-col items-stretch">
        {tools.map((def) => (
          <ToolButton key={def.tool} def={def} activeTool={activeTool} onTip={setTip} />
        ))}
      </div>
      <div className="flex-1" />
      <div className="sticky bottom-0 border-t border-base-content/5 bg-base-100/85 backdrop-blur-md">
        <FgBgSwatches />
      </div>
      <RailTooltip tip={tip} />
    </div>
  );
};

export default ToolRail;
