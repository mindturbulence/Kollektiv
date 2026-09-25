import React from 'react';
import { appEventBus } from '../../utils/eventBus';
import { useLiveAssistantContext } from '../../contexts/LiveAssistantContext';
import type { ActiveTab } from '../../types';

interface QuickAction {
  label: string;
  onClick: () => void;
}

const QuickActionsWidget: React.FC = () => {
  const { toggleLive } = useLiveAssistantContext();

  const secondaryActions: QuickAction[] = [
    { label: 'Open Gallery', onClick: () => appEventBus.emit('navigate', 'gallery' as ActiveTab) },
    { label: 'Refine Idea', onClick: () => appEventBus.emit('navigate', 'refiner' as ActiveTab) },
    { label: 'Prompt Library', onClick: () => appEventBus.emit('navigate', 'prompt' as ActiveTab) },
    { label: 'Toggle Live', onClick: toggleLive },
    { label: 'New Note', onClick: () => appEventBus.emit('togglePanel', 'clipping') },
  ];

  return (
    <div className="bg-base-100/40 backdrop-blur-xl border border-base-content/10 p-4 relative corner-frame">
      <div className="text-2xs font-black uppercase tracking-[0.2em] text-primary/60 mb-3">Quick Actions</div>
      <button
        onClick={() => appEventBus.emit('navigate', 'crafter' as ActiveTab)}
        className="w-full mb-2 px-3 py-3 text-2xs font-black uppercase tracking-wider bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 hover:border-primary/50 transition-all duration-200 text-center"
      >
        + New Prompt
      </button>
      <div className="grid grid-cols-2 gap-2">
        {secondaryActions.map(action => (
          <button
            key={action.label}
            onClick={action.onClick}
            className="px-3 py-2 text-2xs font-bold uppercase tracking-wider bg-base-200/30 hover:bg-primary/10 hover:text-primary border border-base-content/10 hover:border-primary/30 transition-all duration-200 text-left"
          >
            {action.label}
          </button>
        ))}
      </div>
      <div className="absolute -top-[1px] -left-[1px] w-2 h-2 border-t border-l border-primary/20 pointer-events-none" />
      <div className="absolute -top-[1px] -right-[1px] w-2 h-2 border-t border-r border-primary/20 pointer-events-none" />
    </div>
  );
};

export default QuickActionsWidget;
