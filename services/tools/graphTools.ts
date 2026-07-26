import type { AssistantTool } from './types';
import type { KnowledgeKind } from '../knowledgeService';
import { relationshipGraph } from '../relationshipGraph';
import { loadMemories } from '../../utils/memoryStorage';
import { loadGalleryItems } from '../../utils/galleryStorage';
import { loadSavedPrompts } from '../../utils/promptStorage';

const RELATABLE_KINDS = ['memory', 'gallery_item', 'prompt'] as const;
type RelatableKind = (typeof RELATABLE_KINDS)[number];

// ponytail: rehydrated from persistent stores on every call instead of kept
// live in sync via addEntity at every save site — a few hundred items is
// cheap to re-scan, and it avoids inventing write-path plumbing nothing
// else in the app needs. Upgrade to incremental sync if this gets slow.
async function hydrateTaggedEntities(): Promise<void> {
  relationshipGraph.clear();
  const [memories, galleryItems, prompts] = await Promise.all([
    loadMemories(),
    loadGalleryItems(),
    loadSavedPrompts(),
  ]);
  for (const m of memories) relationshipGraph.addEntity('memory', m.id, m.fact.slice(0, 80), m.tags);
  for (const g of galleryItems) relationshipGraph.addEntity('gallery_item', g.id, g.title, g.tags || []);
  for (const p of prompts) relationshipGraph.addEntity('prompt', p.id, p.title || p.text.slice(0, 80), p.tags || []);
}

export const graphTools: AssistantTool[] = [
  {
    name: 'find_related_knowledge',
    description:
      "Find memories, gallery items, and saved prompts that share tags with a given item — crosses store boundaries (search_memories/search_gallery/search_prompts each only search within their own store). Get the kind and id first from one of those tools.",
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', description: 'Kind of the source item.', enum: [...RELATABLE_KINDS] },
        id: { type: 'string', description: 'Id of the source item.' },
        max_results: { type: 'number', description: 'Max related items to return (default 10).' },
      },
      required: ['kind', 'id'],
    },
    execute: async ({ kind, id, max_results }) => {
      if (!RELATABLE_KINDS.includes(kind as RelatableKind)) {
        return `Error: kind must be one of ${RELATABLE_KINDS.join(', ')}.`;
      }
      await hydrateTaggedEntities();
      const k = kind as KnowledgeKind;
      if (!relationshipGraph.hasEntity(k, String(id))) {
        return `Error: no ${kind} item with id "${id}". Use search_memories / search_gallery / search_prompts to find current items.`;
      }
      const related = relationshipGraph.findRelatedByTags(k, String(id), Number(max_results) || 10);
      if (related.length === 0) return 'No related items found (no shared tags).';
      return JSON.stringify(
        related.map((r) => ({
          kind: r.entity.kind,
          id: r.entity.id,
          label: r.entity.label,
          sharedTags: r.sharedTags,
          score: r.score,
        }))
      );
    },
  },
];
