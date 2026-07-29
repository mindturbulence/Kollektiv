import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveLLMSettings,
  loadLLMSettings,
  defaultLLMSettings,
  trackTokenUsage,
  repairSettings,
} from './settingsStorage';
import type { LLMSettings } from '../types';

// ── Helpers ──

const SETTINGS_KEY = 'kollektivSettingsV4';
const SETTINGS_SHADOW_KEY = 'kollektivSettingsV4_shadow';

beforeEach(() => {
  const store = new Map<string, string>();
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(
    (key: string) => store.get(key) ?? null,
  );
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
    (key: string, value: string) => { store.set(key, value); },
  );
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(
    (key: string) => { store.delete(key); },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ──

describe('saveLLMSettings', () => {
  it('persists full settings object to localStorage as JSON', () => {
    const settings = { ...defaultLLMSettings, geminiApiKey: 'test-key' };
    saveLLMSettings(settings);

    const raw = localStorage.getItem(SETTINGS_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual(settings);
  });

  it('survives a round-trip: save → load returns identical object', () => {
    const settings: LLMSettings = {
      ...defaultLLMSettings,
      geminiApiKey: 'AIza-roundtrip',
      assistantName: 'RoundTrip',
      activeThemeMode: 'dark',
      lightTheme: 'cupcake',
      storageProvider: 'drive',
      driveFolderId: 'folder-xyz',
    };
    saveLLMSettings(settings);

    const loaded = loadLLMSettings();
    expect(loaded.geminiApiKey).toBe('AIza-roundtrip');
    expect(loaded.assistantName).toBe('RoundTrip');
    expect(loaded.lightTheme).toBe('cupcake');
    expect(loaded.storageProvider).toBe('drive');
    expect(loaded.driveFolderId).toBe('folder-xyz');
  });
});

describe('loadLLMSettings — deep merge', () => {
  it('returns full defaults when nothing is stored', () => {
    const loaded = loadLLMSettings();
    expect(loaded).toEqual(defaultLLMSettings);
  });

  it('deep merges partial saved state with defaults', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      geminiApiKey: 'partial-key',
      assistantName: 'Partial',
    }));

    const loaded = loadLLMSettings();
    expect(loaded.geminiApiKey).toBe('partial-key');
    expect(loaded.assistantName).toBe('Partial');
    // All other fields come from defaults
    expect(loaded.ollamaBaseUrl).toBe(defaultLLMSettings.ollamaBaseUrl);
    expect(loaded.activeLLM).toBe(defaultLLMSettings.activeLLM);
  });

  it('preserves nested objects on merge (token usage, youtube, spotify)', () => {
    const saved = {
      geminiTokenUsage: { used: 500, limit: 1000000 },
      youtube: { isConnected: true },
      spotify: { isConnected: true },
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(saved));

    const loaded = loadLLMSettings();
    expect(loaded.geminiTokenUsage).toEqual({ used: 500, limit: 1000000 });
    expect(loaded.youtube).toEqual({ isConnected: true });
    expect(loaded.spotify).toEqual({ isConnected: true });
    // Other token usage objects stay at defaults
    expect(loaded.ollamaTokenUsage).toEqual(defaultLLMSettings.ollamaTokenUsage);
    expect(loaded.openrouterTokenUsage).toEqual(defaultLLMSettings.openrouterTokenUsage);
    expect(loaded.llamacppTokenUsage).toEqual(defaultLLMSettings.llamacppTokenUsage);
    expect(loaded.anthropicTokenUsage).toEqual(defaultLLMSettings.anthropicTokenUsage);
  });

  it('handles corrupted JSON gracefully — falls back to defaults', () => {
    localStorage.setItem(SETTINGS_KEY, '{{garbage}');
    const loaded = loadLLMSettings();
    expect(loaded).toEqual(defaultLLMSettings);
  });

  it('handles null stored value gracefully', () => {
    localStorage.setItem(SETTINGS_KEY, 'null');
    const loaded = loadLLMSettings();
    expect(loaded).toEqual(defaultLLMSettings);
  });
});

