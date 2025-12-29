
import React from 'react';
import { MenuIcon, BookmarkIcon } from './icons';
import type { ActiveTab } from '../types';
import ThemeSwitcher from './ThemeSwitcher';

interface HeaderProps {
  onMenuClick: () => void;
  activeTab: ActiveTab;
  clippedIdeasCount: number;
  onToggleClippingPanel: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick, activeTab, clippedIdeasCount, onToggleClippingPanel }) => {

  const pageTitleMap: Record<ActiveTab, string> = {
    dashboard: 'Dashboard',
    prompts: 'Prompt Builder',
    prompt: 'Prompt Library',
    gallery: 'Gallery',
    cheatsheet: 'Prompting Cheatsheet',
    artstyles: 'Art Style Cheatsheet',
    artists: 'Artist Cheatsheet',
    settings: 'Settings',
    image_compare: 'Image Comparer',
    color_palette_extractor: 'Color Palette Extractor',
    composer: 'Grid Composer',
    resizer: 'Image Resizer',
    video_to_frames: 'Video Tool',
  };

  const pageTitle = pageTitleMap[activeTab] || 'Kollektiv';

  return (
    <header className="flex-shrink-0 flex items-center justify-between h-16 px-4 bg-base-100 border-b border-base-300 z-10">
      <div className="flex items-center gap-2">
        <button
          onClick={onMenuClick}
          className="btn btn-sm btn-ghost btn-circle"
          aria-label="Toggle navigation menu"
        >
          <MenuIcon className="w-6 h-6" />
        </button>
        <h2 className="text-lg font-semibold hidden sm:block">{pageTitle}</h2>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onToggleClippingPanel} className="btn btn-ghost btn-circle btn-sm indicator">
            <BookmarkIcon className="w-6 h-6"/>
            {clippedIdeasCount > 0 && <span className="indicator-item badge badge-primary badge-xs">{clippedIdeasCount}</span>}
        </button>
        <ThemeSwitcher />
      </div>
    </header>
  );
};

export default Header;
