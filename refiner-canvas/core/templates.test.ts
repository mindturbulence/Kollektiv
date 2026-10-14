import { describe, expect, it } from 'vitest';
import { createEdge, createEmptyGraph, createNode } from './graph';
import { instantiateTemplate, isTemplateId, makeTemplate } from './templates';
import type { Graph } from './types';

function sample(): Graph {
  const concept = createNode('concept', { x: 0, y: 0 }, 'c');
  concept.data = { text: 'a fox' };
  const preset = createNode('preset', { x: 0, y: 100 }, 'p');
  preset.data = { presetKind: 'character', text: 'Fox: red' };
  const shot = createNode('shot', { x: 300, y: 0 }, 's');
  shot.data = { model: 'Google Veo 3.1', durationSec: 8, text: '0–8s: runs', edited: true };
  return { ...createEmptyGraph(), nodes: [concept, preset, shot], edges: [createEdge('c', 's', 'e1'), createEdge('p', 's', 'e2')] };
}

describe('templates', () => {
  it('drops concept text and shot scripts but keeps presets, models and lengths', () => {
    const t = makeTemplate(sample());
    expect(t.nodes.find(n => n.id === 'c')?.data).toEqual({ text: '' });
    expect(t.nodes.find(n => n.id === 'p')?.data).toMatchObject({ text: 'Fox: red' });
    expect(t.nodes.find(n => n.id === 's')?.data).toEqual({ model: 'Google Veo 3.1', durationSec: 8, text: '', edited: false });
    expect(t.edges).toHaveLength(2);
  });

  it('does not mutate the source graph', () => {
    const g = sample();
    makeTemplate(g);
    expect(g.nodes.find(n => n.id === 's')?.data).toMatchObject({ text: '0–8s: runs', edited: true });
  });

  it('instantiate gives fresh ids with edges remapped and positions kept', () => {
    const t = makeTemplate(sample());
    const a = instantiateTemplate(t);
    const b = instantiateTemplate(t);
    const ids = new Set([...a.nodes, ...b.nodes].map(n => n.id));
    expect(ids.size).toBe(6);
    const nodeIds = new Set(a.nodes.map(n => n.id));
    expect(a.edges.every(e => nodeIds.has(e.source) && nodeIds.has(e.target))).toBe(true);
    expect(a.nodes.map(n => n.position)).toEqual(t.nodes.map(n => n.position));
    expect(a.nodes.map(n => n.kind)).toEqual(t.nodes.map(n => n.kind));
  });

  it('recognises template ids', () => {
    expect(isTemplateId('template:abc')).toBe(true);
    expect(isTemplateId('working')).toBe(false);
  });
});

import { createCanvasStore } from './store';
import { templateToAction } from './templates';

describe('templateToAction', () => {
  it('appends below existing nodes in one undo step', () => {
    const store = createCanvasStore();
    store.dispatch({ type: 'addNode', node: createNode('concept', { x: 0, y: 400 }) });
    const before = store.getSnapshot().nodes.length;
    store.dispatch(templateToAction(store.getSnapshot(), makeTemplate(sample())));
    const g = store.getSnapshot();
    expect(g.nodes.length).toBe(before + 3);
    expect(g.edges).toHaveLength(2);
    expect(g.nodes.slice(before).every(n => n.position.y > 400)).toBe(true);
    store.undo();
    expect(store.getSnapshot().nodes.length).toBe(before);
  });
});
