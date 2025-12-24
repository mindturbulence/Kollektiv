
import React, { createContext, useState, useContext, ReactNode, useMemo, useCallback } from 'react';
import { loadLLMSettings, saveLLMSettings } from '../utils/settingsStorage';
import type { LLMSettings } from '../types';

interface SettingsContextType {
  settings: LLMSettings;
  updateSettings: (newSettings: LLMSettings) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<LLMSettings>(loadLLMSettings());

  const updateSettings = useCallback((newSettings: LLMSettings) => {
    setSettings(newSettings);
    saveLLMSettings(newSettings);
  }, []);

  const value = useMemo(() => ({ settings, updateSettings }), [settings, updateSettings]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = (): SettingsContextType => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};