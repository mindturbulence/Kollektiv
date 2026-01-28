
import React, { createContext, useState, useContext, ReactNode, useMemo, useCallback, useEffect } from 'react';
import { loadLLMSettings, saveLLMSettings } from '../utils/settingsStorage';
import { fetchOllamaModels } from '../services/ollamaService';
import type { LLMSettings } from '../types';

interface SettingsContextType {
  settings: LLMSettings;
  updateSettings: (newSettings: LLMSettings) => void;
  availableOllamaModels: string[];
  availableOllamaCloudModels: string[];
  loadingModels: boolean;
  refreshOllamaModels: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<LLMSettings>(loadLLMSettings());
  const [availableOllamaModels, setAvailableOllamaModels] = useState<string[]>([]);
  const [availableOllamaCloudModels, setAvailableOllamaCloudModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const updateSettings = useCallback((newSettings: LLMSettings) => {
    setSettings(newSettings);
    saveLLMSettings(newSettings);
  }, []);

  const refreshOllamaModels = useCallback(async () => {
      setLoadingModels(true);
      try {
          const [local, cloud] = await Promise.all([
              fetchOllamaModels(settings, false),
              fetchOllamaModels(settings, true)
          ]);
          setAvailableOllamaModels(local);
          setAvailableOllamaCloudModels(cloud);
      } finally {
          setLoadingModels(false);
      }
  }, [settings.ollamaBaseUrl, settings.ollamaCloudBaseUrl, settings.googleIdentity?.accessToken, settings.ollamaCloudApiKey]);

  useEffect(() => {
      refreshOllamaModels();
  }, [refreshOllamaModels]);

  const value = useMemo(() => ({ 
      settings, 
      updateSettings, 
      availableOllamaModels, 
      availableOllamaCloudModels,
      loadingModels,
      refreshOllamaModels
  }), [settings, updateSettings, availableOllamaModels, availableOllamaCloudModels, loadingModels, refreshOllamaModels]);

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
