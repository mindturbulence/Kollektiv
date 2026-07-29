# Assistant Responsiveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI assistant feel faster and more responsive across three concrete, independently-verified bottlenecks: unnecessary serialized DB round-trips before every reply, a hardcoded voice turn-taking delay, and unmemoized chat UI re-renders during streaming.

**Architecture:** No new subsystems. Each task is a targeted fix to an existing, already-identified bottleneck in the current pipeline — `services/assistantService.ts`'s context-builder (parallelize independent async work), `services/liveAssistantService.ts`'s `TurnManager` wiring (make a hardcoded value configurable), and `components/LLMChatPanel.tsx`'s message list (extract + memoize so streaming one message doesn't re-render all of them).

**Tech Stack:** TypeScript, React 18, Vitest + `@testing-library/react` (jsdom environment, already configured in `vite.config.ts`).

## Global Constraints

- `pnpm lint` (`tsc --noEmit`) must stay clean after every task.
- `pnpm test` must stay green after every task — never leave a task with a known-failing pre-existing test.
- Any new `LLMSettings` field must go through the settings-persistence recipe used throughout this codebase: add to the `LLMSettings` interface in `types.ts`, add a default in `utils/settingsStorage.ts`'s defaults object, add a hydration line (`parsed.field ?? default`) in the same file's load function, and add the field name string to the allow-list array at `components/SetupPage.tsx:436` — a field missing from that allow-list silently fails to persist across a reload.
- No new dependencies. Everything here is achievable with what's already installed.
- Match existing code style: this codebase writes minimal comments (only for non-obvious constraints), uses `async`/`await` over raw `.then()`, and keeps settings UI in `components/settings/*.tsx` following the `SettingRow`/`handleSettingsChange` pattern already used for every other setting.

---

## Background: what was actually investigated

Before writing this plan, the real code was traced end-to-end (not guessed at) to find concrete bottlenecks:

1. **Reply latency.** `services/assistantService.ts:23-68`, `buildKnowledgeContextBlock()`, runs before *every single* assistant turn (confirmed at all 5 call sites: 4 in `assistantService.ts` itself, 1 in `services/liveAssistantService.ts:424` for live voice). It does two things wrong: it awaits `memoryTierService.trackAccess()` **one at a time in a `for` loop** (up to 8 sequential round-trips) instead of running them concurrently, and it runs two *independent* searches (`knowledgeService.search(...)` and `memoryTierService.searchAll(...)`) sequentially instead of concurrently. Both are pure, avoidable serialization directly in the time-to-first-token critical path.
2. **Voice turn-taking feel.** `services/turnManager.ts:41` hardcodes `silenceTimeoutMs = 800` (ms of silence required before the assistant starts processing what you said), and `services/liveAssistantService.ts:457` re-asserts the same hardcoded `800` at the one place `TurnManager` gets instantiated. There is currently no way for a user to make this shorter (feels quicker to respond) or longer (fewer accidental cutoffs) — it's not exposed anywhere.
3. **Chat UI streaming smoothness.** `components/LLMChatPanel.tsx:354-368` calls `setMessages(prev => { const cloned = [...prev]; cloned[cloned.length - 1] = {...}; return cloned; })` on **every single streamed chunk**. The message list is rendered inline at `components/LLMChatPanel.tsx:577` (`messages.map(...)`, no memoization) — every chunk of every assistant reply currently re-renders every message bubble in the whole conversation, including full `<Markdown>` re-parses of old messages, because nothing stops it. Note `[...prev]` preserves the *object reference* of every unchanged array element — this is exactly what a memoized child keyed on that reference will exploit.

---

## Task 1: Parallelize the sequential access-tracking loop in `buildKnowledgeContextBlock`

**Files:**
- Modify: `services/assistantService.ts:23-68`
- Test: `services/assistantService.test.ts` (new file)

**Interfaces:**
- Consumes: `knowledgeService.search(options: SearchOptions): Promise<KnowledgeSearchResult[]>` (`services/knowledgeService.ts:242`), where `KnowledgeSearchResult = { ref: KnowledgeRef, snippet: string, score: number }` (`services/knowledgeService.ts:58`). `memoryTierService.trackAccess(ref: KnowledgeRef): Promise<KnowledgeRef>` (`services/memoryTierService.ts:176`).
- Produces: `buildKnowledgeContextBlock(context: string): Promise<string>` — signature unchanged, only its internal ordering changes. Later tasks in this plan don't depend on this function.

- [ ] **Step 1: Write the failing test**

