import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setNestedPath,
  injectWorkflowParameters,
  validateWorkflowOnComfy,
  isPromptRequestFormat,
  convertComfyUIExportToPromptRequest,
  detectNodeInputs,
  autoDetectTargets,
  createSchemaFromWorkflowJson,
} from './comfyWorkflowParser';
import type { ComfyWorkflowSchema } from './comfyWorkflowParser';

const MOCK_SCHEMA: ComfyWorkflowSchema = {
  workflowName: 'test-flux',
  rawPromptJson: {
    '3': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
    '5': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
    '6': { class_type: 'KSampler', inputs: { seed: 0, steps: 20, cfg: 7, sampler_name: 'euler' } },
  },
  targetInputs: {
    positivePrompt: [{ nodeId: '3', fieldPath: 'inputs.text' }],
    negativePrompt: [{ nodeId: '5', fieldPath: 'inputs.text' }],
    seed: [{ nodeId: '6', fieldPath: 'inputs.seed' }],
    steps: [{ nodeId: '6', fieldPath: 'inputs.steps' }],
    cfg: [{ nodeId: '6', fieldPath: 'inputs.cfg' }],
    samplerName: [{ nodeId: '6', fieldPath: 'inputs.sampler_name' }],
  },
};

describe('isPromptRequestFormat', () => {
  it('returns true for prompt-request format with class_type keys', () => {
    const json = { '3': { class_type: 'CLIPTextEncode', inputs: { text: '' } } };
    expect(isPromptRequestFormat(json)).toBe(true);
  });

  it('returns false for empty object', () => {
    expect(isPromptRequestFormat({})).toBe(false);
  });

  it('returns false for web-ui export format (nodes array)', () => {
    const json = { nodes: [{ id: 3, type: 'CLIPTextEncode' }], links: [] };
    expect(isPromptRequestFormat(json)).toBe(false);
  });

  it('returns false when values lack class_type', () => {
    const json = { '3': { foo: 'bar' } };
    expect(isPromptRequestFormat(json)).toBe(false);
  });
});

describe('convertComfyUIExportToPromptRequest', () => {
  it('converts a KSampler+CLIPTextEncode web-ui export', () => {
    const raw = {
      nodes: [
        { id: 6, type: 'KSampler', widgets_values: [42, 20, 7, 'euler', 'normal', 1] },
        { id: 3, type: 'CLIPTextEncode', widgets_values: ['a cat'] },
      ],
      links: [],
    };
    const result = convertComfyUIExportToPromptRequest(raw);
    expect(result).not.toBeNull();
    expect(result!['6'].class_type).toBe('KSampler');
    expect(result!['6'].inputs.seed).toBe(42);
    expect(result!['6'].inputs.steps).toBe(20);
    expect(result!['6'].inputs.cfg).toBe(7);
    expect(result!['6'].inputs.sampler_name).toBe('euler');
    expect(result!['3'].class_type).toBe('CLIPTextEncode');
    expect(result!['3'].inputs.text).toBe('a cat');
  });

  it('returns null for non-array nodes', () => {
    expect(convertComfyUIExportToPromptRequest({})).toBeNull();
  });

  it('returns null for empty nodes array', () => {
    expect(convertComfyUIExportToPromptRequest({ nodes: [] })).toBeNull();
  });
});

describe('detectNodeInputs', () => {
  it('returns input field names for a node', () => {
    const node = { class_type: 'KSampler', inputs: { seed: 0, steps: 20, cfg: 7 } };
    expect(detectNodeInputs(node)).toEqual(['seed', 'steps', 'cfg']);
  });

  it('returns empty array when no inputs object', () => {
    expect(detectNodeInputs({ class_type: 'KSampler' })).toEqual([]);
  });

  it('filters out array-typed inputs (connections)', () => {
    const node = { class_type: 'CLIPTextEncode', inputs: { text: 'hi', clip: ['1', 1] } };
    expect(detectNodeInputs(node)).toEqual(['text']);
  });
});

