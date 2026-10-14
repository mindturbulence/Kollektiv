// ─── Kollektiv Refiner Canvas — store ────────────────────────────────────────
// Plain store, same pattern as video-editor/core/store.ts: getSnapshot() / subscribe(fn) / dispatch(action),
// read from React through useSyncExternalStore. Edits go through applyEdit(), whose inverse feeds undo.
// Per-node run state lives in a separate map that is never on the undo stack; graph edits mark the
// affected nodes 'dirty' there, and the executor only re-runs on an explicit user run.

import { History } from '../../video-editor/core/history/history';
import { applyEdit } from './apply';
import { createEmptyGraph, downstreamOf } from './graph';
import type { EditAction, Graph, NodeRunState } from './types';

const HISTORY_CAP = 200;

/** Nodes whose inputs or own data changed between two graphs. A move only matters to a downstream
 *  assemble, which orders its clips by source x position. */
function changedRoots(before: Graph, after: Graph): Set<string> {
  const roots = new Set<string>();
  const prevNodes = new Map(before.nodes.map(n => [n.id, n]));
  const kindOf = new Map(after.nodes.map(n => [n.id, n.kind]));
  for (const n of after.nodes) {
    const prev = prevNodes.get(n.id);
    if (!prev) continue;
    if (prev.data !== n.data) roots.add(n.id);
    if (prev.position.x !== n.position.x) {
      for (const e of after.edges) if (e.source === n.id && kindOf.get(e.target) === 'assemble') roots.add(e.target);
    }
  }
  const prevEdges = new Set(before.edges.map(e => e.id));
  const nextEdges = new Set(after.edges.map(e => e.id));
  for (const e of after.edges) if (!prevEdges.has(e.id)) roots.add(e.target);
  for (const e of before.edges) if (!nextEdges.has(e.id)) roots.add(e.target);
  return roots;
}

export type CanvasStore = ReturnType<typeof createCanvasStore>;

export function createCanvasStore(initial: Graph = createEmptyGraph()) {
  let graph = initial;
  let runStates: ReadonlyMap<string, NodeRunState> = new Map();
  const history = new History<EditAction>(HISTORY_CAP);
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(fn => fn());

  /** Swaps in `next`, drops run state of removed nodes and dirties everything the change reaches. */
  function commit(next: Graph): void {
    const roots = changedRoots(graph, next);
    const ids = new Set(next.nodes.map(n => n.id));
    const stale = new Set([...roots, ...downstreamOf(next, roots)]);
    const states = new Map<string, NodeRunState>();
    for (const [id, st] of runStates) {
      if (!ids.has(id)) continue;
      // 'idle' means never run; it has nothing to go stale.
      states.set(id, stale.has(id) && st.status !== 'idle' ? { ...st, status: 'dirty', error: undefined } : st);
    }
    graph = next;
    runStates = states;
    notify();
  }

  function step(action: EditAction | null): boolean {
    if (!action) return false;
    commit(applyEdit(graph, action).graph);
    return true;
  }

  return {
    getSnapshot: (): Graph => graph,
    getRunStates: (): ReadonlyMap<string, NodeRunState> => runStates,

    subscribe: (fn: () => void): (() => void) => {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },

    dispatch: (action: EditAction): void => {
      const { graph: next, inverse } = applyEdit(graph, action);
      if (next === graph) return;
      // Pan/zoom is view state: saved with the graph, but not worth an undo step.
      if (action.type !== 'setViewport') history.push(action, inverse);
      commit(next);
    },

    undo: (): boolean => step(history.undo()),
    redo: (): boolean => step(history.redo()),
    canUndo: (): boolean => history.canUndo(),
    canRedo: (): boolean => history.canRedo(),

    /** Replaces the graph (e.g. after loadGraph): history and run states start empty. */
    load: (next: Graph): void => {
      history.clear();
      graph = next;
      runStates = new Map();
      notify();
    },

    setRunState: (nodeId: string, state: NodeRunState): void => {
      runStates = new Map(runStates).set(nodeId, state);
      notify();
    },
  };
}

const canvasStore = createCanvasStore();

export const {
  getSnapshot, getRunStates, subscribe, dispatch, undo, redo, canUndo, canRedo, load, setRunState,
} = canvasStore;
