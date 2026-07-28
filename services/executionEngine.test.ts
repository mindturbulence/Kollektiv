import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createExecutionEngine, getNestedProperty, interpolateStepValue } from './executionEngine';
import { capabilityRegistry } from './capabilityRegistry';
import type { Plan, PlanStep } from './planner';
import type { RouterIntent } from './intentRouter';
import type { ToolContext } from './tools/types';

const { executeAssistantTool, streamChat, cleanLLMResponse } = vi.hoisted(() => ({
  executeAssistantTool: vi.fn(async () => 'tool ran ok'),
  streamChat: vi.fn(async function* () { yield 'chunk-a'; yield 'chunk-b'; }),
  cleanLLMResponse: vi.fn((t: string) => `cleaned:${t}`),
}));
vi.mock('./assistantTools', () => ({ executeAssistantTool }));
vi.mock('./llmService', () => ({ streamChat, cleanLLMResponse }));

const intent = (overrides: Partial<RouterIntent> = {}): RouterIntent => ({
  category: 'unknown',
  confidence: 0,
  rawInput: 'do the thing',
  ...overrides,
});

const step = (overrides: Partial<PlanStep>): PlanStep => ({
  kind: 'context_assembly',
  description: 'test step',
  ...overrides,
});

const makePlan = (steps: PlanStep[], overrides: Partial<Plan> = {}): Plan => ({
  id: 'plan_test_1',
  intent: intent(),
  steps,
  expectedOutput: 'test',
  requiresConfirmation: false,
  persistsData: false,
  ...overrides,
});

const ctx: ToolContext = { settings: {} as any };

beforeEach(() => {
  vi.clearAllMocks();
  executeAssistantTool.mockResolvedValue('tool ran ok');
});

describe('dispatchStep — context_assembly', () => {
  it('bundles entities, rawInput, and params with no side effects', async () => {
    const engine = createExecutionEngine();
    const s = step({ kind: 'context_assembly', params: { foo: 'bar' } });
    const result = await engine.executeStep(s, intent({ entities: { page: 'gallery' }, rawInput: 'go to gallery' }), ctx);
    expect(result.status).toBe('completed');
    expect(result.output).toEqual({ entities: { page: 'gallery' }, rawInput: 'go to gallery', params: { foo: 'bar' } });
    expect(executeAssistantTool).not.toHaveBeenCalled();
  });
});

describe('dispatchStep — capability_dispatch / assistant_tool', () => {
  afterEach(() => { capabilityRegistry.unregister('test_navigate'); });

  it('calls executeAssistantTool with the registered toolName', async () => {
    capabilityRegistry.register({
      id: 'test_navigate', name: 'test_navigate', description: 'd',
      input: {}, output: {}, execution: { kind: 'assistant-tool', toolName: 'navigate' },
    });
    const engine = createExecutionEngine();
    const s = step({ kind: 'capability_dispatch', capabilityId: 'test_navigate', params: { page: 'gallery' } });
    const result = await engine.executeStep(s, intent(), ctx);
    expect(result.status).toBe('completed');
    expect(result.output).toEqual({ tool: 'navigate', result: 'tool ran ok' });
    expect(executeAssistantTool).toHaveBeenCalledWith('navigate', { page: 'gallery' }, ctx);
  });

  it('assistant_tool uses capabilityId directly as the tool name — no registry lookup needed', async () => {
    const engine = createExecutionEngine();
    const s = step({ kind: 'assistant_tool', capabilityId: 'remember', params: { fact: 'x' } });
    const result = await engine.executeStep(s, intent(), ctx);
    expect(result.status).toBe('completed');
    expect(executeAssistantTool).toHaveBeenCalledWith('remember', { fact: 'x' }, ctx);
  });

  it('capability_dispatch fails honestly on an unregistered id — it must NOT treat the raw string as a tool name', async () => {
    const engine = createExecutionEngine({ maxRetries: 0 });
    const s = step({ kind: 'capability_dispatch', capabilityId: 'nonexistent' });
    const result = await engine.executeStep(s, intent(), ctx);
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/not found/);
    expect(executeAssistantTool).not.toHaveBeenCalled();
  });

  it('capability_dispatch fails honestly when capabilityId is absent', async () => {
    const engine = createExecutionEngine({ maxRetries: 0 });
    const s = step({ kind: 'capability_dispatch' });
    const result = await engine.executeStep(s, intent(), ctx);
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/not found/);
    expect(executeAssistantTool).not.toHaveBeenCalled();
  });

  it('capability_dispatch fails honestly for a registered capability of a kind this layer cannot dispatch', async () => {
    capabilityRegistry.register({
      id: 'test_provider_cap', name: 'test_provider_cap', description: 'd',
      input: {}, output: {}, execution: { kind: 'provider', provider: 'gemini' },
    });
    const engine = createExecutionEngine({ maxRetries: 0 });
    const s = step({ kind: 'capability_dispatch', capabilityId: 'test_provider_cap' });
    const result = await engine.executeStep(s, intent(), ctx);
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/does not dispatch/);
    capabilityRegistry.unregister('test_provider_cap');
  });

  it('fails the step when the tool itself reports an error, rather than a false success', async () => {
    executeAssistantTool.mockResolvedValueOnce('Error: unknown tool "bogus"');
    const engine = createExecutionEngine({ maxRetries: 0 });
    const s = step({ kind: 'assistant_tool', capabilityId: 'bogus' });
    const result = await engine.executeStep(s, intent(), ctx);
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/unknown tool/);
  });
});

