import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConvertWorkerManager } from './convertManager';
import type { WorkerResponse } from './protocol';

/**
 * Harness: a fake Worker whose postMessage is captured so tests can drive
 * worker→main responses directly. Covers the protocol happy/error/cancel
 * paths without instantiating real workers (plan §8 worker protocol tests).
 */
function createHarness() {
  const listeners = new Set<(e: MessageEvent<WorkerResponse>) => void>();
  const sent: Array<{ msg: unknown; transfer: Transferable[] }> = [];

  class FakeWorker {
    onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null = null;
    onerror: (() => void) | null = null;
    postMessage(msg: unknown, transfer?: Transferable[]) {
      sent.push({ msg, transfer: transfer ?? [] });
    }
    terminate() { /* noop */ }
    addEventListener(type: string, fn: (e: MessageEvent<WorkerResponse>) => void) {
      if (type === 'message') listeners.add(fn);
    }
    removeEventListener(type: string, fn: (e: MessageEvent<WorkerResponse>) => void) {
      if (type === 'message') listeners.delete(fn);
    }
    // Test driver: simulate a worker→main message.
    static emit(msg: WorkerResponse) {
      const event = { data: msg } as MessageEvent<WorkerResponse>;
      for (const fn of listeners) fn(event);
      for (const inst of instances) {
        inst.onmessage?.(event);
      }
    }
    static emitError() {
      for (const inst of instances) inst.onerror?.();
    }
  }
  const instances: FakeWorker[] = [];
  const OriginalWorker = globalThis.Worker;
  vi.stubGlobal('Worker', class extends FakeWorker {
    constructor() {
      super();
      instances.push(this);
    }
  });

  return {
    sent,
    instances,
    cleanup() {
      vi.unstubAllGlobals();
      void OriginalWorker;
    },
  };
}

describe('ConvertWorkerManager (plan W1/S1 worker protocol)', () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(() => {
    harness = createHarness();
  });
  afterEach(() => {
    harness.cleanup();
  });

  it('resolves the job when a success result arrives', async () => {
    const manager = new ConvertWorkerManager(() => new Worker('x'));
    const promise = manager.convert({ id: 'j1', data: new ArrayBuffer(4), fileName: 'a.png', targetId: 'webp' });
    // One convert request posted.
    expect(harness.sent).toHaveLength(1);
    expect((harness.sent[0].msg as { kind: string }).kind).toBe('convert');
    harness.instances[0].onmessage?.({ data: { id: 'j1', kind: 'result', ok: true, data: new ArrayBuffer(2), mime: 'image/webp', byteLength: 2 } } as MessageEvent<WorkerResponse>);
    await expect(promise).resolves.toMatchObject({ ok: true, byteLength: 2 });
    manager.dispose();
  });

  it('rejects with code+error on failure results', async () => {
    const manager = new ConvertWorkerManager(() => new Worker('x'));
    const promise = manager.convert({ id: 'j2', data: new ArrayBuffer(4), fileName: 'a.png', targetId: 'webp' });
    harness.instances[0].onmessage?.({ data: { id: 'j2', kind: 'result', ok: false, error: 'boom', code: 'CONVERT_FAILED' } } as MessageEvent<WorkerResponse>);
    await expect(promise).rejects.toThrow('CONVERT_FAILED: boom');
    manager.dispose();
  });

  it('rejects as AbortError when the worker reports cancellation', async () => {
    const manager = new ConvertWorkerManager(() => new Worker('x'));
    const promise = manager.convert({ id: 'j3', data: new ArrayBuffer(4), fileName: 'a.png', targetId: 'webp' });
    harness.instances[0].onmessage?.({ data: { id: 'j3', kind: 'result', ok: false, cancelled: true } } as MessageEvent<WorkerResponse>);
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    manager.dispose();
  });

  it('cancel() rejects the live job with AbortError', async () => {
    const manager = new ConvertWorkerManager(() => new Worker('x'));
    const promise = manager.convert({ id: 'j4', data: new ArrayBuffer(4), fileName: 'a.png', targetId: 'webp' });
    void manager.cancel('j4');
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    manager.dispose();
  });

  it('cancelAll() rejects everything pending (unmount teardown path)', async () => {
    const manager = new ConvertWorkerManager(() => new Worker('x'));
    const p1 = manager.convert({ id: 'a', data: new ArrayBuffer(1), fileName: 'a.png', targetId: 'webp' });
    const p2 = manager.convert({ id: 'b', data: new ArrayBuffer(1), fileName: 'b.png', targetId: 'webp' });
    manager.cancelAll();
    await expect(p1).rejects.toMatchObject({ name: 'AbortError' });
    await expect(p2).rejects.toMatchObject({ name: 'AbortError' });
    manager.dispose();
  });

  it('worker crash fails the in-flight job and restarts the worker once', async () => {
    const manager = new ConvertWorkerManager(() => new Worker('x'));
    const promise = manager.convert({ id: 'c1', data: new ArrayBuffer(1), fileName: 'a.png', targetId: 'webp' });
    expect(harness.instances).toHaveLength(1);
    harness.instances[0].onerror?.();
    await expect(promise).rejects.toThrow('worker crashed');
    // A subsequent convert gets a fresh worker (restart-once policy).
    const p2 = manager.convert({ id: 'c2', data: new ArrayBuffer(1), fileName: 'b.png', targetId: 'webp' });
    expect(harness.instances).toHaveLength(2);
    harness.instances[1].onmessage?.({ data: { id: 'c2', kind: 'result', ok: true, data: new ArrayBuffer(1), mime: 'image/webp', byteLength: 1 } } as MessageEvent<WorkerResponse>);
    await expect(p2).resolves.toMatchObject({ ok: true });
    manager.dispose();
  });
});
