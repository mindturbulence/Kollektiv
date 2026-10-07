/**
 * designAgents — the agents offered in the "For agents" card of UseRecipeModal. The choice is cosmetic: it only
 * picks a usage hint and is remembered. The compiled prompt never depends on it (plan decision 9).
 */

export const DESIGN_AGENTS = [
  { id: 'claude-code', label: 'Claude Code', hint: 'Open a terminal in your project folder, start Claude Code, then paste the prompt.' },
  { id: 'codex', label: 'Codex', hint: 'Open a terminal in your project folder, start Codex, then paste the prompt.' },
  { id: 'gemini-cli', label: 'Gemini CLI', hint: 'Open a terminal in your project folder, start Gemini CLI, then paste the prompt.' },
  { id: 'cursor', label: 'Cursor', hint: 'Open your project in Cursor, open the agent chat, then paste the prompt.' },
  { id: 'other', label: 'Other', hint: 'Paste the prompt into any coding agent that can read files in your project.' },
] as const;

export type DesignAgentId = (typeof DESIGN_AGENTS)[number]['id'];

export const DEFAULT_AGENT: DesignAgentId = 'claude-code';

const AGENT_KEY = 'kollektiv.designAgent';

const isAgentId = (v: unknown): v is DesignAgentId => DESIGN_AGENTS.some((a) => a.id === v);

/** Storage may be blocked or hold junk: any failure yields the default. */
export function loadAgent(): DesignAgentId {
  try {
    const raw = localStorage.getItem(AGENT_KEY);
    return isAgentId(raw) ? raw : DEFAULT_AGENT;
  } catch {
    return DEFAULT_AGENT;
  }
}

export function saveAgent(id: DesignAgentId): void {
  try {
    localStorage.setItem(AGENT_KEY, id);
  } catch {
    // Remembering the agent is a convenience only.
  }
}
