// Wires the framework-free executor to the app: the Shot runner refines through llmService, everything
// else uses the executor's defaults. Kept out of the page so it can be unit-tested with a mocked service.

import { refineSinglePrompt } from '../../services/llmService';
import type { LLMSettings } from '../../types';
import { buildPrefix, type Runners } from '../core/executor';
import type { EditAction, Graph, NodeRunState } from '../core/types';

export function createRunners(settings: LLMSettings): Runners {
  return {
    shot: async (node, inputs) => {
      if (node.kind !== 'shot') throw new Error(`Node ${node.id} is not a shot`);
      // A hand-edited script is kept; the inspector's Regenerate clears `edited` first.
      if (node.data.edited && node.data.text.trim()) return { text: node.data.text };
      const prefix = buildPrefix(inputs);
      if (!prefix) {
        // Nothing upstream to refine from: a hand-written script is the output as it stands.
        if (node.data.text.trim()) return { text: node.data.text };
        throw new Error('Connect a Concept or Preset with text, or type a script.');
      }
      if (!node.data.model) throw new Error('Pick a target model for this shot.');
      const text = await refineSinglePrompt(prefix, node.data.model, settings, {
        videoDuration: String(node.data.durationSec),
        videoInputType: 't2v',
      });
      return { text };
    },
    // ponytail: audio direction is not applied to the shot prompt yet; the node passes through so wiring it is harmless.
    audio: () => Promise.resolve({}),
  };
}

/** Called for every executor state change. A finished Shot writes its refined script into the node
 *  (so the inspector and autosave see it) BEFORE the store learns it is done, otherwise the data
 *  change would flip the fresh result straight back to 'dirty'. */
export function applyRunState(
  graph: Graph,
  nodeId: string,
  state: NodeRunState,
  dispatch: (action: EditAction) => void,
  setRunState: (nodeId: string, state: NodeRunState) => void,
): void {
  const node = graph.nodes.find(n => n.id === nodeId);
  const text = state.output?.text;
  if (state.status === 'done' && node?.kind === 'shot' && text !== undefined && text !== node.data.text) {
    dispatch({ type: 'updateNodeData', nodeId, patch: { text, edited: false } });
  }
  setRunState(nodeId, state);
}
