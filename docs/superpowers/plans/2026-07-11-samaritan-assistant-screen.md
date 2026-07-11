# Samaritan Assistant Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the 3D dashboard avatar and its settings, route assistant activation (mic button / Ctrl+Space) to a dedicated fullscreen "Samaritan"-style screen (Person of Interest) where the AI's response is LARGE centered text with a triangle below it, and replace the footer's center live-assistant oscillator with an activity label (LISTENING / THINKING / RESPONDING / …).

**Architecture:** A new `'assistant'` tab is added to the existing `ActiveTab` switch-based router in `App.tsx`. `LiveAssistantContext.start()` navigates there instead of the dashboard. A pure function `deriveMode()` maps session signals to one of five visual modes (connecting / command / listening / processing / responding) and is unit-tested with vitest. A shared hook `useAssistantSignals()` digests the existing event-bus signals (`liveCaption`, `liveAssistantActivity`) plus `useLiveAssistantContext()` into `{ mode, transcripts, activity }` — consumed by both the new `AssistantPage` (full detail) and the footer indicator (mode label only). No new service code.

**Tech Stack:** React 19, `motion/react` (already installed), Tailwind + daisyUI theme tokens (`bg-base-100`, `text-base-content`, `text-primary`), vitest, `tsc --noEmit` via `pnpm lint`.

## Global Constraints

- The assistant's name is **Kollektiv.** (with the trailing dot, dot rendered in `text-primary` italic like the rest of the app's wordmarks). "Samaritan" is a visual style reference ONLY and must never appear in any UI text, label, or title. The screen shows the wordmark from `settings.assistantName` (fallback `Kollektiv`).
- All colors MUST use daisyUI theme tokens (`base-100`, `base-content`, `primary`, `error`) — no hardcoded white/black/red. The screen must adapt to whatever `data-theme` is active.
- On the assistant screen, the AI response (and the command prompt) is LARGE centered text in the middle of the screen with the triangle BELOW the text — per the reference video. Movie-style subtitles (`LiveCaptionOverlay`) remain the behavior on every OTHER screen and are suppressed only on the assistant screen.
- No new dependencies. `three` and `@types/three` are REMOVED (avatar was their only consumer — verified by grep).
- Font/style language matches the app: `font-mono`, uppercase, wide letter-spacing.
- The footer's MUSIC oscillator (next to the MSC button) stays — only the CENTER live-assistant oscillator is replaced by the activity label.
- ALL existing assistant tools must keep working while the assistant screen is active — `open_web_page` (WebViewerPanel), `save_note`/`update_note`/`list_notes` (NotesPanel), `clip_idea` (ClippingPanel), `navigate`, `send_to_crafter`/`send_to_refiner`, web search, memory tools, etc. This is guaranteed by mounting `AssistantPage` as a normal tab INSIDE the app shell (header, footer, and the globally mounted panels in `App.tsx` stay around it). The assistant screen must therefore NEVER be a fullscreen overlay above the shell, must not raise its own z-index above the panels, and the panels' mounts in `App.tsx` must not be moved or conditionally unmounted.
- Package manager is `pnpm`. Typecheck: `pnpm lint`. Tests: `pnpm test`.
- Commit after each task.

---

### Task 1: Remove the 3D avatar and its settings

**Files:**
- Delete: `components/AssistantAvatar.tsx`
- Modify: `components/Dashboard.tsx` (import line 10, render block lines 74–79)
- Modify: `components/settings/IntegrationsSection.tsx` (import line 6, settings group lines 273–327)
- Modify: `types.ts` (lines 106–107)
- Modify: `package.json` (remove `three` dependency and `@types/three` devDependency)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing — pure deletion. After this task nothing in the repo references `AssistantAvatar`, `AVATAR_TEXTURE_PATH`, `drawFaceTemplate`, `assistantAvatarEnabled`, or `three`.

- [ ] **Step 1: Remove the avatar from the dashboard**

In `components/Dashboard.tsx`, delete the import:

```tsx
import AssistantAvatar from './AssistantAvatar';
```

and delete this block (currently lines 74–79) — including the divider line, which only existed to visually anchor the avatar:

```tsx
                    <div className="w-12 h-px bg-base-content/10 mt-10"></div>
                    {settings.assistantAvatarEnabled !== false && (
                        <div className="mt-6">
                            <AssistantAvatar />
                        </div>
                    )}
```

- [ ] **Step 2: Remove the avatar settings group**

In `components/settings/IntegrationsSection.tsx`, delete the import at line 6:

```tsx
import { drawFaceTemplate, AVATAR_TEXTURE_PATH } from '../AssistantAvatar';
```

