import type { AssistantTool } from './types';
import type { KnowledgeKind } from '../knowledgeService';
import { relationshipGraph } from '../relationshipGraph';
import { hydrateKnowledgeGraph } from './graphHydration';

const RELATABLE_KINDS = ['memory', 'gallery_item', 'prompt'] as const;
type RelatableKind = (typeof RELATABLE_KINDS)[number];

const badKind = () => `Error: kind must be one of ${RELATABLE_KINDS.join(', ')}.`;
const missing = (kind: string, id: string) =>
  `Error: no ${kind} item with id "${id}". Use search_memories / search_gallery / search_prompts to find current items.`;

export const graphTraversalTools: AssistantTool[] = [
  {
    name: 'traverse_knowledge',
    description:
      "Walk outward from one item to everything connected within N hops, following shared-tag links across memories, gallery items, and saved prompts. Use find_related_knowledge for direct neighbours only; use this to see a whole cluster.",
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', description: 'Kind of the starting item.', enum: [...RELATABLE_KINDS] },
        id: { type: 'string', description: 'Id of the starting item.' },
        max_depth: { type: 'number', description: 'How many hops to walk (default 2, max 4).' },
      },
      required: ['kind', 'id'],
    },
    execute: async ({ kind, id, max_depth }) => {
      if (!RELATABLE_KINDS.includes(kind as RelatableKind)) return badKind();
      await hydrateKnowledgeGraph();
      const k = kind as KnowledgeKind;
      if (!relationshipGraph.hasEntity(k, String(id))) return missing(String(kind), String(id));
      const depth = Math.min(Math.max(Number(max_depth) || 2, 1), 4);
      const nodes = relationshipGraph.traverse(k, String(id), depth);
      if (nodes.length <= 1) return 'No connected items found (this item shares no tags with anything else).';
      return JSON.stringify(nodes.map(n => ({
        kind: n.entity.kind,
        id: n.entity.id,
        label: n.entity.label,
        via: n.relation?.type,
      })));
    },
  },
  {
    name: 'find_knowledge_path',
    description:
      "Show how two items are connected — the shortest chain of shared-tag links between them. Answers 'what links this prompt to that image?'.",
    parameters: {
      type: 'object',
      properties: {
        from_kind: { type: 'string', description: 'Kind of the source item.', enum: [...RELATABLE_KINDS] },
        from_id: { type: 'string', description: 'Id of the source item.' },
        to_kind: { type: 'string', description: 'Kind of the target item.', enum: [...RELATABLE_KINDS] },
        to_id: { type: 'string', description: 'Id of the target item.' },
      },
      required: ['from_kind', 'from_id', 'to_kind', 'to_id'],
    },
    execute: async ({ from_kind, from_id, to_kind, to_id }) => {
      if (!RELATABLE_KINDS.includes(from_kind as RelatableKind)) return badKind();
      if (!RELATABLE_KINDS.includes(to_kind as RelatableKind)) return badKind();
      await hydrateKnowledgeGraph();
      const fk = from_kind as KnowledgeKind, tk = to_kind as KnowledgeKind;
      if (!relationshipGraph.hasEntity(fk, String(from_id))) return missing(String(from_kind), String(from_id));
      if (!relationshipGraph.hasEntity(tk, String(to_id))) return missing(String(to_kind), String(to_id));
      const path = relationshipGraph.findShortestPath(fk, String(from_id), tk, String(to_id));
      if (path.length === 0) return 'No path found — these items share no chain of tags.';
      return JSON.stringify(path.map(n => ({
        kind: n.entity.kind,
        id: n.entity.id,
        label: n.entity.label,
        via: n.relation?.type,
      })));
    },
  },
];
