// ─── Kollektiv Image Editor — History Panel ─────────────────────────────────
// Lists the undo stack (oldest first). Clicking a step jumps there via
// HistoryManager.jumpTo; steps after the current one are the redo branch.

import React, { useSyncExternalStore } from 'react';
import { getSnapshot, subscribe } from '../core/store';
import { jumpTo } from '../core/history/HistoryManager';

const HistoryPanel: React.FC = () => {
  const history = useSyncExternalStore(subscribe, () => getSnapshot().history);
  const index = useSyncExternalStore(subscribe, () => getSnapshot().historyIndex);
  const hasDoc = useSyncExternalStore(subscribe, () => getSnapshot().document !== null);

  const row = (label: string, i: number) => {
    const current = i === index;
    const future = i > index;
    return (
      <button
        key={i < 0 ? 'start' : history[i].id}
        type="button"
        aria-current={current ? 'step' : undefined}
        className={`w-full h-8 flex items-center gap-2 px-3 text-left text-sm normal-case tracking-normal font-normal border-b border-base-content/5 ${
          current ? 'bg-primary/10 text-primary' : future ? 'text-base-content/35 hover:bg-base-content/5' : 'text-base-content/80 hover:bg-base-content/5'
        }`}
        onClick={() => jumpTo(i)}
      >
        <span className="truncate">{label}</span>
      </button>
    );
  };

  if (!hasDoc) {
    return <p className="px-3 py-4 text-xs font-mono text-base-content/60">Open a document to see its history.</p>;
  }

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      {row('Open', -1)}
      {history.map((cmd, i) => row(cmd.label, i))}
      <p className="px-3 py-2 text-xs font-mono text-base-content/50">
        Oldest steps are discarded past 50 steps or 512 MB of pixels.
      </p>
    </div>
  );
};

export default HistoryPanel;
