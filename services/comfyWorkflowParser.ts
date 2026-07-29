export interface ComfyNodeTarget {
  nodeId: string;
  fieldPath: string;
}

export interface ComfyWorkflowSchema {
  workflowName: string;
  rawPromptJson: Record<string, any>;
  targetInputs: {
    positivePrompt: ComfyNodeTarget[];
    negativePrompt: ComfyNodeTarget[];
    seed: ComfyNodeTarget[];
    steps: ComfyNodeTarget[];
    cfg: ComfyNodeTarget[];
    samplerName: ComfyNodeTarget[];
  };
}

/**
 * A saved custom workflow entry, tying a schema to a display name and id.
 */
export interface SavedWorkflowEntry {
  id: string;
  label: string;
  schema: ComfyWorkflowSchema;
  createdAt: number;
}

// ── Format detection ───────────────────────────────────────────────────

/**
 * Detect if a JSON blob is in ComfyUI prompt-request format
 * (keys = node IDs, values have `class_type` + `inputs`) vs.
 * the web-ui export format (has `nodes` array).
 */
export function isPromptRequestFormat(json: Record<string, any>): boolean {
  const keys = Object.keys(json);
  if (keys.length === 0) return false;
  // Prompt-request format: at least one key has a `class_type` string
  return keys.some((k) => {
    const node = json[k];
    return node && typeof node === 'object' && typeof node.class_type === 'string';
  });
}

/**
 * Attempt to convert a ComfyUI web-ui export (with `nodes` array) into
 * prompt-request format. Returns null if the input doesn't match the
 * expected shape or conversion fails.
 */
