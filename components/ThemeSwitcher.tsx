
import React from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { audioService } from '../services/audioService';

const ThemeSwitcher: React.FC = () => {
  const { settings, updateSettings } = useSettings();

  const isDarkMode = settings.activeThemeMode === 'dark';

  const toggleTheme = () => {
    audioService.playClick();
    const newMode = isDarkMode ? 'light' : 'dark';
    updateSettings({ ...settings, activeThemeMode: newMode });
  };

  return (
    <button
      onClick={toggleTheme}
      onMouseEnter={() => audioService.playHover()}
      className="px-3 py-2 text-base-content/40 hover:text-primary transition-all"
      aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDarkMode ? `Switch to ${settings.lightTheme} theme` : `Switch to ${settings.darkTheme} theme`}
    >
      <span className="text-[10px] font-black tracking-[0.3em] uppercase">Theme</span>
    </button>
  );
};

export default ThemeSwitcher;
