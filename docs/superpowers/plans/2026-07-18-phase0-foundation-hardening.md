# Phase 0: Foundation Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the verified foundation debt in Kollektiv (broken production server branch, untested LLM core, cross-origin proxy exposure, unconfirmed destructive assistant tools, 1,200-line `App.tsx`, no E2E canary) so every later feature/polish phase builds on solid ground.

**Architecture:** Kollektiv is a local-first React 19 + Vite 5 SPA with an Express 5 companion server (`server.ts`, run via `npx tsx server.ts` on port 7500) that acts purely as a proxy/bridge. This plan makes surgical fixes: no new abstractions, no dependency additions except `@playwright/test` (dev). Extractions from `App.tsx` are pure moves — zero behavior change, verified by `tsc` and the E2E smoke test added at the end.

**Tech Stack:** React 19, TypeScript 5.4, Vite 5, Express 5, Vitest 3 (existing, zero-config), Playwright (new devDep), pnpm 11.

## Global Constraints

- Package manager is **pnpm** (`packageManager: pnpm@11.5.3`). Never use npm/yarn to install.
- The working tree has **pre-existing uncommitted changes** unrelated to this plan. Stage ONLY the files named in each task (`git add <exact paths>`). NEVER `git add -A` or `git add .`.
- Type gate for every task: `pnpm lint` (this runs `tsc --noEmit`). It must pass before every commit.
- Platform is Windows; a POSIX bash shell is available (Git Bash). Commands below are bash syntax.
- Do not add runtime dependencies. The only new dependency in this plan is `@playwright/test` (dev, Task 10).
- Do not reformat or restyle code you aren't changing. Match existing style: 4-space indent in most files, single quotes, semicolons.
- The dev server on port 7500 may be running (user's own instance). Never start a second dev instance — for server tests use a different port (7599), for E2E use `vite preview` on 4173.

---

### Task 1: Unit tests for the LLM core (`llmService`)

The provider-agnostic LLM façade (`services/llmService.ts`) has zero tests despite containing the app's most-reused pure logic. Add tests for `cleanLLMResponse`, `buildMidjourneyParams`, `buildContextForEnhancer`, `getActiveProvider`, and `stripReasoningTags`. `stripReasoningTags` is currently module-private; export it (it's pure and worth testing directly).

**Files:**
- Modify: `services/llmService.ts:501` (add `export` to `stripReasoningTags`)
- Test: `services/llmService.test.ts` (create)

**Interfaces:**
- Consumes: existing exports of `services/llmService.ts` — `cleanLLMResponse(text: string): string`, `buildMidjourneyParams(modifiers: PromptModifiers): string`, `buildContextForEnhancer(modifiers: PromptModifiers, isAudio?: boolean): string`, `getActiveProvider(settings: LLMSettings): LLMProvider`.
- Produces: `export async function* stripReasoningTags(stream: AsyncGenerator<string>): AsyncGenerator<string>` (newly exported, same behavior).

- [ ] **Step 1: Write the failing test file**

Create `services/llmService.test.ts`. Note the three `vi.mock` calls: `llmService.ts` statically imports `geminiService`, `ollamaService`, and `llamacppService` at module top; auto-mocking them keeps the test node-safe without pulling provider SDK behavior. `constants/models` is pure data and needs no mock.

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('./geminiService');
vi.mock('./ollamaService');
vi.mock('./llamacppService');

import {
    cleanLLMResponse,
    buildMidjourneyParams,
    buildContextForEnhancer,
    getActiveProvider,
    stripReasoningTags,
} from './llmService';
import type { LLMSettings, PromptModifiers } from '../types';

async function* chunks(arr: string[]): AsyncGenerator<string> {
    for (const c of arr) yield c;
}

const collect = async (gen: AsyncGenerator<string>): Promise<string> => {
    let out = '';
    for await (const c of gen) out += c;
    return out;
};

describe('cleanLLMResponse', () => {
    it('strips <think> blocks and boilerplate opener lines', () => {
        const raw = '<think>internal reasoning</think>Here is your prompt:\nA neon city at dusk';
        expect(cleanLLMResponse(raw)).toBe('A neon city at dusk');
    });

    it('unwraps fenced code blocks and removes backticks', () => {
        const raw = '```json\n{"subject":"cat"}\n```';
        expect(cleanLLMResponse(raw)).toBe('{"subject":"cat"}');
    });

    it('strips leading list markers per line', () => {
        const raw = '1. first idea\n- second idea\n* third idea';
        expect(cleanLLMResponse(raw)).toBe('first idea\nsecond idea\nthird idea');
    });

    it('drops empty lines', () => {
        const raw = 'line one\n\n\nline two';
        expect(cleanLLMResponse(raw)).toBe('line one\nline two');
    });
});

describe('buildMidjourneyParams', () => {
    it('emits only non-default params, in canonical order', () => {
        const modifiers: PromptModifiers = {
            mjAspectRatio: '16:9',
            mjChaos: '0',        // default -> omitted
            mjStylize: '250',    // non-default -> included
            mjTile: true,
        };
        expect(buildMidjourneyParams(modifiers)).toBe('--ar 16:9 --s 250 --tile');
    });

    it('returns empty string for no modifiers', () => {
        expect(buildMidjourneyParams({})).toBe('');
    });
});

describe('buildContextForEnhancer', () => {
    it('returns empty string when no modifiers are set', () => {
        expect(buildContextForEnhancer({})).toBe('');
    });

    it('builds an [Architectural Constraints] block with labeled lines', () => {
        const out = buildContextForEnhancer({ artStyle: 'Cubism', lighting: 'Studio Lighting' });
        expect(out).toContain('[Architectural Constraints]');
        expect(out).toContain('Movement: Cubism');
        expect(out).toContain('Lighting: Studio Lighting');
    });

    it('describes film stock as authentic analog load only for analog cameras', () => {
        const analog = buildContextForEnhancer({ cameraType: 'Analog Film Camera', filmStock: 'Kodak Portra 400' });
        expect(analog).toContain('Authentic Analog Load: Kodak Portra 400 film stock');
        const digital = buildContextForEnhancer({ cameraType: 'DSLR', filmStock: 'Kodak Portra 400' });
        expect(digital).toContain('Digital Capture Post-Processed to Emulate: Kodak Portra 400 aesthetic');
    });

    it('only includes music fields when isAudio is true', () => {
        const mods: PromptModifiers = { musicGenre: 'Synthwave' };
        expect(buildContextForEnhancer(mods, false)).toBe('');
        expect(buildContextForEnhancer(mods, true)).toContain('Music Genre: Synthwave');
    });
});

