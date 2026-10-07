import express, { type RequestHandler, type Response } from "express";
import dns from "dns";
import rateLimit from "express-rate-limit";
import {
  CAPTURE_ERROR_STATUS,
  CaptureSiteRequestSchema,
  type CaptureErrorCode,
  type CaptureSiteResponse,
} from "../src/schemas/captureSite";
import { BlockedHostError, checkCaptureUrl, resolvePublicAddress, type LookupAll } from "../utils/captureUrlValidation";
import { CAPTURE_MAX_BYTES, CaptureError, createPlaywrightCapture, type CaptureBackend } from "../services/siteCapture";

const fail = (res: Response, code: CaptureErrorCode, error: string) => {
  const body: CaptureSiteResponse = { ok: false, code, error };
  res.status(CAPTURE_ERROR_STATUS[code]).json(body);
};

/**
 * CSRF / drive-by guard. Any website the user visits can make their browser POST to localhost, so
 * on top of the global sameOriginGuard (Host allowlist + Origin match): a present Origin must be
 * this server, a present Sec-Fetch-Site must be same-origin (same-site = another localhost port),
 * and the body must be JSON — which a cross-origin page cannot send without a CORS preflight that
 * this server never grants.
 */
export const captureSiteGuard: RequestHandler = (req, res, next) => {
  const origin = req.headers.origin;
  if (origin !== undefined) {
    let originHost: string | null = null;
    try { originHost = new URL(origin).host; } catch { /* malformed → reject */ }
    if (originHost !== req.headers.host) return fail(res, "forbidden_origin", "Cross-origin requests are not allowed.");
  }
  const site = req.headers["sec-fetch-site"];
  if (site !== undefined && site !== "same-origin" && site !== "none") {
    return fail(res, "forbidden_origin", "Cross-site requests are not allowed.");
  }
  if (!req.is("application/json")) return fail(res, "forbidden_origin", "Content-Type must be application/json.");
  next();
};

const errorToFailure = (e: unknown): [CaptureErrorCode, string] => {
  if (e instanceof CaptureError) return [e.code, e.message];
  if (e instanceof BlockedHostError) return ["blocked_host", "That host resolves to a local or private address, which is blocked."];
  const code = typeof e === "object" && e !== null && "code" in e ? String(e.code) : "";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ENODATA") return ["unreachable", "The site’s host name could not be resolved."];
  console.error("[Site capture] failed:", e);
  return ["capture_failed", "The capture failed unexpectedly."];
};

export interface CaptureSiteDeps {
  lookup: LookupAll;
  capture: CaptureBackend;
  /** Total budget for DNS + browser capture. */
  deadlineMs?: number;
}

/** POST /api/capture-site — screenshot a public web page as a design reference. */
export function createCaptureSiteRouter({ lookup, capture, deadlineMs = 30_000 }: CaptureSiteDeps) {
  const router = express.Router();
  // One shared bucket for the whole server (not per IP: every caller is localhost).
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 6,
    keyGenerator: () => "capture-site",
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => fail(res, "rate_limited", "Too many captures; wait a minute and try again."),
  });
  // ponytail: one capture at a time per server, a second caller gets `busy` instead of a queue.
  let inFlight = false;

  router.post("/api/capture-site", captureSiteGuard, limiter, async (req, res) => {
    const body = CaptureSiteRequestSchema.safeParse(req.body);
    if (!body.success) return fail(res, "invalid_url", 'Send JSON { "url": "https://…" }.');
    const check = checkCaptureUrl(body.data.url);
    if (!check.ok) return fail(res, check.code, check.message);
    if (inFlight) return fail(res, "busy", "Another capture is running; try again when it finishes.");

    inFlight = true;
    const controller = new AbortController();
    const work = resolvePublicAddress(check.url.hostname, lookup).then(() => capture(check.url, controller.signal));
    // The slot frees only when the backend has really finished (browser closed), even after a timeout reply.
    void work.catch(() => undefined).finally(() => { inFlight = false; });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new CaptureError("timeout", "The capture took too long."));
      }, deadlineMs);
    });
    try {
      const shot = await Promise.race([work, deadline]);
      if (shot.png.length > CAPTURE_MAX_BYTES) return fail(res, "too_large", "The screenshot is larger than 8 MB.");
      const ok: CaptureSiteResponse = {
        ok: true,
        finalUrl: shot.finalUrl,
        title: shot.title,
        width: shot.width,
        height: shot.height,
        imageBase64: shot.png.toString("base64"),
      };
      res.json(ok);
    } catch (e) {
      const [code, message] = errorToFailure(e);
      fail(res, code, message);
    } finally {
      clearTimeout(timer);
    }
  });

  return router;
}

const systemLookup: LookupAll = (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true });

export default createCaptureSiteRouter({ lookup: systemLookup, capture: createPlaywrightCapture(systemLookup) });
