# AI Assistant Extensions Implementation Plan (rev 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the dead Hermes integration, then extend the Kollektiv AI assistant with: a switchable reasoning brain (Gemini/Ollama/OpenRouter/Anthropic/llama.cpp), web search + an in-app web viewer panel, file saving surfaced in a Notes & Files panel (downloadable to the PC), movie-subtitle captions above the footer oscillator (voice AND text chat), dashboard redirect on activation, a configurable three.js talking-head avatar, persistent cross-session memory, MCP tools for the assistant brain, and a voice hotkey.

**Architecture:** The assistant already has a provider-agnostic tool registry (`ASSISTANT_TOOLS` in `services/assistantTools.ts`) executed by `executeAssistantTool`, and a single entry point `runAssistantTurn` in `services/assistantService.ts` that currently hard-codes Gemini. We add a `settings.assistantProvider` switch and per-provider turn loops (native function calling for Gemini/Ollama/OpenRouter; an `<action>` JSON text protocol for Anthropic/llama.cpp which stream through the existing `streamChat` dispatcher). New capabilities are added as plain entries in `ASSISTANT_TOOLS`, so every brain and the live voice mode get them for free; MCP server tools are appended dynamically. UI features (web viewer, notes/files panel, captions, avatar) communicate through the existing `appEventBus` singleton.

**Tech Stack:** React 19 + TypeScript, motion/react + gsap (existing animation patterns), three ^0.184 (already installed), vitest, localStorage + File System Access API vault (`fileSystemManager`), Gemini `googleSearch` grounding, existing `/proxy-remote` express proxy, existing `mcpService`.

## Global Constraints

- **Live voice conversations are untouched**: `services/liveAssistantService.ts` always runs on Gemini Live (`gemini-3.1-flash-live-preview`) with the settings-configured voice, regardless of `assistantProvider`. Do not modify its model or connection logic (only its tool list gains MCP tools in Task 15).
- **"ChatGPT" support is served through OpenRouter** (`openai/gpt-4o` etc. as `openrouterModel`). Do NOT add a new OpenAI provider — the app has no OpenAI service and OpenRouter already covers it. Mention this in the brain-selector description text.
- **Hermes is dead code** and is removed in Task 1 — no later task may reference it. The chat-panel state in App/Header is *renamed* (`isHermesOpen` → `isChatPanelOpen`, `onToggleHermes` → `onToggleChatPanel`), not deleted: it drives `LLMChatPanel`, which stays.
- No new npm dependencies. `three` and `@types/three` are already in package.json.
- New tools must be added to `ASSISTANT_TOOLS` in `services/assistantTools.ts` AND mentioned in the `WORKSPACE_CAPABILITIES` string in `services/assistantService.ts` (its comment demands they stay in sync).
- Package manager is **pnpm**. Typecheck: `pnpm run lint` (runs `tsc --noEmit`). Tests: `pnpm test` (runs `vitest run`, node environment — NO jsdom; tests must not rely on `window`/`document` and must stub `localStorage` on `globalThis` when needed).
- Settings persist as one JSON blob in localStorage (`utils/settingsStorage.ts`) — never store images/data-URLs inside `LLMSettings`. Binary assets go into the vault via `fileSystemManager.saveFile`.
- All user-facing strings follow the existing HUD style (uppercase tracking-widest labels, daisyUI classes).
- Commit after every task with a conventional-commit message.

## Execution order

Task 1 (Hermes removal) first — later tasks reference the renamed handlers. Then 2–5 (brain switching, sequential), 6–7 (web), 8–10 (files + notes, 9 before 10), 11 (captions), 12 (redirect), 13 (avatar), 14 (memory), 15 (MCP bridge — after 2–4 since it touches every turn loop), 16 (hotkey). Tasks 6–7, 8–10, 11, 12, 13, 14, 16 are mutually independent.

---

### Task 1: Remove the Hermes integration (dead code)

Hermes was an external agent gateway (SSE control channel + local proxy) that is no longer used. Its only client-side consumer is `HermesController`; the `isHermesOpen`/`onToggleHermes` names in App/Header actually control the chat panel and are renamed rather than removed.

**Files:**
- Delete: `components/HermesController.tsx`
- Modify: `components/App.tsx`, `components/Header.tsx` (renames + unmount)
- Modify: `types.ts` (lines 77–80, 114), `utils/settingsStorage.ts` (lines 20–23, 41, 133–135), `utils/errorHandler.ts` (lines 12–17)
- Modify: `server.ts` (routes `/hermes-local` ~line 101, `/api/events` ~line 585, `/api/hermes/control` ~line 602, plus the SSE `clients` plumbing they share and the "Hermes Agent" wording in the `/proxy-remote` DNS error message ~line 376)

**Interfaces:**
- Produces: Header prop renamed to `onToggleChatPanel?: () => void`; App handlers renamed to `handleToggleChatPanel` / `handleCloseChatPanel`, state to `isChatPanelOpen`. Tasks 10 and 12 use these names.

- [ ] **Step 1: Delete the controller and unmount it**

```bash
git rm components/HermesController.tsx
```

In `components/App.tsx`: remove `import { HermesController } from './HermesController';` (line 45) and the `<HermesController />` element (line 1122).

- [ ] **Step 2: Rename the chat-panel plumbing**

In `components/App.tsx`: rename `isHermesOpen` → `isChatPanelOpen`, `setIsHermesOpen` → `setIsChatPanelOpen` (line 425), `handleToggleHermes` → `handleToggleChatPanel` (line 923), `handleCloseHermes` → `handleCloseChatPanel` (line 928), and update the `<Header onToggleHermes={...}>` prop (line 1053) to `onToggleChatPanel={handleToggleChatPanel}` and the `<LLMChatPanel isOpen={...} onClose={...}>` usages (lines 1119–1120).

In `components/Header.tsx`: rename the `onToggleHermes?: () => void;` prop (line 23), its destructuring (line 117), and the call site (line 319) to `onToggleChatPanel`.

- [ ] **Step 3: Remove Hermes settings fields**

In `types.ts` remove:

```ts
  // Hermes Settings
  hermesBaseUrl: string;
  hermesModel: string;
  hermesApiKey: string;
```

and `hermesTokenUsage?: TokenUsage;` (line 114).

In `utils/settingsStorage.ts` remove the matching defaults (lines 20–23: `hermesBaseUrl`, `hermesModel`, `hermesApiKey`; line 41: `hermesTokenUsage`) and the `hermesTokenUsage` merge block (lines 133–135). **Keep** the one-line legacy migration at line 174 (`if (merged.activeLLM === ('hermes' as any)) ...`) — it repairs old persisted settings that still say `activeLLM: 'hermes'`; add a comment `// legacy: Hermes provider removed 2026-07`.

- [ ] **Step 4: Clean error messages**

In `utils/errorHandler.ts`: delete the `context.toLowerCase().includes("hermes")` branch (lines 12–14) and reword line 17 to `Please ensure your API/Ollama target is reachable and your configuration is correct.`

In `server.ts` `/proxy-remote` DNS error (~line 376): reword `(under AI Engine, OpenRouter, or Hermes Agent)` to `(under AI Engine or OpenRouter)`.

- [ ] **Step 5: Remove the three server routes**

In `server.ts` delete: the `/hermes-local` proxy route (block starting ~line 101), the `/api/events` SSE route (~line 585), the `/api/hermes/control` route (~line 602), and the shared SSE client-list plumbing they use (the `clients` array declaration and any `clients.push`/broadcast helpers — locate with a search for `clients` before deleting; nothing else uses them once `/api/events` and `/api/hermes/control` are gone). Also update the comment at line 98–100 to drop the Hermes mention.

- [ ] **Step 6: Verify no traces remain**

Run: `pnpm run lint` — no errors.
Run: `grep -ri hermes --include="*.ts" --include="*.tsx" .` (excluding node_modules/docs) — expected: only the commented legacy-migration line in `settingsStorage.ts`.
Run: `pnpm dev` — app boots, chat panel still opens from the header chat-bubble button.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove dead Hermes integration"
```

---

### Task 2: Assistant brain setting + provider dispatch with `<action>` fallback protocol

After this task alone, the assistant brain is switchable to ANY of the six providers: Gemini keeps native function calling; all others work through a text-based `<action>` tool protocol (upgraded to native tool calling for Ollama/OpenRouter in Tasks 3–4).

**Files:**
- Modify: `types.ts` (add `assistantProvider` to `LLMSettings`, next to the other assistant fields ~line 108)
- Create: `services/assistantProtocol.ts`
- Create: `services/assistantProtocol.test.ts`
- Modify: `services/assistantService.ts`

**Interfaces:**
- Consumes: `streamChat(messages, settings)` from `services/llmService.ts`; `fallbackProtocolPrompt(persona)` and `executeAssistantTool` from `services/assistantTools.ts` (all existing).
- Produces: `getAssistantProvider(settings: LLMSettings): 'gemini' | 'ollama' | 'ollama_cloud' | 'openrouter' | 'anthropic' | 'llamacpp'` (exported from `assistantService.ts`, used by Tasks 3, 4, 5); `parseActionBlock(text: string): { tool: string; args: Record<string, any> } | null` and `visibleText(text: string): string` (exported from `assistantProtocol.ts`); shared `latestAttachments(messages)` helper. `runAssistantTurn`'s signature and `AssistantEvent` union are unchanged, so `LLMChatPanel` needs no edits.

- [ ] **Step 1: Add the setting to types.ts**

In `types.ts`, inside `LLMSettings`, directly under the `assistantPersonality?: string;` line:

```ts
  /** Reasoning engine for the chat assistant. Live voice always runs on Gemini. */
  assistantProvider?: 'gemini' | 'ollama' | 'ollama_cloud' | 'openrouter' | 'anthropic' | 'llamacpp';
```

No default needed in `utils/settingsStorage.ts` — the getter below treats `undefined` as `'gemini'`, preserving current behavior for existing users.

- [ ] **Step 2: Write the failing tests for the protocol helpers**

Create `services/assistantProtocol.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseActionBlock, visibleText } from './assistantProtocol';

describe('parseActionBlock', () => {
    it('extracts a valid action block', () => {
        const text = 'Let me check.\n<action>{"tool": "search_prompts", "args": {"query": "cats"}}</action>';
        expect(parseActionBlock(text)).toEqual({ tool: 'search_prompts', args: { query: 'cats' } });
    });
    it('defaults args to {} when omitted', () => {
        expect(parseActionBlock('<action>{"tool": "list_wildcards"}</action>')).toEqual({ tool: 'list_wildcards', args: {} });
    });
    it('returns null when there is no block', () => {
        expect(parseActionBlock('Just a normal answer.')).toBeNull();
    });
    it('returns null on malformed JSON', () => {
        expect(parseActionBlock('<action>{tool: broken}</action>')).toBeNull();
    });
    it('returns null when tool name is missing', () => {
        expect(parseActionBlock('<action>{"args": {}}</action>')).toBeNull();
    });
});

