import React from 'react';
import { useAssistantSignals } from '../../utils/useAssistantSignals';
import { appEventBus } from '../../utils/eventBus';

const LiveAssistantMiniWidget: React.FC = () => {
  const { mode, status } = useAssistantSignals();

  const modeLabel = status === 'idle' ? 'Standing By' :
    status === 'error' ? 'Fault' :
    mode.charAt(0).toUpperCase() + mode.slice(1);

  const isActive = status === 'live';

  return (
    <div className="bg-base-100/40 backdrop-blur-xl border border-base-content/10 p-4 relative corner-frame">
      <div className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60 mb-3">Assistant</div>
      <button
        onClick={() => appEventBus.emit('navigate', 'assistant' as any)}
        className={`w-full flex items-center gap-3 p-3 border transition-all duration-300 ${
          isActive
            ? 'border-primary/30 bg-primary/5'
            : 'border-base-content/10 bg-base-200/30 hover:bg-base-200/50'
        }`}
      >
        <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-primary animate-pulse' : 'bg-base-content/20'}`} />
        <div className="flex-1 text-left">
          <div className="text-[11px] font-bold uppercase tracking-wider text-base-content/70">
            {modeLabel}
          </div>
          <div className="text-[8px] font-mono uppercase tracking-wider text-base-content/30 mt-0.5">
            {isActive ? 'Ctrl+Space to end' : 'Ctrl+Space to start'}
          </div>
        </div>
      </button>
      <div className="absolute -top-[1px] -left-[1px] w-2 h-2 border-t border-l border-primary/20 pointer-events-none" />
      <div className="absolute -top-[1px] -right-[1px] w-2 h-2 border-t border-r border-primary/20 pointer-events-none" />
    </div>
  );
};

export default LiveAssistantMiniWidget;
