// ─── Kollektiv Image Editor — Status Bar ───────────────────────────────────
// 28px bottom bar: zoom % · cursor X,Y · canvas W×H · busy dot.

import React, { useSyncExternalStore } from 'react';
import { getSnapshot, subscribe } from '../core/store';
import { useBusy } from '../../contexts/BusyContext';

interface StatusBarProps {
  cursorPos: { x: number; y: number } | null;
}

const StatusBar: React.FC<StatusBarProps> = ({ cursorPos }) => {
  const zoom = useSyncExternalStore(subscribe, () => getSnapshot().viewport.zoom);
  const document = useSyncExternalStore(subscribe, () => getSnapshot().document);
  const { isBusy } = useBusy();

  return (
    <div className="h-7 flex-shrink-0 flex items-center gap-4 px-3 bg-base-100/85 backdrop-blur-md border-t border-base-content/5 font-mono text-[10px] text-base-content/60">
      <span>{Math.round(zoom * 100)}%</span>
      <span>
        {cursorPos ? `X: ${Math.round(cursorPos.x)}, Y: ${Math.round(cursorPos.y)}` : 'X: —, Y: —'}
      </span>
      <span>{document ? `${document.width} × ${document.height}px` : '— × —'}</span>
      <div className="flex-1" />
      {isBusy && (
        <span className="flex items-center gap-1.5 text-primary">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          PROCESSING
        </span>
      )}
    </div>
  );
};

export default StatusBar;
