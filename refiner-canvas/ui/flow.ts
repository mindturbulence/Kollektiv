// Pure mapping between the framework-free canvas graph and @xyflow/react props.
// The store stays the single source of truth; xyflow runs in controlled mode over what toFlow() returns.

import type { Connection, Edge, EdgeChange, Node, NodeChange } from '@xyflow/react';
import { createEdge } from '../core/graph';
import type { EditAction, Graph, GraphNode, NodeKind, NodeRunState, NodeRunStatus, XY } from '../core/types';
import { parseShotScript } from '../../utils/shotScript';

export interface CanvasNodeData extends Record<string, unknown> {
  graphNode: GraphNode;
  status: NodeRunStatus;
  error?: string;
}
export type CanvasFlowNode = Node<CanvasNodeData, NodeKind>;

export interface Size { width: number; height: number }

/** Transient view state that is not part of the graph document. */
export interface FlowOverlay {
  selected?: ReadonlySet<string>;
  /** Positions of nodes mid-drag; committed to the store once, on drag stop. */
  positions?: Readonly<Record<string, XY>>;
  /** Sizes xyflow measured; it needs them echoed back in controlled mode. */
  measured?: Readonly<Record<string, Size>>;
}

// Stable `data` objects keep memoised node components from re-rendering on unrelated store changes.
const dataCache = new WeakMap<GraphNode, Map<string, CanvasNodeData>>();

function nodeData(graphNode: GraphNode, run: NodeRunState): CanvasNodeData {
  const key = `${run.status}|${run.error ?? ''}`;
  let byKey = dataCache.get(graphNode);
  if (!byKey) {
    byKey = new Map();
    dataCache.set(graphNode, byKey);
  }
  let data = byKey.get(key);
  if (!data) {
    data = { graphNode, status: run.status, error: run.error };
    byKey.set(key, data);
  }
  return data;
}

export function toFlow(
  graph: Graph,
  runStates: ReadonlyMap<string, NodeRunState>,
  overlay: FlowOverlay = {},
): { nodes: CanvasFlowNode[]; edges: Edge[] } {
  const { selected, positions, measured } = overlay;
  const nodes = graph.nodes.map((n): CanvasFlowNode => ({
    id: n.id,
    type: n.kind,
    position: positions?.[n.id] ?? n.position,
    data: nodeData(n, runStates.get(n.id) ?? { status: 'idle' }),
    selected: selected?.has(n.id) ?? false,
    ...(measured?.[n.id] ? { measured: measured[n.id] } : {}),
  }));
  const edges = graph.edges.map((e): Edge => ({ id: e.id, source: e.source, target: e.target, selected: selected?.has(e.id) ?? false }));
  return { nodes, edges };
}

/** Folds xyflow 'select' (and 'remove') changes for nodes or edges into the selected-id set. Ids are
 *  UUIDs, so one set covers both. Returns `prev` itself when nothing changed. */
export function applySelection(prev: ReadonlySet<string>, changes: ReadonlyArray<NodeChange | EdgeChange>): ReadonlySet<string> {
  let next: Set<string> | null = null;
  for (const c of changes) {
    if (c.type === 'select') {
      if (c.selected === (next ?? prev).has(c.id)) continue;
      next ??= new Set(prev);
      if (c.selected) next.add(c.id); else next.delete(c.id);
    } else if (c.type === 'remove' && (next ?? prev).has(c.id)) {
      next ??= new Set(prev);
      next.delete(c.id);
    }
  }
  return next ?? prev;
}

/** Position and measured-size changes from xyflow. Everything else is handled elsewhere (selection) or
 *  by onDelete (removal). */
export function fromNodeChanges(changes: ReadonlyArray<NodeChange>): { positions: Record<string, XY>; measured: Record<string, Size> } {
  const positions: Record<string, XY> = {};
  const measured: Record<string, Size> = {};
  for (const c of changes) {
    if (c.type === 'position' && c.position) positions[c.id] = { x: c.position.x, y: c.position.y };
    else if (c.type === 'dimensions' && c.dimensions) measured[c.id] = { width: c.dimensions.width, height: c.dimensions.height };
  }
  return { positions, measured };
}

/** One undo step for a delete: nodes first (which also drops their edges), then any edges still left. */
export function deleteAction(nodeIds: string[], edgeIds: string[]): EditAction {
  return {
    type: 'batch',
    label: 'delete',
    actions: [
      ...nodeIds.map((nodeId): EditAction => ({ type: 'removeNode', nodeId })),
      ...edgeIds.map((edgeId): EditAction => ({ type: 'disconnect', edgeId })),
    ],
  };
}

export function connectAction(conn: Connection): EditAction | null {
  if (!conn.source || !conn.target) return null;
  return { type: 'connect', edge: createEdge(conn.source, conn.target) };
}

/** First non-empty line of a shot's script plus its beat count, for the collapsed node. */
export function shotSummary(text: string): { firstLine: string; beats: number } {
  const firstLine = text.split(/\r?\n/).map(l => l.trim()).find(Boolean) ?? '';
  return { firstLine, beats: parseShotScript(text).beats.length };
}
