import React, { useEffect, useState, useCallback } from 'react';
import { BATCH_OPERATIONS } from '../services/batchOperations';
import { useBatchRun } from '../hooks/useBatchRun';
import { loadSavedPrompts } from '../utils/promptStorage';
import { loadGalleryItems } from '../utils/galleryStorage';
import { useSettings } from '../contexts/SettingsContext';
import { audioService } from '../services/audioService';
import { PanelLine, ScanLine, TerminalText } from './AnimatedPanels';
import type { SavedPrompt, GalleryItem } from '../types';

type InputTab = 'prompt' | 'gallery_item';

const corners = (
  <>
    <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
    <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
    <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
    <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
  </>
);

const lines = (
  <>
    <PanelLine position="top" delay={0.4} />
    <PanelLine position="bottom" delay={0.5} />
    <PanelLine position="left" delay={0.6} />
    <PanelLine position="right" delay={0.7} />
    <ScanLine delay={3.5} />
  </>
);

const itemBtn = (active: boolean) =>
  `btn btn-sm btn-ghost rounded-none w-full justify-start text-left font-normal tracking-wider uppercase btn-snake h-auto min-h-8 py-1.5 ${active ? 'text-primary' : 'text-base-content/60 hover:text-primary'}`;

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
    <div className="grid grid-cols-1 lg:grid-cols-12 overflow-hidden h-full gap-6 min-h-0">
      {/* Left: configuration */}
      <aside className="lg:col-span-4 h-full min-h-0 flex flex-col relative p-[3px] corner-frame overflow-visible">
        {lines}
        <div className="flex flex-col h-full w-full overflow-visible relative z-10 bg-base-100/40 backdrop-blur-xl panel-transparent">
          <header className="p-6 h-16 flex items-center flex-shrink-0 bg-base-100/80 backdrop-blur-md panel-header relative z-overlay">
            <TerminalText text="BATCH RUNNER" delay={0.2} className="text-xs font-sf-mono uppercase text-primary" />
          </header>
          <div className="flex-grow p-6 overflow-y-auto bg-transparent flex flex-col gap-6">
            <p className="text-xs text-base-content/60">Run an operation across multiple items with live progress.</p>

            <section>
              <h2 className="text-2xs font-bold uppercase tracking-widest text-base-content/60 mb-2">Operation</h2>
              <div className="flex flex-col gap-1.5">
                {BATCH_OPERATIONS.map(op => (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => { audioService.playClick(); setSelectedOpId(op.id); }}
                    onMouseEnter={() => audioService.playHover()}
                    className={itemBtn(selectedOpId === op.id)}
                  >
                    <span /><span /><span /><span />
                    <span className="flex flex-col items-start gap-0.5">
                      <span>{op.label}</span>
                      <span className="text-2xs opacity-60 normal-case tracking-normal">
                        {op.inputKind === 'prompt' ? 'Saved prompts' : 'Gallery items'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-2xs font-bold uppercase tracking-widest text-base-content/60 mb-2">
                {inputTab === 'prompt' ? 'Saved Prompts' : 'Gallery Items'}
              </h2>
              {loadingInputs ? (
                <div className="text-2xs text-base-content/60 animate-pulse">Loading…</div>
              ) : items.length === 0 ? (
                <div className="text-2xs text-base-content/60">No items found.</div>
              ) : (
                <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto custom-scrollbar">
                  {items.map(item => {
                    const label = 'title' in item ? String(item.title ?? '') : '';
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => { audioService.playClick(); toggleId(item.id); }}
                        className={itemBtn(selectedIds.has(item.id))}
                      >
                        <span /><span /><span /><span />
                        <span className="truncate">{label || item.id}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <div className="border border-base-content/10 bg-base-200/40 p-3 text-2xs">
              <div className="font-bold uppercase tracking-widest text-base-content/60 mb-1">Summary</div>
              <div className="text-base-content/60">
                {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} · {activeProvider}
              </div>
            </div>
          </div>
          <footer className="h-14 flex items-stretch flex-shrink-0 bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 panel-footer">
            {state.running ? (
              <button
                type="button"
                onClick={() => { audioService.playClick(); cancel(); }}
                className="btn btn-sm btn-ghost h-full rounded-none flex-1 tracking-wider text-error/60 hover:text-error border-1 btn-snake"
              >
                <span /><span /><span /><span />CANCEL ({state.doneCount}/{state.total})
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { audioService.playClick(); handleRun(); }}
                disabled={!selectedOpId || selectedItems.length === 0}
                className="btn btn-sm btn-ghost h-full rounded-none flex-1 tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake"
              >
                <span /><span /><span /><span />RUN
              </button>
            )}
            {state.summary && !state.running && (
              <button
                type="button"
                onClick={() => { audioService.playClick(); reset(); }}
                className="btn btn-sm btn-ghost h-full rounded-none flex-1 tracking-wider text-base-content/60 hover:text-primary border-1 btn-snake"
              >
                <span /><span /><span /><span />CLEAR
              </button>
            )}
          </footer>
        </div>
        {corners}
      </aside>

      {/* Right: results */}
      <main className="lg:col-span-8 h-full min-h-0 flex flex-col relative p-[3px] corner-frame overflow-visible">
        {lines}
        <div className="flex flex-col h-full w-full overflow-visible relative z-10 bg-base-100/40 backdrop-blur-xl panel-transparent">
          <header className="p-6 h-16 flex justify-between items-center flex-shrink-0 bg-base-100/80 backdrop-blur-md panel-header relative z-overlay gap-4">
            <TerminalText text="RESULTS" delay={0.4} className="text-xs font-sf-mono uppercase text-primary" />
            {state.summary && !state.running && (
              <div className="flex gap-3 text-2xs uppercase tracking-widest">
                <span className="text-success">{state.summary.completed} done</span>
                {state.summary.failed > 0 && <span className="text-error">{state.summary.failed} failed</span>}
                {state.summary.cancelled && <span className="text-warning">Cancelled</span>}
                <span className="text-base-content/60">{(state.summary.totalMs / 1000).toFixed(1)}s</span>
              </div>
            )}
          </header>
          <div className="flex-grow p-6 overflow-y-auto custom-scrollbar flex flex-col gap-1.5">
            {state.running && (
              <div className="mb-3">
                <div className="h-1 bg-base-content/10 overflow-hidden">
                  <div
                    className="h-full bg-primary transition-[width] duration-300"
                    style={{ width: `${state.total > 0 ? (state.doneCount / state.total) * 100 : 0}%` }}
                  />
                </div>
                <div className="text-2xs text-base-content/60 mt-1 uppercase tracking-widest">
                  {state.doneCount} / {state.total} complete
                </div>
              </div>
            )}
            {state.results.length === 0 && !state.running && (
              <div className="flex-grow flex flex-col items-center justify-center text-center opacity-60">
                <p className="text-xs font-sf-mono uppercase tracking-widest">Select items and run a batch</p>
              </div>
            )}
            {state.results.map((r, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 px-3 py-2 text-2xs font-mono border ${
                  r.status === 'done' ? 'border-success/20 bg-success/5' :
                  r.status === 'failed' ? 'border-error/20 bg-error/5' :
                  r.status === 'cancelled' ? 'border-warning/20 bg-warning/5' :
                  'border-base-content/10 bg-base-200/40'
                }`}
              >
                <span className={`shrink-0 w-1.5 h-1.5 mt-1 ${
                  r.status === 'done' ? 'bg-success' :
                  r.status === 'failed' ? 'bg-error' :
                  r.status === 'cancelled' ? 'bg-warning' :
                  'bg-base-content/20'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="text-base-content/60 truncate">#{i} · {(r.ms / 1000).toFixed(1)}s</div>
                  {r.status === 'failed' && r.error && (
                    <div className="text-error/70 truncate mt-0.5">{r.error}</div>
                  )}
                  {r.status === 'done' && r.output && (
                    <div className="text-base-content/60 truncate mt-0.5">
                      {(typeof r.output === 'string' ? r.output : JSON.stringify(r.output)).slice(0, 120)}
                      {(typeof r.output === 'string' ? r.output.length : JSON.stringify(r.output).length) > 120 ? '…' : ''}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        {corners}
      </main>
    </div>
  );
};

export { BatchRunnerPage };
export default BatchRunnerPage;
