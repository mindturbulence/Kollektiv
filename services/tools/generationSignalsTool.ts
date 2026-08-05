/**
 * Generation Signals Tool — WP10 of the Adaptation Roadmap.
 *
 * Exposes generationSignals as an assistant tool rather than a background
 * daemon (D6: "the assistant proposes the write rather than a daemon doing
 * it silently"). The assistant calls this when the user asks something like
 * "what's actually working?" or "score my generations" — it is never run
 * automatically.
 */

import type { AssistantTool } from './types';
import { scoreAllGenerations, getTopGenerations, getTopGenerationsByBackend } from '../generationSignals';

export const scoreGenerationsTool: AssistantTool = {
  name: 'score_generations',
  description:
    'Re-score every Generation record from implicit signals (survival, publish, param reuse, naming, notes, tags, pinned) ' +
    'and report the current top performers. Call this when the user asks what worked, what to reuse, or wants a ' +
    'quality digest — never run automatically in the background.',
  parameters: {
    type: 'object',
    properties: {
      backendId: {
        type: 'string',
        description: 'Optional: restrict the top-performers list to one backend (e.g. "comfy", "a1111", "mcp:server/tool").',
      },
      limit: {
        type: 'number',
        description: 'Max number of top generations to report. Default 10.',
      },
    },
  },
  execute: async (args) => {
    const scored = await scoreAllGenerations();
    const limit = typeof args.limit === 'number' ? args.limit : 10;
    const backendId = typeof args.backendId === 'string' ? args.backendId : undefined;

    const top = backendId
      ? await getTopGenerationsByBackend(backendId, limit)
      : await getTopGenerations(limit);

    if (top.length === 0) {
      return `Re-scored ${scored} generation(s). No scored generations found${backendId ? ` for backend "${backendId}"` : ''} yet.`;
    }

    const lines = top.map((g, i) =>
      `${i + 1}. score ${g.score?.toFixed(2)} — ${g.backendId} — "${g.promptText.slice(0, 60)}"${g.promptText.length > 60 ? '...' : ''}`
    );

    return [
      `Re-scored ${scored} generation(s). Top ${top.length}${backendId ? ` for ${backendId}` : ''}:`,
      ...lines,
    ].join('\n');
  },
};
