// Reusable workflows: a template keeps a graph's structure and settings (models, lengths, presets, audio
// direction) and drops the per-run inputs and outputs, so the same pipeline can be run on a new idea.

import { createEdge, createNode } from './graph';
import type { EditAction, Graph, GraphNode } from './types';

export const TEMPLATE_PREFIX = 'template:';

export const isTemplateId = (id: string): boolean => id.startsWith(TEMPLATE_PREFIX);

const strip = (n: GraphNode): GraphNode => {
  if (n.kind === 'concept') return { ...n, data: { text: '' } };
  if (n.kind === 'shot') return { ...n, data: { ...n.data, text: '', edited: false } };
  return n;
};

/** The graph without concept text and shot scripts; presets and settings are kept. */
export const makeTemplate = (graph: Graph): Graph => ({ ...graph, nodes: graph.nodes.map(strip) });

/** A fresh copy with new ids so a template can be loaded more than once without clashes. */
export const instantiateTemplate = (template: Graph): Graph => {
  const ids = new Map<string, string>();
  const nodes = template.nodes.map(n => {
    const copy = createNode(n.kind, { ...n.position });
    ids.set(n.id, copy.id);
    return { ...copy, data: { ...n.data } } as GraphNode;
  });
  const edges = template.edges.flatMap(e => {
    const source = ids.get(e.source);
    const target = ids.get(e.target);
    return source && target ? [createEdge(source, target)] : [];
  });
  return { ...template, nodes, edges };
};

const ROW_GAP = 200;

/** One undoable batch that appends a fresh copy of the template below the existing nodes. */
export const templateToAction = (graph: Graph, template: Graph): EditAction => {
  const copy = instantiateTemplate(template);
  const top = copy.nodes.length ? Math.min(...copy.nodes.map(n => n.position.y)) : 0;
  const bottom = graph.nodes.length ? Math.max(...graph.nodes.map(n => n.position.y)) + ROW_GAP : 0;
  const dy = bottom - top;
  return {
    type: 'batch',
    label: 'Load template',
    actions: [
      ...copy.nodes.map((n): EditAction => ({ type: 'addNode', node: { ...n, position: { x: n.position.x, y: n.position.y + dy } } })),
      ...copy.edges.map((edge): EditAction => ({ type: 'connect', edge })),
    ],
  };
};
