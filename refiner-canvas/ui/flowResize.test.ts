import { describe, expect, it } from 'vitest';
import type { NodeChange } from '@xyflow/react';
import { createEmptyGraph, createNode } from '../core/graph';
import { NODE_SIZE, type Graph } from '../core/types';
import { fromNodeChanges, toFlow } from './flow';

const graph = (): Graph => {
  const a = createNode('concept', { x: 0, y: 0 }, 'a');
  const b = createNode('shot', { x: 300, y: 0 }, 'b');
  b.size = { width: 400, height: 220 };
  return { ...createEmptyGraph(), nodes: [a, b] };
};

describe('toFlow sizes', () => {
  it('uses the default width with content height unless a size was set', () => {
    const { nodes } = toFlow(graph(), new Map());
    expect(nodes[0].width).toBe(NODE_SIZE.defaultWidth);
    expect(nodes[0].height).toBeUndefined();
    expect(nodes[1].width).toBe(400);
    expect(nodes[1].height).toBe(220);
  });

  it('a live resize overrides the stored size without touching the graph', () => {
    const g = graph();
    const { nodes } = toFlow(g, new Map(), { resizing: { b: { width: 520, height: 300 } } });
    expect(nodes[1].width).toBe(520);
    expect(nodes[1].height).toBe(300);
    expect(g.nodes[1].size).toEqual({ width: 400, height: 220 });
  });
});

describe('fromNodeChanges resize', () => {
  it('separates measured, live-resizing and finished resizes', () => {
    const changes: NodeChange[] = [
      { id: 'a', type: 'dimensions', dimensions: { width: 280, height: 90 } },
      { id: 'b', type: 'dimensions', dimensions: { width: 410, height: 230 }, setAttributes: true, resizing: true },
      { id: 'c', type: 'dimensions', dimensions: { width: 350, height: 200 }, setAttributes: true, resizing: false },
    ];
    const out = fromNodeChanges(changes);
    expect(out.measured).toEqual({ a: { width: 280, height: 90 } });
    expect(out.resizing).toEqual({ b: { width: 410, height: 230 } });
    expect(out.resized).toEqual({ c: { width: 350, height: 200 } });
  });
});
