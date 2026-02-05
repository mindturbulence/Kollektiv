
import React from 'react';
import { GenericCheatsheetPage } from './GenericCheatsheetPage';
import CheatsheetCard from './CheatsheetCard';
import { loadCheatsheet, updateCategory } from '../utils/cheatsheetStorage';
import { BookOpenIcon } from './icons';
import type { CheatsheetItem, CheatsheetCategory } from '../types';

interface CheatsheetProps {
  isCategoryPanelCollapsed: boolean;
  onToggleCategoryPanel: () => void;
  isSidebarPinned: boolean;
}

const Cheatsheet: React.FC<CheatsheetProps> = ({ isCategoryPanelCollapsed, onToggleCategoryPanel, isSidebarPinned }) => {
  // A dummy function as this cheatsheet doesn't have image management
  const handleUpdate = async (itemId: string, updates: Partial<CheatsheetItem>): Promise<CheatsheetCategory[]> => {
    console.log(`Update called for ${itemId}, but not implemented for this cheatsheet.`, updates);
    return await loadCheatsheet();
  };

  return (
    <GenericCheatsheetPage
      title="Guides"
      heroText="GUIDES"
      searchPlaceholder="Search topics (e.g., 'role-playing', 'midjourney')..."
      loadDataFn={loadCheatsheet}
      updateDataFn={handleUpdate}
      updateCategoryFn={updateCategory}
      CardComponent={CheatsheetCard}
      onSendToPromptsPage={(item: CheatsheetItem, _category: string) => {
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
