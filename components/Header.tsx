import React, { useState } from 'react';
import type { ActiveTab } from '../types';
import ThemeSwitcher from './ThemeSwitcher';
import { audioService } from '../services/audioService';
import TimedScrambledText from './TimedScrambledText';

interface HeaderProps {
  onMenuClick: () => void;
  onStandbyClick: (e: React.MouseEvent) => void;
  clippedIdeasCount: number;
  onToggleClippingPanel: () => void;
  onNavigate: (tab: ActiveTab) => void;
  onAboutClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick, onStandbyClick, clippedIdeasCount, onToggleClippingPanel, onNavigate, onAboutClick }) => {
  const [scrambleTrigger, setScrambleTrigger] = useState(0);

  return (
    <header className="flex-shrink-0 flex items-center justify-between h-16 px-8 bg-transparent z-10 relative overflow-hidden">
      {/* Technical Scanline Effect */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.02] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]"></div>
      
      <div className="flex items-center gap-2 relative z-10 w-1/3">
        <button
          onClick={() => {
            audioService.playClick();
            onMenuClick();
          }}
          onMouseEnter={() => audioService.playHover()}
          className="px-3 py-2 hover:text-primary transition-colors group relative"
          aria-label="Toggle navigation menu"
        >
          <span className="text-[10px] font-black tracking-[0.3em] text-primary/60 group-hover:text-primary uppercase">Menu</span>
        </button>

        <div className="w-[1px] h-4 bg-base-300/20"></div>

        <button 
          onClick={() => {
            audioService.playClick();
            onAboutClick();
          }}
          onMouseEnter={() => audioService.playHover()}
          className="px-3 py-2 text-base-content/40 hover:text-primary transition-all"
          title="About"
        >
            <span className="text-[10px] font-black tracking-[0.3em] uppercase">About</span>
        </button>

        <ThemeSwitcher />
      </div>

      {/* Center: Logo */}
      <div className="flex-1 flex justify-center items-center relative z-10 w-1/3">
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

      <div className="flex items-center justify-end gap-2 relative z-10 w-1/3">
        <div className="contents">
          <button 
            onClick={() => {
              audioService.playClick();
              onToggleClippingPanel();
            }} 
            onMouseEnter={() => audioService.playHover()}
            className="px-3 py-2 text-base-content/40 hover:text-primary transition-all relative"
          >
              <span className="text-[10px] font-black tracking-[0.3em] uppercase">Clipboard</span>
              {clippedIdeasCount > 0 && <span className="absolute top-1 right-1 badge badge-primary badge-xs scale-75">{clippedIdeasCount}</span>}
          </button>
          
          <button 
            onClick={() => {
              audioService.playClick();
              onNavigate('settings');
            }}
            onMouseEnter={() => audioService.playHover()}
            className="px-3 py-2 text-base-content/40 hover:text-primary transition-all"
            title="Settings"
          >
              <span className="text-[10px] font-black tracking-[0.3em] uppercase">Settings</span>
          </button>

          <button 
            onClick={(e) => {
                e.stopPropagation();
                audioService.playClick();
                onStandbyClick(e);
            }} 
            onMouseEnter={() => audioService.playHover()}
            onMouseDown={(e) => e.stopPropagation()}
            className="px-3 py-2 text-base-content/40 hover:text-primary transition-all"
            title="Manual Standby"
          >
              <span className="text-[10px] font-black tracking-[0.3em] uppercase">Standby</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;