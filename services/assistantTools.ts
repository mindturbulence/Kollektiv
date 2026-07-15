import type { LLMSettings, WildcardCategory } from '../types';
import { appControlService } from './appControlService';
import { appEventBus } from '../utils/eventBus';
import { browserControlService } from './browserControlService';
import { addNote, loadNotes, updateNote, deleteNote } from '../utils/notesStorage';
import { addMemory, loadMemories as loadMemoryEntries, deleteMemory } from '../utils/memoryStorage';
import { loadGalleryItems, addItemToGallery, deleteItemFromGallery } from '../utils/galleryStorage';
import { loadLLMSettings, saveLLMSettings } from '../utils/settingsStorage';
import { refineSinglePrompt, reconstructFromIntent, dissectPrompt, translateToEnglish, generateConstructorPreset, abstractImage, generateWithImagen, generateWithNanoBanana, generateWithVeo } from './llmService';
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

    // ─── Phase 3: Semantic tools for top journeys (call state layer directly) ──

    {
        name: 'generate_image',
        description: 'Generate an image or video directly using Google Imagen, Nano Banana, or Veo. Requires a Gemini API key. The generated media is saved to the user gallery automatically — you can navigate to the gallery afterward. Returns gallery item info. Models: "imagen" (images, fast), "nano_banana" (images with reference support), "veo" (video, slow ~2min).',
        parameters: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'The generation prompt describing what to create.' },
                model: { type: 'string', description: 'Generation engine.', enum: ['imagen', 'nano_banana', 'veo'] },
                aspect_ratio: { type: 'string', description: 'Aspect ratio for the output. Default: "1:1" for imagen/nano_banana, "16:9" for veo.' },
            },
            required: ['prompt', 'model'],
        },
        execute: async ({ prompt, model, aspect_ratio }, ctx) => {
            const apiKey = ctx.settings.geminiApiKey || process.env.GEMINI_API_KEY;
            if (!apiKey) return 'Error: Gemini API key not configured. User must add it in Settings > Integrations > Gemini.';
            try {
                const m = String(model || 'imagen').toLowerCase();
                const ratio = aspect_ratio ? String(aspect_ratio) : (m === 'veo' ? '16:9' : '1:1');
                let dataUrl: string;
                if (m === 'imagen') {
                    dataUrl = await generateWithImagen(String(prompt), ratio, ctx.settings);
                } else if (m === 'nano_banana') {
                    dataUrl = await generateWithNanoBanana(String(prompt), [], ratio, ctx.settings);
                } else if (m === 'veo') {
                    dataUrl = await generateWithVeo(String(prompt), undefined, ratio, ctx.settings);
                } else {
                    return `Error: unknown model "${m}". Valid: imagen, nano_banana, veo.`;
                }
                // Save to gallery so it persists and is findable.
                const item = await addItemToGallery('image', [dataUrl], ['AI Generation'], undefined, undefined, [], undefined, String(prompt));
                return JSON.stringify({
                    success: true,
                    galleryId: item.id,
                    title: item.title,
                    prompt: String(prompt),
                    model: m,
                    note: `Saved to gallery as "${item.title}" (id: ${item.id}). Navigate to the gallery page to view it — or ask the user to open it.`,
                });
            } catch (e: any) {
                return `Error generating image: ${e?.message || e}`;
            }
        },
    },
    {
        name: 'update_settings',
        description: 'Update one or more app settings (theme, model, persona, dashboard preferences, etc.). Does NOT require screen share or page navigation. The change persists immediately. Returns the updated settings snapshot. Safe settings: activeLLM, llmModel, masterRolePrompt, assistantName, assistantPersonality, assistantLanguage, assistantVoice, darkTheme, lightTheme, fontSize, musicEnabled, musicYoutubeUrl, dashboardVideoUrl, isDashboardVideoEnabled, dashboardBackgroundType, idleScreenType, isIdleEnabled, idleTimeoutMinutes, convertImageToJpgLocal, convertImageToJpgDrive, jpgCompressionQuality.',
        parameters: {
            type: 'object',
            properties: {
                changes: {
                    type: 'object',
                    description: 'JSON object with the settings keys and new values to change. See tool description for the full list of safe settings.',
                },
            },
            required: ['changes'],
        },
        execute: ({ changes }) => {
            const SAFE_KEYS = new Set([
                'activeLLM', 'llmModel', 'masterRolePrompt',
                'assistantName', 'assistantPersonality', 'assistantLanguage', 'assistantVoice',
                'darkTheme', 'lightTheme', 'fontSize',
                'musicEnabled', 'musicYoutubeUrl',
                'dashboardVideoUrl', 'isDashboardVideoEnabled', 'dashboardBackgroundType',
                'idleScreenType', 'isIdleEnabled', 'idleTimeoutMinutes',
                'convertImageToJpgLocal', 'convertImageToJpgDrive', 'jpgCompressionQuality',
            ]);
            if (!changes || typeof changes !== 'object') return 'Error: changes must be a JSON object.';
            const current = loadLLMSettings();
            const applied: string[] = [];
            const skipped: string[] = [];
            for (const [key, value] of Object.entries(changes)) {
                if (SAFE_KEYS.has(key) && key in current) {
                    (current as any)[key] = value;
                    applied.push(key);
                } else {
                    skipped.push(key);
                }
            }
            if (applied.length === 0) return 'Error: no valid/safe settings to update. Use one of: ' + [...SAFE_KEYS].join(', ');
            saveLLMSettings(current);
            // Notify the React context so the UI picks up the change immediately.
            if (typeof window !== 'undefined') window.dispatchEvent(new Event('settings-updated'));
            const msg = `Updated: ${applied.join(', ')}.` + (skipped.length ? ` Skipped (unsafe or unknown): ${skipped.join(', ')}.` : '');
            return msg;
        },
    },
    {
        name: 'get_gallery_item',
        description: 'Get the full details of a specific gallery item by its id. Returns the item\'s title, type, urls, prompt, notes, tags, and creation date as JSON. Use search_gallery first to find the id.',
        parameters: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'The gallery item id (obtained from search_gallery).' },
            },
            required: ['id'],
        },
        execute: async ({ id }) => {
            const items = await loadGalleryItems();
            const item = items.find(i => i.id === String(id));
            if (!item) return `Error: no gallery item with id "${id}". Use search_gallery to find current items.`;
            return JSON.stringify({
                id: item.id,
                title: item.title,
                type: item.type,
                prompt: item.prompt,
                notes: item.notes,
                tags: item.tags,
                createdAt: new Date(item.createdAt).toISOString(),
                urls: item.urls,
                sources: item.sources,
            });
        },
    },
    {
        name: 'delete_gallery_item',
        description: 'Delete a gallery item by its id (obtained from search_gallery). The saved media file is also removed from the vault if possible. Cannot be undone.',
        parameters: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'The gallery item id (obtained from search_gallery).' },
            },
            required: ['id'],
        },
        execute: async ({ id }) => {
            try {
                await deleteItemFromGallery(String(id));
                return `Gallery item "${id}" deleted.`;
            } catch (e: any) {
                return `Error deleting gallery item: ${e?.message || e}`;
            }
        },
    },
    {
        name: 'save_to_gallery',
        description: 'Save a note, prompt, or external media reference to the user gallery as a text/image entry. Use for saving generated prompts, results, or reference material the user wants to keep. Returns the new gallery item id.',
        parameters: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Display title for the gallery entry.' },
                content: { type: 'string', description: 'The text content to save. For prompts, pass the full prompt text. For image references, pass a data URL or URL to the image.' },
                type: { type: 'string', description: 'Content type.', enum: ['image', 'video', 'text'] },
                tags: { type: 'string', description: 'Optional comma-separated tags.' },
                prompt: { type: 'string', description: 'Optional generation prompt associated with this content.' },
            },
            required: ['title', 'content'],
        },
        execute: async ({ title, content, type, tags, prompt }) => {
            const contentType = String(type || 'text');
            const tagList = tags ? String(tags).split(',').map(t => t.trim()).filter(Boolean) : [];
            const p = prompt ? String(prompt) : '';
            try {
                if (contentType === 'image') {
                    const item = await addItemToGallery('image', [String(content)], ['Assistant'], undefined, String(title), tagList, undefined, p);
                    return `Saved image "${item.title}" to gallery (id: ${item.id}).`;
                } else if (contentType === 'video') {
                    const item = await addItemToGallery('video', [String(content)], ['Assistant'], undefined, String(title), tagList, undefined, p);
                    return `Saved video "${item.title}" to gallery (id: ${item.id}).`;
                } else {
                    // Save a text-only note to the gallery (stored as an item with empty urls).
                    const item = await addItemToGallery('image', [], ['Assistant'], undefined, String(title), tagList, String(content), p);
                    return `Saved note "${item.title}" to gallery (id: ${item.id}).`;
                }
            } catch (e: any) {
                return `Error saving to gallery: ${e?.message || e}`;
            }
        },
    },

    // ─── Browser Control Tools (require screen sharing + permission) ───────────

    {
        name: 'browser_click_element',
        description: 'Click a specific UI control by the id shown in brackets by browser_read_structure (e.g. "[generate-btn] <button>..." → pass "generate-btn"). This is the PRIMARY way to click things in the app — it targets the real element directly, so it is exact and never misses. Always call browser_read_structure first to get current ids. Use browser_click (coordinates) only as a fallback for canvas/image content that has no id. Requires screen sharing + control permission.',
        parameters: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'The data-ai-id shown in brackets by browser_read_structure, e.g. "generate-btn".' },
            },
            required: ['id'],
        },
        execute: ({ id }) => browserControlService.clickElement(String(id)),
    },
    {
        name: 'browser_select_option',
        description: 'Pick an option in a native dropdown (<select>) by its data-ai-id and the option\'s visible text. Regular clicks cannot open a native dropdown\'s popup, so use this instead of browser_click_element for <select> elements. Requires screen sharing + control permission.',
        parameters: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'The data-ai-id of the <select> element, from browser_read_structure.' },
                option: { type: 'string', description: 'The visible text of the option to select, exactly as shown.' },
            },
            required: ['id', 'option'],
        },
        execute: ({ id, option }) => browserControlService.selectOption(String(id), String(option)),
    },
    {
        name: 'browser_click',
        description: 'FALLBACK ONLY — for clicking inside canvas/image content that has no data-ai-id (e.g. the image editor canvas). For any normal UI control, use browser_click_element instead — it is exact, this is not. Provide nx/ny as absolute pixel coordinates within the screen image you see (scaled to max 1024px on the long side). Requires screen sharing + control permission.',
        parameters: {
            type: 'object',
            properties: {
                nx: { type: 'number', description: 'X pixel coordinate within the screen image you see (0–1024 range).' },
                ny: { type: 'number', description: 'Y pixel coordinate within the screen image you see (0–1024 range).' },
            },
            required: ['nx', 'ny'],
        },
        execute: ({ nx, ny }) => browserControlService.click(Number(nx), Number(ny)),
    },
    {
        name: 'browser_double_click',
        description: 'FALLBACK ONLY — same as browser_click, for canvas/image content without a data-ai-id. Pixel coordinates within the screen image you see (max 1024px wide).',
        parameters: {
            type: 'object',
            properties: {
                nx: { type: 'number', description: 'X pixel coordinate within the screen image you see.' },
                ny: { type: 'number', description: 'Y pixel coordinate within the screen image you see.' },
            },
            required: ['nx', 'ny'],
        },
        execute: ({ nx, ny }) => browserControlService.doubleClick(Number(nx), Number(ny)),
    },
    {
        name: 'browser_type',
        description: 'Type text into the input field that currently has focus. Make sure you click the input field first with browser_click. Requires screen sharing + control permission.',
        parameters: {
            type: 'object',
            properties: {
                text: { type: 'string', description: 'The text to type into the focused field.' },
            },
            required: ['text'],
        },
        execute: ({ text }) => browserControlService.type(String(text)),
    },
    {
        name: 'browser_press_key',
        description: 'Press a named key (Enter, Tab, Escape, Backspace, ArrowUp/Down/Left/Right, etc.) on the element that currently has focus. Requires screen sharing + control permission.',
        parameters: {
            type: 'object',
            properties: {
                key: { type: 'string', description: 'Key name. Valid: Enter, Tab, Escape, Backspace, Delete, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Space, Home, End, PageUp, PageDown, F1–F12, Shift, Control, Alt, CapsLock.' },
            },
            required: ['key'],
        },
        execute: ({ key }) => browserControlService.pressKey(String(key)),
    },
    {
        name: 'browser_scroll',
        description: 'Scroll the page by a small or large amount. dy = 0.5 scrolls down half a page. dy = -0.3 scrolls up a bit. dx scrolls sideways. Requires screen sharing + control permission.',
        parameters: {
            type: 'object',
            properties: {
                dx: { type: 'number', description: 'Horizontal scroll factor (negative = left, positive = right, 0.3 = ~300px).' },
                dy: { type: 'number', description: 'Vertical scroll factor (negative = up, positive = down, 0.5 = ~500px).' },
            },
        },
        execute: ({ dx, dy }) => browserControlService.scroll(Number(dx || 0), Number(dy || 0)),
    },
    {
        name: 'browser_scroll_to',
        description: 'Scroll to a specific position on the page. frac = 0 is the top, frac = 1 is the bottom. Requires screen sharing + control permission.',
        parameters: {
            type: 'object',
            properties: {
                frac: { type: 'number', description: 'Scroll position (0 = top, 0.5 = middle, 1 = bottom).' },
            },
            required: ['frac'],
        },
        execute: ({ frac }) => browserControlService.scrollTo(Number(frac)),
    },
    {
        name: 'browser_read_page',
        description: 'Read all visible text content from the current page. Returns the page title, URL, and up to 5000 characters of body text. Use this when you need to know what the page says. Requires screen sharing + control permission.',
        parameters: { type: 'object', properties: {} },
        execute: () => browserControlService.readVisibleContent(),
    },
    {
        name: 'browser_read_structure',
        description: 'Scan the page and list interactive elements visible on screen (buttons, links, inputs, headings) with their tag and text. Elements with an id (shown in brackets, e.g. "[generate-btn]") can be clicked exactly with browser_click_element or browser_select_option — call this FIRST to get those ids, then act on them. Elements without an id have no exact click target; only fall back to browser_click coordinates for canvas/image content. Requires screen sharing + control permission.',
        parameters: { type: 'object', properties: {} },
        execute: () => browserControlService.readPageStructure(),
    },
    {
        name: 'browser_navigate',
        description: 'Navigate the browser to a different URL. Requires screen sharing + control permission.',
        parameters: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'Full absolute URL (http/https) to navigate to.' },
            },
            required: ['url'],
        },
        execute: ({ url }) => browserControlService.navigate(String(url)),
    },
];

