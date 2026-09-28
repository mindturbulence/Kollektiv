// ─── Kollektiv Video Editor — Media Bin ──────────────────────────────────────
// Left panel: drop or pick files to import; drag an item onto the timeline or
// use "Add to timeline" to place it at the playhead.

import React, { useRef, useState } from 'react';
import { dispatch, getSnapshot } from '../core/store';
import type { MediaItem } from '../core/types';
import { useEditorSelector } from './hooks/useEditorState';
import { MEDIA_DRAG_MIME, createClipForMedia } from './placement';
import { FilmIcon, MusicNoteIcon, PhotoIcon, PlusIcon, UploadIcon } from '../../components/icons';

interface MediaBinProps {
  /** Null while the media engine is unavailable; importing is disabled then. */
  onImport: ((files: File[]) => void) | null;
  onError: (message: string) => void;
}

const ACCEPT = 'video/*,audio/*,image/*';

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export function addMediaToTimeline(item: MediaItem, onError: (message: string) => void): void {
  const { project, playhead } = getSnapshot();
  if (!project) return;
  const clip = createClipForMedia(project, item, playhead);
  if (!clip) {
    onError(`No unlocked ${item.kind === 'audio' ? 'audio' : 'video'} track for "${item.name}".`);
    return;
  }
  dispatch({ type: 'addClip', clip });
  dispatch({ type: 'select', clipIds: [clip.id] });
}

const KindIcon: React.FC<{ kind: MediaItem['kind'] }> = ({ kind }) => {
  const Icon = kind === 'audio' ? MusicNoteIcon : kind === 'image' ? PhotoIcon : FilmIcon;
  return <Icon className="w-5 h-5" />;
};

const MediaBin: React.FC<MediaBinProps> = ({ onImport, onError }) => {
  const media = useEditorSelector(s => s.project?.media);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    setIsDragOver(false);
    if (!onImport || !e.dataTransfer.files?.length) return;
    e.preventDefault();
    onImport(Array.from(e.dataTransfer.files));
  };

  return (
    <aside
      className={`w-60 flex-shrink-0 flex flex-col bg-base-200/60 border-r border-base-content/5 min-h-0 ${isDragOver ? 'ring-2 ring-inset ring-primary/60' : ''}`}
      aria-label="Media bin"
      onDragOver={(e) => {
        if (!onImport || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setIsDragOver(true);
      }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setIsDragOver(false); }}
      onDrop={handleDrop}
    >
      <header className="panel-header h-9 px-3 flex items-center">
        <h2 className="text-2xs font-display uppercase tracking-widest text-base-content/70">Media</h2>
        <div className="flex-1" />
        <button type="button" className="tooltip tooltip-bottom p-1 text-base-content/60 hover:text-primary disabled:text-base-content/25"
          data-tip="Import media" aria-label="Import media" disabled={!onImport} onClick={() => inputRef.current?.click()}>
          <UploadIcon className="w-4 h-4" />
        </button>
        <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (files.length && onImport) onImport(files);
          }} />
      </header>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {!media?.length ? (
          <button type="button" disabled={!onImport} onClick={() => inputRef.current?.click()}
            className="w-full h-32 flex flex-col items-center justify-center gap-2 border border-dashed border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary">
            <UploadIcon className="w-5 h-5" />
            <span className="text-2xs font-mono uppercase tracking-widest">
              {onImport ? 'Drop or pick files' : 'Media engine unavailable'}
            </span>
          </button>
        ) : media.map(item => (
          <div key={item.id} draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(MEDIA_DRAG_MIME, item.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            className="group flex items-center gap-2 p-1.5 border border-base-content/10 bg-base-100/60 hover:border-base-content/30 cursor-grab">
            <div className="w-14 h-9 flex-shrink-0 bg-base-300 flex items-center justify-center overflow-hidden text-base-content/60">
              {item.thumbnail ? <img src={item.thumbnail} alt="" className="w-full h-full object-cover" /> : <KindIcon kind={item.kind} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-base-content/85 truncate" title={item.name}>{item.name}</p>
              <p className="text-2xs font-mono text-base-content/60">
                {item.kind} · {formatDuration(item.duration)}
              </p>
            </div>
            <button type="button" className="tooltip tooltip-left p-1 text-base-content/60 hover:text-primary"
              data-tip="Add to timeline" aria-label={`Add ${item.name} to timeline`}
              onClick={() => addMediaToTimeline(item, onError)}>
              <PlusIcon className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
};

export default MediaBin;
