// ─── Kollektiv Video Editor — Toolbar ────────────────────────────────────────
// 44px top bar: project name · undo/redo · select/razor · snapping · export.

import React from 'react';
import { dispatch } from '../core/store';
import type { EditorTool } from '../core/types';
import { useEditorSelector } from './hooks/useEditorState';
import { UndoIcon, RedoIcon, CursorIcon, ScissorsIcon, DownloadIcon } from '../../components/icons';

interface EditorToolbarProps {
  onExport: () => void;
}

const iconBtn = (enabled: boolean, active = false) =>
  `tooltip tooltip-bottom p-1.5 ${active ? 'text-primary bg-primary/10' : enabled ? 'text-base-content/70 hover:text-primary' : 'text-base-content/25 cursor-not-allowed'}`;

const TOOLS: Array<{ tool: EditorTool; label: string; Icon: typeof CursorIcon }> = [
  { tool: 'select', label: 'Select', Icon: CursorIcon },
  { tool: 'razor', label: 'Razor', Icon: ScissorsIcon },
];

const EditorToolbar: React.FC<EditorToolbarProps> = ({ onExport }) => {
  const name = useEditorSelector(s => s.project?.name ?? null);
  const isDirty = useEditorSelector(s => s.isDirty);
  const canUndo = useEditorSelector(s => s.canUndo);
  const canRedo = useEditorSelector(s => s.canRedo);
  const tool = useEditorSelector(s => s.tool);
  const snapping = useEditorSelector(s => s.snapping);
  const hasProject = name !== null;

  return (
    <div className="h-11 flex-shrink-0 flex items-center gap-3 px-3 bg-base-100/85 backdrop-blur-md border-b border-base-content/5">
      <span className="text-sm font-display text-base-content/85 truncate max-w-[16rem]">
        {name ?? 'No project'}
        {isDirty && <span className="text-base-content/60" aria-label="Unsaved changes"> •</span>}
      </span>

      <div className="flex-1" />

      <div className="flex items-center gap-0.5">
        <button type="button" className={iconBtn(canUndo)} data-tip="Undo" aria-label="Undo"
          disabled={!canUndo} onClick={() => dispatch({ type: 'undo' })}>
          <UndoIcon className="w-4 h-4" />
        </button>
        <button type="button" className={iconBtn(canRedo)} data-tip="Redo" aria-label="Redo"
          disabled={!canRedo} onClick={() => dispatch({ type: 'redo' })}>
          <RedoIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-0.5 border-l border-base-content/10 pl-3" role="group" aria-label="Timeline tool">
        {TOOLS.map(({ tool: t, label, Icon }) => (
          <button key={t} type="button" className={iconBtn(hasProject, tool === t)} data-tip={label} aria-label={label}
            aria-pressed={tool === t} disabled={!hasProject} onClick={() => dispatch({ type: 'setTool', tool: t })}>
            <Icon className="w-4 h-4" />
          </button>
        ))}
        <button type="button" aria-pressed={snapping} disabled={!hasProject}
          className={`ml-1 px-2 h-7 text-2xs font-mono uppercase tracking-widest border ${snapping ? 'border-primary text-primary bg-primary/10' : 'border-base-content/20 text-base-content/60 hover:border-base-content/40'}`}
          onClick={() => dispatch({ type: 'setSnapping', snapping: !snapping })}>
          Snap
        </button>
      </div>

      <div className="flex-1" />

      <button type="button" className="form-btn form-btn-primary rounded-none h-8 px-3 text-xs flex items-center gap-1.5"
        disabled={!hasProject} onClick={onExport}>
        <DownloadIcon className="w-3.5 h-3.5" />
        Export
      </button>
    </div>
  );
};

export default EditorToolbar;
