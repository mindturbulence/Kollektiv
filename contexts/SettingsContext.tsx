
import React, { createContext, useState, useContext, ReactNode, useMemo, useCallback, useEffect } from 'react';
import { loadLLMSettings, saveLLMSettings } from '../utils/settingsStorage';
import { fetchOllamaModels } from '../services/ollamaService';
import { fetchHermesModels } from '../services/hermesService';
import { fetchOpenRouterModels } from '../services/openrouterService';
import type { LLMSettings } from '../types';

interface SettingsContextType {
  settings: LLMSettings;
  updateSettings: (newSettings: LLMSettings) => void;
  availableOllamaModels: string[];
  availableOllamaCloudModels: string[];
  availableHermesModels: string[];
  availableOpenRouterModels: string[];
  loadingModels: boolean;
  refreshOllamaModels: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<LLMSettings>(loadLLMSettings());
  const [availableOllamaModels, setAvailableOllamaModels] = useState<string[]>([]);
  const [availableOllamaCloudModels, setAvailableOllamaCloudModels] = useState<string[]>([]);
  const [availableHermesModels, setAvailableHermesModels] = useState<string[]>([]);
  const [availableOpenRouterModels, setAvailableOpenRouterModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const updateSettings = useCallback((newSettings: LLMSettings) => {
    setSettings(newSettings);
    saveLLMSettings(newSettings);
  }, []);

  const refreshOllamaModels = useCallback(async () => {
      setLoadingModels(true);
      try {
          const [local, cloud, claw, router] = await Promise.all([
              fetchOllamaModels(settings, false),
              fetchOllamaModels(settings, true),
              fetchHermesModels(settings),
              fetchOpenRouterModels()
          ]);
          setAvailableOllamaModels(local);
          setAvailableOllamaCloudModels(cloud);
          setAvailableHermesModels(claw);
          setAvailableOpenRouterModels(router);
      } finally {
          setLoadingModels(false);
      }
  }, [settings.ollamaBaseUrl, settings.ollamaCloudBaseUrl, settings.hermesBaseUrl, settings.googleIdentity?.accessToken, settings.ollamaCloudApiKey, settings.hermesApiKey, settings.openrouterApiKey]);

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
      availableHermesModels,
      availableOpenRouterModels,
      loadingModels,
      refreshOllamaModels
  }), [settings, updateSettings, availableOllamaModels, availableOllamaCloudModels, availableHermesModels, availableOpenRouterModels, loadingModels, refreshOllamaModels]);

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
