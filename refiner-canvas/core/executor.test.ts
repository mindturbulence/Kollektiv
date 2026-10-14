import { describe, expect, it, vi } from 'vitest';
import { buildPrefix, gatherInputs, GraphCycleError, runGraph, topoOrder, type Runner, type RunInput } from './executor';
import { createEdge, createEmptyGraph, createNode } from './graph';
import type { Graph, GraphEdge, GraphNode, NodeOutput, NodeRunState } from './types';

function graphOf(nodes: GraphNode[], edges: GraphEdge[]): Graph {
  return { ...createEmptyGraph(), nodes, edges };
}

function concept(id: string, text: string, x = 0): GraphNode {
  return { ...createNode('concept', { x, y: 0 }, id), data: { text } };
}
function shot(id: string, x = 100): GraphNode {
  return { ...createNode('shot', { x, y: 0 }, id), data: { model: 'veo', durationSec: 8, text: id, edited: false } };
}

/** Shot runner that echoes prefix + its own text, recording each call. */
function recordingShot(calls: string[] = []): Runner {
  return (node, inputs) => {
    calls.push(node.id);
    const own = node.kind === 'shot' ? node.data.text : '';
    return Promise.resolve({ text: [buildPrefix(inputs), own].filter(Boolean).join(' | ') });
  };
}

function done(text: string): NodeRunState {
  return { status: 'done', output: { text } };
}

/** Diamond a -> b, a -> c, b -> d, c -> d. */
function diamond(): Graph {
  return graphOf(
    [concept('a', 'A'), shot('b'), shot('c'), shot('d', 300)],
    [createEdge('a', 'b', 'ab'), createEdge('a', 'c', 'ac'), createEdge('b', 'd', 'bd'), createEdge('c', 'd', 'cd')],
  );
}