describe('visibleText', () => {
    it('passes plain text through', () => {
        expect(visibleText('hello world')).toBe('hello world');
    });
    it('cuts everything from the action block onward', () => {
        expect(visibleText('Answer.\n<action>{"tool":"x"}</action>')).toBe('Answer.\n');
    });
    it('holds back a trailing partial "<action>" prefix during streaming', () => {
        expect(visibleText('Answer. <act')).toBe('Answer. ');
        expect(visibleText('Answer. <')).toBe('Answer. ');
    });
    it('does not hold back a "<" that cannot start an action tag', () => {
        expect(visibleText('a < b')).toBe('a < b');
    });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `Cannot find module './assistantProtocol'` (or equivalent resolve error).

- [ ] **Step 4: Implement the protocol helpers**

Create `services/assistantProtocol.ts` (pure — no imports — so it stays unit-testable in vitest's node environment):

```ts
/** Helpers for the <action> tool protocol used by assistant brains without
 * native function calling in our client (anthropic, llamacpp — see
 * assistantTools.fallbackProtocolPrompt for the matching system prompt). */

export interface ActionCall {
    tool: string;
    args: Record<string, any>;
}

const ACTION_RE = /<action>\s*(\{[\s\S]*?\})\s*<\/action>/;

/** Extract the first <action>{"tool":.., "args":..}</action> block, if any. */
export const parseActionBlock = (text: string): ActionCall | null => {
    const m = text.match(ACTION_RE);
    if (!m) return null;
    try {
        const parsed = JSON.parse(m[1]);
        if (typeof parsed.tool !== 'string' || !parsed.tool) return null;
        return { tool: parsed.tool, args: parsed.args && typeof parsed.args === 'object' ? parsed.args : {} };
    } catch {
        return null;
    }
};

/** Portion of a (possibly still streaming) reply safe to show the user:
 * everything before the action block, also holding back a trailing partial
 * "<action>" prefix so the tag never flashes on screen mid-stream. */
export const visibleText = (text: string): string => {
    const idx = text.indexOf('<action>');
    if (idx !== -1) return text.slice(0, idx);
    const TAG = '<action>';
    for (let k = Math.min(TAG.length - 1, text.length); k > 0; k--) {
        if (text.endsWith(TAG.slice(0, k))) return text.slice(0, text.length - k);
    }
    return text;
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS (all `assistantProtocol` tests green; existing `manifestStore` tests still green).

- [ ] **Step 6: Add the dispatch and fallback turn to assistantService.ts**

In `services/assistantService.ts`:

1. Extend/add imports at the top:

```ts
import { executeAssistantTool, geminiToolDeclarations, fallbackProtocolPrompt } from './assistantTools';
import { streamChat } from './llmService';
import { parseActionBlock, visibleText } from './assistantProtocol';
```

2. Replace `runAssistantTurn` and its stale "always reasons on Gemini" comment (lines 53–59) with:

```ts
export type AssistantProvider = NonNullable<LLMSettings['assistantProvider']>;

/** Which engine the assistant reasons on (Settings > Integrations > Assistant).
 * Independent of the footer's activeLLM switch, which governs manual
 * Crafter/Refiner work. Live voice is always Gemini (liveAssistantService). */
export const getAssistantProvider = (settings: LLMSettings): AssistantProvider =>
    settings.assistantProvider || 'gemini';

export async function* runAssistantTurn(messages: ChatMsg[], settings: LLMSettings): AsyncGenerator<AssistantEvent> {
    switch (getAssistantProvider(settings)) {
        case 'gemini':
            yield* runGeminiTurn(messages, settings);
            return;
        default:
            // ponytail: every non-Gemini brain uses the <action> text protocol for
            // now; Ollama and OpenRouter get native tool-calling turns next.
            yield* runFallbackTurn(messages, settings);
    }
}
```

3. Declare a shared helper ABOVE both turn functions and use it inside `runGeminiTurn` in place of its inline attachment lookup (line 68):

```ts
const latestAttachments = (messages: ChatMsg[]) =>
    [...messages].reverse().find(m => m.role === 'user' && m.attachments?.length)?.attachments;
```

4. Append the fallback turn loop at the end of the file:

```ts
// ---------------- Fallback: <action> text protocol over streamChat ----------------

async function* runFallbackTurn(messages: ChatMsg[], settings: LLMSettings): AsyncGenerator<AssistantEvent> {
    const provider = getAssistantProvider(settings);
    // streamChat dispatches on activeLLM, so force it to the assistant's brain.
    // masterRolePrompt is blanked because buildSystemIdentity already prepends
    // it — streamChat would otherwise inject it a second time.
    const chatSettings: LLMSettings = { ...settings, activeLLM: provider as LLMSettings['activeLLM'], masterRolePrompt: '' };
    const attachments = latestAttachments(messages);
    const convo: ChatMsg[] = [
        { role: 'system', content: fallbackProtocolPrompt(buildSystemIdentity(settings)) },
        ...messages.filter(m => m.role !== 'system'),
    ];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        let full = '';
        let shown = 0;
        for await (const chunk of streamChat(convo, chatSettings)) {
            full += chunk;
            const vis = visibleText(full);
            if (vis.length > shown) {
                yield { type: 'text', chunk: vis.slice(shown) };
                shown = vis.length;
            }
        }
        yield { type: 'turn_end' };

        const action = parseActionBlock(full);
        if (!action) return;
        yield { type: 'tool_start', name: action.tool, args: action.args };
        const result = await executeAssistantTool(action.tool, action.args, { settings, attachments });
        yield { type: 'tool_result', name: action.tool, result };
        convo.push({ role: 'assistant', content: full });
        convo.push({ role: 'user', content: `[System — result of ${action.tool}]: ${result}\nContinue helping the user based on this result.` });
    }
    yield { type: 'text', chunk: '\n[Assistant]: tool-call limit reached for this turn.' };
    yield { type: 'turn_end' };
}
```

- [ ] **Step 7: Typecheck and verify Gemini path unchanged**

Run: `pnpm run lint` — no errors. Run: `pnpm test` — PASS.
Manual check: `pnpm dev`, open the chat panel, send "list my wildcards" with the default (Gemini) brain — behaves exactly as before. Then set `"assistantProvider": "anthropic"` (or ollama) in the stored settings JSON and confirm a reply arrives and an `<action>` call round-trips.

- [ ] **Step 8: Commit**

```bash
git add types.ts services/assistantProtocol.ts services/assistantProtocol.test.ts services/assistantService.ts
git commit -m "feat: switchable assistant brain with <action> fallback tool protocol"
```

---

### Task 3: Native tool-calling turn for Ollama / Ollama Cloud

**Files:**
- Modify: `services/assistantService.ts`

**Interfaces:**
- Consumes: `getOllamaConfig(settings)` from `services/ollamaService.ts` (exported; returns `{ baseUrl, model, headers }` and derives cloud-vs-local from `settings.activeLLM`); `ollamaToolDeclarations()` from `services/assistantTools.ts` (already written, currently unused); `latestAttachments` + `MAX_TOOL_ROUNDS` from Task 2.
- Produces: internal `runOllamaTurn` wired into the dispatch switch.

- [ ] **Step 1: Implement runOllamaTurn**

In `services/assistantService.ts`, add to the imports: `ollamaToolDeclarations` (from `./assistantTools`) and `import { getOllamaConfig } from './ollamaService';`. Add the cases to the dispatch switch **above** `default:`:

```ts
        case 'ollama':
        case 'ollama_cloud':
            yield* runOllamaTurn(messages, settings);
            return;
```

Append the turn loop:

```ts
// ---------------- Ollama: native /api/chat tool calling ----------------

async function* runOllamaTurn(messages: ChatMsg[], settings: LLMSettings): AsyncGenerator<AssistantEvent> {
    const provider = getAssistantProvider(settings); // 'ollama' | 'ollama_cloud'
    const config = getOllamaConfig({ ...settings, activeLLM: provider as LLMSettings['activeLLM'] });
    if (!config.baseUrl || !config.model) {
        yield { type: 'text', chunk: 'The Ollama brain is not configured — set the endpoint and model in Settings > Integrations.' };
        yield { type: 'turn_end' };
        return;
    }
    const attachments = latestAttachments(messages);
    const convo: any[] = [
        { role: 'system', content: buildSystemIdentity(settings) },
        ...messages.filter(m => m.role !== 'system').map(m => {
            const msg: any = { role: m.role, content: m.content };
            const images = (m.attachments || [])
                .filter(a => a.mimeType.startsWith('image/'))
                .map(a => (a.data.includes('base64,') ? a.data.split('base64,')[1] : a.data));
            if (images.length) msg.images = images;
            return msg;
        }),
    ];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const res = await fetch(`${config.baseUrl}/api/chat`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({ model: config.model, messages: convo, stream: true, tools: ollamaToolDeclarations() }),
        });
        if (!res.ok || !res.body) throw new Error(`Ollama chat failed (${res.status}): ${await res.text().catch(() => res.statusText)}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let content = '';
        const calls: { name: string; args: Record<string, any> }[] = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop() || '';
            for (const line of lines) {
                if (!line.trim()) continue;
                let json: any;
                try { json = JSON.parse(line); } catch { continue; }
                const msg = json.message;
                if (msg?.content) {
                    content += msg.content;
                    yield { type: 'text', chunk: msg.content };
                }
                for (const tc of msg?.tool_calls || []) {
                    if (tc.function?.name) calls.push({ name: tc.function.name, args: tc.function.arguments || {} });
                }
            }
        }
        yield { type: 'turn_end' };
        if (calls.length === 0) return;

        convo.push({ role: 'assistant', content, tool_calls: calls.map(c => ({ function: { name: c.name, arguments: c.args } })) });
        for (const c of calls) {
            yield { type: 'tool_start', name: c.name, args: c.args };
            const result = await executeAssistantTool(c.name, c.args, { settings, attachments });
            yield { type: 'tool_result', name: c.name, result };
            convo.push({ role: 'tool', content: result });
        }
    }
    yield { type: 'text', chunk: '\n[Assistant]: tool-call limit reached for this turn.' };
    yield { type: 'turn_end' };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm run lint` — expected: no errors.

- [ ] **Step 3: Manual verification**

`pnpm dev`, set brain = Ollama (Task 5 UI, or edit stored settings) with a tool-capable model (e.g. `qwen3`, `llama3.1`). Ask: "navigate to the gallery" → expect a `⚙️ navigate` system line and the app switching tabs. Note: models without tool support return an Ollama 400 mentioning tools — that surfaces in chat as the error message, which is acceptable (the user picked the model).

- [ ] **Step 4: Commit**

```bash
git add services/assistantService.ts
git commit -m "feat: native Ollama tool-calling turn for the assistant brain"
```

---

### Task 4: Native tool-calling turn for OpenRouter (covers ChatGPT/GPT models)

**Files:**
- Modify: `services/assistantService.ts`

**Interfaces:**
- Consumes: `ollamaToolDeclarations()` — its output (`{type:'function', function:{name,description,parameters}}[]`) IS the OpenAI tools wire format, so it is reused verbatim for OpenRouter; `settings.openrouterApiKey` / `settings.openrouterModel`.
- Produces: internal `runOpenRouterTurn` wired into the dispatch switch.

- [ ] **Step 1: Implement runOpenRouterTurn**

Add the case to the dispatch switch above `default:`:

```ts
        case 'openrouter':
            yield* runOpenRouterTurn(messages, settings);
            return;
```

Append:

```ts
// ---------------- OpenRouter: OpenAI-style streaming tool calling ----------------
// ollamaToolDeclarations() already emits the OpenAI tools wire format, so it
// doubles as the OpenRouter declaration set.

async function* runOpenRouterTurn(messages: ChatMsg[], settings: LLMSettings): AsyncGenerator<AssistantEvent> {
    if (!settings.openrouterApiKey) {
        yield { type: 'text', chunk: 'The OpenRouter brain needs an API key — set it in Settings > Integrations > OpenRouter.' };
        yield { type: 'turn_end' };
        return;
    }
    const model = settings.openrouterModel || 'openrouter/auto';
    const attachments = latestAttachments(messages);
    const convo: any[] = [
        { role: 'system', content: buildSystemIdentity(settings) },
        ...messages.filter(m => m.role !== 'system').map(m => {
            const images = (m.attachments || []).filter(a => a.mimeType.startsWith('image/'));
            if (!images.length) return { role: m.role, content: m.content };
            return {
                role: m.role,
                content: [
                    { type: 'text', text: m.content || ' ' },
                    ...images.map(a => ({ type: 'image_url', image_url: { url: a.data } })),
                ],
            };
        }),
    ];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${settings.openrouterApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, messages: convo, stream: true, tools: ollamaToolDeclarations() }),
        });
        if (!res.ok || !res.body) throw new Error(`OpenRouter chat failed (${res.status}): ${await res.text().catch(() => res.statusText)}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let content = '';
        // tool_call deltas arrive keyed by index; arguments stream as string fragments
        const calls: { id?: string; name: string; argsRaw: string }[] = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop() || '';
            for (const line of lines) {
                const data = line.replace(/^data:\s*/, '').trim();
                if (!data || data === '[DONE]' || !line.startsWith('data:')) continue;
                let json: any;
                try { json = JSON.parse(data); } catch { continue; }
                const delta = json.choices?.[0]?.delta;
                if (!delta) continue;
                if (delta.content) {
                    content += delta.content;
                    yield { type: 'text', chunk: delta.content };
                }
                for (const tc of delta.tool_calls || []) {
                    const i = tc.index ?? 0;
                    if (!calls[i]) calls[i] = { id: tc.id, name: '', argsRaw: '' };
                    if (tc.id) calls[i].id = tc.id;
                    if (tc.function?.name) calls[i].name += tc.function.name;
                    if (tc.function?.arguments) calls[i].argsRaw += tc.function.arguments;
                }
            }
        }
        yield { type: 'turn_end' };
        const validCalls = calls.filter(c => c && c.name);
        if (validCalls.length === 0) return;

        convo.push({
            role: 'assistant',
            content: content || null,
            tool_calls: validCalls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.argsRaw || '{}' } })),
        });
        for (const c of validCalls) {
            let args: Record<string, any> = {};
            try { args = JSON.parse(c.argsRaw || '{}'); } catch { /* keep {} */ }
            yield { type: 'tool_start', name: c.name, args };
            const result = await executeAssistantTool(c.name, args, { settings, attachments });
            yield { type: 'tool_result', name: c.name, result };
            convo.push({ role: 'tool', tool_call_id: c.id, content: result });
        }
    }
    yield { type: 'text', chunk: '\n[Assistant]: tool-call limit reached for this turn.' };
    yield { type: 'turn_end' };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm run lint` — expected: no errors.

- [ ] **Step 3: Manual verification**

With an OpenRouter key and `openrouterModel` set to a tool-capable model (e.g. `openai/gpt-4o-mini`), brain = OpenRouter: ask "search my prompt library for portrait" → expect `⚙️ search_prompts` + a result summary.

- [ ] **Step 4: Commit**

```bash
git add services/assistantService.ts
git commit -m "feat: native OpenRouter tool-calling turn (GPT models via OpenRouter)"
```

---

### Task 5: Brain selector UI in Settings + chat panel brain label

**Files:**
- Modify: `components/settings/IntegrationsSection.tsx` (inside `renderAssistant`, before the "Assistant Name" row)
- Modify: `components/LLMChatPanel.tsx` (`getChatSubtitle`, lines 476–481)

**Interfaces:**
- Consumes: `settings.assistantProvider` + `handleSettingsChange` (existing prop); `ProviderTab`/`SettingRow` primitives.

- [ ] **Step 1: Add the Assistant Brain row**

In `components/settings/IntegrationsSection.tsx`, inside `renderAssistant()`'s `<SettingsGroup title="Assistant Persona">`, insert as the FIRST row:

```tsx
                <SettingRow label="Assistant Brain" desc="Which engine the chat assistant reasons and calls tools on. Uses that provider's endpoint/model from the AI Engine tab. GPT (ChatGPT) models are available via OpenRouter. Live voice conversations always run on Gemini Live with the voice below.">
                    <div className="tab-group">
                        <ProviderTab label="Gemini" isActive={(settings.assistantProvider || 'gemini') === 'gemini'} onClick={() => handleSettingsChange('assistantProvider', 'gemini')} />
                        <ProviderTab label="Anthropic" isActive={settings.assistantProvider === 'anthropic'} onClick={() => handleSettingsChange('assistantProvider', 'anthropic')} />
                        <ProviderTab label="Ollama" isActive={settings.assistantProvider === 'ollama'} onClick={() => handleSettingsChange('assistantProvider', 'ollama')} />
                        <ProviderTab label="Cloud Ollama" isActive={settings.assistantProvider === 'ollama_cloud'} onClick={() => handleSettingsChange('assistantProvider', 'ollama_cloud')} />
                        <ProviderTab label="OpenRouter" isActive={settings.assistantProvider === 'openrouter'} onClick={() => handleSettingsChange('assistantProvider', 'openrouter')} />
                        <ProviderTab label="Llama.cpp" isActive={settings.assistantProvider === 'llamacpp'} onClick={() => handleSettingsChange('assistantProvider', 'llamacpp')} />
                    </div>
                </SettingRow>