describe('loadLLMSettings — legacy migrations', () => {
  it('migrates mcpServerUrl/mcpEnabled to mcpServers array', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      mcpServerUrl: 'http://mcp.example.com',
      mcpEnabled: true,
    }));

    const loaded = loadLLMSettings();
    expect(Array.isArray(loaded.mcpServers)).toBe(true);
    expect(loaded.mcpServers).toHaveLength(1);
    expect(loaded.mcpServers[0].url).toBe('http://mcp.example.com');
    expect(loaded.mcpServers[0].enabled).toBe(true);
    expect((loaded as any).mcpServerUrl).toBeUndefined();
    expect((loaded as any).mcpEnabled).toBeUndefined();
  });

  it('migrates Hermes provider to Gemini', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      activeLLM: 'hermes',
    }));

    const loaded = loadLLMSettings();
    expect(loaded.activeLLM).toBe('gemini');
  });

  it('migrates lofi theme to arwes', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      darkTheme: 'lofi',
    }));

    const loaded = loadLLMSettings();
    expect(loaded.darkTheme).toBe('arwes');
  });

  it('coerces null mcpServers to empty array', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      mcpServers: null,
    }));

    const loaded = loadLLMSettings();
    expect(Array.isArray(loaded.mcpServers)).toBe(true);
    expect(loaded.mcpServers).toHaveLength(0);
  });
});

describe('loadLLMSettings — dashboardBackgroundType inference', () => {
  it('falls back to "video" when isDashboardVideoEnabled is true', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      isDashboardVideoEnabled: true,
    }));

    const loaded = loadLLMSettings();
    expect(loaded.dashboardBackgroundType).toBe('video');
  });

  it('falls back to "none" when isDashboardVideoEnabled is false', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      isDashboardVideoEnabled: false,
    }));

    const loaded = loadLLMSettings();
    expect(loaded.dashboardBackgroundType).toBe('none');
  });

  it('does not override an explicit dashboardBackgroundType', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      dashboardBackgroundType: 'image',
      isDashboardVideoEnabled: false,
    }));

    const loaded = loadLLMSettings();
    expect(loaded.dashboardBackgroundType).toBe('image');
  });
});

describe('saveLLMSettings — shadow backup', () => {
  it('writes to both primary and shadow keys', () => {
    const settings = { ...defaultLLMSettings, geminiApiKey: 'shadow-test' };
    saveLLMSettings(settings);

    const primaryRaw = localStorage.getItem(SETTINGS_KEY);
    const shadowRaw = localStorage.getItem(SETTINGS_SHADOW_KEY);
    expect(primaryRaw).not.toBeNull();
    expect(shadowRaw).not.toBeNull();
    expect(JSON.parse(primaryRaw!)).toEqual(settings);
    expect(JSON.parse(shadowRaw!)).toEqual(settings);
  });
});

describe('loadLLMSettings — shadow recovery', () => {
  it('returns defaults when both primary and shadow are absent', () => {
    const loaded = loadLLMSettings();
    expect(loaded).toEqual(defaultLLMSettings);
  });

  it('falls back to shadow when primary has corrupt JSON', () => {
    localStorage.setItem(SETTINGS_KEY, '{{garbage}}');
    localStorage.setItem(SETTINGS_SHADOW_KEY, JSON.stringify({ geminiApiKey: 'from-shadow' }));

    const loaded = loadLLMSettings();
    expect(loaded.geminiApiKey).toBe('from-shadow');
  });

  it('falls back to shadow when primary is absent', () => {
    localStorage.setItem(SETTINGS_SHADOW_KEY, JSON.stringify({ geminiApiKey: 'shadow-only' }));

    const loaded = loadLLMSettings();
    expect(loaded.geminiApiKey).toBe('shadow-only');
  });

  it('uses primary when both exist and primary is valid', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ geminiApiKey: 'primary' }));
    localStorage.setItem(SETTINGS_SHADOW_KEY, JSON.stringify({ geminiApiKey: 'shadow' }));

    const loaded = loadLLMSettings();
    expect(loaded.geminiApiKey).toBe('primary');
  });
});

describe('repairSettings', () => {
  it('preserves valid fields, replaces corrupted nested objects with defaults', () => {
    const repaired = repairSettings({
      geminiApiKey: 'keep-me',
      geminiTokenUsage: { used: 'bad' as any, limit: 1_000_000 },
      youtube: null as any,
      mcpServers: [{ id: 'valid', name: 'OK', url: '', enabled: true }, { name: 'no-id' } as any],
    });

    expect(repaired.geminiApiKey).toBe('keep-me');
    expect(repaired.geminiTokenUsage?.used).toBe(0); // corrupted → reset to default
    expect(repaired.geminiTokenUsage?.limit).toBe(1_000_000); // preserved
    expect(repaired.youtube).toEqual({ isConnected: false }); // corrupted → default
    expect(repaired.mcpServers).toHaveLength(1); // only the valid entry
    expect(repaired.mcpServers[0].id).toBe('valid');
  });

  it('returns full defaults for an empty input', () => {
    const repaired = repairSettings({});
    expect(repaired).toEqual(defaultLLMSettings);
  });

  it('never throws on unexpected input', () => {
    expect(() => repairSettings(null as any)).not.toThrow();
    expect(() => repairSettings(undefined as any)).not.toThrow();
    expect(() => repairSettings({ geminiTokenUsage: 'totally-wrong' as any })).not.toThrow();
  });
});

