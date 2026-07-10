# AI Assistant (ADA-inspired) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status (2026-07-10):** Phases 1 and 2 are implemented — `services/assistantTools.ts`, `services/assistantService.ts`, `services/liveAssistantService.ts`, `components/LiveAssistantBar.tsx` exist and `LLMChatPanel.tsx` already consumes `runAssistantTurn`. Remaining work is drift cleanup, not greenfield: (a) Hermes (SSE remote control) is being removed from the app — see the Architecture note; (b) the cheatsheet/artists/artstyles *pages* were removed from `ActiveTab`, so the `navigate` tool's PAGES enum must mirror the current `types.ts` (the `search_cheatsheets` tool stays — `utils/cheatsheetStorage.ts` and `appControlService.getCheatsheets` still exist).

**Goal:** Turn Kollektiv's chat panel into a real AI assistant that can *act on* every major app feature — navigate, search/save prompts, search the gallery and cheatsheets, run the refiner engine, hand work off to the Refiner UI — via native LLM function calling, and (Phase 2) add an ADA-style live **voice + screen-vision** mode on the Gemini Live API. Reference project: https://github.com/nazirlouis/ada (reviewed below); we adopt its architecture and deliberately improve on its weaknesses.

**Architecture:** Kollektiv already contains the embryo of this assistant, scattered across three disconnected fragments: user-typed slash commands (`components/LLMChatPanel.tsx:370-399` → `services/appControlService.ts`), a latent `<action>` JSON-tag parser in the chat loop that only works if the user hand-writes a system prompt teaching the model the tags (`LLMChatPanel.tsx:451-488`), and manually-invoked MCP tools (`/mcp call`). (The Hermes SSE remote-control channel — `HermesController.tsx` → `appControlService` — is being removed and is NOT part of this plan; do not wire anything through it, and its removal does not touch the assistant paths.) Nothing lets the LLM autonomously call app functions. The fix: one **tool registry** (`services/assistantTools.ts`) as the single source of truth, a provider-aware **agent loop** (`services/assistantService.ts`) that uses native function calling on Gemini and Ollama and a registry-generated `<action>` tag protocol as fallback for Anthropic/OpenRouter/LlamaCpp, and (Phase 2) a **live session service** wiring the same registry into `@google/genai`'s Live API (verified available: `readonly live: Live` in the installed SDK v1.52.0, `node_modules/@google/genai/dist/genai.d.ts:5396`; `sendRealtimeInput({audio|video})` at `:7623-7646`; `sendToolResponse` at `:9953+`).

**Tech Stack:** TypeScript, React 19, `@google/genai` 1.52.0 (already installed), Web Audio API (AudioWorklet), `getUserMedia`/`getDisplayMedia`. **No new dependencies.**

## Review of nazirlouis/ada — what we adopt, what we do better

ADA (888-line Python/PySide6 desktop app) = Gemini Live session + continuous mic streaming (16 kHz PCM in) + 1 fps webcam/screen JPEG frames + text responses piped to ElevenLabs TTS + 7 OS-level function tools dispatched by an if/elif chain.

**Adopt:** the live bidirectional session with function calling; continuous mic + throttled screen frames; a visible tool-activity feed; a "speaking" UI state; feeding tool errors back to the model as results so it can self-correct.

**Do better (each is a concrete requirement of this plan):**
1. **Tool registry, not if/elif** — ADA defines each tool in 3 places (declaration `ada.py:177-258`, impl `:289-359`, dispatch `:433-441`). Ours: one object per tool with schema + handler; declarations for Gemini/Ollama/fallback-prompt are all *generated* from it.
2. **No ElevenLabs dependency** — ADA requires a paid TTS key and a per-turn websocket reconnect (`ada.py:493-526`). We use the Live API's native `AUDIO` response modality: free with the same Gemini key the app already has, lower latency, no third-party account.
3. **Interruption handling** — ADA never processes the Live API's `interrupted` signal; its speech runs over you. We stop and flush scheduled audio on `serverContent.interrupted`.
4. **Multi-provider text agent** — ADA is Gemini-only. Our Phase 1 agent works on Gemini *and* Ollama natively, with a functional fallback for the other three providers.
5. **Loop guard** — ADA has no cap on consecutive tool calls. We cap at 8 per turn.
6. **App-level tools, not OS-level** — ADA writes arbitrary files and launches arbitrary apps with zero confirmation. Our tools operate on Kollektiv's own data, and **all writes are additive** (save new prompt, send to refiner); no delete/overwrite tools in v1.
7. **Session lifecycle + cleanup** — ADA leaks on abnormal exit and hardcodes `MAX_OUTPUT_TOKENS = 100` and a preview model string. We centralize the model constant, surface connection state in the UI, and tear down mic/screen/audio contexts deterministically (this repo has a history of object-URL leak fixes — same discipline applies).

## Global Constraints

- **No new npm dependencies.** Everything needed is installed (`@google/genai` 1.52.0) or built into the browser.
- **Persisted chat-message shape is frozen:** `{ role: 'user' | 'assistant' | 'system', content: string, attachments?: [...] }` — `utils/chatStorage.ts` and session restore depend on it. Tool activity renders as `role: 'system'` messages (the existing `⚙️ [MCP Execute]` pattern at `LLMChatPanel.tsx:190`).
- **Slash commands and manual MCP tools keep working unchanged.**
- **All assistant write-tools are additive.** Never expose delete, overwrite, or settings-mutation tools in this plan.
- **Gemini key stays client-side** — that is this app's existing architecture for all providers (`geminiService.ts:7-19`); do not build a token-broker server in this plan. (Known ceiling: ephemeral tokens are the hardened pattern if this ever runs non-locally.)
- `pnpm lint` (= `tsc --noEmit`) green after every task.
- Merge-order note: `Plan-llm-provider-dispatch.md` also edits `services/llmService.ts`. The two plans are logically independent; if both are in flight, land that one first (this plan only *reads* `streamChat`).

---

# Phase 1 — Tool registry + text agent (all providers)

### Task 1: The tool registry

