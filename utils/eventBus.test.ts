import { describe, it, expect } from 'vitest';
import { appEventBus, type AppEvents } from './eventBus';

describe('appEventBus', () => {
  it('delivers the payload to on() subscribers and stops after off()', () => {
    const received: string[] = [];
    const off = appEventBus.on('webSearchError', (msg) => received.push(msg));

    appEventBus.emit('webSearchError', 'first');
    off();
    appEventBus.emit('webSearchError', 'second');

    expect(received).toEqual(['first']);
  });

  it('emits void-payload events with no second argument', () => {
    let calls = 0;
    const off = appEventBus.on('stopMedia', () => { calls++; });
    appEventBus.emit('stopMedia');
    off();
    expect(calls).toBe(1);
  });
});

// Type-level check, never called at runtime — tsc (pnpm lint) is what verifies
// this actually errors. A wrong payload for a known event must not compile.
function _typeCheckWrongPayloadIsRejected() {
  // @ts-expect-error webSearchError takes a string payload, not a number.
  appEventBus.emit('webSearchError', 42);
  // @ts-expect-error 'notAnEvent' is not a key of AppEvents.
  appEventBus.emit('notAnEvent', {});
  const _unused: AppEvents['webSearchError'] = 'ok';
  void _unused;
}
void _typeCheckWrongPayloadIsRejected;
