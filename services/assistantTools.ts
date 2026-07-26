import type { WildcardCategory, WebResult } from '../types';
import { appControlService } from './appControlService';
import { appEventBus } from '../utils/eventBus';
import { getOperator } from './browserOperatorResolver';
import { addNote, loadNotes, updateNote, deleteNote } from '../utils/notesStorage';
import { addMemory, loadMemories as loadMemoryEntries, deleteMemory } from '../utils/memoryStorage';
// Obsidian imports removed — all obsidian tools live in services/tools/obsidianTools.ts
import { loadGalleryItems, addItemToGallery, deleteItemFromGallery, loadCategories, loadPinnedItemIds } from '../utils/galleryStorage';
import { computeGalleryStats } from '../utils/galleryAnalytics';
import { loadLLMSettings, saveLLMSettings } from '../utils/settingsStorage';
import { refineSinglePrompt, reconstructFromIntent, dissectPrompt, translateToEnglish, generateConstructorPreset, abstractImage, generateWithImagen, generateWithNanoBanana, generateWithVeo, enhancePromptStream, cleanLLMResponse } from './llmService';
import { crafterService } from './crafterService';
import { refinerPresetService } from './refinerPresetService';
import { PROMPT_DETAIL_LEVELS } from '../constants/modifiers';
import { MCP_PRESETS, findMcpPresetEntry, upsertMcpPresetEntry } from '../constants/mcpPresets';
import { mcpService } from './mcpService';