**Files:**
- Create: `services/assistantTools.ts`
- Modify: `components/App.tsx` (one new eventBus listener next to the existing one at `App.tsx:728-735`)

**Produces:** `ASSISTANT_TOOLS`, `executeAssistantTool(name, args, ctx)`, `geminiToolDeclarations()`, `ollamaToolDeclarations()`, `fallbackProtocolPrompt()` — consumed by Tasks 2, 3, and Phase 2.

- [ ] **Step 1: Create `services/assistantTools.ts`:**

```typescript
import type { LLMSettings } from '../types';
import { appControlService } from './appControlService';
import { appEventBus } from '../utils/eventBus';
import { loadGalleryItems } from '../utils/galleryStorage';
import { refineSinglePrompt } from './llmService';

export interface ToolContext {
    settings: LLMSettings;
}

/** JSON-Schema-style (lowercase types); converted per-provider below. */
export interface AssistantTool {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, { type: string; description: string; enum?: string[] }>;
        required?: string[];
    };
    execute: (args: Record<string, any>, ctx: ToolContext) => Promise<string> | string;
}

// Must mirror ActiveTab in types.ts — the cheatsheet/artists/artstyles pages were removed.
const PAGES = ['dashboard', 'discovery', 'prompts', 'crafter', 'refiner', 'prompt_analyzer', 'media_analyzer', 'prompt', 'gallery', 'resizer', 'video_to_frames', 'image_compare', 'color_palette_extractor', 'composer', 'settings'];

export const ASSISTANT_TOOLS: AssistantTool[] = [
    {
        name: 'navigate',
        description: 'Navigate the app to a different page/tab.',
        parameters: {
            type: 'object',
            properties: { page: { type: 'string', description: 'Target page.', enum: PAGES } },
            required: ['page'],
        },
        execute: ({ page }) => appControlService.navigate(String(page)),
    },
    {
        name: 'search_prompts',
        description: "Search the user's saved prompt library by title or content. Returns matching prompts as JSON.",
        parameters: {
            type: 'object',
            properties: { query: { type: 'string', description: 'Search text. Omit to list recent prompts.' } },
        },
        execute: ({ query }) => appControlService.getPrompts(query ? String(query) : undefined),
    },
    {
        name: 'save_prompt',
        description: "Save a new prompt into the user's prompt library.",
        parameters: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Short title for the prompt.' },
                prompt: { type: 'string', description: 'The full prompt text to save.' },
            },
            required: ['title', 'prompt'],
        },
        execute: ({ title, prompt }) => appControlService.savePrompt(String(title), String(prompt)),
    },
    {
        name: 'search_gallery',
        description: 'Search the media gallery by title, tags, notes, or generation prompt. Returns matching items as JSON.',
        parameters: {
            type: 'object',
            properties: { query: { type: 'string', description: 'Search text. Omit for a gallery overview.' } },
        },
        execute: async ({ query }) => {
            if (!query) return appControlService.getGalleryInfo();
            const q = String(query).toLowerCase();
            const items = await loadGalleryItems();
            const hits = items.filter(i =>
                i.title?.toLowerCase().includes(q) ||
                i.prompt?.toLowerCase().includes(q) ||
                i.notes?.toLowerCase().includes(q) ||
                (Array.isArray(i.tags) && i.tags.some((t: string) => t.toLowerCase().includes(q)))
            );
            return JSON.stringify(hits.slice(0, 30).map(i => ({ id: i.id, title: i.title, type: i.type, prompt: i.prompt, tags: i.tags })));
        },
    },
    {
        name: 'search_cheatsheets',
        description: 'Search the style/technique cheatsheets (keywords, artists, art styles) for reference material. Returns JSON.',
        parameters: {
            type: 'object',
            properties: { query: { type: 'string', description: 'Search text. Omit to list cheatsheet categories.' } },
        },
        execute: ({ query }) => appControlService.getCheatsheets(query ? String(query) : undefined),
    },
    {
        name: 'refine_prompt',
        description: 'Run a raw idea through the Kollektiv refiner engine to produce a polished, model-specific generation prompt. Returns the refined prompt text.',
        parameters: {
            type: 'object',
            properties: {
                idea: { type: 'string', description: 'The raw prompt or idea to refine.' },
                target_model: { type: 'string', description: "Target generative model, e.g. 'SDXL', 'Flux', 'Midjourney'. Defaults to 'Flux'." },
            },
            required: ['idea'],
        },
        execute: ({ idea, target_model }, ctx) =>
            refineSinglePrompt(String(idea), String(target_model || 'Flux'), ctx.settings),
    },
    {
        name: 'send_to_refiner',
        description: 'Open the Refiner page with the given prompt text pre-loaded so the user can work on it interactively.',
        parameters: {
            type: 'object',
            properties: { prompt: { type: 'string', description: 'Prompt text to load into the Refiner.' } },
            required: ['prompt'],
        },
        execute: ({ prompt }) => {
            appEventBus.emit('sendToPromptsPage', { prompt: String(prompt), view: 'enhancer' });
            return 'Opened the Refiner with the prompt pre-loaded.';
        },
    },
    {
        name: 'list_discovery_collections',
        description: 'List the online prompt-discovery collections available in the app. Returns JSON.',
        parameters: { type: 'object', properties: {} },
        execute: () => appControlService.getDiscoveryCollections(),
    },
    {
        name: 'search_discovery_prompts',
        description: 'Fetch prompts from a discovery collection (get collection ids from list_discovery_collections first). Returns JSON.',
        parameters: {
            type: 'object',
            properties: {
                collection_id: { type: 'string', description: 'Collection id.' },
                query: { type: 'string', description: 'Optional filter text.' },
            },
            required: ['collection_id'],
        },
        execute: ({ collection_id, query }) =>
            appControlService.getDiscoveryPrompts(String(collection_id), query ? String(query) : undefined),
    },
];

export const executeAssistantTool = async (name: string, args: Record<string, any>, ctx: ToolContext): Promise<string> => {
    const tool = ASSISTANT_TOOLS.find(t => t.name === name);
    if (!tool) return `Error: unknown tool "${name}". Available: ${ASSISTANT_TOOLS.map(t => t.name).join(', ')}`;
    try {
        return String(await tool.execute(args || {}, ctx));
    } catch (e: any) {
        // Feed the failure back to the model so it can self-correct (ADA pattern, kept).
        return `Error executing ${name}: ${e?.message || e}`;
    }
};

/** Gemini functionDeclarations (uppercase Type strings). */
export const geminiToolDeclarations = () =>
    ASSISTANT_TOOLS.map(t => ({
        name: t.name,
        description: t.description,
        parameters: {
            type: 'OBJECT',
            properties: Object.fromEntries(
                Object.entries(t.parameters.properties).map(([k, v]) => [k, { ...v, type: v.type.toUpperCase() }])
            ),
            ...(t.parameters.required?.length ? { required: t.parameters.required } : {}),
        },
    }));

/** Ollama /api/chat tools (OpenAI-style). */
export const ollamaToolDeclarations = () =>
    ASSISTANT_TOOLS.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

/** System-prompt tool protocol for providers without native function calling. */
export const fallbackProtocolPrompt = () => `You are the Kollektiv assistant. You can control the app with tools.
To call a tool, output EXACTLY one block in this format and nothing after it:
<action>{"tool": "<tool_name>", "args": { ... }}</action>
The system will reply with the result; then continue helping the user. Available tools:
${ASSISTANT_TOOLS.map(t => `- ${t.name}: ${t.description} Args schema: ${JSON.stringify(t.parameters.properties)}`).join('\n')}
Only use a tool when it helps. Otherwise answer normally.`;
```

