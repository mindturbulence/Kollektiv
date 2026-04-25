import React from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { DAISYUI_DARK_THEMES } from '../constants';
import { audioService } from '../services/audioService';
import { motion } from 'framer-motion';
import { PaletteIcon } from './icons';

const ThemeSwitcher: React.FC = () => {
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
        className="group p-2 text-primary transition-colors duration-300"
        aria-label="Next Theme"
      >
        <PaletteIcon className="w-4 h-4" />
      </motion.button>
    </div>
  );
};

export default ThemeSwitcher;