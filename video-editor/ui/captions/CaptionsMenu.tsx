// ─── Kollektiv Video Editor — Captions menu ──────────────────────────────────
// Toolbar entry: import an SRT file as text clips, or export the project's
// captions track back out to SRT.

import React, { useRef, useState } from 'react';
import { dispatch, getSnapshot } from '../../core/store';
import { captionsToEdit, clipsToCues } from '../../core/captions/clips';
import { parseSrt, serializeSrt } from '../../core/captions/srt';
import { useEditorSelector } from '../hooks/useEditorState';
import { TypeIcon, DownloadIcon, UploadIcon } from '../../../components/icons';

interface CaptionsMenuProps {
  onError: (message: string) => void;
}

const CaptionsMenu: React.FC<CaptionsMenuProps> = ({ onError }) => {
  const hasProject = useEditorSelector(s => s.project !== null);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const { project } = getSnapshot(); // re-read: dispatch may have changed it while awaiting
      if (!project) return;
      const { cues, skipped } = parseSrt(text);
      const action = captionsToEdit(project, cues);
      const addedCount = action?.type === 'batch' ? action.actions.filter(a => a.type === 'addClip').length : 0;
      if (!action || addedCount === 0) {
        onError(cues.length === 0 ? `No usable cues found in "${file.name}".` : 'All cues overlapped an existing captions clip.');
        return;
      }
      dispatch(action);
      const overlapSkipped = cues.length - addedCount;
      const notes: string[] = [];
      if (skipped.length > 0) notes.push(`${skipped.length} malformed`);
      if (overlapSkipped > 0) notes.push(`${overlapSkipped} overlapping`);
      if (notes.length > 0) onError(`Imported with ${notes.join(', ')} cue${addedCount === cues.length ? '' : 's'} skipped.`);
    } catch {
      onError(`Could not read "${file.name}".`);
    }
  };

  const handleExport = () => {
    const { project } = getSnapshot();
    if (!project) return;
    const cues = clipsToCues(project);
    if (cues.length === 0) {
      onError('No captions on a text track to export.');
      return;
    }
    const blob = new Blob([serializeSrt(cues)], { type: 'application/x-subrip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'captions.srt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Deferred: revoking synchronously can race the browser's download start.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="relative">
      <button type="button" className="tooltip tooltip-bottom p-1.5 text-base-content/70 hover:text-primary disabled:text-base-content/25"
        data-tip="Captions" aria-label="Captions" aria-haspopup="menu" aria-expanded={open}
        disabled={!hasProject} onClick={() => setOpen(o => !o)}>
        <TypeIcon className="w-4 h-4" />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-20 w-48 bg-base-100 border border-base-content/10 shadow-lg py-1"
          onMouseLeave={() => setOpen(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
          <button type="button"
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-base-content/80 hover:bg-base-content/5"
            onClick={() => { setOpen(false); inputRef.current?.click(); }}>
            <UploadIcon className="w-3.5 h-3.5" />
            Import SRT…
          </button>
          <button type="button"
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-base-content/80 hover:bg-base-content/5"
            onClick={() => { setOpen(false); handleExport(); }}>
            <DownloadIcon className="w-3.5 h-3.5" />
            Export SRT
          </button>
        </div>
      )}

      <input ref={inputRef} type="file" accept=".srt,text/plain" hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void handleImport(file);
        }} />
    </div>
  );
};

export default CaptionsMenu;
