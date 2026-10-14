// ─── Kollektiv Refiner Canvas — persistence ──────────────────────────────────
// Own IndexedDB database (same idiom as video-editor/core/autosave): one 'graphs' store keyed by id.
// Every function takes the storage as a trailing parameter so tests can pass an in-memory one.
// Everything read back is untrusted (older builds, manual edits, partial writes): migrateGraph checks it.

import { openDB, type IDBPDatabase } from 'idb';
import { isGraphEdge, isGraphNode } from './graph';
import { SCHEMA_VERSION, type Graph } from './types';

const DB_NAME = 'kollektiv-refiner-canvas';
const DB_VERSION = 1;
const GRAPHS_STORE = 'graphs';

export interface GraphRecord { id: string; name: string; updatedAt: number; graph: Graph }
export interface GraphSummary { id: string; name: string; updatedAt: number }

export interface GraphStorage {
  get(id: string): Promise<unknown>;
  getAll(): Promise<unknown[]>;
  put(record: GraphRecord): Promise<void>;
  delete(id: string): Promise<void>;
}

/** Stored graph is newer than this build understands; the UI should say "update the app", not overwrite it. */
export class GraphVersionError extends Error {
  constructor(readonly version: number) {
    super(`Canvas graph schema v${version} is newer than supported v${SCHEMA_VERSION}`);
    this.name = 'GraphVersionError';
  }
}

export class GraphFormatError extends Error {
  constructor(detail: string) {
    super(`Canvas graph is corrupt: ${detail}`);
    this.name = 'GraphFormatError';
  }
}

let dbPromise: Promise<IDBPDatabase> | null = null;
function getDB(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(GRAPHS_STORE)) db.createObjectStore(GRAPHS_STORE, { keyPath: 'id' });
    },
  });
  // A failed open (private mode, blocked) must not poison every later attempt.
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

export const idbGraphStorage: GraphStorage = {
  get: async id => (await getDB()).get(GRAPHS_STORE, id),
  getAll: async () => (await getDB()).getAll(GRAPHS_STORE),
  put: async record => { await (await getDB()).put(GRAPHS_STORE, record); },
  delete: async id => { await (await getDB()).delete(GRAPHS_STORE, id); },
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validates a stored graph and upgrades it to SCHEMA_VERSION. */
export function migrateGraph(raw: unknown): Graph {
  if (!isRecord(raw)) throw new GraphFormatError('not an object');
  const version = raw.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) throw new GraphFormatError('bad schemaVersion');
  if (version > SCHEMA_VERSION) throw new GraphVersionError(version);
  // ponytail: v1 is the only version; when v2 lands, add `if (version === 1) raw = v1ToV2(raw)` steps here.

  const { nodes, edges, viewport } = raw;
  if (!Array.isArray(nodes) || !nodes.every(isGraphNode)) throw new GraphFormatError('bad node');
  const ids = new Set(nodes.map(n => n.id));
  if (ids.size !== nodes.length) throw new GraphFormatError('duplicate node id');
  if (!Array.isArray(edges) || !edges.every(isGraphEdge)) throw new GraphFormatError('bad edge');
  if (!edges.every(e => ids.has(e.source) && ids.has(e.target))) throw new GraphFormatError('edge to a missing node');
  if (!isRecord(viewport) || ![viewport.x, viewport.y, viewport.zoom].every(n => typeof n === 'number' && Number.isFinite(n))) {
    throw new GraphFormatError('bad viewport');
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    nodes,
    edges,
    viewport: { x: Number(viewport.x), y: Number(viewport.y), zoom: Number(viewport.zoom) },
  };
}

export async function saveGraph(id: string, name: string, graph: Graph, storage: GraphStorage = idbGraphStorage): Promise<GraphRecord> {
  const record: GraphRecord = { id, name, updatedAt: Date.now(), graph };
  await storage.put(record);
  return record;
}

/** Null when absent. Throws GraphVersionError / GraphFormatError rather than returning a guess. */
export async function loadGraph(id: string, storage: GraphStorage = idbGraphStorage): Promise<GraphRecord | null> {
  const raw = await storage.get(id);
  if (raw === undefined) return null;
  if (!isRecord(raw) || typeof raw.name !== 'string' || typeof raw.updatedAt !== 'number') throw new GraphFormatError('bad record');
  return { id, name: raw.name, updatedAt: raw.updatedAt, graph: migrateGraph(raw.graph) };
}

/** Summaries only (no graph validation), newest first; unreadable rows are skipped. */
export async function listGraphs(storage: GraphStorage = idbGraphStorage): Promise<GraphSummary[]> {
  const out: GraphSummary[] = [];
  for (const r of await storage.getAll()) {
    if (isRecord(r) && typeof r.id === 'string' && typeof r.name === 'string' && typeof r.updatedAt === 'number') {
      out.push({ id: r.id, name: r.name, updatedAt: r.updatedAt });
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteGraph(id: string, storage: GraphStorage = idbGraphStorage): Promise<void> {
  await storage.delete(id);
}