- [ ] **Step 2: Wire the `sendToPromptsPage` event in App.** In `components/App.tsx`, inside the existing `useEffect` that subscribes to `appEventBus.on('navigate', ...)` (`App.tsx:728-735`), add a second subscription that calls the already-existing `handleSendToPromptsPage` (`App.tsx:747`):

```typescript
useEffect(() => {
    const unsubscribe = appEventBus.on('navigate', (tab) => {
        if (typeof tab === 'string') {
            setActiveTab(tab as ActiveTab);
        }
    });
    const unsubSend = appEventBus.on('sendToPromptsPage', (state) => {
        if (state && typeof state === 'object') {
            handleSendToPromptsPage(state as PromptsPageState);
        }
    });
    return () => { unsubscribe(); unsubSend(); };
}, [activeTab, handleSendToPromptsPage]);
```

  `PromptsPageState` is declared at `App.tsx:49` — `{ prompt?: string, view?: 'enhancer' | 'composer' | 'create', ... }`, so the payload emitted by the `send_to_refiner` tool matches. Check `utils/eventBus.ts` for the exact `on` signature before writing (it returns an unsubscribe function, as the existing usage shows).
- [ ] **Step 3:** Before relying on field names in `search_gallery`, open `types.ts` and confirm `GalleryItem` has `title`, `prompt`, `notes`, `tags`, `type`, `id` — adjust the filter to the real fields if any differ.
- [ ] **Step 4:** `pnpm lint` green. Commit: `git commit -am "feat: assistant tool registry over app features"`

---

### Task 2: The agent loop — `runAssistantTurn`

**Files:**
- Create: `services/assistantService.ts`
- Modify: `services/geminiService.ts` (export the existing `getGeminiClient`, line 7: add `export` keyword)
- Modify: `services/ollamaService.ts` (export the existing `getOllamaConfig` helper: add `export` keyword)

**Produces:** `runAssistantTurn(messages, settings): AsyncGenerator<AssistantEvent>` — consumed by Task 3 (chat panel) and mirrored by Phase 2.

- [ ] **Step 1:** Add `export` to `getGeminiClient` in `geminiService.ts:7` and to `getOllamaConfig` in `ollamaService.ts` (find it near the top of the file, the config-builder used by every Ollama call). `pnpm lint` still green.
- [ ] **Step 2: Create `services/assistantService.ts`:**

