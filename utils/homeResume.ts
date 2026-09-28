import type { ActiveTab, LLMSettings } from '../types';
import { NAV_GROUPS, toNavTab } from '../constants/navigation';

/** Newest-first by `createdAt`, capped at `limit`. Does not mutate the input. */
export function latestByCreatedAt<T extends { createdAt: number }>(items: readonly T[], limit: number): T[] {
  return [...items].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

export interface RecentTool {
  tab: ActiveTab;
  label: string;
  group: string;
}

/** Resolves tab history to labelled nav entries, collapsing aliases (`prompts` → Crafter) and dropping unknown tabs. */
export function resolveRecentTools(tabs: readonly ActiveTab[]): RecentTool[] {
  const out: RecentTool[] = [];
  for (const raw of tabs) {
    const tab = toNavTab(raw);
    if (out.some(t => t.tab === tab)) continue;
    for (const g of NAV_GROUPS) {
      const item = g.singleId === tab ? { label: g.label } : g.items.find(i => i.id === tab);
      if (item) {
        out.push({ tab, label: item.label, group: g.label });
        break;
      }
    }
  }
  return out;
}

/**
 * Whether the selected text provider can be called. Local providers ship with a
 * default base URL, so they count as configured without probing the network.
 */
export function isAiProviderConfigured(s: LLMSettings, envGeminiKey: string = process.env.GEMINI_API_KEY ?? ''): boolean {
  switch (s.activeLLM) {
    case 'gemini': return !!(s.geminiApiKey || envGeminiKey);
    case 'openrouter': return !!s.openrouterApiKey;
    case 'anthropic': return s.anthropicConnectionMode === 'subscription' ? !!s.anthropicSubscriptionUrl : !!s.anthropicApiKey;
    case 'ollama_cloud': return !!s.ollamaCloudApiKey || s.ollamaCloudUseGoogleAuth;
    case 'ollama': return !!s.ollamaBaseUrl;
    case 'llamacpp': return !!s.llamacppBaseUrl;
    default: return false;
  }
}
