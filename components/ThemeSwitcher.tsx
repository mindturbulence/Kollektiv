
import React from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { SunIcon, MoonIcon } from './icons';
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
      className="btn btn-ghost btn-circle btn-sm"
      aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDarkMode ? `Switch to ${settings.lightTheme} theme` : `Switch to ${settings.darkTheme} theme`}
    >
      {isDarkMode ? (
        <SunIcon className="w-6 h-6" />
      ) : (
        <MoonIcon className="w-6 h-6" />
      )}
    </button>
  );
};

export default ThemeSwitcher;