and delete the entire `<SettingsGroup title="3D Persona Avatar">...</SettingsGroup>` block (lines 273–327 — from `<SettingsGroup title="3D Persona Avatar">` through its closing `</SettingsGroup>`, inclusive of both "Show Avatar" and "Face Texture" rows).

Check whether `fileSystemManager` and `audioService` are still used elsewhere in the file after this deletion. Only remove imports that became unused.

- [ ] **Step 3: Remove the settings flag**

In `types.ts`, delete lines 106–107:

```ts
  /** Show the 3D persona avatar on the dashboard. Undefined = enabled. */
  assistantAvatarEnabled?: boolean;
```

(Stale `assistantAvatarEnabled` keys in users' persisted settings are harmless — extra keys are ignored on read.)

- [ ] **Step 4: Delete the component and drop the dependency**

```bash
git rm components/AssistantAvatar.tsx
```

In `package.json`, remove `"three": "^0.184.0"` from `dependencies` and `"@types/three": "^0.184.0"` from `devDependencies`, then:

```bash
pnpm install
```

- [ ] **Step 5: Verify no dangling references, typecheck**

```bash
grep -rn "AssistantAvatar\|AVATAR_TEXTURE_PATH\|drawFaceTemplate\|assistantAvatarEnabled\|from 'three'" --include="*.ts" --include="*.tsx" .
```

Expected: no matches (excluding this plan file).

```bash
pnpm lint
```

Expected: exit 0, no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: remove 3D persona avatar and its settings"
```

---

### Task 2: `deriveMode` state machine + `useAssistantSignals` shared hook

**Files:**
- Create: `utils/assistantMode.ts`
- Create: `utils/useAssistantSignals.ts`
- Test: `utils/assistantMode.test.ts`

**Interfaces:**
- Consumes: `useLiveAssistantContext()` from `contexts/LiveAssistantContext.tsx` (existing — provides `{ status, speaking, error }`); event bus events `liveCaption` `{ who: 'user' | 'assistant'; text: string }` and `liveAssistantActivity` (string).
- Produces:
  - `type AssistantMode = 'connecting' | 'command' | 'listening' | 'processing' | 'responding'`
  - `deriveMode(input: { status: 'idle' | 'connecting' | 'live' | 'error'; speaking: boolean; lastActivityAt: number; lastUserCaptionAt: number; now: number }): AssistantMode`
  - `useAssistantSignals(): { mode: AssistantMode; status: 'idle' | 'connecting' | 'live' | 'error'; error: string; userText: string; assistantText: string; activity: string[] }`
  - Tasks 3 and 5 consume the hook; the pure function is what gets tested.

Mode precedence (highest first): connecting → responding (assistant speaking) → processing (tool activity within last 3 s) → listening (user transcript within last 2 s) → command (the idle "WHAT ARE YOUR COMMANDS?" prompt). `idle`/`error` status also returns `'command'` — consumers gate on `status` themselves.

- [ ] **Step 1: Write the failing test**

Create `utils/assistantMode.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveMode } from './assistantMode';

const base = { status: 'live' as const, speaking: false, lastActivityAt: 0, lastUserCaptionAt: 0, now: 100_000 };

