import React, { useMemo } from 'react';
import type { Idea } from '../../types';

interface RecentActivityWidgetProps {
  ideas: Idea[];
}

const RecentActivityWidget: React.FC<RecentActivityWidgetProps> = ({ ideas }) => {
  const recent = useMemo(() => ideas.slice(0, 5), [ideas]);

  return (
    <div className="bg-base-100/40 backdrop-blur-xl border border-base-content/10 p-4 relative corner-frame">
      <div className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60 mb-3">Recent Activity</div>
      {recent.length === 0 ? (
        <p className="text-[10px] font-mono text-base-content/20 uppercase tracking-wider py-4 text-center">
          No recent activity
        </p>
      ) : (
        <div className="space-y-1">
          {recent.map(idea => (
            <div
              key={idea.id}
              className="text-[11px] font-mono text-base-content/50 truncate py-1 border-b border-base-content/5 last:border-0"
              title={idea.prompt}
            >
              <span className="text-primary/40 mr-2">•</span>
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
