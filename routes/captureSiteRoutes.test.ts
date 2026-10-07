// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { createCaptureSiteRouter, type CaptureSiteDeps } from './captureSiteRoutes';
import { CAPTURE_MAX_BYTES, CaptureError, type CaptureBackend, type CaptureResult } from '../services/siteCapture';
import type { LookupAll } from '../utils/captureUrlValidation';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const shot = (over: Partial<CaptureResult> = {}): CaptureResult => ({
  finalUrl: 'https://www.example.com/', title: 'Example', width: 1440, height: 2000, png: PNG, ...over,
});
const publicLookup: LookupAll = vi.fn(async () => [{ address: '93.184.215.14' }]);

let server: Server | null = null;
afterEach(async () => {
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
});

async function start(deps: Partial<CaptureSiteDeps> & { capture: CaptureBackend }) {
  const app = express();
  app.use(express.json());
  app.use(createCaptureSiteRouter({ lookup: publicLookup, ...deps }));
  await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
  const base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  const post = async (body: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(`${base}/api/capture-site`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  return { base, post };
}

/** A backend whose promise the test settles by hand; it also settles (rejects) when aborted. */
function controllable() {
  let finish: (r: CaptureResult) => void = () => undefined;
  const signals: AbortSignal[] = [];
  const capture: CaptureBackend = vi.fn((_url: URL, signal: AbortSignal) => {
    signals.push(signal);
    return new Promise<CaptureResult>((resolve) => { finish = resolve; });
  });
  return { capture, signals, finish: (r: CaptureResult = shot()) => finish(r) };
}

describe('POST /api/capture-site', () => {
  it('returns the PNG as base64 with the final URL, title and size', async () => {
    const capture = vi.fn<CaptureBackend>(async () => shot());
    const lookup: LookupAll = vi.fn(async () => [{ address: '93.184.215.14' }]);
    const { post } = await start({ capture, lookup });
    const r = await post({ url: 'https://Example.com/a' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, finalUrl: 'https://www.example.com/', title: 'Example', width: 1440, height: 2000, imageBase64: PNG.toString('base64') });
    expect(lookup).toHaveBeenCalledWith('example.com');
    expect(capture.mock.calls[0][0].href).toBe('https://example.com/a');
  });

  describe('origin / CSRF guard', () => {
    const ok = () => vi.fn<CaptureBackend>(async () => shot());

    it.each([
      [{ origin: 'https://evil.example' }],
      [{ origin: 'http://localhost:5173' }], // another local app on a different port
      [{ origin: 'null' }],
      [{ 'sec-fetch-site': 'cross-site' }],
      [{ 'sec-fetch-site': 'same-site' }],
      [{ 'content-type': 'text/plain' }], // a cross-site <form> / simple request
      [{ 'content-type': 'application/x-www-form-urlencoded' }],
    ])('rejects %j with forbidden_origin', async (headers) => {
      const capture = ok();
      const { post } = await start({ capture });
      const r = await post({ url: 'https://example.com' }, headers);
      expect(r).toMatchObject({ status: 403, body: { ok: false, code: 'forbidden_origin' } });
      expect(capture).not.toHaveBeenCalled();
    });

    it('accepts same-origin and Origin-less JSON requests', async () => {
      const capture = ok();
      const { base, post } = await start({ capture });
      expect((await post({ url: 'https://example.com' }, { origin: base, 'sec-fetch-site': 'same-origin' })).status).toBe(200);
      expect((await post({ url: 'https://example.com' })).status).toBe(200);
      expect((await post({ url: 'https://example.com' }, { 'content-type': 'application/json; charset=utf-8' })).status).toBe(200);
    });
  });

  it.each([
    [{}], [{ url: 5 }], [{ url: '' }], [{ url: 'https://example.com', extra: 1 }], [{ url: `https://example.com/${'a'.repeat(2100)}` }],
  ])('rejects body %j with invalid_url', async (body) => {
    const capture = vi.fn<CaptureBackend>(async () => shot());
    const { post } = await start({ capture });
    expect(await post(body)).toMatchObject({ status: 400, body: { ok: false, code: 'invalid_url' } });
    expect(capture).not.toHaveBeenCalled();
  });

  it.each([
    ['ftp://example.com/', 400, 'invalid_url'],
    ['javascript:alert(1)', 400, 'invalid_url'],
    ['http://user:pw@example.com/', 400, 'invalid_url'],
    ['http://127.0.0.1:7500/', 403, 'blocked_host'],
    ['http://2130706433/', 403, 'blocked_host'],
    ['http://169.254.169.254/latest/meta-data/', 403, 'blocked_host'],
    ['http://[::ffff:127.0.0.1]/', 403, 'blocked_host'],
    ['http://localhost/', 403, 'blocked_host'],
    ['https://example.com:8443/', 403, 'blocked_host'],
  ])('refuses %s before DNS or capture (%i %s)', async (url, status, code) => {
    const capture = vi.fn<CaptureBackend>(async () => shot());
    const lookup: LookupAll = vi.fn(async () => [{ address: '93.184.215.14' }]);
    const { post } = await start({ capture, lookup });
    expect(await post({ url })).toMatchObject({ status, body: { ok: false, code } });
    expect(lookup).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it('refuses a name that resolves to a private address (DNS re-check) without capturing', async () => {
    const capture = vi.fn<CaptureBackend>(async () => shot());
    const { post } = await start({ capture, lookup: async () => [{ address: '93.184.215.14' }, { address: '10.0.0.7' }] });
    expect(await post({ url: 'https://rebind.example.com' })).toMatchObject({ status: 403, body: { code: 'blocked_host' } });
    expect(capture).not.toHaveBeenCalled();
  });

  it('reports unresolvable hosts as unreachable', async () => {
    const lookup: LookupAll = async () => { throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }); };
    const { post } = await start({ capture: vi.fn<CaptureBackend>(async () => shot()), lookup });
    expect(await post({ url: 'https://no-such-host.example' })).toMatchObject({ status: 502, body: { code: 'unreachable' } });
  });

  it.each([
    ['capture_unavailable', 503, 'No Chrome, Chromium or Edge could be started on the server.'],
    ['blocked_host', 403, 'redirected to a private address'],
    ['unreachable', 502, 'The page could not be loaded.'],
    ['timeout', 504, 'The page took too long to load.'],
    ['too_large', 413, 'too big'],
  ] as const)('passes backend %s through as %i with its message', async (code, status, message) => {
    const { post } = await start({ capture: async () => { throw new CaptureError(code, message); } });
    expect(await post({ url: 'https://example.com' })).toEqual({ status, body: { ok: false, code, error: message } });
  });

  it('maps unexpected backend errors to capture_failed without leaking the message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { post } = await start({ capture: async () => { throw new Error('Target page crashed at C:\\secret\\path'); } });
    const r = await post({ url: 'https://example.com' });
    expect(r).toMatchObject({ status: 500, body: { ok: false, code: 'capture_failed' } });
    expect(JSON.stringify(r.body)).not.toContain('secret');
  });

  it('enforces the 8 MB response cap', async () => {
    const { post } = await start({ capture: async () => shot({ png: Buffer.alloc(CAPTURE_MAX_BYTES + 1) }) });
    expect(await post({ url: 'https://example.com' })).toMatchObject({ status: 413, body: { code: 'too_large' } });
  });

  it('allows one capture at a time (busy), and frees the slot when it ends', async () => {
    const backend = controllable();
    const { post } = await start({ capture: backend.capture });
    const first = post({ url: 'https://example.com' });
    await vi.waitFor(() => expect(backend.capture).toHaveBeenCalledTimes(1));
    expect(await post({ url: 'https://example.org' })).toMatchObject({ status: 429, body: { code: 'busy' } });
    backend.finish();
    expect((await first).status).toBe(200);
    const again = post({ url: 'https://example.net' });
    await vi.waitFor(() => expect(backend.capture).toHaveBeenCalledTimes(2));
    backend.finish();
    expect((await again).status).toBe(200);
  });

  it('frees the slot after a failed capture', async () => {
    const capture = vi.fn<CaptureBackend>()
      .mockRejectedValueOnce(new CaptureError('unreachable', 'x'))
      .mockResolvedValueOnce(shot());
    const { post } = await start({ capture });
    expect((await post({ url: 'https://example.com' })).status).toBe(502);
    expect((await post({ url: 'https://example.com' })).status).toBe(200);
  });

  it('times out, aborts the backend, and stays busy until the backend has cleaned up', async () => {
    const backend = controllable();
    const { post } = await start({ capture: backend.capture, deadlineMs: 50 });
    expect(await post({ url: 'https://example.com' })).toMatchObject({ status: 504, body: { code: 'timeout' } });
    expect(backend.signals[0].aborted).toBe(true);
    // Backend has not finished closing its browser yet → still one capture "in flight".
    expect(await post({ url: 'https://example.com' })).toMatchObject({ status: 429, body: { code: 'busy' } });
    backend.finish(); // cleanup done
    await new Promise((r) => setTimeout(r, 10));
    const next = post({ url: 'https://example.com' });
    await vi.waitFor(() => expect(backend.capture).toHaveBeenCalledTimes(2));
    backend.finish();
    expect((await next).status).toBe(200);
  });

  it('rate limits to 6 captures per minute for the whole server', async () => {
    const capture = vi.fn<CaptureBackend>(async () => shot());
    const { post } = await start({ capture });
    for (let i = 0; i < 6; i++) expect((await post({ url: 'https://example.com' })).status).toBe(200);
    expect(await post({ url: 'https://example.com' })).toMatchObject({ status: 429, body: { ok: false, code: 'rate_limited' } });
    expect(capture).toHaveBeenCalledTimes(6);
  });
});
