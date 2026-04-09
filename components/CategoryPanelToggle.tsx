
import React from 'react';
import { ChevronLeftIcon } from './icons';

interface CategoryPanelToggleProps {
  isCollapsed: boolean;
  onToggle: () => void;
  position?: 'left' | 'right';
}

const CategoryPanelToggle: React.FC<CategoryPanelToggleProps> = ({ isCollapsed, onToggle, position = 'right' }) => {
  const isLeftOfPanel = position === 'left'; 
  
  return (
    <div className={`absolute top-1/2 transform -translate-y-1/2 z-50 ${isLeftOfPanel ? '-left-3' : '-right-3'}`}>
      <button
        onClick={onToggle}
        title={isCollapsed ? 'Expand Panel' : 'Collapse Panel'}
        className={`w-6 h-12 bg-base-100/60 backdrop-blur-xl text-base-content flex items-center justify-center transition-colors focus:outline-none ${isLeftOfPanel ? 'rounded-l-lg' : 'rounded-r-lg'}`}
        aria-label={isCollapsed ? 'Expand Panel' : 'Collapse Panel'}
      >
        <ChevronLeftIcon className={`w-4 h-4 transition-transform duration-300 ${
          isCollapsed 
            ? (isLeftOfPanel ? 'rotate-0' : 'rotate-180') 
            : (isLeftOfPanel ? 'rotate-180' : 'rotate-0')
        }`} />
      </button>
    </div>
  );
};

export default CategoryPanelToggle;
