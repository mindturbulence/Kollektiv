
import { LLMSettings } from '../types';
import { clearAllHandles } from './db';
import { fileSystemManager } from './fileUtils';
import { DEFAULT_ANTHROPIC_MODEL } from '../constants/llmDefaults';

const SETTINGS_KEY = 'kollektivSettingsV4';
const SETTINGS_SHADOW_KEY = 'kollektivSettingsV4_shadow';

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
  musicYoutubeUrl: 'https://www.youtube.com/watch?v=_Iw7dkteKHw',
  musicEnabled: true,
  idleScreenType: 'matrix',
  isIdleEnabled: true,
  idleTimeoutMinutes: 1,

  // Google Cloud API key
  googleApiKey: '',

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
  jpgCompressionQuality: 0.9,

  // Gallery Auto-Tagging
  autoTagEnabled: false,

  // Provider Fallback
  providerFallbackEnabled: false,
  providerFallbackChain: [],

  // Semantic search — local embedding model
  embeddingModel: 'all-minilm:33m',

  // Local generation — ComfyUI / A1111 backend (defaults to cloud)
  generationBackendId: 'cloud',
  comfyUrl: 'http://127.0.0.1:8188',
  a1111Url: 'http://127.0.0.1:7860',
  comfyModel: '',
  a1111Model: '',
  comfySampler: '',
  a1111Sampler: '',
  a1111AdditionalModules: '',

  // Refiner modifier weights
  modifierWeights: {},

  // Voice silence timeout
  voiceSilenceTimeoutMs: 800,
};


export const saveLLMSettings = (settings: LLMSettings): void => {
  try {
    if (typeof window !== 'undefined') {
        const json = JSON.stringify(settings);
        // Dual-write: shadow key serves as crash-recovery fallback.
        // localStorage.setItem is synchronous, so if a crash happens during
        // the first write, the other key still holds the previous good state.
        localStorage.setItem(SETTINGS_SHADOW_KEY, json);
        localStorage.setItem(SETTINGS_KEY, json);
    }
  } catch (error) {
    console.error("Error saving LLM settings to localStorage:", error);
  }
};

function readAndParseSettings(key: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Deep-merge parsed settings with defaults, applying legacy migrations.
 * Extracted so both the primary key and the shadow backup use the same logic.
 */
function mergeSettings(parsed: Record<string, unknown>): LLMSettings {
  const merged: any = { 
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
      googleApiKey: parsed.googleApiKey ?? '',
      anthropicApiKey: parsed.anthropicApiKey ?? '',
      anthropicModel: parsed.anthropicModel ?? DEFAULT_ANTHROPIC_MODEL,
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
      jpgCompressionQuality: parsed.jpgCompressionQuality ?? defaultLLMSettings.jpgCompressionQuality,
      autoTagEnabled: parsed.autoTagEnabled ?? false,
      providerFallbackEnabled: parsed.providerFallbackEnabled ?? false,
      providerFallbackChain: parsed.providerFallbackChain ?? [],
      embeddingModel: parsed.embeddingModel ?? 'all-minilm:33m',
      generationBackendId: parsed.generationBackendId ?? 'cloud',
      comfyUrl: parsed.comfyUrl ?? 'http://127.0.0.1:8188',
      a1111Url: parsed.a1111Url ?? 'http://127.0.0.1:7860',
      comfyModel: parsed.comfyModel ?? '',
      a1111Model: parsed.a1111Model ?? '',
      comfySampler: parsed.comfySampler ?? '',
      a1111Sampler: parsed.a1111Sampler ?? '',
      a1111AdditionalModules: parsed.a1111AdditionalModules ?? '',
      voiceSilenceTimeoutMs: parsed.voiceSilenceTimeoutMs ?? 800
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

  return merged as LLMSettings;
}

/**
 * Validate and repair each section of a settings object independently.
 * Corrupted nested objects are replaced with defaults; valid fields are preserved.
 * Safe to call on any Partial<LLMSettings> — never throws.
 */
export function repairSettings(settings: Partial<LLMSettings>): LLMSettings {
  const repaired = { ...defaultLLMSettings };

  if (!settings || typeof settings !== 'object') return repaired;

  // Copy top-level primitive fields if they have the expected type
  for (const key of Object.keys(defaultLLMSettings) as Array<keyof LLMSettings>) {
    const val = settings[key];
    if (val !== undefined && val !== null) {
      (repaired as any)[key] = val;
    }
  }

  // Repair nested objects section by section
  const tokenKeys = ['geminiTokenUsage', 'ollamaTokenUsage', 'openrouterTokenUsage', 'llamacppTokenUsage', 'anthropicTokenUsage'] as const;
  for (const tk of tokenKeys) {
    const raw = settings[tk];
    if (raw && typeof raw === 'object' && 'used' in raw && 'limit' in raw) {
      (repaired as any)[tk] = {
        ...defaultLLMSettings[tk]!,
        used: typeof (raw as any).used === 'number' ? (raw as any).used : 0,
        limit: typeof (raw as any).limit === 'number' ? (raw as any).limit : defaultLLMSettings[tk]!.limit,
      };
    }
  }

  // Repair integration objects
  const objKeys = ['youtube', 'googleIdentity', 'spotify'] as const;
  for (const ok of objKeys) {
    const raw = settings[ok];
    if (raw && typeof raw === 'object' && 'isConnected' in raw) {
      (repaired as any)[ok] = {
        ...defaultLLMSettings[ok],
        isConnected: typeof (raw as any).isConnected === 'boolean' ? (raw as any).isConnected : false,
      };
    }
  }

  // Repair mcpServers array
  if (Array.isArray(settings.mcpServers)) {
    repaired.mcpServers = settings.mcpServers.filter(
      (s: any) => s && typeof s === 'object' && typeof s.id === 'string',
    );
  }

  return repaired;
}

export const loadLLMSettings = (): LLMSettings => {
  try {
    if (typeof window !== 'undefined') {
        // Try primary key first
        const parsed = readAndParseSettings(SETTINGS_KEY);
        if (parsed) {
          return mergeSettings(parsed);
        }
        // Primary corrupt or absent — try shadow backup
        const shadowParsed = readAndParseSettings(SETTINGS_SHADOW_KEY);
        if (shadowParsed) {
          console.warn('[settingsStorage] Shadow backup used (primary missing or corrupt).');
          return mergeSettings(shadowParsed);
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
        (window as any).localStorage.removeItem(SETTINGS_SHADOW_KEY);
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