describe('getActiveProvider', () => {
    const base = { activeLLM: 'gemini' } as LLMSettings;
    it('collapses ollama_cloud to ollama', () => {
        expect(getActiveProvider({ ...base, activeLLM: 'ollama_cloud' })).toBe('ollama');
    });
    it('defaults to gemini', () => {
        expect(getActiveProvider(base)).toBe('gemini');
    });
    it('passes through anthropic, openrouter, llamacpp', () => {
        expect(getActiveProvider({ ...base, activeLLM: 'anthropic' })).toBe('anthropic');
        expect(getActiveProvider({ ...base, activeLLM: 'openrouter' })).toBe('openrouter');
        expect(getActiveProvider({ ...base, activeLLM: 'llamacpp' })).toBe('llamacpp');
    });
});

describe('stripReasoningTags', () => {
    it('removes a think block contained in a single chunk', async () => {
        const out = await collect(stripReasoningTags(chunks(['<think>x</think>result'])));
        expect(out).toBe('result');
    });

    it('removes a think block spanning multiple chunks', async () => {
        const out = await collect(stripReasoningTags(chunks(['<think>a', 'b</think>', 'result'])));
        expect(out).toBe('result');
    });

    it('passes through chunks without tags untouched', async () => {
        const out = await collect(stripReasoningTags(chunks(['hello ', 'world'])));
        expect(out).toBe('hello world');
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run services/llmService.test.ts`
Expected: FAIL — `stripReasoningTags` is not exported (`SyntaxError` / "does not provide an export named 'stripReasoningTags'"). The other suites may pass; the import failure fails the whole file, which is the red state we want.

- [ ] **Step 3: Export `stripReasoningTags`**

In `services/llmService.ts` (currently line 501), change:

```ts
async function* stripReasoningTags(stream: AsyncGenerator<string>): AsyncGenerator<string> {
```

to:

```ts
export async function* stripReasoningTags(stream: AsyncGenerator<string>): AsyncGenerator<string> {
```

No other changes to the file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run services/llmService.test.ts`
Expected: PASS (14 tests). If any `cleanLLMResponse` assertion fails, do NOT change `llmService.ts` behavior — fix the test's expectation to match actual observed output and note the discrepancy in the commit message.

- [ ] **Step 5: Type gate + full test suite**

Run: `pnpm lint && pnpm test`
Expected: tsc clean; all pre-existing tests (`assistantProtocol.test.ts`, `modifierOptionsService.test.ts`, `manifestStore.test.ts`, `memoryStorage.test.ts`, `notesStorage.test.ts`, `assistantMode.test.ts`) still pass.

- [ ] **Step 6: Commit**

```bash
git add services/llmService.ts services/llmService.test.ts
git commit -m "test(llm): cover cleanLLMResponse, modifier builders, provider mapping, reasoning-tag stripping"
```

---

### Task 2: Fix the broken production server branch

`server.ts`'s production branch uses `app.get('*', ...)`, which Express 5 + path-to-regexp 8 reject at startup (`TypeError: Missing parameter name`). Replace with an `app.use` fallback — same SPA behavior, Express-5-legal.

**Files:**
- Modify: `server.ts:1083-1090` (the `else` branch of the Vite middleware section)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: a working `NODE_ENV=production` code path (used by Task 10's preview alternative and any future packaging).

- [ ] **Step 1: Reproduce the failure**

```bash
pnpm build
NODE_ENV=production PORT=7599 timeout 15 npx tsx server.ts
```

Expected: the process crashes with a path-to-regexp error mentioning the `*` route (this is the bug). If it does NOT crash, stop and re-read `server.ts` — the bug may already be fixed; skip this task.

- [ ] **Step 2: Apply the fix**

In `server.ts`, find:

```ts
  } else {
    // In production, serve the built dist directory
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
```

Replace with:

```ts
  } else {
    // In production, serve the built dist directory
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // SPA fallback. Express 5 (path-to-regexp 8) rejects app.get('*'),
    // so use a plain middleware for the catch-all.
    app.use((_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
```

- [ ] **Step 3: Verify the production server boots and serves**

```bash
NODE_ENV=production PORT=7599 npx tsx server.ts &
sleep 5
curl -s http://127.0.0.1:7599/api/health
curl -s http://127.0.0.1:7599/ | head -c 200
curl -s http://127.0.0.1:7599/some/spa/route | head -c 200
kill %1
```

Expected: `{"status":"ok"}`, then the `dist/index.html` content (starts with `<!DOCTYPE html>`) for both `/` and the deep SPA route.

- [ ] **Step 4: Verify dev mode is untouched**

Run: `pnpm lint`
Expected: clean. (Do not start a dev instance — the user's own dev server may hold port 7500.)

- [ ] **Step 5: Commit**

```bash
git add server.ts
git commit -m "fix(server): Express 5-compatible SPA fallback in production branch"
```

---

### Task 3: Same-origin guard on the proxy server

Every route on `server.ts` proxies requests — several with auth headers — and none check the caller. Browsers attach an `Origin` header to all cross-origin requests (and all POSTs); rejecting foreign origins blocks any malicious website from driving the local proxy (CSRF/drive-by against `localhost:7500`). Same-origin GETs send no `Origin` and pass through; same-origin POSTs send a matching one.

**Files:**
- Modify: `server.ts:16-18` (insert middleware immediately after `const HOST = ...`, BEFORE the `/google-api` route, which must stay the first route so it keeps seeing raw bodies)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: all `server.ts` routes now 403 cross-origin browser callers. No client change needed (the app is same-origin).

- [ ] **Step 1: Insert the middleware**

In `server.ts`, directly after:

```ts
  // Explicit opt-in only: HOST=0.0.0.0 for containerized/cloud runs. Never inferred from PORT.
  const HOST = process.env.HOST || "127.0.0.1";
```

insert:

```ts
  // Reject cross-origin browser requests. This server proxies traffic with
  // auth headers (Google, Anthropic, MCP, CDP), so only the Kollektiv
  // front-end served from this same host may call it. Same-origin GETs send
  // no Origin header; same-origin POSTs send one that matches Host.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!origin) return next();
    try {
      if (new URL(origin).host === req.headers.host) return next();
    } catch { /* malformed Origin falls through to 403 */ }
    res.status(403).json({ error: "Cross-origin requests are not allowed" });
  });
```

- [ ] **Step 2: Verify allowed and blocked cases**

```bash
PORT=7599 npx tsx server.ts &
sleep 5
# No Origin (same-origin GET / curl): allowed
curl -s http://127.0.0.1:7599/api/health
# Matching Origin: allowed
curl -s -H "Origin: http://127.0.0.1:7599" http://127.0.0.1:7599/api/health
# Foreign Origin: blocked
curl -s -o /dev/null -w "%{http_code}" -H "Origin: https://evil.example" -H "x-target-url: https://api.example.com" http://127.0.0.1:7599/proxy-remote/v1/models
kill %1
```

Expected: `{"status":"ok"}` twice, then `403`.

- [ ] **Step 3: Type gate**

Run: `pnpm lint`
Expected: clean. (If tsc complains that `new URL` needs a string, the code above already guards: `origin` is narrowed by the `if (!origin)` return.)

- [ ] **Step 4: Commit**

```bash
git add server.ts
git commit -m "security(server): reject cross-origin requests to proxy endpoints"
```

---

### Task 4: Single source of truth for the Anthropic default model

The fallback model id `claude-3-7-sonnet-20250219` is hardcoded in two places (`server.ts:393`, `components/settings/IntegrationsSection.tsx:85` and `:102`). Extract to a shared constant so a model deprecation is a one-line fix.

**Files:**
- Create: `constants/llmDefaults.ts`
- Modify: `server.ts:393`, `components/settings/IntegrationsSection.tsx:85,102`

**Interfaces:**
- Produces: `export const DEFAULT_ANTHROPIC_MODEL = 'claude-3-7-sonnet-20250219';` in `constants/llmDefaults.ts` — importable from both server (tsx) and client (Vite) code.

- [ ] **Step 1: Create the constants module**

Create `constants/llmDefaults.ts`:

```ts
// Single source of truth for provider model fallbacks.
// Imported by BOTH the Express server (server.ts, runs under tsx) and the
// client settings UI — keep this file dependency-free and side-effect-free.
export const DEFAULT_ANTHROPIC_MODEL = 'claude-3-7-sonnet-20250219';
```

- [ ] **Step 2: Use it in `server.ts`**

Add to the imports at the top of `server.ts`:

```ts
import { DEFAULT_ANTHROPIC_MODEL } from "./constants/llmDefaults";
```

Then find (line ~393):

```ts
        model: settings.anthropicModel || 'claude-3-7-sonnet-20250219',
```

replace with:

```ts
        model: settings.anthropicModel || DEFAULT_ANTHROPIC_MODEL,
```

- [ ] **Step 3: Use it in the settings UI**

In `components/settings/IntegrationsSection.tsx`, add to the imports:

```ts
import { DEFAULT_ANTHROPIC_MODEL } from '../../constants/llmDefaults';
```

Replace BOTH occurrences of

```tsx
value={settings.anthropicModel || 'claude-3-7-sonnet-20250219'}
```

(lines ~85 and ~102) with:

```tsx
value={settings.anthropicModel || DEFAULT_ANTHROPIC_MODEL}
```

Leave the `<option>` lists untouched.

- [ ] **Step 4: Verify**

Run: `pnpm lint`
Expected: clean.

Run: `grep -rn "claude-3-7-sonnet-20250219" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v llmDefaults`
Expected: only hits inside `<option value=...>` JSX in `IntegrationsSection.tsx` (user-visible choices, fine) — no remaining *fallback* logic hits.

- [ ] **Step 5: Commit**

```bash
git add constants/llmDefaults.ts server.ts components/settings/IntegrationsSection.tsx
git commit -m "refactor: extract Anthropic default model to shared constant"
```

---

### Task 5: Confirmation gate on destructive Gmail assistant tools

**Status: implemented then reverted 2026-07-24 — explicit user decision, not an
oversight.** `send_gmail` and `delete_gmail` execute inside an autonomous tool
loop (up to 8 rounds) with no user confirmation, by design: the user considers
Google OAuth consent (granting the app Gmail API access at all) sufficient
permission and wants the assistant to act fully autonomously with no
per-action prompt, having tried the gate below live and found it unwanted
friction. See ISSUES.md ISSUE-22 for the full history. **Do not re-add this
gate without the user asking again.** Steps below are left in place as a
record of what was built and removed, not as an outstanding TODO.

`send_gmail` and `delete_gmail` execute inside an autonomous tool loop (up to 8 rounds) with no user confirmation. Add a blocking, per-action `window.confirm` gate. Native confirm is deliberate (ponytail: platform feature over new UI) — it is synchronous, cannot be dismissed by the model, and the codebase already uses `confirm()` for the emergency reset in `App.tsx`. A styled in-app modal can replace it in a later polish phase without touching the contract.

**Files:**
- Modify: `services/assistantTools.ts` (helper near the top; two `execute` functions at lines ~916 and ~968)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `confirmSensitiveAction(summary: string): boolean` (module-private helper in `assistantTools.ts`). Declined actions return a string starting with `'User declined:'` — the LLM sees this as the tool result and must not retry.

- [x] **Step 1: Add the helper**

In `services/assistantTools.ts`, directly after the `PAGES` constant (line ~35), add:

```ts
// Blocking, per-action user confirmation for destructive external actions.
// window.confirm is deliberate: synchronous, unmissable, and impossible for
// the tool loop to bypass. ponytail: upgrade to an in-app modal later.
const confirmSensitiveAction = (summary: string): boolean => {
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') return false;
    return window.confirm(`The assistant wants to:\n\n${summary}\n\nAllow this?`);
};
```

- [x] **Step 2: Gate `send_gmail`** (actual code uses `ensureGoogleToken()` + `authResult.token`, not the stale `ctx.settings.googleIdentity?.accessToken` check this step names — gate inserted after the real token check instead)

In the `send_gmail` tool's `execute` (line ~916), directly after the token check

```ts
            const token = ctx.settings.googleIdentity?.accessToken;
            if (!token) return 'Error: No Google Identity connected. Go to Settings > App > Storage and authorize Google Drive first.';
```

insert:

```ts
            if (!confirmSensitiveAction(`Send an email\nTo: ${String(args.to || '')}\nSubject: ${String(args.subject || '')}`)) {
                return 'User declined: the email was NOT sent. Do not retry unless the user explicitly asks again.';
            }
```

- [x] **Step 3: Gate `delete_gmail`** (same `ensureGoogleToken()` note as Step 2; also reused `wantsPermanent` in place of the duplicate `isPermanent` boolean instead of keeping both, per the note below — a smaller diff, not a bigger one)

In the `delete_gmail` tool's `execute` (line ~968), directly after

```ts
            const token = ctx.settings.googleIdentity?.accessToken;
            if (!token) return 'Error: No Google Identity connected.';
```

insert:

```ts
            const wantsPermanent = args.action === 'delete';
            if (!confirmSensitiveAction(`${wantsPermanent ? 'PERMANENTLY DELETE (irreversible)' : 'Move to trash'}\nGmail message: ${String(args.id)}`)) {
                return 'User declined: the message was NOT modified. Do not retry unless the user explicitly asks again.';
            }
```

(Superseded: reused `wantsPermanent` for the `try` block's `isPermanent` instead of keeping both — smaller diff, not bigger.)

- [x] **Step 4: Verify** — `tsc --noEmit` clean; `npx vitest run services/assistantTools.test.ts` (8/8 pass) and full suite (174/174 pass). Logged as ISSUES.md ISSUE-22.

**Step 5 (unplanned): Revert** — user tried the gate live, found it unwanted friction given OAuth consent already covers "permission." `confirmSensitiveAction` helper and both call sites removed 2026-07-24; `tsc --noEmit` clean, 174/174 tests pass after the revert.

- [ ] **Step 5: Commit**

```bash
git add services/assistantTools.ts
git commit -m "security(assistant): require user confirmation before send_gmail/delete_gmail"
```

---

### Task 6: Extract `InitialLoader` from `App.tsx`

Pure move. `InitialLoader` (~210 lines: typewriter status, GSAP progress bar, CONTINUE buttons) is defined inline in `App.tsx` and used only there.

**Files:**
- Create: `components/InitialLoader.tsx`
- Modify: `components/App.tsx` (delete inline definition at lines ~115-327; add import)

**Interfaces:**
- Produces: `components/InitialLoader.tsx` default-exports `InitialLoader: React.FC<{ status: string; progress: number | null; onContinue: (withMusic: boolean) => void }>`. Task 10's E2E test relies on its rendered buttons: `CONTINUE` and `CONTINUE WITHOUT MUSIC`.

- [ ] **Step 1: Create `components/InitialLoader.tsx`**

Move the component verbatim. The full new file is below. NOTE: the cursor ternary `{showCursor ? '_' : ' '}` contains a REAL non-breaking space (U+00A0) as its else-branch — it looks like a plain space but is not. Copy-paste preserves it; if you retype that line instead, use the escape form from the original `App.tsx`: a backslash immediately followed by u00A0, inside the single quotes. A plain ASCII space would collapse in JSX and make the cursor line jitter.

```tsx
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import ChromaticText from './ChromaticText';

const InitialLoader: React.FC<{ status: string; progress: number | null; onContinue: (withMusic: boolean) => void }> = ({ status, progress, onContinue }) => {
    const textWrapperRef = useRef<HTMLHeadingElement>(null);
    const logoFillRef = useRef<HTMLDivElement>(null);
    const systemTextRef = useRef<HTMLSpanElement>(null);
    const [displayStatus, setDisplayStatus] = useState<string>('');
    const [history, setHistory] = useState<string[]>([]);
    const [smoothPercentage, setSmoothPercentage] = useState(0);
    const [isComplete, setIsComplete] = useState(false);
    const actionButtonsRef = useRef<HTMLDivElement>(null);
    const progressStatusRef = useRef<HTMLDivElement>(null);
    const [showCursor, setShowCursor] = useState(true);

    // Blinking cursor
    useEffect(() => {
        const interval = setInterval(() => {
            setShowCursor(prev => !prev);
        }, 500);
        return () => clearInterval(interval);
    }, []);

    // Simple and robust typewriter effect for the current status
    useEffect(() => {
        if (!status) return;
        const formatted = `> ${status.toUpperCase()}`;
        setHistory(prev => {
            if (prev.includes(formatted)) return prev;
            return [...prev, formatted].slice(-2);
        });

        let isCancelled = false;
        let i = 0;
        const typeChar = () => {
            if (isCancelled) return;
            if (i <= formatted.length) {
                setDisplayStatus(formatted.substring(0, i));
                i++;
                setTimeout(typeChar, 15);
            }
        };
        typeChar();
        return () => {
            isCancelled = true;
        };
    }, [status]);

    const displayPercentageRef = useRef(0);
    const targetPercentage = Math.round((progress || 0) * 100);

    // Animate the smooth percentage smoothly
    useEffect(() => {
        const obj = { val: displayPercentageRef.current };
        const animation = gsap.to(obj, {
            val: targetPercentage,
            duration: 0.4,
            ease: "power2.out",
            onUpdate: () => {
                displayPercentageRef.current = obj.val;
                setSmoothPercentage(Math.round(obj.val));
            }
        });
        return () => {
            animation.kill();
        };
    }, [targetPercentage]);

    useLayoutEffect(() => {
        if (!textWrapperRef.current) return;
        gsap.fromTo(textWrapperRef.current,
            { yPercent: 100, autoAlpha: 0 },
            { yPercent: 0, autoAlpha: 1, duration: 1.5, ease: "expo.out" }
        );

        if (logoFillRef.current) {
            gsap.fromTo(logoFillRef.current,
                { width: '0%' },
                {
                    width: '100%',
                    duration: 2.5,
                    ease: "power2.inOut",
                    delay: 0.5
                }
            );
        }

        if (systemTextRef.current) {
            gsap.fromTo(systemTextRef.current,
                { y: 24, autoAlpha: 0 },
                { y: 0, autoAlpha: 1, duration: 0.8, ease: "power2.out", delay: 3.2 }
            );
        }
    }, []);

    // Bulletproof check: mark complete when target reaches 100% and smooth animation matches
    useEffect(() => {
        if (targetPercentage >= 100 && smoothPercentage >= 99) {
            const t = setTimeout(() => {
                setIsComplete(true);
            }, 1000);
            return () => clearTimeout(t);
        }
    }, [targetPercentage, smoothPercentage]);

    const handleContinue = (withMusic: boolean) => {
        if (actionButtonsRef.current) {
            gsap.to(actionButtonsRef.current, { autoAlpha: 0, duration: 0.4 });
        }

        const footerEl = document.querySelector('#initial-loader .absolute.bottom-8');
        if (footerEl) gsap.to(footerEl, { autoAlpha: 0, duration: 0.4 });

        if (systemTextRef.current) {
            gsap.to(systemTextRef.current, { y: -20, autoAlpha: 0, duration: 0.6, ease: "power2.inOut" });
        }

        if (textWrapperRef.current) {
            gsap.to(textWrapperRef.current, {
                y: -80,
                autoAlpha: 0,
                duration: 0.8,
                ease: "expo.inOut",
                onComplete: () => {
                    onContinue(withMusic);
                }
            });
        } else {
            onContinue(withMusic);
        }
    };

    return (
        <div id="initial-loader" className="fixed inset-0 z-[500] flex flex-col items-center justify-center bg-base-100 text-base-content overflow-hidden select-none font-sans" style={{ background: 'oklch(var(--b1))', opacity: 1 }}>
            <div className="absolute inset-0 bg-grid-texture opacity-[0.03] pointer-events-none"></div>
            <div className="absolute inset-0 pointer-events-none opacity-20" style={{ backgroundImage: 'linear-gradient(transparent 50%, rgba(0, 0, 0, 0.25) 50%)', backgroundSize: '100% 4px', zIndex: 1 }}></div>

            <div className="relative z-10 flex flex-col items-center">
                <div className="mb-6 px-4 flex flex-col items-center">
                    <h1 ref={textWrapperRef} className="flex flex-col items-center text-2xl md:text-4xl font-normal tracking-widest uppercase select-none leading-none translate-y-[2px]">
                        <div className="grid grid-cols-1 grid-rows-1 font-monoton">
                            <span className="text-base-content/10 block leading-none py-2 row-start-1 col-start-1">
                                <ChromaticText enabled={false}>Kollektiv</ChromaticText><span className="text-primary/10 italic">.</span>
                            </span>

                            <div
                                ref={logoFillRef}
                                className="row-start-1 col-start-1 h-full overflow-hidden"
                                style={{ width: '0%' }}
                            >
                                <span className="text-base-content block whitespace-nowrap leading-none py-2 drop-shadow-[0_0_20px_rgba(var(--bc),0.15)]">
                                    <ChromaticText>Kollektiv</ChromaticText><span className="text-primary italic">.</span>
                                </span>
                            </div>
                        </div>
                    </h1>
                    <span
                        ref={systemTextRef}
                        className="block -mt-10 md:-mt-10 font-rainmaker text-primary text-xl md:text-5xl whitespace-nowrap leading-[0] pulse-glow pointer-events-none normal-case"
                    >
                        _Systems_
                    </span>
                </div>

                <div className="relative h-28 w-80">
                    {/* Progress Bar & Status - Crossfade out */}
                    <div ref={progressStatusRef} className={`absolute inset-0 flex flex-col items-center gap-4 transition-all duration-1000 origin-center ${isComplete ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}>
                        <div className="flex flex-col items-center gap-2 w-full">
                            {/* Minimal Progress Bar */}
                            <div className="flex flex-col items-center gap-1 mb-2">
                                <div className="w-48 h-[2px] bg-base-content/10 relative overflow-hidden rounded-full">
                                    <div
                                        className="absolute inset-y-0 left-0 bg-primary transition-all duration-500 ease-out"
                                        style={{ width: `${smoothPercentage}%` }}
                                    />
                                </div>
                                <span className="text-[9px] font-mono font-bold text-primary/60 tracking-widest">
                                    {smoothPercentage}%
                                </span>
                            </div>

                            <div className="flex flex-col items-start justify-end min-h-[48px] max-h-[48px] overflow-hidden leading-snug w-full px-6 text-[10px] font-mono font-bold uppercase tracking-widest text-left text-base-content/40">
                                {history.slice(-2).map((h, idx) => (
                                    <div key={idx} className="opacity-40 w-full truncate">{h}</div>
                                ))}
                                <div className="w-full truncate">{displayStatus}{showCursor ? '_' : ' '}</div>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons - Crossfade in */}
                    <div ref={actionButtonsRef} className={`absolute inset-0 flex flex-col items-center justify-center gap-4 transition-opacity duration-1000 ${isComplete ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                        <button
                            className="form-btn form-btn-primary w-48 h-10 text-[10px]"
                            onClick={() => handleContinue(true)}
                        >
                            CONTINUE
                        </button>
                        <button
                            className="text-xs font-rajdhani uppercase tracking-widest font-normal text-base-content/30 hover:text-base-content px-4 py-2 transition-colors bg-transparent hover:bg-transparent"
                            onClick={() => handleContinue(false)}
                        >
                            CONTINUE WITHOUT MUSIC
                        </button>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-[10px] font-mono uppercase tracking-widest text-base-content/40 opacity-70 flex flex-col items-center gap-0.5">
                <span className="font-bold text-base-content/30 text-[8px]">Built by</span>
                <span className="text-primary font-bold">MindTurbulence</span>
            </div>
        </div>
    );
};

export default InitialLoader;
```

- [ ] **Step 2: Update `App.tsx`**

1. Delete the entire inline `const InitialLoader: React.FC<...> = ... };` block (it begins right after the `ErrorBoundary` class, with the comment-free line `const InitialLoader: React.FC<{ status: string; progress: number | null; onContinue: (withMusic: boolean) => void }> = ({ status, progress, onContinue }) => {`, and ends at the matching `};` just before `interface PageFrameProps {`).
2. Add to the component imports near the other layout imports (`import Header from './Header';` block):

```ts
import InitialLoader from './InitialLoader';
```

The JSX usage `<InitialLoader status={initStatus} progress={initProgress} onContinue={handleInitContinue} />` stays unchanged.

- [ ] **Step 3: Verify**

Run: `pnpm lint && pnpm build`
Expected: both clean. If tsc reports unused imports in `App.tsx` (e.g. `useLayoutEffect` — it is still used by `PageFrame` and the reveal effect, so it should remain), remove only imports that are genuinely now unused. After this task `App.tsx` still uses: `gsap` (reveal + loader hide), `useLayoutEffect` (PageFrame + reveal).

- [ ] **Step 4: Commit**

```bash
git add components/InitialLoader.tsx components/App.tsx
git commit -m "refactor(app): extract InitialLoader into its own file (pure move)"
```

---

### Task 7: Extract `PageFrame` from `App.tsx`

Pure move. `PageFrame` (decorative frame + scan-line animation, ~90 lines) is defined inline and used only in `App.tsx`.

**Files:**
- Create: `components/PageFrame.tsx`
- Modify: `components/App.tsx` (delete inline `PageFrameProps` + `PageFrame`; add import)

**Interfaces:**
- Produces: `components/PageFrame.tsx` default-exports `PageFrame: React.FC<PageFrameProps>` and exports `interface PageFrameProps { isInitialized: boolean; frameWrapperRef: React.RefObject<HTMLDivElement>; scanTopRef: React.RefObject<HTMLSpanElement>; scanRightRef: React.RefObject<HTMLSpanElement>; scanBottomRef: React.RefObject<HTMLSpanElement>; scanLeftRef: React.RefObject<HTMLSpanElement>; }`.

- [ ] **Step 1: Create `components/PageFrame.tsx`**

```tsx
import React, { useLayoutEffect } from 'react';
import { gsap } from 'gsap';

export interface PageFrameProps {
    isInitialized: boolean;
    frameWrapperRef: React.RefObject<HTMLDivElement>;
    scanTopRef: React.RefObject<HTMLSpanElement>;
    scanRightRef: React.RefObject<HTMLSpanElement>;
    scanBottomRef: React.RefObject<HTMLSpanElement>;
    scanLeftRef: React.RefObject<HTMLSpanElement>;
}

const PageFrame: React.FC<PageFrameProps> = ({
    isInitialized,
    frameWrapperRef,
    scanTopRef,
    scanRightRef,
    scanBottomRef,
    scanLeftRef
}) => {
    useLayoutEffect(() => {
        if (!isInitialized || !frameWrapperRef.current) return;

        // Periodic Frame Scan Animation (Snake effect)
        // Triggered every 1 minute (60 seconds)
        const scanTl = gsap.timeline({
            repeat: -1,
            repeatDelay: 52, // exactly 1 minute cycle (60s total - 8s animation)
            delay: 15
        });

        const scanDuration = 2;
        const scanEase = "power1.inOut";

        if (scanTopRef.current && scanRightRef.current && scanBottomRef.current && scanLeftRef.current) {
            scanTl.set([scanTopRef.current, scanRightRef.current, scanBottomRef.current, scanLeftRef.current], { opacity: 0 });

            // Sequence: Top -> Right -> Bottom -> Left
            scanTl.fromTo(scanTopRef.current,
                { left: "-100%", opacity: 0 },
                { left: "100%", opacity: 1, duration: scanDuration, ease: scanEase }
            ).set(scanTopRef.current, { opacity: 0 });

            scanTl.fromTo(scanRightRef.current,
                { top: "-100%", opacity: 0 },
                { top: "100%", opacity: 1, duration: scanDuration, ease: scanEase }
            ).set(scanRightRef.current, { opacity: 0 });

            scanTl.fromTo(scanBottomRef.current,
                { right: "-100%", opacity: 0 },
                { right: "100%", opacity: 1, duration: scanDuration, ease: scanEase }
            ).set(scanBottomRef.current, { opacity: 0 });

            scanTl.fromTo(scanLeftRef.current,
                { bottom: "-100%", opacity: 0 },
                { bottom: "100%", opacity: 1, duration: scanDuration, ease: scanEase }
            ).set(scanLeftRef.current, { opacity: 0 });
        }

        return () => {
            scanTl.kill();
        };
    }, [isInitialized, frameWrapperRef, scanTopRef, scanRightRef, scanBottomRef, scanLeftRef]);

    return (
        <div ref={frameWrapperRef} className="fixed inset-0 z-[1000] pointer-events-none p-4 md:p-6">
            <div className="w-full h-full border border-base-content/5 relative main-app-frame">
                {/* Dedicated Clipping Container for Scan Lines */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                    <span ref={scanTopRef} className="absolute top-0 left-[-100%] w-full h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent z-10 opacity-0" />
                    <span ref={scanRightRef} className="absolute top-[-100%] right-0 w-[2px] h-full bg-gradient-to-b from-transparent via-primary to-transparent z-10 opacity-0" />
                    <span ref={scanBottomRef} className="absolute bottom-0 right-[-100%] w-full h-[2px] bg-gradient-to-l from-transparent via-primary to-transparent z-10 opacity-0" />
                    <span ref={scanLeftRef} className="absolute bottom-[-100%] left-0 w-[2px] h-full bg-gradient-to-t from-transparent via-primary to-transparent z-10 opacity-0" />
                </div>

                {/* Corner Accents */}
                <div className="absolute -top-[1px] -left-[1px] w-4 h-4 border-t border-l border-primary/20 corner-accent" />
                <div className="absolute -top-[1px] -right-[1px] w-4 h-4 border-t border-r border-primary/20 corner-accent" />
                <div className="absolute -bottom-[1px] -left-[1px] w-4 h-4 border-b border-l border-primary/20 corner-accent" />
                <div className="absolute -bottom-[1px] -right-[1px] w-4 h-4 border-b border-r border-primary/20 corner-accent" />

                {/* Side Markers */}
                <div className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-2 side-marker">
                    <div className="w-[1px] h-4 bg-primary/10" />
                    <div className="w-[1px] h-[1px] bg-primary/20" />
                    <div className="w-[1px] h-4 bg-primary/10" />
                </div>

                <div className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 flex flex-col gap-2 side-marker">
                    <div className="w-[1px] h-4 bg-primary/10" />
                    <div className="w-[1px] h-[1px] bg-primary/20" />
                    <div className="w-[1px] h-4 bg-primary/10" />
                </div>
            </div>
        </div>
    );
};

export default PageFrame;
```

- [ ] **Step 2: Update `App.tsx`**

1. Delete the inline `interface PageFrameProps { ... }` and `const PageFrame: React.FC<PageFrameProps> = ... };` block (between the deleted `InitialLoader` location and `const App: React.FC = () => {`).
2. Add import next to the `InitialLoader` import:

```ts
import PageFrame from './PageFrame';
```

The JSX usage in `AppContent` stays unchanged.

- [ ] **Step 3: Verify**

Run: `pnpm lint && pnpm build`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add components/PageFrame.tsx components/App.tsx
git commit -m "refactor(app): extract PageFrame into its own file (pure move)"
```

---

### Task 8: Extract the idle system into `useIdleSystem`

Behavior-preserving extraction of the idle/standby machinery (state + refs + two effects + reset callback) from `AppContent` into a hook. Hooks live in `utils/` in this codebase (`useLocalStorage`, `useObjectUrls`, `useAutosizeTextArea`).

**Files:**
- Create: `utils/useIdleSystem.ts`
- Modify: `components/App.tsx` (remove idle state/refs/effects; use the hook)

**Interfaces:**
- Produces: `export function useIdleSystem(isIdleEnabled: boolean, idleTimeoutMinutes: number): { isIdle: boolean; resetIdleTimer: (forceWake?: boolean) => void; goIdle: () => void }`.

- [ ] **Step 1: Create `utils/useIdleSystem.ts`**

```ts
import { useState, useRef, useCallback, useEffect } from 'react';
import { audioService } from '../services/audioService';

/**
 * Idle/standby detection for the app shell. Arms a timeout from settings;
 * any user activity resets it (and performs the one-time WebAudio unlock).
 * Extracted verbatim from App.tsx — behavior must not change.
 */
export function useIdleSystem(isIdleEnabled: boolean, idleTimeoutMinutes: number) {
    const [isIdle, setIsIdle] = useState(false);
    const idleTimerRef = useRef<number | null>(null);
    const isIdleRef = useRef(false);

    const resetIdleTimer = useCallback((forceWake: boolean = true) => {
        if (forceWake && isIdleRef.current) {
            setIsIdle(false);
            isIdleRef.current = false;
        }

        if (idleTimerRef.current) {
            window.clearTimeout(idleTimerRef.current);
        }

        if (!isIdleEnabled) return;

        idleTimerRef.current = window.setTimeout(() => {
            setIsIdle(true);
            isIdleRef.current = true;
        }, idleTimeoutMinutes * 60000);
    }, [isIdleEnabled, idleTimeoutMinutes]);

    useEffect(() => {
        if (!isIdleEnabled && isIdleRef.current) {
            setIsIdle(false);
            isIdleRef.current = false;
        }
        resetIdleTimer(false);
    }, [isIdleEnabled, resetIdleTimer]);

    useEffect(() => {
        const handleUserActivity = () => {
            resetIdleTimer(true);
            // One-time audio unlock
            audioService.resume();
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                resetIdleTimer(isIdleRef.current);
            }
        };

        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

        events.forEach(name => window.addEventListener(name, handleUserActivity, { passive: true }));
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleUserActivity);

        resetIdleTimer(false);

        return () => {
            events.forEach(name => window.removeEventListener(name, handleUserActivity));
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleUserActivity);
            if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
        };
    }, [resetIdleTimer]);

    /** Force standby now (Header standby button). */
    const goIdle = useCallback(() => {
        setIsIdle(true);
        isIdleRef.current = true;
    }, []);

    return { isIdle, resetIdleTimer, goIdle };
}
```

- [ ] **Step 2: Rewire `App.tsx`**

In `AppContent`:

1. Delete these declarations:
   - `const [isIdle, setIsIdle] = useState(false);`
   - the `// --- IDLE STATE REFS ---` block (`idleTimerRef`, `isIdleRef`)
   - the entire `const resetIdleTimer = useCallback(...)` definition
   - the `useEffect` that starts `if (!settings.isIdleEnabled && isIdleRef.current) {`
   - the `useEffect` that defines `handleUserActivity` / `handleVisibilityChange` and registers the activity listeners
2. Add, after `const { settings, updateSettings } = useSettings();`:

```ts
    const { isIdle, resetIdleTimer, goIdle } = useIdleSystem(settings.isIdleEnabled, settings.idleTimeoutMinutes);
```

3. Add the import:

```ts
import { useIdleSystem } from '../utils/useIdleSystem';
```

4. Replace `handleStandbyClick`:

```ts
    const handleStandbyClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        audioService.playClick();
        goIdle();
    }, [goIdle]);
```

`handleIdleInteraction` (`useCallback(() => resetIdleTimer(true), [resetIdleTimer])`) stays as-is.

- [ ] **Step 3: Verify**

Run: `pnpm lint && pnpm build`
Expected: clean. Confirm with `grep -n "isIdleRef\|idleTimerRef" components/App.tsx` → no hits remain in `App.tsx`.

- [ ] **Step 4: Commit**

```bash
git add utils/useIdleSystem.ts components/App.tsx
git commit -m "refactor(app): extract idle/standby system into useIdleSystem hook"
```

---

### Task 9: Extract ambient music/audio into `useAmbientMusic`

Behavior-preserving extraction of the uplink/player/audio-toggle machinery and the YouTube video-id parsing from `AppContent`.

**Files:**
- Create: `utils/useAmbientMusic.ts`
- Modify: `components/App.tsx` (remove music state/effects/handlers; use the hook; slim `handleInitContinue`)

**Interfaces:**
- Consumes: `LLMSettings` type from `types.ts`; `audioService` from `services/audioService.ts` (methods used: `enable`, `disable`, `toggle`, `playClick`, `playAppStart`, `playTransition`, `startAmbient(volume)`, `stopAmbient`).
- Produces: `export type PlayerState = 'idle' | 'syncing' | 'playing' | 'error'` and `export function useAmbientMusic(settings: LLMSettings, updateSettings: (s: LLMSettings) => void): { isUplinkActive: boolean; playerState: PlayerState; audioEnabled: boolean; videoId: string | null; startupContinue: (withMusic: boolean) => void; handleMusicToggle: () => void; handleAudioToggle: () => void }`.

- [ ] **Step 1: Create `utils/useAmbientMusic.ts`**

```ts
import { useState, useCallback, useEffect, useMemo } from 'react';
import { audioService } from '../services/audioService';
import type { LLMSettings } from '../types';

export type PlayerState = 'idle' | 'syncing' | 'playing' | 'error';

const extractVideoId = (url: string): string | null => {
    if (!url) return null;
    const regExp = /^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/|shorts\/)|(?:(?:watch)?\?v(?:i)?=|\&v(?:i)?=))([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[1].length === 11) ? match[1] : null;
};

/**
 * Ambient music "uplink" (hidden YouTube iframe) + global SFX enable state.
 * Extracted verbatim from App.tsx — behavior must not change.
 */
export function useAmbientMusic(settings: LLMSettings, updateSettings: (s: LLMSettings) => void) {
    const [isUplinkActive, setIsUplinkActive] = useState(false);
    const [playerState, setPlayerState] = useState<PlayerState>('idle');
    const [audioEnabled, setAudioEnabled] = useState(true); // Default to true

    useEffect(() => {
        if (audioEnabled) {
            audioService.enable();
        } else {
            audioService.disable();
        }
    }, [audioEnabled]);

    const videoId = useMemo(() => extractVideoId(settings.musicYoutubeUrl), [settings.musicYoutubeUrl]);

    useEffect(() => {
        if (isUplinkActive && playerState === 'syncing' && videoId) {
            const timer = setTimeout(() => {
                setPlayerState('playing');
                if (audioEnabled && settings.musicEnabled) {
                    audioService.startAmbient(0.3);
                }
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [videoId, isUplinkActive, playerState, audioEnabled, settings.musicEnabled]);

    /** Boot-loader CONTINUE / CONTINUE WITHOUT MUSIC handler body. */
    const startupContinue = useCallback((withMusic: boolean) => {
        // ALWAYS enable audio system for SFX
        audioService.enable();
        setAudioEnabled(true);

        if (!withMusic) {
            updateSettings({ ...settings, musicEnabled: false });
            setIsUplinkActive(false);
            setPlayerState('idle');
        } else {
            updateSettings({ ...settings, musicEnabled: true });
            audioService.playAppStart();
            setIsUplinkActive(true);
            setPlayerState('syncing');
            // Ambient start is handled by the syncing -> playing effect
        }

        // Play an SFX when the blinds open
        audioService.playTransition();
    }, [settings, updateSettings]);

    const handleMusicToggle = useCallback(() => {
        if (!videoId) {
            setPlayerState('error');
            return;
        }

        audioService.playClick();

        if (isUplinkActive) {
            setIsUplinkActive(false);
            setPlayerState('idle');
            audioService.stopAmbient();
            updateSettings({ ...settings, musicEnabled: false });
        } else {
            setPlayerState('syncing');
            setIsUplinkActive(true);
            updateSettings({ ...settings, musicEnabled: true });
            setTimeout(() => {
                setPlayerState('playing');
                if (audioEnabled && settings.musicEnabled) {
                    audioService.startAmbient(0.3);
                }
            }, 2500);
        }
    }, [videoId, isUplinkActive, audioEnabled, settings, updateSettings]);

    const handleAudioToggle = useCallback(() => {
        audioService.playClick();
        const newState = audioService.toggle();
        setAudioEnabled(newState);
        updateSettings({ ...settings, musicEnabled: newState });
    }, [settings, updateSettings]);

    return { isUplinkActive, playerState, audioEnabled, videoId, startupContinue, handleMusicToggle, handleAudioToggle };
}
```

- [ ] **Step 2: Rewire `App.tsx`**

In `AppContent`:

1. Delete:
   - `const [isUplinkActive, setIsUplinkActive] = useState(false);`
   - `const [playerState, setPlayerState] = useState<'idle' | 'syncing' | 'playing' | 'error'>('idle');`
   - `const [audioEnabled, setAudioEnabled] = useState(true); // Default to true`
   - the `useEffect` toggling `audioService.enable()/disable()` on `audioEnabled`
   - `const extractVideoId = useCallback(...)` and `const videoId = useMemo(...)`
   - the `useEffect` handling `isUplinkActive && playerState === 'syncing' && videoId`
   - `const handleMusicToggle = useCallback(...)` and `const handleAudioToggle = useCallback(...)`
2. Add, next to the `useIdleSystem` call:

```ts
    const { isUplinkActive, playerState, audioEnabled, videoId, startupContinue, handleMusicToggle, handleAudioToggle } = useAmbientMusic(settings, updateSettings);
```

3. Add the import:

```ts
import { useAmbientMusic } from '../utils/useAmbientMusic';
```

4. Replace `handleInitContinue` with:

```ts
    const handleInitContinue = useCallback(async (withMusic: boolean) => {
        startupContinue(withMusic);

        hasInitializedRef.current = true;
        setIsInitialized(true);

        if (loaderRef.current) {
            gsap.set(loaderRef.current, {
                autoAlpha: 0
            });
        }

        setIsLoading(false);
    }, [startupContinue]);
```

The `Footer` props (`audioEnabled`, `onAudioToggle`, `playerState`, `onMusicToggle`) and the hidden-iframe block (`isUplinkActive && videoId`) keep working unchanged — same names, now from the hook.

- [ ] **Step 3: Verify**

Run: `pnpm lint && pnpm build`
Expected: clean. `grep -n "setPlayerState\|setIsUplinkActive\|setAudioEnabled" components/App.tsx` → no hits.

- [ ] **Step 4: Commit**

```bash
git add utils/useAmbientMusic.ts components/App.tsx
git commit -m "refactor(app): extract ambient music/audio into useAmbientMusic hook"
```

---

### Task 10: Playwright E2E boot smoke test

One canary test: fresh browser → STORAGE_INIT (folder picker stubbed with OPFS) → loader → CONTINUE → app shell visible. This is the regression net for every future refactor of the boot path.

**Files:**
- Create: `playwright.config.ts`, `e2e/smoke.spec.ts`
- Modify: `package.json` (devDep + script), `.gitignore` (Playwright artifacts)

**Interfaces:**
- Consumes: `InitialLoader` button labels `CONTINUE` / `CONTINUE WITHOUT MUSIC` (Task 6) and `Welcome` button label `SELECT_VAULT_FOLDER` (existing, `components/Welcome.tsx:353`); the `.app-header` class on the app shell (`components/App.tsx`).
- Produces: `pnpm test:e2e` script.

- [ ] **Step 1: Install Playwright**

```bash
pnpm add -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Create `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

// E2E runs against a production build served by `vite preview` on 4173.
// NEVER point this at the dev server: a second dev instance collides with
// Vite's HMR websocket and reload-loops (see docs/ARCHITECTURE.md §13).
export default defineConfig({
    testDir: './e2e',
    timeout: 120_000,
    retries: 0,
    use: {
        baseURL: 'http://127.0.0.1:4173',
        trace: 'retain-on-failure',
    },
    webServer: {
        command: 'pnpm build && pnpm preview --port 4173 --strictPort',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: false,
        timeout: 180_000,
    },
});
```

- [ ] **Step 3: Create `e2e/smoke.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('boots through STORAGE_INIT and loader to the app shell', async ({ page }) => {
    // The app gates boot on the File System Access API folder picker.
    // Stub it with OPFS: a real FileSystemDirectoryHandle that satisfies
    // fileSystemManager. Belt-and-braces: also stub the permission methods,
    // which OPFS handles lack in some Chromium builds.
    await page.addInitScript(() => {
        (window as any).showDirectoryPicker = async () => {
            const dir: any = await navigator.storage.getDirectory();
            dir.queryPermission = async () => 'granted';
            dir.requestPermission = async () => 'granted';
            return dir;
        };
    });

    await page.goto('/');

    // Gate 1: STORAGE_INIT — fresh context has no stored handle, so the
    // Welcome screen shows SELECT_VAULT_FOLDER.
    await page.getByRole('button', { name: 'SELECT_VAULT_FOLDER' }).click({ timeout: 30_000 });

    // Gate 2: loader — integrity check runs, progress reaches 100%, then the
    // CONTINUE buttons crossfade in. Headless throttles rAF, so be generous.
    const continueBtn = page.getByRole('button', { name: 'CONTINUE', exact: true });
    await continueBtn.click({ timeout: 60_000 });

    // App shell (header) becomes visible after the blinds reveal.
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 30_000 });
});
```

- [ ] **Step 4: Wire up scripts and ignores**

In `package.json` `"scripts"`, add:

```json
    "test:e2e": "playwright test",
```

Append to `.gitignore`:

```
# Playwright
test-results/
playwright-report/
```

- [ ] **Step 5: Run the smoke test**

Run: `pnpm test:e2e`
Expected: 1 passed. Known failure modes and their meanings:
- Timeout waiting for `SELECT_VAULT_FOLDER` → the Welcome screen didn't render; check the preview server started (port 4173 free) and look at the Playwright trace.
- `CONTINUE` never enabled → the integrity/loader pipeline hung; the OPFS stub may not satisfy `fileSystemManager` anymore — inspect console via the trace before changing the test.
- Clicking `CONTINUE` matched the wrong button → keep `exact: true` (it distinguishes from `CONTINUE WITHOUT MUSIC`).

- [ ] **Step 6: Full verification sweep + commit**

```bash
pnpm lint && pnpm test && pnpm test:e2e
git add playwright.config.ts e2e/smoke.spec.ts package.json pnpm-lock.yaml .gitignore
git commit -m "test(e2e): Playwright boot smoke test through storage init and loader"
```

---

## Completion checklist

After all tasks:

- [ ] `pnpm lint` clean
- [ ] `pnpm test` green (6 pre-existing test files + new `llmService.test.ts`)
- [ ] `pnpm test:e2e` green
- [ ] `NODE_ENV=production PORT=7599 npx tsx server.ts` boots and serves `dist/`
- [ ] `components/App.tsx` no longer defines `InitialLoader`, `PageFrame`, idle machinery, or music machinery (roughly 500 lines removed)
- [ ] Manual walk (user's dev server): boot → dashboard → toggle music → standby button → wake → assistant asks confirmation before sending a Gmail

## Follow-up plans (not in this document)

- **Phase 1 — Robustness & first-run experience** (onboarding/OPFS demo mode, error UX pass, versioned settings migration, integrity report UI)
- **Phase 2 — Feature enrichment** (generate→ingest→compare loop, model registry extraction to data, ComfyUI bridge, gallery dedupe, assistant memory)
- **Phase 3 — UI polish** (consistency audit, reduced-motion, command palette, gallery performance, self-hosted fonts)

Each should get its own plan file in `docs/superpowers/plans/` once the preceding phase lands — Phase 1's onboarding tasks in particular depend on Task 10's E2E harness existing.
