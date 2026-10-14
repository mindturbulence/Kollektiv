import { beforeEach, describe, expect, it, vi } from 'vitest';

const refine = vi.fn();
vi.mock('../../services/llmService', () => ({ refineSinglePrompt: (...args: unknown[]) => refine(...args) }));

import type { LLMSettings } from '../../types';
import { runGraph } from '../core/executor';
import { createEdge, createEmptyGraph, createNode } from '../core/graph';
import type { Graph } from '../core/types';
import { applyRunState, createRunners } from './runners';

const settings = { activeLLM: 'gemini' } as unknown as LLMSettings;

function graph(shotText = '', model = 'Google Veo 3'): Graph {
  const concept = createNode('concept', { x: 0, y: 0 }, 'c');
  concept.data.text = 'A fox in the snow';
  const preset = createNode('preset', { x: 0, y: 100 }, 'p');
  preset.data.text = 'Fox: red, small';
  const shot = createNode('shot', { x: 300, y: 0 }, 's');
  shot.data = { model, durationSec: 8, text: shotText, edited: false };
  return {
    ...createEmptyGraph(),
    nodes: [concept, preset, shot],
    edges: [createEdge('c', 's', 'e1'), createEdge('p', 's', 'e2')],
  };
}

beforeEach(() => refine.mockReset());

describe('shot runner', () => {
  it('refines the preset+concept prefix with the shot model and duration', async () => {
    refine.mockResolvedValue('0-8s: fox runs');
    const states = await runGraph(graph(), { runners: createRunners(settings) });
    expect(refine).toHaveBeenCalledWith('Fox: red, small\n\nA fox in the snow', 'Google Veo 3', settings, { videoDuration: '8', videoInputType: 't2v' });
    expect(states.get('s')).toEqual({ status: 'done', output: { text: '0-8s: fox runs' } });
  });

  it('errors without a model and blocks nothing else', async () => {
    const states = await runGraph(graph('', ''), { runners: createRunners(settings) });
    expect(states.get('s')).toMatchObject({ status: 'error', error: expect.stringContaining('model') });
    expect(states.get('c')?.status).toBe('done');
    expect(refine).not.toHaveBeenCalled();
  });

  it('passes a hand-written script through when nothing is upstream', async () => {
    const g = { ...graph('0-3s: hi'), edges: [] };
    const states = await runGraph(g, { runners: createRunners(settings) });
    expect(states.get('s')?.output?.text).toBe('0-3s: hi');
    expect(refine).not.toHaveBeenCalled();
  });
});

describe('applyRunState', () => {
  it('writes a finished shot script before reporting done', () => {
    const order: string[] = [];
    applyRunState(graph('old'), 's', { status: 'done', output: { text: 'new' } },
      a => order.push(`dispatch:${a.type}`), (id, st) => order.push(`state:${id}:${st.status}`));
    expect(order).toEqual(['dispatch:updateNodeData', 'state:s:done']);
  });

  it('does not dispatch for unchanged text or non-shot nodes', () => {
    const dispatch = vi.fn();
    const setState = vi.fn();
    applyRunState(graph('same'), 's', { status: 'done', output: { text: 'same' } }, dispatch, setState);
    applyRunState(graph(), 'c', { status: 'done', output: { text: 'x' } }, dispatch, setState);
    expect(dispatch).not.toHaveBeenCalled();
    expect(setState).toHaveBeenCalledTimes(2);
  });
});