Create `services/assistantService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { KnowledgeRef, KnowledgeSearchResult } from './knowledgeService';

vi.mock('./knowledgeService', () => ({
    knowledgeService: {
        search: vi.fn(),
    },
}));
vi.mock('./memoryTierService', () => ({
    memoryTierService: {
        trackAccess: vi.fn(async (ref: KnowledgeRef) => ref),
        searchAll: vi.fn(async () => []),
    },
}));

import { knowledgeService } from './knowledgeService';
import { memoryTierService } from './memoryTierService';
import { buildKnowledgeContextBlock } from './assistantService';

const makeResult = (id: string): KnowledgeSearchResult => ({
    ref: { kind: 'memory', id, title: `Item ${id}`, tier: 'long-term', tags: [] } as unknown as KnowledgeRef,
    snippet: `snippet for ${id}`,
    score: 0.9,
});

beforeEach(() => {
    vi.clearAllMocks();
});

describe('buildKnowledgeContextBlock — access tracking is parallel, not sequential', () => {
    it('calls trackAccess for every result without waiting for the previous call to resolve first', async () => {
        const results = [makeResult('a'), makeResult('b'), makeResult('c')];
        vi.mocked(knowledgeService.search).mockResolvedValue(results);

        const order: string[] = [];
        vi.mocked(memoryTierService.trackAccess).mockImplementation(async (ref) => {
            order.push(`start:${ref.id}`);
            // Resolve 'a' last on purpose — if the loop were sequential
            // (await-in-a-for-loop), 'a' starting would block 'b' and 'c'
            // from starting at all until 'a' finished.
            await new Promise((r) => setTimeout(r, ref.id === 'a' ? 20 : 0));
            order.push(`end:${ref.id}`);
            return ref;
        });

        await buildKnowledgeContextBlock('some query');

        // All three must have STARTED before any of them ENDED — proof
        // they ran concurrently, not one-at-a-time.
        const firstEndIndex = order.findIndex((e) => e.startsWith('end:'));
        const startsBeforeFirstEnd = order.slice(0, firstEndIndex).filter((e) => e.startsWith('start:'));
        expect(startsBeforeFirstEnd).toHaveLength(3);
    });

    it('still includes all results in the output even if one trackAccess call rejects', async () => {
        const results = [makeResult('a'), makeResult('b')];
        vi.mocked(knowledgeService.search).mockResolvedValue(results);
        vi.mocked(memoryTierService.trackAccess).mockImplementation(async (ref) => {
            if (ref.id === 'a') throw new Error('boom');
            return ref;
        });

        const out = await buildKnowledgeContextBlock('some query');
        expect(out).toContain('Item a');
        expect(out).toContain('Item b');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run services/assistantService.test.ts`
Expected: FAIL on the first test — the current `for (const r of results) { await memoryTierService.trackAccess(r.ref); }` starts `trackAccess('a')`, awaits it fully (20ms), *then* starts `trackAccess('b')`, so `startsBeforeFirstEnd` only contains 1 entry (`start:a`), not 3.

- [ ] **Step 3: Write minimal implementation**

In `services/assistantService.ts`, replace the sequential loop:

```typescript
// Before:
for (const r of results) {
    try { await memoryTierService.trackAccess(r.ref); } catch { /* best-effort */ }
}

// After:
await Promise.all(
    results.map((r) => memoryTierService.trackAccess(r.ref).catch(() => { /* best-effort */ }))
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run services/assistantService.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add services/assistantService.ts services/assistantService.test.ts
git commit -m "perf(assistant): parallelize access-tracking loop in buildKnowledgeContextBlock"
```

---

## Task 2: Run the two independent context-building searches concurrently

