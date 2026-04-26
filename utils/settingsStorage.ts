
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
  
  // OpenClaw Settings
  openclawBaseUrl: 'http://localhost:18789',
  openclawModel: 'ollama/kimi-k2.5:cloud',
  openclawApiKey: '',
  
  // Prompt & Token Tracking
  masterRolePrompt: 'You are an expert AI prompt engineer and creative director. You excel at extracting precise visual, atmospheric, and conceptual details.',
  geminiTokenUsage: { used: 0, limit: 1000000 },
  ollamaTokenUsage: { used: 0, limit: 500000 },
  openclawTokenUsage: { used: 0, limit: 500000 },

  // Ollama Cloud Settings
  ollamaCloudBaseUrl: 'https://your-remote-ollama.com',
  ollamaCloudModel: 'llama3',
  ollamaCloudApiKey: '',
  ollamaCloudUseGoogleAuth: false,
  
  // Theme Settings
  activeThemeMode: 'dark',
  lightTheme: 'light',
  darkTheme: 'MindTurbulence',
  fontSize: 14,

  // Dashboard Settings
  dashboardVideoUrl: 'https://videos.pexels.com/video-files/35977437/15254965_1920_1080_24fps.mp4',
  isDashboardVideoEnabled: true,

  // Audio Settings
  musicYoutubeUrl: 'https://www.youtube.com/watch?v=jY3A06qWwfw',
  musicEnabled: true,
  idleScreenType: 'matrix',
  isIdleEnabled: true,
  idleTimeoutMinutes: 1,

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
  },
  googleIdentity: {
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
            activeThemeMode: 'dark',
            musicEnabled: parsed.musicEnabled ?? defaultLLMSettings.musicEnabled,
            idleScreenType: parsed.idleScreenType ?? defaultLLMSettings.idleScreenType,
            isIdleEnabled: parsed.isIdleEnabled ?? defaultLLMSettings.isIdleEnabled,
            idleTimeoutMinutes: parsed.idleTimeoutMinutes ?? defaultLLMSettings.idleTimeoutMinutes,
            features: {
                ...defaultLLMSettings.features,
                ...(parsed.features || {})
            },
            geminiTokenUsage: {
                ...defaultLLMSettings.geminiTokenUsage!,
                ...(parsed.geminiTokenUsage || {})
            },
            ollamaTokenUsage: {
                ...defaultLLMSettings.ollamaTokenUsage!,
                ...(parsed.ollamaTokenUsage || {})
            },
            openclawTokenUsage: {
                ...defaultLLMSettings.openclawTokenUsage!,
                ...(parsed.openclawTokenUsage || {})
            },
            youtube: {
              ...defaultLLMSettings.youtube,
              ...(parsed.youtube || {})
            },
            googleIdentity: {
                ...defaultLLMSettings.googleIdentity,
                ...(parsed.googleIdentity || {})
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

export const trackTokenUsage = (provider: 'gemini' | 'ollama' | 'ollama_cloud' | 'openclaw', actualTokens: number): void => {
    const settings = loadLLMSettings();

    if (provider === 'gemini') {
        if (settings.geminiTokenUsage) {
            settings.geminiTokenUsage.used += actualTokens;
            if (settings.geminiTokenUsage.used > settings.geminiTokenUsage.limit) {
                 settings.geminiTokenUsage.used = settings.geminiTokenUsage.limit;
            }
        }
    } else if (provider === 'openclaw') {
        if (settings.openclawTokenUsage) {
            settings.openclawTokenUsage.used += actualTokens;
            if (settings.openclawTokenUsage.used > settings.openclawTokenUsage.limit) {
                settings.openclawTokenUsage.used = settings.openclawTokenUsage.limit;
            }
        }
    } else {
        if (settings.ollamaTokenUsage) {
            settings.ollamaTokenUsage.used += actualTokens;
            if (settings.ollamaTokenUsage.used > settings.ollamaTokenUsage.limit) {
                settings.ollamaTokenUsage.used = settings.ollamaTokenUsage.limit;
           }
        }
    }

    saveLLMSettings(settings);
    // Dispatch event so the SettingsContext or UI can listen and refresh
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('token-usage-updated'));
    }
};
