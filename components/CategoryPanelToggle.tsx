
import React from 'react';
import { ChevronLeftIcon } from './icons';

interface CategoryPanelToggleProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

const CategoryPanelToggle: React.FC<CategoryPanelToggleProps> = ({ isCollapsed, onToggle }) => {
  return (
    <div className={`absolute top-1/2 -right-3 transform -translate-y-1/2 z-20`}>
      <button
        onClick={onToggle}
        title={isCollapsed ? 'Expand Panel' : 'Collapse Panel'}
        className="w-6 h-12 bg-base-100 text-base-content rounded-r-lg flex items-center justify-center shadow-lg transition-colors focus:outline-none"
        aria-label={isCollapsed ? 'Expand Panel' : 'Collapse Panel'}
      >
        <ChevronLeftIcon className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : 'rotate-0'}`} />
      </button>
    </div>
  );
};

export default CategoryPanelToggle;
