
import React from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { audioService } from '../services/audioService';
import { motion } from 'framer-motion';
import RollingText from './RollingText';

const ThemeSwitcher: React.FC = () => {
  const { settings, updateSettings } = useSettings();

  const isDarkMode = settings.activeThemeMode === 'dark';

  const toggleTheme = () => {
    audioService.playClick();
    const newMode = isDarkMode ? 'light' : 'dark';
    updateSettings({ ...settings, activeThemeMode: newMode });
  };

  return (
    <motion.button
      onClick={toggleTheme}
      onMouseEnter={() => audioService.playHover()}
      initial="initial"
      whileHover="hover"
      className="group relative px-4 py-2 text-[10px] font-black tracking-[0.4em] uppercase text-base-content/60 hover:text-primary transition-colors duration-300"
      aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDarkMode ? `Switch to ${settings.lightTheme} theme` : `Switch to ${settings.darkTheme} theme`}
    >
      <RollingText 
        text="Theme" 
        hoverClassName="text-primary"
      />
    </motion.button>
  );
};

export default ThemeSwitcher;
