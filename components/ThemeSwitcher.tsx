import React from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { DAISYUI_DARK_THEMES } from '../constants';
import { audioService } from '../services/audioService';
import RollingText from './RollingText';
import { motion } from 'framer-motion';

const ThemeSwitcher: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { settings, updateSettings } = useSettings();

  const cycleToNextTheme = () => {
    audioService.playClick();
    const currentIndex = DAISYUI_DARK_THEMES.indexOf(settings.darkTheme);
    const nextIndex = (currentIndex + 1) % DAISYUI_DARK_THEMES.length;
    updateSettings({ ...settings, darkTheme: DAISYUI_DARK_THEMES[nextIndex], activeThemeMode: 'dark' });
  };

  return (
    <div className="relative pointer-events-auto">
      <motion.button
        initial="initial"
        whileHover="hover"
        onClick={cycleToNextTheme}
        onMouseEnter={() => audioService.playHover()}
        className={`uppercase transition-colors duration-300 flex items-center gap-2 ${compact ? 'px-3 py-1 text-[10px] font-black tracking-[0.4em] text-base-content/60' : 'px-4 py-2 text-[10px] font-black tracking-[0.4em] text-base-content/60'}`}
        aria-label="Next Theme"
      >
        <RollingText 
          text="Theme" 
          hoverClassName="text-primary"
        />
      </motion.button>
    </div>
  );
};

export default ThemeSwitcher;