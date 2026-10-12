import express, { type Request, type RequestHandler, type Response } from "express";
import dns from "dns";
import rateLimit from "express-rate-limit";
import {
  CAPTURE_ERROR_STATUS,
  CaptureSiteRequestSchema,
  type CaptureErrorCode,
  type CaptureSiteResponse,
} from "../src/schemas/captureSite";
import { BlockedHostError, checkCaptureUrl, resolvePublicAddress, type LookupAll } from "../utils/captureUrlValidation";
import type { CloneShot, CloneSiteResponse } from "../src/schemas/cloneSite";
import {
  CAPTURE_MAX_BYTES,
  CaptureError,
  createPlaywrightCapture,
  createPlaywrightClone,
  type CaptureBackend,
  type CloneBackend,
  type CloneShotResult,
} from "../services/siteCapture";

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
  /** Clone a website (CL-1); the route answers 503 capture_unavailable without it. */
  clone?: CloneBackend;
  /** Total budget for DNS + browser capture. */
  deadlineMs?: number;
  /** Clone loads the page twice (desktop + mobile), so it gets a longer budget. */
  cloneDeadlineMs?: number;
}

const shotOf = (s: CloneShotResult): CloneShot => ({ width: s.width, height: s.height, mime: "image/jpeg", imageBase64: s.jpeg.toString("base64") });

/** POST /api/capture-site — screenshot a public web page as a design reference. POST /api/clone-site — screenshots plus measurements. */
export function createCaptureSiteRouter({ lookup, capture, clone, deadlineMs = 30_000, cloneDeadlineMs = 60_000 }: CaptureSiteDeps) {
  const router = express.Router();
  // One shared bucket for the whole server (not per IP: every caller is localhost), shared by both routes.
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 6,
    keyGenerator: () => "capture-site",
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => fail(res, "rate_limited", "Too many captures; wait a minute and try again."),
  });
  // ponytail: one browser job at a time per server (either route), a second caller gets `busy` instead of a queue.
  let inFlight = false;

  /** Validates the body, takes the slot, runs `job` under a deadline; sends the failure itself and returns undefined. */
  async function runExclusive<T>(req: Request, res: Response, budgetMs: number, job: (url: URL, signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
    const body = CaptureSiteRequestSchema.safeParse(req.body);
    if (!body.success) { fail(res, "invalid_url", 'Send JSON { "url": "https://…" }.'); return undefined; }
    const check = checkCaptureUrl(body.data.url);
    if (!check.ok) { fail(res, check.code, check.message); return undefined; }
    if (inFlight) { fail(res, "busy", "Another capture is running; try again when it finishes."); return undefined; }

    inFlight = true;
    const controller = new AbortController();
    const work = resolvePublicAddress(check.url.hostname, lookup).then(() => job(check.url, controller.signal));
    // The slot frees only when the backend has really finished (browser closed), even after a timeout reply.
    void work.catch(() => undefined).finally(() => { inFlight = false; });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new CaptureError("timeout", "The capture took too long."));
      }, budgetMs);
    });
    try {
      return await Promise.race([work, deadline]);
    } catch (e) {
      const [code, message] = errorToFailure(e);
      fail(res, code, message);
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  router.post("/api/capture-site", captureSiteGuard, limiter, async (req, res) => {
    const shot = await runExclusive(req, res, deadlineMs, capture);
    if (!shot) return;
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
  });

  router.post("/api/clone-site", captureSiteGuard, limiter, async (req, res) => {
    if (!clone) return fail(res, "capture_unavailable", "Cloning is not available on this server.");
    const result = await runExclusive(req, res, cloneDeadlineMs, clone);
    if (!result) return;
    if (result.desktop.jpeg.length > CAPTURE_MAX_BYTES || (result.mobile?.jpeg.length ?? 0) > CAPTURE_MAX_BYTES) {
      return fail(res, "too_large", "A screenshot is larger than 8 MB.");
    }
    const ok: CloneSiteResponse = {
      ok: true,
      finalUrl: result.finalUrl,
      title: result.title,
      desktop: shotOf(result.desktop),
      mobile: result.mobile ? shotOf(result.mobile) : null,
      measurements: result.measurements,
    };
    res.json(ok);
  });

  return router;
}

const systemLookup: LookupAll = (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true });

export default createCaptureSiteRouter({
  lookup: systemLookup,
  capture: createPlaywrightCapture(systemLookup),
  clone: createPlaywrightClone(systemLookup),
});
