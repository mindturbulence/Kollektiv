import { describe, it, expect, beforeEach } from 'vitest';
import { dispatch, getSnapshot, resetStore } from '../store';
import * as LayerManager from '../layers/LayerManager';
import { undo, redo } from '../history/HistoryManager';
import { makeRecipe, COMPONENT_DEFAULTS as D } from '../looks/recipe';
import type { EditorDocument, ImageLayer, LookLayer } from '../types';

function bg(): ImageLayer {
  const bitmap = { width: 100, height: 100, close: () => {} } as unknown as ImageBitmap;
  return {
    id: 'bg', name: 'bg', type: 'image', bitmap, intrinsicWidth: 100, intrinsicHeight: 100,
    transform: { origin: { x: 0, y: 0 }, size: { width: 100, height: 100 }, rotation: 0, flipH: false, flipV: false },
    opacity: 100, blendMode: 'normal', visible: true,
  };
}
const doc = (): EditorDocument => ({
  id: 'd', title: 'T', width: 100, height: 100, resolution: 72, layers: [bg()], guides: [],
  activeLayerId: 'bg', createdAt: 0, updatedAt: 0,
});
const looks = () => getSnapshot().document!.layers.filter((l): l is LookLayer => l.type === 'look');
const A = () => makeRecipe('A', [{ ...D.fade, amount: 0.3 }]);
const B = () => makeRecipe('B', [{ ...D.grain, amount: 0.5 }]);

beforeEach(() => {
  resetStore();
  dispatch({ type: 'SET_DOCUMENT', document: doc() });
});

describe('look layers', () => {
  it('applyLook adds a top look, then browsing replaces it in ONE undo step', () => {
    LayerManager.applyLook(A());
    LayerManager.applyLook(B());
    LayerManager.applyLook(A());
    expect(looks()).toHaveLength(1);
    expect(looks()[0].recipe.name).toBe('A');
    expect(getSnapshot().document!.layers[0].type).toBe('look');
    expect(getSnapshot().history).toHaveLength(1);

    undo();
    expect(looks()).toHaveLength(0);
    redo(); // re-adds the layer, then restyles it
    expect(looks()).toHaveLength(1);
    expect(looks()[0].recipe.name).toBe('A');
  });

  it('asNew (Shift+click) stacks a second look as its own step', () => {
    LayerManager.applyLook(A());
    LayerManager.applyLook(B(), true);
    expect(looks().map(l => l.recipe.name)).toEqual(['B', 'A']);
    expect(getSnapshot().history).toHaveLength(2);
  });

  it('browsing does not merge across an unrelated edit', () => {
    const id = LayerManager.applyLook(A())!;
    LayerManager.setLayerOpacityLive(id, 50);
    LayerManager.commitLayerOpacity(id, 100);
    LayerManager.applyLook(B());
    expect(getSnapshot().history).toHaveLength(3);
    undo();
    expect(looks()[0].recipe.name).toBe('A');
  });

  it('inspector drags are live without history, then one step on commit', () => {
    const id = LayerManager.applyLook(A())!;
    const before = looks()[0].recipe;
    LayerManager.setLookRecipeLive(id, { ...before, components: [{ ...D.fade, amount: 0.6 }] });
    LayerManager.setLookRecipeLive(id, { ...before, components: [{ ...D.fade, amount: 0.8 }] });
    expect(getSnapshot().history).toHaveLength(1);
    LayerManager.commitLookRecipe(id, before);
    expect(getSnapshot().history).toHaveLength(2);
    undo();
    expect(looks()[0].recipe).toBe(before);
  });

  it('looks cannot be grouped or merged into', async () => {
    const id = LayerManager.applyLook(A())!;
    LayerManager.groupLayers([id]);
    expect(getSnapshot().document!.layers.some(l => l.type === 'group')).toBe(false);
    dispatch({ type: 'SET_ACTIVE_LAYER', layerId: id });
    // bg is BELOW the look: merging bg down is impossible (nothing below it); merging INTO the look is guarded.
    LayerManager.addLookLayer(B());
    dispatch({ type: 'SET_ACTIVE_LAYER', layerId: looks()[0].id });
    expect(await LayerManager.mergeDown()).toBe(false);
  });
});