// Re-export ToolContext + AssistantTool from the shared module so callers
// that import them from this file still work. New code should import from
// 'services/tools/types' directly.
export type { AssistantTool, ToolContext } from './tools/types';
import type { AssistantTool, ToolContext } from './tools/types';
import { capabilityRegistry, type ExecutionKind } from './capabilityRegistry';
import { createExecutionEngine } from './executionEngine';
import { plan } from './planner';
import { classifyIntent, findCapabilityForIntent } from './intentRouter';
import { browserTools } from './tools/browserTools';
import { obsidianTools } from './tools/obsidianTools';
import { gmailTools } from './tools/gmailTools';
import { spotifyTools } from './tools/spotifyTools';
import { tensorArtTools } from './tools/tensorArtTools';
import { researchTools } from './tools/researchTools';
import { graphTools } from './tools/graphTools';
import { rssTools } from './tools/rssTools';
import { githubTools } from './tools/githubTools';
import { exaTools } from './tools/exaTools';
import { redditTools } from './tools/redditTools';
import { youtubeTranscriptTools } from './tools/youtubeTranscriptTools';
import { twitterTools } from './tools/twitterTools';

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
        description: 'Search the live web for current, real-world information. Free, no API key needed by default (scrapes multiple engines: DuckDuckGo, Brave, Exa if configured). Returns a JSON object with {results: [{title, url, snippet, source}], enginesUsed: string[], engineFailures: [...], fetchedContent: [{url, title, content, excerpt}]}. The most relevant result(s) are AUTOMATICALLY saved to the Assistant Notes panel for the user — you do not need to call send_to_web_panel yourself. Use `fetch_content: true` when you need full article text (also gives the user richer panel cards with byline/image); otherwise only snippets are fetched and used for the panel. Falls back to Google Search grounding (needs Gemini API key) only if free search returns empty. Google is LAST RESORT.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'What to search for.' },
                engines: { type: 'array', items: { type: 'string', enum: ['duckduckgo', 'brave', 'exa'] }, description: 'Optional: specific search engines to use. Defaults to duckduckgo and brave.' },
                fetch_content: { type: 'boolean', description: 'If true, fetches full page content (Markdown) for the top 3 result URLs. Use when snippets alone are insufficient to answer the query.' },
            },
            required: ['query'],
        },
        execute: async ({ query, engines, fetch_content }, ctx) => {
            // Emit loading event
            appEventBus.emit('webSearchLoading');
            try {
                const body: any = { query: String(query) };
                if (Array.isArray(engines) && engines.length > 0) {
                    body.engines = engines;
                }
                if (fetch_content === true) {
                    body.fetchContent = true;
                }
                const res = await fetch('/api/web-search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data.results) && data.results.length > 0) {
                        // Auto-save the most relevant results to the panel — rich (Defuddle-extracted,
                        // author/published/site/image) when full content was fetched, otherwise the
                        // top 3 snippets, so the panel is never empty and never depends on the model
                        // remembering to call send_to_web_panel.
                        const panelResults: WebResult[] = [];
                        if (Array.isArray(data.fetchedContent) && data.fetchedContent.length > 0) {
                            for (const fc of data.fetchedContent) {
                                if (!fc.success || !fc.content) continue;
                                panelResults.push({
                                    title: fc.title || fc.url,
                                    url: fc.url,
                                    markdown: fc.content,
                                    source: 'fetch',
                                    engine: 'web-search',
                                    author: fc.author,
                                    published: fc.published,
                                    site: fc.site,
                                    image: fc.image,
                                    timestamp: Date.now(),
                                });
                            }
                        } else {
                            for (const r of data.results.slice(0, 3)) {
                                panelResults.push({
                                    title: r.title || r.url,
                                    url: r.url,
                                    markdown: r.snippet || '',
                                    source: 'search',
                                    engine: r.source,
                                    timestamp: Date.now(),
                                });
                            }
                        }
                        if (panelResults.length > 0) appEventBus.emit('webSearchResults', panelResults);
                        // Return raw data to assistant for its own reasoning/answer
                        return JSON.stringify(data);
                    }
                }
            } catch {
                // Network/server error on the free path — fall through to Gemini below.
            }
            if (ctx.settings.geminiApiKey || process.env.GEMINI_API_KEY) {
                const { googleSearchGemini } = await import('./geminiService');
                const geminiResult = await googleSearchGemini(String(query), ctx.settings);
                try {
                    const parsed = JSON.parse(geminiResult);
                    const sources = Array.isArray(parsed.sources) ? parsed.sources.join('\n') : '';
                    appEventBus.emit('webSearchResults', [{
                        title: `Web search: ${query}`,
                        url: parsed.sources?.[0]?.split(' — ')[1] || '',
                        markdown: `${parsed.answer || ''}${sources ? `\n\n**Sources:**\n${sources}` : ''}`,
                        source: 'search',
                        engine: 'google-gemini',
                        timestamp: Date.now(),
                    }]);
                } catch {
                    // Unexpected shape — skip the panel card, model still gets the raw result.
                }
                return geminiResult;
            }
            appEventBus.emit('webSearchError', 'Web search returned no results and no Gemini API key is configured for the Google fallback (Settings > Integrations > Gemini).');
            return 'Error: web search returned no results and no Gemini API key is configured for the Google fallback (Settings > Integrations > Gemini).';
        },
    },
    {
        name: 'get_weather',
        description: 'Get the current weather for a city. Returns temperature, conditions, wind, humidity as formatted text. No API key needed — uses wttr.in.',
        parameters: {
            type: 'object',
            properties: {
                city: {
                    type: 'string',
                    description: 'City name (e.g. "London", "Tokyo", "New York"). Optionally add country code for accuracy ("London,UK").',
                },
            },
            required: ['city'],
        },
        execute: async ({ city }) => {
            try {
                const res = await fetch(`https://wttr.in/${encodeURIComponent(String(city))}?format=%C+%t+%w+%h`);
                if (!res.ok) return `Could not retrieve weather for ${city}.`;
                const text = await res.text();
                return `Weather in ${city}: ${text.trim()}`;
            } catch (e: any) {
                return `Weather lookup failed for ${city}: ${e?.message || e}. Verify network connectivity.`;
            }
        },
    },
    {
        name: 'fetch_url',
        description: 'Fetch a web page by absolute URL and return its readable text as markdown. The page is AUTOMATICALLY saved to the Assistant Notes panel for the user — you do not need to call send_to_web_panel yourself. Use when you need to read a specific page deeply.',
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
            const title = doc.querySelector('title')?.textContent?.trim() || doc.querySelector('h1')?.textContent?.trim() || parsed.hostname;
            const text = (doc.body?.textContent || raw).replace(/\s{3,}/g, '\n').trim();
            const markdown = text.slice(0, 8000) || 'Error: page contained no readable text.';
            if (text) {
                appEventBus.emit('webSearchResults', [{ title, url: parsed.href, markdown, source: 'fetch', timestamp: Date.now() }]);
            }
            return markdown;
        },
    },
    {
        name: 'scrape_url',
        description: 'Fetch a URL and return its full content as clean Markdown (readability extraction, ~50k chars), plus any detected byline (author/published/site). The page is AUTOMATICALLY saved to the Assistant Notes panel for the user — you do not need to call send_to_web_panel yourself. Use for documentation, articles, blog posts — any page where you need the full text. For JS-heavy SPAs, use scrape_url_playwright instead.',
        parameters: {
            type: 'object',
            properties: { url: { type: 'string', description: 'Absolute http(s) URL to scrape.' } },
            required: ['url'],
        },
        execute: async ({ url }) => {
            try {
                const res = await fetch('/api/scrape-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: String(url), mode: 'simple' }),
                });
                if (!res.ok) return `Error: scrape failed (${res.status}).`;
                const data = await res.json();
                if (data.success && data.content) {
                    appEventBus.emit('webSearchResults', [{
                        title: data.title || url, url: data.url || url, markdown: data.content, source: 'scrape',
                        author: data.author, published: data.published, site: data.site, image: data.image,
                        timestamp: Date.now(),
                    }]);
                    const byline = [data.author && `Author: ${data.author}`, data.published && `Published: ${data.published}`, data.site && `Site: ${data.site}`].filter(Boolean).join(' | ');
                    return `# ${data.title}\n${byline ? `${byline}\n` : ''}\n${data.content}`.slice(0, 50_000);
                }
                return `Scraped ${url} but no readable content found.${data.error ? ` (${data.error})` : ''}`;
            } catch (e: any) {
                return `Error scraping ${url}: ${e?.message || e}`;
            }
        },
    },
    {
        name: 'scrape_url_playwright',
        description: 'Fetch a URL using a headless browser (Playwright) and return the full rendered content as Markdown, plus any detected byline (author/published/site). The page is AUTOMATICALLY saved to the Assistant Notes panel for the user — you do not need to call send_to_web_panel yourself. Use for JavaScript-heavy SPAs (React/Vue/Angular dashboards, modern doc portals) where scrape_url returns empty content. Slower (~3-5s) but renders JS-rendered pages correctly.',
        parameters: {
            type: 'object',
            properties: { url: { type: 'string', description: 'Absolute http(s) URL to scrape with a headless browser.' } },
            required: ['url'],
        },
        execute: async ({ url }) => {
            try {
                const res = await fetch('/api/scrape-url-playwright', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: String(url) }),
                });
                if (!res.ok) return `Error: Playwright scrape failed (${res.status}).`;
                const data = await res.json();
                if (data.success && data.content) {
                    appEventBus.emit('webSearchResults', [{
                        title: data.title || url, url: data.url || url, markdown: data.content, source: 'playwright',
                        author: data.author, published: data.published, site: data.site, image: data.image,
                        timestamp: Date.now(),
                    }]);
                    const byline = [data.author && `Author: ${data.author}`, data.published && `Published: ${data.published}`, data.site && `Site: ${data.site}`].filter(Boolean).join(' | ');
                    return `# ${data.title}\n${byline ? `${byline}\n` : ''}\n${data.content}`.slice(0, 50_000);
                }
                return `Scraped ${url} with Playwright but no readable content found.${data.error ? ` (${data.error})` : ''}`;
            } catch (e: any) {
                return `Error scraping ${url} with Playwright: ${e?.message || e}`;
            }
        },
    },
    {
        name: 'open_web_page',
        description: 'Fetch a web page and return its readable content as markdown. The page is AUTOMATICALLY saved to the Assistant Notes panel for the user — you do not need to call send_to_web_panel yourself. Use when the user asks to read, fetch, or show the content of a specific web page or a web_search source.',
        parameters: {
            type: 'object',
            properties: { url: { type: 'string', description: 'Absolute http(s) URL to fetch.' } },
            required: ['url'],
        },
        execute: async ({ url }) => {
            try { new URL(String(url)); } catch { return 'Error: invalid URL.'; }
            // Fetch the page content
            const parsed = new URL(String(url));
            const res = await fetch(`/proxy-remote${parsed.pathname}${parsed.search}`, {
                headers: { 'x-target-url': parsed.origin },
            });
            if (!res.ok) return `Error: fetch failed (${res.status} ${res.statusText}).`;
            const raw = await res.text();
            const doc = new DOMParser().parseFromString(raw, 'text/html');
            doc.querySelectorAll('script, style, noscript, svg').forEach(el => el.remove());
            const title = doc.querySelector('title')?.textContent?.trim() || doc.querySelector('h1')?.textContent?.trim() || parsed.hostname;
            const text = (doc.body?.textContent || raw).replace(/\s{3,}/g, '\n').trim();
            const markdown = text.slice(0, 8000) || 'Error: page contained no readable text.';
            if (text) {
                appEventBus.emit('webSearchResults', [{ title, url: parsed.href, markdown, source: 'fetch', timestamp: Date.now() }]);
            }
            return markdown;
        },
    },
    {
        name: 'send_to_web_panel',
        description: 'OPTIONAL: post your OWN additional markdown to the Assistant Notes panel — e.g. a combined synthesis across several sources you already read. Search/fetch/scrape tools save their results to the panel automatically, so you only need this when you want to add something extra beyond what was already auto-saved.',
        parameters: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Title for the result card.' },
                url: { type: 'string', description: 'Source URL.' },
                markdown: { type: 'string', description: 'Full synthesized markdown content (summary, key points, analysis, context).' },
                source: { type: 'string', description: 'Tool that produced the content (search, fetch, scrape, playwright).', enum: ['search', 'fetch', 'scrape', 'playwright'] },
                author: { type: 'string', description: 'Article author/byline, if known.' },
                published: { type: 'string', description: 'Publish date, if known.' },
                site: { type: 'string', description: 'Site/publication name, if known.' },
            },
            required: ['title', 'url', 'markdown', 'source'],
        },
        execute: async ({ title, url, markdown, source, author, published, site }) => {
            appEventBus.emit('webSearchResults', [{
                title,
                url,
                markdown,
                source,
                author,
                published,
                site,
                timestamp: Date.now(),
            }]);
            return `Sent synthesized result to Web panel.`;
        },
    },
    {
        name: 'play_media',
        description: 'Open a YouTube video or Spotify track/playlist in the in-app Media Panel so the USER can watch or listen. Use when the user asks to play a song, show a video, or play media from a link.',
        parameters: {
            type: 'object',
            properties: { url: { type: 'string', description: 'The full YouTube or Spotify URL to play.' } },
            required: ['url'],
        },
        execute: ({ url }) => {
            try { new URL(String(url)); } catch { return 'Error: invalid URL.'; }
            const urlStr = String(url);
            appEventBus.emit('openMediaPanel', { url: urlStr });
            appEventBus.emit('playVideo', { url: urlStr });
            return `Opened ${url} in the media panel — playing now.`;
        },
    },
    {
        name: 'youtube_search',
        description: 'Search YouTube for videos and return a list of results with title, channel, video ID, and URL. Use when the user asks to find or search for a video.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query for YouTube.' },
                maxResults: { type: 'number', description: 'Maximum number of results (default 5, max 10).' },
            },
            required: ['query'],
        },
        execute: async ({ query, maxResults = 5 }) => {
            const { appControlService } = await import('./appControlService');
            const apiKey = appControlService.getYouTubeApiKey?.();
            if (!apiKey) {
                return 'Error: YouTube API key not configured. Go to Settings > Integrations > YouTube to add your API key.';
            }
            const q = encodeURIComponent(String(query));
            const max = Math.min(Math.max(1, Math.floor(maxResults)), 10);
            const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${q}&maxResults=${max}&key=${apiKey}`);
            if (!res.ok) return `Error: YouTube search failed (${res.status}).`;
            const data = await res.json();
            const items = data.items || [];
            return JSON.stringify(items.map((item: any) => ({
                title: item.snippet.title,
                channel: item.snippet.channelTitle,
                videoId: item.id.videoId,
                url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
                thumbnail: item.snippet.thumbnails.medium?.url,
            })));
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
                return 'Error: no vault folder is connected &mdash; the user must connect one via the app setup (Welcome screen or Settings).';
            }
            const safe = String(filename).replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+/, '').trim();
            if (!safe) return 'Error: invalid filename.';
            await fileSystemManager.saveFile(`assistant/${safe}`, new Blob([String(content)], { type: 'text/plain' }));
            appEventBus.emit('assistantFilesChanged');
            return `Saved to assistant/${safe} in the vault &mdash; visible in the Notes panel's FILES tab, downloadable from there.`;
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
        execute: async ({ title, content }) => {
            const n = await addNote(title ? String(title) : '', String(content), 'assistant');
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
        execute: async ({ query }) => {
            const q = query ? String(query).toLowerCase() : undefined;
            const notes = await loadNotes();
            const filtered = notes.filter(n => !q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
            return JSON.stringify(filtered.slice(0, 30).map(n => ({ id: n.id, title: n.title, content: n.content, updatedAt: n.updatedAt })));
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
        execute: async ({ id, title, content }) => {
            const patch: { title?: string; content?: string } = {};
            if (title !== undefined) patch.title = String(title);
            if (content !== undefined) patch.content = String(content);
            const n = await updateNote(String(id), patch);
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
        execute: async ({ id }) => ((await deleteNote(String(id))) ? 'Note deleted.' : `Error: no note with id ${id}.`),
    },
    {
        name: 'remember',
        description: "Permanently remember a short fact about the user or their preferences (e.g. 'prefers SDXL', 'works in German'). Optionally categorize it so the assistant can retrieve more relevant memories later. It will be available in every future session, chat and voice. Use when the user says 'remember ...' or states a durable preference.",
        parameters: {
            type: 'object',
            properties: {
                fact: { type: 'string', description: 'One concise fact to remember.' },
                category: {
                    type: 'string',
                    description: 'Optional category to organise the memory.',
                    enum: ['user_preference', 'style_pattern', 'prompt_formula', 'workflow_step', 'general'],
                },
                tags: {
                    type: 'string',
                    description: 'Optional comma-separated tags for searchability.',
                },
            },
            required: ['fact'],
        },
        execute: async ({ fact, category, tags }) => {
            const tagList = tags ? String(tags).split(',').map((t: string) => t.trim()).filter(Boolean) : undefined;
            const cat = category && ['user_preference', 'style_pattern', 'prompt_formula', 'workflow_step', 'general'].includes(String(category))
                ? String(category) as any
                : undefined;
            const result = await addMemory(String(fact), { category: cat, tags: tagList });
            return result ? 'Remembered.' : 'Already remembered (or empty fact).';
        },
    },
    {
        name: 'list_memories',
        description: 'List everything you permanently remember about the user. Returns JSON with ids, categories, and tags (needed for forget).',
        parameters: { type: 'object', properties: {} },
        execute: async () => {
            const memories = await loadMemoryEntries();
            return JSON.stringify(memories.map(m => ({
                id: m.id,
                fact: m.fact,
                category: m.category,
                tags: m.tags,
            })));
        },
    },
    {
        name: 'forget',
        description: 'Delete a remembered fact by id (get ids from list_memories first). Use when the user asks you to forget something.',
        parameters: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Memory id.' } },
            required: ['id'],
        },
        execute: async ({ id }) => ((await deleteMemory(String(id))) ? 'Forgotten.' : `Error: no memory with id ${id}.`),
    },
    {
        name: 'search_memories',
        description: 'Search your persistent memories by text and/or filter by category. Returns JSON with ids and categories (use forget with an id to delete one). Use when you need to find a specific fact without listing everything.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Text to search for in memory facts and tags.' },
                category: {
                    type: 'string',
                    description: 'Optional category to narrow results.',
                    enum: ['user_preference', 'style_pattern', 'prompt_formula', 'workflow_step', 'general'],
                },
            },
        },
        execute: async ({ query, category }) => {
            const memories = await loadMemoryEntries();
            let results = memories;
            if (query) {
                const q = String(query);
                results = results.filter(
                    m => m.fact.toLowerCase().includes(q.toLowerCase()) ||
                        m.tags.some((t: string) => t.toLowerCase().includes(q.toLowerCase()))
                );
            }
            if (category && ['user_preference', 'style_pattern', 'prompt_formula', 'workflow_step', 'general'].includes(String(category))) {
                results = results.filter(m => m.category === category);
            }
            return JSON.stringify(results.map(m => ({
                id: m.id,
                fact: m.fact,
                category: m.category,
                tags: m.tags,
            })));
        },
    },

    {
        name: 'knowledge_lifecycle_promote',
        description: 'Move a knowledge item (note, memory, vault file) to a different lifecycle stage folder in the vault. Stages: inbox (raw uncategorized), projects (active work), output (completed items), wiki (permanent reference). Use search_memories / list_notes / search_gallery / list_vault_tools first to find the item id and kind.',
        parameters: {
            type: 'object',
            properties: {
                kind: {
                    type: 'string',
                    description: 'Type of knowledge item. The item must be indexed in the knowledge service (search_memories / list_notes / vault search). Gallery items are stored in IndexedDB and cannot be promoted through lifecycle stages.',
                    enum: ['memory', 'note', 'vault_note', 'prompt'],
                },
                id: { type: 'string', description: 'The item id (obtained from search_memories, list_notes, or vault search).' },
                target_stage: {
                    type: 'string',
                    description: 'Target lifecycle stage folder. inbox = raw items awaiting triage, projects = active work, output = completed/publishable, wiki = permanent reference documentation.',
                    enum: ['inbox', 'projects', 'output', 'wiki'],
                },
            },
            required: ['kind', 'id', 'target_stage'],
        },
        execute: async ({ kind, id, target_stage }) => {
            const { knowledgeService } = await import('./knowledgeService');
            const { knowledgeLifecycle } = await import('./knowledgeLifecycle');

            // Find the ref in the knowledge index
            const refs = knowledgeService.list([kind]);
            const ref = refs.find((r) => r.id === id);
            if (!ref) return `Error: no ${kind} item with id "${id}". Use search_memories / list_notes / search_gallery to find current items.`;

            // Determine current lifecycle stage from vault path
            const currentStage = ref.sourcePath ? knowledgeLifecycle.stageFromPath(ref.sourcePath) : null;
            const fromStage = currentStage || 'inbox';

            // Load the item's content
            const content = await knowledgeService.recall(ref);
            if (!content) return `Error: could not load content for item "${ref.title}".`;

            // Promote to the target lifecycle stage
            const result = await knowledgeLifecycle.promote(
                ref.sourcePath,
                fromStage,
                target_stage,
                { kind: ref.kind, id: ref.id, title: ref.title, tags: ref.tags, tier: ref.tier },
                content,
            );

            if (!result) return `Item "${ref.title}" is already in the "${target_stage}" stage.`;

            // Update the ref's source path
            ref.sourcePath = result.newPath;

            // If promoting to wiki or output, also promote the tier to 'knowledge'
            if (target_stage === 'wiki' || target_stage === 'output') {
                await knowledgeService.promote({
                    ref,
                    targetTier: 'knowledge',
                    reason: `Promoted to ${target_stage} lifecycle stage`,
                });
            }

            return `Moved "${ref.title}" from ${fromStage} → ${target_stage}. New vault path: ${result.newPath}.`;
        },
    },

    ...obsidianTools,

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
        const mediaType = m === 'veo' ? 'video' : 'image';
        const item = await addItemToGallery(mediaType, [dataUrl], ['AI Generation'], undefined, undefined, [], undefined, String(prompt));
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
        name: 'generate_and_ingest',
        description: 'Full generate loop: take a raw prompt, refine it through the Kollektiv engine, generate media via Imagen/Banana/Veo, and ingest the result into the gallery — all in one call. Returns the gallery item info. Requires a Gemini API key. Equivalent to clicking IMPROVE → RENDER → AUTO-INGEST in the Refiner UI.',
        parameters: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'The raw prompt or idea to refine, generate from, and save.' },
                model: { type: 'string', description: 'Generation engine.', enum: ['imagen', 'nano_banana', 'veo'] },
                aspect_ratio: { type: 'string', description: 'Aspect ratio. Default: "1:1" for imagen/nano_banana, "16:9" for veo.' },
                constant_modifier: { type: 'string', description: 'Tokens the model must always include in the prompt.' },
                skip_refine: { type: 'boolean', description: 'If true, skip the AI refinement step and generate directly from the raw prompt.' },
            },
            required: ['prompt', 'model'],
        },
        execute: async ({ prompt, model, aspect_ratio, constant_modifier, skip_refine }, ctx) => {
            const apiKey = ctx.settings.geminiApiKey || process.env.GEMINI_API_KEY;
            if (!apiKey) return 'Error: Gemini API key not configured. User must add it in Settings > Integrations > Gemini.';
            try {
                const m = String(model || 'imagen').toLowerCase();
                const ratio = aspect_ratio ? String(aspect_ratio) : (m === 'veo' ? '16:9' : '1:1');
                const cm = constant_modifier ? String(constant_modifier) : '';
                const rawPrompt = String(prompt);

                // 1. Refine
                let refinedPrompt = rawPrompt;
                if (!skip_refine && rawPrompt.trim()) {
                    let fullText = '';
                    const stream = enhancePromptStream(rawPrompt, cm, 'MEDIUM', m, {}, ctx.settings, [], '');
                    for await (const chunk of stream) fullText += chunk;
                    if (fullText.trim()) {
                        if (fullText.includes('---PROMPT_BREAKDOWN---')) {
                            refinedPrompt = fullText.split('---PROMPT_BREAKDOWN---')[0].trim();
                        } else {
                            refinedPrompt = cleanLLMResponse(fullText);
                        }
                    }
                }

                // 2. Generate
                let dataUrl: string;
                if (m === 'imagen') {
                    dataUrl = await generateWithImagen(refinedPrompt, ratio, ctx.settings);
                } else if (m === 'nano_banana') {
                    dataUrl = await generateWithNanoBanana(refinedPrompt, [], ratio, ctx.settings);
                } else if (m === 'veo') {
                    dataUrl = await generateWithVeo(refinedPrompt, undefined, ratio, ctx.settings);
                } else {
                    return `Error: unknown model "${m}". Valid: imagen, nano_banana, veo.`;
                }

                // 3. Ingest
                const mediaType = m === 'veo' ? 'video' : 'image';
                const item = await addItemToGallery(mediaType, [dataUrl], ['Generate Loop'], undefined, undefined, [], undefined, refinedPrompt);

                return JSON.stringify({
                    success: true,
                    galleryId: item.id,
                    title: item.title,
                    refinedPrompt,
                    model: m,
                    note: `Generated and saved to gallery as "${item.title}" (id: ${item.id}). Navigate to the gallery to view.`,
                });
            } catch (e: any) {
                return `Error in generate loop: ${e?.message || e}`;
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
        name: 'list_mcp_servers',
        description: 'List MCP servers: the Predefined catalog (Firecrawl, Brave Search, Playwright — see Settings > MCP Servers > Predefined) with whether each is currently configured/enabled, plus any Custom MCP servers the user added. Use before toggle_mcp_server to see current state.',
        parameters: { type: 'object', properties: {} },
        execute: () => {
            const settings = loadLLMSettings();
            const servers = settings.mcpServers || [];
            const predefined = MCP_PRESETS.map(p => {
                const entry = findMcpPresetEntry(servers, p.id);
                return `- ${p.id} (${p.name}): ${p.description} — ${entry ? (entry.enabled ? 'ENABLED' : 'configured but disabled') : 'not configured'}${p.needsApiKey && !entry?.url ? ', needs an API key' : ''}`;
            }).join('\n');
            const custom = servers.filter(s => !s.presetId);
            const customList = custom.length
                ? custom.map(s => `- ${s.name} (${s.url}) — ${s.enabled ? 'ENABLED' : 'disabled'}`).join('\n')
                : '(none)';
            return `Predefined:\n${predefined}\n\nCustom:\n${customList}`;
        },
    },
    {
        name: 'toggle_mcp_server',
        description: `Turn a Predefined MCP server on or off (default: all off). Valid preset ids: ${MCP_PRESETS.map(p => p.id).join(', ')}. Firecrawl is hosted and needs an api_key to enable (ask the user for one if they don't have it configured yet, or point them to Settings > MCP Servers > Predefined). Brave Search and Playwright run as a local process the user must launch themselves — enabling here only tells the assistant it's allowed to use it; if the ping right after enabling fails, tell the user to run the shown local command.`,
        parameters: {
            type: 'object',
            properties: {
                preset: { type: 'string', description: 'Preset id.', enum: MCP_PRESETS.map(p => p.id) },
                enabled: { type: 'boolean', description: 'true to turn on, false to turn off.' },
                api_key: { type: 'string', description: "API key, only meaningful for presets that need one (see list_mcp_servers). Not required when disabling, or when re-enabling a preset that's already configured." },
            },
            required: ['preset', 'enabled'],
        },
        execute: async ({ preset: presetId, enabled, api_key }) => {
            const preset = MCP_PRESETS.find(p => p.id === presetId);
            if (!preset) return `Error: unknown preset "${presetId}". Valid ids: ${MCP_PRESETS.map(p => p.id).join(', ')}.`;

            const settings = loadLLMSettings();
            const servers = settings.mcpServers || [];
            const existing = findMcpPresetEntry(servers, preset.id);

            const patch: Record<string, any> = { enabled: !!enabled };
            if (enabled && preset.buildUrl) {
                const key = (typeof api_key === 'string' && api_key.trim()) || undefined;
                if (key) {
                    patch.url = preset.buildUrl(key);
                } else if (!existing?.url) {
                    return `Error: ${preset.name} needs an API key to enable. Ask the user for one, or pass it as api_key.`;
                }
            }

            const { servers: nextServers, entry } = upsertMcpPresetEntry(servers, preset, patch);
            saveLLMSettings({ ...settings, mcpServers: nextServers });
            if (typeof window !== 'undefined') window.dispatchEvent(new Event('settings-updated'));

            if (!enabled) return `${preset.name} disabled.`;
            if (!entry.url) return `${preset.name} enabled, but no connection URL is set yet.`;

            try {
                const tools = await mcpService.listTools(entry.url);
                return `${preset.name} enabled and reachable — ${tools.length} tools available.`;
            } catch {
                const hint = preset.launchCommand
                    ? ` It runs locally — tell the user to run: ${preset.launchCommand.replace('{apiKey}', 'their API key')}`
                    : '';
                return `${preset.name} enabled, but not reachable yet at ${entry.url}.${hint}`;
            }
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
    {
        name: 'gallery_stats',
        description: 'Get analytics and statistics about the full gallery. Returns JSON with total counts, tag frequency, category distribution, model usage breakdown, source distribution, generation timeline, and top prompt words. Useful before search_gallery to understand what\'s in the gallery.',
        parameters: { type: 'object', properties: {} },
        execute: async () => {
            const [items, categories, pinnedIds] = await Promise.all([
                loadGalleryItems(),
                loadCategories(),
                loadPinnedItemIds(),
            ]);
            const stats = computeGalleryStats(items, categories, pinnedIds);
            return JSON.stringify({
                totalItems: stats.totalItems,
                imageCount: stats.imageCount,
                videoCount: stats.videoCount,
                pinnedCount: stats.pinnedCount,
                topTags: stats.tagFrequency.slice(0, 15),
                topCategories: stats.categoryDistribution.slice(0, 10),
                topSources: stats.sourceDistribution.slice(0, 10),
                topModels: stats.modelUsage.slice(0, 10),
                timeline: stats.timeline,
                topPromptWords: stats.promptWordFrequency.slice(0, 10),
            });
        },
    },

    ...browserTools,

    // Gmail, Spotify, Tensor Art, and Research tools have been moved to dedicated modules.
    ...gmailTools,
    ...spotifyTools,
    ...tensorArtTools,
    ...researchTools,
    ...graphTools,
    ...rssTools,
    ...githubTools,
    ...exaTools,
    ...redditTools,
    ...youtubeTranscriptTools,
    ...twitterTools,

    // ─── MCP Architecture: 5 capability introspection/execution tools ────

    {
        name: 'capability_search',
        description: 'Search the capability registry by keyword to find what capabilities the system can perform. Returns matching capabilities as JSON with id, name, description, tags, and health status.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search keyword (case-insensitive). Matches against capability id, name, description, and tags.' },
            },
            required: ['query'],
        },
        execute: async ({ query }) => {
            const results = capabilityRegistry.search(String(query));
            if (results.length === 0) return 'No capabilities matched your query.';
            return JSON.stringify(results.map(c => ({
                id: c.id,
                name: c.name,
                description: c.description,
                kind: c.execution.kind,
                tags: c.tags,
                healthy: c.healthy,
            })));
        },
    },
    {
        name: 'capability_describe',
        description: 'Get the full contract of a registered capability by its exact id. Use capability_search first to find the id. Returns the complete capability schema including input/output types, execution strategy, permissions, and dependencies.',
        parameters: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Exact capability id (obtained from capability_search).' },
            },
            required: ['id'],
        },
        execute: async ({ id }) => {
            const cap = capabilityRegistry.get(String(id));
            if (!cap) return `Error: no capability with id "${id}". Use capability_search to find valid capabilities.`;
            return JSON.stringify(cap, null, 2);
        },
    },
    {
        name: 'capability_execute',
        description: 'Execute a named capability through the Planning + Execution Engine pipeline. The system will classify your intent, plan the steps, and run them with automatic error handling and retries. Returns the execution result. Use when you need to run a capability with the full architectural pipeline.',
        parameters: {
            type: 'object',
            properties: {
                capability: { type: 'string', description: 'The capability id to execute (e.g. "refine_prompt", "analyze_prompt", "search_memories").' },
                input: { type: 'string', description: 'User-facing request text that describes what to do. This is classified into an intent, then planned, then executed.' },
            },
            required: ['capability', 'input'],
        },
        execute: async ({ capability, input }) => {
            const cap = capabilityRegistry.get(String(capability));
            if (!cap) return `Error: capability "${capability}" not found. Use capability_search to find valid capabilities.`;

            const intent = classifyIntent(String(input));
            const matchingCap = findCapabilityForIntent(intent.category);

            const executionPlan = plan({
                ...intent,
                capabilityId: String(capability),
            });

            const engine = createExecutionEngine();
            const validation = engine.validate(executionPlan);
            if (validation.errors.length > 0) {
                return `Error: plan validation failed — ${validation.errors.join('; ')}`;
            }

            const result = await engine.execute(executionPlan);
            return JSON.stringify({
                planId: result.planId,
                status: result.status,
                steps: result.steps.map(s => ({
                    kind: s.step.kind,
                    description: s.step.description,
                    status: s.status,
                    duration: `${s.duration}ms`,
                    error: s.error,
                })),
                totalDuration: `${result.totalDuration}ms`,
                matchingCapability: matchingCap,
            }, null, 2);
        },
    },
    {
        name: 'capability_list',
        description: 'List all registered capabilities, optionally filtered by execution kind (local, provider, assistant-tool, mcp). Returns JSON with id, name, description, kind, and health.',
        parameters: {
            type: 'object',
            properties: {
                kind: {
                    type: 'string',
                    description: 'Optional filter: only show capabilities of this execution kind.',
                    enum: ['local', 'provider', 'assistant-tool', 'mcp'],
                },
            },
        },
        execute: async ({ kind }) => {
            const caps = kind
                ? capabilityRegistry.list(kind as ExecutionKind)
                : capabilityRegistry.list();
            if (caps.length === 0) return 'No capabilities registered.';
            return JSON.stringify(caps.map(c => ({
                id: c.id,
                name: c.name,
                description: c.description,
                kind: c.execution.kind,
                healthy: c.healthy,
                tags: c.tags,
            })));
        },
    },
    {
        name: 'capability_health',
        description: 'Check the health status of all registered capabilities. Returns a JSON summary showing which capabilities are healthy, which are degraded or down, and any health messages. Use when troubleshooting why a capability is unavailable.',
        parameters: { type: 'object', properties: {} },
        execute: async () => {
            const caps = capabilityRegistry.list();
            const healthy = caps.filter(c => c.healthy !== false);
            const degraded = caps.filter(c => c.healthy === false);
            const unknown = caps.filter(c => c.healthy === undefined);
            return JSON.stringify({
                total: caps.length,
                healthy: healthy.length,
                degraded: degraded.length,
                unknown: unknown.length,
                details: caps.map(c => ({
                    id: c.id,
                    healthy: c.healthy ?? 'unknown',
                    message: c.healthMessage,
                })),
            }, null, 2);
        },
    },
];

