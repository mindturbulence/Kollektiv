#!/usr/bin/env node
// Typed decisions (choice / score / noul) with failover: OpenRouter Jev -> beatapi.io Jev -> Claude (Haiku via
// `claude -p`, last resort). Same request/response contract as ~/.claude/skills/jev/jev.mjs. Usage:
//   node .claude/skills/tier-decide/decide.mjs request.json [--backend openrouter,beatapi,claude]  (or JSON on stdin)
//   node .claude/skills/tier-decide/decide.mjs --status      which backends have keys / are cooling down
//   node .claude/skills/tier-decide/decide.mjs --selfcheck   offline tests (fake backends, no network, no spend)
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, appendFileSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { askChain, askBeatApi, backendStatus, normalizeAnswers, validateAnswers } from './backends.mjs';

const MODEL = process.env.TIER_DECIDE_MODEL || 'haiku';
const LOG = 'test-results/tier/usage.jsonl';

const levels = (q) => (Array.isArray(q.criteria) ? q.criteria.map((_, i) => String(i)) : Object.keys(q.criteria));
const prob = (keys) => ({
  type: 'object',
  properties: Object.fromEntries(keys.map((k) => [k, { type: 'number' }])),
  required: keys,
});

export function buildSchema(questions) {
  const properties = {};
  for (const [name, q] of Object.entries(questions)) {
    properties[name] = q.type === 'noul'
      ? { type: 'object', properties: { yes: { type: 'number' } }, required: ['yes'] }
      : { type: 'object', properties: { probabilities: prob(levels(q)) }, required: ['probabilities'] };
  }
  return { type: 'object', properties, required: Object.keys(properties) };
}

export function buildPrompt({ state, questions }) {
  const qs = Object.entries(questions).map(([name, q]) => {
    const opts = q.type === 'noul'
      ? `yes means: ${q.criteria?.true ?? 'true'}; no means: ${q.criteria?.false ?? 'false'}. Answer {"yes": probability 0-1}.`
      : (Array.isArray(q.criteria)
        ? q.criteria.map((c, i) => `  ${i}: ${c}`).join('\n')
        : Object.entries(q.criteria).map(([k, c]) => `  ${k}: ${c}`).join('\n'))
        + '\nAnswer {"probabilities": {option: probability}} summing to 1.';
    return `[${name}] (${q.type}) ${q.instructions}\n${opts}`;
  });
  return `Decide each question below from the state. Judge independently; be honest about uncertainty (spread probability when unsure).\n\nSTATE:\n${JSON.stringify(state, null, 2)}\n\nQUESTIONS:\n${qs.join('\n\n')}`;
}

const norm = (p) => {
  const t = Object.values(p).reduce((n, v) => n + Math.max(0, Number(v) || 0), 0) || 1;
  return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Math.max(0, Number(v) || 0) / t]));
};

export function shapeAnswers(questions, raw) {
  const answers = {};
  for (const [name, q] of Object.entries(questions)) {
    const a = raw?.[name];
    if (q.type === 'noul') {
      answers[name] = { noul: Math.min(1, Math.max(0, Number(a?.yes))) };
      continue;
    }
    const probabilities = norm(a?.probabilities ?? {});
    const [top, confidence] = Object.entries(probabilities).sort((x, y) => y[1] - x[1])[0] ?? [];
    if (q.type === 'choice') answers[name] = { choice: top, probabilities, confidence };
    else {
      const score = Object.entries(probabilities).reduce((n, [i, p]) => n + Number(i) * p, 0);
      answers[name] = { score, probabilities, legend: q.criteria, confidence };
    }
  }
  return answers;
}