describe('dispatchStep — provider_call', () => {
  it('routes plain-text input to the active LLM and collects the stream', async () => {
    const engine = createExecutionEngine();
    const s = step({ kind: 'provider_call', params: { input: 'hello' } });
    const result = await engine.executeStep(s, intent(), ctx);
    expect(result.status).toBe('completed');
    expect(result.output).toEqual({ response: 'chunk-achunk-b' });
    expect(streamChat).toHaveBeenCalledWith([{ role: 'user', content: 'hello' }], ctx.settings);
  });

  it('fails honestly for a provider_call with no plain-text input (e.g. media generation)', async () => {
    const engine = createExecutionEngine({ maxRetries: 0 });
    const s = step({ kind: 'provider_call', description: 'Call the generation provider', params: { entities: { prompt: 'a cat' } } });
    const result = await engine.executeStep(s, intent(), ctx);
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/does not yet/);
    expect(streamChat).not.toHaveBeenCalled();
  });
});

describe('dispatchStep — response_cleanup', () => {
  it('cleans provided text', async () => {
    const engine = createExecutionEngine();
    const s = step({ kind: 'response_cleanup', params: { text: 'raw output' } });
    const result = await engine.executeStep(s, intent(), ctx);
    expect(result.output).toEqual({ cleaned: 'cleaned:raw output' });
  });

  it('returns null without calling cleanLLMResponse when no text is given', async () => {
    const engine = createExecutionEngine();
    const s = step({ kind: 'response_cleanup' });
    const result = await engine.executeStep(s, intent(), ctx);
    expect(result.output).toEqual({ cleaned: null });
    expect(cleanLLMResponse).not.toHaveBeenCalled();
  });
});

describe('dispatchStep — not-yet-implemented kinds fail honestly, never fake success', () => {
  it.each(['mcp_call', 'persistence', 'user_confirmation', 'fallback'] as const)('%s throws rather than fabricating a result', async (kind) => {
    const engine = createExecutionEngine({ maxRetries: 0 });
    const s = step({ kind });
    const result = await engine.executeStep(s, intent(), ctx);
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/not implemented/i);
  });
});

describe('engine.execute — full plan integration', () => {
  it('runs a real multi-step plan end to end', async () => {
    capabilityRegistry.register({
      id: 'test_refine', name: 'test_refine', description: 'd',
      input: {}, output: {}, execution: { kind: 'assistant-tool', toolName: 'refine_prompt' },
    });
    const engine = createExecutionEngine();
    const p = makePlan([
      step({ kind: 'context_assembly', description: 'gather' }),
      step({ kind: 'capability_dispatch', description: 'refine', capabilityId: 'test_refine', params: { input: 'x' } }),
      step({ kind: 'response_cleanup', description: 'clean', optional: true }),
    ]);
    const result = await engine.execute(p, ctx);
    expect(result.status).toBe('completed');
    expect(result.steps).toHaveLength(3);
    expect(result.steps[1].output).toEqual({ tool: 'refine_prompt', result: 'tool ran ok' });
    capabilityRegistry.unregister('test_refine');
  });

  it('fails the whole plan on a non-optional step failure, with the real error', async () => {
    const engine = createExecutionEngine({ maxRetries: 0 });
    const p = makePlan([
      step({ kind: 'capability_dispatch', capabilityId: 'nonexistent' }),
    ]);
    const result = await engine.execute(p, ctx);
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/not found/);
  });

  it('skips an optional step that fails instead of failing the whole plan', async () => {
    const engine = createExecutionEngine({ maxRetries: 0 });
    const p = makePlan([
      step({ kind: 'persistence', optional: true }),
    ]);
    const result = await engine.execute(p, ctx);
    expect(result.status).toBe('completed');
    expect(result.steps[0].status).toBe('skipped');
  });
});

