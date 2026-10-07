#!/usr/bin/env node
// Heuristic tier router (no model call, no network). UserPromptSubmit hook: prompt JSON on stdin,
// prints a one-line routing suggestion. Any error / OFF / skip condition = print nothing, exit 0.
// CLI: node .claude/hooks/tier-router.mjs on | off | status
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OFF = join(ROOT, '.claude', 'tier-router.off');
const TASKS = join(ROOT, 'docs', 'plans', 'TASKS.md');
const AGENT = { haiku: 'tier-haiku', sonnet: 'tier-sonnet', opus: 'tier-opus' };

const FOLLOWUP = /^(yes|yep|no|ok|okay|go|go on|proceed|continue|do it|sure|thanks|thank you|stop|retry|try again|why|and)\b/i;
export const HARD = /\b(architect\w*|security|auth(?:enticat\w*|oriz\w*)?|migrat\w*|refactor\w*|race condition|concurren\w*|root cause|investigate|sync|proxy|schema|data loss|design\b.*\b(system|api)|multi-?file|across (the )?(app|modules?)|review the (plan|code))\b/i;
const EASY = /\b(rename|typo|one[- ]liner|add (a )?(type|const|comment|label)|what is|where is|which file|bump|format|lint fix|docs? row)\b/i;

// Ticket lines in TASKS.md end with "· Haiku|Sonnet|Opus"; a mentioned ticket id wins over keywords.
export function ticketTier(prompt, tasksText) {
  for (const [, id] of prompt.matchAll(/\b([A-Z]{2,5}-\d+)\b/g)) {
    const line = tasksText.split('\n').find((l) => l.includes(`**${id} `) || l.includes(`**${id}**`));
    const m = line?.match(/·\s*(Haiku|Sonnet|Opus)\s*$/i);
    if (m) return { tier: m[1].toLowerCase(), why: `ticket ${id}` };
  }
  return null;
}

export function classify(prompt, tasksText = '') {
  const p = prompt.trim();
  if (!p || p.startsWith('/')) return null;
  const t = ticketTier(p, tasksText);
  if (t) return t;
  if (FOLLOWUP.test(p) || p.length < 60) return null;
  if (HARD.test(p) || p.length > 1200) return { tier: 'opus', why: 'shared-code/design keywords or long brief' };
  if (EASY.test(p) && p.length < 300) return { tier: 'haiku', why: 'mechanical keywords' };
  return { tier: 'sonnet', why: 'default for a normal task' };
}

function hook() {
  try {
    if (process.env.TIER_ROUTER_SKIP || existsSync(OFF) || existsSync(join(homedir(), '.jev', 'router.on'))) return;
    const prompt = String(JSON.parse(readFileSync(0, 'utf8')).prompt ?? '');
    const r = classify(prompt, existsSync(TASKS) ? readFileSync(TASKS, 'utf8') : '');
    if (!r) return;
    const note = `[tier router] Suggested tier: ${r.tier} (${r.why}). For a substantial coding task, delegate with the Agent tool, subagent_type "${AGENT[r.tier]}", using a fully self-contained prompt (plan path, ticket text verbatim, files, checks). Run pnpm lint and pnpm test yourself on the result. Handle it yourself if delegation is clearly wrong (small edit, conversation-dependent, or needs your context) and say why.`;
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: note } }));
  } catch {}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cmd = process.argv[2];
  if (cmd === 'on') { rmSync(OFF, { force: true }); console.log('tier router ON'); }
  else if (cmd === 'off') { writeFileSync(OFF, ''); console.log('tier router OFF'); }
  else if (cmd === 'status') console.log(`tier router: ${existsSync(OFF) ? 'OFF' : 'ON'}${existsSync(join(homedir(), '.jev', 'router.on')) ? ' (suppressed: Jev router is ON)' : ''}`);
  else hook();
}
