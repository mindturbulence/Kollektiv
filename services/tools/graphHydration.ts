/**
 * Knowledge-graph hydration.
 *
 * Extracted from graphTools.ts and extended: the original only added
 * entities, which left traverse/findShortestPath/getSubgraph walking an
 * empty edge set and returning nothing useful. This builds tag-derived
 * edges so those methods have something to walk.
 *
 * ponytail: rehydrated from persistent stores on every call rather than
 * kept live via addEntity at every save site. Edge building is O(n²) over
 * tagged entities — see MAX_TAGGED_ENTITIES for the bound and the plan
 * document for the measurement that justifies it.
 */

import { relationshipGraph } from '../relationshipGraph';
import type { KnowledgeKind } from '../knowledgeService';
import { loadMemories } from '../../utils/memoryStorage';
import { loadGalleryItems } from '../../utils/galleryStorage';
import { loadSavedPrompts } from '../../utils/promptStorage';
import { indexWikilinksIntoGraph } from '../../utils/obsidianStorage';

/** Above this many tagged entities, edge building is skipped rather than
 *  freezing the UI. The map degrades to entities-only, which is still
 *  more useful than a blocked main thread. */
const MAX_TAGGED_ENTITIES = 2000;

interface Tagged { kind: KnowledgeKind; id: string; tags: string[] }

/** Jaccard index — shared tags over total distinct tags. Rewards a tight
 *  overlap over an incidental one on a heavily-tagged item. */
function jaccard(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  if (shared === 0) return 0;
  return shared / (a.size + b.size - shared);
}

export async function hydrateKnowledgeGraph(): Promise<{ entities: number; relations: number; ms: number }> {
  const started = performance.now();
  relationshipGraph.clear();

  const [memories, galleryItems, prompts] = await Promise.all([
    loadMemories(),
    loadGalleryItems(),
    loadSavedPrompts(),
  ]);

  const tagged: Tagged[] = [];
  const add = (kind: KnowledgeKind, id: string, label: string, tags: string[]) => {
    relationshipGraph.addEntity(kind, id, label, tags);
    if (tags.length > 0) tagged.push({ kind, id, tags });
  };

  for (const m of memories) add('memory', m.id, m.fact.slice(0, 80), m.tags || []);
  for (const g of galleryItems) add('gallery_item', g.id, g.title, g.tags || []);
  for (const p of prompts) add('prompt', p.id, p.title || p.text.slice(0, 80), p.tags || []);

  const entities = memories.length + galleryItems.length + prompts.length;
  let relations = 0;

  if (tagged.length <= MAX_TAGGED_ENTITIES) {
    const sets = tagged.map(t => new Set(t.tags.map(s => s.toLowerCase())));
    for (let i = 0; i < tagged.length; i++) {
      for (let j = i + 1; j < tagged.length; j++) {
        const weight = jaccard(sets[i], sets[j]);
        if (weight === 0) continue;
        // similar_to is bidirectional, so one call writes both directions.
        const rel = relationshipGraph.addRelation(
          'similar_to',
          tagged[i].kind, tagged[i].id,
          tagged[j].kind, tagged[j].id,
          weight,
        );
        if (rel) relations++;
      }
    }
  } else {
    console.warn(`[graphHydration] ${tagged.length} tagged entities exceeds ${MAX_TAGGED_ENTITIES}; skipping edge build.`);
  }

  // Restore hand-authored wikilink edges (WP1). relationshipGraph.clear() above
  // wipes them along with everything else, so they must be rebuilt every
  // hydration, not just once at boot — otherwise the first VaultMapPanel open
  // (or any graph-tool call) silently drops them.
  try {
    relations += await indexWikilinksIntoGraph();
  } catch (e) {
    console.warn('[graphHydration] wikilink indexing failed:', e);
  }

  return { entities, relations, ms: performance.now() - started };
}