describe('deriveMode', () => {
    it('shows connecting while the session is connecting', () => {
        expect(deriveMode({ ...base, status: 'connecting' })).toBe('connecting');
    });

    it('speaking wins over recent tool activity', () => {
        expect(deriveMode({ ...base, speaking: true, lastActivityAt: base.now - 100 })).toBe('responding');
    });

    it('recent tool activity shows processing', () => {
        expect(deriveMode({ ...base, lastActivityAt: base.now - 2_000 })).toBe('processing');
    });

    it('stale tool activity does not show processing', () => {
        expect(deriveMode({ ...base, lastActivityAt: base.now - 5_000 })).toBe('command');
    });

    it('recent user caption shows listening', () => {
        expect(deriveMode({ ...base, lastUserCaptionAt: base.now - 500 })).toBe('listening');
    });

    it('quiet live session shows the command prompt', () => {
        expect(deriveMode(base)).toBe('command');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test utils/assistantMode.test.ts`
Expected: FAIL — cannot resolve `./assistantMode`.

- [ ] **Step 3: Write the pure implementation**

Create `utils/assistantMode.ts`:

```ts
export type AssistantMode = 'connecting' | 'command' | 'listening' | 'processing' | 'responding';

const ACTIVITY_HOLD_MS = 3_000;
const LISTENING_HOLD_MS = 2_000;

/** Maps live-session signals to the Samaritan screen's visual mode.
 * Pure so the precedence rules are unit-testable without React. */
export function deriveMode(input: {
    status: 'idle' | 'connecting' | 'live' | 'error';
    speaking: boolean;
    lastActivityAt: number;
    lastUserCaptionAt: number;
    now: number;
}): AssistantMode {
    if (input.status === 'connecting') return 'connecting';
    if (input.speaking) return 'responding';
    if (input.now - input.lastActivityAt < ACTIVITY_HOLD_MS) return 'processing';
    if (input.now - input.lastUserCaptionAt < LISTENING_HOLD_MS) return 'listening';
    return 'command';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test utils/assistantMode.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Write the shared hook**

Create `utils/useAssistantSignals.ts`:

```ts
import { useEffect, useRef, useState } from 'react';
import { appEventBus } from './eventBus';
import { useLiveAssistantContext } from '../contexts/LiveAssistantContext';
import { deriveMode, type AssistantMode } from './assistantMode';

const TICK_MS = 400; // clock tick so time-decayed modes (processing/listening) expire

export interface AssistantSignals {
    mode: AssistantMode;
    status: 'idle' | 'connecting' | 'live' | 'error';
    error: string;
    userText: string;
    assistantText: string;
    activity: string[];
}

/** Live-session signals digested for UI: current visual mode plus the latest
 * transcripts and tool-activity lines. Used by the Samaritan assistant page
 * (full detail) and the footer indicator (mode label only). Ticks only while
 * a session is active, so an always-mounted consumer like the footer costs
 * nothing when idle. */
export function useAssistantSignals(): AssistantSignals {
    const { status, speaking, error } = useLiveAssistantContext();
    const [now, setNow] = useState(() => Date.now());
    const [userText, setUserText] = useState('');
    const [assistantText, setAssistantText] = useState('');
    const [activity, setActivity] = useState<string[]>([]);
    const lastActivityAt = useRef(0);
    const lastUserCaptionAt = useRef(0);

    useEffect(() => {
        if (status === 'idle' || status === 'error') return;
        const id = setInterval(() => setNow(Date.now()), TICK_MS);
        return () => clearInterval(id);
    }, [status]);

    useEffect(() => {
        const offCaption = appEventBus.on('liveCaption', (p: { who: 'user' | 'assistant'; text: string }) => {
            if (p.who === 'user') {
                lastUserCaptionAt.current = Date.now();
                setUserText(prev => (prev + p.text).slice(-160));
                setAssistantText('');
            } else {
                setAssistantText(prev => (prev + p.text).slice(-280));
                setUserText('');
            }
        });
        const offActivity = appEventBus.on('liveAssistantActivity', (line: string) => {
            lastActivityAt.current = Date.now();
            setActivity(prev => [...prev, line].slice(-4));
        });
        return () => { offCaption(); offActivity(); };
    }, []);

    const mode = deriveMode({
        status,
        speaking,
        lastActivityAt: lastActivityAt.current,
        lastUserCaptionAt: lastUserCaptionAt.current,
        now,
    });

    return { mode, status, error, userText, assistantText, activity };
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm lint`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add utils/assistantMode.ts utils/assistantMode.test.ts utils/useAssistantSignals.ts
git commit -m "feat: assistant mode state machine and shared signals hook"
```

---

### Task 3: `AssistantPage` — the Samaritan UI

**Files:**
- Create: `components/AssistantBackdrop.tsx`
- Create: `components/AssistantPage.tsx`

**Interfaces:**
- Consumes: `useAssistantSignals()` from `utils/useAssistantSignals.ts` (Task 2); `appEventBus` from `utils/eventBus.ts`; `useSettings()` from `contexts/SettingsContext.tsx` (existing — for `settings.assistantName`); `AssistantMode` type from `utils/assistantMode.ts`.
- Produces: default export `AssistantBackdrop: React.FC<{ mode: AssistantMode }>` (animated background layer); default export `AssistantPage: React.FC` (no props). Emits `appEventBus.emit('navigate', 'dashboard')` when the session ends. Task 4 mounts the page.

Visual language, matching the reference video (all theme tokens): near-empty field on `bg-base-100` with the existing `bg-grid-texture` overlay. Every mode renders LARGE centered text in the middle of the screen with an underline bar and the triangle BELOW the text — text on top, bar, then triangle. The triangle is `primary`-colored (the show's red — here it follows the theme accent). The AI's spoken reply streams as the large center text itself (movie-subtitle overlay is for other screens only).

Tool-panel compatibility: this component is a page, not an overlay. It fills only the routed-content area (`absolute inset-0` within the page container) and adds no z-index of its own, so the globally mounted tool panels (`WebViewerPanel`, `NotesPanel`, `ClippingPanel`, `LLMChatPanel` — siblings rendered after the page in `App.tsx`, `WebViewerPanel` via portal) slide in ON TOP of it when the assistant calls `open_web_page`, note tools, `clip_idea`, etc. The header's panel toggle buttons also remain reachable. Do not add `pointer-events-none` blockers or high z-index wrappers around the root.

Background animation (per the reference video — this is where the screen comes alive): a dedicated `AssistantBackdrop` layer behind the center text renders (a) a barrel-distorted "fisheye" grid with cross markers at intersections, built once as static SVG paths, whose opacity breathes slowly when idle and pulses fast when busy; (b) dark vignette gradients on the left/right edges plus static hatched-corner and side-data-strip decorations; (c) a horizontal scanline that sweeps slowly when idle and frantically while connecting/processing; (d) flickering glitch blocks (the video's black rectangles — here `base-content`/`primary` at low opacity) at deterministic pseudo-random positions while connecting/processing; (e) expanding radial pulse rings behind the text while the assistant speaks. Everything is `motion/react` + SVG + Tailwind theme tokens — no canvas, no new deps, `pointer-events-none` on the backdrop itself.

- [ ] **Step 1: Write the animated backdrop**

Create `components/AssistantBackdrop.tsx`:

```tsx
import React from 'react';
import { motion } from 'motion/react';
import type { AssistantMode } from '../utils/assistantMode';

// Deterministic pseudo-random so the glitch layout is stable across renders
// (Math.random in render would reshuffle every state tick).
const rand = (seed: number) => {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
};

const W = 1600;
const H = 900;
const CX = W / 2;
const CY = H / 2;

/** Barrel-distorted grid + intersection cross markers, mimicking the show's
 * curved-monitor field. Computed once at module load — static SVG paths. */
const buildGrid = () => {
    const cols = 12, rows = 8;
    const paths: string[] = [];
    for (let i = 0; i <= cols; i++) {
        const x = W * (i / cols);
        const xEdge = CX + (x - CX) * 0.94; // pinched at top/bottom
        const xMid = CX + (x - CX) * 1.10;  // bulged at the vertical middle
        paths.push(`M ${xEdge} 0 Q ${xMid} ${CY} ${xEdge} ${H}`);
    }
    for (let j = 0; j <= rows; j++) {
        const y = H * (j / rows);
        const yEdge = CY + (y - CY) * 0.94;
        const yMid = CY + (y - CY) * 1.10;
        paths.push(`M 0 ${yEdge} Q ${CX} ${yMid} ${W} ${yEdge}`);
    }
    const marks: { x: number; y: number }[] = [];
    for (let i = 1; i < cols; i += 2) {
        for (let j = 1; j < rows; j += 2) {
            marks.push({
                x: CX + (W * (i / cols) - CX) * 1.02,
                y: CY + (H * (j / rows) - CY) * 1.02,
            });
        }
    }
    return { paths, marks };
};

const GRID = buildGrid();

const GLITCHES = Array.from({ length: 14 }, (_, i) => ({
    left: `${8 + rand(i) * 84}%`,
    top: `${8 + rand(i + 50) * 84}%`,
    width: 30 + rand(i + 100) * 160,
    height: 4 + rand(i + 150) * 26,
    delay: rand(i + 200) * 1.4,
    duration: 0.25 + rand(i + 250) * 0.5,
}));

/** Animated Samaritan-style background field. Sits behind the assistant
 * page's center text; every color is a theme token via currentColor or
 * Tailwind classes, so it adapts to the active data-theme. */
const AssistantBackdrop: React.FC<{ mode: AssistantMode }> = ({ mode }) => {
    const busy = mode === 'processing' || mode === 'connecting';
    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
            {/* Fisheye grid — breathes slowly at rest, pulses while busy */}
            <motion.svg
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="xMidYMid slice"
                className="absolute inset-0 w-full h-full text-base-content"
                animate={{ opacity: busy ? [0.10, 0.18, 0.10] : [0.06, 0.10, 0.06] }}
                transition={{ duration: busy ? 1.6 : 7, repeat: Infinity, ease: 'easeInOut' }}
            >
                {GRID.paths.map((d, i) => (
                    <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth="1" />
                ))}
                {GRID.marks.map((m, i) => (
                    <g key={`m-${i}`} stroke="currentColor" strokeWidth="2" opacity="0.7">
                        <line x1={m.x - 7} y1={m.y} x2={m.x + 7} y2={m.y} />
                        <line x1={m.x} y1={m.y - 7} x2={m.x} y2={m.y + 7} />
                    </g>
                ))}
            </motion.svg>

            {/* Curved-monitor vignette falloff on the sides */}
            <div className="absolute inset-y-0 left-0 w-[6%] bg-gradient-to-r from-base-content/15 to-transparent" />
            <div className="absolute inset-y-0 right-0 w-[6%] bg-gradient-to-l from-base-content/15 to-transparent" />

            {/* Static decorations: hatched corner square + side data strip */}
            <div
                className="absolute bottom-8 left-8 w-14 h-14 opacity-30 text-base-content"
                style={{ backgroundImage: 'repeating-linear-gradient(45deg, currentColor 0 1px, transparent 1px 5px)' }}
            />
            <div
                className="absolute top-1/3 right-6 bottom-1/3 w-2 opacity-25 text-base-content"
                style={{ backgroundImage: 'repeating-linear-gradient(0deg, currentColor 0 2px, transparent 2px 6px)' }}
            />

            {/* Horizontal scanline — leisurely sweep at rest, frantic while busy */}
            <motion.div
                className="absolute inset-x-0 h-px bg-primary/40"
                animate={{ top: ['-2%', '102%'] }}
                transition={{ duration: busy ? 1.8 : 9, repeat: Infinity, ease: 'linear', repeatDelay: busy ? 0 : 4 }}
            />

            {/* Glitch bursts while connecting/thinking — the video's flickering blocks */}
            {busy && GLITCHES.map((g, i) => (
                <motion.div
                    key={i}
                    className={i % 4 === 0 ? 'absolute bg-primary' : 'absolute bg-base-content'}
                    style={{ left: g.left, top: g.top, width: g.width, height: g.height }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.55, 0] }}
                    transition={{ duration: g.duration, repeat: Infinity, repeatDelay: 0.6 + g.delay, delay: g.delay }}
                />
            ))}

            {/* Radial pulse rings behind the center text while the assistant speaks */}
            {mode === 'responding' && [0, 1, 2].map(i => (
                <motion.div
                    key={i}
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border border-primary/30"
                    style={{ width: 240, height: 240 }}
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: [0.6, 2.2], opacity: [0.5, 0] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut', delay: i * 0.8 }}
                />
            ))}
        </div>
    );
};

export default AssistantBackdrop;
```

- [ ] **Step 2: Write the page component**

Create `components/AssistantPage.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { appEventBus } from '../utils/eventBus';
import { useAssistantSignals } from '../utils/useAssistantSignals';
import { useSettings } from '../contexts/SettingsContext';
import AssistantBackdrop from './AssistantBackdrop';

const PROMPT = 'WHAT ARE YOUR COMMANDS?';

/** CSS triangle in the theme accent color — the Samaritan sigil. */
const Sigil: React.FC = () => (
    <div className="w-0 h-0 border-l-[18px] border-r-[18px] border-b-[30px] border-l-transparent border-r-transparent border-b-primary" />
);

/** Types text one character at a time, restarting when `text` changes. */
const Typewriter: React.FC<{ text: string; speed?: number; className?: string }> = ({ text, speed = 30, className }) => {
    const [n, setN] = useState(0);
    useEffect(() => {
        setN(0);
        const id = setInterval(() => {
            setN(prev => {
                if (prev >= text.length) { clearInterval(id); return prev; }
                return prev + 1;
            });
        }, speed);
        return () => clearInterval(id);
    }, [text, speed]);
    return <span className={className}>{text.slice(0, n)}<span className="animate-pulse">_</span></span>;
};

// Shared type stack for the big center text — Samaritan-style: large, mono, spaced.
const BIG_TEXT = 'font-mono text-2xl md:text-4xl tracking-[0.3em] uppercase text-base-content leading-relaxed';

/** Fullscreen Samaritan-style face of the live voice assistant. Mounted as the
 * 'assistant' tab; the mic toggle navigates here on session start and this
 * page navigates back to the dashboard when the session ends. The AI reply
 * streams as the large center text (no subtitle strip on this screen). */
const AssistantPage: React.FC = () => {
    const { mode, status, error, userText, assistantText, activity } = useAssistantSignals();
    const { settings } = useSettings();
    const assistantName = settings.assistantName || 'Kollektiv';

    // Session over — return home. Also bounces straight out if someone lands
    // here without an active session. Errors linger long enough to read.
    useEffect(() => {
        if (status !== 'idle' && status !== 'error') return;
        const t = setTimeout(() => appEventBus.emit('navigate', 'dashboard'), status === 'error' ? 4000 : 800);
        return () => clearTimeout(t);
    }, [status]);

    return (
        <div className="absolute inset-0 bg-base-100 overflow-hidden select-none flex items-center justify-center">
            <AssistantBackdrop mode={mode} />

            {/* Wordmark — this is Kollektiv., not Samaritan */}
            <div className="absolute top-4 inset-x-0 flex justify-center pointer-events-none">
                <p className="font-monoton text-sm tracking-[0.4em] uppercase text-base-content/40">
                    {assistantName}<span className="text-primary italic">.</span>
                </p>
            </div>

            {/* Corner readouts */}
            <div className="absolute top-4 left-5 font-mono text-[9px] tracking-[0.4em] uppercase text-base-content/30">
                {status === 'live' ? 'UPLINK ACTIVE' : status.toUpperCase()}
            </div>
            <div className="absolute bottom-4 right-5 font-mono text-[9px] tracking-[0.4em] uppercase text-base-content/30">
                CTRL+SPACE TO END
            </div>

            {status === 'error' ? (
                <div className="relative z-10 flex flex-col items-center gap-6 max-w-3xl px-8 text-center">
                    <p className="font-mono text-xl md:text-3xl tracking-[0.4em] uppercase text-error">SYSTEM FAULT</p>
                    <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-base-content/50 leading-relaxed">{error}</p>
                </div>
            ) : (
                <AnimatePresence mode="wait">
                    <motion.div
                        key={mode}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="relative z-10 flex flex-col items-center gap-6 max-w-5xl px-8 text-center"
                    >
                        {mode === 'connecting' && (
                            <Typewriter text="ESTABLISHING UPLINK..." className="font-mono text-xl md:text-3xl tracking-[0.4em] uppercase text-base-content/70" />
                        )}

                        {mode === 'command' && (
                            <>
                                <Typewriter text={PROMPT} className={BIG_TEXT} />
                                <div className="w-64 h-[3px] bg-base-content" />
                                <motion.div animate={{ opacity: [1, 0.35, 1] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}>
                                    <Sigil />
                                </motion.div>
                            </>
                        )}

                        {mode === 'listening' && (
                            <>
                                <p className="font-mono text-[10px] tracking-[0.5em] uppercase text-primary/70">RECEIVING</p>
                                <p className={BIG_TEXT}>{userText}</p>
                                <div className="w-64 h-[3px] bg-base-content" />
                                <Sigil />
                            </>
                        )}

                        {mode === 'processing' && (
                            <>
                                <p className="font-mono text-xl md:text-3xl tracking-[0.5em] uppercase text-base-content/80">ANALYZING</p>
                                <div className="flex gap-1">
                                    {Array.from({ length: 7 }).map((_, i) => (
                                        <motion.div
                                            key={i}
                                            className="w-6 h-2 bg-primary"
                                            animate={{ opacity: [0.1, 1, 0.1] }}
                                            transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.09 }}
                                        />
                                    ))}
                                </div>
                                <div className="flex flex-col gap-1 min-h-[64px] items-center">
                                    {activity.map((line, i) => (
                                        <p key={`${i}-${line}`} className="font-mono text-[10px] tracking-[0.2em] uppercase text-primary/70 truncate max-w-[60vw]">
                                            {line}
                                        </p>
                                    ))}
                                </div>
                            </>
                        )}

                        {mode === 'responding' && (
                            <>
                                <p className={BIG_TEXT}>{assistantText}</p>
                                <div className="w-64 h-[3px] bg-base-content" />
                                <motion.div animate={{ scaleY: [1, 0.82, 1] }} transition={{ duration: 0.35, repeat: Infinity, ease: 'easeInOut' }}>
                                    <Sigil />
                                </motion.div>
                            </>
                        )}
                    </motion.div>
                </AnimatePresence>
            )}
        </div>
    );
};

export default AssistantPage;
```

- [ ] **Step 3: Typecheck**

Run: `pnpm lint`
Expected: exit 0. (The components aren't mounted yet — that's Task 4.)

- [ ] **Step 4: Commit**

```bash
git add components/AssistantBackdrop.tsx components/AssistantPage.tsx
git commit -m "feat: Samaritan-style assistant page with animated backdrop"
```

---

### Task 4: Route the assistant to the new screen

**Files:**
- Modify: `types.ts:3-20` (`ActiveTab` union)
- Modify: `components/App.tsx` (title map ~line 444, `renderContent` switch ~line 828, `LiveCaptionOverlay` mount ~line 1174, imports ~line 45)
- Modify: `contexts/LiveAssistantContext.tsx:46-50`
- Modify: `components/LiveCaptionOverlay.tsx` (add a `hidden` prop)

**Interfaces:**
- Consumes: `AssistantPage` default export from Task 3.
- Produces: `'assistant'` as a valid `ActiveTab` value; `LiveCaptionOverlay` accepts `hidden?: boolean`.

- [ ] **Step 1: Add the tab to the union**

In `types.ts`, add `| 'assistant'` to the `ActiveTab` union (after `'dashboard'`):

```ts
export type ActiveTab =
  | 'dashboard'
  | 'assistant'
  | 'discovery'
```

- [ ] **Step 2: Redirect activation to the new screen**

In `contexts/LiveAssistantContext.tsx`, replace lines 47–49:

```ts
        // Assistant activation always brings the user home first — the avatar
        // and captions live on the dashboard/footer.
        appEventBus.emit('navigate', 'dashboard');
```

with:

```ts
        // Assistant activation opens the dedicated fullscreen assistant view.
        appEventBus.emit('navigate', 'assistant');
```

- [ ] **Step 3: Mount the page in App.tsx**

Add the import next to the other page imports (~line 45):

```tsx
import AssistantPage from './AssistantPage';
```

In `currentTitle` (~line 444), add a case after `'dashboard'`:

```tsx
            case 'assistant': return `ASSISTANT | ${base}`;
```

In `renderContent()` (~line 828), add a case after `'dashboard'`:

```tsx
            case 'assistant': return <AssistantPage key="assistant" />;
```

- [ ] **Step 4: Suppress the subtitle strip on the assistant screen only**

Movie-style subtitles stay on every other screen; the assistant page shows the reply as its large center text, so the strip would duplicate it there. In `components/LiveCaptionOverlay.tsx`, change the component signature and add an early return:

```tsx
const LiveCaptionOverlay: React.FC<{ hidden?: boolean }> = ({ hidden = false }) => {
```

and immediately before the `return (`:

```tsx
    if (hidden) return null;
```

In `components/App.tsx` (~line 1174), change the mount:

```tsx
            <LiveCaptionOverlay hidden={activeTab === 'assistant'} />
```

- [ ] **Step 5: Typecheck and test**

```bash
pnpm lint
pnpm test
```

Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add types.ts components/App.tsx contexts/LiveAssistantContext.tsx components/LiveCaptionOverlay.tsx
git commit -m "feat: route assistant activation to dedicated Samaritan screen"
```

---

### Task 5: Footer — replace the live-assistant oscillator with an activity label

**Files:**
- Modify: `components/Footer.tsx` (center oscillator block lines 226–239, live-state wiring lines 194–195 / 211–216 / 218–219, imports)

**Interfaces:**
- Consumes: `useAssistantSignals()` and `AssistantMode` from Task 2.
- Produces: nothing new — footer-internal change. The `DigitalOscillator` component STAYS (still used by the music button, lines 292–305); only its center live-assistant instance is removed.

- [ ] **Step 1: Swap the live-state wiring for the shared hook**

In `components/Footer.tsx`:

Add imports at the top:

```tsx
import { useAssistantSignals } from '../utils/useAssistantSignals';
import type { AssistantMode } from '../utils/assistantMode';
```

Add the label map at module level (next to the other small components):

```tsx
// Footer readout for the live assistant — replaces the old center oscillator.
const ASSISTANT_LABEL: Record<AssistantMode, string> = {
    connecting: 'CONNECTING',
    command: 'LISTENING',
    listening: 'RECEIVING',
    processing: 'THINKING',
    responding: 'RESPONDING',
};
```

Inside the `Footer` component, delete the two state lines (194–195):

```tsx
    const [liveStatus, setLiveStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle');
    const [liveSpeaking, setLiveSpeaking] = useState(false);
```

delete the event subscription (lines 211–216):

```tsx
    useEffect(() => {
        return appEventBus.on('liveAssistantState', (s: { status: 'idle' | 'connecting' | 'live' | 'error'; speaking: boolean }) => {
            setLiveStatus(s.status);
            setLiveSpeaking(s.speaking);
        });
    }, []);
```

delete the derived-state line and its comment (lines 218–219):

```tsx
    // idle = flat line, connecting/listening = noisy wave, speaking = bar equalizer, error = red jitter.
    const liveOscillatorState = liveStatus === 'error' ? 'error' : liveSpeaking ? 'playing' : liveStatus === 'idle' ? 'idle' : 'syncing';
```

and add in their place:

```tsx
    const { mode: liveMode, status: liveStatus } = useAssistantSignals();
    const liveLabel = liveStatus === 'error' ? 'FAULT' : ASSISTANT_LABEL[liveMode];
```

If `appEventBus` is now unused in the file, remove its import.

- [ ] **Step 2: Replace the center oscillator with the label**

Replace the center block (lines 226–239):

```tsx
            <AnimatePresence>
                {liveStatus !== 'idle' && (
                    <motion.div
                        key="live-oscillator"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[705] pointer-events-none"
                    >
                        <DigitalOscillator state={liveOscillatorState} theme={themeMode} />
                    </motion.div>
                )}
            </AnimatePresence>
```

with:

```tsx
            <AnimatePresence mode="wait">
                {liveStatus !== 'idle' && (
                    <motion.div
                        key={liveLabel}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[705] pointer-events-none flex items-center gap-2"
                    >
                        <span className={`w-1.5 h-1.5 ${liveStatus === 'error' ? 'bg-error' : 'bg-primary animate-pulse'}`} />
                        <span className={`font-mono text-[10px] font-bold tracking-[0.5em] uppercase leading-none ${liveStatus === 'error' ? 'text-error' : 'text-base-content/70'}`}>
                            {liveLabel}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>
```

Note: `themeMode` is still used by the music oscillator — do not remove the prop.

- [ ] **Step 3: Typecheck**

Run: `pnpm lint`
Expected: exit 0.

- [ ] **Step 4: Verify end-to-end in the running app**

Run `pnpm dev`, open the app, then:

1. Click the header mic button (or Ctrl+Space). Expected: app navigates to the fullscreen assistant screen — the barrel-distorted grid with cross markers fills the background (glitch blocks flicker while connecting), the "KOLLEKTIV." wordmark (primary-colored dot) sits top-center, "ESTABLISHING UPLINK..." types out, then the large centered "WHAT ARE YOUR COMMANDS?" with underline bar and pulsing theme-colored triangle BELOW it. At rest the grid breathes slowly and a scanline sweeps down occasionally. Footer center shows "CONNECTING" then "LISTENING" (no waveform). Nowhere does the word "Samaritan" appear.
2. Speak. Expected: your transcript appears as the large center text ("RECEIVING", footer shows "RECEIVING"); when the assistant answers, its reply streams as the LARGE center text with the bouncing triangle below it and radial pulse rings expanding behind it — no subtitle strip at the bottom of this screen. Footer shows "RESPONDING". When it calls tools, the screen shows "ANALYZING" with flicker bars + activity lines, the background erupts in glitch blocks with a fast scanline, and the footer shows "THINKING".
3. While on the assistant screen, ask the assistant to open a website (its `open_web_page` tool). Expected: the WebViewerPanel slides in OVER the Samaritan screen; closing it returns to the screen with the session still live. Ask it to save a note, then open the notes panel from the header. Expected: NotesPanel opens above the assistant screen showing the new note. Ask it to clip an idea. Expected: clip counter in the header increments and the ClippingPanel opens above the screen.
4. Ask the assistant to navigate somewhere (e.g. "open the gallery"). Expected: its `navigate` tool switches tabs away from the assistant screen while the session stays live, and the movie-style subtitle strip takes over on that screen as before.
5. Click the mic again (or Ctrl+Space). Expected: session ends, app returns to the dashboard (~0.8 s later), footer center indicator fades out. Dashboard shows no avatar.
6. Toggle music. Expected: the music oscillator next to MSC still animates — unchanged.
7. Switch themes in settings. Expected: assistant screen background/text/triangle and footer label follow the theme.
8. Settings → Integrations. Expected: no "3D Persona Avatar" group.

- [ ] **Step 5: Commit**

```bash
git add components/Footer.tsx
git commit -m "feat: replace footer live oscillator with assistant activity label"
```

---

## Self-Review Notes

- Spec coverage: avatar removal (Task 1), settings removal (Task 1), mic → dedicated screen instead of dashboard (Task 4), large centered response text with triangle below per the reference video (Task 3 `BIG_TEXT` + text→bar→Sigil order in every mode), subtitles kept on other screens / suppressed only on the assistant screen (Task 4 Step 4), footer oscillator → activity label LISTENING/THINKING/RESPONDING (Task 5), theme-adaptive colors (theme tokens throughout), assistant branded as Kollektiv. via `settings.assistantName` wordmark — Samaritan appears in no UI string (Task 3, Global Constraints).
- `deriveMode` / `useAssistantSignals` names and shapes match between Task 2 (definition) and Tasks 3 & 5 (usage); `AssistantBackdrop`'s `mode` prop is the same `AssistantMode` type.
- Background animations per the reference video (Task 3 `AssistantBackdrop`): fisheye grid + cross markers, vignette edges, hatch/data-strip decorations, mode-reactive scanline, glitch bursts while busy, pulse rings while responding — all theme tokens, deterministic layout (no `Math.random` in render), `pointer-events-none` so tool panels stay clickable.
- `Footer` is rendered inside `LiveAssistantProvider` (verified in `App.tsx`), so `useAssistantSignals` → `useLiveAssistantContext` is safe there.
- The hook's tick interval is gated on active status, so the always-mounted footer pays nothing while idle.
- Deliberately skipped: a persistent history feed and the show's OS-boot sequence — add only if the minimal five-mode screen feels too static in practice.