export const executeAssistantTool = async (name: string, args: Record<string, any>, ctx: ToolContext, extraTools: AssistantTool[] = []): Promise<string> => {
    // Check control permission for browser tools.
    if (name.startsWith('browser_') && !getOperator().operator.permissionGranted) {
        appEventBus.emit('assistantFeedback', {
            message: 'Assistant tried to control your browser, but control permission isn\'t granted — click the cursor icon in the header. If it\'s not visible, share your screen first (monitor icon), then grant control (cursor icon).',
            isError: true,
        });
        return `Error: Browser control permission not granted. Please share your screen and grant browser control permission (click the cursor icon in the header).`;
    }
    const tool = [...ASSISTANT_TOOLS, ...extraTools].find(t => t.name === name);
    if (!tool) return `Error: unknown tool "${name}". Available: ${[...ASSISTANT_TOOLS, ...extraTools].map(t => t.name).join(', ')}`;
    try {
        return String(await tool.execute(args || {}, ctx));
    } catch (e: any) {
        // Feed the failure back to the model so it can self-correct (ADA pattern, kept).
        return `Error executing ${name}: ${e?.message || e}`;
    }
};

/** Recursively convert one internal (lowercase-type) schema node to Gemini's
 *  Schema shape. A union node (`anyOf`, e.g. an MCP tool's discriminated-union
 *  param) has no top-level `type` — only recurse into `type`/`items`/`properties`
 *  when they're actually present, so those nodes pass through as `anyOf` alone. */
const toGeminiSchema = (v: Record<string, any>): Record<string, any> => {
    if (Array.isArray(v.anyOf)) {
        const node: Record<string, any> = { anyOf: v.anyOf.map(toGeminiSchema) };
        if (v.description) node.description = v.description;
        return node;
    }
    const node: Record<string, any> = { ...v, type: String(v.type || 'string').toUpperCase() };
    if (node.items) node.items = toGeminiSchema(node.items);
    if (node.properties) {
        node.properties = Object.fromEntries(
            Object.entries(node.properties as Record<string, any>).map(([k, sub]) => [k, toGeminiSchema(sub)])
        );
    }
    return node;
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
                    propEntries.map(([k, v]) => [k, toGeminiSchema(v)])
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