```typescript
import type { LLMSettings } from '../types';
import { streamChat } from './llmService';
import { getGeminiClient } from './geminiService';
import { getOllamaConfig } from './ollamaService';
import {
    executeAssistantTool, geminiToolDeclarations, ollamaToolDeclarations,
    fallbackProtocolPrompt,
} from './assistantTools';

export type ChatMsg = { role: 'user' | 'assistant' | 'system'; content: string; attachments?: { data: string; mimeType: string; fileName?: string }[] };

export type AssistantEvent =
    | { type: 'text'; chunk: string }
    | { type: 'tool_start'; name: string; args: Record<string, any> }
    | { type: 'tool_result'; name: string; result: string }
    | { type: 'turn_end' };   // one assistant message finished (a new one may start after tools)

const MAX_TOOL_ROUNDS = 8;   // ponytail: hard cap instead of loop detection; raise if real workflows hit it

export const SYSTEM_IDENTITY = `You are the Kollektiv assistant, embedded in a local-first creative suite for prompt engineering and media management. Be concise. Use your tools to act on the app when the user asks for something the tools can do; report what you did.`;

export async function* runAssistantTurn(messages: ChatMsg[], settings: LLMSettings): AsyncGenerator<AssistantEvent> {
    const active = settings.activeLLM;
    if (active === 'gemini' || !active) {
        yield* runGeminiTurn(messages, settings);
    } else if (active === 'ollama' || active === 'ollama_cloud') {
        yield* runOllamaTurn(messages, settings);
    } else {
        yield* runFallbackTurn(messages, settings); // anthropic | openrouter | llamacpp
    }
}

// ---------------- Gemini: native function calling ----------------

async function* runGeminiTurn(messages: ChatMsg[], settings: LLMSettings): AsyncGenerator<AssistantEvent> {
    const ai = getGeminiClient(settings);
    const model = settings.llmModel || 'gemini-3.5-flash';
    const systemText = [SYSTEM_IDENTITY, ...messages.filter(m => m.role === 'system').map(m => m.content)].join('\n\n');
    const contents: any[] = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [
                { text: m.content },
                ...(m.attachments || [])
                    .filter(a => a.mimeType.startsWith('image/'))
                    .map(a => ({ inlineData: { mimeType: a.mimeType, data: a.data.includes('base64,') ? a.data.split('base64,')[1] : a.data } })),
            ],
        }));

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const stream = await ai.models.generateContentStream({
            model,
            contents,
            config: {
                systemInstruction: systemText,
                tools: [{ functionDeclarations: geminiToolDeclarations() as any }],
            },
        });

        const calls: { id?: string; name: string; args: Record<string, any> }[] = [];
        // Accumulate the model's RAW parts (chunk.candidates[0].content.parts), not
        // hand-rebuilt {functionCall:{name,args}} objects. Gemini 2.5+/3.x models attach
        // a `thoughtSignature` to functionCall parts; dropping it when the turn is echoed
        // back next round makes the API reject the request with a 400
        // ("Function call is missing a thought_signature"). Do not reconstruct parts from
        // the chunk.functionCalls convenience getter for this reason — it discards the
        // signature. Use the raw parts array as the source of truth for both the calls
        // list and the model-turn history entry.
        const modelParts: any[] = [];
        for await (const chunk of stream) {
            if (chunk.text) yield { type: 'text', chunk: chunk.text };
            const parts = (chunk as any).candidates?.[0]?.content?.parts;
            if (Array.isArray(parts)) {
                for (const part of parts) {
                    modelParts.push(part);
                    if (part.functionCall?.name) {
                        calls.push({ id: part.functionCall.id, name: part.functionCall.name, args: (part.functionCall.args || {}) as Record<string, any> });
                    }
                }
            }
        }
        yield { type: 'turn_end' };
        if (calls.length === 0) return;

        contents.push({ role: 'model', parts: modelParts });
        const responseParts: any[] = [];
        for (const c of calls) {
            yield { type: 'tool_start', name: c.name, args: c.args };
            const result = await executeAssistantTool(c.name, c.args, { settings });
            yield { type: 'tool_result', name: c.name, result };
            responseParts.push({ functionResponse: { name: c.name, response: { result } } });
        }
        contents.push({ role: 'user', parts: responseParts });
    }
    yield { type: 'text', chunk: '\n[Assistant]: tool-call limit reached for this turn.' };
    yield { type: 'turn_end' };
}

// ---------------- Ollama: native tools on /api/chat ----------------

async function* runOllamaTurn(messages: ChatMsg[], settings: LLMSettings): AsyncGenerator<AssistantEvent> {
    const config = getOllamaConfig(settings);
    if (!config.baseUrl || !config.model) throw new Error('Ollama configuration missing.');

    const chat: any[] = [
        { role: 'system', content: SYSTEM_IDENTITY },
        ...messages.map(m => ({ role: m.role, content: m.content })),
    ];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        let res: Response;
        try {
            res = await fetch(`${config.baseUrl}/api/chat`, {
                method: 'POST',
                headers: config.headers,
                body: JSON.stringify({ model: config.model, messages: chat, stream: true, tools: ollamaToolDeclarations() }),
            });
        } catch (e: any) {
            throw new Error(`Ollama request failed: ${e?.message || e}`);
        }
        if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            // Models without tool support -> degrade to the tag protocol for this conversation.
            if (errBody.includes('does not support tools')) {
                yield* runFallbackTurn(messages, settings);
                return;
            }
            throw new Error(`Ollama error ${res.status}: ${errBody.slice(0, 300)}`);
        }

        let text = '';
        const calls: { name: string; args: Record<string, any> }[] = [];
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop() || '';
            for (const line of lines) {
                if (!line.trim()) continue;
                let obj: any;
                try { obj = JSON.parse(line); } catch { continue; }
                if (obj.error) throw new Error(`Ollama: ${obj.error}`);
                const msg = obj.message || {};
                if (msg.content) { text += msg.content; yield { type: 'text', chunk: msg.content }; }
                for (const tc of msg.tool_calls || []) {
                    if (tc.function?.name) calls.push({ name: tc.function.name, args: tc.function.arguments || {} });
                }
            }
        }
        yield { type: 'turn_end' };
        if (calls.length === 0) return;

        chat.push({ role: 'assistant', content: text, tool_calls: calls.map(c => ({ function: { name: c.name, arguments: c.args } })) });
        for (const c of calls) {
            yield { type: 'tool_start', name: c.name, args: c.args };
            const result = await executeAssistantTool(c.name, c.args, { settings });
            yield { type: 'tool_result', name: c.name, result };
            chat.push({ role: 'tool', content: result });
        }
    }
    yield { type: 'text', chunk: '\n[Assistant]: tool-call limit reached for this turn.' };
    yield { type: 'turn_end' };
}

// ---------------- Fallback: <action> tag protocol over plain streamChat ----------------

async function* runFallbackTurn(messages: ChatMsg[], settings: LLMSettings): AsyncGenerator<AssistantEvent> {
    let convo: ChatMsg[] = [{ role: 'system', content: fallbackProtocolPrompt() }, ...messages];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        let full = '';
        for await (const chunk of streamChat(convo, settings)) {
            full += chunk;
            yield { type: 'text', chunk };
        }
        yield { type: 'turn_end' };

        const match = full.match(/<action>([\s\S]*?)<\/action>/);
        if (!match) return;
        convo = [...convo, { role: 'assistant', content: full }];
        let name = '', args: Record<string, any> = {};
        try {
            const parsed = JSON.parse(match[1].trim());
            name = parsed.tool || parsed.type || '';
            args = parsed.args || parsed;
        } catch (e: any) {
            convo = [...convo, { role: 'system', content: `System: could not parse your <action> block (${e.message}). Emit valid JSON: {"tool": "...", "args": {...}}` }];
            continue;
        }
        yield { type: 'tool_start', name, args };
        const result = await executeAssistantTool(name, args, { settings });
        yield { type: 'tool_result', name, result };
        convo = [...convo, { role: 'system', content: `System: tool ${name} returned:\n${result}` }];
    }
    yield { type: 'text', chunk: '\n[Assistant]: tool-call limit reached for this turn.' };
    yield { type: 'turn_end' };
}
```