```

- [ ] **Step 2: Show the brain in the chat panel subtitle**

In `components/LLMChatPanel.tsx`, replace `getChatSubtitle` (currently keyed off `settings.activeLLM`, which is the wrong signal for the assistant) with:

```tsx
    const getChatSubtitle = () => {
        const brain = settings.assistantProvider || 'gemini';
        if (brain === 'ollama') return `ollama · ${settings.ollamaModel || 'model?'}`;
        if (brain === 'ollama_cloud') return `ollama cloud · ${settings.ollamaCloudModel || 'model?'}`;
        if (brain === 'openrouter') return `openrouter · ${settings.openrouterModel || 'auto'}`;
        if (brain === 'anthropic') return `anthropic · ${settings.anthropicModel || 'claude'}`;
        if (brain === 'llamacpp') return `llama.cpp · ${settings.llamacppModel || 'default'}`;
        return `gemini · ${settings.llmModel || 'gemini-2.5-flash'}`;
    };
```

- [ ] **Step 3: Verify**

Run: `pnpm run lint` — no errors. `pnpm dev` → Settings > Integrations > Assistant shows the brain tabs; switching persists across reload; chat panel subtitle reflects the choice.

- [ ] **Step 4: Commit**

```bash
git add components/settings/IntegrationsSection.tsx components/LLMChatPanel.tsx
git commit -m "feat: assistant brain selector in settings and chat panel label"
```

---

### Task 6: `web_search` and `fetch_url` tools

Web search runs as a one-shot Gemini call with `googleSearch` grounding (uses the existing Gemini key; works no matter which brain is active — no new dependency, no scraping service). `fetch_url` reads a page through the existing `/proxy-remote` express route (avoids browser CORS).

**Files:**
- Modify: `services/geminiService.ts` (append one function)
- Modify: `services/assistantTools.ts` (two new tool entries)
- Modify: `services/assistantService.ts` (`WORKSPACE_CAPABILITIES` sync)

**Interfaces:**
- Consumes: `getGeminiClient(settings)` (geminiService.ts:7); `/proxy-remote` proxy contract from `server.ts` — header `x-target-url` = origin, request sub-path appended to it.
- Produces: `googleSearchGemini(query: string, settings: LLMSettings): Promise<string>` exported from geminiService.

- [ ] **Step 1: Add the grounded search call to geminiService.ts**

Append:

```ts
/** One-shot web search via Gemini googleSearch grounding. Kept separate from
 * the assistant's function-calling session because Gemini rejects requests
 * mixing googleSearch with functionDeclarations. Returns JSON {answer, sources}. */
export const googleSearchGemini = async (query: string, settings: LLMSettings): Promise<string> => {
    const ai = getGeminiClient(settings);
    const response = await ai.models.generateContent({
        model: settings.llmModel || 'gemini-2.5-flash',
        contents: `Answer using current web results, concisely with concrete facts: ${query}`,
        config: { tools: [{ googleSearch: {} }] },
    });
    const chunks = (response.candidates?.[0] as any)?.groundingMetadata?.groundingChunks || [];
    const sources = chunks
        .map((c: any) => c.web?.uri ? `${c.web.title || 'source'} — ${c.web.uri}` : null)
        .filter(Boolean)
        .slice(0, 8);
    return JSON.stringify({ answer: response.text, sources });
};
```

- [ ] **Step 2: Add both tools to ASSISTANT_TOOLS**

In `services/assistantTools.ts`, append to the `ASSISTANT_TOOLS` array:

```ts
    {
        name: 'web_search',
        description: 'Search the web (Google) for current, real-world information. Returns an answer summary plus source URLs as JSON. Runs on Gemini grounding regardless of the assistant brain, so it needs a Gemini API key. Offer open_web_page when the user wants to SEE a result page.',
        parameters: {
            type: 'object',
            properties: { query: { type: 'string', description: 'What to search for.' } },
            required: ['query'],
        },
        execute: async ({ query }, ctx) => {
            if (!(ctx.settings.geminiApiKey || process.env.GEMINI_API_KEY)) {
                return 'Error: web search needs a Gemini API key (Settings > Integrations > Gemini) — it runs on Google Search grounding.';
            }
            const { googleSearchGemini } = await import('./geminiService');
            return googleSearchGemini(String(query), ctx.settings);
        },
    },
    {
        name: 'fetch_url',
        description: 'Fetch a web page by absolute URL and return its readable text (HTML stripped, truncated to ~8000 chars) for YOUR OWN reading. To show the page to the user, use open_web_page instead.',
        parameters: {
            type: 'object',
            properties: { url: { type: 'string', description: 'Absolute http(s) URL.' } },
            required: ['url'],
        },
        execute: async ({ url }) => {
            let parsed: URL;
            try { parsed = new URL(String(url)); } catch { return 'Error: invalid URL.'; }
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'Error: only http(s) URLs are supported.';
            // /proxy-remote appends the request sub-path to the x-target-url header value.
            const res = await fetch(`/proxy-remote${parsed.pathname}${parsed.search}`, {
                headers: { 'x-target-url': parsed.origin },
            });
            if (!res.ok) return `Error: fetch failed (${res.status} ${res.statusText}).`;
            const raw = await res.text();
            const doc = new DOMParser().parseFromString(raw, 'text/html');
            doc.querySelectorAll('script, style, noscript, svg').forEach(el => el.remove());
            const text = (doc.body?.textContent || raw).replace(/\s{3,}/g, '\n').trim();
            return text.slice(0, 8000) || 'Error: page contained no readable text.';
        },
    },
```

- [ ] **Step 3: Sync WORKSPACE_CAPABILITIES**

In `services/assistantService.ts`, extend the `Elsewhere:` line of `WORKSPACE_CAPABILITIES` with:

```
search the live web = web_search, read a web page yourself = fetch_url,
```

- [ ] **Step 4: Verify**

Run: `pnpm run lint` — no errors. `pnpm dev`, ask the assistant "search the web for the current stable Blender version and cite the source" → expect a `⚙️ web_search` round and an answer with a URL. Then "read that page" → `⚙️ fetch_url`.

- [ ] **Step 5: Commit**

```bash
git add services/geminiService.ts services/assistantTools.ts services/assistantService.ts
git commit -m "feat: assistant web_search (Gemini grounding) and fetch_url tools"
```

---

### Task 7: In-app web viewer panel + `open_web_page` tool

A sliding panel that displays a web page when the user (or the assistant on their behalf) wants to SEE it. Because many sites forbid embedding via `X-Frame-Options`/CSP `frame-ancestors`, the panel probes the page once through `/proxy-remote` — which mirrors the target's response headers to our origin, so those headers ARE readable client-side — and deterministically picks **live iframe** (embeddable) or **reader mode** (extracted text) with a manual LIVE/READER toggle and an Open-in-Browser button.

**Files:**
- Create: `components/WebViewerPanel.tsx`
- Modify: `components/icons.tsx` (add `GlobeIcon`)
- Modify: `services/assistantTools.ts` (`open_web_page` tool)
- Modify: `services/assistantService.ts` (`WORKSPACE_CAPABILITIES` sync)
- Modify: `components/App.tsx` (mount)

**Interfaces:**
- Produces/consumes event `appEventBus 'openWebPage'` with payload `{ url: string }`. `WebViewerPanel` is self-contained (no props) and portal-rendered like `LLMChatPanel`.

- [ ] **Step 1: Add GlobeIcon to components/icons.tsx**

```tsx
export const GlobeIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0a8.949 8.949 0 0 0 4.951-1.488A3.987 3.987 0 0 0 13 16.5h-2a3.987 3.987 0 0 0-3.951 3.012A8.949 8.949 0 0 0 12 21Zm9-9h-3.375m-11.25 0H3m9-9v3.375M12 21v-3.375m6.364-11.989-2.386 2.386M7.99 16.01l-2.386 2.386m0-12.772L7.99 7.99m8.02 8.02 2.386 2.386" />
    </svg>
);
```

- [ ] **Step 2: Create components/WebViewerPanel.tsx**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { appEventBus } from '../utils/eventBus';
import { audioService } from '../services/audioService';
import { CloseIcon, GlobeIcon } from './icons';

type Mode = 'loading' | 'live' | 'reader';

/** One proxied request answers both questions: can the page be iframed
 * (X-Frame-Options / CSP frame-ancestors — readable here because
 * /proxy-remote mirrors the target's response headers to our origin), and
 * what is its readable text for reader mode. */
const probePage = async (url: string): Promise<{ embeddable: boolean; title: string; text: string }> => {
    const parsed = new URL(url);
    const res = await fetch(`/proxy-remote${parsed.pathname}${parsed.search}`, { headers: { 'x-target-url': parsed.origin } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const xfo = (res.headers.get('x-frame-options') || '').toLowerCase();
    const csp = (res.headers.get('content-security-policy') || '').toLowerCase();
    const embeddable = !xfo && !csp.includes('frame-ancestors');
    const raw = await res.text();
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    doc.querySelectorAll('script, style, noscript, svg, iframe').forEach(el => el.remove());
    return {
        embeddable,
        title: doc.title || url,
        text: (doc.body?.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(),
    };
};

/** Sliding web viewer summoned via the 'openWebPage' bus event (assistant
 * open_web_page tool). Live iframe when the site allows embedding, reader
 * mode otherwise, with a manual toggle and open-in-browser escape hatch. */
const WebViewerPanel: React.FC = () => {
    const [url, setUrl] = useState<string | null>(null);
    const [mode, setMode] = useState<Mode>('loading');
    const [embeddable, setEmbeddable] = useState(false);
    const [title, setTitle] = useState('');
    const [text, setText] = useState('');
    const [probeError, setProbeError] = useState('');

    useEffect(() => appEventBus.on('openWebPage', (p: { url: string }) => {
        audioService.playPanelSlideIn();
        setUrl(p.url);
        setMode('loading');
        setEmbeddable(false);
        setTitle(p.url);
        setText('');
        setProbeError('');
        probePage(p.url)
            .then(r => {
                setTitle(r.title);
                setText(r.text);
                setEmbeddable(r.embeddable);
                setMode(r.embeddable ? 'live' : 'reader');
            })
            .catch(e => {
                // Probe failed (network/proxy) — fall back to trying the live
                // embed anyway; the browser may succeed where the proxy could not.
                setProbeError(e?.message || 'fetch failed');
                setEmbeddable(true);
                setMode('live');
            });
    }), []);

    const close = useCallback(() => {
        audioService.playPanelSlideOut();
        setUrl(null);
    }, []);

    const content = (
        <AnimatePresence>
            {url && (
                <>
                    <div className="fixed inset-0 bg-transparent z-[180] pointer-events-auto" onClick={close} />
                    <motion.div
                        initial={{ x: '100%', opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: '100%', opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        className="fixed top-[84px] right-[42px] bottom-[81px] w-full md:w-[720px] bg-transparent z-[190] pointer-events-auto shadow-2xl"
                    >
                        <div className="w-full h-full relative corner-frame overflow-visible flex flex-col">
                            <div className="bg-base-100/95 backdrop-blur-3xl rounded-none w-[calc(100%-6px)] h-[calc(100%-6px)] m-[3px] flex flex-col overflow-hidden relative z-10 border border-white/5">
                                {/* Header */}
                                <div className="flex justify-between items-center h-16 px-4 bg-base-100/40 flex-shrink-0 border-b border-base-300/20 relative gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <GlobeIcon className="w-5 h-5 text-primary flex-shrink-0" />
                                        <div className="min-w-0">
                                            <h3 className="text-xs font-black uppercase tracking-[0.2em] font-logo truncate">{title}</h3>
                                            <p className="text-[9px] font-mono text-base-content/40 truncate">{url}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <div className="tab-group flex">
                                            <button
                                                onClick={() => { audioService.playClick(); setMode('live'); }}
                                                disabled={!embeddable}
                                                title={embeddable ? 'Live page' : 'This site refuses to be embedded'}
                                                className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest border border-base-300/30 ${mode === 'live' ? 'bg-primary/20 text-primary' : 'opacity-50 hover:opacity-100'} disabled:opacity-20 disabled:pointer-events-none`}
                                            >
                                                Live
                                            </button>
                                            <button
                                                onClick={() => { audioService.playClick(); setMode('reader'); }}
                                                disabled={!text}
                                                className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest border border-base-300/30 border-l-0 ${mode === 'reader' ? 'bg-primary/20 text-primary' : 'opacity-50 hover:opacity-100'} disabled:opacity-20 disabled:pointer-events-none`}
                                            >
                                                Reader
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => { audioService.playClick(); window.open(url, '_blank', 'noopener'); }}
                                            className="px-3 py-1 text-[9px] font-black uppercase tracking-widest border border-base-300/30 opacity-50 hover:opacity-100"
                                        >
                                            Open ↗
                                        </button>
                                        <button onClick={close} className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 opacity-40 hover:opacity-100" aria-label="Close web viewer">
                                            <CloseIcon className="w-5 h-5" />
                                        </button>
                                    </div>
                                    <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
                                </div>

                                {/* Body */}
                                <div className="flex-grow overflow-hidden relative">
                                    {mode === 'loading' && (
                                        <div className="h-full flex items-center justify-center text-[10px] font-black uppercase tracking-[0.3em] opacity-40 animate-pulse">Probing page…</div>
                                    )}
                                    {mode === 'live' && (
                                        <div className="w-full h-full flex flex-col">
                                            {probeError && (
                                                <p className="text-[9px] font-mono text-warning/70 px-3 py-1 bg-warning/5 border-b border-warning/10">Reader probe failed ({probeError}) — showing live embed only.</p>
                                            )}
                                            <iframe
                                                src={url}
                                                title="Web viewer"
                                                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                                                className="w-full flex-grow bg-white"
                                            />
                                        </div>
                                    )}
                                    {mode === 'reader' && (
                                        <div className="h-full overflow-y-auto custom-scrollbar p-6">
                                            {!embeddable && (
                                                <p className="text-[9px] font-black uppercase tracking-widest text-warning/70 mb-4">This site refuses embedding — showing reader mode.</p>
                                            )}
                                            <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap text-[14px] leading-relaxed">{text}</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/20 z-20 pointer-events-none" />
                            <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/20 z-20 pointer-events-none" />
                            <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/20 z-20 pointer-events-none" />
                            <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/20 z-20 pointer-events-none" />
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );

    return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
};

export default WebViewerPanel;
```

