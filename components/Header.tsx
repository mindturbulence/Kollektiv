import React, { useState } from 'react';
import type { ActiveTab } from '../types';
import ThemeSwitcher from './ThemeSwitcher';
import { audioService } from '../services/audioService';
import TimedScrambledText from './TimedScrambledText';

import { motion } from 'framer-motion';
import RollingText from './RollingText';

interface HeaderProps {
  onMenuClick: () => void;
  onStandbyClick: (e: React.MouseEvent) => void;
  clippedIdeasCount: number;
  onToggleClippingPanel: () => void;
  onNavigate: (tab: ActiveTab) => void;
  onAboutClick: () => void;
}

const NavItem: React.FC<{
  children: string;
  onClick?: (e: React.MouseEvent) => void;
  onHover?: () => void;
  title?: string;
  badge?: number;
}> = ({ children, onClick, onHover, title, badge }) => {
  return (
    <motion.button
      onClick={onClick}
      onMouseEnter={onHover}
      initial="initial"
      whileHover="hover"
      className="group relative px-4 py-2 text-[10px] font-black tracking-[0.4em] uppercase text-base-content/60 hover:text-primary transition-colors duration-300"
      title={title}
    >
      <RollingText 
        text={children} 
        hoverClassName="text-primary"
      />
      
      {badge !== undefined && badge > 0 && (
        <span className="absolute top-1 right-1 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
        </span>
      )}
    </motion.button>
  );
};

const Header: React.FC<HeaderProps> = ({ onMenuClick, onStandbyClick, clippedIdeasCount, onToggleClippingPanel, onNavigate, onAboutClick }) => {
  const [scrambleTrigger, setScrambleTrigger] = useState(0);

  return (
    <header className="flex-shrink-0 flex items-center justify-between h-16 px-8 bg-transparent z-50 relative overflow-hidden">
      {/* Technical Scanline Effect */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.02] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]"></div>
      
      <div className="flex items-center gap-1 relative z-50 w-1/3">
        <NavItem
          onClick={() => {
            audioService.playClick();
            onMenuClick();
          }}
          onHover={() => audioService.playHover()}
          title="Toggle navigation menu"
        >
          Menu
        </NavItem>

        <div className="w-[1px] h-4 bg-base-300/20 mx-2"></div>

        <NavItem
          onClick={() => {
            audioService.playClick();
            onAboutClick();
          }}
          onHover={() => audioService.playHover()}
          title="About"
        >
          About
        </NavItem>

        <div className="w-[1px] h-4 bg-base-300/20 mx-2"></div>

        <ThemeSwitcher />
      </div>

      {/* Center: Logo */}
      <div className="flex-1 flex justify-center items-center relative z-50 w-1/3">
        <button 
          onClick={() => onNavigate('dashboard')} 
          onMouseEnter={() => {
            audioService.playHover();
            setScrambleTrigger(prev => prev + 1);
          }}
          className="flex items-center gap-3 group"
        >
          <h1 className="text-xl font-black tracking-tighter text-base-content uppercase flex items-center font-logo">
            <span className="font-black">
              <TimedScrambledText text="Kollektiv" intervalMs={300000} trigger={scrambleTrigger} />
            </span>
            <span className="text-primary italic animate-pulse drop-shadow-[0_0_10px_oklch(var(--p))] transition-all inline-block ml-0.5 font-black">.</span>
          </h1>
        </button>
      </div>

      <div className="flex items-center justify-end gap-1 relative z-50 w-1/3">
        <NavItem
          onClick={() => {
            audioService.playClick();
            onToggleClippingPanel();
          }}
          onHover={() => audioService.playHover()}
          badge={clippedIdeasCount}
        >
          Clipboard
        </NavItem>

        <div className="w-[1px] h-4 bg-base-300/20 mx-2"></div>
        
        <NavItem
          onClick={() => {
            audioService.playClick();
            onNavigate('settings');
          }}
          onHover={() => audioService.playHover()}
          title="Settings"
        >
          Settings
        </NavItem>

        <div className="w-[1px] h-4 bg-base-300/20 mx-2"></div>

        <NavItem
          onClick={(e) => {
            e.stopPropagation();
            audioService.playClick();
            onStandbyClick(e);
          }}
          onHover={() => audioService.playHover()}
          title="Manual Standby"
        >
          Standby
        </NavItem>
      </div>
    </header>
  );
};

export default Header;
