import { describe, expect, it } from 'vitest';
import { createEdge, createEmptyGraph, createNode } from './graph';
import {
  deleteGraph, GraphFormatError, GraphVersionError, listGraphs, loadGraph, migrateGraph, saveGraph,
  type GraphRecord, type GraphStorage,
} from './persistence';
import type { Graph } from './types';

function memoryStorage(): GraphStorage & { rows: Map<string, unknown> } {
  const rows = new Map<string, unknown>();
  return {
    rows,
    get: id => Promise.resolve(structuredClone(rows.get(id))),
    getAll: () => Promise.resolve([...rows.values()].map(r => structuredClone(r))),
    put: (record: GraphRecord) => { rows.set(record.id, structuredClone(record)); return Promise.resolve(); },
    delete: id => { rows.delete(id); return Promise.resolve(); },
  };
}

function sample(): Graph {
  return {
    ...createEmptyGraph(),
    nodes: [createNode('concept', { x: 0, y: 0 }, 'c'), createNode('shot', { x: 200, y: 0 }, 's')],
    edges: [createEdge('c', 's', 'e')],
    viewport: { x: 4, y: 5, zoom: 0.5 },
  };
}

describe('persistence', () => {
  it('round-trips a graph and lists newest first', async () => {
    const storage = memoryStorage();
    await saveGraph('g1', 'First', sample(), storage);
    await new Promise(r => setTimeout(r, 2));
    await saveGraph('g2', 'Second', createEmptyGraph(), storage);
    const loaded = await loadGraph('g1', storage);
    expect(loaded?.graph).toEqual(sample());
    expect(loaded?.name).toBe('First');
    expect((await listGraphs(storage)).map(s => s.id)).toEqual(['g2', 'g1']);
    await deleteGraph('g1', storage);
    expect(await loadGraph('g1', storage)).toBeNull();
    expect((await listGraphs(storage)).map(s => s.id)).toEqual(['g2']);
  });

  it('migrateGraph accepts a v1 graph unchanged', () => {
    expect(migrateGraph(structuredClone(sample()))).toEqual(sample());
  });

  it('migrateGraph throws a typed error for a newer schema version', () => {
    const raw = { ...sample(), schemaVersion: 2 };
    expect(() => migrateGraph(raw)).toThrow(GraphVersionError);
    try { migrateGraph(raw); } catch (e) { expect(e instanceof GraphVersionError && e.version).toBe(2); }
  });

  it('migrateGraph rejects corrupt graphs', () => {
    const bad: unknown[] = [
      null,
      { ...sample(), schemaVersion: 'one' },
      { ...sample(), nodes: [{ id: 'c', kind: 'concept', position: { x: 0, y: 0 }, data: { text: 1 } }] },
      { ...sample(), nodes: [{ id: 'c', kind: 'mystery', position: { x: 0, y: 0 }, data: {} }] },
      { ...sample(), edges: [createEdge('c', 'ghost', 'e')] },
      { ...sample(), nodes: [...sample().nodes, createNode('concept', { x: 0, y: 0 }, 'c')] },
      { ...sample(), viewport: { x: 0, y: 0 } },
    ];
    for (const raw of bad) expect(() => migrateGraph(raw)).toThrow(GraphFormatError);
  });

  it('loadGraph surfaces a newer-version record instead of silently dropping it', async () => {
    const storage = memoryStorage();
    storage.rows.set('g', { id: 'g', name: 'Future', updatedAt: 1, graph: { ...sample(), schemaVersion: 99 } });
    await expect(loadGraph('g', storage)).rejects.toBeInstanceOf(GraphVersionError);
  });
});