- [ ] **Step 3: Add the open_web_page tool**

In `services/assistantTools.ts`, append:

```ts
    {
        name: 'open_web_page',
        description: 'Open a URL in the in-app web viewer panel so the USER can see the page (live embed when the site allows it, reader mode otherwise). Use when the user asks to show/open/display a web page or a web_search source.',
        parameters: {
            type: 'object',
            properties: { url: { type: 'string', description: 'Absolute http(s) URL to display.' } },
            required: ['url'],
        },
        execute: ({ url }) => {
            try { new URL(String(url)); } catch { return 'Error: invalid URL.'; }
            appEventBus.emit('openWebPage', { url: String(url) });
            return `Opened ${url} in the web viewer panel.`;
        },
    },
```

Sync `WORKSPACE_CAPABILITIES` in `services/assistantService.ts`: add `show a web page to the user in the in-app viewer = open_web_page,` to the `Elsewhere:` line.

- [ ] **Step 4: Mount in App.tsx**

`import WebViewerPanel from './WebViewerPanel';` and render `<WebViewerPanel />` next to `<LLMChatPanel ... />` (it is portal-based and self-contained).

- [ ] **Step 5: Verify and commit**

Run: `pnpm run lint`. `pnpm dev`: ask the assistant "open example.com for me" → panel slides in with the live page (example.com allows embedding). Ask it to open `https://github.com` → panel lands in reader mode with the blocked-embedding notice; Open ↗ launches the browser tab.

```bash
git add components/WebViewerPanel.tsx components/icons.tsx services/assistantTools.ts services/assistantService.ts components/App.tsx
git commit -m "feat: in-app web viewer panel with live/reader modes and open_web_page tool"
```

---

### Task 8: `save_file` tool (writes into the vault, surfaces in the Files tab)

**Files:**
- Modify: `services/assistantTools.ts`
- Modify: `services/assistantService.ts` (`WORKSPACE_CAPABILITIES` sync)

**Interfaces:**
- Consumes: `fileSystemManager.saveFile(filePath: string, content: Blob): Promise<string>` and `fileSystemManager.isDirectorySelected()` from `utils/fileUtils.ts` (both existing; `saveFile`'s `resolvePath(..., createIfMissing=true)` creates intermediate folders — confirm during this task's manual check by saving to a fresh `assistant/` path).
- Produces: event `appEventBus 'assistantFilesChanged'` (no payload) — Task 10's Files tab refreshes on it.

- [ ] **Step 1: Add the tool**

Append to `ASSISTANT_TOOLS`:

```ts
    {
        name: 'save_file',
        description: "Save a text file (markdown, plain text, JSON, code) into the user's vault under the 'assistant' folder. The file appears in the Notes panel's FILES tab, where the user can download it to their PC. Use when the user asks to save, export, or write something to a file.",
        parameters: {
            type: 'object',
            properties: {
                filename: { type: 'string', description: "File name with extension, e.g. 'moodboard-ideas.md'. No folders or path separators." },
                content: { type: 'string', description: 'Full text content of the file.' },
            },
            required: ['filename', 'content'],
        },
        execute: async ({ filename, content }) => {
            const { fileSystemManager } = await import('../utils/fileUtils');
            if (!fileSystemManager.isDirectorySelected()) {
                return 'Error: no vault folder is connected — the user must connect one via the app setup (Welcome screen or Settings).';
            }
            const safe = String(filename).replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+/, '').trim();
            if (!safe) return 'Error: invalid filename.';
            await fileSystemManager.saveFile(`assistant/${safe}`, new Blob([String(content)], { type: 'text/plain' }));
            appEventBus.emit('assistantFilesChanged');
            return `Saved to assistant/${safe} in the vault — visible in the Notes panel's FILES tab, downloadable from there.`;
        },
    },
```

(Dynamic import keeps `assistantTools.ts` loadable in non-browser test contexts; it matches the `llmService` dynamic-import idiom already used in this repo. `appEventBus` is already statically imported in this file.)

- [ ] **Step 2: Sync WORKSPACE_CAPABILITIES**

Extend the `Elsewhere:` line: `save a text/markdown file into the vault (shows in Notes panel > Files) = save_file,`

- [ ] **Step 3: Verify**

Run: `pnpm run lint`. `pnpm dev`, ask: "save a file called test.md with a haiku about neon cities" → expect `✅ save_file` and the file appearing at `<vault>/assistant/test.md` on disk.

- [ ] **Step 4: Commit**

```bash
git add services/assistantTools.ts services/assistantService.ts
git commit -m "feat: assistant save_file tool writing into the vault"
```

---

### Task 9: Notes storage + assistant note tools

**Files:**
- Create: `utils/notesStorage.ts`
- Create: `utils/notesStorage.test.ts`
- Modify: `services/assistantTools.ts` (four tool entries)
- Modify: `services/assistantService.ts` (`WORKSPACE_CAPABILITIES` sync)

**Interfaces:**
- Produces (consumed by Task 10's panel):

```ts
export interface AssistantNote { id: string; title: string; content: string; createdAt: number; updatedAt: number; source: 'assistant' | 'user'; }
export const loadNotes = (): AssistantNote[]
export const addNote = (title: string, content: string, source?: 'assistant' | 'user'): AssistantNote
export const updateNote = (id: string, patch: Partial<Pick<AssistantNote, 'title' | 'content'>>): AssistantNote | null
export const deleteNote = (id: string): boolean
export const clearNotes = (): void
// every mutation emits appEventBus 'notesChanged' with the fresh list
```

- [ ] **Step 1: Write the failing test**

Create `utils/notesStorage.test.ts` (vitest runs in node — stub `localStorage`):

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { loadNotes, addNote, updateNote, deleteNote, clearNotes } from './notesStorage';

beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
    };
});

describe('notesStorage', () => {
    it('adds a note with derived title and lists newest first', () => {
        addNote('', 'remember the neon palette');
        const second = addNote('Palette', 'cyan + magenta');
        const notes = loadNotes();
        expect(notes).toHaveLength(2);
        expect(notes[0].id).toBe(second.id);
        expect(notes[1].title).toBe('remember the neon palette');
    });
    it('updates title/content and persists', () => {
        const n = addNote('a', 'b');
        const updated = updateNote(n.id, { content: 'c' });
        expect(updated?.content).toBe('c');
        expect(loadNotes()[0].content).toBe('c');
    });
    it('update of unknown id returns null', () => {
        expect(updateNote('nope', { title: 'x' })).toBeNull();
    });
    it('deletes and clears', () => {
        const n = addNote('a', 'b');
        expect(deleteNote(n.id)).toBe(true);
        expect(deleteNote(n.id)).toBe(false);
        addNote('a', 'b');
        clearNotes();
        expect(loadNotes()).toHaveLength(0);
    });
    it('survives corrupted storage', () => {
        (globalThis as any).localStorage.setItem('assistantNotes', '{broken');
        expect(loadNotes()).toEqual([]);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test` — expected: FAIL (module not found).

- [ ] **Step 3: Implement notesStorage.ts**

```ts
import { v4 as uuidv4 } from 'uuid';
import { appEventBus } from './eventBus';

export interface AssistantNote {
    id: string;
    title: string;
    content: string;
    createdAt: number;
    updatedAt: number;
    source: 'assistant' | 'user';
}

const KEY = 'assistantNotes';

export const loadNotes = (): AssistantNote[] => {
    try {
        const raw = localStorage.getItem(KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const persist = (notes: AssistantNote[]): void => {
    localStorage.setItem(KEY, JSON.stringify(notes));
    appEventBus.emit('notesChanged', notes);
};

export const addNote = (title: string, content: string, source: 'assistant' | 'user' = 'assistant'): AssistantNote => {
    const now = Date.now();
    const note: AssistantNote = {
        id: uuidv4(),
        title: title.trim() || content.trim().slice(0, 40) || 'Untitled note',
        content,
        createdAt: now,
        updatedAt: now,
        source,
    };
    persist([note, ...loadNotes()]);
    return note;
};

export const updateNote = (id: string, patch: Partial<Pick<AssistantNote, 'title' | 'content'>>): AssistantNote | null => {
    const notes = loadNotes();
    const idx = notes.findIndex(n => n.id === id);
    if (idx === -1) return null;
    notes[idx] = { ...notes[idx], ...patch, updatedAt: Date.now() };
    persist(notes);
    return notes[idx];
};

export const deleteNote = (id: string): boolean => {
    const notes = loadNotes();
    const next = notes.filter(n => n.id !== id);
    if (next.length === notes.length) return false;
    persist(next);
    return true;
};

export const clearNotes = (): void => persist([]);
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test` — expected: PASS.

- [ ] **Step 5: Add the four note tools**

In `services/assistantTools.ts`, add a static import `import { addNote, loadNotes, updateNote, deleteNote } from '../utils/notesStorage';` and append to `ASSISTANT_TOOLS`:

