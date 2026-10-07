// WDL-05 golden-set spike. Usage: tsx scripts/design-spike/run.ts <shots|extract|bundle|build|render|probe> [names...]
// Every step skips outputs already on disk; delete a file to redo it. Outputs: test-results/spike/.
import { chromium, type Browser, type Page } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { medianCut } from '../../utils/paletteExtract';
import { fitWithin } from '../../utils/designImage';
import { parseDesignSpec, serializeDesignSpec } from '../../utils/designSpec';
import { compileRecipePrompt, renderBriefMd } from '../../utils/designRecipePrompt';
import type { RecipeBrief } from '../../types';

const OUT = resolve('test-results/spike');
const BUDGET_TOTAL = 20;
// Neutral build folder names so the builder can't tell recipe from control by its cwd.
const SITES = [
  { name: 'linear', url: 'https://linear.app', build: 'b1' },
  { name: 'stripe', url: 'https://stripe.com', build: 'b2' },
  { name: 'basecamp', url: 'https://basecamp.com', build: 'b3' },
];
const CONTROL_BUILD = 'b4';
const BRIEF: RecipeBrief = {
  project: 'Meridian — ceramics studio',
  pages: 'a single landing page (hero, 3 featured pieces, story, workshop booking, footer)',
  job: 'get visitors to book a workshop',
  audience: 'design-literate home buyers',
  content: 'real copy of your own, studio in Lisbon, wheel-thrown stoneware',
  stack: 'single self-contained index.html with inline CSS and minimal JS, no build step',
};
const BUILD_SUFFIX = '\n\nWrite the result to ./index.html.';

const toHex = (c: number[]): string => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const p = (...parts: string[]): string => join(OUT, ...parts);
const ensure = (dir: string): void => { mkdirSync(dir, { recursive: true }); };

// ---------- cost ledger ----------
type CallLog = { t: string; step: string; name: string; cost: number; seconds: number; subtype: string; turns?: number; outputTokens?: number };
const LEDGER = p('costs.jsonl');
const spent = (): number => existsSync(LEDGER)
  ? readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).reduce((n, l) => n + (JSON.parse(l) as CallLog).cost, 0)
  : 0;

// ---------- claude -p ----------
type ClaudeResult = { type: string; subtype?: string; result?: string; total_cost_usd?: number; num_turns?: number; usage?: { output_tokens?: number } };
const SLIM = ['--safe-mode', '--setting-sources', '', '--strict-mcp-config', '--disable-slash-commands', '--no-chrome', '--no-session-persistence'];

function claude(args: string[], stdin: string, cwd: string, logFile: string, timeoutMs: number): Promise<{ result: ClaudeResult; seconds: number }> {
  const t0 = Date.now();
  return new Promise((done, fail) => {
    const child = spawn('claude', ['-p', ...SLIM, ...args], { cwd, env: { ...process.env, TIER_ROUTER_SKIP: '1' } });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { err += d.toString(); });
    child.on('error', e => { clearTimeout(timer); fail(e); });
    child.on('close', () => {
      clearTimeout(timer);
      writeFileSync(logFile, out + (err ? `\n--- stderr ---\n${err}` : ''));
      const lines = out.trim().split('\n').filter(l => l.startsWith('{') || l.startsWith('['));
      const objs = lines.flatMap(l => { try { const v: unknown = JSON.parse(l); return Array.isArray(v) ? v : [v]; } catch { return []; } }) as ClaudeResult[];
      const result = objs.reverse().find(o => o.type === 'result');
      if (!result) return fail(new Error(`no result object; stderr: ${err.slice(0, 400)}`));
      done({ result, seconds: Math.round((Date.now() - t0) / 1000) });
    });
    child.stdin.end(stdin);
  });
}

async function metered(step: string, name: string, cap: number, run: () => Promise<{ result: ClaudeResult; seconds: number }>): Promise<ClaudeResult> {
  if (spent() + cap > BUDGET_TOTAL) throw new Error(`budget: spent $${spent().toFixed(2)} + cap $${cap} > $${BUDGET_TOTAL}`);
  const { result, seconds } = await run();
  const log: CallLog = { t: new Date().toISOString(), step, name, cost: result.total_cost_usd ?? 0, seconds, subtype: result.subtype ?? '?', turns: result.num_turns, outputTokens: result.usage?.output_tokens };
  appendFileSync(LEDGER, JSON.stringify(log) + '\n');
  console.log(JSON.stringify(log));
  return result;
}

