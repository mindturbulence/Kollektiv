/**
 * Worker message protocol (plan S1/E1).
 *
 * Request:  { id, kind:'convert'|'cancel', ... }
 * Response: { id, kind:'result'|'progress', ... }
 * ArrayBuffers are transferred, not Blobs.
 */

export interface ConvertRequestBase {
  /** Job id — also the cancel key. */
  id: string;
  kind: 'convert';
  /** Source bytes; transferred into the worker. */
  data: ArrayBuffer;
  /** Original file name (naming/log only; the worker never writes to disk). */
  fileName: string;
  targetId: string;
  /** 0-100; engine-specific meaning. */
  quality?: number;
  /** Longest output side in px (images and non-GIF video); only ever shrinks. */
  maxEdge?: number;
}

export interface CancelRequest {
  id: string;
  kind: 'cancel';
}

/**
 * No-op request that only exercises core loading (ffmpeg ~32MB lazy fetch or
 * magick init). Never touches real data — used by audioVideoConverter.preload()
 * to warm the engine and report load success/failure without a fake convert job.
 */
export interface ProbeRequest {
  id: string;
  kind: 'probe';
}

/**
 * Video-export ffmpeg fallback (plan §4/§7 export, WebCodecs unavailable):
 * one JPEG per output frame plus an optional WAV mixdown, muxed into an
 * mp4/webm through the same serial queue as ordinary convert jobs.
 */
export interface EncodeFramesRequest {
  id: string;
  kind: 'encodeFrames';
  /** One JPEG-encoded frame per output frame, in order; transferred into the worker. */
  frames: ArrayBuffer[];
  fps: number;
  container: 'mp4' | 'webm';
  /** WAV bytes (PCM16); omitted when the export has no audible clips. */
  audio?: ArrayBuffer;
}

export type WorkerRequest = ConvertRequestBase | CancelRequest | ProbeRequest;

/** ffmpegWorker.ts only — convertWorker.ts (magick) never receives encodeFrames jobs. */
export type FfmpegWorkerRequest = WorkerRequest | EncodeFramesRequest;

export interface WorkerProgress {
  id: string;
  kind: 'progress';
  /** 0-1. */
  fraction: number;
}

export interface WorkerSuccess {
  id: string;
  kind: 'result';
  ok: true;
  data: ArrayBuffer;
  /** Output MIME for the object URL. */
  mime: string;
  byteLength: number;
}

export interface WorkerFailure {
  id: string;
  kind: 'result';
  ok: false;
  error: string;
  /** Structured error code — maps to suggestions in the UI layer. */
  code: string;
}

export interface WorkerCancelled {
  id: string;
  kind: 'result';
  ok: false;
  cancelled: true;
}

export interface WorkerProbeResult {
  id: string;
  kind: 'probe-result';
  ok: boolean;
  error?: string;
  code?: string;
}

export type WorkerResponse = WorkerProgress | WorkerSuccess | WorkerFailure | WorkerCancelled | WorkerProbeResult;

/** Error codes surfaced through the converter UI (AppError-style codes). */
export const CONVERT_ERROR_CODES = {
  WASM_INIT: 'CONVERT_WASM_INIT',
  CONVERT: 'CONVERT_FAILED',
  CANCELLED: 'CONVERT_CANCELLED',
  CORE_LOAD: 'CONVERT_CORE_LOAD',
  TIMEOUT: 'CONVERT_TIMEOUT',
} as const;