```ts
    {
        name: 'save_note',
        description: "Save a note to your Notes panel (note icon in the header) so the user can revisit, edit, copy, or download it later. Use for reminders, research findings, summaries, or anything the user asks you to note down.",
        parameters: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Short title. Defaults to the first words of the content.' },
                content: { type: 'string', description: 'The note body (markdown allowed).' },
            },
            required: ['content'],
        },
        execute: ({ title, content }) => {
            const n = addNote(title ? String(title) : '', String(content), 'assistant');
            return `Saved note "${n.title}" (id ${n.id}).`;
        },
    },
    {
        name: 'list_notes',
        description: 'List the notes in your Notes panel (optionally filtered). Returns JSON with ids — needed before update_note/delete_note.',
        parameters: {
            type: 'object',
            properties: { query: { type: 'string', description: 'Optional filter text matched against title and content.' } },
        },
        execute: ({ query }) => {
            const q = query ? String(query).toLowerCase() : undefined;
            const notes = loadNotes().filter(n => !q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
            return JSON.stringify(notes.slice(0, 30).map(n => ({ id: n.id, title: n.title, content: n.content, updatedAt: n.updatedAt })));
        },
    },
    {
        name: 'update_note',
        description: 'Revise an existing note (get its id from list_notes first). Provide title and/or content.',
        parameters: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Note id.' },
                title: { type: 'string', description: 'New title (optional).' },
                content: { type: 'string', description: 'New body (optional).' },
            },
            required: ['id'],
        },
        execute: ({ id, title, content }) => {
            const patch: { title?: string; content?: string } = {};
            if (title !== undefined) patch.title = String(title);
            if (content !== undefined) patch.content = String(content);
            const n = updateNote(String(id), patch);
            return n ? `Updated note "${n.title}".` : `Error: no note with id ${id}.`;
        },
    },
    {
        name: 'delete_note',
        description: 'Delete a note by id (get ids from list_notes first).',
        parameters: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Note id.' } },
            required: ['id'],
        },
        execute: ({ id }) => (deleteNote(String(id)) ? 'Note deleted.' : `Error: no note with id ${id}.`),
    },
```

- [ ] **Step 6: Sync WORKSPACE_CAPABILITIES**

Extend the `Elsewhere:` line: `manage your Notes panel = save_note/list_notes/update_note/delete_note,`

- [ ] **Step 7: Verify and commit**

Run: `pnpm test && pnpm run lint` — both green.

```bash
git add utils/notesStorage.ts utils/notesStorage.test.ts services/assistantTools.ts services/assistantService.ts
git commit -m "feat: assistant notes storage and note tools"
```

---

### Task 10: Notes & Files panel UI + header button

Clipboard-panel sibling with two tabs: **NOTES** (revise/copy/delete/download each note) and **FILES** (lists the vault `assistant/` folder — everything `save_file` wrote — with download-to-PC and delete). Self-contained: it owns its data via `notesStorage` + the `notesChanged`/`assistantFilesChanged` events; App.tsx only holds the open/closed flag.

**Files:**
- Create: `components/NotesPanel.tsx`
- Modify: `components/icons.tsx` (add `NoteIcon`)
- Modify: `components/Header.tsx` (new button + prop)
- Modify: `components/App.tsx` (state + render)

**Interfaces:**
- Consumes: Task 9's `notesStorage` API; `appEventBus 'notesChanged'` / `'assistantFilesChanged'`; `fileSystemManager.listDirectoryContents(path)` (async generator of `FileSystemHandle`), `getFileAsBlob`, `deleteFile`, `isDirectorySelected` from `utils/fileUtils.ts`.
- Produces: `NotesPanel: React.FC<{ isOpen: boolean; onClose: () => void }>` (default export); `NoteIcon` in icons.tsx; Header gains optional prop `onToggleNotesPanel?: () => void` (placed after the Task 1-renamed `onToggleChatPanel`).

- [ ] **Step 1: Add NoteIcon to components/icons.tsx**

```tsx
export const NoteIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
);
```

- [ ] **Step 2: Create components/NotesPanel.tsx**

Modeled on `ClippingPanel` (same gsap slide-in, corner-frame chrome, click-outside close). Full file:

```tsx
import React, { useRef, useEffect, useState, useCallback, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import { loadNotes, addNote, updateNote, deleteNote, clearNotes, AssistantNote } from '../utils/notesStorage';
import { appEventBus } from '../utils/eventBus';
import { fileSystemManager } from '../utils/fileUtils';
import { CloseIcon, DeleteIcon, PlusIcon, CopyIcon, EditIcon, NoteIcon, ArchiveIcon } from './icons';
import { audioService } from '../services/audioService';

interface NotesPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

const downloadBlob = (blob: Blob, filename: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
};

const NoteItem: React.FC<{ note: AssistantNote; index: number }> = ({ note, index }) => {
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState(note.title);
    const [content, setContent] = useState(note.content);
    const [copied, setCopied] = useState(false);

    useEffect(() => { setTitle(note.title); setContent(note.content); }, [note.title, note.content]);

    const handleCopy = useCallback(() => {
        audioService.playClick();
        navigator.clipboard?.writeText(note.content).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(() => {});
    }, [note.content]);

    const handleDownload = useCallback(() => {
        audioService.playClick();
        const safe = note.title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'note';
        downloadBlob(new Blob([note.content], { type: 'text/markdown' }), `${safe}.md`);
    }, [note.title, note.content]);

    const handleSave = () => {
        updateNote(note.id, { title: title.trim() || note.title, content });
        setEditing(false);
    };

    return (
        <div className="flex flex-col group bg-transparent transition-all duration-700 hover:bg-primary/5 w-full overflow-hidden select-none border-b border-base-300/10 relative">
            <div className="flex flex-col w-full p-4 md:p-6">
                <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-3xl font-black text-base-content flex-shrink-0 font-mono leading-none tracking-tighter tabular-nums opacity-20">
                            {String(index + 1).padStart(2, '0')}
                        </span>
                        <div className="flex flex-col min-w-0 border-l border-base-300/30 pl-3">
                            <span className="text-[9px] font-black uppercase tracking-[0.4em] text-primary/60 mb-1 leading-none">
                                {note.source === 'assistant' ? 'Assistant' : 'Manual'} · {new Date(note.updatedAt).toLocaleDateString()}
                            </span>
                            {editing ? (
                                <input value={title} onChange={e => setTitle(e.target.value)} className="form-input h-7 text-sm w-full" />
                            ) : (
                                <h2 className="font-black text-sm text-base-content truncate uppercase tracking-tight font-logo leading-tight" title={note.title}>
                                    {note.title}
                                </h2>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={() => { audioService.playClick(); deleteNote(note.id); }}
                        className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 hover:text-error transition-colors btn-snake ml-4"
                        title="Delete note"
                    >
                        <span /><span /><span /><span />
                        <DeleteIcon className="w-4 h-4" />
                    </button>
                </div>

                {editing ? (
                    <textarea value={content} onChange={e => setContent(e.target.value)} className="form-textarea w-full min-h-[120px] text-sm mb-3" />
                ) : (
                    <p className="text-sm font-medium leading-relaxed text-base-content/70 whitespace-pre-wrap mb-3">{note.content}</p>
                )}

                <div className="flex justify-between items-center pt-3 border-t border-base-300/10 text-[10px] font-black">
                    <button onClick={handleCopy} className="uppercase tracking-widest hover:text-primary transition-all flex items-center gap-1.5 group/btn">
                        <CopyIcon className="w-3 h-3 opacity-40 group-hover/btn:opacity-100" />
                        {copied ? 'COPIED' : 'COPY'}
                    </button>
                    <button onClick={handleDownload} className="uppercase tracking-widest hover:text-primary transition-all flex items-center gap-1.5 group/btn">
                        <ArchiveIcon className="w-3 h-3 opacity-40 group-hover/btn:opacity-100" />
                        DOWNLOAD
                    </button>
                    {editing ? (
                        <div className="flex gap-4">
                            <button onClick={() => { audioService.playClick(); setEditing(false); setTitle(note.title); setContent(note.content); }} className="uppercase tracking-widest opacity-40 hover:opacity-100">Cancel</button>
                            <button onClick={() => { audioService.playClick(); handleSave(); }} className="uppercase tracking-widest text-primary">Save</button>
                        </div>
                    ) : (
                        <button onClick={() => { audioService.playClick(); setEditing(true); }} className="uppercase tracking-widest hover:text-primary transition-all flex items-center gap-1.5 group/btn">
                            <EditIcon className="w-3 h-3 opacity-40 group-hover/btn:opacity-100" />
                            REVISE
                        </button>
                    )}
                </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
    );
};

const NotesPanel: React.FC<NotesPanelProps> = ({ isOpen, onClose }) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const [tab, setTab] = useState<'notes' | 'files'>('notes');
    const [notes, setNotes] = useState<AssistantNote[]>(() => loadNotes());
    const [files, setFiles] = useState<string[]>([]);

    useEffect(() => appEventBus.on('notesChanged', (n: AssistantNote[]) => setNotes(n)), []);

    const refreshFiles = useCallback(async () => {
        if (!fileSystemManager.isDirectorySelected()) { setFiles([]); return; }
        try {
            const names: string[] = [];
            for await (const handle of fileSystemManager.listDirectoryContents('assistant')) {
                if (handle.kind === 'file') names.push(handle.name);
            }
            setFiles(names.sort());
        } catch {
            setFiles([]); // folder does not exist yet — nothing saved
        }
    }, []);

    useEffect(() => appEventBus.on('assistantFilesChanged', () => { void refreshFiles(); }), [refreshFiles]);
    useEffect(() => {
        if (isOpen) {
            setNotes(loadNotes());
            void refreshFiles();
        }
    }, [isOpen, refreshFiles]);

    useLayoutEffect(() => {
        if (!panelRef.current) return;
        gsap.killTweensOf(panelRef.current);
        if (isOpen) {
            audioService.playPanelSlideIn();
            gsap.to(panelRef.current, { x: 0, duration: 1.2, ease: 'elastic.out(1, 0.75)', visibility: 'visible', pointerEvents: 'auto', opacity: 1 });
        } else {
            audioService.playPanelSlideOut();
            gsap.to(panelRef.current, {
                x: '100%', duration: 0.8, ease: 'elastic.in(1, 0.75)', pointerEvents: 'none', opacity: 0,
                onComplete: () => { if (panelRef.current && !isOpen) panelRef.current.style.visibility = 'hidden'; },
            });
        }
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(event.target as Node)) onClose();
        };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose]);

    const handleDownloadFile = useCallback(async (name: string) => {
        audioService.playClick();
        const blob = await fileSystemManager.getFileAsBlob(`assistant/${name}`);
        if (blob) downloadBlob(blob, name);
    }, []);

    const handleDeleteFile = useCallback(async (name: string) => {
        audioService.playClick();
        await fileSystemManager.deleteFile(`assistant/${name}`);
        void refreshFiles();
    }, [refreshFiles]);

    return (
        <div
            ref={panelRef}
            className="absolute top-0 right-0 bottom-0 w-full md:w-[480px] bg-transparent z-[50] translate-x-full pointer-events-none"
            style={{ visibility: 'hidden' }}
            aria-hidden={!isOpen}
        >
            <div className="w-full h-full relative corner-frame overflow-visible flex flex-col pointer-events-auto">
                <div className="bg-base-100/60 backdrop-blur-3xl rounded-none w-[calc(100%-6px)] h-[calc(100%-6px)] m-[3px] flex flex-col overflow-hidden relative z-10">
                    <div className="flex justify-between items-center h-16 px-6 bg-base-100/20 flex-shrink-0 border-b border-base-300/10 relative">
                        <div className="flex items-center gap-3">
                            <NoteIcon className="w-5 h-5 text-primary" />
                            <div className="flex gap-0">
                                <button
                                    onClick={() => { audioService.playClick(); setTab('notes'); }}
                                    className={`px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] font-logo border border-base-300/30 ${tab === 'notes' ? 'bg-primary/20 text-primary' : 'opacity-50 hover:opacity-100'}`}
                                >
                                    Notes [{notes.length}]
                                </button>
                                <button
                                    onClick={() => { audioService.playClick(); setTab('files'); }}
                                    className={`px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] font-logo border border-base-300/30 border-l-0 ${tab === 'files' ? 'bg-primary/20 text-primary' : 'opacity-50 hover:opacity-100'}`}
                                >
                                    Files [{files.length}]
                                </button>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {tab === 'notes' && (
                                <button
                                    onClick={() => { audioService.playClick(); addNote('', 'New note — click REVISE to edit.', 'user'); }}
                                    className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 opacity-40 hover:opacity-100 hover:text-primary transition-all btn-snake"
                                    title="New note"
                                >
                                    <span /><span /><span /><span />
                                    <PlusIcon className="w-5 h-5" />
                                </button>
                            )}
                            {tab === 'notes' && notes.length > 0 && (
                                <button
                                    onClick={() => { audioService.playClick(); clearNotes(); }}
                                    className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 opacity-40 hover:opacity-100 hover:text-error transition-all btn-snake"
                                    title="Delete all notes"
                                >
                                    <span /><span /><span /><span />
                                    <DeleteIcon className="w-5 h-5" />
                                </button>
                            )}
                            <button onClick={() => { audioService.playClick(); onClose(); }} className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 opacity-40 hover:opacity-100 btn-snake" aria-label="Close notes panel">
                                <span /><span /><span /><span />
                                <CloseIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
                    </div>

                    <div className="flex-grow p-0 overflow-y-auto relative scrollbar-thin">
                        {tab === 'notes' && (notes.length > 0 ? (
                            <div className="flex flex-col divide-y divide-base-300/10">
                                {notes.map((note, index) => (
                                    <NoteItem key={note.id} note={note} index={index} />
                                ))}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center opacity-10 py-12">
                                <NoteIcon className="w-16 h-16 mb-6" />
                                <p className="text-xl font-black uppercase tracking-widest leading-none">No Notes Yet</p>
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] mt-4">Ask the assistant to take a note, or add one manually</p>
                            </div>
                        ))}
                        {tab === 'files' && (files.length > 0 ? (
                            <div className="flex flex-col divide-y divide-base-300/10">
                                {files.map((name, index) => (
                                    <div key={name} className="flex items-center justify-between p-4 md:px-6 group hover:bg-primary/5 transition-colors">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="text-2xl font-black font-mono leading-none tabular-nums opacity-20">{String(index + 1).padStart(2, '0')}</span>
                                            <span className="text-sm font-mono truncate" title={`assistant/${name}`}>{name}</span>
                                        </div>
                                        <div className="flex items-center gap-4 text-[10px] font-black flex-shrink-0 ml-4">
                                            <button onClick={() => { void handleDownloadFile(name); }} className="uppercase tracking-widest hover:text-primary transition-all flex items-center gap-1.5">
                                                <ArchiveIcon className="w-3 h-3 opacity-40" />
                                                DOWNLOAD
                                            </button>
                                            <button onClick={() => { void handleDeleteFile(name); }} className="uppercase tracking-widest hover:text-error transition-all flex items-center gap-1.5">
                                                <DeleteIcon className="w-3 h-3 opacity-40" />
                                                DELETE
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center opacity-10 py-12">
                                <ArchiveIcon className="w-16 h-16 mb-6" />
                                <p className="text-xl font-black uppercase tracking-widest leading-none">No Files Yet</p>
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] mt-4">Ask the assistant to save a file — it lands in the vault's assistant folder</p>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
            </div>
        </div>
    );
};

export default NotesPanel;
```