/** The Claude backend (last resort): Haiku answers through `claude -p`. Confidence is self-reported. */
export function askClaude(req) {
  const t0 = Date.now();
  const args = ['-p', '--model', req.model || MODEL, '--tools', '', '--disable-slash-commands', '--strict-mcp-config',
    '--setting-sources', '', '--no-chrome', '--no-session-persistence', '--output-format', 'json',
    '--system-prompt', 'You answer typed decisions. Output only the structured result.',
    '--json-schema', JSON.stringify(buildSchema(req.questions)), buildPrompt(req)];
  return new Promise((resolve) => {
    const child = spawn('claude', args, { env: { ...process.env, TIER_ROUTER_SKIP: '1' } });
    let out = '', err = '';
    child.on('error', (e) => { err = String(e.message); });
    let timedOut = false;
    // timeout_ms is sized for the fast Jev APIs (<=10 s); the last-resort Claude call starts a CLI, so it gets a 60 s floor.
    const limit = req.claude_timeout_ms || Math.max(req.timeout_ms || 0, 60000);
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, limit);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', () => {
      clearTimeout(timer);
      const ms = Date.now() - t0;
      if (timedOut) return resolve({ ok: false, error: `timed out after ${limit} ms (set claude_timeout_ms in the request for very large inputs)`, ms });
      try {
        const parsed = JSON.parse(out);
        const r = (Array.isArray(parsed) ? parsed : [parsed]).find((x) => x.type === 'result');
        if (!r || r.is_error || !r.structured_output) throw new Error(r?.result || err || 'no structured output');
        const cost = r.total_cost_usd ?? 0;
        mkdirSync('test-results/tier', { recursive: true });
        appendFileSync(LOG, JSON.stringify({ t: new Date().toISOString(), tag: req.tag, model: req.model || MODEL, ms, cost }) + '\n');
        resolve({ ok: true, model: req.model || MODEL, ms, cost, answers: shapeAnswers(req.questions, r.structured_output) });
      } catch (e) {
        resolve({ ok: false, error: String(e.message || e).slice(0, 500), ms });
      }
    });
  });
}

/** Front door: tries the chain in order (`private: true` = Claude only, text never leaves Anthropic). */
export const askDecide = (req, opts = {}) => askChain(req, { claude: askClaude, ...opts });

