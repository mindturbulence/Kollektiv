

import React from 'react';
import type { CheatsheetItem } from '../types';
import { GenericCheatsheetPage } from './GenericCheatsheetPage';
import ArtstyleCard from './ArtstyleCard';
import { loadArtStyles, updateArtStyle } from '../utils/artstyleStorage';
import { PaintBrushIcon } from './icons';

interface ArtstyleCheatsheetProps {
  isCategoryPanelCollapsed: boolean;
  onToggleCategoryPanel: () => void;
  onSendToPromptsPage: (state: { artStyle: string }) => void;
  isSidebarPinned: boolean;
}

const ArtstyleCheatsheet: React.FC<ArtstyleCheatsheetProps> = ({ isCategoryPanelCollapsed, onToggleCategoryPanel, onSendToPromptsPage, isSidebarPinned }) => {
  return (
    <GenericCheatsheetPage
      title="Art Styles"
      searchPlaceholder="Search art styles..."
      loadDataFn={loadArtStyles}
      updateDataFn={updateArtStyle}
      CardComponent={ArtstyleCard}
      onSendToPromptsPage={(item: CheatsheetItem, _category: string) => onSendToPromptsPage({ artStyle: item.name })}
      isCategoryPanelCollapsed={isCategoryPanelCollapsed}
      onToggleCategoryPanel={onToggleCategoryPanel}
      isSidebarPinned={isSidebarPinned}
      EmptyIcon={PaintBrushIcon}
    />
  );
};

export default ArtstyleCheatsheet;
