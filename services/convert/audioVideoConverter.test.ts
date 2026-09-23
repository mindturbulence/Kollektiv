import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { audioVideoConverter, type AVELoadState } from './audioVideoConverter';
import type { WorkerResponse } from './protocol';

/**
 * Harness: stub the global Worker so preload/convert drive the real facade
 * while tests simulate worker responses. The singleton's state is reset
 * between tests via dispose() + forced idle.
 */
function stubWorker() {
  const instances: Array<{
    onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null;
    onerror: (() => void) | null;
    postMessage: (msg: unknown) => void;
    terminate: () => void;
  }> = [];
  const sent: unknown[] = [];

  vi.stubGlobal('Worker', class {
    onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() {
      this.postMessage = (msg: unknown) => { sent.push(msg); };
      this.terminate = () => {};
      instances.push(this);
    }
    postMessage!: (msg: unknown) => void;
    terminate!: () => void;
  });

  return {
    instances,
    sent,
    emit(msg: WorkerResponse, index = 0) {
      instances[index]?.onmessage?.({ data: msg } as MessageEvent<WorkerResponse>);
    },
    emitError(index = 0) {
      instances[index]?.onerror?.();
    },
  };
}

describe('audioVideoConverter lazy-load state machine (plan W2)', () => {
  let harness: ReturnType<typeof stubWorker>;
  let states: AVELoadState[];

  beforeEach(() => {
    vi.useFakeTimers();
    harness = stubWorker();
    states = [];
    audioVideoConverter.onLoadStateChange(s => states.push(s));
    // Reset singleton state between tests.
    // dispose() cancels pending jobs and returns the state machine to idle.
    audioVideoConverter.dispose();
    states.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('starts idle', () => {
    expect(audioVideoConverter.getLoadState()).toBe('idle');
  });

  it('preload() → loading → ready when the probe succeeds', async () => {
    audioVideoConverter.preload();
    expect(audioVideoConverter.getLoadState()).toBe('loading');
    // The probe message went to the worker, not a fake convert job.
    const probe = harness.sent.find(m => (m as { kind: string }).kind === 'probe');
    expect(probe).toBeDefined();
    harness.emit({ id: (probe as { id: string }).id, kind: 'probe-result', ok: true });
    expect(audioVideoConverter.getLoadState()).toBe('ready');
  });

  it('preload() → failed when the probe reports a load error', () => {
    audioVideoConverter.preload();
    const probe = harness.sent.find(m => (m as { kind: string }).kind === 'probe');
    harness.emit({ id: (probe as { id: string }).id, kind: 'probe-result', ok: false, error: 'fetch failed', code: 'CONVERT_CORE_LOAD' });
    expect(audioVideoConverter.getLoadState()).toBe('failed');
  });

  it('preload() can retry after failure (RETRY button path)', () => {
    audioVideoConverter.preload();
    const probe = harness.sent.find(m => (m as { kind: string }).kind === 'probe');
    harness.emit({ id: (probe as { id: string }).id, kind: 'probe-result', ok: false, error: 'offline', code: 'CONVERT_CORE_LOAD' });
    expect(audioVideoConverter.getLoadState()).toBe('failed');

    audioVideoConverter.preload(); // retry must be accepted from 'failed'
    expect(audioVideoConverter.getLoadState()).toBe('loading');
    const probe2 = harness.sent.filter(m => (m as { kind: string }).kind === 'probe').pop();
    harness.emit({ id: (probe2 as { id: string }).id, kind: 'probe-result', ok: true });
    expect(audioVideoConverter.getLoadState()).toBe('ready');
  });

  it('a successful convert() implies ready even without preload', async () => {
    const promise = audioVideoConverter.convert({ id: 'a1', data: new ArrayBuffer(4), fileName: 'a.flac', targetId: 'mp3' });
    expect(audioVideoConverter.getLoadState()).toBe('loading');
    harness.emit({ id: 'a1', kind: 'result', ok: true, data: new ArrayBuffer(2), mime: 'audio/mpeg', byteLength: 2 });
    await expect(promise).resolves.toMatchObject({ ok: true });
    expect(audioVideoConverter.getLoadState()).toBe('ready');
  });

  it('a CORE_LOAD failure from convert() moves state to failed', async () => {
    const promise = audioVideoConverter.convert({ id: 'a2', data: new ArrayBuffer(4), fileName: 'a.flac', targetId: 'mp3' });
    harness.emit({ id: 'a2', kind: 'result', ok: false, error: 'CONVERT_CORE_LOAD: offline', code: 'CONVERT_CORE_LOAD' });
    await expect(promise).rejects.toThrow();
    expect(audioVideoConverter.getLoadState()).toBe('failed');
  });

  it('watchdog: pending jobs reject as timeout and the worker is terminated', async () => {
    const promise = audioVideoConverter.convert({ id: 'a3', data: new ArrayBuffer(4), fileName: 'a.flac', targetId: 'mp3' });
    // 10min watchdog (CONVERTER_LIMITS.FFMPEG_TIMEOUT_MS).
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    await expect(promise).rejects.toThrow('CONVERT_TIMEOUT');
    expect(audioVideoConverter.getLoadState()).not.toBe('ready');
  });

  it('cancelAll() rejects pending jobs as AbortError (cancel path)', async () => {
    const promise = audioVideoConverter.convert({ id: 'a4', data: new ArrayBuffer(4), fileName: 'a.flac', targetId: 'mp3' });
    audioVideoConverter.cancelAll();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });
});
