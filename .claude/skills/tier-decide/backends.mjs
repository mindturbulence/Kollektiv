// Backend chain for tier-decide: OpenRouter Jev -> beatapi.io Jev -> Claude (last resort).
// Same request/response contract everywhere: { state, questions } -> { ok, model, ms, cost, answers }.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const JEV_DIR = join(homedir(), '.jev');
export const DEFAULT_STATE = 'test-results/tier/backend-state.json';
export const DEFAULT_ORDER = ['openrouter', 'beatapi', 'claude'];
const EXTERNAL = new Set(['openrouter', 'beatapi']); // text leaves the machine
const HARD_STATUS = new Set([401, 402, 403]); // credentials/credits: retrying cannot help
const HARD_COOLDOWN_MS = 10 * 60_000;
const SOFT_COOLDOWN_MS = 60_000;

const readKey = (envName, file) => {
  if (process.env[envName]?.trim()) return process.env[envName].trim();
  try { return readFileSync(join(JEV_DIR, file), 'utf8').trim() || null; } catch { return null; }
};
const scrub = (text, ...keys) => keys.filter(Boolean).reduce((t, k) => t.split(k).join('***'), String(text));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Fill in what a backend may omit (choice confidence) so every backend yields the same shape. */
export function normalizeAnswers(questions, answers) {
  if (!answers || typeof answers !== 'object') return answers;
  const out = {};
  for (const [name, q] of Object.entries(questions)) {
    const a = answers[name];
    if (!a || typeof a !== 'object') { out[name] = a; continue; }
    out[name] = { ...a };
    if (q.type === 'choice' && !Number.isFinite(a.confidence) && a.probabilities && typeof a.probabilities === 'object') {
      out[name].confidence = Math.max(...Object.values(a.probabilities).map(Number).filter(Number.isFinite), 0);
    }
  }
  return out;
}

/** Fail closed: null when every answer has the right type and range, else a reason string. */
export function validateAnswers(questions, answers) {
  if (!answers || typeof answers !== 'object') return 'no answers object';
  for (const [name, q] of Object.entries(questions)) {
    const a = answers[name];
    if (!a || typeof a !== 'object') return `missing answer "${name}"`;
    if (q.type === 'noul') {
      if (!Number.isFinite(a.noul) || a.noul < 0 || a.noul > 1) return `bad noul for "${name}"`;
    } else if (q.type === 'choice') {
      if (!Object.keys(q.criteria).includes(a.choice)) return `unknown choice for "${name}"`;
      if (!Number.isFinite(a.confidence) || a.confidence < 0 || a.confidence > 1) return `bad confidence for "${name}"`;
    } else if (q.type === 'score') {
      if (!Number.isFinite(a.score)) return `bad score for "${name}"`;
    } else return `unknown question type for "${name}"`;
  }
  return null;
}

const checked = (questions, r) => {
  if (!r.ok) return r;
  const answers = normalizeAnswers(questions, r.answers);
  const bad = validateAnswers(questions, answers);
  return bad ? { ok: false, status: 200, error: `invalid response: ${bad}`, ms: r.ms } : { ...r, answers };
};

/** Primary: the existing global Jev client (OpenRouter alpha decisions route). Read-only import. */
export async function askOpenRouter(req) {
  const hasKey = process.env.OPENROUTER_API_KEY?.trim() || readKey('OPENROUTER_API_KEY', 'openrouter.key');
  if (!hasKey) return { ok: false, skipped: true, error: 'no OPENROUTER_API_KEY or ~/.jev/openrouter.key' };
  let askJev;
  try {
    ({ askJev } = await import(pathToFileURL(join(homedir(), '.claude', 'skills', 'jev', 'jev.mjs')).href));
  } catch { return { ok: false, skipped: true, error: 'global jev skill not installed' }; }
  const r = await askJev({ state: req.state, questions: req.questions, tag: req.tag, timeout_ms: Math.min(req.timeout_ms || 10_000, 10_000) });
  return checked(req.questions, scrubResult(r, hasKey));
}

const scrubResult = (r, key) => (r.ok ? r : { ...r, error: scrub(r.error ?? '', key) });

