import { describe, expect, it } from 'vitest';
import { createCanvasStore } from './store';
import { createNode } from './graph';
import { intakeToAction, queueIntake, takeIntakes } from './intake';

const A = { concept: 'a fox runs', model: 'Google Veo 3.1', durationSec: 6, script: '0–3s: runs\n3–6s: stops' };

describe('canvas intake', () => {
  it('queue drains once', () => {
    queueIntake(A);
    expect(takeIntakes()).toEqual([A]);
    expect(takeIntakes()).toEqual([]);
  });

  it('adds a connected Concept -> Shot pair, script kept via edited flag', () => {
    const store = createCanvasStore();
    const action = intakeToAction(store.getSnapshot(), [A]);
    expect(action).not.toBeNull();
    store.dispatch(action!);
    const g = store.getSnapshot();
    expect(g.nodes.map(n => n.kind)).toEqual(['concept', 'shot']);
    expect(g.edges).toHaveLength(1);
    expect(g.nodes[1].data).toMatchObject({ model: 'Google Veo 3.1', durationSec: 6, text: A.script, edited: true });
    store.undo();
    expect(store.getSnapshot().nodes).toHaveLength(0);
  });

  it('places new pairs below existing nodes and handles several at once', () => {
    const store = createCanvasStore();
    store.dispatch({ type: 'addNode', node: createNode('concept', { x: 0, y: 500 }) });
    store.dispatch(intakeToAction(store.getSnapshot(), [A, { ...A, script: '' }])!);
    const ys = store.getSnapshot().nodes.map(n => n.position.y);
    expect(Math.min(...ys.slice(1))).toBeGreaterThan(500);
    expect(store.getSnapshot().nodes.at(-1)!.data).toMatchObject({ edited: false });
  });

  it('returns null for an empty intake list', () => {
    expect(intakeToAction(createCanvasStore().getSnapshot(), [])).toBeNull();
  });
});
