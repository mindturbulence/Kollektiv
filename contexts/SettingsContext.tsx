import React, { createContext, useState, useContext, ReactNode, useMemo, useCallback, useEffect } from 'react';
import { loadLLMSettings, saveLLMSettings } from '../utils/settingsStorage';
import { fetchOllamaModels } from '../services/ollamaService';
import { fetchOpenRouterModels } from '../services/openrouterService';
import { fetchLlamaCppModels } from '../services/llamacppService';
import type { LLMSettings } from '../types';

interface SettingsContextType {
  settings: LLMSettings;
  updateSettings: (newSettings: LLMSettings) => void;
  availableOllamaModels: string[];
  availableOllamaCloudModels: string[];
  availableOpenRouterModels: string[];
  availableLlamaCppModels: string[];
  loadingModels: boolean;
  refreshOllamaModels: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<LLMSettings>(loadLLMSettings());
  const [availableOllamaModels, setAvailableOllamaModels] = useState<string[]>([]);
  const [availableOllamaCloudModels, setAvailableOllamaCloudModels] = useState<string[]>([]);
  const [availableOpenRouterModels, setAvailableOpenRouterModels] = useState<string[]>([]);
  const [availableLlamaCppModels, setAvailableLlamaCppModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const updateSettings = useCallback((newSettings: LLMSettings) => {
    setSettings(newSettings);
    saveLLMSettings(newSettings);
  }, []);

  const refreshOllamaModels = useCallback(async () => {
      setLoadingModels(true);
      try {
          const [local, cloud, router, llamacpp] = await Promise.all([
              fetchOllamaModels(settings, false),
              fetchOllamaModels(settings, true),
              fetchOpenRouterModels(),
              fetchLlamaCppModels(settings)
          ]);
          setAvailableOllamaModels(local);
          setAvailableOllamaCloudModels(cloud);
          setAvailableOpenRouterModels(router);
          setAvailableLlamaCppModels(llamacpp);
      } finally {
          setLoadingModels(false);
      }
  }, [settings.ollamaBaseUrl, settings.ollamaCloudBaseUrl, settings.llamacppBaseUrl, settings.googleIdentity?.accessToken, settings.ollamaCloudApiKey, settings.llamacppApiKey, settings.openrouterApiKey]);

  useEffect(() => {
      refreshOllamaModels().catch(() => {});
  }, [refreshOllamaModels]);

  useEffect(() => {
    const handleSettingsUpdate = () => {
        setSettings(loadLLMSettings());
    };
    if (typeof window !== 'undefined') {
        window.addEventListener('token-usage-updated', handleSettingsUpdate);
        window.addEventListener('settings-updated', handleSettingsUpdate);
        return () => {
            window.removeEventListener('token-usage-updated', handleSettingsUpdate);
            window.removeEventListener('settings-updated', handleSettingsUpdate);
        };
    }
  }, []);

  const value = useMemo(() => ({ 
      settings, 
      updateSettings, 
      availableOllamaModels, 
      availableOllamaCloudModels,
      availableOpenRouterModels,
      availableLlamaCppModels,
      loadingModels,
      refreshOllamaModels
  }), [settings, updateSettings, availableOllamaModels, availableOllamaCloudModels, availableOpenRouterModels, availableLlamaCppModels, loadingModels, refreshOllamaModels]);

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
