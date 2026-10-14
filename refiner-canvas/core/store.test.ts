import { describe, expect, it, vi } from 'vitest';
import { createEdge, createEmptyGraph, createNode } from './graph';
import { createCanvasStore } from './store';
import type { Graph, NodeRunStatus } from './types';

/** Diamond a -> b, a -> c, b -> d, c -> d, plus an unrelated node x. */
function diamond(): Graph {
  return {
    ...createEmptyGraph(),
    nodes: [
      createNode('concept', { x: 0, y: 0 }, 'a'),
      createNode('shot', { x: 100, y: 0 }, 'b'),
      createNode('shot', { x: 100, y: 100 }, 'c'),
      createNode('assemble', { x: 200, y: 0 }, 'd'),
      createNode('concept', { x: 0, y: 300 }, 'x'),
    ],
    edges: [createEdge('a', 'b', 'ab'), createEdge('a', 'c', 'ac'), createEdge('b', 'd', 'bd'), createEdge('c', 'd', 'cd')],
  };
}

function doneStore() {
  const store = createCanvasStore();
  store.load(diamond());
  for (const id of ['a', 'b', 'c', 'd', 'x']) store.setRunState(id, { status: 'done', output: { text: id } });
  return store;
}

function statuses(store: ReturnType<typeof createCanvasStore>): Record<string, NodeRunStatus> {
  const out: Record<string, NodeRunStatus> = {};
  for (const n of store.getSnapshot().nodes) out[n.id] = store.getRunStates().get(n.id)?.status ?? 'idle';
  return out;
}

describe('canvas store', () => {
  it('dispatch, undo and redo, and no-op edits leave history alone', () => {
    const store = createCanvasStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const empty = store.getSnapshot();
    store.dispatch({ type: 'addNode', node: createNode('concept', { x: 0, y: 0 }, 'a') });
    expect(store.getSnapshot().nodes).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);
    const before = store.getSnapshot();
    store.dispatch({ type: 'removeNode', nodeId: 'ghost' });
    expect(store.getSnapshot()).toBe(before);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.undo()).toBe(true);
    expect(store.getSnapshot()).toEqual(empty);
    expect(store.canUndo()).toBe(false);
    expect(store.redo()).toBe(true);
    expect(store.getSnapshot().nodes[0].id).toBe('a');
    expect(store.redo()).toBe(false);
  });

  it('caps history at 200 steps', () => {
    const store = createCanvasStore();
    store.dispatch({ type: 'addNode', node: createNode('concept', { x: 0, y: 0 }, 'a') });
    for (let i = 1; i <= 205; i++) store.dispatch({ type: 'moveNodes', positions: { a: { x: i, y: 0 } } });
    let undone = 0;
    while (store.undo()) undone++;
    expect(undone).toBe(200);
    expect(store.getSnapshot().nodes[0].position.x).toBe(5);
  });

  it('setViewport changes the graph but is not an undo step', () => {
    const store = createCanvasStore();
    store.dispatch({ type: 'setViewport', viewport: { x: 1, y: 2, zoom: 3 } });
    expect(store.getSnapshot().viewport).toEqual({ x: 1, y: 2, zoom: 3 });
    expect(store.canUndo()).toBe(false);
  });

  it('load resets history and run states', () => {
    const store = doneStore();
    store.dispatch({ type: 'moveNodes', positions: { a: { x: 9, y: 9 } } });
    store.load(diamond());
    expect(store.canUndo()).toBe(false);
    expect(store.getRunStates().size).toBe(0);
  });

  it('run states are not on the undo stack', () => {
    const store = doneStore();
    expect(store.canUndo()).toBe(false);
    expect(store.getRunStates().get('a')?.status).toBe('done');
  });

  it('updateNodeData marks the node and everything downstream dirty through a diamond', () => {
    const store = doneStore();
    store.dispatch({ type: 'updateNodeData', nodeId: 'a', patch: { text: 'new' } });
    expect(statuses(store)).toEqual({ a: 'dirty', b: 'dirty', c: 'dirty', d: 'dirty', x: 'done' });
  });

  it('a mid-diamond edit dirties only its own branch', () => {
    const store = doneStore();
    store.dispatch({ type: 'updateNodeData', nodeId: 'b', patch: { text: 'new' } });
    expect(statuses(store)).toEqual({ a: 'done', b: 'dirty', c: 'done', d: 'dirty', x: 'done' });
  });

  it('connect and disconnect dirty the target and its downstream', () => {
    const store = doneStore();
    store.dispatch({ type: 'connect', edge: createEdge('x', 'c', 'xc') });
    expect(statuses(store)).toEqual({ a: 'done', b: 'done', c: 'dirty', d: 'dirty', x: 'done' });
    const s2 = doneStore();
    s2.dispatch({ type: 'disconnect', edgeId: 'ab' });
    expect(statuses(s2)).toEqual({ a: 'done', b: 'dirty', c: 'done', d: 'dirty', x: 'done' });
  });

  it('removeNode dirties its former downstream and drops its run state; undo dirties the restored edges', () => {
    const store = doneStore();
    store.dispatch({ type: 'removeNode', nodeId: 'b' });
    expect(store.getRunStates().has('b')).toBe(false);
    expect(statuses(store)).toEqual({ a: 'done', c: 'done', d: 'dirty', x: 'done' });
    store.undo();
    expect(store.getSnapshot()).toEqual(diamond());
    expect(statuses(store)).toEqual({ a: 'done', b: 'idle', c: 'done', d: 'dirty', x: 'done' });
  });

  it('idle nodes stay idle when upstream changes', () => {
    const store = createCanvasStore();
    store.load(diamond());
    store.dispatch({ type: 'updateNodeData', nodeId: 'a', patch: { text: 'new' } });
    expect(store.getRunStates().size).toBe(0);
  });

  it('moving a node dirties a downstream assemble (clip order follows x) but nothing else', () => {
    const store = doneStore();
    store.dispatch({ type: 'moveNodes', positions: { b: { x: 500, y: 0 }, x: { x: 1, y: 1 } } });
    expect(statuses(store)).toEqual({ a: 'done', b: 'done', c: 'done', d: 'dirty', x: 'done' });
  });

  it('setRunState replaces the map so snapshots stay comparable by reference', () => {
    const store = createCanvasStore();
    const before = store.getRunStates();
    store.setRunState('a', { status: 'running' });
    expect(store.getRunStates()).not.toBe(before);
    expect(before.size).toBe(0);
  });
});
