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
import type { EncodeFramesRequest, FfmpegWorkerRequest, WorkerRequest, WorkerResponse } from '../services/convert/protocol';
import { audioKbps, getFormatById } from '../constants/converterFormats';

type ConvertJobRequest = Extract<WorkerRequest, { kind: 'convert' }>;
type QueueableRequest = ConvertJobRequest | EncodeFramesRequest;

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
type Job = { req: QueueableRequest; cancelled: boolean };
const queue: Job[] = [];
let running = false;

function post(msg: WorkerResponse, transfer?: Transferable[]): void {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, (transfer ?? []) as never);
}

async function runConvert(ff: FFmpeg, job: Job & { req: ConvertJobRequest }): Promise<void> {
  const { req } = job;
  let progressHandler: ((e: { progress: number; time: number }) => void) | null = null;

  try {
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
        targetArgs[idx + 1] = `${audioKbps(req.quality)}k`;
      }
    }
    // Max size (presets): fit inside maxEdge², never upscale, keep even dimensions
    // for H.264/VP8. GIF targets carry their own scale filter.
    if (req.maxEdge && target.category === 'video' && !targetArgs.includes('-vf')) {
      const e = Math.round(req.maxEdge);
      args.push('-vf', `scale=w=min(${e}\\,iw):h=min(${e}\\,ih):force_original_aspect_ratio=decrease:force_divisible_by=2`);
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
  } finally {
    if (progressHandler) ff.off('progress', progressHandler);
    try { await ff.deleteFile(`in_${req.id}.${extOf(req.fileName)}`); } catch { /* already gone */ }
    try { await ff.deleteFile(`out_${req.id}.${getFormatById(req.targetId)?.ext ?? 'bin'}`); } catch { /* already gone */ }
  }
}

/** Video-export ffmpeg fallback (plan §4/§7): mux JPEG frames + optional WAV into mp4/webm. */
async function runEncodeFrames(ff: FFmpeg, job: Job & { req: EncodeFramesRequest }): Promise<void> {
  const { req } = job;
  const frameNames: string[] = [];
  const audioName = `a_${req.id}.wav`;
  const outName = `out_${req.id}.${req.container}`;
  let progressHandler: ((e: { progress: number }) => void) | null = null;

  try {
    if (job.cancelled) {
      post({ id: req.id, kind: 'result', ok: false, cancelled: true });
      return;
    }

    for (let i = 0; i < req.frames.length; i++) {
      if (job.cancelled) {
        post({ id: req.id, kind: 'result', ok: false, cancelled: true });
        return;
      }
      const name = `f_${req.id}_${String(i).padStart(5, '0')}.jpg`;
      frameNames.push(name);
      await ff.writeFile(name, new Uint8Array(req.frames[i]));
    }
    if (req.audio) await ff.writeFile(audioName, new Uint8Array(req.audio));

    progressHandler = ({ progress }) => {
      if (progress >= 0 && progress <= 1) post({ id: req.id, kind: 'progress', fraction: progress });
    };
    ff.on('progress', progressHandler);

    // WebM is VP8 + Vorbis: in @ffmpeg/core 0.12.10 libvpx-vp9 (any input)
    // and stereo libopus abort with "memory access out of bounds" (see
    // constants/converterFormats.ts). Realtime/cpu-used 8 is libvpx's
    // counterpart to x264 ultrafast.
    const videoArgs = req.container === 'mp4'
      ? ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p']
      : ['-c:v', 'libvpx', '-crf', '10', '-b:v', '4M', '-deadline', 'realtime', '-cpu-used', '8', '-pix_fmt', 'yuv420p'];
    const audioArgs = req.audio ? (req.container === 'mp4' ? ['-c:a', 'aac'] : ['-c:a', 'libvorbis']) : [];

    if (job.cancelled) {
      post({ id: req.id, kind: 'result', ok: false, cancelled: true });
      return;
    }

    const rc = await ff.exec([
      '-framerate', String(req.fps),
      '-i', `f_${req.id}_%05d.jpg`,
      ...(req.audio ? ['-i', audioName] : []),
      ...videoArgs,
      ...audioArgs,
      ...(req.audio ? ['-shortest'] : []),
      outName,
    ]);
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
    const mime = req.container === 'mp4' ? 'video/mp4' : 'video/webm';
    post({ id: req.id, kind: 'result', ok: true, data: buffer, mime, byteLength: buffer.byteLength }, [buffer]);
  } finally {
    if (progressHandler) ff.off('progress', progressHandler);
    for (const name of frameNames) {
      try { await ff.deleteFile(name); } catch { /* already gone */ }
    }
    if (req.audio) { try { await ff.deleteFile(audioName); } catch { /* already gone */ } }
    try { await ff.deleteFile(outName); } catch { /* already gone */ }
  }
}

async function runNext(): Promise<void> {
  if (running) return;
  const job = queue.shift();
  if (!job) return;
  running = true;

  try {
    await ensureCore();
    const ff = ffmpeg!;
    if (job.req.kind === 'convert') {
      await runConvert(ff, job as Job & { req: ConvertJobRequest });
    } else {
      await runEncodeFrames(ff, job as Job & { req: EncodeFramesRequest });
    }
  } catch (err) {
    post({
      id: job.req.id,
      kind: 'result',
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      code: /load|fetch|network/i.test(String(err)) ? 'CONVERT_CORE_LOAD' : 'CONVERT_FAILED',
    });
  } finally {
    running = false;
    setTimeout(() => void runNext(), 0);
  }
}

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : 'bin';
}

self.onmessage = async (event: MessageEvent<FfmpegWorkerRequest>) => {
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