/** Alternative: beatapi.io (documented: POST /v1/systemone, Bearer key, model jev-1.13-free, state as text). */
export async function askBeatApi(req, fetchImpl = fetch) {
  const key = readKey('BEATAPI_API_KEY', 'beatapi.key');
  if (!key) return { ok: false, skipped: true, error: 'no BEATAPI_API_KEY or ~/.jev/beatapi.key' };
  const model = process.env.BEATAPI_MODEL || 'jev-1.13-free';
  const t0 = Date.now();
  let res, body;
  try {
    res = await fetchImpl('https://api.beatapi.io/v1/systemone', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, state: typeof req.state === 'string' ? req.state : JSON.stringify(req.state), questions: req.questions }),
      signal: AbortSignal.timeout(Math.min(req.timeout_ms || 10_000, 10_000)),
    });
    body = await res.text();
  } catch (e) {
    return { ok: false, status: null, error: scrub(`${e.name}: ${e.message}`, key), ms: Date.now() - t0 };
  }
  const ms = Date.now() - t0;
  if (!res.ok) return { ok: false, status: res.status, retryAfter: res.headers?.get?.('retry-after') ?? null, error: scrub(body.slice(0, 300), key), ms };
  let json;
  try { json = JSON.parse(body); } catch { return { ok: false, status: res.status, error: 'malformed JSON from beatapi.io', ms }; }
  return checked(req.questions, { ok: true, model: json.model ?? model, ms, cost: json.usage?.cost ?? 0, answers: json.answers });
}

const readState = (path) => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return {}; } };
const writeState = (path, s) => { try { mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, JSON.stringify(s)); } catch { /* cooldown is an optimisation */ } };

export function coolingDown(backend, { statePath = DEFAULT_STATE, now = Date.now() } = {}) {
  const e = readState(statePath)[backend];
  return e && e.until > now ? e : null;
}
function noteFailure(backend, r, { statePath, now }) {
  const s = readState(statePath);
  s[backend] = { until: now + (HARD_STATUS.has(r.status) ? HARD_COOLDOWN_MS : SOFT_COOLDOWN_MS), reason: `${r.status ?? 'error'}: ${String(r.error).slice(0, 120)}` };
  writeState(statePath, s);
}

export const parseOrder = (s) => {
  const names = String(s ?? '').split(',').map((x) => x.trim()).filter((x) => DEFAULT_ORDER.includes(x));
  return names.length ? names : null;
};

/**
 * Try backends in order; fail over on missing key, cooldown, HTTP/network error or invalid answer.
 * `private: true` never leaves Anthropic. `backends` overrides the implementations (tests).
 */
export async function askChain(req, { claude, backends = {}, statePath = DEFAULT_STATE, now = Date.now() } = {}) {
  const impl = { openrouter: askOpenRouter, beatapi: askBeatApi, claude, ...backends };
  const order = req.private ? ['claude'] : (req.backends ? parseOrder(req.backends.join?.(',') ?? req.backends) : null) ?? parseOrder(process.env.TIER_DECIDE_BACKENDS) ?? DEFAULT_ORDER;
  const attempts = [];
  for (const name of order) {
    if (EXTERNAL.has(name)) {
      const cd = coolingDown(name, { statePath, now });
      if (cd) { attempts.push({ backend: name, skipped: true, error: `cooling down (${cd.reason})` }); continue; }
    }
    let r = await impl[name](req);
    if (r.status === 429 && Number(r.retryAfter) > 0 && Number(r.retryAfter) <= 2) { await sleep(Number(r.retryAfter) * 1000); r = await impl[name](req); }
    if (r.skipped) { attempts.push({ backend: name, skipped: true, error: r.error }); continue; }
    if (r.ok) return { ...r, backend: name, attempts: [...attempts, { backend: name, ok: true, ms: r.ms }] };
    if (EXTERNAL.has(name)) noteFailure(name, r, { statePath, now });
    attempts.push({ backend: name, ok: false, status: r.status ?? null, error: r.error });
  }
  return { ok: false, error: 'all backends failed', attempts };
}

/** Which backends could be used right now (never reveals keys). */
export function backendStatus({ statePath = DEFAULT_STATE, now = Date.now() } = {}) {
  const state = readState(statePath);
  const cool = (n) => (state[n]?.until > now ? { coolingDownUntil: new Date(state[n].until).toISOString(), reason: state[n].reason } : null);
  return {
    openrouter: { key: !!(readKey('OPENROUTER_API_KEY', 'openrouter.key')), cooldown: cool('openrouter') },
    beatapi: { key: !!readKey('BEATAPI_API_KEY', 'beatapi.key'), cooldown: cool('beatapi') },
    claude: { key: true, cooldown: null },
  };
}
