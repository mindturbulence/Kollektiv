// Pure, immutable applyEdit for every canvas EditAction. Same contracts as video-editor/core/actions/apply.ts:
// - A no-op or rejected edit returns the SAME `graph` reference, so the store can skip history.
// - Inverses are snapshots of what the action touched (with array indices), so undo restores exactly,
//   including node and edge order (edge order is input order for the executor).

import { downstreamOf, isGraphNode } from './graph';
import type { EditAction, Graph, GraphEdge, GraphNode, XY } from './types';

type Result = { graph: Graph; inverse: EditAction };

function noop(graph: Graph): Result {
  return { graph, inverse: { type: 'batch', actions: [], label: 'noop' } };
}

function insertAt<T>(list: T[], item: T, index: number | undefined): T[] {
  const next = [...list];
  next.splice(index === undefined ? next.length : Math.max(0, Math.min(index, next.length)), 0, item);
  return next;
}

function canConnect(graph: Graph, edge: GraphEdge): boolean {
  const { source, target } = edge;
  if (source === target) return false;
  if (!graph.nodes.some(n => n.id === source) || !graph.nodes.some(n => n.id === target)) return false;
  if (graph.edges.some(e => e.id === edge.id || (e.source === source && e.target === target))) return false;
  // source -> target closes a cycle iff source is already reachable from target.
  return !downstreamOf(graph, [target]).has(source);
}

export function applyEdit(graph: Graph, action: EditAction): Result {
  switch (action.type) {
    case 'addNode': {
      if (graph.nodes.some(n => n.id === action.node.id)) return noop(graph);
      return {
        graph: { ...graph, nodes: insertAt(graph.nodes, action.node, action.index) },
        inverse: { type: 'removeNode', nodeId: action.node.id },
      };
    }

    case 'removeNode': {
      const index = graph.nodes.findIndex(n => n.id === action.nodeId);
      if (index === -1) return noop(graph);
      const node = graph.nodes[index];
      const touches = (e: GraphEdge) => e.source === node.id || e.target === node.id;
      // Re-inserting removed edges in ascending original index puts each back at its exact position.
      const restoreEdges = graph.edges.flatMap((edge, i): EditAction[] => (touches(edge) ? [{ type: 'connect', edge, index: i }] : []));
      return {
        graph: { ...graph, nodes: graph.nodes.filter(n => n.id !== node.id), edges: graph.edges.filter(e => !touches(e)) },
        inverse: { type: 'batch', label: 'undo removeNode', actions: [{ type: 'addNode', node, index }, ...restoreEdges] },
      };
    }

    case 'moveNodes': {
      const before: Record<string, XY> = {};
      const nodes = graph.nodes.map((n): GraphNode => {
        const to = Object.prototype.hasOwnProperty.call(action.positions, n.id) ? action.positions[n.id] : undefined;
        if (!to || (to.x === n.position.x && to.y === n.position.y)) return n;
        before[n.id] = n.position;
        return { ...n, position: { x: to.x, y: to.y } };
      });
      if (Object.keys(before).length === 0) return noop(graph);
      return { graph: { ...graph, nodes }, inverse: { type: 'moveNodes', positions: before } };
    }

    case 'updateNodeData': {
      const node = graph.nodes.find(n => n.id === action.nodeId);
      if (!node) return noop(graph);
      const current: Record<string, unknown> = node.data;
      const patch: Record<string, unknown> = action.patch;
      if (!Object.keys(patch).some(k => patch[k] !== current[k])) return noop(graph);
      const merged = { ...node, data: { ...node.data, ...action.patch } };
      // Rejects keys the kind lacks and wrongly typed values, and narrows the merge back to GraphNode.
      if (!isGraphNode(merged)) return noop(graph);
      return {
        graph: { ...graph, nodes: graph.nodes.map(n => (n.id === node.id ? merged : n)) },
        // A kind's data has a fixed key set, so the whole old data object is an exact restore patch.
        inverse: { type: 'updateNodeData', nodeId: node.id, patch: node.data },
      };
    }

    case 'connect': {
      if (!canConnect(graph, action.edge)) return noop(graph);
      return {
        graph: { ...graph, edges: insertAt(graph.edges, action.edge, action.index) },
        inverse: { type: 'disconnect', edgeId: action.edge.id },
      };
    }

    case 'disconnect': {
      const index = graph.edges.findIndex(e => e.id === action.edgeId);
      if (index === -1) return noop(graph);
      return {
        graph: { ...graph, edges: graph.edges.filter((_, i) => i !== index) },
        inverse: { type: 'connect', edge: graph.edges[index], index },
      };
    }

    case 'setViewport': {
      const { x, y, zoom } = action.viewport;
      const cur = graph.viewport;
      if (x === cur.x && y === cur.y && zoom === cur.zoom) return noop(graph);
      return { graph: { ...graph, viewport: { x, y, zoom } }, inverse: { type: 'setViewport', viewport: cur } };
    }

    case 'batch': {
      let cur = graph;
      const inverses: EditAction[] = [];
      for (const sub of action.actions) {
        const result = applyEdit(cur, sub);
        if (result.graph !== cur) inverses.push(result.inverse);
        cur = result.graph;
      }
      if (cur === graph) return noop(graph);
      return { graph: cur, inverse: { type: 'batch', actions: inverses.reverse(), label: `undo ${action.label}` } };
    }
  }
}
