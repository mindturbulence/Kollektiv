
import React from 'react';
import type { CheatsheetItem } from '../types';
import { GenericCheatsheetPage } from './GenericCheatsheetPage';
import { loadArtStyles, updateArtStyle } from '../utils/artstyleStorage';

interface ArtstyleCheatsheetProps {
  onSendToPromptsPage: (state: { artStyle: string }) => void;
  isExiting?: boolean;
}

const ArtstyleCheatsheet: React.FC<ArtstyleCheatsheetProps> = ({ onSendToPromptsPage, isExiting = false }) => {
  return (
    <GenericCheatsheetPage
      title="Art Styles"
      heroText="STYLES"
      subtitle="A curated catalog of visual aesthetics, from traditional movements to digital frontiers."
      loadDataFn={loadArtStyles}
      updateDataFn={updateArtStyle}
      onSendToPromptsPage={(item: CheatsheetItem, _category: string) => onSendToPromptsPage({ artStyle: item.name })}
      isExiting={isExiting}
    />
  );
};

export default ArtstyleCheatsheet;
