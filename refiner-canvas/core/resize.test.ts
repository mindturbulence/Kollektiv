import { describe, expect, it } from 'vitest';
import { applyEdit } from './apply';
import { createEmptyGraph, createNode, isGraphNode } from './graph';
import { migrateGraph } from './persistence';
import { createCanvasStore } from './store';
import { NODE_SIZE, type Graph } from './types';

const base = (): Graph => ({ ...createEmptyGraph(), nodes: [createNode('shot', { x: 0, y: 0 }, 's')] });

describe('resizeNode', () => {
  it('sets a size and its inverse restores "no size" exactly', () => {
    const g = base();
    const { graph, inverse } = applyEdit(g, { type: 'resizeNode', nodeId: 's', size: { width: 400, height: 240 } });
    expect(graph.nodes[0].size).toEqual({ width: 400, height: 240 });
    const back = applyEdit(graph, inverse).graph;
    expect(back.nodes[0].size).toBeUndefined();
    expect('size' in back.nodes[0]).toBe(false);
  });

  it('clamps to the minimum and maximum card size', () => {
    const small = applyEdit(base(), { type: 'resizeNode', nodeId: 's', size: { width: 10, height: 10 } }).graph.nodes[0].size;
    expect(small).toEqual({ width: NODE_SIZE.minWidth, height: NODE_SIZE.minHeight });
    const big = applyEdit(base(), { type: 'resizeNode', nodeId: 's', size: { width: 9999, height: 9999 } }).graph.nodes[0].size;
    expect(big).toEqual({ width: NODE_SIZE.maxWidth, height: NODE_SIZE.maxHeight });
  });

  it('keeps height optional (width only) and clears with null', () => {
    const w = applyEdit(base(), { type: 'resizeNode', nodeId: 's', size: { width: 320 } });
    expect(w.graph.nodes[0].size).toEqual({ width: 320 });
    const cleared = applyEdit(w.graph, { type: 'resizeNode', nodeId: 's', size: null });
    expect(cleared.graph.nodes[0].size).toBeUndefined();
  });

  it('is a no-op for the same size, an unknown node, or clearing nothing', () => {
    const g = base();
    expect(applyEdit(g, { type: 'resizeNode', nodeId: 'nope', size: { width: 300 } }).graph).toBe(g);
    expect(applyEdit(g, { type: 'resizeNode', nodeId: 's', size: null }).graph).toBe(g);
    const sized = applyEdit(g, { type: 'resizeNode', nodeId: 's', size: { width: 300 } }).graph;
    expect(applyEdit(sized, { type: 'resizeNode', nodeId: 's', size: { width: 300 } }).graph).toBe(sized);
  });

  it('is one undo step and does not dirty the node or its downstream', () => {
    const store = createCanvasStore(base());
    store.setRunState('s', { status: 'done' });
    store.dispatch({ type: 'resizeNode', nodeId: 's', size: { width: 500 } });
    expect(store.getRunStates().get('s')?.status).toBe('done');
    store.undo();
    expect(store.getSnapshot().nodes[0].size).toBeUndefined();
  });
});

describe('persisted size', () => {
  it('accepts a valid size and rejects a malformed one', () => {
    const n = createNode('concept', { x: 0, y: 0 }, 'c');
    expect(isGraphNode({ ...n, size: { width: 300, height: 200 } })).toBe(true);
    expect(isGraphNode({ ...n, size: { width: 300 } })).toBe(true);
    expect(isGraphNode({ ...n, size: { width: 'wide' } })).toBe(false);
    expect(isGraphNode({ ...n, size: 5 })).toBe(false);
  });

  it('a graph saved before sizes existed loads unchanged', () => {
    const g = base();
    expect(migrateGraph(structuredClone(g)).nodes[0].size).toBeUndefined();
  });
});
