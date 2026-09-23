/**
 * Audio/video conversion facade (plan W2/E1).
 *
 * State machine for the lazy ffmpeg core load: idle → loading → ready/failed.
 * The UI binds CoreLoadError recovery to `precheckFailed + retryLoad()`.
 * All jobs run in the dedicated ffmpeg worker — never the main thread.
 */
import type { WorkerResponse, WorkerSuccess, ProbeRequest } from './protocol';
import { CONVERT_ERROR_CODES } from './protocol';
import { CONVERTER_LIMITS } from '../../constants/converterFormats';

export type AVELoadState = 'idle' | 'loading' | 'ready' | 'failed';

type Listener = (state: AVELoadState) => void;

class AudioVideoConverter {
  private worker: Worker | null = null;
  private loadState: AVELoadState = 'idle';
  private listeners = new Set<Listener>();
  private pending = new Map<string, { resolve: (r: WorkerSuccess) => void; reject: (e: Error) => void; timer: number }>();

  private factory(): Worker {
    return new Worker(new URL('../../workers/ffmpegWorker.ts', import.meta.url), { type: 'module' });
  }

  getLoadState(): AVELoadState {
    return this.loadState;
  }

  onLoadStateChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private setLoadState(s: AVELoadState): void {
    if (this.loadState === s) return;
    this.loadState = s;
    this.listeners.forEach(fn => fn(s));
  }

  /**
   * Kick off core load early (e.g. when the user opens the audio/video
   * section) so the first job doesn't pay the 32MB fetch latency. Uses the
   * dedicated `probe` message — no fake convert job that would exit non-zero
   * on an empty input and report a false load failure.
   */
  preload(): void {
    // 'failed' must be allowed through or the UI RETRY button can never retry.
    if (this.loadState !== 'idle' && this.loadState !== 'failed') return;
    this.setLoadState('loading');
    const worker = this.ensureWorker();
    worker.postMessage({ id: `probe_${Date.now()}`, kind: 'probe' } satisfies ProbeRequest);
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    this.worker = this.factory();
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.kind === 'progress') return;
      if (msg.kind === 'probe-result') {
        // Preload outcome — only meaningful while a preload is in flight.
        if (msg.ok) {
          if (this.loadState === 'loading') this.setLoadState('ready');
        } else if (this.loadState === 'loading') {
          this.setLoadState('failed');
        }
        return;
      }
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(msg.id);
      if (msg.kind === 'result' && msg.ok === true) pending.resolve(msg);
      else if (msg.kind === 'result' && 'cancelled' in msg && msg.cancelled) pending.reject(new DOMException('Cancelled', 'AbortError'));
      else if (msg.kind === 'result') pending.reject(new Error(`${(msg as { code?: string }).code ?? 'CONVERT_FAILED'}: ${(msg as { error?: string }).error ?? 'unknown error'}`));
    };
    this.worker.onerror = () => {
      // Crash: fail everything pending; the next job recreates the worker
      // and reloads the core from the blob-URL cache.
      const wasLoading = this.loadState === 'loading';
      this.worker = null;
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error(`${CONVERT_ERROR_CODES.CONVERT}: ffmpeg worker crashed`));
      }
      this.pending.clear();
      if (wasLoading) this.setLoadState('failed');
    };
    return this.worker;
  }

  private execInWorker(req: { id: string; kind: 'convert'; data: ArrayBuffer; fileName: string; targetId: string; quality?: number }): Promise<WorkerSuccess> {
    const worker = this.ensureWorker();
    return new Promise<WorkerSuccess>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(req.id);
        this.terminate();
        reject(new Error(`${CONVERT_ERROR_CODES.TIMEOUT}: job exceeded watchdog`));
      }, CONVERTER_LIMITS.FFMPEG_TIMEOUT_MS);
      this.pending.set(req.id, { resolve, reject, timer });
      const copy = req.data.slice(0);
      worker.postMessage(req, [copy]);
    });
  }

  async convert(req: { id: string; data: ArrayBuffer; fileName: string; targetId: string; quality?: number }): Promise<WorkerSuccess> {
    if (this.loadState === 'idle' || this.loadState === 'loading') {
      this.setLoadState('loading');
    }
    try {
      const result = await this.execInWorker({ kind: 'convert', ...req });
      // First success implies the core is loaded and usable.
      if (this.loadState !== 'ready') this.setLoadState('ready');
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes(CONVERT_ERROR_CODES.CORE_LOAD)) {
        this.setLoadState('failed');
      }
      throw err;
    }
  }

  cancel(id: string): void {
    const p = this.pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(id);
    p.reject(new DOMException('Cancelled', 'AbortError'));
    // exec() is not interruptible → terminate; next job reloads the core.
    this.terminate();
  }

  cancelAll(): void {
    const entries = [...this.pending.entries()];
    this.pending.clear();
    for (const [, p] of entries) {
      clearTimeout(p.timer);
      p.reject(new DOMException('Cancelled', 'AbortError'));
    }
    this.terminate();
  }

  /** Release the worker entirely (page unmount). */
  dispose(): void {
    this.cancelAll();
    this.setLoadState('idle');
  }

  private terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

export const audioVideoConverter = new AudioVideoConverter();
