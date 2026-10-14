import { describe, expect, it } from 'vitest';
import { applyEdit } from '../core/apply';
import { createEdge, createEmptyGraph, createNode } from '../core/graph';
import type { Graph, NodeRunState } from '../core/types';
import { applySelection, connectAction, deleteAction, fromNodeChanges, shotSummary, toFlow } from './flow';

function sampleGraph(): Graph {
  const a = createNode('concept', { x: 0, y: 0 }, 'a');
  const b = createNode('shot', { x: 300, y: 10 }, 'b');
  return { ...createEmptyGraph(), nodes: [a, b], edges: [createEdge('a', 'b', 'e1')] };
}

describe('toFlow', () => {
  it('maps nodes and edges and applies run status', () => {
    const states = new Map<string, NodeRunState>([['b', { status: 'error', error: 'boom' }]]);
    const { nodes, edges } = toFlow(sampleGraph(), states);
    expect(nodes.map(n => [n.id, n.type, n.position])).toEqual([['a', 'concept', { x: 0, y: 0 }], ['b', 'shot', { x: 300, y: 10 }]]);
    expect(nodes[0].data.status).toBe('idle');
    expect(nodes[1].data).toMatchObject({ status: 'error', error: 'boom' });
    expect(edges).toEqual([{ id: 'e1', source: 'a', target: 'b', selected: false }]);
  });

  it('overlays drag positions, selection and measured sizes without touching the graph', () => {
    const g = sampleGraph();
    const { nodes, edges } = toFlow(g, new Map(), {
      positions: { a: { x: 5, y: 6 } },
      selected: new Set(['b', 'e1']),
      measured: { b: { width: 200, height: 80 } },
    });
    expect(nodes[0].position).toEqual({ x: 5, y: 6 });
    expect(g.nodes[0].position).toEqual({ x: 0, y: 0 });
    expect(nodes[1].selected).toBe(true);
    expect(nodes[1].measured).toEqual({ width: 200, height: 80 });
    expect(edges[0].selected).toBe(true);
  });

  it('reuses the same data object for an unchanged node and status', () => {
    const g = sampleGraph();
    const first = toFlow(g, new Map()).nodes[0].data;
    expect(toFlow(g, new Map()).nodes[0].data).toBe(first);
    expect(toFlow(g, new Map([['a', { status: 'done' }]])).nodes[0].data).not.toBe(first);
  });
});

describe('change helpers', () => {
  it('applySelection adds, removes and keeps identity when unchanged', () => {
    const prev = new Set(['a']);
    const next = applySelection(prev, [{ type: 'select', id: 'b', selected: true }, { type: 'select', id: 'a', selected: false }]);
    expect([...next]).toEqual(['b']);
    expect(applySelection(next, [{ type: 'select', id: 'b', selected: true }])).toBe(next);
  });

  it('fromNodeChanges keeps only position and dimension changes', () => {
    const r = fromNodeChanges([
      { type: 'position', id: 'a', position: { x: 1, y: 2 }, dragging: true },
      { type: 'dimensions', id: 'b', dimensions: { width: 10, height: 20 } },
      { type: 'select', id: 'a', selected: true },
      { type: 'remove', id: 'a' },
    ]);
    expect(r).toEqual({ positions: { a: { x: 1, y: 2 } }, measured: { b: { width: 10, height: 20 } }, resizing: {}, resized: {} });
  });

  it('connectAction builds a connect edit and rejects incomplete connections', () => {
    const act = connectAction({ source: 'a', target: 'b', sourceHandle: null, targetHandle: null });
    expect(act).toMatchObject({ type: 'connect', edge: { source: 'a', target: 'b' } });
    expect(connectAction({ source: 'a', target: '', sourceHandle: null, targetHandle: null })).toBeNull();
  });

  it('the core rejects a cycle produced by connectAction', () => {
    const g = sampleGraph();
    const act = connectAction({ source: 'b', target: 'a', sourceHandle: null, targetHandle: null });
    expect(act).not.toBeNull();
    if (act) expect(applyEdit(g, act).graph).toBe(g);
  });

  it('deleteAction is a single batch that undoes in one step', () => {
    const g = sampleGraph();
    const { graph, inverse } = applyEdit(g, deleteAction(['b'], ['e1']));
    expect(graph.nodes).toHaveLength(1);
    expect(graph.edges).toHaveLength(0);
    expect(applyEdit(graph, inverse).graph).toEqual(g);
  });
});

describe('shotSummary', () => {
  it('returns first line and beat count', () => {
    expect(shotSummary('\nA hero walks.\n\n0-3s: wide shot\n3-5s: close up')).toMatchObject({ firstLine: 'A hero walks.', beats: 2 });
    expect(shotSummary('')).toEqual({ firstLine: '', beats: 0 });
  });
});