**Files:**
- Modify: `services/assistantService.ts` (same function, after Task 1's change)
- Test: `services/assistantService.test.ts` (extend from Task 1)

**Interfaces:**
- Consumes: `memoryTierService.searchAll(query: string, maxResults?: number): Promise<Array<{kind: 'working', workingEntry: WorkingMemoryEntry, snippet: string, score: number} | ...>>` (`services/memoryTierService.ts:220`).
- Produces: same `buildKnowledgeContextBlock` signature; no change for later tasks.

This is a separate task from Task 1 because it carries different risk: Task 1's parallelization is unambiguously safe (each `trackAccess` call is independent of every other). This task runs the *first* search block (vault knowledge — reads `long-term`/`knowledge` tiers) concurrently with the *second* search block (working memory — a different tier). They don't read or write the same data, so there's no correctness risk, but a reviewer evaluating this file should be able to accept Task 1 without also having to accept this one.

- [ ] **Step 1: Write the failing test**

Add to `services/assistantService.test.ts`:

```typescript
describe('buildKnowledgeContextBlock — the two search sections run concurrently', () => {
    it('starts the working-memory search before the vault-knowledge search resolves', async () => {
        const order: string[] = [];
        vi.mocked(knowledgeService.search).mockImplementation(async () => {
            order.push('vault:start');
            await new Promise((r) => setTimeout(r, 20));
            order.push('vault:end');
            return [];
        });
        vi.mocked(memoryTierService.searchAll).mockImplementation(async () => {
            order.push('working:start');
            return [];
        });

        await buildKnowledgeContextBlock('some query');

        // If the two sections ran sequentially, 'working:start' could only
        // appear after 'vault:end' (since the vault section is awaited to
        // completion first). Concurrent execution means it appears before.
        expect(order.indexOf('working:start')).toBeLessThan(order.indexOf('vault:end'));
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run services/assistantService.test.ts`
Expected: FAIL — the current code fully awaits the vault-knowledge `try` block (including `Promise.all` from Task 1) before even entering the second `try` block that calls `searchAll`, so `working:start` is always after `vault:end`.

- [ ] **Step 3: Write minimal implementation**

Replace the two sequential `try` blocks in `buildKnowledgeContextBlock` with two functions run via `Promise.allSettled`:

```typescript
export async function buildKnowledgeContextBlock(context: string): Promise<string> {
    const q = context.trim();
    if (!q) return '';

    const buildVaultKnowledgeSection = async (): Promise<string | null> => {
        try {
            const { knowledgeService } = await import('./knowledgeService');
            const { memoryTierService } = await import('./memoryTierService');
            const results = await knowledgeService.search({
                query: q,
                kinds: ['memory', 'note', 'vault_note', 'prompt'],
                tiers: ['long-term', 'knowledge'],
                maxResults: 8,
            });
            if (results.length === 0) return null;

            await Promise.all(
                results.map((r) => memoryTierService.trackAccess(r.ref).catch(() => { /* best-effort */ }))
            );

            const items = results.map((r) => {
                const tagStr = r.ref.tags.length ? ` [${r.ref.tags.slice(0, 3).join(', ')}${r.ref.tags.length > 3 ? '…' : ''}]` : '';
                const snippet = r.snippet && r.snippet !== r.ref.title
                    ? `\n    ${r.snippet.replace(/\n/g, '\n    ').slice(0, 200)}`
                    : '';
                return `- [${r.ref.kind}] ${r.ref.title}${tagStr}${snippet}`;
            });
            return `## Vault Knowledge\n\nUseful context from your notes and memories:\n${items.join('\n')}`;
        } catch {
            return null; // knowledge service unavailable — skip
        }
    };

    const buildWorkingMemorySection = async (): Promise<string | null> => {
        try {
            const { memoryTierService } = await import('./memoryTierService');
            const allResults = await memoryTierService.searchAll(q, 5);
            const workingEntries = allResults.filter(
                (r): r is { kind: 'working'; workingEntry: WorkingMemoryEntry; snippet: string; score: number } => r.kind === 'working'
            );
            if (workingEntries.length === 0) return null;
            return `## Recent Conversation Context\n\nFrom the current session:\n${workingEntries.map((r) => `- ${r.snippet.replace(/\n/g, ' ').slice(0, 150)}`).join('\n')}`;
        } catch {
            return null; // memory tier service unavailable — skip
        }
    };

    const [vaultSection, workingSection] = await Promise.all([
        buildVaultKnowledgeSection(),
        buildWorkingMemorySection(),
    ]);

    const sections = [vaultSection, workingSection].filter((s): s is string => s !== null);
    if (sections.length === 0) return '';
    return `\n\n${sections.join('\n\n')}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run services/assistantService.test.ts`
Expected: PASS (all 3 tests from Tasks 1 and 2).

- [ ] **Step 5: Commit**

```bash
git add services/assistantService.ts services/assistantService.test.ts
git commit -m "perf(assistant): run vault-knowledge and working-memory searches concurrently"
```

---

## Task 3: Make the voice turn-taking silence timeout configurable

**Files:**
- Modify: `types.ts` (add field to `LLMSettings`, near `generationBackendId: string;` at line 272)
- Modify: `utils/settingsStorage.ts` (default near line 112, hydration near line 210)
- Modify: `services/liveAssistantService.ts:456-457`
- Test: `services/liveAssistantService.test.ts` (new file — tests only the pure resolver function, not the full `connect()` flow, which needs a WebSocket/mic mock disproportionate to this change)

**Interfaces:**
- Produces: `resolveVoiceSilenceTimeoutMs(settings: LLMSettings): number`, exported from `services/liveAssistantService.ts`. Task 4 does not call this directly (it only edits the settings value through the UI), but reuses the same `voiceSilenceTimeoutMs` field name on `LLMSettings`.

The default stays `800` — this task makes the value configurable without changing anyone's current behavior. Task 4 adds the UI to actually change it.

- [ ] **Step 1: Write the failing test**

Create `services/liveAssistantService.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveVoiceSilenceTimeoutMs } from './liveAssistantService';
import type { LLMSettings } from '../types';

describe('resolveVoiceSilenceTimeoutMs', () => {
    it('defaults to 800ms when the setting is unset', () => {
        expect(resolveVoiceSilenceTimeoutMs({} as LLMSettings)).toBe(800);
    });

    it('uses the configured value when set', () => {
        expect(resolveVoiceSilenceTimeoutMs({ voiceSilenceTimeoutMs: 500 } as LLMSettings)).toBe(500);
    });

    it('falls back to 800ms for an invalid (non-positive) configured value', () => {
        expect(resolveVoiceSilenceTimeoutMs({ voiceSilenceTimeoutMs: 0 } as LLMSettings)).toBe(800);
        expect(resolveVoiceSilenceTimeoutMs({ voiceSilenceTimeoutMs: -100 } as LLMSettings)).toBe(800);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run services/liveAssistantService.test.ts`
