// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import http from 'http';
import net from 'net';
import type { AddressInfo } from 'net';
import {
  CAPTURE_MAX_BYTES,
  CaptureError,
  createPlaywrightCapture,
  navigationErrorCode,
  startFilteringProxy,
  type FilteringProxy,
} from './siteCapture';
import { BlockedHostError, resolvePublicAddress } from '../utils/captureUrlValidation';

const pw = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock('playwright-core', () => ({ chromium: { launch: pw.launch } }));

describe('createPlaywrightCapture (browser mocked)', () => {
  const lookup = vi.fn(async () => [{ address: '93.184.215.14' }]);

  function fakeBrowser(page: Record<string, unknown> = {}) {
    const fullPage = {
      goto: vi.fn(async () => null),
      url: vi.fn(() => 'https://www.example.com/'),
      waitForLoadState: vi.fn(async () => undefined),
      evaluate: vi.fn(async () => 99999),
      mouse: { move: vi.fn(async () => undefined), wheel: vi.fn(async () => undefined) },
      waitForTimeout: vi.fn(async () => undefined),
      screenshot: vi.fn(async () => Buffer.from('png')),
      title: vi.fn(async () => `  ${'T'.repeat(300)}  `),
      ...page,
    };
    const browser = {
      newContext: vi.fn(async () => ({ newPage: async () => fullPage, on: vi.fn() })),
      close: vi.fn(async () => undefined),
    };
    return { browser, page: fullPage };
  }

  /** The proxy port the backend handed to the browser; after the capture it must refuse connections. */
  const proxyPortOf = () => Number(new URL(pw.launch.mock.calls[0][0].proxy.server).port);
  const isListening = (port: number) => new Promise<boolean>((done) => {
    const s = net.connect(port, '127.0.0.1', () => { s.destroy(); done(true); });
    s.on('error', () => done(false));
  });

  afterEach(() => pw.launch.mockReset());

  it('launches a sandboxed browser behind the loopback-proxied filter and returns a clamped full-page PNG', async () => {
    const { browser, page } = fakeBrowser();
    pw.launch.mockResolvedValue(browser);
    const r = await createPlaywrightCapture(lookup)(new URL('https://example.com/'), new AbortController().signal);
    expect(r).toMatchObject({ finalUrl: 'https://www.example.com/', width: 1440, height: 4500 });
    expect(r.title).toBe('T'.repeat(200));
    const opts = pw.launch.mock.calls[0][0];
    expect(opts).toMatchObject({ headless: true, chromiumSandbox: true, proxy: { bypass: '<-loopback>' } });
    expect(opts.args).toContain('--force-webrtc-ip-handling-policy=disable_non_proxied_udp');
    expect(page.screenshot).toHaveBeenCalledWith(expect.objectContaining({ fullPage: true, clip: { x: 0, y: 0, width: 1440, height: 4500 } }));
    expect(browser.close).toHaveBeenCalled();
    expect(await isListening(proxyPortOf())).toBe(false);
  });

  it('falls back to the first screen when the full page PNG is over the cap', async () => {
    const screenshot = vi.fn()
      .mockResolvedValueOnce(Buffer.alloc(CAPTURE_MAX_BYTES + 1))
      .mockResolvedValueOnce(Buffer.from('small'));
    pw.launch.mockResolvedValue(fakeBrowser({ screenshot }).browser);
    const r = await createPlaywrightCapture(lookup)(new URL('https://example.com/'), new AbortController().signal);
    expect(r.height).toBe(900);
    expect(r.png.toString()).toBe('small');
  });

  it('reports capture_unavailable after trying Chromium, Edge and Chrome', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    pw.launch.mockRejectedValue(new Error("Executable doesn't exist"));
    const run = createPlaywrightCapture(lookup)(new URL('https://example.com/'), new AbortController().signal);
    await expect(run).rejects.toMatchObject({ code: 'capture_unavailable' });
    expect(pw.launch.mock.calls.map((c) => c[0].channel)).toEqual([undefined, 'msedge', 'chrome']);
    expect(await isListening(proxyPortOf())).toBe(false);
  });

  it('does not fall through to other browsers when one starts too slowly', async () => {
    pw.launch.mockRejectedValue(Object.assign(new Error('Timeout 15000ms exceeded'), { name: 'TimeoutError' }));
    const run = createPlaywrightCapture(lookup)(new URL('https://example.com/'), new AbortController().signal);
    await expect(run).rejects.toMatchObject({ code: 'timeout' });
    expect(pw.launch).toHaveBeenCalledTimes(1);
  });

  it('stops trying browsers once the caller has aborted', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const controller = new AbortController();
    pw.launch.mockImplementation(async () => { controller.abort(); throw new Error("Executable doesn't exist"); });
    const run = createPlaywrightCapture(lookup)(new URL('https://example.com/'), controller.signal);
    await expect(run).rejects.toMatchObject({ code: 'timeout' });
    expect(pw.launch).toHaveBeenCalledTimes(1);
    expect(await isListening(proxyPortOf())).toBe(false);
  });

  it.each([
    [Object.assign(new Error('Timeout 20000ms exceeded'), { name: 'TimeoutError' }), 'timeout'],
    [new Error('net::ERR_CONNECTION_REFUSED'), 'unreachable'],
  ])('closes browser and proxy when navigation fails (%s)', async (err, code) => {
    const { browser } = fakeBrowser({ goto: vi.fn(async () => { throw err; }), url: () => 'about:blank' });
    pw.launch.mockResolvedValue(browser);
    const run = createPlaywrightCapture(lookup)(new URL('https://example.com/'), new AbortController().signal);
    await expect(run).rejects.toBeInstanceOf(CaptureError);
    await expect(run).rejects.toMatchObject({ code });
    expect(browser.close).toHaveBeenCalled();
    expect(await isListening(proxyPortOf())).toBe(false);
  });

  it('refuses a page that ended on a blocked URL', async () => {
    const { browser, page } = fakeBrowser({ url: () => 'http://127.0.0.1:7500/' });
    pw.launch.mockResolvedValue(browser);
    const run = createPlaywrightCapture(lookup)(new URL('https://example.com/'), new AbortController().signal);
    await expect(run).rejects.toMatchObject({ code: 'unreachable' });
    expect(page.screenshot).not.toHaveBeenCalled();
    expect(browser.close).toHaveBeenCalled();
  });

  it('closes the browser as soon as the caller aborts', async () => {
    let release: () => void = () => undefined;
    const goto = vi.fn(() => new Promise((r) => { release = () => r(null); }));
    const { browser } = fakeBrowser({ goto });
    pw.launch.mockResolvedValue(browser);
    const controller = new AbortController();
    const run = createPlaywrightCapture(lookup)(new URL('https://example.com/'), controller.signal);
    await vi.waitFor(() => expect(goto).toHaveBeenCalled());
    controller.abort();
    expect(browser.close).toHaveBeenCalled();
    release();
    await run.catch(() => undefined);
    expect(await isListening(proxyPortOf())).toBe(false);
  });
});