- [ ] **Step 3: Wire the header button**

In `components/Header.tsx`: add `onToggleNotesPanel?: () => void;` to the props interface (next to the renamed `onToggleChatPanel?`), destructure it, import `NoteIcon`, and add a `HUDNavItem` right after the Chat button:

```tsx
          <div className="w-px h-2 bg-base-content/10 self-center" />
          <HUDNavItem
            onClick={(e) => {
              e.stopPropagation();
              audioService.playClick();
              onToggleNotesPanel?.();
            }}
            title="Assistant Notes & Files"
          >
            <NoteIcon className="w-4 h-4" />
          </HUDNavItem>
```

- [ ] **Step 4: Wire App.tsx**

In `components/App.tsx`:
- `import NotesPanel from './NotesPanel';`
- Add state next to `isClippingPanelOpen`: `const [isNotesPanelOpen, setIsNotesPanelOpen] = useState(false);`
- Add callbacks next to the other inline-callback replacements: `const handleToggleNotesPanel = useCallback(() => setIsNotesPanelOpen(prev => !prev), []);` and `const handleCloseNotesPanel = useCallback(() => setIsNotesPanelOpen(false), []);`
- Pass `onToggleNotesPanel={handleToggleNotesPanel}` to `<Header ... />`.
- Render `<NotesPanel isOpen={isNotesPanelOpen} onClose={handleCloseNotesPanel} />` directly under the existing `<ClippingPanel ... />`.

- [ ] **Step 5: Verify and commit**

Run: `pnpm run lint` — no errors. `pnpm dev`: note icon opens the panel; + adds a note; REVISE edits inline and persists; DOWNLOAD saves the note as `.md` to the PC. Ask the assistant to `save_file` something → FILES tab shows it live; DOWNLOAD delivers it to the browser's download folder; DELETE removes it from the vault.

```bash
git add components/NotesPanel.tsx components/icons.tsx components/Header.tsx components/App.tsx
git commit -m "feat: assistant Notes & Files panel with PC download"
```

---

### Task 11: Movie-subtitle captions above the footer oscillator (voice + text chat)

The Live API already streams transcriptions — `LiveAssistantContext.onCaption` currently discards them (contexts/LiveAssistantContext.tsx:64). Re-emit them on the event bus and render a subtitle strip fixed just above the footer (the oscillator sits centered in the footer at `z-[705]`; the caption floats above it). The chat panel's streamed text replies feed the SAME strip, so subtitles work in both modes.

**Files:**
- Modify: `contexts/LiveAssistantContext.tsx` (one line)
- Modify: `components/LLMChatPanel.tsx` (emit caption + speaking events while streaming)
- Create: `components/LiveCaptionOverlay.tsx`
- Modify: `components/App.tsx` (mount the overlay)