Expected: FAIL with "resolveVoiceSilenceTimeoutMs is not a function" (it doesn't exist yet) or a module import error.

- [ ] **Step 3: Write minimal implementation**

In `types.ts`, add the field next to the other local-generation settings (near line 272):

```typescript
  generationBackendId: string;
  /** Silence duration (ms) required before the voice pipeline treats the user's turn as over. Default 800. */
  voiceSilenceTimeoutMs?: number;
```

In `utils/settingsStorage.ts`, add the default (near line 112, alongside the other recently-added fields):

```typescript
  generationBackendId: 'cloud',
  comfyUrl: 'http://127.0.0.1:8188',
  a1111Url: 'http://127.0.0.1:7860',
  voiceSilenceTimeoutMs: 800,
```

And the hydration line (near line 210):

```typescript
      generationBackendId: parsed.generationBackendId ?? 'cloud',
      comfyUrl: parsed.comfyUrl ?? 'http://127.0.0.1:8188',
      a1111Url: parsed.a1111Url ?? 'http://127.0.0.1:7860',
      voiceSilenceTimeoutMs: parsed.voiceSilenceTimeoutMs ?? 800
```

In `services/liveAssistantService.ts`, add the exported resolver function near the top of the file (module scope, not inside the class) and use it at the `TurnManager` instantiation site:

```typescript
/** Resolves the configured voice silence timeout, falling back to 800ms
 *  for an unset or invalid (non-positive) value. Exported standalone so
 *  it's testable without mocking the full connect() flow (WebSocket + mic). */
export function resolveVoiceSilenceTimeoutMs(settings: LLMSettings): number {
    const configured = settings.voiceSilenceTimeoutMs;
    return typeof configured === 'number' && configured > 0 ? configured : 800;
}
```

Then replace:

```typescript
// Before:
this.turnManager = new TurnManager();
this.turnManager.silenceTimeoutMs = 800;

// After:
this.turnManager = new TurnManager();
this.turnManager.silenceTimeoutMs = resolveVoiceSilenceTimeoutMs(this.settings);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run services/liveAssistantService.test.ts`
Expected: PASS (all 3 tests).

Also run: `pnpm lint` — confirm `LLMSettings` widening didn't break any exhaustive-field code elsewhere (there shouldn't be any, since the field is optional).

- [ ] **Step 5: Commit**

```bash
git add types.ts utils/settingsStorage.ts services/liveAssistantService.ts services/liveAssistantService.test.ts
git commit -m "feat(voice): make silence-timeout-before-processing configurable (default unchanged, 800ms)"
```

---

## Task 4: Add a Settings UI control for the voice silence timeout

**Files:**
- Modify: `components/settings/AssistantSection.tsx`
- Modify: `components/SetupPage.tsx:436` (add `'voiceSilenceTimeoutMs'` to the persistence allow-list)
- Test: `components/settings/AssistantSection.test.tsx` (new file)

**Interfaces:**
- Consumes: `settings.voiceSilenceTimeoutMs` (from Task 3), `handleSettingsChange: (field: keyof LLMSettings, value: any) => void` (existing prop on `AssistantSectionProps`).
- Produces: nothing consumed by later tasks — this is a leaf UI control.

- [ ] **Step 1: Write the failing test**

Create `components/settings/AssistantSection.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import AssistantSection from './AssistantSection';
import type { LLMSettings } from '../../types';

beforeEach(() => cleanup());

const baseSettings = { activeLLM: 'gemini', voiceSilenceTimeoutMs: 800 } as LLMSettings;
// activeSubTab is a required prop on AssistantSectionProps but unused inside
// the component body (declared, never destructured/read) — any string
// satisfies it without affecting what renders.
const activeSubTab = 'persona';

describe('AssistantSection — voice silence timeout control', () => {
    it('renders the current value', () => {
        render(<AssistantSection activeSubTab={activeSubTab} settings={baseSettings} handleSettingsChange={vi.fn()} />);
        const slider = screen.getByLabelText(/silence.*timeout/i) as HTMLInputElement;
        expect(slider.value).toBe('800');
    });

    it('calls handleSettingsChange with the new value on change', () => {
        const handleSettingsChange = vi.fn();
        render(<AssistantSection activeSubTab={activeSubTab} settings={baseSettings} handleSettingsChange={handleSettingsChange} />);
        const slider = screen.getByLabelText(/silence.*timeout/i);
        fireEvent.change(slider, { target: { value: '500' } });
        expect(handleSettingsChange).toHaveBeenCalledWith('voiceSilenceTimeoutMs', 500);
    });

    it('falls back to 800 when the setting is unset', () => {
        render(<AssistantSection activeSubTab={activeSubTab} settings={{ activeLLM: 'gemini' } as LLMSettings} handleSettingsChange={vi.fn()} />);
        const slider = screen.getByLabelText(/silence.*timeout/i) as HTMLInputElement;
        expect(slider.value).toBe('800');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run components/settings/AssistantSection.test.tsx`
Expected: FAIL — `getByLabelText(/silence.*timeout/i)` finds nothing, since the control doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