describe('trackTokenUsage', () => {
  it('increments token usage and caps at limit', () => {
    // Start with a known usage
    const initial: Partial<LLMSettings> = {
      geminiTokenUsage: { used: 999_900, limit: 1_000_000 },
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(initial));

    trackTokenUsage('gemini', 500);

    const loaded = loadLLMSettings();
    expect(loaded.geminiTokenUsage!.used).toBe(1_000_000); // capped
  });

  it('dispatches token-usage-updated event', () => {
    let eventFired = false;
    window.addEventListener('token-usage-updated', () => { eventFired = true; });

    const initial: Partial<LLMSettings> = {
      geminiTokenUsage: { used: 100, limit: 1_000_000 },
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(initial));
    trackTokenUsage('gemini', 50);

    expect(eventFired).toBe(true);
  });
});

describe('autoTagEnabled', () => {
  it('defaults to false', () => {
    expect(defaultLLMSettings.autoTagEnabled).toBe(false);
  });

  it('survives a save/load round trip when enabled', () => {
    saveLLMSettings({ ...defaultLLMSettings, autoTagEnabled: true });
    expect(loadLLMSettings().autoTagEnabled).toBe(true);
  });

  it('falls back to false when absent from stored settings', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ activeLLM: 'gemini' }));
    expect(loadLLMSettings().autoTagEnabled).toBe(false);
  });
});

describe('provider fallback settings', () => {
  it('defaults to disabled with an empty chain', () => {
    expect(defaultLLMSettings.providerFallbackEnabled).toBe(false);
    expect(defaultLLMSettings.providerFallbackChain).toEqual([]);
  });

  it('survives a save/load round trip', () => {
    saveLLMSettings({ ...defaultLLMSettings, providerFallbackEnabled: true, providerFallbackChain: ['ollama'] });
    const loaded = loadLLMSettings();
    expect(loaded.providerFallbackEnabled).toBe(true);
    expect(loaded.providerFallbackChain).toEqual(['ollama']);
  });

  it('falls back to safe defaults when absent', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ activeLLM: 'gemini' }));
    const loaded = loadLLMSettings();
    expect(loaded.providerFallbackEnabled).toBe(false);
    expect(loaded.providerFallbackChain).toEqual([]);
  });
});

describe('local generation model persistence', () => {
  it('defaults to an empty string for both backends', () => {
    expect(defaultLLMSettings.comfyModel).toBe('');
    expect(defaultLLMSettings.a1111Model).toBe('');
  });

  it('survives a save/load round trip', () => {
    saveLLMSettings({ ...defaultLLMSettings, comfyModel: 'sd15.safetensors', a1111Model: 'SDXL\\eXcursion_XL.safetensors' });
    const loaded = loadLLMSettings();
    expect(loaded.comfyModel).toBe('sd15.safetensors');
    expect(loaded.a1111Model).toBe('SDXL\\eXcursion_XL.safetensors');
  });

  it('falls back to empty strings when absent from stored settings', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ activeLLM: 'gemini' }));
    const loaded = loadLLMSettings();
    expect(loaded.comfyModel).toBe('');
    expect(loaded.a1111Model).toBe('');
  });
});

describe('local generation sampler persistence', () => {
  it('defaults to an empty string for both backends', () => {
    expect(defaultLLMSettings.comfySampler).toBe('');
    expect(defaultLLMSettings.a1111Sampler).toBe('');
  });

  it('survives a save/load round trip', () => {
    saveLLMSettings({ ...defaultLLMSettings, comfySampler: 'dpmpp_2m', a1111Sampler: 'DPM++ 2M Karras' });
    const loaded = loadLLMSettings();
    expect(loaded.comfySampler).toBe('dpmpp_2m');
    expect(loaded.a1111Sampler).toBe('DPM++ 2M Karras');
  });

  it('falls back to empty strings when absent from stored settings', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ activeLLM: 'gemini' }));
    const loaded = loadLLMSettings();
    expect(loaded.comfySampler).toBe('');
    expect(loaded.a1111Sampler).toBe('');
  });
});
