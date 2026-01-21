import React from 'react';
import { GenericCheatsheetPage } from './GenericCheatsheetPage';
import CheatsheetCard from './CheatsheetCard';
import { loadCheatsheet } from '../utils/cheatsheetStorage';
import { BookOpenIcon } from './icons';
import type { CheatsheetItem, CheatsheetCategory } from '../types';

interface CheatsheetProps {
  isCategoryPanelCollapsed: boolean;
  onToggleCategoryPanel: () => void;
  isSidebarPinned: boolean;
}

const Cheatsheet: React.FC<CheatsheetProps> = ({ isCategoryPanelCollapsed, onToggleCategoryPanel, isSidebarPinned }) => {
  // A dummy function as this cheatsheet doesn't have image management
  // FIX: Updated parameter type from string[] to Partial<CheatsheetItem> to match GenericCheatsheetPageProps
  const handleUpdate = async (itemId: string, updates: Partial<CheatsheetItem>): Promise<CheatsheetCategory[]> => {
    console.log(`Update called for ${itemId}, but not implemented for this cheatsheet.`, updates);
    // Return the existing data to avoid breaking state
    return await loadCheatsheet();
  };

  return (
    <GenericCheatsheetPage
      title="Prompting Cheatsheet"
      // Fix: Added missing required heroText prop as per GenericCheatsheetPageProps
      heroText="PROMPTING"
      searchPlaceholder="Search topics (e.g., 'role-playing', 'midjourney')..."
      loadDataFn={loadCheatsheet}
      updateDataFn={handleUpdate}
      CardComponent={CheatsheetCard}
      onSendToPromptsPage={(item: CheatsheetItem, _category: string) => {
        // Not applicable for this cheatsheet as items are concepts, not modifiers.
        // We could potentially copy the item name or example to clipboard here in the future.
      }}
      isCategoryPanelCollapsed={isCategoryPanelCollapsed}
      onToggleCategoryPanel={onToggleCategoryPanel}
      isSidebarPinned={isSidebarPinned}
      EmptyIcon={BookOpenIcon}
      layout="article"
    />
  );
};

export default Cheatsheet;