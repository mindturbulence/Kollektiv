import React, { useEffect, useState, useCallback } from 'react';
import { BATCH_OPERATIONS } from '../services/batchOperations';
import { useBatchRun } from '../hooks/useBatchRun';
import { loadSavedPrompts } from '../utils/promptStorage';
import { loadGalleryItems } from '../utils/galleryStorage';
import { useSettings } from '../contexts/SettingsContext';
import type { SavedPrompt, GalleryItem } from '../types';
import { PaperScope } from './PaperScope';

type InputTab = 'prompt' | 'gallery_item';

const BatchRunnerView: React.FC = () => {
  const { settings } = useSettings();
  const { state, start, cancel, reset } = useBatchRun();

  const [selectedOpId, setSelectedOpId] = useState(BATCH_OPERATIONS[0]?.id ?? '');
  const [inputTab, setInputTab] = useState<InputTab>('prompt');
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingInputs, setLoadingInputs] = useState(false);

  const selectedOp = BATCH_OPERATIONS.find(o => o.id === selectedOpId);

  useEffect(() => {
    const kind = selectedOp?.inputKind ?? 'prompt';
    setInputTab(kind);
    setSelectedIds(new Set());
    setLoadingInputs(true);

    let cancelled = false;

    void (async () => {
      const loaded = kind === 'prompt'
        ? await loadSavedPrompts()
        : await loadGalleryItems();
      if (cancelled) return;
      if (kind === 'prompt') {
        setPrompts(loaded as any);
      } else {
        setGalleryItems(loaded as any);
      }
      setLoadingInputs(false);
    })();

    return () => { cancelled = true; };
  }, [selectedOpId, selectedOp?.inputKind]);

  const items = inputTab === 'prompt' ? prompts : galleryItems;
  const selectedItems = items.filter(i => selectedIds.has(i.id));
  const activeProvider = settings.activeLLM || 'gemini';

  const handleRun = useCallback(() => {
    if (!selectedOpId || selectedItems.length === 0 || state.running) return;
    void start(selectedOpId, selectedItems, settings);
  }, [selectedOpId, selectedItems, state.running, start, settings]);

  const toggleId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col">
      <header className="pb-4 md:pb-6">
        <span className="text-xs font-medium text-base-content/60 block">Dev</span>
        <h1 className="paper-title text-2xl md:text-3xl lg:text-4xl leading-none">Batch Runner</h1>
        <p className="text-sm text-base-content/60 pt-1">Run an operation across multiple items with live progress.</p>
      </header>

      <div className="flex-1 flex gap-6 min-h-0">
        {/* Left: Configuration */}
        <div className="w-72 shrink-0 flex flex-col gap-4 overflow-y-auto">
          {/* Operation picker */}
          <div className="paper-card flex flex-col">
            <div className="flex-shrink-0 h-10 px-4 flex items-center border-b border-base-content/10">
              <span className="text-xs font-semibold">Operation</span>
            </div>
            <div className="flex flex-col gap-1 p-3">
              {BATCH_OPERATIONS.map(op => (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => setSelectedOpId(op.id)}
                  className={`paper-btn w-full justify-start text-left ${selectedOpId === op.id ? 'paper-btn-primary' : 'paper-btn-ghost'}`}
                >
                  <span className="flex flex-col items-start gap-0.5">
                    <span>{op.label}</span>
                    <span className="text-2xs opacity-70">
                      {op.inputKind === 'prompt' ? 'Saved prompts' : 'Gallery items'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Input source */}
          <div className="paper-card flex flex-col">
            <div className="flex-shrink-0 h-10 px-4 flex items-center border-b border-base-content/10">
              <span className="text-xs font-semibold">{inputTab === 'prompt' ? 'Saved Prompts' : 'Gallery Items'}</span>
            </div>
            <div className="p-3">
              {loadingInputs ? (
                <div className="text-2xs text-base-content/60 animate-pulse">Loading…</div>
              ) : items.length === 0 ? (
                <div className="text-2xs text-base-content/60">No items found.</div>
              ) : (
                <div className="flex flex-col gap-0.5 max-h-[300px] overflow-y-auto custom-scrollbar">
                  {items.map(item => {
                    const label = 'title' in item ? String(item.title ?? '') : '';
                    const display = label || item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleId(item.id)}
                        className={`paper-btn paper-btn-sm w-full justify-start text-left truncate ${selectedIds.has(item.id) ? 'paper-btn-primary' : 'paper-btn-ghost'}`}
                      >
                        {display}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Pre-run summary */}
          <div className="paper-card p-3 text-2xs">
            <div className="text-xs font-semibold mb-1">Summary</div>
            <div className="text-base-content/60">
              {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} · {activeProvider}
            </div>
          </div>

          {/* Run / Cancel */}
          <div className="flex gap-2">
            {state.running ? (
              <button
                type="button"
                onClick={cancel}
                className="paper-btn paper-btn-danger flex-1"
              >
                Cancel ({state.doneCount}/{state.total})
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRun}
                disabled={!selectedOpId || selectedItems.length === 0}
                className="paper-btn paper-btn-primary flex-1"
              >
                Run
              </button>
            )}
            {state.summary && !state.running && (
              <button
                type="button"
                onClick={reset}
                className="paper-btn paper-btn-sm self-center"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Right: Results */}
        <div className="flex-1 flex flex-col min-w-0">
          {state.running && (
            <div className="mb-3">
              <div className="h-1.5 bg-base-300/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-[width] duration-300"
                  style={{ width: `${state.total > 0 ? (state.doneCount / state.total) * 100 : 0}%` }}
                />
              </div>
              <div className="text-2xs text-base-content/60 mt-1">
                {state.doneCount} / {state.total} complete
              </div>
            </div>
          )}

          {state.summary && !state.running && (
            <div className="mb-3 flex gap-3 text-2xs">
              <span className="text-success">{state.summary.completed} done</span>
              {state.summary.failed > 0 && <span className="text-error">{state.summary.failed} failed</span>}
              {state.summary.cancelled && <span className="text-warning">Cancelled</span>}
              <span className="text-base-content/60">{(state.summary.totalMs / 1000).toFixed(1)}s</span>
            </div>
          )}

          {/* Per-item report */}
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
            {state.results.length === 0 && !state.running && (
              <div className="flex items-center justify-center h-full">
                <p className="text-2xs text-base-content/60 uppercase tracking-widest">
                  Select items and run a batch
                </p>
              </div>
            )}
            {state.results.map((r, i) => (
              <div
                key={i}
                className={`paper-card flex items-start gap-2 px-3 py-2 text-2xs font-mono ${
                  r.status === 'done' ? '!border-success/20 !bg-success/5' :
                  r.status === 'failed' ? '!border-error/20 !bg-error/5' :
                  r.status === 'cancelled' ? '!border-warning/20 !bg-warning/5' : ''
                }`}
              >
                <span className={`shrink-0 w-1.5 h-1.5 rounded-full mt-1 ${
                  r.status === 'done' ? 'bg-success' :
                  r.status === 'failed' ? 'bg-error' :
                  r.status === 'cancelled' ? 'bg-warning' :
                  'bg-base-content/20'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="text-base-content/60 truncate">
                    #{i} · {(r.ms / 1000).toFixed(1)}s
                  </div>
                  {r.status === 'failed' && r.error && (
                    <div className="text-error/70 truncate mt-0.5">{r.error}</div>
                  )}
                  {r.status === 'done' && r.output && (
                    <div className="text-base-content/60 truncate mt-0.5">
                      {typeof r.output === 'string' ? r.output.slice(0, 120) : JSON.stringify(r.output).slice(0, 120)}
                      {r.output && (typeof r.output === 'string' ? r.output.length > 120 : JSON.stringify(r.output).length > 120) ? '…' : ''}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const BatchRunnerPage: React.FC = () => (
  <PaperScope><BatchRunnerView /></PaperScope>
);

export { BatchRunnerPage };
export default BatchRunnerPage;
