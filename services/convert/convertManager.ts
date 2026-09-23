/**
 * Main-thread manager for the magick image worker (plan W1/S1).
 *
 * - Serial enqueue; per-job progress not available from magick (phase-level only).
 * - Cancel: posts {kind:'cancel'}; if the job is mid-encode the manager
 *   terminates + restarts the worker ONCE (plan S1 restart policy) and fails
 *   the job as cancelled.
 * - Unmount: cancelAll() then terminate() — no leaked workers on navigation.
 */
import type { WorkerRequest, WorkerResponse, WorkerSuccess } from './protocol';
import { CONVERT_ERROR_CODES } from './protocol';

export interface ManagedJob<T = WorkerSuccess> {
  id: string;
  resolve: (result: T) => void;
  reject: (err: Error) => void;
  cancelled: boolean;
}

export class ConvertWorkerManager {
  private worker: Worker | null = null;
  private jobs = new Map<string, ManagedJob>();
  private inflight: ManagedJob | null = null;
  private restartsUsed = 0;
  private disposed = false;

  constructor(private readonly workerFactory: () => Worker) {}

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    if (this.disposed) throw new Error('ConvertWorkerManager disposed');
    this.worker = this.workerFactory();
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.onMessage(e.data);
    this.worker.onerror = () => this.handleWorkerError();
    return this.worker;
  }

  private onMessage(msg: WorkerResponse): void {
    if (msg.kind === 'progress') {
      // Phase hook — image path has no fine-grained progress.
      return;
    }
    const job = this.jobs.get(msg.id) ?? (this.inflight?.id === msg.id ? this.inflight : null);
    if (!job) return;
    this.jobs.delete(msg.id);
    if (this.inflight?.id === msg.id) this.inflight = null;

    if (msg.kind === 'result' && msg.ok === true) {
      job.resolve(msg);
    } else if (msg.kind === 'result' && 'cancelled' in msg && msg.cancelled) {
      job.reject(new DOMException('Cancelled', 'AbortError'));
    } else if (msg.kind === 'result') {
      job.reject(new Error(`${(msg as { code?: string }).code ?? 'CONVERT_FAILED'}: ${(msg as { error?: string }).error ?? 'unknown error'}`));
    }
  }

  private handleWorkerError(): void {
    // Crash mid-batch: restart once, fail the in-flight job (plan S1).
    const failed = this.inflight;
    this.inflight = null;
    this.terminateWorker();

    if (failed && this.restartsUsed < 1 && !this.disposed) {
      this.restartsUsed++;
      this.ensureWorker();
      // Requeue nothing — the failed job rejects; the rest of the batch
      // continues through fresh convert() calls.
    }
    if (failed) {
      failed.reject(new Error(`${CONVERT_ERROR_CODES.CONVERT}: worker crashed`));
    }
  }

  convert(req: { id: string; data: ArrayBuffer; fileName: string; targetId: string; quality?: number }): Promise<WorkerSuccess> {
    const worker = this.ensureWorker();
    return new Promise<WorkerSuccess>((resolve, reject) => {
      const job: ManagedJob = { id: req.id, resolve, reject, cancelled: false };
      this.jobs.set(req.id, job);
      this.inflight = job; // serial queue: this job runs as soon as posted
      const payload: WorkerRequest = { kind: 'convert', ...req };
      const copy = req.data.slice(0);
      worker.postMessage(payload, [copy]);
    });
  }

  async cancel(id: string): Promise<void> {
    const job = this.jobs.get(id) ?? (this.inflight?.id === id ? this.inflight : null);
    if (!job) return;
    job.cancelled = true;
    this.jobs.delete(id);
    if (this.inflight?.id === id) this.inflight = null;
    // Queued/serial: our jobs start immediately, so a live cancel means the
    // job is mid-encode → terminate + restart once.
    this.terminateWorker();
    job.reject(new DOMException('Cancelled', 'AbortError'));
  }

  cancelAll(): void {
    // Callers hold the job promises; terminate() makes every pending job's
    // response never arrive, so fail them here as cancelled.
    const pending = [...this.jobs.values(), ...(this.inflight ? [this.inflight] : [])];
    this.jobs.clear();
    this.inflight = null;
    for (const job of pending) {
      job.reject(new DOMException('Cancelled', 'AbortError'));
    }
    this.terminateWorker();
  }

  dispose(): void {
    this.disposed = true;
    this.jobs.clear();
    this.inflight = null;
    this.terminateWorker();
  }

  private terminateWorker(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