- [ ] **Step 3: Sanity-check SDK field names against the installed types.** Open `node_modules/@google/genai/dist/genai.d.ts` and confirm: `GenerateContentResponse` exposes `text` and `functionCalls` getters (search `get functionCalls`), and `FunctionCall` has `id?`, `name?`, `args?`. Also confirm `Part` has `thoughtSignature?: string` (search `thoughtSignature`) — it's a sibling of `functionCall` on the same raw `Part`, not on the `FunctionCall` object itself, which is why the calls list must be built by walking `chunk.candidates[0].content.parts` rather than the `chunk.functionCalls` convenience getter. If a name differs, follow the types — they are the ground truth for v1.52.0.
- [ ] **Step 4:** `pnpm lint` green. Commit: `git commit -am "feat: provider-aware assistant agent loop with native function calling"`

---

### Task 3: Rewire the chat panel onto the agent loop

**Files:**
- Modify: `components/LLMChatPanel.tsx` (the send flow at `:414-503`)

- [ ] **Step 1:** Replace the `while (shouldContinue)` block (`LLMChatPanel.tsx:416-489` — from `setIsProcessing(true)` try-body start through the action-tag handling) with a single consumption loop. Keep the surrounding try/catch/finally (`:490-502`) exactly as is:

```typescript
try {
    const events = runAssistantTurn(newMessages, settings);
    let fullResponse = '';
    let assistantOpen = false;

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
            assistantOpen = false;
            setMessages(prev => { persistSession(prev, currentSessionId); return prev; });
        } else if (ev.type === 'tool_start') {
            setMessages(prev => [...prev, { role: 'system', content: `⚙️ [Assistant]: ${ev.name}(${JSON.stringify(ev.args)})` }]);
        } else if (ev.type === 'tool_result') {
            const preview = ev.result.length > 600 ? ev.result.slice(0, 600) + '…' : ev.result;
            setMessages(prev => {
                const next = [...prev, { role: 'system' as const, content: `✅ [${ev.name}]: ${preview}` }];
                persistSession(next, currentSessionId);
                return next;
            });
        }
    }
}
```

  Add the import: `import { runAssistantTurn } from '../services/assistantService';`. Delete the now-unused `<action>` regex block and its `appControlService` action dispatch (`:451-488`) — the fallback path in `assistantService` replaces it. **Do not** remove the slash-command handling (`:319-412`) or the MCP console features.
- [ ] **Step 2:** Check `streamChat` is still imported/used elsewhere in the file; if the import at `LLMChatPanel.tsx:4` becomes unused, remove it.
- [ ] **Step 3:** `pnpm lint` green. Manual smoke (Gemini engine): ask "*search my prompt library for dragons, then save a new prompt titled 'Test Dragon' with the text 'a dragon over a neon city'*" → you see `⚙️`/`✅` activity messages, the model's summary, and the prompt exists in the Prompt Library page afterwards. Ask "*take me to the gallery*" → active tab switches.
- [ ] **Step 4:** Manual smoke (Ollama engine, tool-capable model such as `llama3.1` or `qwen3`): same navigation test works. With a non-tool model, the same request still works via the automatic tag-protocol fallback.
- [ ] **Step 5:** Commit: `git commit -am "feat: chat panel drives the assistant agent loop; retire ad-hoc action tags"`

### CHECKPOINT — Phase 1 is shippable on its own. Review before Phase 2.

---

# Phase 2 — Live voice + screen vision (Gemini Live API)

### Task 4: Live session service

**Files:**
- Create: `services/liveAssistantService.ts`

**Produces:** `LiveAssistant` class with `connect(settings, handlers)`, `disconnect()`, `startScreenShare()`, `stopScreenShare()` — consumed by Task 5's UI.

- [ ] **Step 1: Create `services/liveAssistantService.ts`:**

