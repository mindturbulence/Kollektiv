
import React from 'react';
import type { CheatsheetItem } from '../types';
import { GenericCheatsheetPage } from './GenericCheatsheetPage';
import { loadArtStyles, updateArtStyle } from '../utils/artstyleStorage';

interface ArtstyleCheatsheetProps {
  onSendToPromptsPage: (state: { artStyle: string }) => void;
}

const ArtstyleCheatsheet: React.FC<ArtstyleCheatsheetProps> = ({ onSendToPromptsPage }) => {
  return (
    <GenericCheatsheetPage
      title="Art Styles"
      heroText="STYLES"
      subtitle="A curated catalog of visual aesthetics, from traditional movements to digital frontiers."
      loadDataFn={loadArtStyles}
      updateDataFn={updateArtStyle}
      onSendToPromptsPage={(item: CheatsheetItem, _category: string) => onSendToPromptsPage({ artStyle: item.name })}
    />
  );
};

export default ArtstyleCheatsheet;