describe('getNestedProperty', () => {
  it('returns value for a simple key', () => {
    expect(getNestedProperty({ a: 1 }, 'a')).toBe(1);
  });

  it('returns undefined for a missing key', () => {
    expect(getNestedProperty({ a: 1 }, 'b')).toBeUndefined();
  });

  it('traverses nested objects with dot notation', () => {
    expect(getNestedProperty({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42);
  });

  it('handles array-index bracket notation', () => {
    const obj = { step: [{ output: 'value' }] };
    expect(getNestedProperty(obj, 'step[0].output')).toBe('value');
  });

  it('returns undefined when an intermediate is null', () => {
    expect(getNestedProperty({ a: null }, 'a.b')).toBeUndefined();
  });

  it('handles bracket notation at the start of a chained path', () => {
    const obj = { items: [{ name: 'foo' }] };
    expect(getNestedProperty(obj, 'items[0].name')).toBe('foo');
  });
});

describe('interpolateStepValue', () => {
  const outputs = {
    step1: { output: { summary: 'hello', count: 3, items: ['a', 'b'] } },
  };

  it('passes non-string values through unchanged', () => {
    expect(interpolateStepValue(42, outputs)).toBe(42);
    expect(interpolateStepValue(null, outputs)).toBeNull();
    expect(interpolateStepValue({ a: 1 }, outputs)).toEqual({ a: 1 });
  });

  it('exact match returns the raw value preserving object type', () => {
    const result = interpolateStepValue('{{step1.output}}', outputs);
    expect(result).toEqual({ summary: 'hello', count: 3, items: ['a', 'b'] });
    /* Prove it is not a string — must be the live object */
    expect(typeof result).toBe('object');
  });

  it('exact match on nested path returns the primitive', () => {
    expect(interpolateStepValue('{{step1.output.summary}}', outputs)).toBe('hello');
  });

  it('embedded template interpolates into the surrounding string', () => {
    expect(interpolateStepValue('prefix {{step1.output.summary}} suffix', outputs))
      .toBe('prefix hello suffix');
  });

  it('stringifies objects in embedded templates', () => {
    expect(interpolateStepValue('data: {{step1.output}}', outputs))
      .toBe('data: {"summary":"hello","count":3,"items":["a","b"]}');
  });

  it('returns the original string when an exact-match template is unresolved', () => {
    expect(interpolateStepValue('{{missing.output}}', {})).toBe('{{missing.output}}');
  });

  it('substitutes empty string for unresolved embedded templates', () => {
    expect(interpolateStepValue('pre {{missing.output}} post', {})).toBe('pre  post');
  });

  it('supports array-index bracket notation in templates', () => {
    const idxOutputs = { step: [{ output: 'hello from idx' }] };
    expect(interpolateStepValue('{{step[0].output}}', idxOutputs)).toBe('hello from idx');
    expect(interpolateStepValue('{{step[0]}}', idxOutputs)).toEqual({ output: 'hello from idx' });
  });
});

describe('pipeline — inter-step data flow', () => {
  afterEach(() => { capabilityRegistry.unregister('test_pipeline'); });

  it('tracks step outputs and makes them available to the next step via {{step1.output}}', async () => {
    const engine = createExecutionEngine();
    const p = makePlan([
      step({ kind: 'context_assembly', description: 'emit', params: { data: 'hello' } }),
      step({ kind: 'provider_call', description: 'consume', params: { input: '{{step1.output.params.data}}' } }),
    ]);
    const result = await engine.execute(p, ctx);
    expect(result.status).toBe('completed');
    expect(streamChat).toHaveBeenCalledWith(
      [{ role: 'user', content: 'hello' }],
      ctx.settings,
    );
  });

  it('supports array-index reference {{step[0].output}}', async () => {
    const engine = createExecutionEngine();
    const p = makePlan([
      step({ kind: 'context_assembly', description: 'first', params: { data: 'world' } }),
      step({ kind: 'provider_call', description: 'second', params: { input: '{{step[0].output.params.data}}' } }),
    ]);
    const result = await engine.execute(p, ctx);
    expect(result.status).toBe('completed');
    expect(streamChat).toHaveBeenCalledWith(
      [{ role: 'user', content: 'world' }],
      ctx.settings,
    );
  });

  it('fails the step when a template references an unavailable output', async () => {
    const engine = createExecutionEngine({ maxRetries: 0 });
    const p = makePlan([
      step({ kind: 'context_assembly', description: 'broken-ref', params: { ref: '{{step99.output}}' } }),
    ]);
    const result = await engine.execute(p, ctx);
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/Unresolved template/);
  });

  it('unresolved template in an optional step does not fail the plan', async () => {
    const engine = createExecutionEngine({ maxRetries: 0 });
    const p = makePlan([
      step({ kind: 'context_assembly', description: 'maybe-broken', params: { ref: '{{nope}}' }, optional: true }),
    ]);
    const result = await engine.execute(p, ctx);
    expect(result.status).toBe('completed');
    expect(result.steps[0].status).toBe('skipped');
  });

  it('interpolates through multiple chained steps', async () => {
    const engine = createExecutionEngine();
    const p = makePlan([
      step({ kind: 'context_assembly', description: 's1', params: { value: 'first' } }),
      step({ kind: 'context_assembly', description: 's2', params: { prev: '{{step1.output.params.value}}' } }),
      step({ kind: 'provider_call', description: 's3', params: { input: '{{step2.output.params.prev}}' } }),
    ]);
    const result = await engine.execute(p, ctx);
    expect(result.status).toBe('completed');
    expect(streamChat).toHaveBeenCalledWith(
      [{ role: 'user', content: 'first' }],
      ctx.settings,
    );
  });
});
