/**
 * Relationship Graph — Phase 3 of ISSUE-29 (Knowledge & Obsidian Architecture).
 *
 * A lightweight in-memory graph connecting knowledge entities (prompts, gallery
 * items, styles, notes, memories) through typed relationships.
 *
 * Features:
 *   - addEntity / removeEntity — manage graph nodes
 *   - addRelation / removeRelation — manage typed edges between nodes
 *   - getNeighbors — find directly connected entities (optionally filtered by relation type)
 *   - traverse — BFS/DFS path finding between entities
 *   - getSubgraph — extract a connected subgraph around an entity
 *   - findPaths — shortest paths between two entities
 *
 * The graph is decoupled from the storage layer — entities are referenced by
 * kind+id pairs (matching KnowledgeRef from knowledgeService) so any entity
 * that exists in the knowledge index can participate in relationships.
 */

import type { KnowledgeKind } from './knowledgeService';

// ─── Types ────────────────────────────────────────────────────────────────

/** Types of relationships between entities. */
export type RelationType =
  | 'generated_from'   // gallery_item ← prompt (image was generated from this prompt)
  | 'similar_to'       // any ↔ any (semantically similar content)
  | 'references'       // note/memory → any (references another entity)
  | 'tagged_with'      // any → tag (entity has this tag)
  | 'derived_from'     // prompt → prompt (lineage: version B derived from version A)
  | 'used_in'          // style/artist → prompt (style was used in generating this prompt)
  | 'associated_with'  // any ↔ any (custom association, no direction implied)
  | 'parent_of'        // vault_note → vault_note (folder hierarchy or outline nesting)
  | 'prompted'         // memory → prompt (a user preference influenced a prompt)
  | 'captured_in'      // any → vault_note (entity is documented/stored in this note);

/** A node in the relationship graph. */
export interface GraphEntity {
  kind: KnowledgeKind;
  id: string;
  /** Human-readable label for display. */
  label: string;
  /** Tags for this entity (duplicated from KnowledgeRef for quick graph-internal queries). */
  tags: string[];
  /** When this entity was added to the graph. */
  addedAt: number;
  /** Arbitrary metadata attached to this entity. */
  metadata?: Record<string, any>;
}

/** A directed edge between two entities. */
export interface Relation {
  id: string;
  type: RelationType;
  source: string; // `${kind}::${id}`
  target: string; // `${kind}::${id}`
  /** Optional weight for ranking (0-1). Higher = stronger relation. */
  weight: number;
  /** When this relation was created. */
  createdAt: number;
  /** Arbitrary metadata about the relationship. */
  metadata?: Record<string, any>;
}

/** A path node in traversal results. */
export interface PathNode {
  entity: GraphEntity;
  relation?: Relation; // the relation that led TO this node (undefined for start)
}

// ─── Constants ────────────────────────────────────────────────────────────

/** Relation types that are bidirectional (reverse adjacency is also written). */
const BIDIRECTIONAL_TYPES: RelationType[] = ['similar_to', 'associated_with'];

// ─── Graph internals ──────────────────────────────────────────────────────

function entityKey(kind: KnowledgeKind, id: string): string {
  return `${kind}::${id}`;
}

const _entities = new Map<string, GraphEntity>();
const _relations = new Map<string, Relation>();
const _adjacency = new Map<string, Map<string, Relation[]>>(); // source → { target → Relation[] }

let _nextRelationId = 0;

// ─── Graph API ────────────────────────────────────────────────────────────

