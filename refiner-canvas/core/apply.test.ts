import { describe, expect, it } from 'vitest';
import { applyEdit } from './apply';
import { createEdge, createEmptyGraph, createNode } from './graph';
import type { EditAction, Graph } from './types';

/** concept c -> shot s1, concept c -> shot s2, preset p -> s1 */
function sample(): Graph {
  const g = createEmptyGraph();
  return {
    ...g,
    nodes: [
      createNode('concept', { x: 0, y: 0 }, 'c'),
      createNode('preset', { x: 0, y: 100 }, 'p'),
      createNode('shot', { x: 200, y: 0 }, 's1'),
      createNode('shot', { x: 200, y: 100 }, 's2'),
    ],
    edges: [createEdge('c', 's1', 'e1'), createEdge('p', 's1', 'e2'), createEdge('c', 's2', 'e3')],
  };
}

function roundTrip(graph: Graph, action: EditAction): Graph {
  const { graph: next, inverse } = applyEdit(graph, action);
  expect(next).not.toBe(graph);
  const restored = applyEdit(next, inverse).graph;
  expect(restored).toEqual(graph);
  // Redo after undo lands on the same state again.
  expect(applyEdit(restored, action).graph).toEqual(next);
  return next;
}

describe('applyEdit round trips', () => {
  it('addNode (end and at index)', () => {
    const g = sample();
    expect(roundTrip(g, { type: 'addNode', node: createNode('audio', { x: 1, y: 1 }, 'a') }).nodes.at(-1)?.id).toBe('a');
    expect(roundTrip(g, { type: 'addNode', node: createNode('result', { x: 1, y: 1 }, 'r'), index: 1 }).nodes[1].id).toBe('r');
  });

  it('removeNode removes its edges and undo restores node and edge order exactly', () => {
    const g = sample();
    const next = roundTrip(g, { type: 'removeNode', nodeId: 'c' });
    expect(next.nodes.map(n => n.id)).toEqual(['p', 's1', 's2']);
    expect(next.edges.map(e => e.id)).toEqual(['e2']);
  });

  it('moveNodes moves many ids, ignores unknown ids', () => {
    const next = roundTrip(sample(), { type: 'moveNodes', positions: { c: { x: 5, y: 5 }, s2: { x: 9, y: 9 }, nope: { x: 1, y: 1 } } });
    expect(next.nodes.find(n => n.id === 'c')?.position).toEqual({ x: 5, y: 5 });
    expect(next.nodes.find(n => n.id === 's2')?.position).toEqual({ x: 9, y: 9 });
  });

  it('updateNodeData shallow-merges', () => {
    const next = roundTrip(sample(), { type: 'updateNodeData', nodeId: 's1', patch: { text: 'a man walks', durationSec: 8 } });
    expect(next.nodes.find(n => n.id === 's1')?.data).toEqual({ model: '', durationSec: 8, text: 'a man walks', edited: false });
  });

  it('connect (end and at index) and disconnect', () => {
    const g = sample();
    expect(roundTrip(g, { type: 'connect', edge: createEdge('p', 's2', 'e4') }).edges.at(-1)?.id).toBe('e4');
    expect(roundTrip(g, { type: 'connect', edge: createEdge('p', 's2', 'e4'), index: 0 }).edges[0].id).toBe('e4');
    expect(roundTrip(g, { type: 'disconnect', edgeId: 'e2' }).edges.map(e => e.id)).toEqual(['e1', 'e3']);
  });

  it('setViewport', () => {
    expect(roundTrip(sample(), { type: 'setViewport', viewport: { x: 10, y: 20, zoom: 2 } }).viewport).toEqual({ x: 10, y: 20, zoom: 2 });
  });

  it('batch applies in order and undoes in reverse', () => {
    roundTrip(sample(), {
      type: 'batch',
      label: 'add and wire',
      actions: [
        { type: 'addNode', node: createNode('generate', { x: 400, y: 0 }, 'g') },
        { type: 'connect', edge: createEdge('s1', 'g', 'e9') },
        { type: 'removeNode', nodeId: 'p' },
      ],
    });
  });
});

describe('applyEdit rejections and no-ops return the same reference', () => {
  const g = sample();
  const cases: Array<[string, EditAction]> = [
    ['self-loop', { type: 'connect', edge: createEdge('s1', 's1', 'x') }],
    ['duplicate edge', { type: 'connect', edge: createEdge('c', 's1', 'x') }],
    ['duplicate edge id', { type: 'connect', edge: createEdge('p', 's2', 'e1') }],
    ['2-cycle', { type: 'connect', edge: createEdge('s1', 'c', 'x') }],
    ['missing endpoint', { type: 'connect', edge: createEdge('c', 'ghost', 'x') }],
    ['duplicate node id', { type: 'addNode', node: createNode('concept', { x: 0, y: 0 }, 'c') }],
    ['remove unknown node', { type: 'removeNode', nodeId: 'ghost' }],
    ['disconnect unknown edge', { type: 'disconnect', edgeId: 'ghost' }],
    ['move to same position', { type: 'moveNodes', positions: { c: { x: 0, y: 0 } } }],
    ['update with same values', { type: 'updateNodeData', nodeId: 's1', patch: { text: '' } }],
    ['update with a key the kind lacks', { type: 'updateNodeData', nodeId: 'c', patch: { model: 'veo' } }],
    ['update with a bad enum value', { type: 'updateNodeData', nodeId: 'p', patch: { presetKind: 'bogus' as 'world' } }],
    ['same viewport', { type: 'setViewport', viewport: { x: 0, y: 0, zoom: 1 } }],
    ['empty batch', { type: 'batch', actions: [], label: 'x' }],
  ];
  for (const [name, action] of cases) {
    it(name, () => {
      expect(applyEdit(g, action).graph).toBe(g);
    });
  }

  it('rejects a 3-cycle', () => {
    const chain: Graph = {
      ...createEmptyGraph(),
      nodes: [createNode('concept', { x: 0, y: 0 }, 'a'), createNode('shot', { x: 0, y: 0 }, 'b'), createNode('generate', { x: 0, y: 0 }, 'c')],
      edges: [createEdge('a', 'b', 'ab'), createEdge('b', 'c', 'bc')],
    };
    expect(applyEdit(chain, { type: 'connect', edge: createEdge('c', 'a', 'ca') }).graph).toBe(chain);
  });
});
