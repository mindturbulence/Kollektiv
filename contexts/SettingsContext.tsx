
import React, { createContext, useState, useContext, ReactNode, useMemo, useCallback, useEffect } from 'react';
import { loadLLMSettings, saveLLMSettings } from '../utils/settingsStorage';
import { fetchOllamaModels } from '../services/ollamaService';
import { fetchOpenClawModels } from '../services/openclawService';
import type { LLMSettings } from '../types';

interface SettingsContextType {
  settings: LLMSettings;
  updateSettings: (newSettings: LLMSettings) => void;
  availableOllamaModels: string[];
  availableOllamaCloudModels: string[];
  availableOpenClawModels: string[];
  loadingModels: boolean;
  refreshOllamaModels: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<LLMSettings>(loadLLMSettings());
  const [availableOllamaModels, setAvailableOllamaModels] = useState<string[]>([]);
  const [availableOllamaCloudModels, setAvailableOllamaCloudModels] = useState<string[]>([]);
  const [availableOpenClawModels, setAvailableOpenClawModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const updateSettings = useCallback((newSettings: LLMSettings) => {
    setSettings(newSettings);
    saveLLMSettings(newSettings);
  }, []);

  const refreshOllamaModels = useCallback(async () => {
      setLoadingModels(true);
      try {
          const [local, cloud, claw] = await Promise.all([
              fetchOllamaModels(settings, false),
              fetchOllamaModels(settings, true),
              fetchOpenClawModels(settings)
          ]);
          setAvailableOllamaModels(local);
          setAvailableOllamaCloudModels(cloud);
          setAvailableOpenClawModels(claw);
      } finally {
          setLoadingModels(false);
      }
  }, [settings.ollamaBaseUrl, settings.ollamaCloudBaseUrl, settings.openclawBaseUrl, settings.googleIdentity?.accessToken, settings.ollamaCloudApiKey, settings.openclawApiKey]);

  useEffect(() => {
      refreshOllamaModels();
  }, [refreshOllamaModels]);

  useEffect(() => {
    const handleTokenUpdate = () => {
        setSettings(loadLLMSettings());
    };
    if (typeof window !== 'undefined') {
        window.addEventListener('token-usage-updated', handleTokenUpdate);
        return () => window.removeEventListener('token-usage-updated', handleTokenUpdate);
    }
  }, []);

  const value = useMemo(() => ({ 
      settings, 
      updateSettings, 
      availableOllamaModels, 
      availableOllamaCloudModels,
      availableOpenClawModels,
      loadingModels,
      refreshOllamaModels
  }), [settings, updateSettings, availableOllamaModels, availableOllamaCloudModels, availableOpenClawModels, loadingModels, refreshOllamaModels]);

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
