import type { LLMSettings } from '../types';
import { getGeminiClient } from './geminiService';
import { executeAssistantTool, geminiToolDeclarations, ollamaToolDeclarations, fallbackProtocolPrompt, ASSISTANT_TOOLS } from './assistantTools';
import { streamChat } from './llmService';
import { parseActionBlock, visibleText } from './assistantProtocol';
import { getOllamaConfig } from './ollamaService';
import { memoryPromptBlock } from '../utils/memoryStorage';
import { loadMcpAssistantTools } from './mcpAssistantTools';

export type ChatMsg = { role: 'user' | 'assistant' | 'system'; content: string; attachments?: { data: string; mimeType: string; fileName?: string }[] };

export type AssistantEvent =
    | { type: 'text'; chunk: string }
    | { type: 'tool_start'; name: string; args: Record<string, any> }
    | { type: 'tool_result'; name: string; result: string }
    | { type: 'turn_end' };   // one assistant message finished (a new one may start after tools)

const MAX_TOOL_ROUNDS = 8;

// Per-page function reference so the assistant can accurately answer "can you do X"
// and pick the right tool, instead of guessing or staying silent on UI-only features.
// Keep in sync with services/assistantTools.ts and Plan-ai-assistant.md's tool list.
const WORKSPACE_CAPABILITIES = `Workspace pages and what's on them. Call the named tool when asked; for "UI-only" items there is no tool — tell the user which button to click instead of guessing or pretending to do it.
- Refiner: Improve = refine_prompt, Rewrite = rewrite_prompt, Translate = translate_prompt, Save as Preset = save_refiner_preset, load text here = send_to_refiner, direct image/video generation = generate_image (handles Imagen/Veo/NanoBanana — no longer UI-only). UI-only: Reset, Export Code, JSON export/download, Arena mode (dual-model compare).
- Crafter: Generate (resolve wildcards + AI polish) = generate_crafter_prompt, list real wildcard names = list_wildcards, Translate = translate_prompt, Rewrite/Reconstruct = rewrite_prompt, Clip to Clipped Ideas = clip_idea, load text here = send_to_crafter. UI-only: Save Result (local scratch list), Save/Apply/Delete Template, Import wildcard file (touches disk).
- Prompt Analyzer: Analyze/dissect a prompt = analyze_prompt, load text here = send_to_prompt_analyzer. UI-only: Map to Refiner (approximate it by chaining analyze_prompt then send_to_refiner), select from library.
- Abstractor (Media Analyzer): reverse-engineer a prompt from an image the user attached to the chat = abstract_image (fails if no image is attached — it cannot read files off disk, only chat attachments). UI-only: Read Metadata (needs the original file, not available from chat), Save Workflow, Copy Raw.
- YouTube Search & Play: search YouTube = youtube_search, play a YouTube video = play_media.
- Spotify (requires Spotify connected in Settings > Integrations > Spotify): list your playlists = spotify_list_playlists, get playlist tracks = spotify_get_playlist_tracks, play track/playlist = play_media.
- Obsidian Second Brain (requires Obsidian running + MCP server connected in Settings > MCP): search vault = obsidian_search_notes, read a note = obsidian_get_note, list folder = obsidian_list_notes, list all tags = obsidian_list_tags, create/overwrite note = obsidian_write_note, append to note/section = obsidian_append_to_note, surgical edit (heading/block/frontmatter) = obsidian_patch_note, find-and-replace = obsidian_replace_in_note, manage frontmatter key = obsidian_manage_frontmatter, add/remove/list tags = obsidian_manage_tags, delete note = obsidian_delete_note, open note in Obsidian app = obsidian_open_in_ui.
Elsewhere: long-term memory = remember/list_memories/forget, manage your Notes panel = save_note/list_notes/update_note/delete_note, save a text/markdown file into the vault (shows in Notes panel > Files) = save_file, show a web page to the user in the in-app viewer = open_web_page, play a YouTube video or Spotify track in the in-app media player = play_media, search the live web = web_search, read a web page yourself = fetch_url, search/save the prompt library = search_prompts/save_prompt, search the gallery = search_gallery, get/delete gallery items = get_gallery_item/delete_gallery_item, save content to gallery = save_to_gallery, search cheatsheets = search_cheatsheets, change settings = update_settings, navigate the app = navigate, browse discovery collections = list_discovery_collections/search_discovery_prompts.
- Gmail (requires Google Identity connected in Settings > App > Storage): read emails = read_gmail (list/search/read), send emails = send_gmail, trash/delete emails = delete_gmail.
- MCP Servers (Settings > MCP Servers): see what's configured = list_mcp_servers, turn a Predefined server (Firecrawl, Brave Search, Playwright) on/off = toggle_mcp_server — all Predefined servers are off by default, only enable one when the user asks.
- Your own tool list (Settings > Integrations > Assistant > Tools tab): a live, searchable, categorized view of every native tool plus tools from any enabled MCP server — no tool call needed, this is a UI-only reference. Point the user there if they ask what you can do or want to browse your capabilities; use list_mcp_servers instead if they specifically want MCP server status.`;

