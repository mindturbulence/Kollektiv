import { describe, expect, it } from 'vitest';
import { createEdge, createEmptyGraph, createNode } from './graph';
import { buildStoryboardPrompt, parseBriefs, storyboardToAction } from './storyboard';
import { createCanvasStore } from './store';
import type { Graph } from './types';

describe('parseBriefs', () => {
  it('reads a JSON array, including a fenced one with chatter around it', () => {
    expect(parseBriefs('["a fox wakes", "it runs"]')).toEqual(['a fox wakes', 'it runs']);
    expect(parseBriefs('Here you go:\n```json\n["one", "two"]\n```')).toEqual(['one', 'two']);
  });
  it('falls back to numbered and bulleted lines', () => {
    expect(parseBriefs('1. wide shot\n2) close up\n- push in')).toEqual(['wide shot', 'close up', 'push in']);
  });
  it('caps the count, drops blanks and non-strings', () => {
    expect(parseBriefs('["a","","b",3,"c"]', 2)).toEqual(['a', 'b']);
    expect(parseBriefs('')).toEqual([]);
  });
});

describe('buildStoryboardPrompt', () => {
  it('states the shot count and carries the idea', () => {
    const { system, user } = buildStoryboardPrompt('a fox in snow', 4);
    expect(system).toContain('exactly 4');
    expect(user).toContain('a fox in snow');
  });
});

function sample(): Graph {
  const concept = createNode('concept', { x: 0, y: 0 }, 'c');
  concept.data = { text: 'fox story' };
  const preset = createNode('preset', { x: 0, y: 100 }, 'p');
  const shot = createNode('shot', { x: 300, y: 0 }, 's');
  return { ...createEmptyGraph(), nodes: [concept, preset, shot], edges: [createEdge('c', 's', 'e1'), createEdge('p', 's', 'e2')] };
}

describe('storyboardToAction', () => {
  it('adds a linked Concept -> Shot pair per brief and shares the presets, in one undo step', () => {
    const store = createCanvasStore(sample());
    const action = storyboardToAction(store.getSnapshot(), 'c', ['wake', 'run', 'stop'], { model: 'Google Veo 3.1', durationSec: 6 });
    expect(action).not.toBeNull();
    store.dispatch(action!);
    const g = store.getSnapshot();
    expect(g.nodes).toHaveLength(3 + 6);
    const newShots = g.nodes.slice(3).filter(n => n.kind === 'shot');
    expect(newShots).toHaveLength(3);
    for (const s of newShots) {
      const inbound = g.edges.filter(e => e.target === s.id).map(e => e.source);
      expect(inbound).toContain('p');
      expect(inbound).toHaveLength(2);
      expect(s.data).toMatchObject({ model: 'Google Veo 3.1', durationSec: 6, text: '', edited: false });
    }
    expect(g.nodes.slice(3).every(n => n.position.y > 100)).toBe(true);
    store.undo();
    expect(store.getSnapshot().nodes).toHaveLength(3);
  });

  it('returns null for no briefs or a missing / non-concept source', () => {
    const g = sample();
    expect(storyboardToAction(g, 'c', [], { model: '', durationSec: 5 })).toBeNull();
    expect(storyboardToAction(g, 's', ['x'], { model: '', durationSec: 5 })).toBeNull();
    expect(storyboardToAction(g, 'nope', ['x'], { model: '', durationSec: 5 })).toBeNull();
  });
});