describe('navigationErrorCode', () => {
  it.each([
    [{ failed: false, finalUrl: 'https://example.com/', blockedCount: 0 }, null],
    [{ failed: false, finalUrl: 'https://example.com/', blockedCount: 3 }, null], // blocked sub-resources only
    [{ failed: true, finalUrl: 'about:blank', blockedCount: 1 }, 'blocked_host'], // redirect hop refused by the proxy
    [{ failed: true, finalUrl: 'about:blank', blockedCount: 0 }, 'unreachable'], // e.g. connection refused, TLS error
    [{ failed: false, finalUrl: 'http://127.0.0.1:7500/', blockedCount: 1 }, 'blocked_host'], // script navigation to loopback
    [{ failed: false, finalUrl: 'chrome-error://chromewebdata/', blockedCount: 1 }, 'blocked_host'],
    [{ failed: false, finalUrl: 'chrome-error://chromewebdata/', blockedCount: 0 }, 'unreachable'],
  ])('%j → %s', (nav, code) => expect(navigationErrorCode(nav)).toBe(code));
});

describe('startFilteringProxy', () => {
  // Stand-in for a public site. Tests point vetted names at it via `resolve`, so the proxy connecting
  // to it proves it dials the vetted address and never resolves the (fake) name itself.
  let upstream: http.Server;
  let upstreamPort: number;
  const seen: { host?: string; url?: string }[] = [];
  let proxy: FilteringProxy | null = null;

  beforeAll(async () => {
    upstream = http.createServer((req, res) => {
      seen.push({ host: req.headers.host, url: req.url });
      if (req.url === '/redirect') {
        res.writeHead(302, { location: `http://internal.test:${upstreamPort}/secret` }).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/plain' }).end('public page');
    });
    await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', () => r()));
    upstreamPort = (upstream.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => upstream.close(() => r())));
  afterEach(async () => {
    seen.length = 0;
    await proxy?.close();
    proxy = null;
  });

  const resolver = () => vi.fn(async (host: string) => {
    if (host === 'site.test') return '127.0.0.1';
    if (host === 'nxdomain.test') throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
    throw new BlockedHostError(host);
  });
  const start = async (resolve: (h: string) => Promise<string>) => {
    proxy = await startFilteringProxy(resolve, new Set([upstreamPort]));
    return proxy;
  };

  /** A plain-HTTP request the way Chromium sends it to an HTTP proxy (absolute URI). */
  const viaProxy = (p: FilteringProxy, target: string) =>
    new Promise<{ status: number; body: string; location?: string } | 'dropped'>((done) => {
      const req = http.request({ host: '127.0.0.1', port: p.port, path: target, agent: false, headers: { host: new URL(target).host } }, (res) => {
        let body = '';
        res.on('data', (c: Buffer) => { body += c.toString(); });
        res.on('end', () => done({ status: res.statusCode ?? 0, body, location: res.headers.location }));
      });
      req.on('error', () => done('dropped'));
      req.end();
    });

  /** CONNECT the way Chromium opens HTTPS/WebSocket tunnels; returns the proxy's status and the socket. */
  const connect = (p: FilteringProxy, authority: string) =>
    new Promise<{ status: number; socket: net.Socket }>((done, fail) => {
      const req = http.request({ host: '127.0.0.1', port: p.port, method: 'CONNECT', path: authority, agent: false });
      req.on('connect', (res, socket) => done({ status: res.statusCode ?? 0, socket }));
      req.on('error', fail);
      req.end();
    });

  it('forwards plain HTTP to the vetted address with the original Host header', async () => {
    const resolve = resolver();
    const p = await start(resolve);
    const r = await viaProxy(p, `http://site.test:${upstreamPort}/page?x=1`);
    expect(r).toEqual({ status: 200, body: 'public page', location: undefined });
    expect(resolve).toHaveBeenCalledWith('site.test');
    expect(seen).toEqual([{ host: `site.test:${upstreamPort}`, url: '/page?x=1' }]);
    expect(p.blockedCount()).toBe(0);
  });

  it('re-validates every redirect hop: the hop to a blocked host is refused', async () => {
    const p = await start(resolver());
    const first = await viaProxy(p, `http://site.test:${upstreamPort}/redirect`);
    expect(first).toMatchObject({ status: 302, location: `http://internal.test:${upstreamPort}/secret` });
    // The browser follows the redirect with a new proxy request, which the proxy vets again.
    expect(await viaProxy(p, `http://internal.test:${upstreamPort}/secret`)).toBe('dropped');
    expect(seen.map((s) => s.url)).toEqual(['/redirect']);
    expect(p.blockedCount()).toBe(1);
  });

  it('refuses ports outside the allowlist without resolving', async () => {
    const resolve = resolver();
    const p = await start(resolve);
    expect(await viaProxy(p, 'http://site.test:8080/')).toBe('dropped');
    expect((await connect(p, 'site.test:8443')).status).toBe(403);
    expect(resolve).not.toHaveBeenCalled();
    expect(p.blockedCount()).toBe(2);
  });

  it('refuses non-http absolute URIs', async () => {
    const p = await start(resolver());
    expect(await viaProxy(p, `ftp://site.test:${upstreamPort}/`)).toBe('dropped');
    expect(p.blockedCount()).toBe(1);
  });

  it('tunnels CONNECT to the vetted address', async () => {
    const p = await start(resolver());
    const { status, socket } = await connect(p, `site.test:${upstreamPort}`);
    expect(status).toBe(200);
    const reply = await new Promise<string>((done) => {
      let data = '';
      socket.on('data', (c: Buffer) => { data += c.toString(); if (data.includes('public page')) done(data); });
      socket.write(`GET /tunnel HTTP/1.1\r\nHost: site.test\r\nConnection: close\r\n\r\n`);
    });
    expect(reply).toContain('200 OK');
    expect(seen).toEqual([{ host: 'site.test', url: '/tunnel' }]);
    socket.destroy();
  });

  it('answers 403 to CONNECT for blocked hosts, including IP literals and rebinding names (production resolver)', async () => {
    const lookup = vi.fn(async (host: string) => [{ address: host === 'rebind.test' ? '93.184.215.14' : '8.8.8.8' }, { address: '127.0.0.1' }]);
    const p = await start((h) => resolvePublicAddress(h, lookup));
    for (const authority of ['rebind.test', '127.0.0.1', '[::1]', '[::ffff:7f00:1]', '169.254.169.254', 'localhost', 'printer.local']) {
      expect((await connect(p, `${authority}:${upstreamPort}`)).status).toBe(403);
    }
    expect(p.blockedCount()).toBe(7);
    expect(lookup).toHaveBeenCalledTimes(1); // only the real name needed DNS
    expect(seen).toEqual([]);
  });

  it('refuses names that fail DNS without counting them as blocked', async () => {
    const p = await start(resolver());
    expect((await connect(p, `nxdomain.test:${upstreamPort}`)).status).toBe(403);
    expect(p.blockedCount()).toBe(0);
  });

  it('close() tears down open tunnels', async () => {
    const p = await start(resolver());
    const { socket } = await connect(p, `site.test:${upstreamPort}`);
    const closed = new Promise<void>((r) => socket.on('close', () => r()));
    await p.close();
    proxy = null;
    await closed;
    expect(socket.destroyed).toBe(true);
  });
});