/** Builds the assistant's system prompt from the configured persona
 * (Settings > Integrations > Assistant). Used by every provider path,
 * text and live voice alike, so persona stays consistent everywhere.
 *
 * Master Role Concept (Settings > AI Engine) is the app-wide directive already
 * injected into every other LLM call (refine/enhance/reconstruct — see
 * llmService.ts's masterRolePrompt handling); it was never reaching the
 * assistant's own identity, so its "applied to every LLM request" description
 * was false for the one place users talk to the AI directly. Prepending it
 * here, same convention as llmService.ts (prepend, blank-line separated). */
export const buildSystemIdentity = (settings: LLMSettings): string => {
    const name = settings.assistantName?.trim() || 'the Kollektiv assistant';
    const lines = [
        `You are ${name}, embedded in a local-first creative suite for prompt engineering and media management. Be concise. Use your tools to act on the app when the user asks for something the tools can do; report what you did.`,
    ];
    if (settings.assistantLanguage?.trim()) {
        lines.push(`Always respond in ${settings.assistantLanguage.trim()}, regardless of what language the user writes or speaks in, unless they explicitly ask you to switch.`);
    }
    if (settings.assistantPersonality?.trim()) {
        lines.push(settings.assistantPersonality.trim());
    }
    const identity = lines.join(' ');
    const withMasterRole = settings.masterRolePrompt?.trim()
        ? `${settings.masterRolePrompt.trim()}\n\n${identity}`
        : identity;
    const memoryBlock = memoryPromptBlock();
    return `${withMasterRole}\n\n${WORKSPACE_CAPABILITIES}${memoryBlock ? `\n\n${memoryBlock}` : ''}`;
};

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
        case 'ollama':
        case 'ollama_cloud':
            yield* runOllamaTurn(messages, settings);
            return;
        case 'openrouter':
            yield* runOpenRouterTurn(messages, settings);
            return;
        default:
            yield* runFallbackTurn(messages, settings);
    }
}

const latestAttachments = (messages: ChatMsg[]) =>
    [...messages].reverse().find(m => m.role === 'user' && m.attachments?.length)?.attachments;

// ---------------- Gemini: native function calling ----------------

async function* runGeminiTurn(messages: ChatMsg[], settings: LLMSettings): AsyncGenerator<AssistantEvent> {
    const mcpTools = await loadMcpAssistantTools(settings);
    const allTools = mcpTools.length ? [...ASSISTANT_TOOLS, ...mcpTools] : ASSISTANT_TOOLS;
    const ai = getGeminiClient(settings);
    const model = settings.llmModel || 'gemini-3.5-flash';
    const systemText = [buildSystemIdentity(settings), ...messages.filter(m => m.role === 'system').map(m => m.content)].join('\n\n');
    const attachments = latestAttachments(messages);
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
                tools: [{ functionDeclarations: geminiToolDeclarations(allTools) as any }],
            },
        });

        const calls: { id?: string; name: string; args: Record<string, any> }[] = [];
        // Accumulate the model's raw parts (not hand-rebuilt ones) so any
        // thoughtSignature Gemini attaches to a functionCall part survives
        // being echoed back next round — dropping it makes 2.5+/3.x models
        // reject the follow-up request with a 400.
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
            const result = await executeAssistantTool(c.name, c.args, { settings, attachments }, mcpTools);
            yield { type: 'tool_result', name: c.name, result };
            responseParts.push({ functionResponse: { name: c.name, response: { result } } });
        }
        contents.push({ role: 'user', parts: responseParts });
    }
    yield { type: 'text', chunk: '\n[Assistant]: tool-call limit reached for this turn.' };
    yield { type: 'turn_end' };
}

