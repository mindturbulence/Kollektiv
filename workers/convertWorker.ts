/// <reference lib="webworker" />
/**
 * Image conversion worker (plan W1/E2/S1).
 *
 * magick-wasm is initialized once on first job and stays warm across the
 * batch (E2: init costs ~1-2s, amortized). Jobs run strictly sequentially —
 * the wasm instance is heavy; parallelism is a future knob, not v1.
 *
 * Cancellation: {kind:'cancel', id} flips a flag. Queued (not-yet-started)
 * jobs are answered `cancelled` immediately; the in-flight job checks the
 * flag between read/encode phases. A true mid-encode abort requires
 * terminating the worker — the main-thread manager owns that (restart-once).
 *
 * The magick.wasm binary is located at /magick.wasm (vite-plugin-static-copy,
 * see vite.config.ts). Dependency versions are exactly pinned (plan S3).
 */
import { ImageMagick, MagickImageCollection, initializeImageMagick, MagickFormat } from '@imagemagick/magick-wasm';
import type { WorkerRequest, WorkerResponse } from '../services/convert/protocol';
import { getFormatById } from '../constants/converterFormats';

type ConvertJobRequest = Extract<WorkerRequest, { kind: 'convert' }>;

let initPromise: Promise<void> | null = null;
let instanceReady = false;

async function ensureInitialized(): Promise<void> {
  if (instanceReady) return;
  if (!initPromise) {
    initPromise = initializeImageMagick(new URL('/magick.wasm', self.location.origin)).then(() => {
      instanceReady = true;
    }).catch(err => {
      // Reset so a future job can retry after a transient failure.
      initPromise = null;
      throw err;
    });
  }
  await initPromise;
}

/** Jobs waiting to run, in arrival order. */
type Job = { req: ConvertJobRequest; cancelled: boolean };
const queue: Job[] = [];
let running = false;

function post(msg: WorkerResponse, transfer?: Transferable[]): void {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, (transfer ?? []) as never);
}

const FORMAT_MAP: Record<string, MagickFormat> = {
  WEBP: MagickFormat.WebP,
  AVIF: MagickFormat.Avif,
  PNG: MagickFormat.Png,
  JPEG: MagickFormat.Jpeg,
  GIF: MagickFormat.Gif,
  TIFF: MagickFormat.Tiff,
  BMP: MagickFormat.Bmp,
};

async function runNext(): Promise<void> {
  if (running) return;
  const job = queue.shift();
  if (!job) return;
  running = true;
  const { req } = job;
  try {
    await ensureInitialized();

    if (job.cancelled) {
      post({ id: req.id, kind: 'result', ok: false, cancelled: true });
      return;
    }

    const target = getFormatById(req.targetId);
    const fmt = target?.magickFormat ? FORMAT_MAP[target.magickFormat] : undefined;
    if (!target || !fmt) {
      post({
        id: req.id,
        kind: 'result',
        ok: false,
        error: `Unknown image target: ${req.targetId}`,
        code: 'CONVERT_FAILED',
      });
      return;
    }

    const bytes = new Uint8Array(req.data);

    const result = await new Promise<ArrayBuffer>((resolve, reject) => {
      // Multi-frame sources (animated webp/gif): read as a collection and
      // coalesce so GIF targets animate correctly.
      const collection = MagickImageCollection.create(bytes);
      try {
        collection.coalesce();
        if (collection.length > 1) {
          collection.write(fmt, (data: Uint8Array) => {
            resolve(copyBuffer(data));
          });
          return;
        }
        // Single-frame fast path.
        ImageMagick.read(bytes, image => {
          try {
            if (req.quality !== undefined) image.quality = clampQuality(req.quality);
            image.write(fmt, (data: Uint8Array) => {
              resolve(copyBuffer(data));
            });
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        });
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      } finally {
        collection.dispose();
      }
    });

    if (job.cancelled) {
      post({ id: req.id, kind: 'result', ok: false, cancelled: true });
      return;
    }

    post({ id: req.id, kind: 'result', ok: true, data: result, mime: target.mime, byteLength: result.byteLength }, [result]);
  } catch (err) {
    post({
      id: req.id,
      kind: 'result',
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      code: 'CONVERT_FAILED',
    });
  } finally {
    running = false;
    // Drain the queue without blocking the message loop.
    setTimeout(() => void runNext(), 0);
  }
}

function copyBuffer(data: Uint8Array): ArrayBuffer {
  // write() hands us a view into wasm memory — copy before it is freed.
  return data.slice().buffer as ArrayBuffer;
}

function clampQuality(q: number): number {
  return Math.max(1, Math.min(100, Math.round(q)));
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;

  if (msg.kind === 'cancel') {
    const job = queue.find(j => j.req.id === msg.id);
    if (job) job.cancelled = true;
    return;
  }

  if (msg.kind === 'probe') {
    // Protocol symmetry with ffmpegWorker: exercise wasm init, run no job.
    try {
      await ensureInitialized();
      post({ id: msg.id, kind: 'probe-result', ok: true });
    } catch (err) {
      post({
        id: msg.id,
        kind: 'probe-result',
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        code: 'CONVERT_WASM_INIT',
      });
    }
    return;
  }

  queue.push({ req: msg, cancelled: false });
  void runNext();
};
