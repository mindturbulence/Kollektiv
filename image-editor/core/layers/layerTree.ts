// ─── Kollektiv Image Editor — Layer Tree Helpers ───────────────────────────
// The single place that knows layers can nest inside GroupLayer.children.
// Every read/mutation of the layer list (tools, panels, store reducer) goes
// through these instead of a flat `.find`/`.map`/`.filter`, so nesting a
// layer inside a group never silently breaks a tool that assumed a flat list.

import type { Layer } from '../types';

/** Recursively finds a layer by id, descending into group children. */
export function findLayerById(layers: Layer[], id: string): Layer | undefined {
  for (const layer of layers) {
    if (layer.id === id) return layer;
    if (layer.type === 'group') {
      const found = findLayerById(layer.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** Recursively applies a patch to the layer with the given id. Returns the
 *  same array reference if nothing changed (so callers can bail on no-op). */
export function updateLayerById(layers: Layer[], id: string, patch: Partial<Layer>): Layer[] {
  let changed = false;
  const result = layers.map((layer) => {
    if (layer.id === id) {
      changed = true;
      return { ...layer, ...patch } as Layer;
    }
    if (layer.type === 'group') {
      const children = updateLayerById(layer.children, id, patch);
      if (children !== layer.children) {
        changed = true;
        return { ...layer, children };
      }
    }
    return layer;
  });
  return changed ? result : layers;
}

/** Recursively removes a layer by id from wherever it lives in the tree. */
export function removeLayerById(layers: Layer[], id: string): Layer[] {
  const filtered = layers.filter((layer) => layer.id !== id);
  if (filtered.length !== layers.length) return filtered;
  return layers.map((layer) =>
    layer.type === 'group' ? { ...layer, children: removeLayerById(layer.children, id) } : layer,
  );
}

/** Returns the top-level index of a layer's own array — for a nested layer,
 *  the index of the group it belongs to (used for insert-position bookkeeping). */
export function findTopLevelIndex(layers: Layer[], id: string): number {
  return layers.findIndex(
    (layer) => layer.id === id || (layer.type === 'group' && findLayerById(layer.children, id) !== undefined),
  );
}
