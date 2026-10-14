// Graph helpers shared by apply, store, persistence and executor: node constructors, the per-kind
// data spec (one table drives defaults and runtime validation) and reachability.

import { SCHEMA_VERSION, type Graph, type GraphEdge, type GraphNode, type GraphNodeOf, type NodeDataMap, type NodeKind, type XY } from './types';

type FieldSpec = 'string' | 'number' | readonly string[];

const DATA_SPEC: { [K in NodeKind]: Record<keyof NodeDataMap[K], FieldSpec> } = {
  concept: { text: 'string' },
  preset: { presetKind: ['character', 'world', 'style'], text: 'string' },
  shot: { model: 'string', durationSec: 'number', text: 'string' },
  audio: { mode: ['off', 'auto', 'direct'], dialogue: 'string', sfx: 'string' },
  generate: { model: 'string' },
  result: {},
  assemble: {},
};

const DEFAULT_DATA: { [K in NodeKind]: NodeDataMap[K] } = {
  concept: { text: '' },
  preset: { presetKind: 'character', text: '' },
  shot: { model: '', durationSec: 5, text: '' },
  audio: { mode: 'auto', dialogue: '', sfx: '' },
  generate: { model: '' },
  result: {},
  assemble: {},
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isKind(v: unknown): v is NodeKind {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(DATA_SPEC, v);
}

function fieldOk(spec: FieldSpec, value: unknown): boolean {
  if (spec === 'string') return typeof value === 'string';
  if (spec === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === 'string' && spec.includes(value);
}

export function isXY(v: unknown): v is XY {
  return isRecord(v) && typeof v.x === 'number' && Number.isFinite(v.x) && typeof v.y === 'number' && Number.isFinite(v.y);
}

/** Exact shape check: data must carry exactly its kind's fields, each of the right type. */
export function isGraphNode(v: unknown): v is GraphNode {
  if (!isRecord(v) || typeof v.id !== 'string' || !isKind(v.kind) || !isXY(v.position) || !isRecord(v.data)) return false;
  const spec: Record<string, FieldSpec> = DATA_SPEC[v.kind];
  const data = v.data;
  const keys = Object.keys(data);
  return keys.length === Object.keys(spec).length && keys.every(k => k in spec && fieldOk(spec[k], data[k]));
}

export function isGraphEdge(v: unknown): v is GraphEdge {
  return isRecord(v) && typeof v.id === 'string' && typeof v.source === 'string' && typeof v.target === 'string';
}

export function createNode<K extends NodeKind>(kind: K, position: XY, id: string = crypto.randomUUID()): GraphNodeOf<K> {
  return { id, kind, position, data: { ...DEFAULT_DATA[kind] } };
}

export function createEdge(source: string, target: string, id: string = crypto.randomUUID()): GraphEdge {
  return { id, source, target };
}

export function createEmptyGraph(): Graph {
  return { schemaVersion: SCHEMA_VERSION, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
}

// ponytail: O(nodes x edges) scan; build an adjacency map if canvases grow past a few hundred edges.
function reach(edges: GraphEdge[], ids: Iterable<string>, from: 'source' | 'target'): Set<string> {
  const to = from === 'source' ? 'target' : 'source';
  const out = new Set<string>();
  const stack = [...ids];
  while (stack.length) {
    const cur = stack.pop();
    for (const e of edges) {
      if (e[from] === cur && !out.has(e[to])) {
        out.add(e[to]);
        stack.push(e[to]);
      }
    }
  }
  return out;
}

/** Every node reachable from `ids` along edges (not including `ids` themselves unless a cycle leads back). */
export function downstreamOf(graph: Graph, ids: Iterable<string>): Set<string> {
  return reach(graph.edges, ids, 'source');
}

/** Every node `ids` can be reached from. */
export function upstreamOf(graph: Graph, ids: Iterable<string>): Set<string> {
  return reach(graph.edges, ids, 'target');
}
