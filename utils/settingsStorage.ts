
import { LLMSettings } from '../types';
import { clearAllHandles } from './db';
import { fileSystemManager } from './fileUtils';

const SETTINGS_KEY = 'kollektivSettingsV4';

export const defaultLLMSettings: LLMSettings = {
  // LLM Provider Settings
  geminiApiKey: '',
  llmModel: 'gemini-3-flash-preview',
  activeLLM: 'gemini',
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: 'llama3',
  
  // OpenRouter Settings
  openrouterApiKey: '',
  openrouterModel: 'openrouter/auto',
  
  // Llama.cpp Settings
  llamacppBaseUrl: 'http://localhost:8080',
  llamacppModel: 'default',
  llamacppApiKey: '',
  
  // Anthropic Settings
  anthropicApiKey: '',
  anthropicModel: 'claude-3-7-sonnet-20250219',
  anthropicConnectionMode: 'api_key',
  anthropicSubscriptionUrl: 'http://localhost:8000',
  anthropicSubscriptionKey: '',

  // Tensor Art Settings
  tensorartApiKey: '',
  
  // Prompt & Token Tracking
  masterRolePrompt: 'You are an expert AI prompt engineer and creative director. You excel at extracting precise visual, atmospheric, and conceptual details.',
  geminiTokenUsage: { used: 0, limit: 1000000 },
  ollamaTokenUsage: { used: 0, limit: 500000 },
  openrouterTokenUsage: { used: 0, limit: 1000000 },
  llamacppTokenUsage: { used: 0, limit: 500000 },
  anthropicTokenUsage: { used: 0, limit: 1000000 },

  // Ollama Cloud Settings
  ollamaCloudBaseUrl: 'https://your-remote-ollama.com',
  ollamaCloudModel: 'llama3',
  ollamaCloudApiKey: '',
  ollamaCloudUseGoogleAuth: false,

  // MCP Server Settings
  mcpServers: [],

  // AI Assistant Persona
  assistantName: 'Kollektiv',
  assistantVoice: 'Kore',
  assistantLanguage: '',
  assistantPersonality: '',

  // Theme Settings
  activeThemeMode: 'dark',
  lightTheme: 'light',
  darkTheme: 'Kollektiv',
  fontSize: 14,

  // Dashboard Settings
  dashboardVideoUrl: 'https://videos.pexels.com/video-files/35977437/15254965_1920_1080_24fps.mp4',
  isDashboardVideoEnabled: true,
  dashboardBackgroundType: 'video',
  dashboardImageUrl: '/background-large.jpg',

  // Audio Settings
  musicYoutubeUrl: 'https://www.youtube.com/watch?v=jY3A06qWwfw',
  musicEnabled: true,
  idleScreenType: 'matrix',
  isIdleEnabled: true,
  idleTimeoutMinutes: 1,

  // Integrations
  youtube: {
    isConnected: false
  },
  googleIdentity: {
    isConnected: false
  },
  spotify: {
    isConnected: false
  },
  storageProvider: 'local',
  driveFolderId: '',
  driveFolderName: '',
  
  // Gallery
  convertImageToJpgLocal: false,
  convertImageToJpgDrive: true,
  jpgCompressionQuality: 0.9
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
        const merged = { 
            ...defaultLLMSettings, 
            ...parsed,
            dashboardBackgroundType: parsed.dashboardBackgroundType || (parsed.isDashboardVideoEnabled === false ? 'none' : 'video'),
            activeThemeMode: 'dark',
            musicEnabled: parsed.musicEnabled ?? defaultLLMSettings.musicEnabled,
            idleScreenType: parsed.idleScreenType ?? defaultLLMSettings.idleScreenType,
            isIdleEnabled: parsed.isIdleEnabled ?? defaultLLMSettings.isIdleEnabled,
            idleTimeoutMinutes: parsed.idleTimeoutMinutes ?? defaultLLMSettings.idleTimeoutMinutes,
            geminiTokenUsage: {
                ...defaultLLMSettings.geminiTokenUsage!,
                ...(parsed.geminiTokenUsage || {})
            },
            ollamaTokenUsage: {
                ...defaultLLMSettings.ollamaTokenUsage!,
                ...(parsed.ollamaTokenUsage || {})
            },
            openrouterTokenUsage: {
                ...defaultLLMSettings.openrouterTokenUsage!,
                ...(parsed.openrouterTokenUsage || {})
            },
            llamacppTokenUsage: {
                ...defaultLLMSettings.llamacppTokenUsage!,
                ...(parsed.llamacppTokenUsage || {})
            },
            anthropicTokenUsage: {
                ...defaultLLMSettings.anthropicTokenUsage!,
                ...(parsed.anthropicTokenUsage || {})
            },
            anthropicApiKey: parsed.anthropicApiKey ?? '',
            anthropicModel: parsed.anthropicModel ?? 'claude-3-7-sonnet-20250219',
            anthropicConnectionMode: parsed.anthropicConnectionMode ?? 'api_key',
            anthropicSubscriptionUrl: parsed.anthropicSubscriptionUrl ?? 'http://localhost:8000',
            anthropicSubscriptionKey: parsed.anthropicSubscriptionKey ?? '',
            youtube: {
              ...defaultLLMSettings.youtube,
              ...(parsed.youtube || {})
            },
            googleIdentity: {
                ...defaultLLMSettings.googleIdentity,
                ...(parsed.googleIdentity || {})
            },
            spotify: {
                ...defaultLLMSettings.spotify,
                ...(parsed.spotify || {})
            },
            storageProvider: parsed.storageProvider || 'local',
            driveFolderId: parsed.driveFolderId ?? '',
            driveFolderName: parsed.driveFolderName ?? '',
            convertImageToJpgLocal: parsed.convertImageToJpgLocal ?? defaultLLMSettings.convertImageToJpgLocal,
            convertImageToJpgDrive: parsed.convertImageToJpgDrive ?? defaultLLMSettings.convertImageToJpgDrive,
            jpgCompressionQuality: parsed.jpgCompressionQuality ?? defaultLLMSettings.jpgCompressionQuality
        };

        if (merged.darkTheme === 'lofi') {
            merged.darkTheme = 'arwes';
        }

        // legacy: Hermes provider removed 2026-07
        if (merged.activeLLM === ('hermes' as any)) {
            merged.activeLLM = 'gemini';
        }

        // legacy: migrate single mcpServerUrl/mcpEnabled to mcpServers array
        if ((merged as any).mcpServerUrl && !Array.isArray(merged.mcpServers?.length)) {
            const oldUrl = String((merged as any).mcpServerUrl || '');
            const oldEnabled = Boolean((merged as any).mcpEnabled);
            if (oldUrl) {
                merged.mcpServers = [{
                    id: 'mcp-server-1',
                    name: 'MCP Server',
                    url: oldUrl,
                    enabled: oldEnabled,
                }];
            }
            delete (merged as any).mcpServerUrl;
            delete (merged as any).mcpEnabled;
        }
        if (!Array.isArray(merged.mcpServers)) merged.mcpServers = [];

        return merged;
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

export const trackTokenUsage = (provider: 'gemini' | 'ollama' | 'ollama_cloud' | 'openrouter' | 'llamacpp' | 'anthropic', actualTokens: number): void => {
    const settings = loadLLMSettings();

    if (provider === 'gemini') {
        if (settings.geminiTokenUsage) {
            settings.geminiTokenUsage.used += actualTokens;
            if (settings.geminiTokenUsage.used > settings.geminiTokenUsage.limit) {
                 settings.geminiTokenUsage.used = settings.geminiTokenUsage.limit;
            }
        }
    } else if (provider === 'openrouter') {
        if (settings.openrouterTokenUsage) {
            settings.openrouterTokenUsage.used += actualTokens;
            if (settings.openrouterTokenUsage.used > settings.openrouterTokenUsage.limit) {
                settings.openrouterTokenUsage.used = settings.openrouterTokenUsage.limit;
            }
        }
    } else if (provider === 'llamacpp') {
        if (settings.llamacppTokenUsage) {
            settings.llamacppTokenUsage.used += actualTokens;
            if (settings.llamacppTokenUsage.used > settings.llamacppTokenUsage.limit) {
                settings.llamacppTokenUsage.used = settings.llamacppTokenUsage.limit;
            }
        }
    } else if (provider === 'anthropic') {
        if (settings.anthropicTokenUsage) {
            settings.anthropicTokenUsage.used += actualTokens;
            if (settings.anthropicTokenUsage.used > settings.anthropicTokenUsage.limit) {
                settings.anthropicTokenUsage.used = settings.anthropicTokenUsage.limit;
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
