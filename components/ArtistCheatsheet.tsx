
import React from 'react';
import type { CheatsheetItem } from '../types';
import { GenericCheatsheetPage } from './GenericCheatsheetPage';
import { loadArtists, updateArtist } from '../utils/artistStorage';

interface ArtistCheatsheetProps {
  onSendToPromptsPage: (state: { artist: string, artStyle?: string }) => void;
  isExiting?: boolean;
}

const ArtistCheatsheet: React.FC<ArtistCheatsheetProps> = ({ onSendToPromptsPage, isExiting = false }) => {
  return (
    <div className="h-full w-full relative">
        <GenericCheatsheetPage
            title="Artists"
            heroText="ARTISTS"
            subtitle="The archival index of influential creators, techniques, and aesthetic pioneers."
            loadDataFn={loadArtists}
            updateDataFn={updateArtist}
            onSendToPromptsPage={(item: CheatsheetItem, category: string) => onSendToPromptsPage({ artist: item.name, artStyle: category })}
            isExiting={isExiting}
        />
    </div>
  );
};

export default ArtistCheatsheet;