export function convertComfyUIExportToPromptRequest(
  raw: Record<string, any>,
): Record<string, any> | null {
  const nodes = raw.nodes;
  if (!Array.isArray(nodes)) return null;

  const result: Record<string, any> = {};

  for (const node of nodes) {
    const id = node.id ?? node.node_id;
    if (id == null) continue;
    const nodeId = String(id);

    const inputs: Record<string, any> = {};
    // Node inputs from the connections array
    if (Array.isArray(node.inputs)) {
      for (const inp of node.inputs) {
        // inp can be { name, type, link } or a simple value
        if (inp && typeof inp === 'object' && 'name' in inp) {
          // If it has a link, it's connected to another node
          if (inp.link != null) {
            inputs[inp.name] = [String(inp.link), 0];
          }
        }
      }
    }
    // widgets_values are positional — order depends on the widget definition
    const widgets = node.widgets_values;
    if (Array.isArray(widgets) && typeof node.type === 'string') {
      // ComfyUI built-in node types have known widget order patterns
      // KSampler: seed, steps, cfg, sampler_name, scheduler, denoise
      if (node.type === 'KSampler' || node.type === 'KSamplerAdvanced') {
        if (widgets.length >= 1) inputs.seed = widgets[0];
        if (widgets.length >= 2) inputs.steps = widgets[1];
        if (widgets.length >= 3) inputs.cfg = widgets[2];
        if (widgets.length >= 4) inputs.sampler_name = widgets[3];
        if (widgets.length >= 5) inputs.scheduler = widgets[4];
        if (widgets.length >= 6) inputs.denoise = widgets[5];
      } else if (node.type === 'CLIPTextEncode') {
        if (widgets.length >= 1) inputs.text = widgets[0];
      } else if (node.type === 'CheckpointLoaderSimple') {
        if (widgets.length >= 1) inputs.ckpt_name = widgets[0];
      } else if (node.type === 'EmptyLatentImage') {
        if (widgets.length >= 1) inputs.width = widgets[0];
        if (widgets.length >= 2) inputs.height = widgets[1];
        if (widgets.length >= 3) inputs.batch_size = widgets[2];
      }
    }

    result[nodeId] = {
      class_type: node.type,
      inputs,
      _meta: node.title ? { title: node.title } : undefined,
    };
  }

  // Fill in connections from link references
  if (Array.isArray(raw.links)) {
    for (const link of raw.links) {
      // link = [link_id, source_node, source_slot, target_node, target_slot, type]
      if (!Array.isArray(link) || link.length < 4) continue;
      const [, sourceNode, sourceSlot, targetNode, targetSlot] = link;
      const srcNode = result[String(sourceNode)];
      const tgtNode = result[String(targetNode)];
      if (tgtNode && srcNode) {
        // Find the input name at targetSlot
        const tgtDef = raw.nodes?.find((n: any) => n.id === targetNode);
        if (tgtDef && Array.isArray(tgtDef.inputs)) {
          const slotIdx = typeof targetSlot === 'number' ? targetSlot : 0;
          const inpDef = tgtDef.inputs[slotIdx];
          if (inpDef && inpDef.name) {
            tgtNode.inputs[inpDef.name] = [String(sourceNode), sourceSlot];
          }
        }
      }
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

// ── Auto-detection ─────────────────────────────────────────────────────

/**
 * Discover the input field names a given node exposes.
 */
export function detectNodeInputs(node: Record<string, any>): string[] {
  const inputs = node.inputs;
  if (!inputs || typeof inputs !== 'object') return [];
  return Object.keys(inputs).filter(
    (k) => typeof k === 'string' && !Array.isArray(inputs[k]),
  );
}

/**
 * Auto-detect parameter targets by scanning all nodes in a prompt-request JSON.
 * Returns a best-guess set of target inputs that the user can then override.
 */
export function autoDetectTargets(
  rawPromptJson: Record<string, any>,
): ComfyWorkflowSchema['targetInputs'] {
  const positivePrompt: ComfyNodeTarget[] = [];
  const negativePrompt: ComfyNodeTarget[] = [];
  const seed: ComfyNodeTarget[] = [];
  const steps: ComfyNodeTarget[] = [];
  const cfg: ComfyNodeTarget[] = [];
  const samplerName: ComfyNodeTarget[] = [];

  const clipEncodeNodes: string[] = [];

  for (const [nodeId, node] of Object.entries(rawPromptJson)) {
    if (!node || typeof node !== 'object') continue;
    const ct: string = (node as any).class_type || '';
    const inputs: Record<string, any> = (node as any).inputs || {};

    // CLIPTextEncode → prompt targets
    if (ct === 'CLIPTextEncode' && 'text' in inputs) {
      clipEncodeNodes.push(nodeId);
    }

    // KSampler / KSamplerAdvanced → seed, steps, cfg, sampler_name
    if (ct === 'KSampler' || ct === 'KSamplerAdvanced') {
      if ('seed' in inputs) seed.push({ nodeId, fieldPath: 'inputs.seed' });
      if ('steps' in inputs) steps.push({ nodeId, fieldPath: 'inputs.steps' });
      if ('cfg' in inputs) cfg.push({ nodeId, fieldPath: 'inputs.cfg' });
      if ('sampler_name' in inputs) samplerName.push({ nodeId, fieldPath: 'inputs.sampler_name' });
    }
  }

  // Map CLIPTextEncode nodes: first is positive, second (if any) is negative
  if (clipEncodeNodes.length >= 1) {
    positivePrompt.push({ nodeId: clipEncodeNodes[0], fieldPath: 'inputs.text' });
  }
  if (clipEncodeNodes.length >= 2) {
    negativePrompt.push({ nodeId: clipEncodeNodes[1], fieldPath: 'inputs.text' });
  }
  // If there's only one CLIPTextEncode, also use it for negative prompt
  // (user can unmap if only positive is needed)
  if (clipEncodeNodes.length === 1) {
    negativePrompt.push({ nodeId: clipEncodeNodes[0], fieldPath: 'inputs.text' });
  }

  return { positivePrompt, negativePrompt, seed, steps, cfg, samplerName };
}

/**
 * Chunk a raw JSON into a ComfyWorkflowSchema by auto-detecting targets.
 * Returns null if the JSON isn't valid prompt-request format.
 */
export function createSchemaFromWorkflowJson(
  rawJson: Record<string, any>,
  label?: string,
): ComfyWorkflowSchema | null {
  let promptJson: Record<string, any> | null = null;

  if (isPromptRequestFormat(rawJson)) {
    promptJson = rawJson;
  } else {
    promptJson = convertComfyUIExportToPromptRequest(rawJson);
  }

  if (!promptJson) return null;

  const targets = autoDetectTargets(promptJson);

  return {
    workflowName: label || `Custom ${new Date().toLocaleDateString()}`,
    rawPromptJson: promptJson,
    targetInputs: targets,
  };
}

export function setNestedPath(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] == null) {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

export function injectWorkflowParameters(
  schema: ComfyWorkflowSchema,
  params: { prompt: string; negativePrompt?: string; seed?: number; steps?: number; cfg?: number; samplerName?: string },
): Record<string, any> {
  const cloned = JSON.parse(JSON.stringify(schema.rawPromptJson));
  for (const target of schema.targetInputs.positivePrompt) {
    setNestedPath(cloned[target.nodeId], target.fieldPath, params.prompt);
  }
  if (params.negativePrompt != null) {
    for (const target of schema.targetInputs.negativePrompt) {
      setNestedPath(cloned[target.nodeId], target.fieldPath, params.negativePrompt);
    }
  }
  if (params.seed != null) {
    for (const target of schema.targetInputs.seed) {
      setNestedPath(cloned[target.nodeId], target.fieldPath, params.seed);
    }
  }
  if (params.steps != null) {
    for (const target of schema.targetInputs.steps) {
      setNestedPath(cloned[target.nodeId], target.fieldPath, params.steps);
    }
  }
  if (params.cfg != null) {
    for (const target of schema.targetInputs.cfg) {
      setNestedPath(cloned[target.nodeId], target.fieldPath, params.cfg);
    }
  }
  if (params.samplerName != null) {
    for (const target of schema.targetInputs.samplerName) {
      setNestedPath(cloned[target.nodeId], target.fieldPath, params.samplerName);
    }
  }
  return cloned;
}

export async function validateWorkflowOnComfy(
  workflowJson: Record<string, any>,
  comfyUrl: string,
): Promise<Record<string, any>> {
  const url = `${comfyUrl.replace(/\/+$/, '')}/prompt`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflowJson }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ComfyUI validation failed (${res.status}): ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  const nodeErrors = data.node_errors;
  if (nodeErrors != null && Object.keys(nodeErrors).length > 0) {
    const messages: string[] = [];
    for (const [, err] of Object.entries(nodeErrors)) {
      const rawMessage = (err as any)?.messages?.[0] ?? JSON.stringify(err);
      messages.push(rawMessage);
    }
    throw new Error(`Workflow validation failed: ${messages.join('; ')}`);
  }
  return workflowJson;
}
