import type http from 'http';
import { createProxyMiddleware, type RequestHandler } from 'http-proxy-middleware';

const DEFAULT_MISSION_CONTROL_PORT = 3100;

/**
 * Resolve the Mission Control origin from environment variables.
 * Exported separately from MISSION_CONTROL_TARGET so it can be tested
 * without mutating process.env.
 */
export function missionControlTargetFromEnv(env: Record<string, string | undefined>): string {
  const raw = env.MISSION_CONTROL_PORT;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  const port = Number.isInteger(parsed) && parsed > 0 && parsed < 65536
    ? parsed
    : DEFAULT_MISSION_CONTROL_PORT;
  return `http://127.0.0.1:${port}`;
}

export const MISSION_CONTROL_TARGET = missionControlTargetFromEnv(process.env);

/**
 * Reverse proxy for the embedded Mission Control app.
 *
 * The path is NOT rewritten: Mission Control runs with basePath '/mission-control',
 * so it expects to receive that prefix.
 */
export function createMissionControlProxy(): RequestHandler {
  return createProxyMiddleware({
    target: MISSION_CONTROL_TARGET,
    changeOrigin: true,
    ws: true,
    // Match paths starting with /mission-control. pathFilter is used instead of
    // Express's app.use('/mission-control', ...) because Express strips the
    // matched prefix from req.url, removing the /mission-control basePath that
    // the MC Next.js server needs for its basePath routing.
    pathFilter: '/mission-control',
    // Mission Control streams activity over SSE. Compression buffers those
    // responses and the stream appears to hang, so it is disabled per-response.
    selfHandleResponse: false,
    on: {
      proxyReq: (proxyReq, req) => {
        const accept = (req.headers as Record<string, string | undefined>).accept;
        if (accept && accept.includes('text/event-stream')) {
          proxyReq.setHeader('accept-encoding', 'identity');
        }
      },
      proxyRes: (proxyRes) => {
        const contentType = proxyRes.headers['content-type'] || '';
        if (contentType.includes('text/event-stream')) {
          proxyRes.headers['cache-control'] = 'no-cache, no-transform';
          delete proxyRes.headers['content-encoding'];
        }
      },
      error: (_err, _req, res) => {
        const anyRes = res as http.ServerResponse;
        if (anyRes && 'writeHead' in anyRes && !anyRes.writableEnded) {
          anyRes.writeHead(502, { 'Content-Type': 'application/json' });
          anyRes.end(JSON.stringify({
            error: 'Mission Control is not running',
            code: 'MISSION_CONTROL_UNREACHABLE',
            hint: `Start it with: pnpm dev:mc (expected at ${MISSION_CONTROL_TARGET})`,
          }));
        }
      },
    },
  });
}

/**
 * Forward WebSocket upgrades for /mission-control to the Next.js process.
 * Express middleware never sees 'upgrade' events, so this must be wired
 * onto the HTTP server directly.
 */
export function attachMissionControlUpgrade(server: http.Server): void {
  const proxy = createMissionControlProxy();
  server.on('upgrade', (req, socket, head) => {
    if (req.url && req.url.startsWith('/mission-control')) {
      (proxy as unknown as {
        upgrade: (r: typeof req, s: typeof socket, h: typeof head) => void;
      }).upgrade(req, socket, head);
    }
  });
}
