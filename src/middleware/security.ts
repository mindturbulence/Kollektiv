
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';

// Dev CSP: permissive by design — see docs/handbook/docs/00_FOUNDATION/ARCHITECTURE_CONSTITUTION.md
// § Security Hardening for the per-directive rationale (blob: worklet, wasm-unsafe-eval for RNNoise/VAD, etc).
const DEV_CSP =
  "default-src * data: blob:; script-src * 'unsafe-inline' https: blob: 'unsafe-eval'; style-src * 'unsafe-inline' https:; img-src * data: blob: https:; font-src * data:; connect-src * https: wss: http://localhost:* http://127.0.0.1:*; frame-src *";

// Prod CSP: scoped to this app's actual dependencies (see the handbook section
// referenced above). Shipped as Report-Only until a real production build has
// been walked through end-to-end (chat, voice assistant, local model config,
// Spotify/YouTube tools, Google Sign-In) with zero unexpected violations — see ISSUE-30.
const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self' blob: 'wasm-unsafe-eval' https://accounts.google.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://db.onlinewebfonts.com https://api.fontshare.com",
  "font-src 'self' data: https://fonts.gstatic.com https://cdn.fontshare.com https://db.onlinewebfonts.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://openrouter.ai https://generativelanguage.googleapis.com https://www.googleapis.com https://wttr.in https://accounts.spotify.com https://api.spotify.com wss://generativelanguage.googleapis.com http://localhost:* http://127.0.0.1:*",
  "frame-src https://accounts.google.com",
].join('; ');

/**
 * Global security headers via helmet.
 * Includes a reasonable Content‑Security‑Policy.
 */
export const securityHeaders = (_req: Request, _res: Response, next: NextFunction) => {
  const isProd = process.env.NODE_ENV === 'production';
  // Report-Only in prod: logs violations without blocking, until the scoped
  // policy above is validated against real traffic. Switch to the enforced
  // 'Content-Security-Policy' header once ISSUE-30's checks are clean.
  const headerName = isProd ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
  _res.setHeader(headerName, isProd ? PROD_CSP : DEV_CSP);
  next();
};

// Global rate limiter – applied to all routes except those we explicitly exempt later.
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per window
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter limiter for auth‑sensitive endpoints (OpenAI token, Anthropic, Topaz).
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Allow internal CI or localhost IPs to bypass the strict limit.
    const host = req.ip || '';
    // req.ip may be IPv4‑mapped IPv6 like ::ffff:127.0.0.1
    if (host === '127.0.0.1' || host === '::1' || host.includes('127.0.0.1')) return true;
    return false;
  },
});

// Helper to apply CORS with a configurable allowed origin (defaults to local dev).
export const corsOptions = cors({
  origin: true,
  credentials: true,
});