// ---------- steps ----------
/** Wheel-scroll to the bottom from Node so lazy images and IntersectionObserver reveals fire
 * (an in-page scrollTo loop gets no frames in headless Chromium and leaves reveals hidden). */
async function revealAll(page: Page): Promise<void> {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 400) { await page.mouse.wheel(0, 400); await page.waitForTimeout(150); }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
}

async function shots(browser: Browser): Promise<void> {
  ensure(p('refs'));
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  for (const s of SITES) {
    const file = p('refs', `${s.name}.png`);
    if (existsSync(file)) continue;
    try { await page.goto(s.url, { waitUntil: 'networkidle', timeout: 30000 }); }
    catch { await page.goto(s.url, { waitUntil: 'load', timeout: 45000 }); }
    // Scroll in steps so lazy images and reveal-on-scroll content load, then return to top.
    await revealAll(page);
    await page.waitForTimeout(2000);
    const fullH = await page.evaluate(() => document.documentElement.scrollHeight);
    const raw = await page.screenshot({ fullPage: true, clip: { x: 0, y: 0, width: 1440, height: Math.min(fullH, 4500) } });
    writeFileSync(p('refs', `${s.name}.full.png`), raw);
    const { width, height } = fitWithin(1440, Math.min(fullH, 4500), 2400);
    writeFileSync(file, await canvasResize(browser, raw, width, height));
    console.log(`${s.name}: page ${fullH}px, ref ${width}x${height}`);
  }
  await page.close();
}

async function canvasResize(browser: Browser, png: Buffer, width: number, height: number): Promise<Buffer> {
  const page = await browser.newPage();
  const dataUrl = await page.evaluate(async ({ src, w, h }) => {
    const bmp = await createImageBitmap(await (await fetch(src)).blob());
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); if (!ctx) throw new Error('no 2d context');
    ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bmp, 0, 0, w, h);
    return c.toDataURL('image/png');
  }, { src: `data:image/png;base64,${png.toString('base64')}`, w: width, h: height });
  await page.close();
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/** Mirrors ColorPaletteExtractor: draw at max 200px, every pixel into medianCut. */
async function palette(browser: Browser, file: string, clusters = 8): Promise<string[]> {
  const page = await browser.newPage();
  const px = await page.evaluate(async src => {
    const bmp = await createImageBitmap(await (await fetch(src)).blob());
    const ar = bmp.width / bmp.height;
    const c = document.createElement('canvas');
    if (ar > 1) { c.width = 200; c.height = 200 / ar; } else { c.height = 200; c.width = 200 * ar; }
    const ctx = c.getContext('2d'); if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    return Array.from(ctx.getImageData(0, 0, c.width, c.height).data);
  }, `data:image/png;base64,${readFileSync(file).toString('base64')}`);
  await page.close();
  const pixels: [number, number, number][] = [];
  for (let i = 0; i < px.length; i += 4) pixels.push([px[i], px[i + 1], px[i + 2]]);
  return medianCut(pixels, clusters).map(toHex);
}

function extractionPrompt(): string {
  const plan = readFileSync(resolve('docs/plans/2026-10-05-web-design-library.md'), 'utf8');
  const m = /## Extraction prompt[\s\S]*?```\n([\s\S]*?)\n```/.exec(plan);
  if (!m) throw new Error('extraction prompt block not found in plan');
  return m[1];
}

