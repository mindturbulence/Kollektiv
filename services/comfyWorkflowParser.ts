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
