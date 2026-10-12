import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { sameOriginGuard } from './security';

function run(guard: ReturnType<typeof sameOriginGuard>, headers: Record<string, string>, path = '/api/x') {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
  const next = vi.fn();
  guard({ headers, path } as unknown as Request, res, next);
  return { next, status: (res.status as unknown as ReturnType<typeof vi.fn>) };
}

describe('sameOriginGuard', () => {
  const loopback = sameOriginGuard(false);

  it('allows same-origin and Origin-less requests on loopback', () => {
    expect(run(loopback, { host: '127.0.0.1:7500', origin: 'http://127.0.0.1:7500' }).next).toHaveBeenCalled();
    expect(run(loopback, { host: 'localhost:7500' }).next).toHaveBeenCalled();
  });

  it('blocks cross-site origins (drive-by access to /api/cdp/*)', () => {
    const r = run(loopback, { host: '127.0.0.1:7500', origin: 'https://evil.example' });
    expect(r.next).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(403);
  });

  it('blocks DNS-rebinding hosts unless a non-loopback HOST was opted into', () => {
    expect(run(loopback, { host: 'evil.example:7500', origin: 'http://evil.example:7500' }).next).not.toHaveBeenCalled();
    const lan = sameOriginGuard(true);
    expect(run(lan, { host: '192.168.1.5:7500', origin: 'http://192.168.1.5:7500' }).next).toHaveBeenCalled();
    expect(run(lan, { host: '192.168.1.5:7500', origin: 'https://evil.example' }).next).not.toHaveBeenCalled();
  });

  it('blocks Origin-less cross-site no-cors requests (e.g. <img src=/api/cdp/screenshot>)', () => {
    const host = '127.0.0.1:7500';
    const img = { host, 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors' };
    expect(run(loopback, img, '/api/cdp/screenshot').next).not.toHaveBeenCalled();
    const nav = { host, 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' };
    expect(run(loopback, nav, '/api/spotify/callback').next).toHaveBeenCalled();
    expect(run(loopback, nav, '/api/cdp/screenshot').next).not.toHaveBeenCalled();
    expect(run(loopback, { host, 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors' }).next).toHaveBeenCalled();
  });
});
