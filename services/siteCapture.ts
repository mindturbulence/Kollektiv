/**
 * Site capture backend for "Import from site" (SD-09).
 *
 * Launches its OWN headless Chromium through playwright-core (bundled Chromium, else installed Edge,
 * else Chrome). Playwright drives it over --remote-debugging-pipe (no debug port) with a throwaway
 * profile it deletes on close, so the user's browser, tabs, cookies and the /api/cdp/* bridge are
 * never touched.
 *
 * All browser traffic goes through `startFilteringProxy`: every page load, redirect hop,
 * sub-resource and WebSocket is a separate proxy request, whose host is resolved and vetted here
 * and then connected to by that exact IP — the browser never resolves names itself, so DNS
 * rebinding between check and connect is not possible.
 */
import http from 'http';
import net from 'net';
import type { AddressInfo } from 'net';
import type { Browser, Page } from 'playwright-core';
import {
  BlockedHostError,
  CAPTURE_ALLOWED_PORTS,
  checkCaptureUrl,
  resolvePublicAddress,
  type LookupAll,
} from '../utils/captureUrlValidation';
import type { CaptureErrorCode } from '../src/schemas/captureSite';
import type { PageMeasurements } from '../src/schemas/cloneSite';
import { HIDE_OVERLAYS_SCRIPT, MEASURE_SCRIPT, sanitizeMeasurements } from './siteMeasure';

export class CaptureError extends Error {
  constructor(readonly code: CaptureErrorCode, message: string) {
    super(message);
    this.name = 'CaptureError';
  }
}

export interface CaptureResult {
  finalUrl: string;
  title: string;
  width: number;
  height: number;
  png: Buffer;
}

/** Captures `url`; must stop work and release the browser once `signal` aborts. */
export type CaptureBackend = (url: URL, signal: AbortSignal) => Promise<CaptureResult>;

export const CAPTURE_VIEWPORT = { width: 1440, height: 900 } as const;
export const CAPTURE_MAX_HEIGHT = 4500;
export const CAPTURE_MAX_BYTES = 8 * 1024 * 1024;
const NAV_TIMEOUT_MS = 20_000;

export interface FilteringProxy {
  port: number;
  /** How many requests were refused for policy reasons (blocked host or port). */
  blockedCount: () => number;
  close: () => Promise<void>;
}

/**
 * HTTP forward proxy on 127.0.0.1 (random port) that only lets the capture browser reach public
 * hosts on ports 80/443. `resolve` returns the vetted address to connect to, or throws
 * BlockedHostError. Refusals are network errors to the browser (403 to CONNECT, dropped
 * connection for plain HTTP), so a blocked main-frame navigation makes `page.goto` fail.
 * `allowedPorts` is only overridden by tests (they cannot bind 80/443).
 */
export function startFilteringProxy(
  resolve: (hostname: string) => Promise<string>,
  allowedPorts: ReadonlySet<number> = CAPTURE_ALLOWED_PORTS,
): Promise<FilteringProxy> {
  let blocked = 0;
  const clients = new Set<net.Socket>();
  const server = http.createServer();

  const vet = async (hostname: string, port: number): Promise<string | null> => {
    if (!allowedPorts.has(port)) {
      blocked++;
      return null;
    }
    try {
      return await resolve(hostname);
    } catch (e) {
      if (e instanceof BlockedHostError) blocked++;
      return null;
    }
  };

  server.on('connection', (socket: net.Socket) => {
    clients.add(socket);
    socket.on('close', () => clients.delete(socket));
  });

  // HTTPS and WebSockets: CONNECT host:port, then a raw tunnel to the vetted IP.
  server.on('connect', (req: http.IncomingMessage, client: net.Socket, head: Buffer) => {
    client.on('error', () => client.destroy());
    let dest: URL;
    try {
      dest = new URL(`http://${req.url ?? ''}`);
    } catch {
      client.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }
    const port = dest.port ? Number(dest.port) : 80;
    void vet(dest.hostname, port).then((ip) => {
      if (!ip) {
        client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
        return;
      }
      const upstream = net.connect(port, ip, () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length > 0) upstream.write(head);
        upstream.pipe(client);
        client.pipe(upstream);
      });
      upstream.on('error', () => client.destroy());
      client.on('close', () => upstream.destroy());
    });
  });

  // Plain HTTP: absolute-URI request, forwarded to the vetted IP with the original Host header.
  server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {
    let target: URL;
    try {
      target = new URL(req.url ?? '');
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (target.protocol !== 'http:') {
      blocked++;
      req.socket.destroy();
      return;
    }
    const port = target.port ? Number(target.port) : 80;
    void vet(target.hostname, port).then((ip) => {
      if (!ip) {
        req.socket.destroy();
        return;
      }
      const headers: http.OutgoingHttpHeaders = { ...req.headers, host: target.host };
      delete headers['proxy-connection'];
      delete headers['proxy-authorization'];
      const upstream = http.request(
        { host: ip, port, method: req.method, path: `${target.pathname}${target.search}`, headers, setHost: false },
        (upRes) => {
          res.writeHead(upRes.statusCode ?? 502, upRes.headers);
          upRes.pipe(res);
        },
      );
      upstream.on('error', () => req.socket.destroy());
      res.on('close', () => upstream.destroy());
      req.pipe(upstream);
    });
  });

  return new Promise((ready, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      ready({
        port: (server.address() as AddressInfo).port,
        blockedCount: () => blocked,
        close: () =>
          new Promise<void>((done) => {
            for (const socket of clients) socket.destroy();
            server.close(() => done());
          }),
      });
    });
  });
}