**Interfaces:**
- Produces/consumes events: `'liveCaption'` `{ who: 'user' | 'assistant'; text: string }` (incremental chunks, voice AND chat); `'chatSpeaking'` `{ speaking: boolean }` (Task 13's avatar consumes this too); existing `'liveAssistantState'` clears captions on idle/error.

- [ ] **Step 1: Emit voice captions**

In `contexts/LiveAssistantContext.tsx`, replace line 64:

```ts
                onCaption: () => { /* transcripts are intentionally not displayed */ },
```

with:

```ts
                onCaption: (who, text) => appEventBus.emit('liveCaption', { who, text }),
```

- [ ] **Step 2: Emit chat captions + speaking flag**

In `components/LLMChatPanel.tsx` (`appEventBus` is already imported), inside `handleSubmit`'s streaming loop: in the `ev.type === 'text'` branch, after `fullResponse += ev.chunk;` add:

```ts
                    appEventBus.emit('liveCaption', { who: 'assistant', text: ev.chunk });
```

and make the surrounding block signal speaking state — before the `for await` loop add `appEventBus.emit('chatSpeaking', { speaking: true });`, and in the existing `finally` block (next to `setIsProcessing(false);`) add `appEventBus.emit('chatSpeaking', { speaking: false });`.

- [ ] **Step 3: Create the overlay component**

Create `components/LiveCaptionOverlay.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { appEventBus } from '../utils/eventBus';

const QUIET_MS = 4000;   // fade out after this much silence
const MAX_CHARS = 220;   // keep it subtitle-sized; older text scrolls off the front

/** Movie-subtitle strip floating just above the footer oscillator. Fed by
 * live-voice transcriptions AND streamed chat replies (both emit
 * 'liveCaption'); clears after a quiet period or when a voice session ends. */
const LiveCaptionOverlay: React.FC = () => {
    const [caption, setCaption] = useState<{ who: 'user' | 'assistant'; text: string } | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const offCaption = appEventBus.on('liveCaption', (p: { who: 'user' | 'assistant'; text: string }) => {
            setCaption(prev => ({
                who: p.who,
                text: prev && prev.who === p.who ? (prev.text + p.text).slice(-MAX_CHARS) : p.text,
            }));
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setCaption(null), QUIET_MS);
        });
        const offState = appEventBus.on('liveAssistantState', (s: { status: string }) => {
            if (s.status === 'idle' || s.status === 'error') setCaption(null);
        });
        return () => {
            offCaption();
            offState();
            if (timer.current) clearTimeout(timer.current);
        };
    }, []);

    return (
        <div className="fixed bottom-[88px] inset-x-0 z-[720] flex justify-center pointer-events-none px-8">
            <AnimatePresence>
                {caption && (
                    <motion.div
                        key="live-caption"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.25 }}
                        className="max-w-[70vw]"
                    >
                        <p className="text-center text-sm md:text-base font-medium text-base-content bg-base-100/70 backdrop-blur-md px-4 py-2 border border-base-content/10 leading-snug">
                            <span className="uppercase text-[9px] tracking-[0.3em] text-primary/70 block mb-1">
                                {caption.who === 'user' ? 'You' : 'Assistant'}
                            </span>
                            {caption.text}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default LiveCaptionOverlay;
```

- [ ] **Step 4: Mount it**

In `components/App.tsx`: `import LiveCaptionOverlay from './LiveCaptionOverlay';` and render `<LiveCaptionOverlay />` immediately after the `.app-footer` div's closing tag (inside the initialized branch).

- [ ] **Step 5: Verify and commit**

Run: `pnpm run lint`. `pnpm dev`: (a) voice — start a live session, speak: your words subtitle above the footer, then the assistant's reply; fades after ~4 s, vanishes on session end. (b) chat — send a text message: the streamed reply also subtitles above the footer.

```bash
git add contexts/LiveAssistantContext.tsx components/LLMChatPanel.tsx components/LiveCaptionOverlay.tsx components/App.tsx
git commit -m "feat: subtitle captions above the footer oscillator for voice and chat"
```

---

### Task 12: Redirect to the dashboard when the assistant activates

**Files:**
- Modify: `contexts/LiveAssistantContext.tsx` (voice activation)
- Modify: `components/App.tsx` (chat panel activation)

**Interfaces:**
- Consumes: existing `appEventBus 'navigate'` event (App.tsx already subscribes and switches tabs); Task 1's renamed `handleToggleChatPanel`.

- [ ] **Step 1: Voice activation**

In `contexts/LiveAssistantContext.tsx`, at the top of the `start` callback (before `setError('')`):

```ts
        // Assistant activation always brings the user home first — the avatar
        // and captions live on the dashboard/footer.
        appEventBus.emit('navigate', 'dashboard');
```

- [ ] **Step 2: Chat activation**

In `components/App.tsx`, replace `handleToggleChatPanel`:

```ts
    const handleToggleChatPanel = useCallback(() => setIsChatPanelOpen(prev => {
        if (!prev) appEventBus.emit('navigate', 'dashboard');
        return !prev;
    }), []);
```

- [ ] **Step 3: Verify and commit**

`pnpm run lint`; `pnpm dev`: from the Gallery tab, click the mic → app lands on Dashboard while connecting; same for the chat-bubble button. Closing either does NOT navigate.

```bash
git add contexts/LiveAssistantContext.tsx components/App.tsx
git commit -m "feat: redirect to dashboard on assistant activation"
```

---

### Task 13: 3D talking-head persona avatar (three.js) with configurable face texture

A floating three.js head on the Dashboard: sphere with an equirectangular face texture, idle float/sway, and a jaw flap driven by BOTH the live-voice `'liveAssistantState'` speaking flag and Task 11's `'chatSpeaking'` flag (the head "talks" during text replies too). The face texture is a user-supplied 1024×512 image stored in the vault at `assistant/avatar-face.png`; a downloadable template (with guides) is generated at runtime on a canvas — no bundled binary. A procedurally drawn default face is used when no texture exists.

`// ponytail: jaw-flap head, not a rigged viseme face — upgrade path is morph targets driven by output audio amplitude if this ever needs lip-sync.`

**Files:**
- Modify: `types.ts` (avatar toggle)
- Create: `components/AssistantAvatar.tsx`
- Modify: `components/Dashboard.tsx` (mount)
- Modify: `components/settings/IntegrationsSection.tsx` (toggle + texture upload + template download)

**Interfaces:**
- Consumes: `appEventBus 'liveAssistantState'` (`{ status, speaking }`, already emitted by LiveAssistantContext) and `'chatSpeaking'` (`{ speaking }`, Task 11); `fileSystemManager.saveFile` / `getFileAsBlob` / `isDirectorySelected`.
- Produces: `AssistantAvatar` (default export, no props); `drawFaceTemplate(guides: boolean): HTMLCanvasElement` and `AVATAR_TEXTURE_PATH` (named exports used by the settings section).

- [ ] **Step 1: Add the setting**

In `types.ts`, under `assistantProvider`:

```ts
  /** Show the 3D persona avatar on the dashboard. Undefined = enabled. */
  assistantAvatarEnabled?: boolean;
```

- [ ] **Step 2: Create components/AssistantAvatar.tsx**

```tsx
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { appEventBus } from '../utils/eventBus';
import { fileSystemManager } from '../utils/fileUtils';

export const AVATAR_TEXTURE_PATH = 'assistant/avatar-face.png';

/** Draws the avatar face texture. With guides=true it doubles as the
 * downloadable template users paint their own face onto: 1024x512
 * equirectangular, wrapped around the head sphere — features must sit inside
 * the marked front-face zone, eyes on the horizontal centerline. */
export const drawFaceTemplate = (guides: boolean): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#1a2430';
    ctx.fillRect(0, 0, 1024, 512);
    // eyes
    ctx.fillStyle = '#e8f4ff';
    ctx.beginPath(); ctx.ellipse(440, 240, 34, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(584, 240, 34, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a0e14';
    ctx.beginPath(); ctx.arc(440, 242, 11, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(584, 242, 11, 0, Math.PI * 2); ctx.fill();
    // mouth
    ctx.strokeStyle = '#e8f4ff';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(512, 330, 40, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    if (guides) {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= 1024; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke(); }
        for (let y = 0; y <= 512; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke(); }
        ctx.strokeStyle = '#7fd0ff';
        ctx.setLineDash([8, 6]);
        ctx.strokeRect(340, 120, 344, 300);
        ctx.setLineDash([]);
        ctx.fillStyle = '#7fd0ff';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('FRONT FACE ZONE — keep features inside', 512, 60);
        ctx.fillText('EYES', 512, 205);
        ctx.fillText('MOUTH', 512, 400);
        ctx.fillText('1024 x 512 — wraps around the head (equirectangular)', 512, 480);
    }
    return c;
};

/** Floating talking head. Jaw flaps while the assistant speaks (live voice)
 * or streams a chat reply; idles with a gentle float and sway otherwise.
 * Loads the user face texture from the vault if present, else uses the
 * procedural default face. */
const AssistantAvatar: React.FC = () => {
    const mountRef = useRef<HTMLDivElement>(null);
    const voiceSpeakingRef = useRef(false);
    const chatSpeakingRef = useRef(false);

    useEffect(() => appEventBus.on('liveAssistantState', (s: { status: string; speaking: boolean }) => {
        voiceSpeakingRef.current = !!s.speaking;
    }), []);
    useEffect(() => appEventBus.on('chatSpeaking', (s: { speaking: boolean }) => {
        chatSpeakingRef.current = !!s.speaking;
    }), []);

    useEffect(() => {
        const mount = mountRef.current;
        if (!mount) return;
        const SIZE = 220;
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(SIZE, SIZE);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        mount.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 10);
        camera.position.z = 3.2;
        scene.add(new THREE.AmbientLight(0xffffff, 0.9));
        const key = new THREE.DirectionalLight(0xffffff, 1.4);
        key.position.set(1, 1, 2);
        scene.add(key);

        const material = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(drawFaceTemplate(false)) });
        material.map!.colorSpace = THREE.SRGBColorSpace;
        const head = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 48), material);
        head.scale.set(0.85, 1, 0.9);
        scene.add(head);

        // jaw: dark ellipse parented to the head over the mouth zone, y-scaled by speech
        const jaw = new THREE.Mesh(
            new THREE.SphereGeometry(0.16, 24, 24),
            new THREE.MeshBasicMaterial({ color: 0x0a0508 })
        );
        jaw.position.set(0, -0.45, 0.92);
        jaw.scale.set(1.4, 0.12, 0.4);
        head.add(jaw);

        // swap in the user texture from the vault, if present
        let disposed = false;
        (async () => {
            try {
                if (!fileSystemManager.isDirectorySelected()) return;
                const blob = await fileSystemManager.getFileAsBlob(AVATAR_TEXTURE_PATH);
                if (!blob || disposed) return;
                const bmp = await createImageBitmap(blob);
                const tex = new THREE.CanvasTexture(bmp as unknown as HTMLCanvasElement);
                tex.colorSpace = THREE.SRGBColorSpace;
                material.map?.dispose();
                material.map = tex;
                material.needsUpdate = true;
            } catch { /* keep the default face */ }
        })();

        let raf = 0;
        const clock = new THREE.Clock();
        const animate = () => {
            raf = requestAnimationFrame(animate);
            const t = clock.getElapsedTime();
            head.position.y = Math.sin(t * 1.2) * 0.05;
            head.rotation.y = Math.sin(t * 0.6) * 0.25;
            head.rotation.x = Math.sin(t * 0.9) * 0.06;
            const talking = voiceSpeakingRef.current || chatSpeakingRef.current;
            const target = talking ? 0.06 + Math.abs(Math.sin(t * 14)) * 0.3 : 0.12;
            jaw.scale.y += (target - jaw.scale.y) * 0.3;
            renderer.render(scene, camera);
        };
        animate();

        return () => {
            disposed = true;
            cancelAnimationFrame(raf);
            head.geometry.dispose();
            jaw.geometry.dispose();
            material.map?.dispose();
            material.dispose();
            renderer.dispose();
            mount.removeChild(renderer.domElement);
        };
    }, []);

    return <div ref={mountRef} className="pointer-events-none" style={{ width: 220, height: 220 }} />;
};

export default AssistantAvatar;
```

- [ ] **Step 3: Mount on the Dashboard**

In `components/Dashboard.tsx`: `import AssistantAvatar from './AssistantAvatar';`. Inside the centered flex column (after the `<div className="w-12 h-px bg-base-content/10 mt-10"></div>` divider, line 73):

```tsx
                    {settings.assistantAvatarEnabled !== false && (
                        <div className="mt-6">
                            <AssistantAvatar />
                        </div>
                    )}
```

(`useSettings` is already imported/used in Dashboard.)

- [ ] **Step 4: Settings — toggle, texture upload, template download**

In `components/settings/IntegrationsSection.tsx`, add imports:

```tsx
import { fileSystemManager } from '../../utils/fileUtils';
import { drawFaceTemplate, AVATAR_TEXTURE_PATH } from '../AssistantAvatar';
```

and append a new group at the end of `renderAssistant()` (after the closing `</SettingsGroup>` of "Assistant Persona"):

```tsx
            <SettingsGroup title="3D Persona Avatar">
                <SettingRow label="Show Avatar" desc="Floating 3D talking head on the dashboard. Its jaw animates while the assistant speaks in live voice mode or streams a chat reply.">
                    <label className="label cursor-pointer justify-start gap-4 p-0">
                        <input
                            type="checkbox"
                            checked={settings.assistantAvatarEnabled !== false}
                            onChange={e => handleSettingsChange('assistantAvatarEnabled', e.target.checked)}
                            className="toggle toggle-primary toggle-xs"
                        />
                        <span className="text-[10px] font-black uppercase tracking-widest">Enabled</span>
                    </label>
                </SettingRow>
                <SettingRow label="Face Texture" desc="1024x512 image wrapped around the head. Download the template, paint or generate a face onto it (the Crafter can help), then upload it here. Stored in the vault at assistant/avatar-face.png.">
                    <div className="flex flex-col gap-3">
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    audioService.playClick();
                                    drawFaceTemplate(true).toBlob(blob => {
                                        if (!blob) return;
                                        const a = document.createElement('a');
                                        a.href = URL.createObjectURL(blob);
                                        a.download = 'avatar-face-template.png';
                                        a.click();
                                        URL.revokeObjectURL(a.href);
                                    }, 'image/png');
                                }}
                                className="form-btn px-4"
                            >
                                Download Template
                            </button>
                            <label className="form-btn form-btn-primary px-4 cursor-pointer">
                                Upload Face Texture
                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    className="hidden"
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        e.target.value = '';
                                        if (!file) return;
                                        if (!fileSystemManager.isDirectorySelected()) {
                                            alert('Connect a vault folder first — the texture is stored there.');
                                            return;
                                        }
                                        await fileSystemManager.saveFile(AVATAR_TEXTURE_PATH, file);
                                        audioService.playClick();
                                    }}
                                />
                            </label>
                        </div>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-base-content/30">The dashboard reloads the texture next time it mounts.</p>
                    </div>
                </SettingRow>
            </SettingsGroup>
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm run lint` — no errors. `pnpm dev`:
1. Dashboard shows the floating default head, gently bobbing/swaying.
2. Live voice: jaw flaps while the assistant speaks. Text chat: jaw flaps while a reply streams.
3. Settings → Download Template produces a labeled 1024×512 PNG; uploading a painted copy and revisiting the dashboard shows the new face.
4. Toggling Show Avatar off removes it.

```bash
git add types.ts components/AssistantAvatar.tsx components/Dashboard.tsx components/settings/IntegrationsSection.tsx
git commit -m "feat: three.js talking-head persona avatar with configurable face texture"
```

---

### Task 14: Persistent memory (cross-session, chat + voice)

A small memory store the assistant writes facts into; `buildSystemIdentity` injects them into the system prompt, so BOTH the chat brains and the Gemini Live voice session remember the user across sessions.

**Files:**
- Create: `utils/memoryStorage.ts`
- Create: `utils/memoryStorage.test.ts`
- Modify: `services/assistantTools.ts` (three tool entries)
- Modify: `services/assistantService.ts` (inject into `buildSystemIdentity` + `WORKSPACE_CAPABILITIES` sync)

**Interfaces:**
- Produces:

```ts
export interface MemoryEntry { id: string; fact: string; createdAt: number; }
export const loadMemories = (): MemoryEntry[]
export const addMemory = (fact: string): MemoryEntry | null   // null on duplicate/empty
export const deleteMemory = (id: string): boolean
export const memoryPromptBlock = (): string                    // '' when no memories
```

- [ ] **Step 1: Write the failing test**

Create `utils/memoryStorage.test.ts` (same localStorage stub pattern as Task 9):

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { loadMemories, addMemory, deleteMemory, memoryPromptBlock } from './memoryStorage';

beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
    };
});

