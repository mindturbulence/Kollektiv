import { describe, it, expect } from 'vitest';
import {
  buildTree,
  flattenTree,
  descendantIds,
  isDescendant,
  siblingNameTaken,
  countAffected,
  parentOfCollection,
  nextOrder,
  inCollection,
  recipeCounts,
} from './designCollections';
import type { DesignCollection, DesignRecipe } from '../types';

const col = (id: string, over: Partial<DesignCollection> = {}): DesignCollection => ({ id, name: id.toUpperCase(), order: 0, ...over });
const rec = (id: string, collectionId?: string): DesignRecipe => ({
  id, createdAt: 1, updatedAt: 1, title: id, pageType: 'app', tags: [], refs: [], overview: '', ...(collectionId ? { collectionId } : {}),
});

// a (root) > b > c ; d (root)
const tree = [col('a', { order: 0 }), col('b', { parentId: 'a' }), col('c', { parentId: 'b' }), col('d', { order: 1 })];

describe('buildTree / flattenTree', () => {
  it('nests by parent and sorts siblings by order then name', () => {
    const nodes = buildTree([col('z', { order: 1 }), col('y', { order: 0 }), col('x', { parentId: 'y', order: 5 }), col('w', { parentId: 'y', order: 2 })]);
    expect(nodes.map((n) => n.collection.id)).toEqual(['y', 'z']);
    expect(nodes[0].children.map((n) => n.collection.id)).toEqual(['w', 'x']);
    expect(flattenTree(nodes).map((n) => `${n.depth}:${n.collection.id}`)).toEqual(['0:y', '1:w', '1:x', '0:z']);
  });

  it('returns nothing for an empty library', () => {
    expect(buildTree([])).toEqual([]);
  });

  it('treats a parent that does not exist, or itself, as root', () => {
    const nodes = buildTree([col('a', { parentId: 'gone' }), col('b', { parentId: 'b', order: 1 })]);
    expect(nodes.map((n) => n.collection.id)).toEqual(['a', 'b']);
  });

  it('terminates on cycles and still shows every entry exactly once', () => {
    const nodes = buildTree([col('a', { parentId: 'b', order: 0 }), col('b', { parentId: 'a', order: 1 }), col('c', { parentId: 'b', order: 2 })]);
    const ids = flattenTree(nodes).map((n) => n.collection.id);
    expect([...ids].sort()).toEqual(['a', 'b', 'c']);
    expect(nodes.map((n) => n.collection.id)).toEqual(['a']);
  });

  it('keeps one entry per duplicated id', () => {
    expect(flattenTree(buildTree([col('a'), col('a', { name: 'again' })]))).toHaveLength(1);
  });
});

describe('descendantIds / isDescendant', () => {
  it('collects every depth and excludes the collection itself', () => {
    expect([...descendantIds(tree, 'a')].sort()).toEqual(['b', 'c']);
    expect(descendantIds(tree, 'd').size).toBe(0);
  });

  it('is cycle-safe', () => {
    const cyclic = [col('a', { parentId: 'b' }), col('b', { parentId: 'a' })];
    expect([...descendantIds(cyclic, 'a')]).toEqual(['b']);
  });

  it('isDescendant answers for any depth, not for itself or unrelated entries', () => {
    expect(isDescendant(tree, 'c', 'a')).toBe(true);
    expect(isDescendant(tree, 'a', 'c')).toBe(false);
    expect(isDescendant(tree, 'a', 'a')).toBe(false);
    expect(isDescendant(tree, 'd', 'a')).toBe(false);
  });
});

describe('siblingNameTaken', () => {
  it('compares trimmed and case-insensitively among siblings only', () => {
    expect(siblingNameTaken(tree, '  a ', undefined)).toBe(true);
    expect(siblingNameTaken(tree, 'B', 'a')).toBe(true);
    expect(siblingNameTaken(tree, 'B', undefined)).toBe(false);
    expect(siblingNameTaken(tree, 'brand new', 'a')).toBe(false);
  });

  it('can ignore the entry being renamed or moved', () => {
    expect(siblingNameTaken(tree, 'B', 'a', 'b')).toBe(false);
  });

  it('counts an orphan (missing parent) as a root sibling', () => {
    expect(siblingNameTaken([col('o', { parentId: 'gone', name: 'Lost' })], 'lost', undefined)).toBe(true);
  });
});

describe('countAffected / parentOfCollection / nextOrder', () => {
  const recipes = [rec('r1', 'b'), rec('r2', 'b'), rec('r3', 'c'), rec('r4')];

  it('counts direct recipes and direct sub-collections only', () => {
    expect(countAffected(tree, recipes, 'b')).toEqual({ recipes: 2, subCollections: 1 });
    expect(countAffected(tree, recipes, 'a')).toEqual({ recipes: 0, subCollections: 1 });
    expect(countAffected(tree, recipes, 'd')).toEqual({ recipes: 0, subCollections: 0 });
  });

  it('finds the promotion target (root for top-level and orphans)', () => {
    expect(parentOfCollection(tree, 'c')).toBe('b');
    expect(parentOfCollection(tree, 'a')).toBeUndefined();
    expect(parentOfCollection([col('o', { parentId: 'gone' })], 'o')).toBeUndefined();
  });

  it('nextOrder is max sibling order + 1, 0 for an empty level', () => {
    expect(nextOrder(tree, undefined)).toBe(2);
    expect(nextOrder(tree, 'c')).toBe(0);
    expect(nextOrder(tree, undefined, 'd')).toBe(1);
  });
});

describe('inCollection / recipeCounts', () => {
  const recipes = [rec('r1', 'a'), rec('r2', 'b'), rec('r3', 'c'), rec('r4', 'd'), rec('r5'), rec('r6', 'deleted')];
  const ids = (list: DesignRecipe[]) => list.map((r) => r.id);

  it('a collection includes its descendants', () => {
    expect(ids(inCollection(recipes, tree, 'a'))).toEqual(['r1', 'r2', 'r3']);
    expect(ids(inCollection(recipes, tree, 'b'))).toEqual(['r2', 'r3']);
    expect(ids(inCollection(recipes, tree, 'd'))).toEqual(['r4']);
  });

  it('unsorted holds recipes without a collection or with an orphaned id', () => {
    expect(ids(inCollection(recipes, tree, 'unsorted'))).toEqual(['r5', 'r6']);
  });

  it('all and unknown selections show everything', () => {
    expect(inCollection(recipes, tree, 'all')).toHaveLength(6);
    expect(inCollection(recipes, tree, 'vanished')).toHaveLength(6);
  });

  it('counts include descendants', () => {
    const counts = recipeCounts(tree, recipes);
    expect([counts.get('a'), counts.get('b'), counts.get('c'), counts.get('d')]).toEqual([3, 2, 1, 1]);
  });
});
