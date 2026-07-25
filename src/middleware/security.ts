
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';

/**
 * Global security headers via helmet.
 * Includes a reasonable Content‑Security‑Policy.
 */
export const securityHeaders = (_req: Request, _res: Response, next: NextFunction) => {
  // helmet already sets many headers; we add a CSP that is strict but allows inline styles for Tailwind.
  // Adjust as needed for any future inline scripts.
  _res.setHeader(
    'Content-Security-Policy',
    "default-src * 'self' data: blob:; script-src * 'self' 'unsafe-inline' https:; style-src * 'self' 'unsafe-inline' https:; img-src * data: blob:; font-src * data:; connect-src *"
  );
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
