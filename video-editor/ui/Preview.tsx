// ─── Kollektiv Video Editor — Preview ────────────────────────────────────────
// Centre panel: project canvas letterboxed to the project aspect, plus the
// transport row (frame step, play/pause, timecode). The canvas is owned here;
// the page attaches the renderer to it through `canvasRef`.

import React from 'react';
import type { PlaybackController } from '../core/types';
import { useEditorSelector } from './hooks/useEditorState';
import { formatTimecode } from './placement';
import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon } from '../../components/icons';

interface PreviewProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  playback: PlaybackController | null;
  /** Shown over the canvas when the renderer/playback could not start. */
  error: string | null;
}

const Preview: React.FC<PreviewProps> = ({ canvasRef, playback, error }) => {
  const settings = useEditorSelector(s => s.project?.settings);
  const playhead = useEditorSelector(s => s.playhead);
  const isPlaying = useEditorSelector(s => s.isPlaying);
  const fps = settings?.fps ?? 30;
  const aspect = settings ? settings.width / settings.height : 16 / 9;

  const transportBtn = 'tooltip tooltip-top p-1.5 text-base-content/70 hover:text-primary disabled:text-base-content/25 disabled:cursor-not-allowed';

  return (
    <section className="flex-1 flex flex-col min-w-0 min-h-0 bg-base-300/40" aria-label="Preview">
      {/* container-type: size lets the canvas fit by cq units without measuring. */}
      <div className="flex-1 min-h-0 relative flex items-center justify-center p-4" style={{ containerType: 'size' }}>
        <canvas
          ref={canvasRef}
          className="bg-black shadow-lg"
          style={{ width: `min(100cqw, calc(100cqh * ${aspect}))`, height: `min(100cqh, calc(100cqw / ${aspect}))` }}
          aria-label="Video preview"
        />
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6" role="alert">
            <p className="max-w-xs text-center text-xs font-mono text-base-content/60 bg-base-100/85 border border-base-content/10 px-3 py-2">
              Preview unavailable: {error}
            </p>
          </div>
        )}
      </div>

      <div className="h-10 flex-shrink-0 flex items-center justify-center gap-2 border-t border-base-content/5 bg-base-100/85">
        <button type="button" className={transportBtn} data-tip="Previous frame" aria-label="Previous frame"
          disabled={!playback} onClick={() => playback?.seek(playhead - 1 / fps)}>
          <ChevronLeftIcon className="w-4 h-4" />
        </button>
        <button type="button" className={transportBtn} data-tip={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          aria-label={isPlaying ? 'Pause' : 'Play'} disabled={!playback}
          onClick={() => (isPlaying ? playback?.pause() : playback?.play())}>
          {isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
        </button>
        <button type="button" className={transportBtn} data-tip="Next frame" aria-label="Next frame"
          disabled={!playback} onClick={() => playback?.seek(playhead + 1 / fps)}>
          <ChevronRightIcon className="w-4 h-4" />
        </button>
        <span className="ml-2 w-24 text-xs font-mono tabular-nums text-base-content/70" aria-label="Timecode">
          {formatTimecode(playhead, fps)}
        </span>
      </div>
    </section>
  );
};

export default Preview;