describe('memoryStorage', () => {
    it('adds and lists memories', () => {
        addMemory('prefers 85mm portraits');
        expect(loadMemories()).toHaveLength(1);
    });
    it('rejects empty and exact duplicates', () => {
        expect(addMemory('  ')).toBeNull();
        addMemory('likes neon');
        expect(addMemory('likes neon')).toBeNull();
        expect(loadMemories()).toHaveLength(1);
    });
    it('caps at 50, dropping the oldest', () => {
        for (let i = 0; i < 55; i++) addMemory(`fact ${i}`);
        const facts = loadMemories().map(m => m.fact);
        expect(facts).toHaveLength(50);
        expect(facts).not.toContain('fact 0');
        expect(facts).toContain('fact 54');
    });
    it('deletes by id', () => {
        const m = addMemory('temp')!;
        expect(deleteMemory(m.id)).toBe(true);
        expect(deleteMemory(m.id)).toBe(false);
    });
    it('builds a prompt block, empty when no memories', () => {
        expect(memoryPromptBlock()).toBe('');
        addMemory('speaks German');
        expect(memoryPromptBlock()).toContain('speaks German');
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test` — expected: FAIL (module not found).

- [ ] **Step 3: Implement memoryStorage.ts**

```ts
import { v4 as uuidv4 } from 'uuid';

export interface MemoryEntry {
    id: string;
    fact: string;
    createdAt: number;
}

const KEY = 'assistantMemories';
const MAX = 50;

export const loadMemories = (): MemoryEntry[] => {
    try {
        if (typeof localStorage === 'undefined') return [];
        const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const persist = (memories: MemoryEntry[]): void => {
    localStorage.setItem(KEY, JSON.stringify(memories));
};

export const addMemory = (fact: string): MemoryEntry | null => {
    const trimmed = fact.trim();
    if (!trimmed) return null;
    const memories = loadMemories();
    if (memories.some(m => m.fact === trimmed)) return null;
    const entry: MemoryEntry = { id: uuidv4(), fact: trimmed, createdAt: Date.now() };
    persist([...memories, entry].slice(-MAX)); // oldest out
    return entry;
};

export const deleteMemory = (id: string): boolean => {
    const memories = loadMemories();
    const next = memories.filter(m => m.id !== id);
    if (next.length === memories.length) return false;
    persist(next);
    return true;
};

/** System-prompt block injected by buildSystemIdentity. Empty string when
 * there is nothing remembered, so it adds zero tokens by default. */
export const memoryPromptBlock = (): string => {
    const memories = loadMemories();
    if (!memories.length) return '';
    return `Persistent memories about the user from earlier sessions (use them, do not recite them unprompted):\n${memories.map(m => `- ${m.fact}`).join('\n')}`;
};
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test` — expected: PASS.

- [ ] **Step 5: Inject into the system identity**

In `services/assistantService.ts`: `import { memoryPromptBlock } from '../utils/memoryStorage';` and in `buildSystemIdentity`, change the final return to append the block when present:

```ts
    const memory = memoryPromptBlock();
    return `${withMasterRole}\n\n${WORKSPACE_CAPABILITIES}${memory ? `\n\n${memory}` : ''}`;
```

(Because `liveAssistantService.connect` also calls `buildSystemIdentity`, voice sessions get memories automatically.)

- [ ] **Step 6: Add the tools**

In `services/assistantTools.ts`, add `import { addMemory, loadMemories as loadMemoryEntries, deleteMemory } from '../utils/memoryStorage';` (aliased to avoid clashing with notes) and append:

```ts
    {
        name: 'remember',
        description: "Permanently remember a short fact about the user or their preferences (e.g. 'prefers SDXL', 'works in German'). It will be available in every future session, chat and voice. Use when the user says 'remember ...' or states a durable preference.",
        parameters: {
            type: 'object',
            properties: { fact: { type: 'string', description: 'One concise fact to remember.' } },
            required: ['fact'],
        },
        execute: ({ fact }) => (addMemory(String(fact)) ? 'Remembered.' : 'Already remembered (or empty fact).'),
    },
    {
        name: 'list_memories',
        description: 'List everything you permanently remember about the user. Returns JSON with ids (needed for forget).',
        parameters: { type: 'object', properties: {} },
        execute: () => JSON.stringify(loadMemoryEntries().map(m => ({ id: m.id, fact: m.fact }))),
    },
    {
        name: 'forget',
        description: 'Delete a remembered fact by id (get ids from list_memories first). Use when the user asks you to forget something.',
        parameters: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Memory id.' } },
            required: ['id'],
        },
        execute: ({ id }) => (deleteMemory(String(id)) ? 'Forgotten.' : `Error: no memory with id ${id}.`),
    },
```

Sync `WORKSPACE_CAPABILITIES`: add `long-term memory = remember/list_memories/forget,` to the `Elsewhere:` line.

- [ ] **Step 7: Verify and commit**

Run: `pnpm test && pnpm run lint`. `pnpm dev`: tell the assistant "remember that I always target Flux" → `✅ remember`; reload the app, ask "what do you know about me?" → it cites the fact (it is in the system prompt; it may also call list_memories).

```bash
git add utils/memoryStorage.ts utils/memoryStorage.test.ts services/assistantTools.ts services/assistantService.ts
git commit -m "feat: persistent assistant memory across sessions (chat and voice)"
```

---

### Task 15: MCP tools for the assistant brain

The chat panel's MCP console (`LLMChatPanel`) already connects to an MCP server and lists its tools, but only for manual execution. This task exposes those tools to the assistant itself: when `settings.mcpEnabled` and `settings.mcpServerUrl` are set, the server's tools are fetched (cached 60 s), prefixed `mcp_`, and appended to the declaration set of EVERY turn loop and the live voice session.

**Files:**
- Create: `services/mcpAssistantTools.ts`
- Modify: `services/assistantTools.ts` (parameterize the declaration helpers + executor)
- Modify: `services/assistantService.ts` (collect dynamic tools per turn)
- Modify: `services/liveAssistantService.ts` (include MCP tools in the live session)

**Interfaces:**
- Consumes: `mcpService.listTools(url)` / `mcpService.callTool(url, name, args)` from `services/mcpService.ts` (existing — verify exact export names in that file before coding; the chat panel calls them as `mcpService.listTools` / `mcpService.callTool`).
- Produces: `loadMcpAssistantTools(settings: LLMSettings): Promise<AssistantTool[]>`; changed signatures (all backward-compatible via defaults):

```ts
geminiToolDeclarations(tools?: AssistantTool[])         // default ASSISTANT_TOOLS
ollamaToolDeclarations(tools?: AssistantTool[])         // default ASSISTANT_TOOLS
fallbackProtocolPrompt(persona: string, tools?: AssistantTool[])
executeAssistantTool(name, args, ctx, extraTools?: AssistantTool[])
```

- [ ] **Step 1: Create services/mcpAssistantTools.ts**

```ts
import type { LLMSettings } from '../types';
import type { AssistantTool } from './assistantTools';
import { mcpService } from './mcpService';

let cache: { url: string; at: number; tools: AssistantTool[] } | null = null;
const TTL_MS = 60_000;

/** MCP server tools wrapped as assistant tools (name-prefixed mcp_). Returns
 * [] when MCP is disabled, unconfigured, or unreachable — the assistant then
 * simply runs with the built-in tool set. Cached per URL for 60s so turn
 * loops don't hammer the server. */
export const loadMcpAssistantTools = async (settings: LLMSettings): Promise<AssistantTool[]> => {
    const url = settings.mcpEnabled ? settings.mcpServerUrl?.trim() : '';
    if (!url) return [];
    if (cache && cache.url === url && Date.now() - cache.at < TTL_MS) return cache.tools;
    let tools: AssistantTool[] = [];
    try {
        const mcpTools = await mcpService.listTools(url);
        tools = (mcpTools || []).map((t: any): AssistantTool => ({
            name: `mcp_${String(t.name)}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60),
            description: `[MCP] ${t.description || t.name}`,
            parameters: {
                type: 'object',
                // Flattened best-effort mapping: nested MCP schemas are reduced to
                // their top-level properties with primitive types (Gemini's
                // uppercase-type conversion only handles flat property maps).
                properties: Object.fromEntries(
                    Object.entries((t.inputSchema?.properties || {}) as Record<string, any>).map(([k, v]) => [
                        k,
                        { type: typeof v?.type === 'string' ? v.type : 'string', description: String(v?.description || '') },
                    ])
                ),
                ...(Array.isArray(t.inputSchema?.required) && t.inputSchema.required.length ? { required: t.inputSchema.required } : {}),
            },
            execute: async (args) => {
                const out = await mcpService.callTool(url, String(t.name), args || {});
                const text = Array.isArray(out)
                    ? out.map((i: any) => i?.text ?? JSON.stringify(i)).join('\n')
                    : typeof out === 'string' ? out : JSON.stringify(out);
                return text.slice(0, 8000);
            },
        }));
    } catch {
        tools = []; // unreachable server — cache the miss too, retry after TTL
    }
    cache = { url, at: Date.now(), tools };
    return tools;
};
```

- [ ] **Step 2: Parameterize the declaration helpers and executor**

In `services/assistantTools.ts`, change the three helpers and the executor to accept a tool list (defaulting to the static set — no caller breaks):

```ts
export const executeAssistantTool = async (name: string, args: Record<string, any>, ctx: ToolContext, extraTools: AssistantTool[] = []): Promise<string> => {
    const tool = [...ASSISTANT_TOOLS, ...extraTools].find(t => t.name === name);
    // ...rest unchanged
};

export const geminiToolDeclarations = (tools: AssistantTool[] = ASSISTANT_TOOLS) =>
    tools.map(t => ({ /* body unchanged, iterate `tools` */ }));

export const ollamaToolDeclarations = (tools: AssistantTool[] = ASSISTANT_TOOLS) =>
    tools.map(t => ({ /* body unchanged */ }));

export const fallbackProtocolPrompt = (persona: string, tools: AssistantTool[] = ASSISTANT_TOOLS) => `${persona} ...
${tools.map(t => `- ${t.name}: ${t.description} Args schema: ${JSON.stringify(t.parameters.properties)}`).join('\n')}
...`;
```

(Only the parameter is new; keep the existing bodies, swapping `ASSISTANT_TOOLS.map` for `tools.map`.)

- [ ] **Step 3: Use dynamic tools in every turn loop**

In `services/assistantService.ts`: `import { ASSISTANT_TOOLS } from './assistantTools';` (extend the existing import), `import { loadMcpAssistantTools } from './mcpAssistantTools';`. At the top of `runGeminiTurn`, `runOllamaTurn`, `runOpenRouterTurn`, and `runFallbackTurn`:

```ts
    const mcpTools = await loadMcpAssistantTools(settings);
    const allTools = mcpTools.length ? [...ASSISTANT_TOOLS, ...mcpTools] : ASSISTANT_TOOLS;
```

then pass `allTools` through: `geminiToolDeclarations(allTools)` / `ollamaToolDeclarations(allTools)` / `fallbackProtocolPrompt(buildSystemIdentity(settings), allTools)`, and `executeAssistantTool(name, args, ctx, mcpTools)` at every execution site in those loops.

- [ ] **Step 4: Include MCP tools in the live voice session**

In `services/liveAssistantService.ts`: import `loadMcpAssistantTools` and `ASSISTANT_TOOLS`; add a field `private mcpTools: any[] = [];`. In `connect`, before `ai.live.connect`:

```ts
        this.mcpTools = await loadMcpAssistantTools(settings);
```

change the tools config line to `tools: [{ functionDeclarations: geminiToolDeclarations([...ASSISTANT_TOOLS, ...this.mcpTools]) as any }],` and the tool execution in `handleMessage` to `executeAssistantTool(fc.name, fc.args || {}, { settings: this.settings }, this.mcpTools)`.

- [ ] **Step 5: Verify and commit**

Run: `pnpm run lint && pnpm test` — green (defaults keep all existing call sites compiling). `pnpm dev` with an MCP server connected (chat panel MCP console → enable + connect, e.g. the Docker MCP gateway on port 3010): ask the assistant to use one of the listed MCP tools → expect a `⚙️ mcp_<tool>` round. With MCP disabled, behavior is byte-identical to before.

```bash
git add services/mcpAssistantTools.ts services/assistantTools.ts services/assistantService.ts services/liveAssistantService.ts
git commit -m "feat: expose connected MCP server tools to the assistant brain and live voice"
```

---

### Task 16: Voice hotkey (Ctrl+Space toggles the live session)

**Files:**
- Modify: `contexts/LiveAssistantContext.tsx`

- [ ] **Step 1: Add the global key listener**

In `LiveAssistantProvider`, after the `toggleLive` definition:

```ts
    // Global hotkey: Ctrl+Space toggles the live voice session from anywhere.
    useEffect(() => {
        if (!hasGeminiKey) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.code === 'Space' && !e.repeat) {
                e.preventDefault();
                audioService.playClick();
                toggleLive();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [toggleLive, hasGeminiKey]);
```

Add `import { audioService } from '../services/audioService';` if not already imported in this file (it is not — verify).

- [ ] **Step 2: Verify and commit**

Run: `pnpm run lint`. `pnpm dev`: Ctrl+Space from any tab starts the session (and redirects to the dashboard per Task 12); Ctrl+Space again ends it. Update the mic button tooltip in `components/LiveAssistantBar.tsx` titles to mention it: change `'Go Live'` to `'Go Live (Ctrl+Space)'` and `'End Live'` to `'End Live (Ctrl+Space)'`.

```bash
git add contexts/LiveAssistantContext.tsx components/LiveAssistantBar.tsx
git commit -m "feat: Ctrl+Space hotkey to toggle the live voice session"
```

---

## Deliberately skipped (add later if wanted)

- **Native OpenAI provider** — OpenRouter serves GPT models today; add a dedicated provider only if someone needs direct OpenAI billing.
- **Lip-synced visemes on the avatar** — jaw flap is speech-gated, not audio-amplitude-driven; upgrade path: pipe RMS of `playChunk` buffers from `liveAssistantService` over the event bus.
- **Notes/memories in the vault instead of localStorage** — move to a manifest file via `fileSystemManager` if they need to sync with Drive; the module boundaries make that a drop-in swap.
- **Web search without a Gemini key** (e.g. SearXNG/DDG via `/proxy-remote`) — only needed if a user runs fully local with zero Google keys.
- **Proxied iframe rewriting for embed-blocked sites** — rewriting HTML/asset URLs through the proxy is fragile and a security liability; reader mode + Open-in-Browser covers the need.

## Self-Review (performed at plan time)

- **Spec coverage:** Hermes removal ✅ (Task 1, footprint verified by grep: HermesController, App/Header names, types/settingsStorage/errorHandler fields, three server routes), switchable brain incl. "ChatGPT" ✅ (Tasks 2–5, GPT via OpenRouter), voice stays on current settings ✅ (global constraint), web search ✅ (Task 6) extended with in-app page display ✅ (Task 7, live iframe + reader fallback per user choice), file saving surfaced in the panel + downloadable to PC ✅ (Tasks 8, 10), notes panel ✅ (Tasks 9–10), subtitles above oscillator for voice AND text chat ✅ (Task 11), dashboard redirect ✅ (Task 12), three.js configurable talking head + texture template ✅ (Task 13), persistent memory ✅ (Task 14), MCP tools ✅ (Task 15), voice hotkey ✅ (Task 16).
- **Type consistency:** `AssistantEvent`/`ChatMsg` unchanged; `getAssistantProvider` used in Tasks 3–5; `AssistantNote` identical in Tasks 9/10; `MemoryEntry` in Task 14; `drawFaceTemplate`/`AVATAR_TEXTURE_PATH` exported in Task 13 Step 2, imported in Step 4; Task 15's parameterized helpers default to `ASSISTANT_TOOLS` so Tasks 2–4's call sites compile unchanged; renamed `onToggleChatPanel` (Task 1) is what Tasks 10/12 reference.
- **Known risks:** Ollama models without tool support 400 on the `tools` param (surfaced in chat — acceptable); Gemini rejects `googleSearch` mixed with `functionDeclarations`, hence the separate one-shot call; `/proxy-remote` header-mirroring is what makes the embed probe deterministic — if that route ever stops forwarding headers, the viewer falls back to live-embed-with-error, not a crash; `fileSystemManager.saveFile` folder auto-creation and `listDirectoryContents('assistant')` on a missing folder must be confirmed in Tasks 8/10 manual checks; `mcpService.listTools/callTool` export names must be re-verified against `services/mcpService.ts` at Task 15 time.
