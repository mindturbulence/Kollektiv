/**
 * comfyWorkflows — Default txt2img workflow template in ComfyUI API format.
 *
 * Live-verified 2026-07-28 against a real ComfyUI 0.16.4 instance.
 *
 * Targets a STANDARD checkpoint (SD1.5 / SDXL) only — CheckpointLoaderSimple
 * bundles MODEL + CLIP + VAE in one node (outputs 0/1/2), so a minimal
 * txt2img graph wires everything off node '1' directly. An earlier version
 * of this file used separate CLIPLoader/VAELoader nodes, which is wrong for
 * a standard checkpoint and was confirmed live to fail ComfyUI's validation
 * (CLIPLoader additionally requires a `type` field this workflow never set).
 * Those nodes are for split-encoder checkpoints (Flux, SD3), which need an
 * entirely different graph and are out of scope — import a custom workflow
 * via the field-mapping path for those.
 *
 * Structure:
 *   1: CheckpointLoaderSimple         → loads the model (MODEL/CLIP/VAE)
 *   5: EmptyLatentImage               → defines output dimensions
 *   6: CLIPTextEncode (positive)      → the positive prompt, clip: ['1', 1]
 *   7: CLIPTextEncode (negative)      → the negative prompt, clip: ['1', 1]
 *   8: KSampler                       → the sampling step, model: ['1', 0]
 *   9: VAEDecode                      → decodes latent → image, vae: ['1', 2]
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
  /** Checkpoint filename exactly as returned by /object_info's ckpt_name list. Required — ComfyUI rejects an empty value. */
  ckptName: string;
  /** ComfyUI sampler name (e.g. 'euler', 'dpmpp_2m'). Defaults to 'euler'. */
  samplerName?: string;
}): ComfyWorkflow {
  const p = params;
  return {
    // Checkpoint loader — bundles MODEL, CLIP, and VAE (outputs 0/1/2)
    '1': {
      inputs: { ckpt_name: p.ckptName },
      class_type: 'CheckpointLoaderSimple',
      _meta: { title: 'Load Checkpoint' },
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
    // Positive prompt — uses the checkpoint's own CLIP output
    '6': {
      inputs: {
        text: p.positivePrompt,
        clip: ['1', 1],
      },
      class_type: 'CLIPTextEncode',
      _meta: { title: 'CLIP Text Encode (Positive Prompt)' },
    },
    // Negative prompt — uses the checkpoint's own CLIP output
    '7': {
      inputs: {
        text: p.negativePrompt || '',
        clip: ['1', 1],
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
        sampler_name: p.samplerName || 'euler',
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
    // VAE decode — uses the checkpoint's own VAE output
    '9': {
      inputs: {
        samples: ['8', 0],
        vae: ['1', 2],
      },
      class_type: 'VAEDecode',
      _meta: { title: 'VAE Decode' },
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
