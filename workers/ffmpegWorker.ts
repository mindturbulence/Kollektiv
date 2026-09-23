/// <reference lib="webworker" />
/**
 * Audio/video conversion worker (plan W2/E1).
 *
 * ffmpeg.wasm MUST run in a dedicated worker (Phase 3 E1): it blocks whatever
 * thread instantiates it, and the plan's success criterion "flac→mp3 with no
 * page freeze >2s" is only satisfiable off the main thread.
 *
 * The ~32MB single-thread core is fetched lazily on first audio/video job
 * (plan W2) and cached on-disk via toBlobURL. crossOriginIsolated is false on
 * GH Pages → single-thread core only (plan P4).
 */
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { WorkerRequest, WorkerResponse } from '../services/convert/protocol';
import { getFormatById } from '../constants/converterFormats';

type ConvertJobRequest = Extract<WorkerRequest, { kind: 'convert' }>;

let ffmpeg: FFmpeg | null = null;
let coreLoad: Promise<void> | null = null;

async function ensureCore(): Promise<void> {
  if (ffmpeg) return;
  if (!coreLoad) {
    coreLoad = (async () => {
      const instance = new FFmpeg();
      // Plan W2/P3: the single-thread core is static-copied to /ffmpeg/ at
      // build time (vite-plugin-static-copy, pinned @ffmpeg/core dep) —
      // local-first, no CDN round-trip on first A/V job. toBlobURL still
      // wraps the fetches so the core survives worker restarts.
      const baseURL = new URL('/ffmpeg/', self.location.origin).toString();
      await instance.load({
        coreURL: await toBlobURL(`${baseURL}ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}ffmpeg-core.wasm`, 'application/wasm'),
      });
      ffmpeg = instance;
    })();
    coreLoad = coreLoad.catch(err => {
      coreLoad = null;
      throw err;
    });
  }
  await coreLoad;
}

/** Serial queue — single-thread core handles one job at a time. */
type Job = { req: ConvertJobRequest; cancelled: boolean };
const queue: Job[] = [];
let running = false;

function post(msg: WorkerResponse, transfer?: Transferable[]): void {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, (transfer ?? []) as never);
}

async function runNext(): Promise<void> {
  if (running) return;
  const job = queue.shift();
  if (!job) return;
  running = true;
  const { req } = job;

  let progressHandler: ((e: { progress: number; time: number }) => void) | null = null;

  try {
    await ensureCore();
    const ff = ffmpeg!;

    if (job.cancelled) {
      post({ id: req.id, kind: 'result', ok: false, cancelled: true });
      return;
    }

    const target = getFormatById(req.targetId);
    if (!target?.ffmpegArgs) {
      post({ id: req.id, kind: 'result', ok: false, error: `Unknown A/V target: ${req.targetId}`, code: 'CONVERT_FAILED' });
      return;
    }

    // Quality maps to audio bitrate (kbps) for bitrate-based audio codecs.
    const args: string[] = [];
    const targetArgs = [...(target.ffmpegArgs ?? [])];
    if (req.quality !== undefined) {
      const idx = targetArgs.indexOf('-b:a');
      if (idx !== -1 && targetArgs[idx + 1] === undefined) {
        targetArgs[idx + 1] = `${Math.max(32, Math.min(320, Math.round(req.quality)))}k`;
      }
    }
    args.push(...targetArgs);

    const inName = `in_${req.id}.${extOf(req.fileName)}`;
    const outName = `out_${req.id}.${target.ext}`;
    progressHandler = ({ progress }) => {
      if (progress >= 0 && progress <= 1) {
        post({ id: req.id, kind: 'progress', fraction: progress });
      }
    };
    ff.on('progress', progressHandler);

    await ff.writeFile(inName, new Uint8Array(req.data));
    if (job.cancelled) {
      post({ id: req.id, kind: 'result', ok: false, cancelled: true });
      return;
    }

    const rc = await ff.exec(['-i', inName, ...args, outName]);
    if (job.cancelled) {
      post({ id: req.id, kind: 'result', ok: false, cancelled: true });
      return;
    }
    if (rc !== 0) {
      post({ id: req.id, kind: 'result', ok: false, error: `ffmpeg exited with code ${rc}`, code: 'CONVERT_FAILED' });
      return;
    }

    const data = await ff.readFile(outName);
    const u8 = data instanceof Uint8Array ? data : new Uint8Array();
    if (u8.length === 0) {
      post({ id: req.id, kind: 'result', ok: false, error: 'ffmpeg produced no output', code: 'CONVERT_FAILED' });
      return;
    }
    const buffer = u8.slice().buffer as ArrayBuffer;
    post({ id: req.id, kind: 'result', ok: true, data: buffer, mime: target.mime, byteLength: buffer.byteLength }, [buffer]);
  } catch (err) {
    post({
      id: req.id,
      kind: 'result',
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      code: /load|fetch|network/i.test(String(err)) ? 'CONVERT_CORE_LOAD' : 'CONVERT_FAILED',
    });
  } finally {
    if (progressHandler && ffmpeg) ffmpeg.off('progress', progressHandler);
    try { if (ffmpeg) await ffmpeg.deleteFile(`in_${req.id}.${extOf(req.fileName)}`); } catch { /* already gone */ }
    try { if (ffmpeg) await ffmpeg.deleteFile(`out_${req.id}.${getFormatById(req.targetId)?.ext ?? 'bin'}`); } catch { /* already gone */ }
    if (progressHandler && ffmpeg) ffmpeg.off('progress', progressHandler);
    running = false;
    setTimeout(() => void runNext(), 0);
  }
}

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : 'bin';
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.kind === 'cancel') {
    const job = queue.find(j => j.req.id === msg.id);
    if (job) job.cancelled = true;
    // In-flight job: ffmpeg.exec cannot be interrupted gracefully; the main
    // thread manager terminates this worker (restart via next ensureCore —
    // the blob URL cache makes the reload cheap).
    return;
  }
  if (msg.kind === 'probe') {
    // Preload path: only exercise the core load, run no job. Resolve ok even
    // when the core was already warm.
    try {
      await ensureCore();
      post({ id: msg.id, kind: 'probe-result', ok: true });
    } catch (err) {
      post({
        id: msg.id,
        kind: 'probe-result',
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        code: 'CONVERT_CORE_LOAD',
      });
    }
    return;
  }
  queue.push({ req: msg, cancelled: false });
  void runNext();
};

// fetchFile kept for parity with docs; data arrives via transferred ArrayBuffer.
void fetchFile;