```typescript
import { Modality } from '@google/genai';
import type { LLMSettings } from '../types';
import { getGeminiClient } from './geminiService';
import { executeAssistantTool, geminiToolDeclarations } from './assistantTools';
import { SYSTEM_IDENTITY } from './assistantService';

// ponytail: single constant, not a settings field — promote to Settings UI when someone actually needs to change it.
// Verified against https://ai.google.dev/gemini-api/docs/live-api/capabilities (2026-07-10) —
// gemini-live-2.5-flash-preview was retired; this is the current model. If connection fails
// with "model ... is not found ... bidiGenerateContent", check that page again first.
const LIVE_MODEL = 'gemini-3.1-flash-live-preview';
const MIC_RATE = 16000;      // Live API input requirement
const SPEAKER_RATE = 24000;  // Live API output rate

export interface LiveHandlers {
    onStatus: (s: 'connecting' | 'live' | 'closed' | 'error', detail?: string) => void;
    onCaption: (who: 'user' | 'assistant', text: string) => void;
    onToolActivity: (line: string) => void;
    onSpeaking: (speaking: boolean) => void;
    onScreenShare: (active: boolean) => void;
}

// Mic worklet: captures mono float32, downsamples to 16 kHz if the context refuses that rate.
const WORKLET_SRC = `
class PcmCapture extends AudioWorkletProcessor {
    process(inputs) {
        const ch = inputs[0] && inputs[0][0];
        if (ch && ch.length) this.port.postMessage(ch.slice(0));
        return true;
    }
}
registerProcessor('pcm-capture', PcmCapture);
`;

const floatTo16 = (f32: Float32Array): Int16Array => {
    const out = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
        const s = Math.max(-1, Math.min(1, f32[i]));
        out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
};

/** Linear resampler — browsers may ignore a requested AudioContext sampleRate. */
const resampleTo = (data: Float32Array, from: number, to: number): Float32Array => {
    if (from === to) return data;
    const ratio = from / to;
    const out = new Float32Array(Math.floor(data.length / ratio));
    for (let i = 0; i < out.length; i++) {
        const pos = i * ratio;
        const i0 = Math.floor(pos);
        const i1 = Math.min(i0 + 1, data.length - 1);
        out[i] = data[i0] + (data[i1] - data[i0]) * (pos - i0);
    }
    return out;
};

const toBase64 = (bytes: Uint8Array): string => {
    let bin = '';
    const CHUNK = 0x8000; // avoid call-stack overflow on large buffers
    for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
};

const fromBase64 = (b64: string): Uint8Array => {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
};

export class LiveAssistant {
    private session: any = null;
    private micCtx: AudioContext | null = null;
    private micStream: MediaStream | null = null;
    private micNode: AudioWorkletNode | null = null;
    private outCtx: AudioContext | null = null;
    private nextStart = 0;
    private playing = new Set<AudioBufferSourceNode>();
    private screenStream: MediaStream | null = null;
    private screenTimer: ReturnType<typeof setInterval> | null = null;
    private videoEl: HTMLVideoElement | null = null;
    private handlers!: LiveHandlers;
    private settings!: LLMSettings;
    private closedByUs = false;

    async connect(settings: LLMSettings, handlers: LiveHandlers): Promise<void> {
        this.settings = settings;
        this.handlers = handlers;
        this.closedByUs = false;
        handlers.onStatus('connecting');
        const ai = getGeminiClient(settings);

        this.session = await ai.live.connect({
            model: LIVE_MODEL,
            config: {
                responseModalities: [Modality.AUDIO],
                systemInstruction: SYSTEM_IDENTITY + ' You are in live voice mode; keep spoken replies short. The user may share their screen — only comment on it when asked.',
                tools: [{ functionDeclarations: geminiToolDeclarations() as any }],
                inputAudioTranscription: {},
                outputAudioTranscription: {},
            },
            callbacks: {
                onopen: () => handlers.onStatus('live'),
                onmessage: (msg: any) => { void this.handleMessage(msg); },
                onerror: (e: any) => handlers.onStatus('error', e?.message || 'live session error'),
                onclose: () => { if (!this.closedByUs) handlers.onStatus('closed'); },
            },
        });

        await this.startMic();
    }

    private async startMic(): Promise<void> {
        this.micStream = await navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        });
        this.micCtx = new AudioContext({ sampleRate: MIC_RATE }); // created in the click handler's call chain -> allowed
        await this.micCtx.resume();
        const workletUrl = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
        try {
            await this.micCtx.audioWorklet.addModule(workletUrl);
        } finally {
            URL.revokeObjectURL(workletUrl);
        }
        const source = this.micCtx.createMediaStreamSource(this.micStream);
        this.micNode = new AudioWorkletNode(this.micCtx, 'pcm-capture');
        const actualRate = this.micCtx.sampleRate; // may not be 16000 on all platforms
        this.micNode.port.onmessage = (ev: MessageEvent<Float32Array>) => {
            if (!this.session) return;
            const pcm = floatTo16(resampleTo(ev.data, actualRate, MIC_RATE));
            const b64 = toBase64(new Uint8Array(pcm.buffer));
            try {
                this.session.sendRealtimeInput({ audio: { data: b64, mimeType: `audio/pcm;rate=${MIC_RATE}` } });
            } catch { /* session mid-close */ }
        };
        source.connect(this.micNode);
        // Do NOT connect micNode to destination — no local echo.
    }

    private async handleMessage(msg: any): Promise<void> {
        // 1. Tool calls
        if (msg.toolCall?.functionCalls?.length) {
            const responses = [];
            for (const fc of msg.toolCall.functionCalls) {
                this.handlers.onToolActivity(`⚙️ ${fc.name}(${JSON.stringify(fc.args || {})})`);
                const result = await executeAssistantTool(fc.name, fc.args || {}, { settings: this.settings });
                this.handlers.onToolActivity(`✅ ${fc.name}: ${result.slice(0, 300)}`);
                responses.push({ id: fc.id, name: fc.name, response: { result } });
            }
            try { this.session?.sendToolResponse({ functionResponses: responses }); } catch { /* closed */ }
            return;
        }
        // 2. Interruption: user spoke over the assistant -> kill queued audio immediately.
        if (msg.serverContent?.interrupted) {
            this.flushPlayback();
            return;
        }
        // 3. Captions
        const inTr = msg.serverContent?.inputTranscription?.text;
        if (inTr) this.handlers.onCaption('user', inTr);
        const outTr = msg.serverContent?.outputTranscription?.text;
        if (outTr) this.handlers.onCaption('assistant', outTr);
        // 4. Audio out (24 kHz PCM16 in msg.data)
        if (msg.data) this.playChunk(fromBase64(msg.data));
    }

    private playChunk(bytes: Uint8Array): void {
        if (!this.outCtx) {
            this.outCtx = new AudioContext({ sampleRate: SPEAKER_RATE });
            this.nextStart = 0;
        }
        void this.outCtx.resume();
        const i16 = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
        const f32 = new Float32Array(i16.length);
        for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 0x8000;
        const buf = this.outCtx.createBuffer(1, f32.length, SPEAKER_RATE);
        buf.copyToChannel(f32, 0);
        const src = this.outCtx.createBufferSource();
        src.buffer = buf;
        src.connect(this.outCtx.destination);
        const startAt = Math.max(this.outCtx.currentTime, this.nextStart);
        src.start(startAt);
        this.nextStart = startAt + buf.duration;
        this.playing.add(src);
        this.handlers.onSpeaking(true);
        src.onended = () => {
            this.playing.delete(src);
            if (this.playing.size === 0) this.handlers.onSpeaking(false);
        };
    }

    private flushPlayback(): void {
        for (const src of this.playing) { try { src.stop(); } catch { /* already stopped */ } }
        this.playing.clear();
        this.nextStart = 0;
        this.handlers.onSpeaking(false);
    }

    async startScreenShare(): Promise<void> {
        this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const track = this.screenStream.getVideoTracks()[0];
        track.addEventListener('ended', () => this.stopScreenShare()); // user hit the browser's Stop-sharing button
        this.videoEl = document.createElement('video');
        this.videoEl.srcObject = this.screenStream;
        this.videoEl.muted = true;
        await this.videoEl.play();
        const canvas = document.createElement('canvas');
        this.screenTimer = setInterval(() => {
            if (!this.session || !this.videoEl || this.videoEl.videoWidth === 0) return;
            const scale = Math.min(1, 1024 / Math.max(this.videoEl.videoWidth, this.videoEl.videoHeight));
            canvas.width = Math.round(this.videoEl.videoWidth * scale);
            canvas.height = Math.round(this.videoEl.videoHeight * scale);
            canvas.getContext('2d')!.drawImage(this.videoEl, 0, 0, canvas.width, canvas.height);
            const b64 = canvas.toDataURL('image/jpeg', 0.7).split('base64,')[1];
            try {
                this.session.sendRealtimeInput({ video: { data: b64, mimeType: 'image/jpeg' } });
            } catch { /* session mid-close */ }
        }, 1000); // 1 fps, ADA's cadence — plenty for "look at my screen"
        this.handlers.onScreenShare(true);
    }

    stopScreenShare(): void {
        if (this.screenTimer) { clearInterval(this.screenTimer); this.screenTimer = null; }
        this.screenStream?.getTracks().forEach(t => t.stop());
        this.screenStream = null;
        if (this.videoEl) { this.videoEl.srcObject = null; this.videoEl = null; }
        this.handlers?.onScreenShare(false);
    }

    disconnect(): void {
        this.closedByUs = true;
        this.stopScreenShare();
        this.flushPlayback();
        this.micNode?.port.close();
        this.micNode?.disconnect();
        this.micNode = null;
        this.micStream?.getTracks().forEach(t => t.stop());
        this.micStream = null;
        void this.micCtx?.close(); this.micCtx = null;
        void this.outCtx?.close(); this.outCtx = null;
        try { this.session?.close(); } catch { /* already closed */ }
        this.session = null;
        // Do NOT call handlers.onStatus('closed') here: the caller (explicit stop(),
        // or unmount cleanup) already owns the UI transition. The `onclose` callback
        // above (guarded by `!closedByUs`) is the only path that should fire it, for
        // unsolicited session death. Calling it here too creates disconnect() ->
        // onStatus('closed') -> UI's stop() -> disconnect() infinite recursion.
    }
}
```

