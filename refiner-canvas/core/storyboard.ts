// Storyboard split: one idea -> N shot briefs (one LLM call), laid out as Concept -> Shot pairs that keep the
// presets which fed the original idea's shots, so character and world text stays shared across every shot.

import { createEdge, createNode, downstreamOf } from './graph';
import type { EditAction, Graph } from './types';

export const MAX_SHOTS = 8;

export const buildStoryboardPrompt = (idea: string, count: number): { system: string; user: string } => ({
  system: `You split one video idea into a short sequence of shots for a continuous story.
Output ONLY a JSON array of exactly ${count} strings. Each string is one shot brief: one or two sentences covering what the camera sees and what happens, in chronological order, consistent subject and setting, nothing repeated between shots. No keys, no numbering, no commentary.`,
  user: `Idea: ${idea}\nNumber of shots: ${count}`,
});

const stripBullet = (l: string): string => l.replace(/^\s*(?:\d+[.)]|[-*•])\s+/, '').trim();

/** Briefs from a JSON array (possibly fenced) or, failing that, one brief per numbered / bulleted / plain line. */
export const parseBriefs = (raw: string, max: number = MAX_SHOTS): string[] => {
  const unfenced = raw.replace(/```[a-z]*\n?|```/gi, '').trim();
  const start = unfenced.indexOf('[');
  const end = unfenced.lastIndexOf(']');
  if (start !== -1 && end > start) {
    try {
      const arr: unknown = JSON.parse(unfenced.slice(start, end + 1));
      if (Array.isArray(arr)) {
        const out = arr.filter((x): x is string => typeof x === 'string').map(s => s.trim()).filter(Boolean);
        if (out.length) return out.slice(0, max);
      }
    } catch { /* fall through to the line parser */ }
  }
  return unfenced.split('\n').map(stripBullet).filter(l => l && !/^[[\]{}]$/.test(l)).slice(0, max);
};

const COLUMN_GAP = 320;
const ROW_GAP = 200;

/** One undoable batch: a Concept + Shot per brief, linked, with the original shots' presets copied onto each new shot. */
export const storyboardToAction = (
  graph: Graph,
  conceptId: string,
  briefs: string[],
  defaults: { model: string; durationSec: number },
): EditAction | null => {
  if (!briefs.length || !graph.nodes.some(n => n.id === conceptId && n.kind === 'concept')) return null;
  const reachable = downstreamOf(graph, [conceptId]);
  const presetIds = new Set(
    graph.edges
      .filter(e => reachable.has(e.target) && graph.nodes.find(n => n.id === e.source)?.kind === 'preset')
      .map(e => e.source),
  );
  const bottom = Math.max(...graph.nodes.map(n => n.position.y)) + ROW_GAP;
  const actions: EditAction[] = [];
  briefs.forEach((brief, i) => {
    const y = bottom + i * ROW_GAP;
    const concept = createNode('concept', { x: 0, y });
    concept.data = { text: brief };
    const shot = createNode('shot', { x: COLUMN_GAP, y });
    shot.data = { model: defaults.model, durationSec: defaults.durationSec, text: '', edited: false };
    actions.push({ type: 'addNode', node: concept }, { type: 'addNode', node: shot }, { type: 'connect', edge: createEdge(concept.id, shot.id) });
    for (const p of presetIds) actions.push({ type: 'connect', edge: createEdge(p, shot.id) });
  });
  return { type: 'batch', actions, label: 'Split into shots' };
};