async function chainCheck() {
  const assert = (await import('node:assert/strict')).default;
  const statePath = 'test-results/tier/selfcheck-state.json';
  const q = { u: { type: 'noul', instructions: 'x', criteria: { true: 'y', false: 'n' } } };
  const good = (model) => async () => ({ ok: true, model, ms: 1, cost: 0, answers: { u: { noul: 0.9 } } });
  const mk = (r) => { const f = async () => { f.calls++; return r; }; f.calls = 0; return f; };
  const req = { state: { t: 'x' }, questions: q };
  rmSync(statePath, { force: true });

  assert.equal(validateAnswers(q, { u: { type: 'noul', noul: '0.9' } }), 'bad noul for "u"', 'string noul rejected (fail closed)');
  assert.equal(validateAnswers(q, { u: { noul: 1.4 } }), 'bad noul for "u"', 'out-of-range noul rejected');
  const cq = { c: { type: 'choice', instructions: 'x', criteria: { a: 'A', b: 'B' } } };
  assert.equal(validateAnswers(cq, normalizeAnswers(cq, { c: { choice: 'a', probabilities: { a: 0.8, b: 0.2 } } })), null, 'choice confidence derived from probabilities');

  // 1. primary dead (402) -> beatapi answers; the dead backend is then skipped without a call
  const or = mk({ ok: false, status: 402, error: 'Insufficient credits', ms: 1 });
  let r = await askChain(req, { claude: good('claude'), statePath, backends: { openrouter: or, beatapi: good('beatapi') } });
  assert.equal(r.backend, 'beatapi'); assert.equal(r.attempts[0].status, 402);
  r = await askChain(req, { claude: good('claude'), statePath, backends: { openrouter: or, beatapi: good('beatapi') } });
  assert.equal(or.calls, 1, 'cooldown: dead backend not retried'); assert.match(r.attempts[0].error, /cooling down/);

  // 2. both external down -> Claude is the last resort
  rmSync(statePath, { force: true });
  r = await askChain(req, { claude: good('claude'), statePath, backends: { openrouter: mk({ ok: false, status: 500, error: 'boom' }), beatapi: mk({ ok: false, status: null, error: 'timeout' }) } });
  assert.equal(r.backend, 'claude'); assert.equal(r.attempts.length, 3);

  // 3. no keys -> skipped, not failed (no cooldown written), Claude answers
  rmSync(statePath, { force: true });
  const skip = mk({ ok: false, skipped: true, error: 'no key' });
  r = await askChain(req, { claude: good('claude'), statePath, backends: { openrouter: skip, beatapi: skip } });
  assert.equal(r.backend, 'claude'); assert.equal(backendStatus({ statePath }).openrouter.cooldown, null);

  // 4. private never touches external backends
  rmSync(statePath, { force: true });
  const ext = mk(await good('x')());
  r = await askChain({ ...req, private: true }, { claude: good('claude'), statePath, backends: { openrouter: ext, beatapi: ext } });
  assert.equal(r.backend, 'claude'); assert.equal(ext.calls, 0);

  // 5. beatapi: malformed answer -> fail over; 401 body containing the key is scrubbed
  rmSync(statePath, { force: true });
  process.env.BEATAPI_API_KEY = 'sk-selfcheck-secret';
  const fake = (status, body) => async () => ({ ok: status < 400, status, headers: { get: () => null }, text: async () => body });
  let b = await askBeatApi(req, fake(200, JSON.stringify({ answers: { u: { type: 'noul', noul: '0.9' } } })));
  assert.equal(b.ok, false); assert.match(b.error, /invalid response/);
  b = await askBeatApi(req, fake(401, 'bad key sk-selfcheck-secret'));
  assert.equal(b.status, 401); assert.ok(!b.error.includes('sk-selfcheck-secret'), 'key scrubbed from errors');
  b = await askBeatApi(req, fake(200, JSON.stringify({ answers: { u: { type: 'noul', noul: 0.87 } } })));
  assert.equal(b.ok, true); assert.equal(b.answers.u.noul, 0.87);
  delete process.env.BEATAPI_API_KEY;

  // 6. everything fails -> explicit failure with the attempt log
  rmSync(statePath, { force: true });
  r = await askChain(req, { claude: mk({ ok: false, error: 'nope' }), statePath, backends: { openrouter: skip, beatapi: skip } });
  assert.equal(r.ok, false); assert.equal(r.attempts.length, 3);
  rmSync(statePath, { force: true });
  console.log('chain selfcheck ok');
}

async function selfcheck() {
  const q = {
    kind: { type: 'choice', instructions: 'x', criteria: { a: 'A', b: 'B' } },
    lvl: { type: 'score', instructions: 'x', criteria: ['low', 'mid', 'high'] },
    yn: { type: 'noul', instructions: 'x', criteria: { true: 'y', false: 'n' } },
  };
  const s = buildSchema(q);
  console.assert(s.properties.lvl.properties.probabilities.required.join() === '0,1,2', 'score levels');
  const a = shapeAnswers(q, { kind: { probabilities: { a: 3, b: 1 } }, lvl: { probabilities: { 0: 0, 1: 0.5, 2: 0.5 } }, yn: { yes: 1.4 } });
  console.assert(a.kind.choice === 'a' && Math.abs(a.kind.confidence - 0.75) < 1e-9, 'choice argmax + normalise');
  console.assert(Math.abs(a.lvl.score - 1.5) < 1e-9, 'score expectation');
  console.assert(a.yn.noul === 1, 'noul clamped');
  console.log('selfcheck ok');
  await chainCheck();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const flag = (name) => { const i = argv.indexOf(name); return i < 0 ? undefined : argv.splice(i, 2)[1]; };
  const backends = flag('--backend');
  if (argv[0] === '--selfcheck') await selfcheck();
  else if (argv[0] === '--status') console.log(JSON.stringify(backendStatus(), null, 2));
  else {
    const req = JSON.parse(readFileSync(argv[0] || 0, 'utf8'));
    if (backends) req.backends = backends;
    const out = await askDecide(req);
    console.log(JSON.stringify(out, null, 2));
    process.exitCode = out.ok ? 0 : 1;
  }
}
