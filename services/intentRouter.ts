/**
 * Intent Router — Layer 2 of the MCP Architecture.
 *
 * Classifies a user's natural-language request into a structured intent
 * that the Planner (Layer 3) can break into steps.
 *
 * The router uses a lightweight keyword/pattern approach for local
 * classification, with the option to escalate to an LLM for ambiguous
 * requests.  Classification is intentionally simple — this is NOT an
 * agent loop, just a request router.
 */

import { capabilityRegistry } from './capabilityRegistry';

// ─── Types ────────────────────────────────────────────────────────────────

export type IntentCategory =
  | 'prompt_refinement'
  | 'media_generation'
  | 'assistant_action'
  | 'analysis'
  | 'retrieval'
  | 'navigation'
  | 'settings_change'
  | 'vault_operation'
  | 'web_action'
  | 'unknown';

export interface RouterIntent {
  /** How the request was classified. */
  category: IntentCategory;
  /** The capability id that best matches, if one was found. */
  capabilityId?: string;
  /** Confidence score 0-1. */
  confidence: number;
  /** Raw user input. */
  rawInput: string;
  /** Extracted entities (free-form, capability-specific). */
  entities?: Record<string, any>;
}

// ─── Heuristic patterns ───────────────────────────────────────────────────
// Maps keyword patterns to intent categories.  Simple substring matching
// is sufficient for the vast majority of requests; LLM escalation is
// reserved for low-confidence matches.

interface Pattern {
  category: IntentCategory;
  keywords: string[];
  /** Optional capability id to suggest. */
  capability?: string;
}

const PATTERNS: Pattern[] = [
  {
    category: 'prompt_refinement',
    keywords: ['refine', 'improve prompt', 'polish', 'enhance', 'make better', 'rewrite', 'reconstruct', 'translate prompt'],
    capability: 'refine_prompt',
  },
  {
    category: 'media_generation',
    keywords: ['generate', 'create image', 'create video', 'make a picture', 'draw', 'render', 'imagen', 'veo'],
    capability: 'generate_image',
  },
  {
    category: 'analysis',
    keywords: ['analyze', 'dissect', 'break down', 'explain', 'what does this', 'abstract image', 'analyze prompt'],
    capability: 'analyze_prompt',
  },
  {
    category: 'retrieval',
    keywords: ['search', 'find', 'look up', 'remember', 'what do you know', 'list', 'show me'],
    capability: 'search_memories',
  },
  {
    category: 'navigation',
    keywords: ['go to', 'open', 'navigate', 'take me to', 'show the', 'switch to', 'dashboard', 'settings', 'gallery'],
    capability: 'navigate',
  },
  {
    category: 'settings_change',
    keywords: ['change setting', 'update setting', 'set my', 'switch model', 'change theme', 'dark mode', 'light mode'],
    capability: 'update_settings',
  },
  {
    category: 'vault_operation',
    keywords: ['save to vault', 'write note', 'create note', 'save file', 'vault'],
    capability: 'save_file',
  },
  {
    category: 'web_action',
    keywords: ['search web', 'browse', 'fetch url', 'open page', 'web search', 'google search'],
    capability: 'web_search',
  },
  {
    category: 'assistant_action',
    keywords: ['remember', 'forget', 'note that', 'save this', 'clip', 'remind'],
  },
];

// ─── Router ───────────────────────────────────────────────────────────────

/**
 * Classify a raw user input into an intent.
 *
 * Simple substring matching with a confidence score based on how many
 * keywords matched and how early in the input they appeared.
 */
export function classifyIntent(input: string): RouterIntent {
  const lower = input.toLowerCase().trim();
  if (!lower) {
    return { category: 'unknown', confidence: 0, rawInput: input };
  }

  let best: { pattern: Pattern; score: number; matchedKeywords: string[] } | null = null;

  for (const pattern of PATTERNS) {
    const matched = pattern.keywords.filter(kw => lower.includes(kw));

    if (matched.length === 0) continue;

    // Score based on matched count, keyword density, and early-position bonus.
    const matchRatio = matched.length / pattern.keywords.length;
    const earliestPos = Math.min(
      ...matched.map(kw => {
        const idx = lower.indexOf(kw);
        return idx === -1 ? Infinity : idx;
      }),
    );
    const positionBonus = earliestPos < lower.length * 0.3 ? 0.15 : 0;
    const score = Math.min(matchRatio + positionBonus, 1.0);

    if (!best || score > best.score) {
      best = { pattern, score, matchedKeywords: matched };
    }
  }

  if (!best || best.score < 0.2) {
    return { category: 'unknown', confidence: 0, rawInput: input };
  }

  return {
    category: best.pattern.category,
    capabilityId: best.pattern.capability,
    confidence: best.score,
    rawInput: input,
    entities: extractEntities(input, best.pattern.category),
  };
}

// ─── Entity extraction helpers ────────────────────────────────────────────
// Each category may extract specific entities from the raw input.

function extractEntities(input: string, category: IntentCategory): Record<string, any> {
  switch (category) {
    case 'navigation': {
      // Extract the target page name
      const pageMatch = input.match(/(?:go to|open|navigate to?|take me to|show (?:the|me))\s+['"]?(\w+[\w\s]*)['"]?/i);
      return pageMatch ? { page: pageMatch[1].trim().toLowerCase() } : {};
    }
    case 'media_generation': {
      const promptMatch = input.match(/(?:generate|create|make|render|draw)\s+(?:a|an|the|some|me)?\s*(?:image|picture|video)?\s*(?:of|with)?\s*['"]?(.+?)['"]?\s*(?:using|with|via|on)?\s*(\w+)?\s*$/i);
      if (promptMatch) {
        const result: Record<string, any> = {};
        if (promptMatch[1] && promptMatch[1].length < 100) result.prompt = promptMatch[1].trim();
        if (promptMatch[2]) result.model = promptMatch[2].trim().toLowerCase();
        return result;
      }
      return {};
    }
    case 'analysis': {
      const targetMatch = input.match(/(?:analyze|dissect|break down|explain)\s+(?:this\s+)?(?:prompt|image)?\s*['"]?(.+?)['"]?\s*$/i);
      return targetMatch ? { target: targetMatch[1].trim() } : {};
    }
    default:
      return {};
  }
}

/**
 * Check whether a capability exists in the registry that matches the
 * given intent category.  Returns the first matching capability id or
 * undefined.
 */
export function findCapabilityForIntent(category: IntentCategory): string | undefined {
  // Map category to likely capability ids
  const candidates: Record<IntentCategory, string[]> = {
    prompt_refinement: ['refine_prompt', 'rewrite_prompt', 'translate_prompt'],
    media_generation: ['generate_image', 'generate_and_ingest'],
    assistant_action: ['save_note', 'remember', 'clip_idea'],
    analysis: ['analyze_prompt', 'abstract_image'],
    retrieval: ['search_memories', 'search_prompts', 'web_search'],
    navigation: ['navigate'],
    settings_change: ['update_settings'],
    vault_operation: ['save_file', 'obsidian_write_note'],
    web_action: ['web_search', 'fetch_url', 'open_web_page'],
    unknown: [],
  };

  const ids = candidates[category];
  for (const id of ids) {
    if (capabilityRegistry.get(id)) return id;
  }
  return undefined;
}
