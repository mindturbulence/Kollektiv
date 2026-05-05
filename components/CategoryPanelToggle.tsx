
import React from 'react';
import { ChevronLeftIcon } from './icons';
import { audioService } from '../services/audioService';

interface CategoryPanelToggleProps {
  isCollapsed: boolean;
  onToggle: () => void;
  position?: 'left' | 'right';
}

const CategoryPanelToggle: React.FC<CategoryPanelToggleProps> = ({ isCollapsed, onToggle, position = 'right' }) => {
  const isLeftOfPanel = position === 'left'; 

  return (
    <div className={`absolute top-1/2 transform -translate-y-1/2 z-[100] ${isLeftOfPanel ? 'right-full mr-0' : 'left-full ml-0'}`}>
      <button
        onClick={() => {
            if (isCollapsed) {
                audioService.playPanelSlideIn();
            } else {
                audioService.playPanelSlideOut();
            }
            onToggle();
        }}
        title={isCollapsed ? 'Expand Panel' : 'Collapse Panel'}
        className={`w-6 h-12 bg-base-100/80 backdrop-blur-xl text-base-content flex items-center justify-center transition-colors border border-white/10 shadow-lg hover:bg-base-200 focus:outline-none flex-shrink-0 ${isLeftOfPanel ? 'rounded-l-lg' : 'rounded-r-lg'}`}
        aria-label={isCollapsed ? 'Expand Panel' : 'Collapse Panel'}
      >
        <ChevronLeftIcon className={`w-4 h-4 transition-transform duration-300 ${
          isCollapsed 
            ? (isLeftOfPanel ? 'rotate-180' : 'rotate-180') 
            : (isLeftOfPanel ? 'rotate-0' : 'rotate-0')
        }`} />
      </button>
    </div>
  );
};

export default CategoryPanelToggle;
