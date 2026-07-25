import { describe, it, expect, beforeEach } from 'vitest';
import { relationshipGraph } from './relationshipGraph';
import type { KnowledgeKind } from './knowledgeService';

// ─── Helper ───────────────────────────────────────────────────────────────

function addEntity(kind: KnowledgeKind, id: string, label: string, tags: string[] = []) {
  return relationshipGraph.addEntity(kind, id, label, tags);
}

function addRel(type: string, sk: KnowledgeKind, si: string, tk: KnowledgeKind, ti: string, weight = 0.5) {
  return relationshipGraph.addRelation(type as any, sk, si, tk, ti, weight);
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('relationshipGraph', () => {
  beforeEach(() => {
    relationshipGraph.clear();
  });

  // ─── Entity CRUD ─────────────────────────────────────────────────────

  describe('entity CRUD', () => {
    it('adds an entity returns it', () => {
      const e = addEntity('memory', 'm1', 'Memory one', ['tag1']);
      expect(e.kind).toBe('memory');
      expect(e.id).toBe('m1');
      expect(e.label).toBe('Memory one');
      expect(e.tags).toEqual(['tag1']);
      expect(typeof e.addedAt).toBe('number');
    });

    it('hasEntity returns true after add', () => {
      addEntity('memory', 'm1', 'M1');
      expect(relationshipGraph.hasEntity('memory', 'm1')).toBe(true);
    });

    it('hasEntity returns false for missing entity', () => {
      expect(relationshipGraph.hasEntity('memory', 'nope')).toBe(false);
    });

    it('getEntity returns the entity', () => {
      addEntity('note', 'n1', 'Note one');
      const e = relationshipGraph.getEntity('note', 'n1');
      expect(e).toBeDefined();
      expect(e!.label).toBe('Note one');
    });

    it('getEntity returns undefined for missing', () => {
      expect(relationshipGraph.getEntity('note', 'nope')).toBeUndefined();
    });

    it('getEntities returns all entities', () => {
      addEntity('memory', 'a', 'A');
      addEntity('note', 'b', 'B');
      const all = relationshipGraph.getEntities();
      expect(all).toHaveLength(2);
    });

    it('getEntities filters by kind', () => {
      addEntity('memory', 'a', 'A');
      addEntity('note', 'b', 'B');
      const notes = relationshipGraph.getEntities('note');
      expect(notes).toHaveLength(1);
      expect(notes[0].id).toBe('b');
    });

    it('entityCount tracks adds and removes', () => {
      expect(relationshipGraph.entityCount).toBe(0);
      addEntity('memory', 'x', 'X');
      expect(relationshipGraph.entityCount).toBe(1);
      relationshipGraph.removeEntity('memory', 'x');
      expect(relationshipGraph.entityCount).toBe(0);
    });

    it('addEntity is idempotent — updates label/tags on re-add', () => {
      addEntity('memory', 'm1', 'Original', ['a']);
      relationshipGraph.addEntity('memory', 'm1', 'Updated', ['b', 'c'], { version: 2 });
      const e = relationshipGraph.getEntity('memory', 'm1');
      expect(e!.label).toBe('Updated');
      expect(e!.tags).toEqual(['b', 'c']);
      expect(e!.metadata).toEqual({ version: 2 });
      expect(relationshipGraph.entityCount).toBe(1);
    });

    it('removeEntity removes entity and all its relations', () => {
      addEntity('memory', 'a', 'A');
      addEntity('memory', 'b', 'B');
      addRel('references', 'memory', 'a', 'memory', 'b');
      expect(relationshipGraph.relationCount).toBe(1);

      const removed = relationshipGraph.removeEntity('memory', 'a');
      expect(removed).toBe(true);
      expect(relationshipGraph.hasEntity('memory', 'a')).toBe(false);
      // Relation involving 'a' should also be gone
      expect(relationshipGraph.relationCount).toBe(0);
    });

    it('removeEntity returns false for non-existent key', () => {
      expect(relationshipGraph.removeEntity('memory', 'nope')).toBe(false);
    });
  });

  // ─── Relation management ─────────────────────────────────────────────

  describe('relation management', () => {
    it('adds a relation between existing entities', () => {
      addEntity('memory', 'src', 'Source');
      addEntity('note', 'tgt', 'Target');
      const rel = addRel('references', 'memory', 'src', 'note', 'tgt');
      expect(rel).not.toBeNull();
      expect(rel!.type).toBe('references');
      expect(rel!.source).toBe('memory::src');
      expect(rel!.target).toBe('note::tgt');
      expect(rel!.weight).toBe(0.5);
      expect(relationshipGraph.relationCount).toBe(1);
    });

    it('returns null when source entity does not exist', () => {
      addEntity('note', 'tgt', 'Target');
      const rel = addRel('references', 'memory', 'no_src', 'note', 'tgt');
      expect(rel).toBeNull();
    });

    it('returns null when target entity does not exist', () => {
      addEntity('memory', 'src', 'Source');
      const rel = addRel('references', 'memory', 'src', 'note', 'no_tgt');
      expect(rel).toBeNull();
    });

    it('removeRelation removes and cleans adjacency', () => {
      addEntity('memory', 'a', 'A');
      addEntity('memory', 'b', 'B');
      const rel = addRel('references', 'memory', 'a', 'memory', 'b')!;
      expect(relationshipGraph.relationCount).toBe(1);

      relationshipGraph.removeRelation(rel.id);
      expect(relationshipGraph.relationCount).toBe(0);
      expect(relationshipGraph.getRelation(rel.id)).toBeUndefined();
    });

    it('removeRelation returns false for unknown id', () => {
      expect(relationshipGraph.removeRelation('fake_id')).toBe(false);
    });

    it('getRelations returns all or filtered by type', () => {
      addEntity('memory', 'a', 'A');
      addEntity('memory', 'b', 'B');
      addEntity('memory', 'c', 'C');
      addRel('references', 'memory', 'a', 'memory', 'b');
      addRel('similar_to', 'memory', 'a', 'memory', 'c');

      expect(relationshipGraph.getRelations()).toHaveLength(2);
      expect(relationshipGraph.getRelations('references')).toHaveLength(1);
      expect(relationshipGraph.getRelations('generated_from')).toHaveLength(0);
    });

    it('supports bidirectional relation types (similar_to, associated_with)', () => {
      addEntity('memory', 'a', 'A');
      addEntity('memory', 'b', 'B');
      addRel('similar_to', 'memory', 'a', 'memory', 'b');

      // B should appear as neighbor of A (outgoing)
      const fromA = relationshipGraph.getNeighbors('memory', 'a', { direction: 'outgoing' });
      expect(fromA).toHaveLength(1);
      expect(fromA[0].entity.id).toBe('b');

      // A should also appear as neighbor of B (incoming via bidirectional)
      const fromB = relationshipGraph.getNeighbors('memory', 'b', { direction: 'incoming' });
      expect(fromB).toHaveLength(1);
      expect(fromB[0].entity.id).toBe('a');
    });
  });

  // ─── getNeighbors ────────────────────────────────────────────────────

  describe('getNeighbors', () => {
    beforeEach(() => {
      addEntity('memory', 'a', 'A', ['tag_a']);
      addEntity('memory', 'b', 'B');
      addEntity('note', 'c', 'C');
      addEntity('vault_note', 'd', 'D');
      addRel('references', 'memory', 'a', 'memory', 'b');
      addRel('references', 'memory', 'a', 'note', 'c');
      addRel('similar_to', 'memory', 'a', 'vault_note', 'd');
    });

    it('returns outgoing neighbors', () => {
      const neighbors = relationshipGraph.getNeighbors('memory', 'a', { direction: 'outgoing' });
      expect(neighbors).toHaveLength(3);
      expect(neighbors.every((n) => n.direction === 'outgoing')).toBe(true);
    });

    it('returns incoming neighbors', () => {
      // b has no outgoing, but a references b, so b has incoming from a
      const neighbors = relationshipGraph.getNeighbors('memory', 'b', { direction: 'incoming' });
      expect(neighbors).toHaveLength(1);
      expect(neighbors[0].entity.id).toBe('a');
      expect(neighbors[0].direction).toBe('incoming');
    });

    it('returns both directions with dedup for bidirectional types', () => {
      // A has similar_to → D (bidirectional), and references → B, references → C (directed)
      // Both directions should include: B, C, D
      const neighbors = relationshipGraph.getNeighbors('memory', 'a', { direction: 'both' });
      expect(neighbors).toHaveLength(3); // B, C, D — no duplicates

      const ids = neighbors.map((n) => n.entity.id).sort();
      expect(ids).toEqual(['b', 'c', 'd']);

      // D should appear with outgoing direction since it was from A's adjacency
      const dResult = neighbors.find((n) => n.entity.id === 'd');
      expect(dResult!.direction).toBe('outgoing');
    });

    it('filters by relation type', () => {
      const references = relationshipGraph.getNeighbors('memory', 'a', { relationType: 'references' });
      expect(references).toHaveLength(2);
      expect(references.map((r) => r.entity.id).sort()).toEqual(['b', 'c']);
    });

    it('returns empty array for non-existent entity', () => {
      const neighbors = relationshipGraph.getNeighbors('memory', 'nope', { direction: 'outgoing' });
      expect(neighbors).toEqual([]);
    });
  });

  // ─── getRelationsBetween ─────────────────────────────────────────────

  describe('getRelationsBetween', () => {
    it('returns relations between two entities', () => {
      addEntity('note', 'a', 'A');
      addEntity('note', 'b', 'B');
      addRel('references', 'note', 'a', 'note', 'b');
      addRel('similar_to', 'note', 'a', 'note', 'b');

      const rels = relationshipGraph.getRelationsBetween('note', 'a', 'note', 'b');
      expect(rels).toHaveLength(2);
    });

    it('returns empty when no relation exists', () => {
      addEntity('note', 'a', 'A');
      addEntity('note', 'b', 'B');
      expect(relationshipGraph.getRelationsBetween('note', 'a', 'note', 'b')).toEqual([]);
    });

    it('includes reverse direction for bidirectional types', () => {
      addEntity('note', 'a', 'A');
      addEntity('note', 'b', 'B');
      addRel('similar_to', 'note', 'b', 'note', 'a'); // added as b→a

      const relsForward = relationshipGraph.getRelationsBetween('note', 'b', 'note', 'a');
      expect(relsForward).toHaveLength(1);

      // Bidirectional means a→b query should also find b→a relation
      const relsReverse = relationshipGraph.getRelationsBetween('note', 'a', 'note', 'b');
      expect(relsReverse).toHaveLength(1);
    });
  });

  // ─── findRelatedByTags ───────────────────────────────────────────────

  describe('findRelatedByTags', () => {
    it('finds entities sharing common tags, scored by overlap ratio', () => {
      addEntity('memory', 'a', 'A', ['cyberpunk', 'neon', 'dark']);
      addEntity('memory', 'b', 'B', ['cyberpunk', 'bladerunner']);
      addEntity('memory', 'c', 'C', ['neon', 'vaporwave']);
      addEntity('memory', 'd', 'D', ['nature']);

      const related = relationshipGraph.findRelatedByTags('memory', 'a');
      expect(related).toHaveLength(2); // b and c share tags, d does not
      // b shares 1/4 = 0.25, c shares 1/4 = 0.25 — both tie
      expect(related.every((r) => r.sharedTags.length === 1)).toBe(true);
    });

    it('returns empty when entity has no tags', () => {
      addEntity('memory', 'a', 'A', []);
      addEntity('memory', 'b', 'B', ['tag1']);
      expect(relationshipGraph.findRelatedByTags('memory', 'a')).toEqual([]);
    });

    it('returns empty when entity does not exist', () => {
      expect(relationshipGraph.findRelatedByTags('memory', 'nope')).toEqual([]);
    });

    it('returns empty when no other entity shares tags', () => {
      addEntity('memory', 'a', 'A', ['unique_tag']);
      addEntity('memory', 'b', 'B', ['other_tag']);
      expect(relationshipGraph.findRelatedByTags('memory', 'a')).toEqual([]);
    });

    it('respects maxResults', () => {
      for (let i = 0; i < 10; i++) {
        addEntity('memory', `m${i}`, `M${i}`, ['shared_tag']);
      }
      addEntity('memory', 'self', 'Self', ['shared_tag']);
      const related = relationshipGraph.findRelatedByTags('memory', 'self', 3);
      expect(related).toHaveLength(3);
    });
  });

  // ─── traverse ────────────────────────────────────────────────────────

  describe('traverse (BFS)', () => {
    beforeEach(() => {
      // A → B → C → D (chain)
      // A → E (direct)
      addEntity('memory', 'a', 'A');
      addEntity('memory', 'b', 'B');
      addEntity('memory', 'c', 'C');
      addEntity('memory', 'd', 'D');
      addEntity('note', 'e', 'E');
      addRel('references', 'memory', 'a', 'memory', 'b');
      addRel('references', 'memory', 'b', 'memory', 'c');
      addRel('references', 'memory', 'c', 'memory', 'd');
      addRel('similar_to', 'memory', 'a', 'note', 'e');
    });

    it('returns all reachable entities up to default maxDepth=3', () => {
      const result = relationshipGraph.traverse('memory', 'a');
      // A→B (depth1), A→E (depth1), B→C (depth2), C→D (depth3) = 5 total
      expect(result).toHaveLength(5);
      const labels = result.map((n) => n.entity.label).sort();
      expect(labels).toEqual(['A', 'B', 'C', 'D', 'E']);
    });

    it('limits depth to 1', () => {
      const result = relationshipGraph.traverse('memory', 'a', 1);
      expect(result).toHaveLength(3); // A, B, E
      const labels = result.map((n) => n.entity.label).sort();
      expect(labels).toEqual(['A', 'B', 'E']);
    });

    it('filters by relation type', () => {
      const result = relationshipGraph.traverse('memory', 'a', 3, 'similar_to');
      expect(result).toHaveLength(2); // A and E (only similar_to matches)
      const labels = result.map((n) => n.entity.label).sort();
      expect(labels).toEqual(['A', 'E']);
    });

    it('returns path node with relation for non-start nodes', () => {
      const result = relationshipGraph.traverse('memory', 'a', 1);
      const bNode = result.find((n) => n.entity.id === 'b');
      expect(bNode!.relation).toBeDefined();
      expect(bNode!.relation!.type).toBe('references');

      const aNode = result.find((n) => n.entity.id === 'a');
      expect(aNode!.relation).toBeUndefined(); // start node
    });

    it('returns empty for non-existent entity', () => {
      expect(relationshipGraph.traverse('memory', 'nope')).toEqual([]);
    });

    it('returns only start node when entity has no relations', () => {
      addEntity('memory', 'lonely', 'Lonely');
      const result = relationshipGraph.traverse('memory', 'lonely');
      expect(result).toHaveLength(1);
      expect(result[0].entity.id).toBe('lonely');
    });
  });

  // ─── findShortestPath ────────────────────────────────────────────────

  describe('findShortestPath', () => {
    beforeEach(() => {
      // Create two clusters:
      // Cluster 1: A → B → C
      // Cluster 2: X → Y → Z (disconnected from cluster 1)
      addEntity('memory', 'a', 'A');
      addEntity('memory', 'b', 'B');
      addEntity('memory', 'c', 'C');
      addEntity('memory', 'x', 'X');
      addEntity('memory', 'y', 'Y');
      addEntity('memory', 'z', 'Z');
      addRel('references', 'memory', 'a', 'memory', 'b');
      addRel('references', 'memory', 'b', 'memory', 'c');
      addRel('references', 'memory', 'x', 'memory', 'y');
      addRel('references', 'memory', 'y', 'memory', 'z');
    });

    it('finds direct path (1 hop)', () => {
      const path = relationshipGraph.findShortestPath('memory', 'a', 'memory', 'b');
      expect(path).toHaveLength(2);
      expect(path[0].entity.id).toBe('a');
      expect(path[1].entity.id).toBe('b');
      expect(path[1].relation).toBeDefined();
    });

    it('finds multi-hop path (A → B → C)', () => {
      const path = relationshipGraph.findShortestPath('memory', 'a', 'memory', 'c');
      expect(path).toHaveLength(3);
      expect(path.map((n) => n.entity.id)).toEqual(['a', 'b', 'c']);
    });

    it('returns empty when no path exists between clusters', () => {
      const path = relationshipGraph.findShortestPath('memory', 'a', 'memory', 'x');
      expect(path).toEqual([]);
    });

    it('returns single-node path when source equals target', () => {
      const path = relationshipGraph.findShortestPath('memory', 'a', 'memory', 'a');
      expect(path).toHaveLength(1);
      expect(path[0].entity.id).toBe('a');
    });

    it('returns empty when source does not exist', () => {
      const path = relationshipGraph.findShortestPath('memory', 'nope', 'memory', 'a');
      expect(path).toEqual([]);
    });

    it('returns empty when target does not exist', () => {
      const path = relationshipGraph.findShortestPath('memory', 'a', 'memory', 'nope');
      expect(path).toEqual([]);
    });
  });

  // ─── getSubgraph ─────────────────────────────────────────────────────

  describe('getSubgraph', () => {
    it('extracts entities and relations within the set', () => {
      addEntity('memory', 'a', 'A');
      addEntity('memory', 'b', 'B');
      addEntity('memory', 'c', 'C');
      addRel('references', 'memory', 'a', 'memory', 'b');
      addRel('references', 'memory', 'b', 'memory', 'c');

      const sub = relationshipGraph.getSubgraph(['memory::a', 'memory::b']);
      expect(sub.entities).toHaveLength(2);
      expect(sub.relations).toHaveLength(1); // only a→b is within the set
      expect(sub.relations[0].source).toBe('memory::a');
      expect(sub.relations[0].target).toBe('memory::b');
    });

    it('excludes relations where target is outside the set', () => {
      addEntity('memory', 'a', 'A');
      addEntity('memory', 'b', 'B');
      addRel('references', 'memory', 'a', 'memory', 'b');

      // Only include 'a', so the relation to 'b' should be excluded
      const sub = relationshipGraph.getSubgraph(['memory::a']);
      expect(sub.entities).toHaveLength(1);
      expect(sub.relations).toHaveLength(0);
    });

    it('returns empty arrays for an empty key list', () => {
      const sub = relationshipGraph.getSubgraph([]);
      expect(sub.entities).toEqual([]);
      expect(sub.relations).toEqual([]);
    });

    it('skips keys that have no entity in the graph', () => {
      addEntity('memory', 'a', 'A');
      const sub = relationshipGraph.getSubgraph(['memory::a', 'memory::nonexistent']);
      expect(sub.entities).toHaveLength(1);
      expect(sub.entities[0].id).toBe('a');
    });

    it('deduplicates relations', () => {
      addEntity('memory', 'a', 'A');
      addEntity('memory', 'b', 'B');
      addRel('references', 'memory', 'a', 'memory', 'b');
      // Request the same set twice — relations should not be duplicated
      const sub = relationshipGraph.getSubgraph(['memory::a', 'memory::b', 'memory::a']);
      expect(sub.relations).toHaveLength(1);
    });
  });

  // ─── Serialization ───────────────────────────────────────────────────

  describe('serialization (export/import/clear)', () => {
    it('exportGraph returns all entities and relations', () => {
      addEntity('memory', 'a', 'A', ['t1']);
      addEntity('note', 'b', 'B');
      addRel('references', 'memory', 'a', 'note', 'b');

      const exported = relationshipGraph.exportGraph();
      expect(exported.entities).toHaveLength(2);
      expect(exported.relations).toHaveLength(1);
      expect(typeof exported.exportedAt).toBe('number');
    });

    it('importGraph restores a previously exported graph', () => {
      addEntity('memory', 'a', 'A');
      addEntity('note', 'b', 'B');
      addRel('references', 'memory', 'a', 'note', 'b');
      const exported = relationshipGraph.exportGraph();

      relationshipGraph.clear();
      expect(relationshipGraph.entityCount).toBe(0);

      relationshipGraph.importGraph(exported);
      expect(relationshipGraph.entityCount).toBe(2);
      expect(relationshipGraph.relationCount).toBe(1);
      expect(relationshipGraph.hasEntity('note', 'b')).toBe(true);
    });

    it('importGraph replaces the entire graph', () => {
      addEntity('memory', 'old', 'Old');
      const freshData = {
        entities: [{ kind: 'note' as KnowledgeKind, id: 'new', label: 'New', tags: [], addedAt: 1 }],
        relations: [],
      };
      relationshipGraph.importGraph(freshData as any);
      expect(relationshipGraph.entityCount).toBe(1);
      expect(relationshipGraph.hasEntity('note', 'new')).toBe(true);
      expect(relationshipGraph.hasEntity('memory', 'old')).toBe(false);
    });

    it('clear removes everything', () => {
      addEntity('memory', 'a', 'A');
      addEntity('note', 'b', 'B');
      addRel('references', 'memory', 'a', 'note', 'b');
      expect(relationshipGraph.entityCount).toBe(2);
      expect(relationshipGraph.relationCount).toBe(1);

      relationshipGraph.clear();
      expect(relationshipGraph.entityCount).toBe(0);
      expect(relationshipGraph.relationCount).toBe(0);
      expect(relationshipGraph.getEntities()).toEqual([]);
      expect(relationshipGraph.getRelations()).toEqual([]);
    });
  });
});