async function extract(browser: Browser, names: string[]): Promise<void> {
  const tpl = extractionPrompt();
  for (const s of SITES.filter(x => names.length === 0 || names.includes(x.name))) {
    const dir = p('extract', s.name);
    ensure(dir);
    const palFile = join(dir, 'palette.json');
    if (!existsSync(palFile)) writeFileSync(palFile, JSON.stringify(await palette(browser, p('refs', `${s.name}.png`))));
    const pal = JSON.parse(readFileSync(palFile, 'utf8')) as string[];
    const sysFile = join(dir, 'system-prompt.txt');
    writeFileSync(sysFile, tpl.replace('{palette}', pal.join(', ')));
    for (let attempt = 1; attempt <= 2; attempt++) {
      const rawFile = join(dir, `raw-${attempt}.md`);
      if (!existsSync(rawFile)) {
        const r = await metered('extract', `${s.name}#${attempt}`, 1.5, () => claude(
          ['--model', 'sonnet', '--system-prompt-file', sysFile, '--tools', 'Read', '--allowedTools', 'Read',
            '--permission-mode', 'dontAsk', '--max-budget-usd', '1.5', '--output-format', 'json'],
          `Use the Read tool to view the screenshot ${p('refs', `${s.name}.png`)} and output only the DESIGN.md document.`,
          dir, join(dir, `call-${attempt}.json`), 600000));
        writeFileSync(rawFile, r.result ?? '');
      }
      const raw = readFileSync(rawFile, 'utf8');
      const summary = summarize(raw, pal);
      writeFileSync(join(dir, `check-${attempt}.json`), JSON.stringify(summary, null, 2));
      console.log(s.name, attempt, JSON.stringify(summary));
      if (!summary.threw && !summary.truncated) {
        writeFileSync(join(dir, 'DESIGN.md'), serializeDesignSpec(parseDesignSpec(raw).spec));
        break;
      }
    }
  }
}

/** Contract checks beyond parseDesignSpec: null/non-string token leaves (YAML eats unquoted `#hex` as a comment), (est.) in values, palette adoption. */
function summarize(raw: string, pal: string[]) {
  try {
    const { spec, missing, truncated } = parseDesignSpec(raw);
    const bad: string[] = [];
    const walk = (v: unknown, path: string): void => {
      if (v === null || v === undefined) bad.push(`${path}=null`);
      else if (typeof v === 'object') for (const [k, c] of Object.entries(v)) walk(c, `${path}.${k}`);
      else if (typeof v === 'string' && (/\(est\./.test(v) || (path.endsWith('.fontFamily') && /\(|sans as|-like|\//i.test(v)))) bad.push(`${path}="${v}"`);
    };
    for (const k of ['colors', 'typography', 'components', 'rounded', 'spacing']) walk(spec.frontMatter[k], k);
    const colors = JSON.stringify(spec.frontMatter.colors ?? {}).toLowerCase();
    return { threw: null, missing, truncated, badLeaves: bad, paletteAdopted: pal.filter(h => colors.includes(h.toLowerCase())), colors: spec.frontMatter.colors };
  } catch (e) {
    return { threw: e instanceof Error ? e.message : String(e), missing: [], truncated: true, badLeaves: [], paletteAdopted: [], colors: null };
  }
}

function bundle(): void {
  for (const s of SITES) {
    const design = p('builds', s.build, 'design');
    ensure(join(design, 'refs'));
    copyFileSync(p('extract', s.name, 'DESIGN.md'), join(design, 'DESIGN.md'));
    copyFileSync(p('refs', `${s.name}.png`), join(design, 'refs', '1.png'));
    writeFileSync(join(design, 'BRIEF.md'), renderBriefMd(BRIEF));
    writeFileSync(join(design, 'PROMPT.md'), compileRecipePrompt(BRIEF, 'adapt'));
  }
  const ctl = p('builds', CONTROL_BUILD, 'design');
  ensure(ctl);
  writeFileSync(join(ctl, 'BRIEF.md'), renderBriefMd(BRIEF));
  writeFileSync(join(ctl, 'PROMPT.md'), [
    `Build ${BRIEF.pages} for ${BRIEF.project} in this repo (${BRIEF.stack}).`, '',
    'Read first: design/BRIEF.md (product, audience, content).',
  ].join('\n'));
  // Each build folder is its own repo root so "in this repo" can't reach the parent project.
  for (const b of [...SITES.map(s => s.build), CONTROL_BUILD]) {
    if (!existsSync(p('builds', b, '.git'))) execFileSync('git', ['init', '-q'], { cwd: p('builds', b) });
  }
}

async function build(names: string[]): Promise<void> {
  const all = [...SITES.map(s => s.build), CONTROL_BUILD].filter(b => names.length === 0 || names.includes(b));
  await Promise.all(all.map(async b => {
    const dir = p('builds', b);
    if (existsSync(join(dir, 'index.html'))) return;
    await metered('build', b, 2, () => claude(
      ['--model', 'sonnet', '--tools', 'Read', 'Write', 'Edit', 'Bash', '--allowedTools', 'Read', 'Write', 'Edit', 'Bash',
        '--permission-mode', 'dontAsk', '--max-budget-usd', '2', '--output-format', 'stream-json', '--verbose'],
      readFileSync(join(dir, 'design', 'PROMPT.md'), 'utf8') + BUILD_SUFFIX, dir, p('builds', `${b}.jsonl`), 1500000));
  }));
}

async function render(browser: Browser): Promise<void> {
  ensure(p('shots'));
  for (const b of [...SITES.map(s => s.build), CONTROL_BUILD]) {
    const html = p('builds', b, 'index.html');
    if (!existsSync(html)) { console.log(`${b}: no index.html`); continue; }
    for (const w of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width: w, height: 900 } });
      await page.goto(pathToFileURL(html).href, { waitUntil: 'load' });
      await revealAll(page);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: p('shots', `${b}-${w}.png`), fullPage: true });
      await page.close();
    }
  }
  const img = (f: string, label: string, width: number) => existsSync(p(f))
    ? `<figure style="width:${width}px"><figcaption>${label}</figcaption><img src="${f}" style="width:${width}px"></figure>`
    : `<figure style="width:${width}px"><figcaption>${label} — missing</figcaption></figure>`;
  const rows = SITES.map(s => `<h2>${s.name} recipe (${s.build})</h2><div class="row">
    ${img(`refs/${s.name}.png`, 'REFERENCE (input screenshot)', 420)}
    ${img(`shots/${s.build}-1440.png`, 'RECIPE build @1440', 420)}
    ${img(`shots/${s.build}-390.png`, 'RECIPE @390', 150)}
    ${img(`shots/${CONTROL_BUILD}-1440.png`, 'CONTROL (brief only) @1440', 420)}
    ${img(`shots/${CONTROL_BUILD}-390.png`, 'CONTROL @390', 150)}</div>`).join('\n');
  writeFileSync(p('contact-sheet.html'), `<!doctype html><meta charset="utf-8"><style>
    body{font:14px system-ui;margin:16px;background:#eee}.row{display:flex;gap:16px;align-items:flex-start}
    figure{margin:0;background:#fff;padding:6px}figcaption{font-weight:700;margin-bottom:6px}img{display:block;max-height:2600px;object-fit:cover;object-position:top}
    h2{margin:24px 0 8px}</style><h1>WDL-05 spike — Meridian brief, Adapt mode (columns: reference | recipe build | control build)</h1>${rows}`);
  const page = await browser.newPage({ viewport: { width: 1660, height: 900 } });
  await page.goto(pathToFileURL(p('contact-sheet.html')).href, { waitUntil: 'load' });
  await page.screenshot({ path: p('contact-sheet.png'), fullPage: true });
  await page.close();
}