export const executeAssistantTool = async (name: string, args: Record<string, any>, ctx: ToolContext, extraTools: AssistantTool[] = []): Promise<string> => {
    const tool = [...ASSISTANT_TOOLS, ...extraTools].find(t => t.name === name);
    if (!tool) return `Error: unknown tool "${name}". Available: ${[...ASSISTANT_TOOLS, ...extraTools].map(t => t.name).join(', ')}`;
    try {
        return String(await tool.execute(args || {}, ctx));
    } catch (e: any) {
        // Feed the failure back to the model so it can self-correct (ADA pattern, kept).
        return `Error executing ${name}: ${e?.message || e}`;
    }
};

/** Gemini functionDeclarations (uppercase Type strings). */
export const geminiToolDeclarations = (tools: AssistantTool[] = ASSISTANT_TOOLS) =>
    tools.map(t => {
        const propEntries = Object.entries(t.parameters.properties);
        const decl: any = { name: t.name, description: t.description };
        // Gemini rejects function declarations whose OBJECT parameter has an empty
        // `properties` map — a malformed declaration can poison the whole tool
        // array. For parameterless tools, omit `parameters` entirely instead.
        if (propEntries.length) {
            decl.parameters = {
                type: 'OBJECT',
                properties: Object.fromEntries(
                    propEntries.map(([k, v]) => [k, { ...v, type: v.type.toUpperCase() }])
                ),
                ...(t.parameters.required?.length ? { required: t.parameters.required } : {}),
            };
        }
        return decl;
    });

/** Ollama /api/chat tools (OpenAI-style). */
export const ollamaToolDeclarations = (tools: AssistantTool[] = ASSISTANT_TOOLS) =>
    tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

/** System-prompt tool protocol for providers without native function calling. */
export const fallbackProtocolPrompt = (persona: string, tools: AssistantTool[] = ASSISTANT_TOOLS) => `${persona} You can control the app with tools.
To call a tool, output EXACTLY one block in this format and nothing after it:
<action>{"tool": "<tool_name>", "args": { ... }}</action>
The system will reply with the result; then continue helping the user. Available tools:
${tools.map(t => `- ${t.name}: ${t.description} Args schema: ${JSON.stringify(t.parameters.properties)}`).join('\n')}
Only use a tool when it helps. Otherwise answer normally.`;
