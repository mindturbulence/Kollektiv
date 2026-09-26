import React from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { getNextTheme } from '../constants/themes';
import { audioService } from '../services/audioService';
import { motion } from 'motion/react';
import { PaletteIcon } from './icons';

const ThemeSwitcher: React.FC = () => {
  const { settings, updateSettings } = useSettings();

  const cycleToNextTheme = () => {
    audioService.playClick();
    updateSettings({ ...settings, darkTheme: getNextTheme(settings.darkTheme), activeThemeMode: 'dark' });
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