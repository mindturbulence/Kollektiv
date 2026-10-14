import { describe, expect, it } from 'vitest';
import { createEdge, createEmptyGraph, createNode } from './graph';
import { GraphCycleError, runGraph } from './executor';
import { createCanvasStore } from './store';
import type { Graph, GraphNode } from './types';

// A long chain plus fan-out: 1 concept -> 199 shots chained, which stresses reachability and ordering.
function chain(n: number): Graph {
  const nodes: GraphNode[] = [createNode('concept', { x: 0, y: 0 }, 'n0')];
  const edges = [];
  for (let i = 1; i < n; i++) {
    nodes.push(createNode('shot', { x: i * 10, y: 0 }, `n${i}`));
    edges.push(createEdge(`n${i - 1}`, `n${i}`, `e${i}`));
  }
  return { ...createEmptyGraph(), nodes, edges };
}

describe('canvas core at scale', () => {
  it('runs a 200-node chain within a generous time budget, in order', async () => {
    const order: string[] = [];
    const started = performance.now();
    const states = await runGraph(chain(200), {
      runners: { shot: node => { order.push(node.id); return Promise.resolve({ text: node.id }); } },
    });
    expect(performance.now() - started).toBeLessThan(2000);
    expect(order).toHaveLength(199);
    expect(order[0]).toBe('n1');
    expect(order.at(-1)).toBe('n199');
    expect([...states.values()].every(s => s.status === 'done')).toBe(true);
  });

  it('marks a whole 200-node chain dirty from its head and undoes a 200-node batch in one step', () => {
    const store = createCanvasStore(chain(200));
    for (const n of store.getSnapshot().nodes) store.setRunState(n.id, { status: 'done' });
    store.dispatch({ type: 'updateNodeData', nodeId: 'n0', patch: { text: 'changed' } });
    const dirty = [...store.getRunStates().values()].filter(s => s.status === 'dirty').length;
    expect(dirty).toBe(200);
    const before = store.getSnapshot().nodes.length;
    store.dispatch({
      type: 'batch',
      label: 'many',
      actions: Array.from({ length: 200 }, (_, i) => ({ type: 'addNode' as const, node: createNode('audio', { x: i, y: 50 }) })),
    });
    expect(store.getSnapshot().nodes).toHaveLength(before + 200);
    store.undo();
    expect(store.getSnapshot().nodes).toHaveLength(before);
  });

  it('reports a cycle in a loaded (corrupt) graph instead of hanging', async () => {
    const g = chain(5);
    g.edges.push(createEdge('n4', 'n1', 'back'));
    await expect(runGraph(g, { runners: {} })).rejects.toBeInstanceOf(GraphCycleError);
  });
});
