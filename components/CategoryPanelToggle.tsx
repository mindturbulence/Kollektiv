
import React from 'react';
import { ChevronLeftIcon } from './icons';

interface CategoryPanelToggleProps {
  isCollapsed: boolean;
  onToggle: () => void;
  position?: 'left' | 'right';
}

const CategoryPanelToggle: React.FC<CategoryPanelToggleProps> = ({ isCollapsed, onToggle, position = 'right' }) => {
  const isRightOfPanel = position === 'right'; 
  
  return (
    <div className={`absolute top-1/2 transform -translate-y-1/2 z-20 ${isRightOfPanel ? '-right-3' : '-left-3'}`}>
      <button
        onClick={onToggle}
        title={isCollapsed ? 'Expand Panel' : 'Collapse Panel'}
        className={`w-6 h-12 bg-base-100 text-base-content flex items-center justify-center shadow-lg transition-colors focus:outline-none ${isRightOfPanel ? 'rounded-r-lg' : 'rounded-l-lg'}`}
        aria-label={isCollapsed ? 'Expand Panel' : 'Collapse Panel'}
      >
        <ChevronLeftIcon className={`w-4 h-4 transition-transform duration-300 ${
          isCollapsed 
            ? (isRightOfPanel ? 'rotate-180' : 'rotate-0') 
            : (isRightOfPanel ? 'rotate-0' : 'rotate-180')
        }`} />
      </button>
    </div>
  );
};

export default CategoryPanelToggle;
