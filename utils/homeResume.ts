import type { LLMSettings } from '../types';

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
