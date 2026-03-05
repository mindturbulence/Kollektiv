import React from 'react';
import { MenuIcon, BookmarkIcon, PowerIcon } from './icons';
import type { ActiveTab } from '../types';
import ThemeSwitcher from './ThemeSwitcher';
import { audioService } from '../services/audioService';

interface HeaderProps {
  onMenuClick: () => void;
  onStandbyClick: (e: React.MouseEvent) => void;
  activeTab: ActiveTab;
  clippedIdeasCount: number;
  onToggleClippingPanel: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick, onStandbyClick, activeTab, clippedIdeasCount, onToggleClippingPanel }) => {

  const pageTitleMap: Record<ActiveTab, string> = {
    dashboard: 'Dashboard',
    prompts: 'Prompt Builder',
    // Added storyboard title to satisfy ActiveTab record requirement
    storyboard: 'Storyboard AI',
    prompt: 'Prompt Library',
    gallery: 'Gallery',
    cheatsheet: 'Guides',
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
    <header className="flex-shrink-0 flex items-center justify-between h-16 px-4 bg-base-100 z-10 border-b border-base-300">
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            audioService.playClick();
            onMenuClick();
          }}
          onMouseEnter={() => audioService.playHover()}
          className="btn btn-sm btn-ghost btn-circle"
          aria-label="Toggle navigation menu"
        >
          <MenuIcon className="w-6 h-6" />
        </button>
        <h2 className="text-lg font-black hidden sm:block">{pageTitle}</h2>
      </div>
      <div className="flex items-center gap-2">
        <div className="contents">
          <button 
            onClick={() => {
              audioService.playClick();
              onToggleClippingPanel();
            }} 
            onMouseEnter={() => audioService.playHover()}
            className="btn btn-ghost btn-circle btn-sm indicator"
          >
              <BookmarkIcon className="w-6 h-6"/>
              {clippedIdeasCount > 0 && <span className="indicator-item badge badge-primary badge-xs">{clippedIdeasCount}</span>}
          </button>
          <ThemeSwitcher />
          <button 
            onClick={(e) => {
                e.stopPropagation();
                audioService.playClick();
                onStandbyClick(e);
            }} 
            onMouseEnter={() => audioService.playHover()}
            onMouseDown={(e) => e.stopPropagation()}
            className="btn btn-sm btn-ghost btn-circle opacity-60 hover:opacity-100 hover:text-primary transition-all"
            title="Manual Standby"
          >
              <PowerIcon className="w-5 h-5"/>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;