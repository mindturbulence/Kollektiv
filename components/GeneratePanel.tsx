import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { audioService } from '../services/audioService';
import { DownloadIcon, SparklesIcon } from './icons';
import CompareQuickAction from './CompareQuickAction';
import type { GeneratePhase, GenerateLoopState } from '../hooks/useGenerateLoop';

/**
 * Panel that controls and displays the generate loop's progress.
 * Intended to be mounted inside the Refiner page's center column.
 */
interface GeneratePanelProps {
  state: GenerateLoopState;
  onStart: () => void;
  onReset: () => void;
  autoIngest: boolean;
  onToggleAutoIngest: () => void;
  disabled?: boolean;
  /** The previous completed generation result (for comparison). */
  previousResult: GenerateLoopState | null;
}

const PHASE_LABEL: Record<GeneratePhase, string> = {
  idle: 'STANDBY',
  refining: 'REFINING PROMPT',
  generating: 'GENERATING MEDIA',
  ingesting: 'INGESTING TO VAULT',
  ready: 'READY',
  error: 'ERROR',
};

const GeneratePanel: React.FC<GeneratePanelProps> = ({
  state,
  onStart,
  onReset,
  autoIngest,
  onToggleAutoIngest,
  disabled,
  previousResult,
}) => {
  const { phase, progress, statusMessage, generatedUrl, mediaType, error, refinedPrompt } = state;
  const isBusy = phase === 'refining' || phase === 'generating' || phase === 'ingesting';
  const canStart = phase === 'idle' || phase === 'ready' || phase === 'error';

  return (
    <div className="border-t border-base-content/10 p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-base-content/40">
          GENERATE LOOP
        </span>
        <div className="flex items-center gap-3">
          {/* Auto-ingest toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoIngest}
              onChange={onToggleAutoIngest}
              className="checkbox checkbox-xs checkbox-primary rounded-none"
              disabled={isBusy}
            />
            <span className="text-[9px] font-mono uppercase tracking-widest text-base-content/30">
              AUTO-VAULT
            </span>
          </label>
          {/* Phase badge */}
          <span
            className={`text-[9px] font-mono font-bold uppercase tracking-widest px-1.5 py-0.5 border ${
              phase === 'error'
                ? 'text-error border-error/30 bg-error/5'
                : phase === 'ready'
                  ? 'text-primary border-primary/30 bg-primary/5'
                  : isBusy
                    ? 'text-accent border-accent/30 bg-accent/5'
                    : 'text-base-content/20 border-base-content/10'
            }`}
          >
            {PHASE_LABEL[phase]}
          </span>
        </div>
      </div>

      {/* Progress bar (only when busy) */}
      <AnimatePresence>
        {isBusy && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-1"
          >
            <div className="w-full h-[2px] bg-base-content/10 relative overflow-hidden">
              <motion.div
                className="absolute inset-y-0 left-0 bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>
            <span className="text-[8px] font-mono uppercase tracking-widest text-base-content/30">
              {statusMessage || `${progress}%`}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result preview (ready phase) */}
      <AnimatePresence>
        {phase === 'ready' && generatedUrl && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative group bg-base-200/40 border border-base-content/10 overflow-hidden"
          >
            {mediaType === 'video' ? (
              <video
                src={generatedUrl}
                controls
                autoPlay
                loop
                className="w-full max-h-48 object-contain"
              />
            ) : (
              <img
                src={generatedUrl}
                alt="Generated result"
                className="w-full max-h-48 object-contain"
                referrerPolicy="no-referrer"
              />
            )}
            {/* Overlay actions */}
            <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <a
                href={generatedUrl}
                download={`kollektiv_gen_${Date.now()}.${mediaType === 'video' ? 'mp4' : 'jpg'}`}
                className="btn btn-xs btn-ghost bg-base-100/80 backdrop-blur-sm rounded-none tracking-widest text-[9px]"
                onClick={() => audioService.playClick()}
              >
                <DownloadIcon className="w-3 h-3 mr-1" />
                SAVE
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error display */}
      <AnimatePresence>
        {phase === 'error' && error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-3 bg-error/5 border border-error/20"
          >
            <span className="text-[10px] font-mono font-bold text-error uppercase tracking-widest">
              {error}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action buttons */}
      <div className="flex items-stretch gap-1.5">
        {canStart && (
          <button
            onClick={() => {
              audioService.playClick();
              onStart();
            }}
            disabled={disabled || isBusy}
            className="btn btn-sm btn-ghost flex-1 rounded-none tracking-wider uppercase font-mono text-[10px] border border-primary/20 hover:border-primary/40 disabled:opacity-20 btn-snake"
          >
            <span /><span /><span /><span />
            {phase === 'idle' ? (
              <>
                <SparklesIcon className="w-3.5 h-3.5 mr-1.5" />
                GENERATE
              </>
            ) : phase === 'error' ? (
              'RETRY'
            ) : (
              <>
                <SparklesIcon className="w-3.5 h-3.5 mr-1.5" />
                GENERATE AGAIN
              </>
            )}
          </button>
        )}

        {isBusy && (
          <button
            onClick={() => {
              audioService.playClick();
              onReset();
            }}
            className="btn btn-sm btn-ghost flex-1 rounded-none tracking-wider uppercase font-mono text-[10px] border border-base-content/10 text-base-content/40 btn-snake"
          >
            <span /><span /><span /><span />
            CANCEL
          </button>
        )}

        {phase === 'ready' && (
          <>
            <button
              onClick={() => {
                audioService.playClick();
                onReset();
              }}
              className="btn btn-sm btn-ghost flex-1 rounded-none tracking-wider uppercase font-mono text-[10px] border border-base-content/10 text-base-content/40 btn-snake"
            >
              <span /><span /><span /><span />
              RESET
            </button>

            {/* Compare with previous — only show when there's an actual previous result */}
            {generatedUrl && refinedPrompt && previousResult && (
              <CompareQuickAction
                currentUrl={generatedUrl}
                currentPrompt={refinedPrompt}
                previousUrl={previousResult?.generatedUrl || undefined}
                previousPrompt={previousResult?.refinedPrompt || undefined}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default GeneratePanel;
