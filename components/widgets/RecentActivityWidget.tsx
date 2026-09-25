import React, { useMemo } from 'react';
import type { Idea, ActiveTab } from '../../types';
import { appEventBus } from '../../utils/eventBus';
import EmptyState from '../EmptyState';

interface RecentActivityWidgetProps {
  ideas: Idea[];
}

const RecentActivityWidget: React.FC<RecentActivityWidgetProps> = ({ ideas }) => {
  const recent = useMemo(() => ideas.slice(0, 5), [ideas]);

  return (
    <div className="bg-base-100/40 backdrop-blur-xl border border-base-content/10 p-4 relative corner-frame h-full flex flex-col">
      <div className="text-2xs font-black uppercase tracking-[0.2em] text-primary/60 mb-3 flex-shrink-0">Recent Activity</div>
      {recent.length === 0 ? (
        <EmptyState
          title="No recent activity"
          body="Clipped ideas show up here."
          action={{ label: 'Craft your first prompt', onClick: () => appEventBus.emit('navigate', 'crafter' as ActiveTab) }}
          className="py-4 flex-1 justify-center"
        />
      ) : (
        <div className="space-y-1 flex-1 overflow-y-auto">
          {recent.map(idea => (
            <div
              key={idea.id}
              className="text-2xs font-mono text-base-content/60 truncate py-1 border-b border-base-content/5 last:border-0"
              title={idea.prompt}
            >
              <span className="text-primary/60 mr-2">•</span>
              {idea.title || idea.prompt.slice(0, 50)}
            </div>
          ))}
        </div>
      )}
      <div className="absolute -top-[1px] -left-[1px] w-2 h-2 border-t border-l border-primary/20 pointer-events-none" />
      <div className="absolute -top-[1px] -right-[1px] w-2 h-2 border-t border-r border-primary/20 pointer-events-none" />
    </div>
  );
};

export default RecentActivityWidget;
