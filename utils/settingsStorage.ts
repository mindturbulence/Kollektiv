
import { LLMSettings } from '../types';
import { clearAllHandles } from './db';
import { fileSystemManager } from './fileUtils';

const SETTINGS_KEY = 'kollektivSettingsV4';

export const defaultLLMSettings: LLMSettings = {
  // LLM Provider Settings
  llmModel: 'gemini-3-flash-preview',
  activeLLM: 'gemini',
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: 'llama3',
  
  // Theme Settings
  activeThemeMode: 'light',
  lightTheme: 'light',
  darkTheme: 'abyss',
  fontSize: 14,

  // Feature Toggles
  features: {
    isPromptLibraryEnabled: true,
    isGalleryEnabled: true,
    isCheatsheetsEnabled: true,
    isToolsEnabled: true,
  },

  // Integrations
  youtube: {
    isConnected: false
  }
};


export const saveLLMSettings = (settings: LLMSettings): void => {
  try {
    if (typeof window !== 'undefined') {
        (window as any).localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }
  } catch (error) {
    console.error("Error saving LLM settings to localStorage:", error);
  }
};

export const loadLLMSettings = (): LLMSettings => {
  try {
    if (typeof window !== 'undefined') {
        const storedSettings = (window as any).localStorage.getItem(SETTINGS_KEY);
        if (storedSettings) {
        const parsed = JSON.parse(storedSettings);
        // Deep merge with defaults to ensure all keys, especially nested ones, are present
        return { 
            ...defaultLLMSettings, 
            ...parsed,
            features: {
                ...defaultLLMSettings.features,
                ...(parsed.features || {})
            },
            youtube: {
              ...defaultLLMSettings.youtube,
              ...(parsed.youtube || {})
            }
        };
        }
    }
  } catch (error) {
    console.error("Error loading LLM settings from localStorage:", error);
  }
  return { ...defaultLLMSettings }; 
};

export const resetAllSettings = async () => {
    // First, clear all files from the managed directory
    await fileSystemManager.reset();
    // Then, remove settings from local storage
    if (typeof window !== 'undefined') {
        (window as any).localStorage.removeItem(SETTINGS_KEY);
    }
    // Finally, clear the directory handles from IndexedDB
    await clearAllHandles();
};
