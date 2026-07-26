import React from 'react';
import VaultStatsWidget from './widgets/VaultStatsWidget';
import QuickActionsWidget from './widgets/QuickActionsWidget';
import RecentActivityWidget from './widgets/RecentActivityWidget';
import IntegrationHealthWidget from './widgets/IntegrationHealthWidget';
import type { Idea } from '../types';

interface DashboardWidgetsProps {
  ideas: Idea[];
}

const DashboardWidgets: React.FC<DashboardWidgetsProps> = ({ ideas }) => {
  return (
    <>
      {/* Left column */}
      <div className="flex flex-col gap-4 h-full overflow-y-auto">
        <QuickActionsWidget />
        <IntegrationHealthWidget />
      </div>

      {/* Right column */}
      <div className="flex flex-col gap-4 h-full overflow-y-auto">
        <VaultStatsWidget />
        <RecentActivityWidget ideas={ideas} />
      </div>
    </>
  );
};

export default DashboardWidgets;