describe('topoOrder', () => {
  it('orders a diamond deterministically by node order among ready nodes', () => {
    expect(topoOrder(diamond())).toEqual(['a', 'b', 'c', 'd']);
    const reversed = { ...diamond(), nodes: [...diamond().nodes].reverse() };
    expect(topoOrder(reversed)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('throws GraphCycleError on a corrupt (cyclic) graph', () => {
    const g = graphOf([shot('a'), shot('b'), shot('c')], [createEdge('a', 'b', '1'), createEdge('b', 'c', '2'), createEdge('c', 'a', '3')]);
    expect(() => topoOrder(g)).toThrow(GraphCycleError);
  });
});

describe('gatherInputs and buildPrefix', () => {
  it('orders inputs by edge order and skips sources without output', () => {
    const g = graphOf(
      [concept('c', 'C'), { ...createNode('preset', { x: 0, y: 0 }, 'p'), data: { presetKind: 'character', text: 'P' } }, concept('z', 'Z'), shot('s')],
      [createEdge('c', 's', '1'), createEdge('p', 's', '2'), createEdge('z', 's', '3')],
    );
    const outputs = new Map<string, NodeOutput>([['c', { text: 'C' }], ['p', { text: 'P' }]]);
    expect(gatherInputs(g, 's', outputs).map(i => i.node.id)).toEqual(['c', 'p']);
  });

  it('puts preset texts ahead of concept text, other inputs ignored', () => {
    const preset = (id: string, text: string): RunInput => ({
      node: { ...createNode('preset', { x: 0, y: 0 }, id), data: { presetKind: 'world', text } }, output: { text },
    });
    const inputs: RunInput[] = [
      { node: concept('c', 'idea'), output: { text: 'idea' } },
      preset('p1', 'hero'),
      { node: shot('s'), output: { text: 'ignored' } },
      preset('p2', 'city'),
    ];
    expect(buildPrefix(inputs)).toBe('hero\n\ncity\n\nidea');
    expect(buildPrefix([])).toBe('');
  });
});

describe('runGraph', () => {
  it('runs everything on a fresh graph and hands each runner the right inputs', async () => {
    const preset = { ...createNode('preset', { x: 0, y: 50 }, 'p'), data: { presetKind: 'character' as const, text: 'Hero' } };
    const g = graphOf([concept('c', 'Idea'), preset, shot('s1'), shot('s2')], [
      createEdge('c', 's1', '1'), createEdge('p', 's1', '2'), createEdge('c', 's2', '3'), createEdge('p', 's2', '4'),
    ]);
    const seen: Record<string, string[]> = {};
    const shotRunner: Runner = (node, inputs) => {
      seen[node.id] = inputs.map(i => i.node.id);
      return recordingShot()(node, inputs, { signal: undefined });
    };
    const states = await runGraph(g, { runners: { shot: shotRunner } });
    expect(seen).toEqual({ s1: ['c', 'p'], s2: ['c', 'p'] });
    expect(states.get('s1')).toEqual({ status: 'done', output: { text: 'Hero\n\nIdea | s1' } });
    expect(states.get('c')?.output).toEqual({ text: 'Idea' });
  });

  it('runs only dirty/idle nodes plus their downstream and caches done nodes', async () => {
    const calls: string[] = [];
    const states = await runGraph(diamond(), {
      runners: { shot: recordingShot(calls) },
      states: new Map([['a', done('A')], ['b', { status: 'dirty' }], ['c', done('c')], ['d', done('d')]]),
    });
    expect(calls).toEqual(['b', 'd']);
    expect(states.get('c')).toEqual(done('c'));
    expect(states.get('d')?.status).toBe('done');
  });

  it('a done node with a dirty ancestor still runs', async () => {
    const calls: string[] = [];
    await runGraph(diamond(), {
      runners: { shot: recordingShot(calls) },
      states: new Map([['a', { status: 'dirty' }], ['b', done('b')], ['c', done('c')], ['d', done('d')]]),
    });
    expect(calls).toEqual(['b', 'c', 'd']);
  });

  it('`only` reruns done nodes plus their downstream and nothing else', async () => {
    const calls: string[] = [];
    const states = await runGraph(diamond(), {
      runners: { shot: recordingShot(calls) },
      only: ['c'],
      states: new Map([['a', done('A')], ['b', done('b')], ['c', done('c')], ['d', done('d')]]),
    });
    expect(calls).toEqual(['c', 'd']);
    expect(states.get('b')).toEqual(done('b'));
  });

  it('`only` pulls in stale ancestors; their other branches are reported dirty, not run', async () => {
    const g = graphOf([concept('a', 'A'), shot('b'), shot('c')], [createEdge('a', 'b', '1'), createEdge('a', 'c', '2')]);
    const calls: string[] = [];
    const states = await runGraph(g, {
      runners: { shot: recordingShot(calls) },
      only: ['c'],
      states: new Map([['a', { status: 'dirty' }], ['b', done('b')], ['c', done('c')]]),
    });
    expect(calls).toEqual(['c']);
    expect(states.get('a')?.status).toBe('done');
    expect(states.get('b')).toEqual({ status: 'dirty', output: { text: 'b' } });
  });

  it('halts downstream of a failure while an independent branch still runs', async () => {
    const g = graphOf(
      [concept('a', 'A'), shot('bad'), shot('after'), concept('x', 'X'), shot('ok')],
      [createEdge('a', 'bad', '1'), createEdge('bad', 'after', '2'), createEdge('x', 'ok', '3')],
    );
    const onState = vi.fn<(id: string, state: NodeRunState) => void>();
    const shotRunner: Runner = (node, inputs, ctx) =>
      node.id === 'bad' ? Promise.reject(new Error('quota')) : recordingShot()(node, inputs, ctx);
    const states = await runGraph(g, { runners: { shot: shotRunner }, onState });
    expect(states.get('bad')).toEqual({ status: 'error', error: 'quota' });
    expect(states.get('after')?.status).toBe('blocked');
    expect(states.get('after')?.error).toContain('bad');
    expect(states.get('ok')?.status).toBe('done');
    expect(onState.mock.calls.map(([id, s]) =>`${id}:${s.status}`)).not.toContain('after:running');
  });

  it('abort stops before the next node and leaves the rest dirty', async () => {
    const controller = new AbortController();
    const calls: string[] = [];
    const shotRunner: Runner = (node, inputs, ctx) => {
      if (node.id === 'b') controller.abort();
      return recordingShot(calls)(node, inputs, ctx);
    };
    const states = await runGraph(diamond(), { runners: { shot: shotRunner }, signal: controller.signal });
    expect(calls).toEqual(['b']);
    expect(states.get('b')?.status).toBe('done');
    expect(states.get('c')?.status).toBe('dirty');
    expect(states.get('d')?.status).toBe('dirty');
  });

  it('a runner rejecting because of abort leaves the node dirty, not error', async () => {
    const controller = new AbortController();
    const shotRunner: Runner = () => { controller.abort(); return Promise.reject(new DOMException('aborted', 'AbortError')); };
    const states = await runGraph(diamond(), { runners: { shot: shotRunner }, signal: controller.signal });
    expect(states.get('b')?.status).toBe('dirty');
    expect(states.get('d')?.status).toBe('dirty');
  });

  it('a kind without a runner errors with a clear message', async () => {
    const g = graphOf([shot('s'), createNode('generate', { x: 0, y: 0 }, 'g')], [createEdge('s', 'g', '1')]);
    const states = await runGraph(g, { runners: { shot: recordingShot() } });
    expect(states.get('g')).toEqual({ status: 'error', error: "No runner for 'generate' nodes" });
  });

  it('assemble collects clips ordered by source x, result passes through', async () => {
    const gen = (id: string, x: number) => createNode('generate', { x, y: 0 }, id);
    const g = graphOf(
      [gen('g2', 300), gen('g1', 100), gen('g3', 500), createNode('assemble', { x: 700, y: 0 }, 'asm'), createNode('result', { x: 900, y: 0 }, 'r')],
      [createEdge('g3', 'asm', '1'), createEdge('g2', 'asm', '2'), createEdge('g1', 'asm', '3'), createEdge('asm', 'r', '4')],
    );
    const generate: Runner = node => Promise.resolve({ clip: { assetKey: node.id, durationSec: 8 } });
    const states = await runGraph(g, { runners: { generate } });
    const clips = [{ assetKey: 'g1', durationSec: 8 }, { assetKey: 'g2', durationSec: 8 }, { assetKey: 'g3', durationSec: 8 }];
    expect(states.get('asm')?.output).toEqual({ clips });
    expect(states.get('r')?.output).toEqual({ clips });
  });

  it('rejects with GraphCycleError on a cyclic graph', async () => {
    const g = graphOf([shot('a'), shot('b')], [createEdge('a', 'b', '1'), createEdge('b', 'a', '2')]);
    await expect(runGraph(g, { runners: {} })).rejects.toBeInstanceOf(GraphCycleError);
  });
});