/**
 * Decides whether a finished navigation is usable. A failed main-frame load after the proxy refused
 * something, or a final URL that is no longer an allowed public URL (a redirect or script
 * navigation to a blocked host, or Chrome's error page), is reported instead of screenshotted.
 */
export function navigationErrorCode(nav: { failed: boolean; finalUrl: string; blockedCount: number }): CaptureErrorCode | null {
  if (!nav.failed && checkCaptureUrl(nav.finalUrl).ok) return null;
  return nav.blockedCount > 0 ? 'blocked_host' : 'unreachable';
}

const NAV_ERROR_TEXT: Partial<Record<CaptureErrorCode, string>> = {
  blocked_host: 'The site redirected to, or depends on, a local or private address, which is blocked.',
  unreachable: 'The page could not be loaded.',
};

async function launchBrowser(proxyPort: number, signal: AbortSignal): Promise<Browser> {
  const { chromium } = await import('playwright-core');
  const tried: string[] = [];
  // undefined = Playwright's own Chromium (npx playwright install chromium); then installed Edge, then Chrome.
  for (const channel of [undefined, 'msedge', 'chrome']) {
    if (signal.aborted) throw new CaptureError('timeout', 'The capture took too long.');
    try {
      return await chromium.launch({
        channel,
        headless: true,
        chromiumSandbox: true,
        timeout: 15_000,
        // Playwright would also add <-loopback> on its own; set it explicitly so Chromium's implicit
        // localhost bypass can never send loopback requests around the filtering proxy.
        proxy: { server: `http://127.0.0.1:${proxyPort}`, bypass: '<-loopback>' },
        args: [
          // WebRTC UDP is the one channel that does not go through the HTTP proxy.
          '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
          '--webrtc-ip-handling-policy=disable_non_proxied_udp',
          '--disable-quic',
        ],
      });
    } catch (e) {
      // A browser that exists but starts slowly is not a reason to try the next one.
      if (e instanceof Error && e.name === 'TimeoutError') throw new CaptureError('timeout', 'The browser took too long to start.');
      tried.push(`${channel ?? 'chromium'}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    }
  }
  console.warn(`[Site capture] no browser could be launched — ${tried.join(' | ')}`);
  throw new CaptureError(
    'capture_unavailable',
    'No Chrome, Chromium or Edge could be started on the server. Install Microsoft Edge or Google Chrome, or run "npx playwright install chromium".',
  );
}

/** Scroll through the page so lazy images and reveal-on-scroll content render; returns the capture height. */
async function revealAndMeasure(page: Page, viewport: { width: number; height: number } = CAPTURE_VIEWPORT): Promise<number> {
  const measure = async () => {
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    return Math.min(CAPTURE_MAX_HEIGHT, Math.max(viewport.height, Number.isFinite(h) ? Math.round(h) : 0));
  };
  const height = await measure();
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  for (let y = 0; y < height; y += 600) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(100);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  return measure();
}

/** The real backend. `lookup` is the DNS resolver every proxied host goes through. */
export function createPlaywrightCapture(lookup: LookupAll): CaptureBackend {
  return async (url, signal) => {
    const proxy = await startFilteringProxy((hostname) => resolvePublicAddress(hostname, lookup));
    let browser: Browser | null = null;
    const onAbort = () => {
      void browser?.close().catch(() => undefined);
    };
    signal.addEventListener('abort', onAbort);
    try {
      browser = await launchBrowser(proxy.port, signal);
      if (signal.aborted) throw new CaptureError('timeout', 'The capture took too long.');
      const context = await browser.newContext({
        viewport: CAPTURE_VIEWPORT,
        deviceScaleFactor: 1,
        acceptDownloads: false,
        serviceWorkers: 'block',
        permissions: [],
      });
      const page = await context.newPage();
      // No popups: anything the page opens is closed immediately (dialogs are auto-dismissed by Playwright).
      context.on('page', (p) => {
        if (p !== page) void p.close().catch(() => undefined);
      });

      let failed = false;
      try {
        await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
      } catch (e) {
        if (e instanceof Error && e.name === 'TimeoutError') throw new CaptureError('timeout', 'The page took too long to load.');
        failed = true;
      }
      const early = navigationErrorCode({ failed, finalUrl: page.url(), blockedCount: proxy.blockedCount() });
      if (early) throw new CaptureError(early, NAV_ERROR_TEXT[early] ?? 'The page could not be loaded.');
      await page.waitForLoadState('load', { timeout: 5_000 }).catch(() => undefined);

      let height = await revealAndMeasure(page);
      const clip = { x: 0, y: 0, width: CAPTURE_VIEWPORT.width, height };
      let png = await page.screenshot({ type: 'png', fullPage: true, clip, timeout: 10_000 });
      if (png.length > CAPTURE_MAX_BYTES) {
        // Busy full-page PNGs can exceed the cap; fall back to the first screen.
        height = CAPTURE_VIEWPORT.height;
        png = await page.screenshot({ type: 'png', timeout: 10_000 });
      }
      const finalUrl = page.url();
      const late = navigationErrorCode({ failed: false, finalUrl, blockedCount: proxy.blockedCount() });
      if (late) throw new CaptureError(late, NAV_ERROR_TEXT[late] ?? 'The page could not be loaded.');
      const title = (await page.title()).trim().slice(0, 200);
      return { finalUrl, title, width: CAPTURE_VIEWPORT.width, height, png };
    } finally {
      signal.removeEventListener('abort', onAbort);
      if (browser) await browser.close().catch(() => undefined);
      await proxy.close();
    }
  };
}

// ---------------------------------------------------------------------------------------------------------
// Clone a website (CL-1): the same sandbox, plus measurements and a real mobile pass. Nothing the page loads is
// kept except stylesheet text, held in memory only to read hover rules, @font-face names and root tokens.

export const CLONE_MOBILE_VIEWPORT = { width: 390, height: 844 } as const;
const CLONE_MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const CSS_MAX_BYTES = 1024 * 1024;
const CSS_TOTAL_BYTES = 4 * 1024 * 1024;
const CLONE_JPEG_QUALITY = 85;

export interface CloneShotResult {
  width: number;
  height: number;
  jpeg: Buffer;
}

export interface CloneResult {
  finalUrl: string;
  title: string;
  desktop: CloneShotResult;
  mobile: CloneShotResult | null;
  measurements: { desktop: PageMeasurements; mobile: PageMeasurements | null };
}

/** Captures and measures `url`; must stop work and release the browser once `signal` aborts. */
export type CloneBackend = (url: URL, signal: AbortSignal) => Promise<CloneResult>;

type ContextOptions = NonNullable<Parameters<Browser['newContext']>[0]>;
interface PassResult {
  finalUrl: string;
  title: string;
  shot: CloneShotResult;
  measurements: PageMeasurements;
}

/**
 * Loads `url` in a fresh context, settles it (reduced motion, network idle, wheel scroll), hides overlays,
 * measures and screenshots it. With `collectCss` the stylesheet responses are appended to `css` (cross-origin
 * sheets cannot be read through the CSSOM); the measurement always parses whatever `css` holds.
 */
async function capturePass(
  browser: Browser,
  url: URL,
  options: ContextOptions,
  viewport: { width: number; height: number },
  proxy: FilteringProxy,
  css: string[],
  collectCss: boolean,
): Promise<PassResult> {
  const context = await browser.newContext({ ...options, viewport, reducedMotion: 'reduce', acceptDownloads: false, serviceWorkers: 'block', permissions: [] });
  try {
    const page = await context.newPage();
    context.on('page', (p) => {
      if (p !== page) void p.close().catch(() => undefined);
    });
    const reads: Promise<void>[] = [];
    if (collectCss) {
      let total = 0;
      page.on('response', (response) => {
        if (!(response.headers()['content-type'] ?? '').includes('text/css')) return;
        reads.push(
          response.body().then(
            (body) => {
              if (body.length > CSS_MAX_BYTES || total + body.length > CSS_TOTAL_BYTES) return;
              total += body.length;
              css.push(body.toString('utf8'));
            },
            () => undefined,
          ),
        );
      });
    }

    let failed = false;
    try {
      await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    } catch (e) {
      if (e instanceof Error && e.name === 'TimeoutError') throw new CaptureError('timeout', 'The page took too long to load.');
      failed = true;
    }
    const early = navigationErrorCode({ failed, finalUrl: page.url(), blockedCount: proxy.blockedCount() });
    if (early) throw new CaptureError(early, NAV_ERROR_TEXT[early] ?? 'The page could not be loaded.');
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);

    let height = await revealAndMeasure(page, viewport);
    await page.evaluate(HIDE_OVERLAYS_SCRIPT);
    await Promise.all(reads);
    await page.evaluate((texts) => { (window as unknown as { __kCss: string[] }).__kCss = texts; }, css);
    const measurements = sanitizeMeasurements(await page.evaluate(MEASURE_SCRIPT));

    const shoot = (clip?: { x: number; y: number; width: number; height: number }) =>
      page.screenshot({ type: 'jpeg', quality: CLONE_JPEG_QUALITY, scale: 'css', fullPage: !!clip, clip, timeout: 10_000 });
    let jpeg = await shoot({ x: 0, y: 0, width: viewport.width, height });
    if (jpeg.length > CAPTURE_MAX_BYTES) {
      height = viewport.height;
      jpeg = await shoot();
    }
    const finalUrl = page.url();
    const late = navigationErrorCode({ failed: false, finalUrl, blockedCount: proxy.blockedCount() });
    if (late) throw new CaptureError(late, NAV_ERROR_TEXT[late] ?? 'The page could not be loaded.');
    const title = (await page.title()).trim().slice(0, 200);
    return { finalUrl, title, shot: { width: viewport.width, height, jpeg }, measurements };
  } finally {
    await context.close().catch(() => undefined);
  }
}

/** The real clone backend: a desktop pass that also reads the stylesheets, then a separate mobile-device pass. */
export function createPlaywrightClone(lookup: LookupAll): CloneBackend {
  return async (url, signal) => {
    const proxy = await startFilteringProxy((hostname) => resolvePublicAddress(hostname, lookup));
    let browser: Browser | null = null;
    const onAbort = () => {
      void browser?.close().catch(() => undefined);
    };
    signal.addEventListener('abort', onAbort);
    try {
      browser = await launchBrowser(proxy.port, signal);
      if (signal.aborted) throw new CaptureError('timeout', 'The capture took too long.');
      const css: string[] = [];
      const desktop = await capturePass(browser, url, { deviceScaleFactor: 1 }, CAPTURE_VIEWPORT, proxy, css, true);

      // A real mobile load (UA, touch, DPR 2), not a resized desktop page. If it fails the desktop result stands.
      let mobile: PassResult | null = null;
      try {
        if (!signal.aborted) {
          const options = { deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: CLONE_MOBILE_UA };
          mobile = await capturePass(browser, new URL(desktop.finalUrl), options, CLONE_MOBILE_VIEWPORT, proxy, css, false);
        }
      } catch (e) {
        if (signal.aborted) throw e;
        console.warn('[Site clone] mobile pass failed:', e instanceof Error ? e.message : e);
      }
      return {
        finalUrl: desktop.finalUrl,
        title: desktop.title,
        desktop: desktop.shot,
        mobile: mobile?.shot ?? null,
        measurements: { desktop: desktop.measurements, mobile: mobile?.measurements ?? null },
      };
    } finally {
      signal.removeEventListener('abort', onAbort);
      if (browser) await browser.close().catch(() => undefined);
      await proxy.close();
    }
  };
}