// ---------------- Fallback: <action> text protocol over streamChat ----------------

async function* runFallbackTurn(messages: ChatMsg[], settings: LLMSettings): AsyncGenerator<AssistantEvent> {
    const mcpTools = await loadMcpAssistantTools(settings);
    const allTools = mcpTools.length ? [...ASSISTANT_TOOLS, ...mcpTools] : ASSISTANT_TOOLS;
    const provider = getAssistantProvider(settings);
    // streamChat dispatches on activeLLM, so force it to the assistant's brain.
    // masterRolePrompt is blanked because buildSystemIdentity already prepends
    // it — streamChat would otherwise inject it a second time.
    const chatSettings: LLMSettings = { ...settings, activeLLM: provider as LLMSettings['activeLLM'], masterRolePrompt: '' };
    const attachments = latestAttachments(messages);
    const convo: ChatMsg[] = [
        { role: 'system', content: fallbackProtocolPrompt(buildSystemIdentity(settings), allTools) },
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
        const result = await executeAssistantTool(action.tool, action.args, { settings, attachments }, mcpTools);
        yield { type: 'tool_result', name: action.tool, result };
        convo.push({ role: 'assistant', content: full });
        convo.push({ role: 'user', content: `[System — result of ${action.tool}]: ${result}\nContinue helping the user based on this result.` });
    }
    yield { type: 'text', chunk: '\n[Assistant]: tool-call limit reached for this turn.' };
    yield { type: 'turn_end' };
}

// ---------------- Ollama: native /api/chat tool calling ----------------

async function* runOllamaTurn(messages: ChatMsg[], settings: LLMSettings): AsyncGenerator<AssistantEvent> {
    const mcpTools = await loadMcpAssistantTools(settings);
    const allTools = mcpTools.length ? [...ASSISTANT_TOOLS, ...mcpTools] : ASSISTANT_TOOLS;
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
            body: JSON.stringify({ model: config.model, messages: convo, stream: true, tools: ollamaToolDeclarations(allTools) }),
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
            const result = await executeAssistantTool(c.name, c.args, { settings, attachments }, mcpTools);
            yield { type: 'tool_result', name: c.name, result };
            convo.push({ role: 'tool', content: result });
        }
    }
    yield { type: 'text', chunk: '\n[Assistant]: tool-call limit reached for this turn.' };
    yield { type: 'turn_end' };
}

// ---------------- OpenRouter: OpenAI-style streaming tool calling ----------------
// ollamaToolDeclarations() already emits the OpenAI tools wire format, so it
// doubles as the OpenRouter declaration set.

async function* runOpenRouterTurn(messages: ChatMsg[], settings: LLMSettings): AsyncGenerator<AssistantEvent> {
    const mcpTools = await loadMcpAssistantTools(settings);
    const allTools = mcpTools.length ? [...ASSISTANT_TOOLS, ...mcpTools] : ASSISTANT_TOOLS;
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
            body: JSON.stringify({ model, messages: convo, stream: true, tools: ollamaToolDeclarations(allTools) }),
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
            const result = await executeAssistantTool(c.name, args, { settings, attachments }, mcpTools);
            yield { type: 'tool_result', name: c.name, result };
            convo.push({ role: 'tool', tool_call_id: c.id, content: result });
        }
    }
    yield { type: 'text', chunk: '\n[Assistant]: tool-call limit reached for this turn.' };
    yield { type: 'turn_end' };
}
