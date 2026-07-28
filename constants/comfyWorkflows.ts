/**
 * comfyWorkflows — Default txt2img workflow template in ComfyUI API format.
 *
 * This is a minimal txt2img workflow with the standard ComfyUI node layout.
 * Node IDs must match the workflow exported via ComfyUI's "Save (API Format)".
 *
 * Structure:
 *   1: CheckpointLoaderSimple         → loads the model
 *   4: CLIPLoader                     → loads CLIP
 *   5: EmptyLatentImage               → defines output dimensions
 *   6: CLIPTextEncode (positive)      → the positive prompt
 *   7: CLIPTextEncode (negative)      → the negative prompt
 *   8: KSampler                       → the sampling step
 *   9: VAEDecode                      → decodes latent → image
 *   10: VAELoader                     → loads the VAE
 *   12: SaveImage                     → saves the output
 */

export interface ComfyWorkflow {
  [nodeId: string]: {
    inputs: Record<string, any>;
    class_type: string;
    _meta?: { title: string };
  };
}

/**
 * A minimal txt2img workflow using KSampler.
 * Node IDs are commented for readability; the API uses numeric strings.
 */
export function createDefaultWorkflow(params: {
  positivePrompt: string;
  negativePrompt?: string;
  seed: number;
  steps: number;
  cfg: number;
  width: number;
  height: number;
}): ComfyWorkflow {
  const p = params;
  return {
    // Checkpoint loader (model)
    '1': {
      inputs: { ckpt_name: '' }, // populated by the backend from settings
      class_type: 'CheckpointLoaderSimple',
      _meta: { title: 'Load Checkpoint' },
    },
    // CLIP loader
    '4': {
      inputs: { clip_name: '' }, // populated by the backend
      class_type: 'CLIPLoader',
      _meta: { title: 'Load CLIP' },
    },
    // Empty latent (output dimensions)
    '5': {
      inputs: {
        width: p.width,
        height: p.height,
        batch_size: 1,
      },
      class_type: 'EmptyLatentImage',
      _meta: { title: 'Empty Latent Image' },
    },
    // Positive prompt
    '6': {
      inputs: {
        text: p.positivePrompt,
        clip: ['4', 0],
      },
      class_type: 'CLIPTextEncode',
      _meta: { title: 'CLIP Text Encode (Positive Prompt)' },
    },
    // Negative prompt
    '7': {
      inputs: {
        text: p.negativePrompt || '',
        clip: ['4', 0],
      },
      class_type: 'CLIPTextEncode',
      _meta: { title: 'CLIP Text Encode (Negative Prompt)' },
    },
    // KSampler
    '8': {
      inputs: {
        seed: p.seed,
        steps: p.steps,
        cfg: p.cfg,
        sampler_name: 'euler',
        scheduler: 'normal',
        denoise: 1,
        model: ['1', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0],
      },
      class_type: 'KSampler',
      _meta: { title: 'KSampler' },
    },
    // VAE decode
    '9': {
      inputs: {
        samples: ['8', 0],
        vae: ['10', 0],
      },
      class_type: 'VAEDecode',
      _meta: { title: 'VAE Decode' },
    },
    // VAE loader
    '10': {
      inputs: { vae_name: '' }, // populated by the backend
      class_type: 'VAELoader',
      _meta: { title: 'Load VAE' },
    },
    // Save image (output)
    '12': {
      inputs: {
        filename_prefix: 'kollektiv_comfy',
        images: ['9', 0],
      },
      class_type: 'SaveImage',
      _meta: { title: 'Save Image' },
    },
  };
}

/**
 * Substitute runtime values into a workflow loaded from JSON.
 * Walks the graph and writes the values into the matching node inputs.
 */
export function substituteWorkflow(
  workflow: ComfyWorkflow,
  params: {
    positivePrompt: string;
    negativePrompt?: string;
    seed: number;
    steps: number;
    cfg: number;
    width: number;
    height: number;
    modelNode?: { nodeId: string; field: string }; // e.g. ['1', 'ckpt_name']
    clipNode?: { nodeId: string; field: string };
    vaeNode?: { nodeId: string; field: string };
    positiveNode?: { nodeId: string; field: string };
    negativeNode?: { nodeId: string; field: string };
    seedNode?: { nodeId: string; field: string };
    stepsNode?: { nodeId: string; field: string };
    cfgNode?: { nodeId: string; field: string };
    widthNode?: { nodeId: string; field: string };
    heightNode?: { nodeId: string; field: string };
  },
): ComfyWorkflow {
  const w = JSON.parse(JSON.stringify(workflow)) as ComfyWorkflow;

  const writes: Array<[string, string, any]> = [];

  if (params.modelNode) writes.push([params.modelNode.nodeId, params.modelNode.field, '']);
  if (params.clipNode) writes.push([params.clipNode.nodeId, params.clipNode.field, '']);
  if (params.vaeNode) writes.push([params.vaeNode.nodeId, params.vaeNode.field, '']);
  if (params.positiveNode) writes.push([params.positiveNode.nodeId, params.positiveNode.field, params.positivePrompt]);
  if (params.negativeNode) writes.push([params.negativeNode.nodeId, params.negativeNode.field, params.negativePrompt || '']);
  if (params.seedNode) writes.push([params.seedNode.nodeId, params.seedNode.field, params.seed]);
  if (params.stepsNode) writes.push([params.stepsNode.nodeId, params.stepsNode.field, params.steps]);
  if (params.cfgNode) writes.push([params.cfgNode.nodeId, params.cfgNode.field, params.cfg]);
  if (params.widthNode) writes.push([params.widthNode.nodeId, params.widthNode.field, params.width]);
  if (params.heightNode) writes.push([params.heightNode.nodeId, params.heightNode.field, params.height]);

  for (const [nodeId, field, value] of writes) {
    if (!w[nodeId]) {
      throw new Error(`ComfyUI workflow: node "${nodeId}" not found in workflow`);
    }
    if (w[nodeId].inputs[field] === undefined) {
      throw new Error(`ComfyUI workflow: node "${nodeId}" has no input field "${field}"`);
    }
    w[nodeId].inputs[field] = value;
  }

  return w;
}
