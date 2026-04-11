
import React, { useState, useEffect, useRef } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { DAISYUI_DARK_THEMES } from '../constants';
import { audioService } from '../services/audioService';
import { motion, AnimatePresence } from 'framer-motion';
import RollingText from './RollingText';
import { ChevronDownIcon } from './icons';

const ThemeSwitcher: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { settings, updateSettings } = useSettings();
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetTimeout = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 5000);
  };

  useEffect(() => {
    if (isOpen) resetTimeout();
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [isOpen]);

  const handleThemeSelect = (theme: string) => {
    audioService.playClick();
    updateSettings({ ...settings, darkTheme: theme, activeThemeMode: 'dark' });
    setIsOpen(false);
  };

  return (
    <div className="relative pointer-events-auto" onMouseMove={resetTimeout}>
      <motion.button
        onClick={() => {
            audioService.playClick();
            setIsOpen(!isOpen);
        }}
        onMouseEnter={() => audioService.playHover()}
        initial="initial"
        whileHover="hover"
        className={`group relative uppercase transition-colors duration-300 flex items-center gap-2 ${compact ? 'px-3 py-1 text-[10px] font-black tracking-[0.4em] text-base-content/60 hover:text-primary' : 'px-4 py-2 text-[10px] font-black tracking-[0.4em] text-base-content/60 hover:text-primary'}`}
        aria-label="Select Theme"
      >
        <RollingText 
          text="Theme" 
          hoverClassName="text-primary"
        />
        <ChevronDownIcon className={`w-2.5 h-2.5 transition-transform ${isOpen ? 'rotate-180' : ''} opacity-40`} />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            className="absolute top-full left-0 mt-2 min-w-[180px] bg-base-100 backdrop-blur-3xl border border-base-300/50 shadow-2xl z-[2000] max-h-[60vh] overflow-y-auto custom-scrollbar"
          >
            <ul className="menu p-1">
              <li className="menu-title px-3 pt-2 pb-1 text-[9px] uppercase tracking-[0.3em] opacity-70 font-black text-primary border-b border-base-300/10 mb-1">
                <span>Dark Protocols</span>
              </li>
              {DAISYUI_DARK_THEMES.map(theme => (
                <li key={theme}>
                  <button 
                    onClick={() => handleThemeSelect(theme)} 
                    className={`rounded-none text-[10px] font-black uppercase tracking-widest py-3 w-full text-left px-4 ${settings.darkTheme === theme ? 'text-primary bg-primary/10' : 'text-base-content/80 hover:text-base-content hover:bg-base-200/50'}`}
                  >
                    {theme}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ThemeSwitcher;
