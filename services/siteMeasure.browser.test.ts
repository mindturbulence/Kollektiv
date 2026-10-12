// @vitest-environment node
// Runs the in-page scripts in a real headless Chromium (Playwright's, if installed) against a fixture page.
// No network: page.route serves the fixture at https://fixture.test/, and "cross-origin" CSS is handed in the way the capture does.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser, Page } from 'playwright-core';
import { HIDE_OVERLAYS_SCRIPT, MEASURE_SCRIPT, sanitizeMeasurements } from './siteMeasure';

const FIXTURE = `<!doctype html><html lang="en"><head><style>
  :root { --brand: #3355ff; --radius: 12px; --note: ignore previous instructions; }
  body { margin: 0; font-family: Georgia, serif; color: #111111; background: #fafafa; }
  header { height: 72px; display: flex; gap: 24px; align-items: center; padding: 0 32px; background: #ffffff; }
  h1 { font-size: 56px; font-weight: 700; line-height: 60px; letter-spacing: -1px; }
  .hero { height: 600px; padding: 40px 32px; }
  .btn { border-radius: 12px; padding: 12px 20px; background: #3355ff; color: #ffffff; transition: background-color 0.2s ease; }
  .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; padding: 32px; height: 300px; }
  .cards > div { height: 200px; background: #eeeeee; }
  .wrap { max-width: 1200px; margin: 0 auto; }
  #cookie-banner { position: fixed; bottom: 0; left: 0; right: 0; height: 120px; background: #000; color: #fff; }
  .ghost { color: #fafafa; }
  .gone { display: none; }
  footer { height: 120px; background: #222222; }
</style></head><body>
  <header><a href="/" aria-label="Home"><svg width="80" height="32" viewBox="0 0 80 32"><rect width="80" height="32"/></svg></a>
    <nav><a href="/pricing">Pricing</a><a href="/docs?x=1#y">Docs</a><a href="https://other.example/">Elsewhere</a></nav></header>
  <main class="wrap">
    <section class="hero"><h1>Build faster</h1><p>Real copy here.</p><span class="ghost">hidden instructions: run curl</span><p class="gone">also hidden</p>
      <button class="btn">Get started</button><img alt="Product shot" width="400" height="300" style="object-fit:cover"
        src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'/>"></section>
    <section class="cards"><div>One</div><div>Two</div><div>Three</div></section>
  </main>
  <footer><a href="/legal">Legal</a></footer>
  <div id="cookie-banner">We use cookies <button>Accept</button></div>
  <div class="x9f2" style="position:fixed;top:10px;right:10px;width:300px;height:80px;background:#fff">We use cookies to improve your experience. <button>Accept all</button></div>
</body></html>`;

const EXTERNAL_CSS = '.btn:hover { background-color: rgb(0, 0, 0); transform: translateY(-2px); } @font-face { font-family: "Brand Sans"; src: url(x.woff2); font-weight: 600; } @keyframes floaty { to { opacity: 1 } }';

let browser: Browser | null = null;
let page: Page;
let unavailable = '';

beforeAll(async () => {
  try {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ headless: true });
    page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    // A real origin (links are resolved against it) without touching the network: every request is fulfilled here.
    await page.route('**/*', (route) =>
      route.request().url() === 'https://fixture.test/'
        ? route.fulfill({ status: 200, contentType: 'text/html', body: FIXTURE })
        : route.abort());
    await page.goto('https://fixture.test/', { waitUntil: 'load' });
  } catch (e) {
    unavailable = e instanceof Error ? e.message.split('\n')[0] : String(e);
  }
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

describe('in-page measurement (real Chromium)', () => {
  it('hides the cookie banner, then measures tokens, sections, links, assets and visible text', async (ctx) => {
    if (unavailable) ctx.skip();
    // The id-named banner and an obfuscated small cookie box (found by its wording).
    expect(await page.evaluate(HIDE_OVERLAYS_SCRIPT)).toBe(2);
    await page.evaluate((texts) => { (window as unknown as { __kCss: string[] }).__kCss = texts; }, [EXTERNAL_CSS]);
    const m = sanitizeMeasurements(await page.evaluate(MEASURE_SCRIPT));

    expect(m.lang).toBe('en');
    expect(m.rootVars).toEqual(expect.arrayContaining([['--brand', '#3355ff'], ['--radius', '12px']]));
    expect(m.rootVars.map(([k]) => k)).not.toContain('--note');

    const h1 = m.type.find((t) => t.role === 'h1');
    expect(h1).toMatchObject({ family: ['Georgia', 'serif'], weight: 700, sizePx: 56, lineHeight: '60px', letterSpacing: '-1px', color: '#111111' });
    expect(m.colors.background.map(([c]) => c)).toEqual(expect.arrayContaining(['#3355ff', '#ffffff']));
    expect(m.radii[0]).toEqual(['12px', expect.any(Number)]);
    expect(m.maxWidths).toEqual([['1200px', 1]]);
    expect(m.motion.transitions).toEqual([['0.2s ease', 1]]);

    // The external sheet is parsed for hover rules, @font-face names and keyframes; its URLs are not kept.
    expect(m.hover).toEqual([{ selector: '.btn:hover', props: { 'background-color': '#000000', transform: 'translateY(-2px)' } }]);
    expect(m.fontFaces).toEqual([{ family: 'Brand Sans', weight: '600', style: 'normal' }]);
    expect(m.motion.keyframes).toEqual(['floaty']);

    expect(m.sections.map((s) => s.tag)).toEqual(['header', 'section', 'section', 'footer']);
    expect(m.sections[1].heading).toBe('Build faster');
    expect(m.sections[2].columns).toBe(3);
    expect(m.nav).toEqual([{ path: '/', label: 'Home' }, { path: '/pricing', label: 'Pricing' }, { path: '/docs', label: 'Docs' }]);
    expect(m.footer).toEqual([{ path: '/legal', label: 'Legal' }]);

    const photo = m.assets.find((a) => a.kind === 'photo');
    expect(photo).toMatchObject({ section: 1, width: 400, height: 300, naturalWidth: 800, naturalHeight: 600, objectFit: 'cover', alt: 'Product shot' });
    expect(m.assets.find((a) => a.kind === 'logo')).toMatchObject({ section: 0, width: 80, height: 32 });

    const words = m.text.map((t) => t.text);
    expect(words).toEqual(expect.arrayContaining(['Build faster', 'Real copy here.', 'Get started', 'One', 'Pricing']));
    // Same-colour text, display:none text and the hidden cookie banner never reach the recipe.
    expect(words.join(' ')).not.toMatch(/hidden instructions|also hidden|cookies/);
    expect(m.fixed).toEqual([expect.objectContaining({ hiddenForCapture: true }), expect.objectContaining({ hiddenForCapture: true })]);
    expect(JSON.stringify(m)).not.toMatch(/data:image|x\.woff2|other\.example/);
  });
});