- [ ] **Step 2: Verify SDK call shapes against `genai.d.ts`** (same discipline as Task 2 Step 3): `ai.live.connect({model, config, callbacks})` returns a `Session` with `sendRealtimeInput` / `sendToolResponse` / `close`; `LiveServerMessage` carries `data`, `serverContent` (with `interrupted`, `inputTranscription`, `outputTranscription`), and `toolCall.functionCalls`. Adjust field names to whatever the installed types actually say — do not guess.
- [ ] **Step 3:** `pnpm lint` green. Commit: `git commit -am "feat: live voice assistant service on Gemini Live API"`

---

### Task 5: Live mode UI

**Files:**
- Create: `components/LiveAssistantBar.tsx`
- Modify: `components/LLMChatPanel.tsx` (mount the bar in the panel header area)

- [ ] **Step 1: Create `components/LiveAssistantBar.tsx`** — a compact strip rendered inside the chat panel. Full component:

```tsx
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { LiveAssistant } from '../services/liveAssistantService';
import { useSettings } from '../contexts/SettingsContext';

type Status = 'idle' | 'connecting' | 'live' | 'error';

const LiveAssistantBar: React.FC<{ onActivity: (line: string) => void }> = ({ onActivity }) => {
    const { settings } = useSettings();
    const liveRef = useRef<LiveAssistant | null>(null);
    const [status, setStatus] = useState<Status>('idle');
    const [speaking, setSpeaking] = useState(false);
    const [sharing, setSharing] = useState(false);
    const [caption, setCaption] = useState('');
    const [error, setError] = useState('');

    useEffect(() => () => { liveRef.current?.disconnect(); }, []); // unmount cleanup

    const stop = useCallback(() => {
        liveRef.current?.disconnect();
        liveRef.current = null;
        setStatus('idle'); setSpeaking(false); setSharing(false); setCaption('');
    }, []);

    const start = useCallback(async () => {
        setError('');
        const live = new LiveAssistant();
        liveRef.current = live;
        try {
            await live.connect(settings, {
                onStatus: (s, detail) => {
                    if (s === 'live') setStatus('live');
                    else if (s === 'connecting') setStatus('connecting');
                    else if (s === 'error') { setStatus('error'); setError(detail || 'Live session error'); }
                    else stop();
                },
                onCaption: (who, text) => setCaption(`${who === 'user' ? '>' : '::'} ${text}`),
                onToolActivity: onActivity,
                onSpeaking: setSpeaking,
                onScreenShare: setSharing,
            });
        } catch (e: any) {
            setStatus('error');
            setError(e?.message || 'Failed to start live session');
            live.disconnect();
            liveRef.current = null;
        }
    }, [settings, onActivity, stop]);

    const toggleShare = useCallback(async () => {
        if (!liveRef.current) return;
        try {
            if (sharing) liveRef.current.stopScreenShare();
            else await liveRef.current.startScreenShare();
        } catch { /* user cancelled the share picker */ }
    }, [sharing]);

    const isOn = status === 'live' || status === 'connecting';
    return (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-primary/20 font-sf-mono text-[10px] uppercase tracking-widest">
            <button
                onClick={isOn ? stop : start}
                className={`px-3 py-1 border transition-colors ${isOn ? 'border-error text-error hover:bg-error/10' : 'border-primary text-primary hover:bg-primary/10'}`}
            >
                {status === 'connecting' ? 'Linking…' : isOn ? '■ End Live' : '● Go Live'}
            </button>
            {status === 'live' && (
                <button
                    onClick={toggleShare}
                    className={`px-3 py-1 border transition-colors ${sharing ? 'border-warning text-warning' : 'border-primary/40 text-primary/60 hover:text-primary'}`}
                >
                    {sharing ? 'Screen: On' : 'Screen: Off'}
                </button>
            )}
            {status === 'live' && (
                <span className={`w-2 h-2 rounded-full ${speaking ? 'bg-primary animate-pulse' : 'bg-primary/30'}`} />
            )}
            <span className="truncate text-base-content/50 flex-1">{status === 'error' ? error : caption}</span>
        </div>
    );
};

export default LiveAssistantBar;
```

  Match class idiom to the panel you're mounting into — read the surrounding header JSX in `LLMChatPanel.tsx` first and reuse its exact border/text utility classes if they differ from the above.
