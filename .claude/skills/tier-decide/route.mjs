#!/usr/bin/env node
// Task router: picks the model tier, the ROLE and the THINKING effort for a task. Jev-style: the decision backend
// proposes (OpenRouter Jev -> beatapi.io Jev -> Claude), hard evidence (ticket tag, risky keywords) can only RAISE it.
//   node .claude/skills/tier-decide/route.mjs "task text" [--private]     prints the route as JSON
//   node .claude/skills/tier-decide/route.mjs --selfcheck                 offline tests (fake decision backend)
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { askDecide } from './decide.mjs';
import { ticketTier, classify, HARD } from '../../hooks/tier-router.mjs';

export const TIERS = {
  haiku: { agent: 'tier-haiku', model: 'Haiku 4.5', rank: 0 },
  sonnet: { agent: 'tier-sonnet', model: 'Sonnet 5.5', rank: 1 },
  opus: { agent: 'tier-opus', model: 'Opus 5.5', rank: 2 },
};
export const EFFORTS = ['low', 'medium', 'high', 'xhigh']; // claude --effort also has `max`; routing never needs it
const EFFORT_HINT = {
  low: 'answer directly, no extended deliberation',
  medium: 'think through the steps briefly before editing',
  high: 'reason carefully: consider alternatives and failure modes before you edit',
  xhigh: 'think deeply: map the whole flow, weigh several designs and challenge your first idea before editing',
};
export const ROLES = {
  scribe: { tier: 'haiku', effort: 'low', use: 'docs, renames, mechanical one-file edits', preamble: 'Role: scribe. Make the smallest exact change; do not redesign. Match the surrounding style.' },
  implementer: { tier: 'sonnet', effort: 'medium', use: 'a feature or component on an existing pattern, with tests', preamble: 'Role: implementer. Read 3 similar files first, follow their patterns, ship the change with a test.' },
  researcher: { tier: 'sonnet', effort: 'medium', use: 'finding facts in code or docs and comparing options, no edits', preamble: 'Role: researcher. Read-only. Report what you verified with file:line evidence; separate fact from guess.' },
  debugger: { tier: 'opus', effort: 'high', use: 'a failing flow whose cause is unknown', preamble: 'Role: debugger. Reproduce first, form ONE hypothesis at a time, test it with the smallest probe, fix the root cause not the symptom.' },
  reviewer: { tier: 'opus', effort: 'high', use: 'reviewing a diff or plan for defects', preamble: 'Role: reviewer. Be adversarial: find what breaks in practice, with evidence. No praise. Rank by severity.' },
  architect: { tier: 'opus', effort: 'xhigh', use: 'cross-module design, shared code, security or data-loss risk', preamble: 'Role: architect. Trace the whole flow and every caller before choosing; list failure modes; prefer the smallest change that fixes the root cause.' },
};

// When the role answer is unsure, the tier picks a general-purpose role (never an arbitrary specialist).
const DEFAULT_ROLE = { haiku: 'scribe', sonnet: 'implementer', opus: 'architect' };

const QUESTIONS = {
  role: { type: 'choice', instructions: 'Which working role fits this coding task best?', criteria: Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [k, v.use])) },
  tier: {
    type: 'choice', instructions: 'Smallest model tier that does this task well?',
    criteria: { haiku: 'Mechanical, one file, known pattern', sonnet: 'A normal feature or bug in one area', opus: 'Touches shared code (sync, proxy, schema, auth), several modules, or needs design judgment' },
  },
  thinking: {
    type: 'choice', instructions: 'How much thinking effort does this task need?',
    criteria: { low: 'Obvious and mechanical, no reasoning needed', medium: 'A normal task with a few steps', high: 'Needs careful reasoning: tricky logic, several modules, easy to get subtly wrong', xhigh: 'Hard design or a high-stakes decision where a wrong call is expensive' },
  },
  followup: { type: 'noul', instructions: 'Is this only meaningful inside the current conversation?', criteria: { true: 'Refers to earlier messages ("do that", "the second one")', false: 'Self-contained' } },
};

const MIN_CONFIDENCE = 0.6;
const FOLLOWUP_MAX = 0.5;
const rank = (t) => TIERS[t].rank;
const maxTier = (...ts) => ts.filter(Boolean).sort((a, b) => rank(b) - rank(a))[0];
const clampEffort = (e, lo, hi) => EFFORTS[Math.min(Math.max(EFFORTS.indexOf(e), EFFORTS.indexOf(lo)), EFFORTS.indexOf(hi))];

