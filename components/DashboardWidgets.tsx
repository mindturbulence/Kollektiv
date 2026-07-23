import React from 'react';
import VaultStatsWidget from './widgets/VaultStatsWidget';
import QuickActionsWidget from './widgets/QuickActionsWidget';
import RecentActivityWidget from './widgets/RecentActivityWidget';
import IntegrationHealthWidget from './widgets/IntegrationHealthWidget';
import LiveAssistantMiniWidget from './widgets/LiveAssistantMiniWidget';
import type { Idea } from '../types';

interface DashboardWidgetsProps {
  ideas: Idea[];
}

const DashboardWidgets: React.FC<DashboardWidgetsProps> = ({ ideas }) => {
  return (
    <div className="w-full max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 px-4">
      {/* Top row */}
      <QuickActionsWidget />
      <VaultStatsWidget />

      {/* Middle row */}
      <div className="md:col-span-2">
        <RecentActivityWidget ideas={ideas} />
      </div>

      {/* Bottom row */}
      <IntegrationHealthWidget />
      <LiveAssistantMiniWidget />
    </div>
  );
};

export default DashboardWidgets;