In `components/settings/AssistantSection.tsx`, add a new `SettingRow` (placed after the existing "Provider Fallback" row, matching that row's structural pattern):

```tsx
                    <SettingRow label="Voice Silence Timeout" desc="How long the assistant waits after you stop talking before it starts responding, in live voice mode. Lower feels quicker but risks cutting off natural pauses mid-sentence.">
                        <div className="flex items-center gap-4 w-full md:w-[400px]">
                            <input
                                type="range"
                                id="voice-silence-timeout"
                                aria-label="Voice silence timeout (ms)"
                                min={300}
                                max={2000}
                                step={100}
                                value={settings.voiceSilenceTimeoutMs ?? 800}
                                onChange={(e) => handleSettingsChange('voiceSilenceTimeoutMs', parseInt(e.target.value, 10))}
                                className="range range-xs range-primary flex-1"
                            />
                            <span className="text-[11px] font-mono font-bold text-primary w-16 text-right">
                                {settings.voiceSilenceTimeoutMs ?? 800}ms
                            </span>
                        </div>
                    </SettingRow>
```

In `components/SetupPage.tsx:436`, add the field to the allow-list array:

```typescript
        if (['youtube', 'googleIdentity', 'spotify', 'dashboardImageUrl', 'dashboardVideoUrl', 'darkTheme', 'mcpServers', 'googleApiKey', 'storageProvider', 'driveFolderId', 'driveFolderName', 'autoTagEnabled', 'providerFallbackEnabled', 'providerFallbackChain', 'embeddingModel', 'generationBackendId', 'comfyUrl', 'a1111Url', 'modifierWeights', 'voiceSilenceTimeoutMs'].includes(field)) updateSettings(updated);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run components/settings/AssistantSection.test.tsx`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/settings/AssistantSection.tsx components/settings/AssistantSection.test.tsx components/SetupPage.tsx
git commit -m "feat(voice): add Settings UI control for the silence-timeout setting"
```

---

## Task 5: Extract the chat message bubble into a memoized component

**Files:**
- Create: `components/MessageBubble.tsx`
- Modify: `components/LLMChatPanel.tsx:32` (reuse the exported message type), `components/LLMChatPanel.tsx:577-664` (replace inline JSX with `<MessageBubble>`)
- Test: `components/MessageBubble.test.tsx` (new file)

**Interfaces:**
- Produces: `export interface ChatBubbleMessage { role: 'user' | 'assistant' | 'system'; content: string; attachments?: { data: string; mimeType: string; fileName?: string }[]; citations?: { index: number; fileName: string; title: string }[] }` and `export const MessageBubble: React.FC<{ msg: ChatBubbleMessage; isTyping: boolean }>`, both from `components/MessageBubble.tsx`.
- Consumes (from `LLMChatPanel.tsx`'s existing state): the `messages` array element shape and the `isProcessing` boolean, recomputed per-item as `isTyping` in the parent's `.map()` call so each bubble only re-renders when *its own* typing-indicator condition changes, not whenever any global processing flag flips.

This is the primary fix for streaming smoothness: because `setMessages` builds its next array as `[...prev]` with only the last element replaced, every *other* element keeps the exact same object reference across the update. `React.memo`'s default (shallow) prop comparison exploits that directly — wrapping the bubble is enough on its own; no custom comparator needed.

- [ ] **Step 1: Write the failing test**

Create `components/MessageBubble.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MessageBubble, type ChatBubbleMessage } from './MessageBubble';

beforeEach(() => cleanup());