describe('autoDetectTargets', () => {
  it('detects CLIPTextEncode nodes for prompts', () => {
    const raw = {
      '3': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
      '5': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
    };
    const targets = autoDetectTargets(raw);
    expect(targets.positivePrompt).toEqual([{ nodeId: '3', fieldPath: 'inputs.text' }]);
    expect(targets.negativePrompt).toEqual([{ nodeId: '5', fieldPath: 'inputs.text' }]);
  });

  it('detects KSampler nodes for seed/steps/cfg/sampler_name', () => {
    const raw = {
      '6': { class_type: 'KSampler', inputs: { seed: 0, steps: 20, cfg: 7, sampler_name: 'euler' } },
    };
    const targets = autoDetectTargets(raw);
    expect(targets.seed).toEqual([{ nodeId: '6', fieldPath: 'inputs.seed' }]);
    expect(targets.steps).toEqual([{ nodeId: '6', fieldPath: 'inputs.steps' }]);
    expect(targets.cfg).toEqual([{ nodeId: '6', fieldPath: 'inputs.cfg' }]);
    expect(targets.samplerName).toEqual([{ nodeId: '6', fieldPath: 'inputs.sampler_name' }]);
  });

  it('handles single CLIPTextEncode by using it for both prompts', () => {
    const raw = {
      '3': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
    };
    const targets = autoDetectTargets(raw);
    expect(targets.positivePrompt).toHaveLength(1);
    expect(targets.negativePrompt).toHaveLength(1);
    expect(targets.positivePrompt[0].nodeId).toBe('3');
    expect(targets.negativePrompt[0].nodeId).toBe('3');
  });

  it('detects KSamplerAdvanced nodes', () => {
    const raw = {
      '8': { class_type: 'KSamplerAdvanced', inputs: { seed: 1, steps: 30, cfg: 8, sampler_name: 'dpmpp_2m' } },
    };
    const targets = autoDetectTargets(raw);
    expect(targets.seed).toHaveLength(1);
    expect(targets.steps).toHaveLength(1);
    expect(targets.cfg).toHaveLength(1);
    expect(targets.samplerName).toHaveLength(1);
  });

  it('returns empty arrays when no matching nodes exist', () => {
    const targets = autoDetectTargets({ '1': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512 } } });
    expect(targets.positivePrompt).toEqual([]);
    expect(targets.negativePrompt).toEqual([]);
    expect(targets.seed).toEqual([]);
    expect(targets.steps).toEqual([]);
    expect(targets.cfg).toEqual([]);
    expect(targets.samplerName).toEqual([]);
  });
});

describe('createSchemaFromWorkflowJson', () => {
  it('creates a schema from prompt-request format', () => {
    const raw = {
      '3': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
      '6': { class_type: 'KSampler', inputs: { seed: 0, steps: 20, cfg: 7, sampler_name: 'euler' } },
    };
    const schema = createSchemaFromWorkflowJson(raw, 'My Workflow');
    expect(schema).not.toBeNull();
    expect(schema!.workflowName).toBe('My Workflow');
    expect(schema!.rawPromptJson).toBe(raw);
    expect(schema!.targetInputs.positivePrompt).toHaveLength(1);
  });

  it('creates a schema from web-ui export format', () => {
    const raw = {
      nodes: [
        { id: 6, type: 'KSampler', widgets_values: [42, 20, 7, 'euler'] },
        { id: 3, type: 'CLIPTextEncode', widgets_values: ['a cat'] },
      ],
      links: [],
    };
    const schema = createSchemaFromWorkflowJson(raw);
    expect(schema).not.toBeNull();
    expect(schema!.targetInputs.seed).toHaveLength(1);
  });

  it('returns null for invalid input', () => {
    const schema = createSchemaFromWorkflowJson({});
    expect(schema).toBeNull();
  });
});

describe('setNestedPath', () => {
  it('sets a shallow property', () => {
    const obj: any = {};
    setNestedPath(obj, 'name', 'hello');
    expect(obj.name).toBe('hello');
  });

  it('sets a nested property creating intermediate objects', () => {
    const obj: any = {};
    setNestedPath(obj, 'inputs.text', 'hello');
    expect(obj.inputs.text).toBe('hello');
  });

  it('overwrites an existing value', () => {
    const obj: any = { inputs: { text: 'old', other: 'keep' } };
    setNestedPath(obj, 'inputs.text', 'new');
    expect(obj.inputs.text).toBe('new');
    expect(obj.inputs.other).toBe('keep');
  });

  it('creates intermediate objects when parent is null', () => {
    const obj: any = { inputs: null };
    setNestedPath(obj, 'inputs.text', 'val');
    expect(obj.inputs.text).toBe('val');
  });

  it('handles single-segment paths', () => {
    const obj: any = {};
    setNestedPath(obj, 'a', 42);
    expect(obj.a).toBe(42);
  });

  it('handles deep nesting', () => {
    const obj: any = {};
    setNestedPath(obj, 'a.b.c.d', 'deep');
    expect(obj.a.b.c.d).toBe('deep');
  });
});

