// Wires the framework-free executor to the app: the Shot runner refines through llmService, everything
// else uses the executor's defaults. Kept out of the page so it can be unit-tested with a mocked service.

import { generateWithVeo, refineSinglePrompt } from '../../services/llmService';
import { addItemToGallery } from '../../utils/galleryStorage';
import { setPreview } from './media';
import type { LLMSettings } from '../../types';
import { buildPrefix, type Runners } from '../core/executor';
import type { EditAction, Graph, NodeRunState } from '../core/types';

/** Only Veo-class models can be generated from here (Gemini key); the rest are copy-and-paste. */
export const canGenerate = (model: string): boolean => /veo/i.test(model);

/** Veo takes 16:9 or 9:16; the refiner's header line carries the ratio. */
export const aspectOf = (script: string): '16:9' | '9:16' => (/^\s*9:16/.test(script) ? '9:16' : '16:9');

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
    // Only Veo-class models run here; every other model passes the prompt through for the Result node to copy.
    generate: async (node, inputs) => {
      if (node.kind !== 'generate') throw new Error(`Node ${node.id} is not a generate node`);
      const text = inputs.map(i => i.output.text).find((t): t is string => !!t?.trim());
      if (!text) throw new Error('Connect a Shot that has a script.');
      if (!canGenerate(node.data.model)) return { text };
      const url = await generateWithVeo(text, undefined, aspectOf(text), settings);
      const item = await addItemToGallery('video', [url], ['Canvas'], { prompt: text, defaultTitle: 'Canvas clip' });
      setPreview(item.id, url);
      return { text, clip: { assetKey: item.id } };
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