describe('MessageBubble', () => {
    it('renders user message content', () => {
        const msg: ChatBubbleMessage = { role: 'user', content: 'hello there' };
        render(<MessageBubble msg={msg} isTyping={false} />);
        expect(screen.getByText('hello there')).toBeTruthy();
    });

    it('renders assistant markdown content', () => {
        const msg: ChatBubbleMessage = { role: 'assistant', content: '**bold text**' };
        render(<MessageBubble msg={msg} isTyping={false} />);
        expect(screen.getByText('bold text')).toBeTruthy();
    });

    it('shows the typing indicator only when isTyping is true and content is empty', () => {
        const { rerender } = render(<MessageBubble msg={{ role: 'assistant', content: '' }} isTyping={true} />);
        expect(document.querySelector('.animate-bounce')).toBeTruthy();

        rerender(<MessageBubble msg={{ role: 'assistant', content: '' }} isTyping={false} />);
        expect(document.querySelector('.animate-bounce')).toBeFalsy();
    });

    it('does not re-render when passed the same msg object reference and isTyping value', () => {
        const msg: ChatBubbleMessage = { role: 'assistant', content: 'stable text' };
        const renderSpy = vi.fn();
        const Wrapped = (props: { msg: ChatBubbleMessage; isTyping: boolean }) => {
            renderSpy();
            return <MessageBubble {...props} />;
        };
        // MessageBubble itself is memoized; render count on ITS internals
        // isn't directly observable from outside without internal
        // instrumentation, so this test instead verifies referential
        // stability doesn't throw and produces the same DOM — the memo
        // behavior itself is proven by Task 5's manual verification
        // (see Step 4 note below) since React internals aren't a unit-test
        // surface. Kept here as a smoke test for the wrapper contract.
        const { rerender } = render(<Wrapped msg={msg} isTyping={false} />);
        rerender(<Wrapped msg={msg} isTyping={false} />);
        expect(screen.getByText('stable text')).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run components/MessageBubble.test.tsx`
Expected: FAIL with a module-not-found error — `components/MessageBubble.tsx` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `components/MessageBubble.tsx` by moving the existing JSX from `components/LLMChatPanel.tsx:578-663` verbatim (same classNames, same `Markdown`/`SyntaxHighlighter` config), parameterized on `msg` and `isTyping` instead of closing over `messages`/`index`/`isProcessing`:

```tsx
import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { PaperclipIcon } from './icons';

export interface ChatBubbleMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    attachments?: { data: string; mimeType: string; fileName?: string }[];
    citations?: { index: number; fileName: string; title: string }[];
}

const MessageBubbleImpl: React.FC<{ msg: ChatBubbleMessage; isTyping: boolean }> = ({ msg, isTyping }) => (
    <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : msg.role === 'system' ? 'items-center' : 'items-start'}`}>
        {msg.role === 'system' && !msg.content.includes('Control Node initialized. Awaiting commands.') && (
            <div className="text-[15px] font-mono text-warning/80 bg-warning/10 px-3 py-1.5 rounded-lg border border-warning/20 inline-block my-2">
                &gt; {msg.content}
            </div>
        )}

        {msg.role === 'user' && (
            <div className="bg-primary/30 text-base-content px-4 py-3 max-w-[80%] rounded-2xl rounded-tr-sm border border-primary/40 shadow-sm backdrop-blur-sm flex flex-col gap-2">
                {msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {msg.attachments.map((att, idx) => (
                            <div key={idx} className="relative bg-black/20 rounded p-1 overflow-hidden" style={{ width: '80px', height: '80px' }}>
                                {att.mimeType.startsWith('image/') ? (
                                    <img src={att.data} alt={att.fileName} className="w-full h-full object-cover rounded" />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-xs opacity-70">
                                        <PaperclipIcon className="w-6 h-6 mb-1" />
                                        <span className="truncate w-full text-center px-1">{att.fileName}</span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
                <div className="text-[15px] whitespace-pre-wrap">{msg.content}</div>
            </div>
        )}

        {msg.role === 'assistant' && (
            <div className="bg-base-200/80 text-base-content px-4 py-3 max-w-[95%] rounded-2xl rounded-tl-sm border border-white/5 shadow-sm backdrop-blur-sm">
                <div className="prose prose-sm prose-invert max-w-none text-[15px] leading-relaxed">
                    <Markdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            table: ({ node, ...props }) => (
                                <div className="overflow-x-auto my-4 w-full">
                                    <table className="table table-zebra w-full border border-base-content/10 text-[15px]" {...props} />
                                </div>
                            ),
                            th: ({ node, ...props }) => <th className="bg-base-300 text-base-content/80 font-bold text-[15px]" {...props} />,
                            td: ({ node, ...props }) => <td className="text-[15px]" {...props} />,
                            code({ node, inline, className, children, ...props }: any) {
                                const match = /language-(\w+)/.exec(className || '');
                                return !inline && match ? (
                                    <SyntaxHighlighter
                                        {...props}
                                        style={vscDarkPlus}
                                        language={match[1]}
                                        PreTag="div"
                                        className="rounded-md my-4 !bg-base-300"
                                    >
                                        {String(children).replace(/\n$/, '')}
                                    </SyntaxHighlighter>
                                ) : (
                                    <code {...props} className={`${className} bg-base-300 text-primary px-1.5 py-0.5 rounded text-[0.85em]`}>
                                        {children}
                                    </code>
                                );
                            },
                        }}
                    >
                        {msg.content}
                    </Markdown>
                </div>
                {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/10 space-y-1">
                        <p className="text-[10px] font-mono uppercase tracking-wider opacity-40 mb-1">Sources</p>
                        {msg.citations.map((c) => (
                            <div key={c.index} className="flex items-center gap-2 text-xs font-mono opacity-60 hover:opacity-100">
                                <span className="text-primary text-[10px]">[{c.index}]</span>
                                <span className="truncate">{c.title || c.fileName}</span>
                            </div>
                        ))}
                    </div>
                )}
                {!msg.content && isTyping && (
                    <div className="flex space-x-1 items-center h-4 mt-2">
                        <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce"></div>
                    </div>
                )}
            </div>
        )}
    </div>
);

// React.memo's default shallow comparison is sufficient here: LLMChatPanel
// builds its next messages array as [...prev] with only the streaming
// element replaced, so every OTHER element keeps its exact object
// reference across a re-render — memo skips those bubbles entirely.
// Known limitation, out of scope here: this component is keyed by array
// index in the parent, so "Load older messages" (which prepends to the
// front of the array) shifts every existing message's index and defeats
// this memoization for one render. Fixing that needs a stable per-message
// id, which the message type doesn't have today.
export const MessageBubble = React.memo(MessageBubbleImpl);
```

In `components/LLMChatPanel.tsx`:
1. Replace the local inline type at line 32 to import and reuse `ChatBubbleMessage`:

```typescript
// Before:
const [messages, setMessages] = useState<{ role: 'user' | 'assistant' | 'system', content: string, attachments?: any[] }[]>([]);

// After:
import { MessageBubble, type ChatBubbleMessage } from './MessageBubble';
// ...
const [messages, setMessages] = useState<ChatBubbleMessage[]>([]);
```

2. Replace the inline JSX block (`components/LLMChatPanel.tsx:577-664`, from `{messages.map((msg, index) => (` through its matching `))}`) with:

```tsx
{messages.map((msg, index) => (
    <MessageBubble
        key={index}
        msg={msg}
        isTyping={index === messages.length - 1 && !msg.content && isProcessing}
    />
))}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run components/MessageBubble.test.tsx`
Expected: PASS (all 4 tests).

Then run: `pnpm lint` — the two `(msg as any).citations` casts previously at `components/LLMChatPanel.tsx:643` and `:646` move into `MessageBubble.tsx` as part of Step 3 and no longer need the cast there (`citations` is now a real, typed field on `ChatBubbleMessage`); confirm none remain in `LLMChatPanel.tsx` after the JSX block is removed. The one other `as any` in that file, `handleSubmit(e as any)` at line 719, is an unrelated form-event cast — leave it.

Manual verification (React re-render behavior isn't practically observable from a jsdom unit test without instrumenting React internals): open the app, start a chat reply that streams over a few seconds, and confirm in the React DevTools Profiler that only the last message bubble commits per streamed chunk — not the whole list.

- [ ] **Step 5: Commit**

```bash
git add components/MessageBubble.tsx components/MessageBubble.test.tsx components/LLMChatPanel.tsx
git commit -m "perf(chat): extract memoized MessageBubble so streaming only re-renders the active message"
```

---

## Task 6: Throttle streamed-chunk `setMessages` updates

**Files:**
- Create: `components/chatStreamThrottle.ts`
- Modify: `components/LLMChatPanel.tsx:354-368` (and its `catch` block, see Step 3)
- Test: `components/LLMChatPanel.streamThrottle.test.tsx` (new file)

**Interfaces:**
- Consumes: nothing new — this task only changes *how often* the existing `setMessages` call in the streaming loop fires, not its logic.
- Produces: `createChunkFlusher(onFlush: (accumulated: string) => void): { push(chunk: string): void; flushNow(): void }`, exported from `components/chatStreamThrottle.ts`. Not consumed by other tasks — this is the last task in this plan.

Task 5 stops re-rendering messages that aren't changing. This task reduces how often the *one* message that IS changing (the streaming assistant reply) triggers a render, for providers that stream in many small chunks (e.g. word-by-word or smaller) faster than the screen can usefully repaint. Batches accumulated text and flushes on animation frames instead of synchronously on every chunk.

- [ ] **Step 1: Write the failing test**

Create `components/LLMChatPanel.streamThrottle.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// This test targets the extracted throttling helper directly (see Step 3)
// rather than the full LLMChatPanel component, which would require mocking
// runAssistantTurn, settings, audioService, and persistSession — a much
// larger surface than the thing actually being changed.
import { createChunkFlusher } from './chatStreamThrottle';

describe('createChunkFlusher', () => {
    let rafCallbacks: FrameRequestCallback[];
    beforeEach(() => {
        rafCallbacks = [];
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            rafCallbacks.push(cb);
            return rafCallbacks.length;
        });
    });
    afterEach(() => vi.unstubAllGlobals());

    const flushRaf = () => {
        const cbs = rafCallbacks;
        rafCallbacks = [];
        cbs.forEach((cb) => cb(0));
    };

    it('does not call onFlush synchronously when a chunk is pushed', () => {
        const onFlush = vi.fn();
        const flusher = createChunkFlusher(onFlush);
        flusher.push('hello');
        expect(onFlush).not.toHaveBeenCalled();
    });

    it('batches multiple chunks pushed before the next animation frame into one flush', () => {
        const onFlush = vi.fn();
        const flusher = createChunkFlusher(onFlush);
        flusher.push('hel');
        flusher.push('lo ');
        flusher.push('world');
        flushRaf();
        expect(onFlush).toHaveBeenCalledTimes(1);
        expect(onFlush).toHaveBeenCalledWith('hello world');
    });

    it('starts a fresh accumulation after each flush', () => {
        const onFlush = vi.fn();
        const flusher = createChunkFlusher(onFlush);
        flusher.push('first');
        flushRaf();
        flusher.push('second');
        flushRaf();
        expect(onFlush).toHaveBeenNthCalledWith(1, 'first');
        expect(onFlush).toHaveBeenNthCalledWith(2, 'second');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run components/LLMChatPanel.streamThrottle.test.tsx`
Expected: FAIL with a module-not-found error — `components/chatStreamThrottle.ts` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `components/chatStreamThrottle.ts`:

```typescript
/**
 * Batches rapid successive text chunks into a single callback per
 * animation frame, instead of one callback per chunk. Used by the chat
 * streaming loop so a provider emitting many small tokens per second
 * doesn't trigger a React state update (and re-render) for each one.
 */
export function createChunkFlusher(onFlush: (accumulated: string) => void) {
    let buffer = '';
    let scheduled = false;

    const flush = () => {
        scheduled = false;
        if (buffer.length === 0) return;
        const toFlush = buffer;
        buffer = '';
        onFlush(toFlush);
    };

    return {
        push(chunk: string) {
            buffer += chunk;
            if (!scheduled) {
                scheduled = true;
                requestAnimationFrame(flush);
            }
        },
        /** Force any buffered text out immediately — call when the stream ends. */
        flushNow() {
            flush();
        },
    };
}
```

In `components/LLMChatPanel.tsx`, use it in the streaming loop:

```typescript
// Before:
for await (const ev of events) {
    if (ev.type === 'text') {
        if (!assistantOpen) {
            assistantOpen = true;
            fullResponse = '';
            setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
        }
        fullResponse += ev.chunk;
        if (ev.chunk.trim() && ev.chunk.length > 0) audioService.playType();
        setMessages(prev => {
            const cloned = [...prev];
            cloned[cloned.length - 1] = { ...cloned[cloned.length - 1], content: fullResponse };
            return cloned;
        });
    } else if (ev.type === 'turn_end') {
        ...

// After:
const flusher = createChunkFlusher((accumulated) => {
    fullResponse += accumulated;
    setMessages(prev => {
        const cloned = [...prev];
        cloned[cloned.length - 1] = { ...cloned[cloned.length - 1], content: fullResponse };
        return cloned;
    });
});

for await (const ev of events) {
    if (ev.type === 'text') {
        if (!assistantOpen) {
            assistantOpen = true;
            fullResponse = '';
            setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
        }
        if (ev.chunk.trim() && ev.chunk.length > 0) audioService.playType();
        flusher.push(ev.chunk);
    } else if (ev.type === 'turn_end') {
        flusher.flushNow();
        assistantOpen = false;
        setMessages(prev => { persistSession(prev, currentSessionId); return prev; });
    } else if (ev.type === 'tool_start') {
        setMessages(prev => [...prev, { role: 'system', content: '...' }]);
    } else if (ev.type === 'tool_result') {
        // tool result is fed back to the model automatically —
        // the assistant will incorporate it in its natural response.
        // No need to pollute the chat with raw JSON.
    }
}
```

The existing `catch` block (immediately below the loop) appends a new system error message on top of whatever's currently in `messages` — if the stream throws mid-flight, any text still sitting in `flusher`'s buffer at that moment would otherwise be silently dropped from the visible partial reply. Add `flusher.flushNow()` as the first line of `catch`, before it builds the error message, so the exact behavior from before this task (partial response stays visible, error message appended after it) is preserved:

```typescript
// Before:
} catch (error: any) {
    console.error('Chat error:', error);
    setMessages(prev => {
        const next = [...prev, {
            role: 'system' as const,
            content: `Error: ${error.message || 'Connection failed'}. Please check your LLM configuration.`
        }];
        persistSession(next, currentSessionId);
        return next;
    });
} finally {
    setIsProcessing(false);
    appEventBus.emit('chatSpeaking', { speaking: false });
}

// After:
} catch (error: any) {
    flusher.flushNow();
    console.error('Chat error:', error);
    setMessages(prev => {
        const next = [...prev, {
            role: 'system' as const,
            content: `Error: ${error.message || 'Connection failed'}. Please check your LLM configuration.`
        }];
        persistSession(next, currentSessionId);
        return next;
    });
} finally {
    setIsProcessing(false);
    appEventBus.emit('chatSpeaking', { speaking: false });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run components/LLMChatPanel.streamThrottle.test.tsx`
Expected: PASS (all 3 tests).

Then run the full suite to confirm nothing else in `LLMChatPanel.tsx`'s existing behavior broke: `pnpm test`, `pnpm lint`, `pnpm build`.

Manual verification: send a chat message, confirm the reply still streams in visibly (not one big instant paste) and that the full message content is present once the reply finishes — not truncated by a missed final flush.

- [ ] **Step 5: Commit**

```bash
git add components/chatStreamThrottle.ts components/LLMChatPanel.streamThrottle.test.tsx components/LLMChatPanel.tsx
git commit -m "perf(chat): batch streamed chunks into one state update per animation frame"
```

---

## Self-Review

**Spec coverage:**
- Reply latency (time-to-first-token): Tasks 1-2. ✅
- Voice turn-taking feel: Tasks 3-4. ✅
- Chat UI streaming smoothness: Tasks 5-6. ✅

**Placeholder scan:** no "TBD"/"handle appropriately"/described-but-not-shown steps found; every code step above has real, complete code matching the actual current file contents traced during planning.

**Type consistency check:** `ChatBubbleMessage` (Task 5) is defined once in `components/MessageBubble.tsx` and imported by `components/LLMChatPanel.tsx` — not redefined. `resolveVoiceSilenceTimeoutMs` (Task 3) is referenced by name only within Task 3 itself; Task 4 doesn't call it, it only sets the same `voiceSilenceTimeoutMs` field through the UI, so there's no signature to drift. `createChunkFlusher` (Task 6) is used only within the one file it's introduced for.

**Known, deliberately out-of-scope items surfaced during planning (not silently dropped):**
- Task 5's `MessageBubble` is still keyed by array index in the parent; the "Load older messages" prepend action shifts every subsequent index and defeats memoization for one render when it happens. Fixing this needs a stable per-message id added to the message type and every place messages are created — a larger, separate change.
- This plan does not touch initial bundle/load time (the production build's largest chunk is ~3.8MB) — that's app startup time, not assistant response time, and wasn't one of the three areas selected for this plan.
