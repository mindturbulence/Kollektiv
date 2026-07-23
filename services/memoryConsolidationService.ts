/**
 * Memory Consolidation Service
 *
 * Reads recent conversation logs, analyzes them via the user's configured LLM,
 * and updates AGENT.md — a curated long-term memory file kept under 1000 words.
 *
 * Flow:
 *  1. Read current AGENT.md from vault (or start fresh)
 *  2. Read recent session logs (or accept inline conversation text)
 *  3. Call LLM to identify new patterns, preferences, and projects
 *  4. Generate updated AGENT.md content
 *  5. Write back to vault & update in-memory cache
 */

import type { LLMSettings } from '../types';
import { streamChat } from './llmService';
import { syncAgentMemoryToVault } from '../utils/memoryStorage';

const MAX_WORDS = 1000;

/**
 * The system prompt used to guide the LLM during consolidation.
 * Instructs the model on the AGENT.md format and what to extract.
 */
const CONSOLIDATION_SYSTEM_PROMPT = `You are a memory consolidation AI. Your task: analyze conversation logs and update AGENT.md — a curated memory file that helps an AI assistant remember user preferences, active projects, recurring patterns, and knowledge.

## AGENT.md Format
The file has YAML frontmatter then sections. Keep the total under 1000 words.

\`\`\`markdown
---
version: 1
last_updated: <ISO timestamp>
session_count: <total sessions analyzed>
---

# Agent Memory

## User Profile
- Bullet points about the user's identity, preferences, and goals.
- Example: Preferred model: Flux
- Example: Language: English

## Active Context
- What the user is currently working on.
- Recent focus areas from the last few sessions.

## Learned Patterns
- Recurring behaviors, preferences, and workflows observed.
- Example: User prefers longer, cinematic-style prompts with detailed lighting descriptions.

## Projects
- Named projects the user has mentioned, with status (active/paused/done).
- Example: Obsidian Second Brain — memory consolidation pipeline (active)

## Knowledge Graph
- Simple relationship triples: Subject → relation → Object.
- Example: User → prefers → Flux
\`\`\`

## Instructions
1. Read the EXISTING AGENT.md content (if any).
2. Read the RECENT SESSION LOGS (or conversation text) below.
3. Compare new sessions against existing memory:
   - ADD new preferences, facts, or patterns not already recorded.
   - UPDATE any information that has changed (e.g., new preferred model).
   - REMOVE outdated or contradicted information.
   - PRESERVE everything that is still accurate.
4. When consolidating, prefer:
   - Specific, concrete observations over vague ones.
   - Facts mentioned multiple times across sessions (higher confidence).
   - Recently mentioned projects as "active", older ones as "paused" or omit.
5. Output ONLY the complete, updated AGENT.md content. No explanations, no markdown code fences.
6. Keep the total under ${MAX_WORDS} words — be concise.`;

/**
 * Default AGENT.md template for first-time initialization.
 */
export function createInitialAgentMemory(): string {
    const now = new Date().toISOString();
    return [
        '---',
        'version: 1',
        `last_updated: ${now}`,
        'session_count: 0',
        '---',
        '',
        '# Agent Memory',
        '',
        '## User Profile',
        '- *No preferences recorded yet — they will be learned from conversations.*',
        '',
        '## Active Context',
        '- *Nothing active yet.*',
        '',
        '## Learned Patterns',
        '- *No patterns observed yet.*',
        '',
        '## Projects',
        '- *No projects tracked yet.*',
        '',
        '## Knowledge Graph',
        '- *No relationships mapped yet.*',
        '',
    ].join('\n');
}

/**
 * Parse session_count from existing AGENT.md frontmatter.
 */
function parseSessionCount(content: string): number {
    const match = content.match(/^session_count:\s*(\d+)/m);
    return match ? parseInt(match[1], 10) : 0;
}

/**
 * Count approximate tool_use markers or assistant response blocks as "sessions".
 * We increment by 1 for each batch of conversation provided.
 */
function bumpSessionCount(prevContent: string, increment = 1): string {
    const count = parseSessionCount(prevContent) + increment;
    return prevContent.replace(/^session_count:\s*\d+/m, `session_count: ${count}`);
}

/**
 * Update the last_updated timestamp in AGENT.md frontmatter.
 */
function updateTimestamp(content: string): string {
    const now = new Date().toISOString();
    return content.replace(/^last_updated:.*/m, `last_updated: ${now}`);
}

/**
 * Consolidate recent conversation logs into AGENT.md.
 *
 * @param sessionText  Raw text of recent conversation(s) to analyze.
 * @param settings     LLMSettings for the LLM call.
 * @param existingContent  Optional — the current AGENT.md content. If omitted,
 *                         reads from vault cache or creates initial version.
 * @returns The updated AGENT.md content.
 */
export async function consolidateMemory(
    sessionText: string,
    settings: LLMSettings,
    existingContent?: string,
): Promise<string> {
    // 1. Determine current AGENT.md content
    let currentMd: string;
    if (existingContent !== undefined) {
        currentMd = existingContent;
    } else {
        // Try to read from memoryStorage's cache (it may have been loaded)
        const { getAgentMemoryBlock } = await import('../utils/memoryStorage');
        const cached = getAgentMemoryBlock();
        currentMd = cached || createInitialAgentMemory();
    }

    // 2. Bump session count
    currentMd = bumpSessionCount(currentMd);
    currentMd = updateTimestamp(currentMd);

    // 3. Prepare the LLM call
    const userMessage = [
        '## Existing AGENT.md\n',
        currentMd,
        '\n## Recent Session Logs\n',
        sessionText || '(No new session content — just refreshing the file.)',
    ].join('\n');

    // 4. Call the user's configured LLM
    // Force the assistant's provider, not the activeLLM (which may be
    // the Crafter/Refiner engine). streamChat routes on activeLLM.
    const chatSettings: LLMSettings = {
        ...settings,
        activeLLM: (settings.assistantProvider || 'gemini') as LLMSettings['activeLLM'],
        masterRolePrompt: '',
    };
    let result = '';
    try {
        const generator = streamChat(
            [
                { role: 'system', content: CONSOLIDATION_SYSTEM_PROMPT },
                { role: 'user', content: userMessage },
            ],
            chatSettings,
        );
        for await (const chunk of generator) {
            result += chunk;
        }
    } catch (err) {
        // If LLM call fails, keep existing content
        console.error('Memory consolidation LLM call failed:', err);
        return currentMd;
    }

    // 5. Validate result has at least the basic structure
    const trimmed = result.trim();
    if (!trimmed || !trimmed.startsWith('---')) {
        // LLM didn't produce valid AGENT.md — fall back to existing
        return currentMd;
    }

    // 6. Persist to vault and update in-memory cache
    await syncAgentMemoryToVault(trimmed);

    return trimmed;
}

/**
 * One-shot: read a list of session summaries from the vault, then consolidate
 * them into AGENT.md. Convenience wrapper that reads session logs automatically.
 *
 * @param sessionSummaries  Array of session log markdown strings (from sessionLogger).
 * @param settings          LLMSettings for the LLM call.
 */
export async function consolidateFromSessionLogs(
    sessionSummaries: string[],
    settings: LLMSettings,
): Promise<string> {
    const combinedText = sessionSummaries.length
        ? sessionSummaries.join('\n\n---\n\n')
        : '(No recent session logs found.)';

    return consolidateMemory(combinedText, settings);
}
