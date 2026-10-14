// "Send to canvas": other pages queue a refined result here; the canvas page drains the queue once its graph
// is loaded. A module-level queue (not the store) because the canvas may not be hydrated when the click happens.

import { createEdge, createNode } from './graph';
import type { EditAction, Graph, XY } from './types';

export interface CanvasIntake {
  /** The user's original idea (becomes the Concept node). */
  concept: string;
  /** Target video model name, or '' when the refiner target is not a video model. */
  model: string;
  durationSec: number;
  /** The refined script (becomes the Shot node's text, flagged edited so a run keeps it). */
  script: string;
}

let pending: CanvasIntake[] = [];

export const queueIntake = (intake: CanvasIntake): void => { pending.push(intake); };

export const takeIntakes = (): CanvasIntake[] => {
  const out = pending;
  pending = [];
  return out;
};

const COLUMN_GAP = 320;
const ROW_GAP = 200;

/** One batch that appends Concept -> Shot pairs below the existing nodes (or at the origin when empty). */
export const intakeToAction = (graph: Graph, intakes: CanvasIntake[]): EditAction | null => {
  if (!intakes.length) return null;
  const bottom = graph.nodes.length ? Math.max(...graph.nodes.map(n => n.position.y)) + ROW_GAP : 0;
  const actions: EditAction[] = [];
  intakes.forEach((it, i) => {
    const at: XY = { x: 0, y: bottom + i * ROW_GAP };
    const concept = createNode('concept', at);
    concept.data = { text: it.concept };
    const shot = createNode('shot', { x: at.x + COLUMN_GAP, y: at.y });
    shot.data = { model: it.model, durationSec: it.durationSec, text: it.script, edited: it.script.trim() !== '' };
    actions.push({ type: 'addNode', node: concept }, { type: 'addNode', node: shot }, { type: 'connect', edge: createEdge(concept.id, shot.id) });
  });
  return { type: 'batch', actions, label: 'Send to canvas' };
};
