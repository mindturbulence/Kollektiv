import { z } from 'zod';

// POST /api/capture-site (SD-09 "Import from site"). The URL policy itself lives in utils/captureUrlValidation.ts.
export const CaptureSiteRequestSchema = z.object({ url: z.string().min(1).max(2048) }).strict();

/** Stable error codes and the HTTP status each one is sent with. */
export const CAPTURE_ERROR_STATUS = {
  invalid_url: 400,
  forbidden_origin: 403,
  blocked_host: 403,
  too_large: 413,
  rate_limited: 429,
  busy: 429,
  capture_failed: 500,
  unreachable: 502,
  capture_unavailable: 503,
  timeout: 504,
} as const;

export type CaptureErrorCode = keyof typeof CAPTURE_ERROR_STATUS;

export type CaptureSiteResponse =
  | { ok: true; finalUrl: string; title: string; width: number; height: number; imageBase64: string }
  | { ok: false; code: CaptureErrorCode; error: string };