describe('injectWorkflowParameters', () => {
  it('injects positive prompt into the cloned workflow', () => {
    const result = injectWorkflowParameters(MOCK_SCHEMA, { prompt: 'a cat' });
    expect(result['3'].inputs.text).toBe('a cat');
  });

  it('does not mutate the original schema', () => {
    const originalText = MOCK_SCHEMA.rawPromptJson['3'].inputs.text;
    injectWorkflowParameters(MOCK_SCHEMA, { prompt: 'new prompt' });
    expect(MOCK_SCHEMA.rawPromptJson['3'].inputs.text).toBe(originalText);
  });

  it('injects negative prompt when provided', () => {
    const result = injectWorkflowParameters(MOCK_SCHEMA, { prompt: 'cat', negativePrompt: 'dog' });
    expect(result['5'].inputs.text).toBe('dog');
  });

  it('does not overwrite negative prompt when omitted', () => {
    const result = injectWorkflowParameters(MOCK_SCHEMA, { prompt: 'cat' });
    expect(result['5'].inputs.text).toBe('');
  });

  it('injects seed when provided', () => {
    const result = injectWorkflowParameters(MOCK_SCHEMA, { prompt: 'cat', seed: 42 });
    expect(result['6'].inputs.seed).toBe(42);
  });

  it('does not overwrite seed when omitted', () => {
    const result = injectWorkflowParameters(MOCK_SCHEMA, { prompt: 'cat' });
    expect(result['6'].inputs.seed).toBe(0);
  });

  it('injects steps when provided', () => {
    const result = injectWorkflowParameters(MOCK_SCHEMA, { prompt: 'cat', steps: 30 });
    expect(result['6'].inputs.steps).toBe(30);
  });

  it('injects cfg when provided', () => {
    const result = injectWorkflowParameters(MOCK_SCHEMA, { prompt: 'cat', cfg: 3.5 });
    expect(result['6'].inputs.cfg).toBe(3.5);
  });

  it('injects samplerName when provided', () => {
    const result = injectWorkflowParameters(MOCK_SCHEMA, { prompt: 'cat', samplerName: 'dpmpp_2m' });
    expect(result['6'].inputs.sampler_name).toBe('dpmpp_2m');
  });

  it('injects all parameters at once', () => {
    const result = injectWorkflowParameters(MOCK_SCHEMA, {
      prompt: 'masterpiece',
      negativePrompt: 'nsfw',
      seed: 12345,
      steps: 25,
      cfg: 7.5,
      samplerName: 'euler_ancestral',
    });
    expect(result['3'].inputs.text).toBe('masterpiece');
    expect(result['5'].inputs.text).toBe('nsfw');
    expect(result['6'].inputs.seed).toBe(12345);
    expect(result['6'].inputs.steps).toBe(25);
    expect(result['6'].inputs.cfg).toBe(7.5);
    expect(result['6'].inputs.sampler_name).toBe('euler_ancestral');
  });

  it('handles multiple targets for the same parameter', () => {
    const multiTargetSchema: ComfyWorkflowSchema = {
      workflowName: 'dual-encode',
      rawPromptJson: {
        '3': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
        '4': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
      },
      targetInputs: {
        positivePrompt: [{ nodeId: '3', fieldPath: 'inputs.text' }, { nodeId: '4', fieldPath: 'inputs.text' }],
        negativePrompt: [],
        seed: [],
        steps: [],
        cfg: [],
        samplerName: [],
      },
    };
    const result = injectWorkflowParameters(multiTargetSchema, { prompt: 'test' });
    expect(result['3'].inputs.text).toBe('test');
    expect(result['4'].inputs.text).toBe('test');
  });
});

describe('validateWorkflowOnComfy', () => {
  const comfyUrl = 'http://127.0.0.1:8188';

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the workflow JSON when validation passes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ prompt_id: 'abc' }), { status: 200 }),
    );
    const workflow = { '3': { class_type: 'CLIPTextEncode', inputs: { text: 'cat' } } };
    const result = await validateWorkflowOnComfy(workflow, comfyUrl);
    expect(result).toBe(workflow);
  });

  it('returns the workflow JSON when node_errors is an empty object', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ prompt_id: 'abc', node_errors: {} }), { status: 200 }),
    );
    const workflow = { '3': { class_type: 'CLIPTextEncode', inputs: { text: 'cat' } } };
    const result = await validateWorkflowOnComfy(workflow, comfyUrl);
    expect(result).toBe(workflow);
  });

  it('throws when node_errors is non-empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        prompt_id: '',
        node_errors: {
          '5': {
            class_type: 'KSampler',
            messages: [['missing required input: seed', '']],
          },
        },
      }), { status: 200 }),
    );
    const workflow = { '5': { class_type: 'KSampler', inputs: {} } };
    await expect(validateWorkflowOnComfy(workflow, comfyUrl)).rejects.toThrow(
      /Workflow validation failed: missing required input: seed/,
    );
  });

  it('throws when ComfyUI returns a non-ok status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Bad request', { status: 400 }),
    );
    await expect(validateWorkflowOnComfy({}, comfyUrl)).rejects.toThrow(
      /ComfyUI validation failed \(400\)/,
    );
  });

  it('throws on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(validateWorkflowOnComfy({}, comfyUrl)).rejects.toThrow('ECONNREFUSED');
  });

  it('POSTs to the correct URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ prompt_id: 'abc' }), { status: 200 }),
    );
    await validateWorkflowOnComfy({ '3': { inputs: {} } }, 'http://127.0.0.1:8188');
    const callUrl = fetchSpy.mock.calls[0][0];
    expect(callUrl).toBe('http://127.0.0.1:8188/prompt');
  });

  it('strips trailing slashes from the URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ prompt_id: 'abc' }), { status: 200 }),
    );
    await validateWorkflowOnComfy({}, 'http://127.0.0.1:8188///');
    const callUrl = fetchSpy.mock.calls[0][0];
    expect(callUrl).toBe('http://127.0.0.1:8188/prompt');
  });

  it('includes the workflow JSON in the POST body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ prompt_id: 'abc' }), { status: 200 }),
    );
    const workflow = { '3': { class_type: 'CLIPTextEncode', inputs: { text: 'cat' } } };
    await validateWorkflowOnComfy(workflow, comfyUrl);
    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(body).toEqual({ prompt: workflow });
  });
});
