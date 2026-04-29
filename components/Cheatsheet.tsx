
import React from 'react';
import { GenericCheatsheetPage } from './GenericCheatsheetPage';
import { loadCheatsheet } from '../utils/cheatsheetStorage';
import type { CheatsheetItem, CheatsheetCategory } from '../types';

interface CheatsheetProps {
  isExiting?: boolean;
}

const Cheatsheet: React.FC<CheatsheetProps> = ({ isExiting = false }) => {
  // A dummy function as this cheatsheet doesn't have image management
  const handleUpdate = async (itemId: string, updates: Partial<CheatsheetItem>): Promise<CheatsheetCategory[]> => {
    console.log(`Update called for ${itemId}, but not implemented for this cheatsheet.`, updates);
    return await loadCheatsheet();
  };

  return (
    <GenericCheatsheetPage
      title="Guides"
      heroText="GUIDES"
      loadDataFn={loadCheatsheet}
      updateDataFn={handleUpdate}
      onSendToPromptsPage={(_item: CheatsheetItem, _category: string) => {
      }}
      isExiting={isExiting}
    />
  );
};

export default Cheatsheet;