export async function routeTask(task, { decide = askDecide, tasksText, private: priv = false } = {}) {
  const text = tasksText ?? (existsSync('docs/plans/TASKS.md') ? readFileSync('docs/plans/TASKS.md', 'utf8') : '');
  const ticket = ticketTier(task, text)?.tier;
  const risky = HARD.test(task) ? 'opus' : null;
  const why = [];
  const r = await decide({ tag: 'route', timeout_ms: 10_000, private: priv, state: { task }, questions: QUESTIONS });

  let role, modelTier, modelEffort, followup = 0;
  if (r.ok) {
    const a = r.answers;
    const sure = (q) => a[q].confidence >= MIN_CONFIDENCE;
    followup = a.followup.noul;
    if (sure('tier')) modelTier = a.tier.choice; else why.push(`tier unsure (${a.tier.confidence.toFixed(2)})`);
    if (sure('role')) role = a.role.choice; else why.push(`role unsure (${a.role.confidence.toFixed(2)})`);
    if (sure('thinking')) modelEffort = a.thinking.choice;
  } else {
    why.push('decision backends unavailable, used the keyword heuristic');
    modelTier = classify(task, text)?.tier;
  }

  const tier = maxTier(modelTier, role && ROLES[role].tier, ticket, risky);
  if (ticket) why.push(`ticket tag: ${ticket}`);
  if (risky) why.push('risky keywords: floor opus');
  if (!tier || (followup > FOLLOWUP_MAX && !ticket)) {
    return { route: 'self', why: [...why, !tier ? 'no confident evidence: handle it yourself' : 'short in-conversation reply'], decidedBy: r.backend ?? 'heuristic' };
  }
  role ??= DEFAULT_ROLE[tier];
  let effort = modelEffort ?? ROLES[role].effort;
  effort = clampEffort(effort, tier === 'opus' ? 'medium' : 'low', tier === 'haiku' ? 'medium' : 'xhigh');
  if (risky) effort = clampEffort(effort, 'high', 'xhigh');
  return {
    route: 'delegate', tier, agent: TIERS[tier].agent, model: TIERS[tier].model, role, effort,
    cliFlags: `--model ${tier} --effort ${effort}`,
    preamble: `${ROLES[role].preamble}\nThinking: ${effort}. ${EFFORT_HINT[effort][0].toUpperCase()}${EFFORT_HINT[effort].slice(1)}.`,
    why, decidedBy: r.backend ?? 'heuristic', ms: r.ms,
  };
}

/** The prompt to hand to the tier agent: role + thinking preamble, then the self-contained task. */
export const delegationPrompt = (route, task) => `${route.preamble}\n\nTASK:\n${task}`;

async function selfcheck() {
  const assert = (await import('node:assert/strict')).default;
  const tasks = '- [ ] **WDL-16 Drive pull** x **L** · Opus\n- [ ] **WDL-01 Types** x **S** · Haiku';
  const ans = (o) => async () => ({ ok: true, backend: 'fake', ms: 1, answers: {
    role: { choice: o.role ?? 'implementer', confidence: o.rc ?? 0.9 }, tier: { choice: o.tier ?? 'sonnet', confidence: o.tc ?? 0.9 },
    thinking: { choice: o.think ?? 'medium', confidence: o.hc ?? 0.9 }, followup: { noul: o.fu ?? 0.1 } } });
  const run = (task, o, extra = {}) => routeTask(task, { decide: ans(o), tasksText: tasks, ...extra });

  let r = await run('do WDL-16 next', { tier: 'haiku', role: 'scribe', think: 'low' });
  assert.equal(r.tier, 'opus', 'ticket tag raises a low model answer'); assert.ok(r.why.some((w) => w.includes('ticket')));
  r = await run('refactor the Drive sync pull to paginate', { tier: 'sonnet', think: 'medium' });
  assert.equal(r.tier, 'opus', 'risky keywords floor to opus'); assert.ok(['high', 'xhigh'].includes(r.effort));
  r = await run('rename the helper in utils/foo.ts please', { tier: 'haiku', role: 'scribe', think: 'low' });
  assert.deepEqual([r.tier, r.role, r.effort], ['haiku', 'scribe', 'low']); assert.equal(r.cliFlags, '--model haiku --effort low');
  r = await run('hmm maybe do something here', { tc: 0.4, rc: 0.4, hc: 0.4 });
  assert.equal(r.route, 'self', 'low confidence and no evidence: handle it yourself');
  r = await run('yes do that one', { fu: 0.9 });
  assert.equal(r.route, 'self', 'follow-up replies stay in the conversation');
  r = await run('review this diff for bugs', { role: 'reviewer', tier: 'sonnet', think: 'low' });
  assert.equal(r.tier, 'opus', 'role tier raises the model tier'); assert.equal(r.effort, 'medium', 'opus never thinks below medium');
  r = await run('plan the change', { rc: 0.3, tier: 'opus', tc: 0.9, think: 'high' });
  assert.equal(r.role, 'architect', 'unsure role + opus defaults to architect, not an arbitrary specialist');
  r = await run('plan the change', { rc: 0.3, tier: 'sonnet', tc: 0.9 });
  assert.equal(r.role, 'implementer');
  r = await routeTask('add a settings toggle for the editor panel component with tests', { decide: async () => ({ ok: false, attempts: [] }), tasksText: tasks });
  assert.equal(r.decidedBy, 'heuristic'); assert.equal(r.route, 'delegate'); assert.ok(r.why.some((w) => w.includes('unavailable')));
  console.log('route selfcheck ok');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--selfcheck') await selfcheck();
  else {
    const priv = argv.includes('--private');
    const task = argv.filter((x) => x !== '--private').join(' ');
    console.log(JSON.stringify(await routeTask(task, { private: priv }), null, 2));
  }
}
