import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveLLMSettings,
  loadLLMSettings,
  defaultLLMSettings,
  resetAllSettings,
  trackTokenUsage,
} from './settingsStorage';
import type { LLMSettings } from '../types';

// ── Helpers ──

const SETTINGS_KEY = 'kollektivSettingsV4';

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

// ── Helpers to build partial state ──

function makePartial(overrides: Partial<LLMSettings>): Partial<LLMSettings> {
  return overrides;
}

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
      activeThemeMode: 'light',
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