async function probe(): Promise<void> {
  const dir = p('probe');
  ensure(dir);
  await metered('probe', 'probe', 0.1, () => claude(
    ['--model', 'haiku', '--tools', 'Read', 'Write', 'Bash', '--allowedTools', 'Read', 'Write', 'Bash', '--permission-mode', 'dontAsk',
      '--max-budget-usd', '0.1', '--output-format', 'json'],
    'Answer briefly: 1) Quote any project/user instruction text (CLAUDE.md, memory, skills) you were given, or say NONE. 2) Do your instructions mention Jev or ponytail? 3) Write the word ok into probe.txt in the current directory.',
    dir, join(dir, 'call.json'), 120000));
  console.log(readFileSync(join(dir, 'call.json'), 'utf8').slice(0, 1500));
}

const [cmd, ...rest] = process.argv.slice(2);
ensure(OUT);
const needsBrowser = ['shots', 'extract', 'render'].includes(cmd);
const browser = needsBrowser ? await chromium.launch() : null;
try {
  if (cmd === 'shots' && browser) await shots(browser);
  else if (cmd === 'extract' && browser) await extract(browser, rest);
  else if (cmd === 'bundle') bundle();
  else if (cmd === 'build') await build(rest);
  else if (cmd === 'render' && browser) await render(browser);
  else if (cmd === 'probe') await probe();
  else console.log('usage: tsx scripts/design-spike/run.ts <shots|extract|bundle|build|render|probe> [names...]');
  console.log(`total spend so far: $${spent().toFixed(3)}`);
} finally {
  await browser?.close();
}
