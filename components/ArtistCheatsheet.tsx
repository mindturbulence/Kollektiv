

import React from 'react';
import type { CheatsheetItem } from '../types';
import { GenericCheatsheetPage } from './GenericCheatsheetPage';
import ArtistCard from './ArtistCard';
import { loadArtists, updateArtist } from '../utils/artistStorage';
import { UsersIcon } from './icons';

interface ArtistCheatsheetProps {
  isCategoryPanelCollapsed: boolean;
  onToggleCategoryPanel: () => void;
  onSendToPromptsPage: (state: { artist: string, artStyle?: string }) => void;
  isSidebarPinned: boolean;
}

const ArtistCheatsheet: React.FC<ArtistCheatsheetProps> = ({ isCategoryPanelCollapsed, onToggleCategoryPanel, onSendToPromptsPage, isSidebarPinned }) => {
  return (
    <GenericCheatsheetPage
      title="Artists"
      searchPlaceholder="Search artists..."
      loadDataFn={loadArtists}
      updateDataFn={updateArtist}
      CardComponent={ArtistCard}
      onSendToPromptsPage={(item: CheatsheetItem, category: string) => onSendToPromptsPage({ artist: item.name, artStyle: category })}
      isCategoryPanelCollapsed={isCategoryPanelCollapsed}
      onToggleCategoryPanel={onToggleCategoryPanel}
      isSidebarPinned={isSidebarPinned}
      EmptyIcon={UsersIcon}
    />
  );
};

export default ArtistCheatsheet;
