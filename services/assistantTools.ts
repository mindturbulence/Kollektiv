import type { LLMSettings, WildcardCategory } from '../types';
import { appControlService } from './appControlService';
import { appEventBus } from '../utils/eventBus';
import { addNote, loadNotes, updateNote, deleteNote } from '../utils/notesStorage';
import { loadGalleryItems } from '../utils/galleryStorage';
import { refineSinglePrompt, reconstructFromIntent, dissectPrompt, translateToEnglish, generateConstructorPreset, abstractImage } from './llmService';
import { crafterService } from './crafterService';
import { refinerPresetService } from './refinerPresetService';
import { PROMPT_DETAIL_LEVELS } from '../constants/modifiers';

export interface ToolContext {
    settings: LLMSettings;
    /** Attachments on the user's current chat turn (images), if any. */
    attachments?: { data: string; mimeType: string; fileName?: string }[];
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

// Must mirror ActiveTab in types.ts.
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
        name: 'abstract_image',
        description: "Reverse-engineer a generation prompt from an image the user attached to this chat message, same engine as the Abstractor page's Analyze button. Fails if no image is attached.",
        parameters: { type: 'object', properties: {} },
        execute: async (_args, ctx) => {
            const image = ctx.attachments?.find(a => a.mimeType.startsWith('image/'));
            if (!image) return 'Error: no image attached to this message. Ask the user to attach an image first.';
            const base64Data = image.data.includes('base64,') ? image.data.split('base64,')[1] : image.data;
            const result = await abstractImage(base64Data, PROMPT_DETAIL_LEVELS.MEDIUM, 'General', ctx.settings);
            return JSON.stringify(result);
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
        name: 'translate_prompt',
        description: 'Translate prompt text to English, same engine as the Translate button on the Crafter/Refiner pages. Returns the translated text.',
        parameters: {
            type: 'object',
            properties: { text: { type: 'string', description: 'Text to translate to English.' } },
            required: ['text'],
        },
        execute: ({ text }, ctx) => translateToEnglish(String(text), ctx.settings),
    },
    {
        name: 'rewrite_prompt',
        description: 'Rewrite/polish prompt text for clarity and visual detail, same engine as the Reconstruct button on the Crafter/Refiner pages. Returns the rewritten text.',
        parameters: {
            type: 'object',
            properties: { text: { type: 'string', description: 'Prompt text to rewrite.' } },
            required: ['text'],
        },
        execute: ({ text }, ctx) => reconstructFromIntent([String(text)], ctx.settings),
    },
    {
        name: 'clip_idea',
        description: "Save text to the app's Clipped Ideas panel (the in-app clipboard reachable from every page via the paperclip icon) — not the OS clipboard.",
        parameters: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'The prompt/idea text to clip.' },
                title: { type: 'string', description: 'Short title. Defaults to the first part of the prompt.' },
            },
            required: ['prompt'],
        },
        execute: ({ prompt, title }) => {
            appEventBus.emit('clipIdea', { prompt: String(prompt), title: title ? String(title) : undefined, lens: 'Assistant', source: 'Assistant' });
            return 'Clipped to the Clipped Ideas panel.';
        },
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
        name: 'save_refiner_preset',
        description: "Analyze a prompt into the Refiner's structured modifier format and save it as a named preset, same as the Refiner's Save as Preset button. Does not require the Refiner page to be open.",
        parameters: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Name for the saved preset.' },
                prompt: { type: 'string', description: 'The prompt text to analyze and save.' },
                target_model: { type: 'string', description: "Target generative model, e.g. 'SDXL', 'Flux', 'Midjourney'. Defaults to 'Flux'." },
            },
            required: ['name', 'prompt'],
        },
        execute: async ({ name, prompt, target_model }, ctx) => {
            const targetModel = String(target_model || 'Flux');
            const { prompt: dissectedPrompt, modifiers, constantModifier } = await dissectPrompt(String(prompt), ctx.settings, undefined, targetModel);
            const flatComponents: Record<string, string> = { prompt: dissectedPrompt, ...modifiers };
            if (constantModifier) flatComponents.constantModifier = constantModifier;
            const result = await generateConstructorPreset(flatComponents, ctx.settings);
            await refinerPresetService.savePreset({
                name: String(name),
                modifiers: result.modifiers,
                targetAIModel: targetModel,
                mediaMode: 'image',
                promptLength: PROMPT_DETAIL_LEVELS.MEDIUM,
                constantModifier: result.constantModifier,
                refineText: result.prompt,
            });
            return `Saved preset "${name}".`;
        },
    },
    {
        name: 'send_to_crafter',
        description: 'Open the Crafter page with the given idea text appended into its main prompt textarea so the user can work on it interactively (it can include __wildcard__ tokens).',
        parameters: {
            type: 'object',
            properties: { prompt: { type: 'string', description: 'Idea/prompt text to insert into the Crafter textarea.' } },
            required: ['prompt'],
        },
        execute: ({ prompt }) => {
            appEventBus.emit('sendToPromptsPage', { prompt: String(prompt), view: 'composer' });
            return 'Opened the Crafter with the text inserted into the textarea.';
        },
    },
    {
        name: 'list_wildcards',
        description: "List the user's Crafter __wildcard__ tokens (grouped by category) so you know real names to insert instead of guessing. Returns JSON.",
        parameters: {
            type: 'object',
            properties: { query: { type: 'string', description: 'Optional filter text to match against wildcard or category names.' } },
        },
        execute: async ({ query }) => {
            const { wildcardCategories } = await crafterService.loadWildcardsAndTemplates();
            const q = query ? String(query).toLowerCase() : undefined;
            const out: { category: string; wildcards: string[] }[] = [];
            const walk = (categories: WildcardCategory[], prefix: string) => {
                for (const cat of categories) {
                    const label = prefix ? `${prefix}/${cat.name}` : cat.name;
                    const names = cat.files
                        .map(f => f.name.replace(/\.(txt|yml|yaml)$/i, ''))
                        .filter(n => !q || n.toLowerCase().includes(q) || label.toLowerCase().includes(q));
                    if (names.length) out.push({ category: label, wildcards: names });
                    if (cat.subCategories?.length) walk(cat.subCategories, label);
                }
            };
            walk(wildcardCategories, '');
            return JSON.stringify(out.slice(0, 50));
        },
    },
    {
        name: 'generate_crafter_prompt',
        description: 'Resolve __wildcard__ tokens in the given idea and run it through the same AI polish pipeline as the Crafter page\'s Generate button. Returns the finished prompt text (does not modify the page — use send_to_crafter afterward to show it there).',
        parameters: {
            type: 'object',
            properties: { idea: { type: 'string', description: 'Idea/prompt text, may include __wildcard__ tokens (see list_wildcards).' } },
            required: ['idea'],
        },
        execute: async ({ idea }, ctx) => {
            const { wildcardCategories } = await crafterService.loadWildcardsAndTemplates();
            const resolved = crafterService.processCrafterPrompt(String(idea), wildcardCategories);
            return reconstructFromIntent([resolved], ctx.settings);
        },
    },
    {
        name: 'send_to_prompt_analyzer',
        description: 'Open the Prompt Analyzer page with the given prompt text pre-loaded so the user can dissect it interactively.',
        parameters: {
            type: 'object',
            properties: { prompt: { type: 'string', description: 'Prompt text to load into the Prompt Analyzer.' } },
            required: ['prompt'],
        },
        execute: ({ prompt }) => {
            appEventBus.emit('sendToPromptsPage', { prompt: String(prompt), view: 'prompt_analyzer' });
            return 'Opened the Prompt Analyzer with the prompt pre-loaded.';
        },
    },
    {
        name: 'analyze_prompt',
        description: "Dissect a prompt into its components (subject, style modifiers, constants) using the same engine as the Prompt Analyzer page. Returns a JSON breakdown in chat — does not open or populate the page (use send_to_prompt_analyzer for that).",
        parameters: {
            type: 'object',
            properties: { prompt: { type: 'string', description: 'The prompt text to dissect.' } },
            required: ['prompt'],
        },
        execute: async ({ prompt }, ctx) => {
            const result = await dissectPrompt(String(prompt), ctx.settings);
            return JSON.stringify(result);
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
            const safe = String(filename).replace(/[\\\/:*?"<>|]/g, '_').replace(/^\.+/, '').trim();
            if (!safe) return 'Error: invalid filename.';
            await fileSystemManager.saveFile(`assistant/${safe}`, new Blob([String(content)], { type: 'text/plain' }));
            appEventBus.emit('assistantFilesChanged');
            return `Saved to assistant/${safe} in the vault — visible in the Notes panel's FILES tab, downloadable from there.`;
        },
    },
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
export const fallbackProtocolPrompt = (persona: string) => `${persona} You can control the app with tools.
To call a tool, output EXACTLY one block in this format and nothing after it:
<action>{"tool": "<tool_name>", "args": { ... }}</action>
The system will reply with the result; then continue helping the user. Available tools:
${ASSISTANT_TOOLS.map(t => `- ${t.name}: ${t.description} Args schema: ${JSON.stringify(t.parameters.properties)}`).join('\n')}
Only use a tool when it helps. Otherwise answer normally.`;