- [ ] **Step 2: Mount it.** In `LLMChatPanel.tsx`, render `<LiveAssistantBar onActivity={(line) => setMessages(prev => [...prev, { role: 'system', content: line }])} />` directly below the panel's header/title area (find the header inside the `motion.div` panel at `:524+`), **only when `settings.activeLLM === 'gemini'` or unset** — live mode is Gemini-only; hide the bar for other engines rather than showing a dead button.
- [ ] **Step 3:** `pnpm lint` green. Commit: `git commit -am "feat: live voice mode UI in chat panel"`

---

## Edge cases a weaker model would miss

1. **Two AudioContexts at different rates.** Mic capture wants 16 kHz; playback is 24 kHz. One context cannot serve both. And browsers may *ignore* the requested `sampleRate` — that's why the mic path reads `micCtx.sampleRate` and resamples; deleting the resampler breaks Firefox and some Windows audio stacks.
2. **Autoplay policy.** `AudioContext` must be created/resumed within a user-gesture call chain — `connect()` is called from the Go Live click, and `playChunk` calls `resume()` defensively. Don't move context creation into module scope or a mount effect.
3. **`btoa` overflow.** `String.fromCharCode(...bigArray)` blows the call stack on large buffers — hence the chunked `toBase64`. Don't "simplify" it.
4. **Gemini role mapping.** `assistant` → `model`, and `system` messages must move into `systemInstruction` — the contents array rejects a `system` role.
5. **Function responses must echo the call.** In the text loop, the model turn containing `functionCall` parts must be appended to `contents` *before* the `functionResponse` parts, or Gemini rejects the mismatch. In the live path, `sendToolResponse` must include each `fc.id`. The echoed model turn must also be the model's *actual raw parts* (`chunk.candidates[0].content.parts`), not hand-rebuilt `{functionCall:{name,args}}` objects — 2.5+/3.x models attach a `thoughtSignature` to each functionCall part, and rebuilding drops it, which Gemini rejects with a 400 on the next round.
6. **Interruption ≠ end.** `serverContent.interrupted` means the user talked over the assistant: stop and clear every scheduled `AudioBufferSourceNode` and reset `nextStart`, but keep the session running. ADA gets this wrong; we must not.
7. **Screen share ends outside your UI.** The browser's own "Stop sharing" control fires the track's `ended` event — without that listener, the app keeps a dead 1 fps timer and a stale "Screen: On" state.
8. **Live sessions die on their own** (server-side time limits). `onclose` with `closedByUs === false` must reset the UI to idle so the user can reconnect — never auto-reconnect in a loop.
9. **Tool-call runaway.** `MAX_TOOL_ROUNDS = 8` exists because a confused model can ping-pong tools forever (ADA has no guard). Keep the cap in all three provider paths.
10. **Ollama models without tool support** return an error body containing "does not support tools" — that's the trigger for the automatic tag-protocol fallback, not a fatal error.
11. **Persisted message shape.** Tool events are plain `role:'system'` strings so `chatStorage` and session restore keep working; do not invent a new message type.
12. **Cleanup is the feature.** `disconnect()` must stop mic tracks (or the browser's recording indicator stays on forever), close both AudioContexts, clear the screen timer, and `session.close()` — and the unmount effect in the bar must call it. This repo has shipped multiple leak fixes; don't add a new source.
13. **No local echo.** Never connect the mic worklet node to `destination`.
14. **Live model constant.** The Live API model is a preview model name that Google renames/retires periodically (confirmed in production: `gemini-live-2.5-flash-preview` → 400 `models/... is not found ... bidiGenerateContent` as of 2026-07). It lives in ONE constant (`LIVE_MODEL`) precisely so it can be swapped when that happens. If connection fails with a model-not-found error, re-check https://ai.google.dev/gemini-api/docs/live-api/capabilities for the current model ID — don't guess.

## Acceptance criteria

**Phase 1 (any of these failing = not done):**
1. `pnpm lint` and `pnpm build` green.
2. Gemini engine: "*find prompts about dragons, then save one titled 'Test Dragon'*" → `⚙️`/`✅` activity lines appear, the model summarizes, and **the prompt is actually in the Prompt Library page** after.
3. Gemini engine: "*take me to the gallery*" → the active tab visibly switches.
4. Gemini engine: "*refine 'cyberpunk fox' for SDXL and open it in the refiner*" → `refine_prompt` then `send_to_refiner` fire, and the Refiner page opens with text pre-loaded.
5. Ollama engine (tool-capable model): test 3 works natively; with a non-tool model it still works via fallback.
6. Anthropic/OpenRouter engine: test 3 works via the `<action>` protocol.
7. Slash commands (`/gallery`, `/nav`, `/mcp list`) behave exactly as before; chat sessions persist and restore.

**Phase 2:**
8. Click **Go Live** (Gemini key set): browser asks for mic; status goes live. Say "*what can you do?*" → spoken reply is heard, captions stream in the bar.
9. Say "*open the gallery*" → the tab switches while the assistant confirms by voice (tool activity line appears in chat).
10. Interrupt it mid-sentence by speaking — playback stops within ~a second.
11. Screen: On → pick a window → ask "*what am I looking at?*" → a plausible description. Stop sharing via the **browser's** stop button → the bar's button flips to Screen: Off by itself.
12. End Live → browser tab's recording indicator disappears, no repeating errors in console, Go Live works again immediately.

## Out of scope

- TTS/voice for non-Gemini providers.
- Webcam input (screen share only; adding a camera source later is the same `sendRealtimeInput({video})` path).
- Destructive tools (delete gallery items/prompts, mutate settings) and a confirmation-UI framework for them.
- Ephemeral-token auth for the Live API.
- Wake-word activation, conversation memory beyond the session, and exposing MCP tools to the autonomous agent (the manual `/mcp` console remains).
- Settings UI for the live model constant.
