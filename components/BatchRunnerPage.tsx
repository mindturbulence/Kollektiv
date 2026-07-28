import React, { useEffect, useState, useCallback } from 'react';
import { BATCH_OPERATIONS } from '../services/batchOperations';
import { useBatchRun } from '../hooks/useBatchRun';
import { loadSavedPrompts } from '../utils/promptStorage';
import { loadGalleryItems } from '../utils/galleryStorage';
import { useSettings } from '../contexts/SettingsContext';
import type { SavedPrompt, GalleryItem } from '../types';

type InputTab = 'prompt' | 'gallery_item';

const BatchRunnerPage: React.FC = () => {
  const { settings } = useSettings();
  const { state, start, cancel, reset } = useBatchRun();

  const [selectedOpId, setSelectedOpId] = useState(BATCH_OPERATIONS[0]?.id ?? '');
  const [inputTab, setInputTab] = useState<InputTab>('prompt');
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingInputs, setLoadingInputs] = useState(false);

  const selectedOp = BATCH_OPERATIONS.find(o => o.id === selectedOpId);

  // Load input items for the selected operation
  useEffect(() => {
    const kind = selectedOp?.inputKind ?? 'prompt';
    setInputTab(kind);
    setSelectedIds(new Set());
    setLoadingInputs(true);

    let cancelled = false;

    (async () => {
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
    start(selectedOpId, selectedItems, settings);
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
    <div className="h-full flex flex-col font-mono">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-lg font-black uppercase tracking-tighter">Batch Runner</h1>
        <p className="text-xs text-base-content/40 mt-1">
          Run an operation across multiple items with live progress.
        </p>
      </div>

      <div className="flex-1 flex gap-6 min-h-0">
        {/* Left: Configuration */}
        <div className="w-72 shrink-0 flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-2">
          {/* Operation picker */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 block mb-2">
              Operation
            </label>
            <div className="flex flex-col gap-1">
              {BATCH_OPERATIONS.map(op => (
                <button
                  key={op.id}
                  onClick={() => setSelectedOpId(op.id)}
                  className={`text-left px-3 py-2 text-xs font-mono rounded transition-colors ${
                    selectedOpId === op.id
                      ? 'bg-primary/15 text-primary border border-primary/20'
                      : 'bg-base-300/30 text-base-content/60 hover:bg-base-300/50 border border-transparent'
                  }`}
                >
                  {op.label}
                  <span className="block text-[9px] text-base-content/30 mt-0.5">
                    {op.inputKind === 'prompt' ? 'Saved prompts' : 'Gallery items'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Input source */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 block mb-2">
              {inputTab === 'prompt' ? 'Saved Prompts' : 'Gallery Items'}
            </label>
            {loadingInputs ? (
              <div className="text-[10px] text-base-content/30 animate-pulse">Loading…</div>
            ) : items.length === 0 ? (
              <div className="text-[10px] text-base-content/20">No items found.</div>
            ) : (
              <div className="flex flex-col gap-0.5 max-h-[300px] overflow-y-auto custom-scrollbar">
                {items.map(item => {
                  const label = 'title' in item ? String(item.title ?? '') : '';
                  const display = label || item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggleId(item.id)}
                      className={`text-left px-2 py-1 text-[10px] font-mono rounded truncate transition-colors ${
                        selectedIds.has(item.id)
                          ? 'bg-primary/10 text-primary'
                          : 'text-base-content/50 hover:bg-base-content/5'
                      }`}
                    >
                      {display}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pre-run summary */}
          <div className="bg-base-300/20 border border-base-content/10 rounded p-3 text-[10px]">
            <div className="text-base-content/30 uppercase tracking-wider mb-1">Summary</div>
            <div className="text-base-content/60">
              {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} · {activeProvider}
            </div>
          </div>

          {/* Run / Cancel */}
          <div className="flex gap-2">
            {state.running ? (
              <button
                onClick={cancel}
                className="flex-1 h-8 text-[10px] font-bold uppercase tracking-widest rounded bg-error/20 text-error hover:bg-error/30 transition-colors"
              >
                Cancel ({state.doneCount}/{state.total})
              </button>
            ) : (
              <button
                onClick={handleRun}
                disabled={!selectedOpId || selectedItems.length === 0}
                className="flex-1 h-8 text-[10px] font-bold uppercase tracking-widest rounded bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
              >
                Run
              </button>
            )}
            {state.summary && !state.running && (
              <button
                onClick={reset}
                className="h-8 px-3 text-[10px] font-bold uppercase tracking-widest rounded bg-base-content/5 text-base-content/30 hover:bg-base-content/10 transition-colors"
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
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${state.total > 0 ? (state.doneCount / state.total) * 100 : 0}%` }}
                />
              </div>
              <div className="text-[10px] text-base-content/30 mt-1">
                {state.doneCount} / {state.total} complete
              </div>
            </div>
          )}

          {state.summary && !state.running && (
            <div className="mb-3 flex gap-3 text-[10px]">
              <span className="text-green-500/70">{state.summary.completed} done</span>
              {state.summary.failed > 0 && <span className="text-error/70">{state.summary.failed} failed</span>}
              {state.summary.cancelled && <span className="text-warning/70">Cancelled</span>}
              <span className="text-base-content/30">{(state.summary.totalMs / 1000).toFixed(1)}s</span>
            </div>
          )}

          {/* Per-item report */}
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
            {state.results.length === 0 && !state.running && (
              <div className="flex items-center justify-center h-full">
                <p className="text-[10px] text-base-content/20 uppercase tracking-widest">
                  Select items and run a batch
                </p>
              </div>
            )}
            {state.results.map((r, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 px-3 py-2 rounded text-[10px] font-mono ${
                  r.status === 'done' ? 'bg-green-500/5 border border-green-500/10' :
                  r.status === 'failed' ? 'bg-error/5 border border-error/10' :
                  r.status === 'cancelled' ? 'bg-warning/5 border border-warning/10' :
                  'bg-base-300/20'
                }`}
              >
                <span className={`shrink-0 w-1.5 h-1.5 rounded-full mt-1 ${
                  r.status === 'done' ? 'bg-green-500' :
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
                    <div className="text-base-content/40 truncate mt-0.5">
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

export { BatchRunnerPage };
export default BatchRunnerPage;