export const relationshipGraph = {
  // ─── Entity management ───────────────────────────────────────────────

  /**
   * Add an entity to the graph. Idempotent — re-adding the same kind+id
   * updates the existing entity's label and tags.
   */
  addEntity(kind: KnowledgeKind, id: string, label: string, tags: string[] = [], metadata?: Record<string, any>): GraphEntity {
    const key = entityKey(kind, id);
    const existing = _entities.get(key);
    if (existing) {
      existing.label = label;
      existing.tags = tags;
      if (metadata) existing.metadata = { ...existing.metadata, ...metadata };
      return existing;
    }
    const entity: GraphEntity = { kind, id, label, tags, addedAt: Date.now(), metadata };
    _entities.set(key, entity);
    _adjacency.set(key, new Map());
    return entity;
  },

  /**
   * Remove an entity and all its relations from the graph.
   * Returns true if the entity existed.
   */
  removeEntity(kind: KnowledgeKind, id: string): boolean {
    const key = entityKey(kind, id);
    if (!_entities.has(key)) return false;

    // Remove all relations involving this entity
    const relationsToRemove: string[] = [];
    for (const [relId, rel] of _relations) {
      if (rel.source === key || rel.target === key) {
        relationsToRemove.push(relId);
      }
    }
    for (const relId of relationsToRemove) {
      _relations.delete(relId);
    }

    // Clean adjacency entries for this key
    _adjacency.delete(key);
    for (const [, neighbors] of _adjacency) {
      neighbors.delete(key);
    }

    _entities.delete(key);
    return true;
  },

  /**
   * Check if an entity exists in the graph.
   */
  hasEntity(kind: KnowledgeKind, id: string): boolean {
    return _entities.has(entityKey(kind, id));
  },

  /**
   * Get an entity by kind+id.
   */
  getEntity(kind: KnowledgeKind, id: string): GraphEntity | undefined {
    return _entities.get(entityKey(kind, id));
  },

  /**
   * Get all entities, optionally filtered by kind.
   */
  getEntities(kind?: KnowledgeKind): GraphEntity[] {
    const all = Array.from(_entities.values());
    return kind ? all.filter((e) => e.kind === kind) : all;
  },

  /**
   * Count of entities in the graph.
   */
  get entityCount(): number {
    return _entities.size;
  },

  // ─── Relation management ─────────────────────────────────────────────

  /**
   * Add a relationship between two entities.
   * Both entities must already exist in the graph.
   * Returns the Relation, or null if either entity doesn't exist.
   */
  addRelation(type: RelationType, sourceKind: KnowledgeKind, sourceId: string, targetKind: KnowledgeKind, targetId: string, weight = 0.5, metadata?: Record<string, any>): Relation | null {
    const sourceKey = entityKey(sourceKind, sourceId);
    const targetKey = entityKey(targetKind, targetId);

    if (!_entities.has(sourceKey) || !_entities.has(targetKey)) return null;

    const id = `rel_${++_nextRelationId}`;
    const relation: Relation = { id, type, source: sourceKey, target: targetKey, weight, createdAt: Date.now(), metadata };
    _relations.set(id, relation);

    // Update adjacency
    const sourceAdj = _adjacency.get(sourceKey)!;
    const existing = sourceAdj.get(targetKey) || [];
    existing.push(relation);
    sourceAdj.set(targetKey, existing);

    // For bidirectional types, add reverse adjacency too
    if (BIDIRECTIONAL_TYPES.includes(type)) {
      const targetAdj = _adjacency.get(targetKey)!;
      const revExisting = targetAdj.get(sourceKey) || [];
      revExisting.push(relation);
      targetAdj.set(sourceKey, revExisting);
    }

    return relation;
  },

  /**
   * Remove a relation by id. Returns true if it existed.
   */
  removeRelation(id: string): boolean {
    const rel = _relations.get(id);
    if (!rel) return false;

    // Clean adjacency: source → target
    const sourceAdj = _adjacency.get(rel.source);
    if (sourceAdj) {
      const edges = sourceAdj.get(rel.target);
      if (edges) {
        const filtered = edges.filter((e) => e.id !== id);
        if (filtered.length === 0) sourceAdj.delete(rel.target);
        else sourceAdj.set(rel.target, filtered);
      }
    }

    // Clean adjacency: target → source (for bidirectional types)
    if (BIDIRECTIONAL_TYPES.includes(rel.type)) {
      const targetAdj = _adjacency.get(rel.target);
      if (targetAdj) {
        const edges = targetAdj.get(rel.source);
        if (edges) {
          const filtered = edges.filter((e) => e.id !== id);
          if (filtered.length === 0) targetAdj.delete(rel.source);
          else targetAdj.set(rel.source, filtered);
        }
      }
    }

    _relations.delete(id);
    return true;
  },

  /**
   * Get a relation by id.
   */
  getRelation(id: string): Relation | undefined {
    return _relations.get(id);
  },

  /**
   * Get all relations, optionally filtered by type.
   */
  getRelations(type?: RelationType): Relation[] {
    const all = Array.from(_relations.values());
    return type ? all.filter((r) => r.type === type) : all;
  },

  /**
   * Count of relations in the graph.
   */
  get relationCount(): number {
    return _relations.size;
  },

  // ─── Query ───────────────────────────────────────────────────────────

  /**
   * Get all directly connected neighbors of an entity.
   * Optionally filtered by relation type and direction.
   */
  getNeighbors(kind: KnowledgeKind, id: string, options?: { relationType?: RelationType; direction?: 'outgoing' | 'incoming' | 'both' }): Array<{ entity: GraphEntity; relation: Relation; direction: 'outgoing' | 'incoming' }> {
    const key = entityKey(kind, id);
    if (!_entities.has(key)) return [];

    const { relationType, direction = 'outgoing' } = options || {};
    const results: Array<{ entity: GraphEntity; relation: Relation; direction: 'outgoing' | 'incoming' }> = [];

    if (direction === 'outgoing' || direction === 'both') {
      const outEdges = _adjacency.get(key);
      if (outEdges) {
        for (const [targetKey, edges] of outEdges) {
          for (const edge of edges) {
            if (relationType && edge.type !== relationType) continue;
            const targetEntity = _entities.get(targetKey);
            if (targetEntity) {
              results.push({ entity: targetEntity, relation: edge, direction: 'outgoing' });
            }
          }
        }
      }
    }

    if (direction === 'incoming' || direction === 'both') {
      // Track seen entities to avoid duplicates when bidirectional relations
      // are already returned in the outgoing pass
      const seenInOutgoing = direction === 'both' ? new Set(results.map((r) => `${r.entity.kind}::${r.entity.id}`)) : new Set();

      for (const [sourceKey, neighbors] of _adjacency) {
        if (sourceKey === key) continue; // already handled in outgoing
        const edges = neighbors.get(key);
        if (edges) {
          for (const edge of edges) {
            if (relationType && edge.type !== relationType) continue;
            // Skip if this entity was already returned by the outgoing pass
            if (seenInOutgoing.has(sourceKey)) continue;
            const sourceEntity = _entities.get(sourceKey);
            if (sourceEntity) {
              results.push({ entity: sourceEntity, relation: edge, direction: 'incoming' });
            }
          }
        }
      }
    }

    return results;
  },

  /**
   * Get all relation types that exist between two specific entities.
   */
  getRelationsBetween(sourceKind: KnowledgeKind, sourceId: string, targetKind: KnowledgeKind, targetId: string): Relation[] {
    const sourceKey = entityKey(sourceKind, sourceId);
    const targetKey = entityKey(targetKind, targetId);
    const results: Relation[] = [];

    for (const rel of _relations.values()) {
      if (rel.source === sourceKey && rel.target === targetKey) results.push(rel);
      // Also check bidirectional reverse
      if (BIDIRECTIONAL_TYPES.includes(rel.type) && rel.source === targetKey && rel.target === sourceKey) {
        results.push(rel);
      }
    }

    return results;
  },

  /**
   * Find entities that share common tags with the given entity.
   */
  findRelatedByTags(kind: KnowledgeKind, id: string, maxResults = 10): Array<{ entity: GraphEntity; sharedTags: string[]; score: number }> {
    const key = entityKey(kind, id);
    const entity = _entities.get(key);
    if (!entity || entity.tags.length === 0) return [];

    const scored: Array<{ entity: GraphEntity; sharedTags: string[]; score: number }> = [];

    for (const [, other] of _entities) {
      if (other.kind === kind && other.id === id) continue; // skip self
      const shared = entity.tags.filter((t) => other.tags.includes(t));
      if (shared.length === 0) continue;

      const score = shared.length / Math.max(entity.tags.length, other.tags.length);
      scored.push({ entity: other, sharedTags: shared, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults);
  },

  // ─── Traversal ───────────────────────────────────────────────────────

  /**
   * BFS traversal from a starting entity, returning all reachable entities
   * up to `maxDepth` hops away.  Optionally filtered by relation type.
   */
  traverse(kind: KnowledgeKind, id: string, maxDepth = 3, relationType?: RelationType): PathNode[] {
    const startKey = entityKey(kind, id);
    if (!_entities.has(startKey)) return [];

    const visited = new Set<string>();
    const result: PathNode[] = [];
    const queue: Array<{ key: string; path: PathNode[] }> = [];

    visited.add(startKey);
    result.push({ entity: _entities.get(startKey)! });
    queue.push({ key: startKey, path: result.slice() });

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentDepth = current.path.length;

      if (currentDepth > maxDepth) continue;

      const neighbors = _adjacency.get(current.key);
      if (!neighbors) continue;

      for (const [neighborKey, edges] of neighbors) {
        if (visited.has(neighborKey)) continue;

        // Check if any edge matches the relationType filter
        const matchingEdges = relationType ? edges.filter((e) => e.type === relationType) : edges;
        if (matchingEdges.length === 0) continue;

        visited.add(neighborKey);
        const neighborEntity = _entities.get(neighborKey);
        if (!neighborEntity) continue;

        const pathNode: PathNode = { entity: neighborEntity, relation: matchingEdges[0] };
        result.push(pathNode);

        if (currentDepth < maxDepth) {
          queue.push({ key: neighborKey, path: [...current.path, pathNode] });
        }
      }
    }

    return result;
  },

  /**
   * Find the shortest path between two entities using BFS.
   * Returns an array of PathNodes from source to target, or empty if no path exists.
   */
  findShortestPath(sourceKind: KnowledgeKind, sourceId: string, targetKind: KnowledgeKind, targetId: string): PathNode[] {
    const sourceKey = entityKey(sourceKind, sourceId);
    const targetKey = entityKey(targetKind, targetId);

    if (!_entities.has(sourceKey) || !_entities.has(targetKey)) return [];
    if (sourceKey === targetKey) return [{ entity: _entities.get(sourceKey)! }];

    // BFS tracking paths
    const visited = new Set<string>([sourceKey]);
    const queue: Array<{ key: string; path: PathNode[] }> = [{
      key: sourceKey,
      path: [{ entity: _entities.get(sourceKey)! }],
    }];

    while (queue.length > 0) {
      const current = queue.shift()!;

      const neighbors = _adjacency.get(current.key);
      if (!neighbors) continue;

      for (const [neighborKey, edges] of neighbors) {
        if (visited.has(neighborKey)) continue;
        visited.add(neighborKey);

        const neighborEntity = _entities.get(neighborKey);
        if (!neighborEntity) continue;

        const newPath = [...current.path, { entity: neighborEntity, relation: edges[0] }];

        if (neighborKey === targetKey) {
          return newPath;
        }

        queue.push({ key: neighborKey, path: newPath });
      }
    }

    return []; // no path found
  },

  /**
   * Extract a connected subgraph around a set of entities.
   * Returns { entities, relations } for serialization / visualization.
   */
  getSubgraph(entityKeys: string[]): { entities: GraphEntity[]; relations: Relation[] } {
    const entitySet = new Set(entityKeys);
    const entities: GraphEntity[] = [];
    const relations: Relation[] = [];
    const seenRelations = new Set<string>();

    for (const key of entityKeys) {
      const ent = _entities.get(key);
      if (ent) entities.push(ent);
    }

    for (const rel of _relations.values()) {
      if (entitySet.has(rel.source) && entitySet.has(rel.target) && !seenRelations.has(rel.id)) {
        relations.push(rel);
        seenRelations.add(rel.id);
      }
    }

    return { entities, relations };
  },

  // ─── Serialization ───────────────────────────────────────────────────

  /**
   * Export the entire graph for serialization / persistence.
   */
  exportGraph(): { entities: GraphEntity[]; relations: Relation[]; exportedAt: number } {
    return {
      entities: Array.from(_entities.values()),
      relations: Array.from(_relations.values()),
      exportedAt: Date.now(),
    };
  },

  /**
   * Import a previously exported graph.  Replaces the current in-memory graph.
   */
  importGraph(data: { entities: GraphEntity[]; relations: Relation[] }): void {
    _entities.clear();
    _relations.clear();
    _adjacency.clear();

    for (const entity of data.entities) {
      const key = entityKey(entity.kind, entity.id);
      _entities.set(key, entity);
      _adjacency.set(key, new Map());
    }

    for (const rel of data.relations) {
      _relations.set(rel.id, rel);
      const sourceAdj = _adjacency.get(rel.source);
      if (sourceAdj) {
        const existing = sourceAdj.get(rel.target) || [];
        existing.push(rel);
        sourceAdj.set(rel.target, existing);
      }
    }
  },

  /**
   * Clear the entire graph.
   */
  clear(): void {
    _entities.clear();
    _relations.clear();
    _adjacency.clear();
  },
};
