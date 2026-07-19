import type { LLMSettings, WildcardCategory } from '../types';
import { appControlService } from './appControlService';
import { appEventBus } from '../utils/eventBus';
import { browserControlService } from './browserControlService';
import { externalBrowserService } from './externalBrowserService';
import { addNote, loadNotes, updateNote, deleteNote } from '../utils/notesStorage';
import { addMemory, loadMemories as loadMemoryEntries, deleteMemory } from '../utils/memoryStorage';
import { loadGalleryItems, addItemToGallery, deleteItemFromGallery } from '../utils/galleryStorage';
import { loadLLMSettings, saveLLMSettings } from '../utils/settingsStorage';
import { refineSinglePrompt, reconstructFromIntent, dissectPrompt, translateToEnglish, generateConstructorPreset, abstractImage, generateWithImagen, generateWithNanoBanana, generateWithVeo } from './llmService';
import { isGoogleAuthValid } from '../utils/googleAuth';
import { crafterService } from './crafterService';
import { refinerPresetService } from './refinerPresetService';
import { PROMPT_DETAIL_LEVELS } from '../constants/modifiers';
import { listTools, createTask, pollTask } from './tensorartService';

// Spotify token refresh helper
async function refreshSpotifyToken(): Promise<string | null> {
    const refreshToken = localStorage.getItem('spotify_refresh_token');
    const expiresAt = parseInt(localStorage.getItem('spotify_expires_at') || '0', 10);
    const clientId = (window as any).__SPOTIFY_CLIENT_ID || localStorage.getItem('spotify_client_id') || '';
    
    if (!refreshToken || !clientId) return null;
    
    // Check if token is still valid (with 30s buffer)
    if (Date.now() < expiresAt - 30_000) {
        return localStorage.getItem('spotify_access_token');
    }
    
    try {
        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
        });
        
        const res = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params,
        });
        
        if (!res.ok) {
            console.error('Spotify token refresh failed:', await res.text());
            return null;
        }
        
        const data = await res.json();
        localStorage.setItem('spotify_access_token', data.access_token);
        if (data.refresh_token) localStorage.setItem('spotify_refresh_token', data.refresh_token);
        localStorage.setItem('spotify_expires_at', String(Date.now() + data.expires_in * 1000));
        
        return data.access_token;
    } catch (err) {
        console.error('Spotify token refresh error:', err);
        return null;
    }
}

// Helper to get valid Spotify access token (auto-refreshes if needed)
async function getSpotifyAccessToken(): Promise<string | null> {
    const token = localStorage.getItem('spotify_access_token');
    const expiresAt = parseInt(localStorage.getItem('spotify_expires_at') || '0', 10);
    
    // Token still valid (with 30s buffer)
    if (token && Date.now() < expiresAt - 30_000) {
        return token;
    }
    
    // Try to refresh
    return refreshSpotifyToken();
}

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
        properties: Record<string, Record<string, any>>;
        required?: string[];
    };
    execute: (args: Record<string, any>, ctx: ToolContext) => Promise<string> | string;
}

// Must mirror ActiveTab in types.ts.
const PAGES = ['dashboard', 'discovery', 'prompts', 'crafter', 'refiner', 'prompt_analyzer', 'media_analyzer', 'prompt', 'gallery', 'resizer', 'video_to_frames', 'image_compare', 'color_palette_extractor', 'composer', 'settings'];

// Blocking, per-action user confirmation for destructive external actions.
// window.confirm is deliberate: synchronous, unmissable, and impossible for
// the tool loop to bypass. ponytail: upgrade to an in-app modal later.
const confirmSensitiveAction = (summary: string): boolean => {
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') return false;
    return window.confirm(`The assistant wants to:\n\n${summary}\n\nAllow this?`);
};

/** Try to obtain a valid Google access token, attempting silent refresh if stale.
 *  Reads the identity fresh from localStorage rather than trusting the caller's
 *  settings snapshot — the live/voice assistant (services/liveAssistantService.ts)
 *  captures `settings` once at session start and never refreshes it, so a stale
 *  ctx.settings.googleIdentity kept reporting "session expired" for the rest of
 *  a voice session even after the user re-authenticated in Settings. */
async function ensureGoogleToken(): Promise<{ token: string } | string> {
    const identity = loadLLMSettings().googleIdentity;
    if (isGoogleAuthValid(identity)) {
        return { token: identity.accessToken };
    }
    if (!identity?.isConnected) {
        return 'Error: No Google Identity connected. Go to Settings > Integrations > Google and authorize your account.';
    }
    // Token expired — attempt silent refresh
    try {
        const { trySilentRefreshWithWait } = await import('../utils/googleAuth');
        const refreshed = await trySilentRefreshWithWait(identity, 5000, 300);
        if (refreshed?.accessToken) {
            return { token: refreshed.accessToken };
        }
    } catch {}
    return 'Error: Your Google session has expired and could not be refreshed. Go to Settings > Integrations > Google and re-authenticate.';
}

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
        name: 'spotify_list_playlists',
        description: 'List the authenticated user\'s Spotify playlists. Requires Spotify to be connected in Settings > Integrations > Spotify.',
        parameters: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Maximum number of playlists to return (default 20).' },
            },
        },
        execute: async ({ limit = 20 }) => {
            if (typeof window === 'undefined') return 'Error: This tool requires a browser environment.';
            const token = await getSpotifyAccessToken();
            if (!token) return 'Error: Spotify not connected. Go to Settings > Integrations > Spotify and link your account.';
            const max = Math.min(Math.max(1, Math.floor(limit)), 50);
            const res = await fetch(`https://api.spotify.com/v1/me/playlists?limit=${max}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                if (res.status === 401) return 'Error: Spotify token expired. Please reconnect in Settings.';
                return `Error: Failed to fetch playlists (${res.status}).`;
            }
            const data = await res.json();
            const items = data.items || [];
            return JSON.stringify(items.map((pl: any) => ({
                id: pl.id,
                name: pl.name,
                description: pl.description,
                trackCount: pl.tracks?.total,
                url: pl.external_urls?.spotify,
            })));
        },
    },
    {
        name: 'spotify_get_playlist_tracks',
        description: 'Get tracks from a Spotify playlist. Requires Spotify connected in Settings.',
        parameters: {
            type: 'object',
            properties: {
                playlistId: { type: 'string', description: 'Spotify playlist ID.' },
                limit: { type: 'number', description: 'Maximum tracks to return (default 50).' },
            },
            required: ['playlistId'],
        },
        execute: async ({ playlistId, limit = 50 }) => {
            if (typeof window === 'undefined') return 'Error: This tool requires a browser environment.';
            const token = await getSpotifyAccessToken();
            if (!token) return 'Error: Spotify not connected. Go to Settings > Integrations > Spotify and link your account.';
            const max = Math.min(Math.max(1, Math.floor(limit)), 100);
            const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${max}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                if (res.status === 401) return 'Error: Spotify token expired. Please reconnect in Settings.';
                return `Error: Failed to fetch tracks (${res.status}).`;
            }
            const data = await res.json();
            const items = data.items || [];
            return JSON.stringify(items.map((item: any) => ({
                trackId: item.track?.id,
                name: item.track?.name,
                artists: item.track?.artists?.map((a: any) => a.name).join(', '),
                album: item.track?.album?.name,
                durationMs: item.track?.duration_ms,
                url: item.track?.external_urls?.spotify,
            })));
        },
    },
    {
        name: 'spotify_play',
        description: 'Play a Spotify track, album, or playlist in the Media Panel. Requires Spotify connected in Settings.',
        parameters: {
            type: 'object',
            properties: {
                uri: { type: 'string', description: 'Spotify URI (e.g., spotify:track:..., spotify:album:..., spotify:playlist:...) or track/album/playlist ID.' },
            },
            required: ['uri'],
        },
        execute: ({ uri }) => {
            if (typeof window === 'undefined') return 'Error: This tool requires a browser environment.';
            const token = localStorage.getItem('spotify_access_token');
            if (!token) return 'Error: Spotify not connected. Go to Settings > Integrations > Spotify and link your account.';
            // Normalize URI
            let spotifyUri = String(uri).trim();
            if (!spotifyUri.startsWith('spotify:')) {
                // Assume it's an ID, try to detect type from context or default to track
                if (spotifyUri.includes(':')) spotifyUri = `spotify:track:${spotifyUri}`;
                else spotifyUri = `spotify:track:${spotifyUri}`;
            }
            // Emit to open media panel with Spotify URI
            appEventBus.emit('openMediaPanel', { url: spotifyUri, isSpotifyUri: true });
            return `Playing ${spotifyUri} in the media panel.`;
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
    // These tools auto-route: when CDP external browser is connected, coordinate-based
    // actions go to the external page via CDP. data-ai-id tools stay in-app.

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
        description: 'Click at pixel coordinates within the screen image you see (scaled to max 1024px on the long side). Works in-app (synthetic events) and on external websites (via CDP when connected). For any normal UI control with a data-ai-id, use browser_click_element instead — it is exact, this is not. Requires screen sharing + control permission.',
        parameters: {
            type: 'object',
            properties: {
                nx: { type: 'number', description: 'X pixel coordinate within the screen image you see (0–1024 range).' },
                ny: { type: 'number', description: 'Y pixel coordinate within the screen image you see (0–1024 range).' },
            },
            required: ['nx', 'ny'],
        },
        execute: async ({ nx, ny }) => {
            if (externalBrowserService.connected) return externalBrowserService.click(Number(nx), Number(ny));
            return browserControlService.click(Number(nx), Number(ny));
        },
    },
    {
        name: 'browser_double_click',
        description: 'Double-click at pixel coordinates within the screen image (scaled to max 1024px). Works in-app and on external websites (via CDP).',
        parameters: {
            type: 'object',
            properties: {
                nx: { type: 'number', description: 'X pixel coordinate within the screen image you see.' },
                ny: { type: 'number', description: 'Y pixel coordinate within the screen image you see.' },
            },
            required: ['nx', 'ny'],
        },
        execute: async ({ nx, ny }) => {
            if (externalBrowserService.connected) return externalBrowserService.doubleClick(Number(nx), Number(ny));
            return browserControlService.doubleClick(Number(nx), Number(ny));
        },
    },
    {
        name: 'browser_right_click',
        description: 'Right-click at pixel coordinates within the screen image (scaled to max 1024px). Works in-app and on external websites (via CDP).',
        parameters: {
            type: 'object',
            properties: {
                nx: { type: 'number', description: 'X pixel coordinate within the screen image you see.' },
                ny: { type: 'number', description: 'Y pixel coordinate within the screen image you see.' },
            },
            required: ['nx', 'ny'],
        },
        execute: async ({ nx, ny }) => {
            if (externalBrowserService.connected) return externalBrowserService.rightClick(Number(nx), Number(ny));
            return browserControlService.rightClick(Number(nx), Number(ny));
        },
    },
    {
        name: 'browser_hover',
        description: 'Hover (move mouse to) a position on the page. Useful for revealing hover menus, tooltips, or previews. Provide pixel coordinates within the screen image (scaled to max 1024px). Works in-app and on external websites (via CDP).',
        parameters: {
            type: 'object',
            properties: {
                nx: { type: 'number', description: 'X pixel coordinate within the screen image you see.' },
                ny: { type: 'number', description: 'Y pixel coordinate within the screen image you see.' },
            },
            required: ['nx', 'ny'],
        },
        execute: async ({ nx, ny }) => {
            if (externalBrowserService.connected) return externalBrowserService.hover(Number(nx), Number(ny));
            return browserControlService.hover(Number(nx), Number(ny));
        },
    },
    {
        name: 'browser_type',
        description: 'Type text into the input field that is focused on the page. Make sure you click the input field first with browser_click. Works in-app and on external websites (via CDP).',
        parameters: {
            type: 'object',
            properties: {
                text: { type: 'string', description: 'The text to type into the focused field.' },
            },
            required: ['text'],
        },
        execute: async ({ text }) => {
            if (externalBrowserService.connected) return externalBrowserService.type(String(text));
            return browserControlService.type(String(text));
        },
    },
    {
        name: 'browser_press_key',
        description: 'Press a named key (Enter, Tab, Escape, Backspace, ArrowUp/Down/Left/Right, etc.) or combinations (Control+C, Control+V, Shift+Tab) on the element that currently has focus. Works in-app and on external websites (via CDP).',
        parameters: {
            type: 'object',
            properties: {
                key: { type: 'string', description: 'Key name. Valid: Enter, Tab, Escape, Backspace, Delete, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Space, Home, End, PageUp, PageDown, F1–F12, Shift, Control, Alt, CapsLock. Can also combine modifiers like Control+V, Control+C, Meta+C, Shift+Tab.' },
            },
            required: ['key'],
        },
        execute: async ({ key }) => {
            if (externalBrowserService.connected) return externalBrowserService.pressKey(String(key));
            return browserControlService.pressKey(String(key));
        },
    },
    {
        name: 'browser_scroll',
        description: 'Scroll the page by a small or large amount. dy = 0.5 scrolls down half a page. dy = -0.3 scrolls up a bit. dx scrolls sideways. Works in-app and on external websites (via CDP).',
        parameters: {
            type: 'object',
            properties: {
                dx: { type: 'number', description: 'Horizontal scroll factor (negative = left, positive = right, 0.3 = ~300px).' },
                dy: { type: 'number', description: 'Vertical scroll factor (negative = up, positive = down, 0.5 = ~500px).' },
            },
        },
        execute: async ({ dx, dy }) => {
            if (externalBrowserService.connected) return externalBrowserService.scroll(Number(dx || 0), Number(dy || 0));
            return browserControlService.scroll(Number(dx || 0), Number(dy || 0));
        },
    },
    {
        name: 'browser_scroll_to',
        description: 'Scroll to a specific position on the page. frac = 0 is the top, frac = 1 is the bottom. Works in-app and on external websites (via CDP).',
        parameters: {
            type: 'object',
            properties: {
                frac: { type: 'number', description: 'Scroll position (0 = top, 0.5 = middle, 1 = bottom).' },
            },
            required: ['frac'],
        },
        execute: async ({ frac }) => {
            if (externalBrowserService.connected) return externalBrowserService.scrollTo(Number(frac));
            return browserControlService.scrollTo(Number(frac));
        },
    },
    {
        name: 'browser_get_url',
        description: 'Get the current page URL. Works in-app and on external websites (via CDP).',
        parameters: { type: 'object', properties: {} },
        execute: async () => {
            if (externalBrowserService.connected) {
                const r = await externalBrowserService.readContent();
                return r.url || '(unknown)';
            }
            return browserControlService.getUrl();
        },
    },
    {
        name: 'browser_read_page',
        description: 'Read all visible text content from the current page. Returns the page title, URL, and up to 5000 characters of body text. Works in-app and on external websites (via CDP).',
        parameters: { type: 'object', properties: {} },
        execute: async () => {
            if (externalBrowserService.connected) {
                const r = await externalBrowserService.readContent();
                if (!r.success) return `Error: ${r.error}`;
                return `Page title: "${r.title}"\nURL: ${r.url}\nContent:\n${r.content}`;
            }
            return browserControlService.readVisibleContent();
        },
    },
    {
        name: 'browser_read_structure',
        description: 'Scan the page and list interactive elements visible on screen (buttons, links, inputs, headings) with their tag and text. Elements with a data-ai-id (shown in brackets, e.g. "[generate-btn]") can be clicked exactly with browser_click_element — call this FIRST to get those ids, then act on them. On external pages (via CDP), no data-ai-id will be shown — use browser_click with coordinates instead. Works in-app and on external websites.',
        parameters: { type: 'object', properties: {} },
        execute: async () => {
            if (externalBrowserService.connected) return externalBrowserService.readStructure();
            return browserControlService.readPageStructure();
        },
    },
    {
        name: 'browser_navigate',
        description: 'Navigate the browser to a different URL. Works in-app and on external websites (via CDP).',
        parameters: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'Full absolute URL (http/https) to navigate to.' },
            },
            required: ['url'],
        },
        execute: async ({ url }) => {
            if (externalBrowserService.connected) return externalBrowserService.navigate(String(url));
            return browserControlService.navigate(String(url));
        },
    },

    // ─── Gmail Tools (require Google Identity connection) ───────────────────

    {
        name: 'read_gmail',
        description: 'Read the user\'s Gmail inbox — list recent messages, search by query, or read a specific email\'s full content (headers + body). Requires Google Identity to be connected (Settings > App > Storage > Authorize Drive).',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['list', 'search', 'read'],
                    description: '"list" = recent inbox messages, "search" = search by query, "read" = read full content by message id.'
                },
                query: { type: 'string', description: 'For "search": a Gmail search query (e.g. "from:john subject:invoice"). For "read": the message id to fetch.' },
                maxResults: { type: 'number', description: 'Max messages for list/search (1-20, default 10).' },
            },
            required: ['action'],
        },
        execute: async (args) => {
            const authResult = await ensureGoogleToken();
            if (typeof authResult === 'string') return authResult;
            const token = authResult.token;
            const BASE = '/google-api/gmail/v1/users/me';
            const headers = { Authorization: `Bearer ${token}` };
            try {
                if (args.action === 'list' || args.action === 'search') {
                    const q = args.action === 'search' && args.query ? `&q=${encodeURIComponent(String(args.query))}` : '';
                    const max = Math.min(Math.max(Number(args.maxResults) || 10, 1), 20);
                    const res = await fetch(`${BASE}/messages?maxResults=${max}${q}&fields=messages(id,threadId,snippet,labelIds)`, { headers });
                    if (!res.ok) return `Gmail API error: ${res.status} ${res.statusText}${res.status === 401 ? ' — token expired, re-authorize in Settings.' : ''}`;
                    // 204 No Content means no messages (empty inbox/result)
                    if (res.status === 204) return 'No messages found.';
                    const data = await res.json();
                    if (!data.messages?.length) return 'No messages found.';
                    const out = await Promise.all(data.messages.slice(0, max).map(async (m: any) => {
                        const detail = await fetch(`${BASE}/messages/${m.id}?format=metadata&fields=id,labelIds,payload/headers,snippet`, { headers }).then(r => r.json()).catch(() => ({}));
                        const h = (hds: any[], name: string) => hds?.find((h: any) => h.name === name)?.value || '';
                        const hs = detail.payload?.headers || [];
                        return `[${m.id}] From: ${h(hs, 'From')} | To: ${h(hs, 'To')} | Subject: ${h(hs, 'Subject')} | Date: ${h(hs, 'Date')} | Labels: ${(m.labelIds||[]).join(', ')} | Snippet: ${m.snippet || ''}`;
                    }));
                    return `Found ${data.messages.length} message(s):\n\n${out.join('\n')}` + (data.nextPageToken ? '\n\n(More results available — use a more specific query.)' : '');
                } else if (args.action === 'read') {
                    if (!args.query) return 'Error: provide a message id as the "query" parameter.';
                    const res = await fetch(`${BASE}/messages/${encodeURIComponent(String(args.query))}?format=full`, { headers });
                    if (!res.ok) return `Gmail API error: ${res.status} ${res.statusText}`;
                    const msg = await res.json();
                    const h = (name: string) => msg.payload?.headers?.find((x: any) => x.name === name)?.value || '';
                    // Extract body from message parts
                    const extractBody = (part: any): string => {
                        if (part.mimeType === 'text/plain' && part.body?.data) {
                            try { return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/')); } catch { return '[could not decode body]'; }
                        }
                        if (part.parts) return part.parts.map(extractBody).filter(Boolean).join('\n---\n');
                        return '';
                    };
                    const body = extractBody(msg.payload || {});
                    return `From: ${h('From')}\nTo: ${h('To')}\nDate: ${h('Date')}\nSubject: ${h('Subject')}\n\n${body || '(no plain text body)'}`;
                } else {
                    return `Error: unknown action "${args.action}". Use "list", "search", or "read".`;
                }
            } catch (e: any) {
                return `Gmail error: ${e?.message || e}`;
            }
        },
    },
    {
        name: 'send_gmail',
        description: 'Send an email from the user\'s Gmail account (the one connected via Google Identity). Use for composing and sending messages on the user\'s behalf.',
        parameters: {
            type: 'object',
            properties: {
                to: { type: 'string', description: 'Recipient email address(es). Comma-separate multiple recipients.' },
                subject: { type: 'string', description: 'Email subject line.' },
                body: { type: 'string', description: 'Email body text (plain text).' },
                cc: { type: 'string', description: 'Optional CC recipient(s).' },
                bcc: { type: 'string', description: 'Optional BCC recipient(s).' },
            },
            required: ['to', 'subject', 'body'],
        },
        execute: async (args) => {
            const authResult = await ensureGoogleToken();
            if (typeof authResult === 'string') return authResult;
            const token = authResult.token;
            if (!confirmSensitiveAction(`Send an email\nTo: ${String(args.to || '')}\nSubject: ${String(args.subject || '')}`)) {
                return 'User declined: the email was NOT sent. Do not retry unless the user explicitly asks again.';
            }
            try {
                // Build RFC 2822 MIME message
                const to = String(args.to || '');
                const subject = String(args.subject || '');
                const body = String(args.body || '');
                const cc = args.cc ? String(args.cc) : '';
                const bcc = args.bcc ? String(args.bcc) : '';
                if (!to) return 'Error: "to" is required.';
                // Construct email headers + body as a MIME message
                const headers = [
                    `To: ${to}`,
                    `Subject: ${subject}`,
                    'MIME-Version: 1.0',
                    'Content-Type: text/plain; charset="UTF-8"',
                    'Content-Transfer-Encoding: 7bit',
                ];
                if (cc) headers.push(`Cc: ${cc}`);
                if (bcc) headers.push(`Bcc: ${bcc}`);
                const raw = headers.join('\r\n') + '\r\n\r\n' + body;
                // Base64url encode
                const b64 = btoa(unescape(encodeURIComponent(raw)));
                const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                const res = await fetch('/google-api/gmail/v1/users/me/messages/send', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ raw: b64url }),
                });
                if (!res.ok) {
                    const err = await res.text().catch(() => res.statusText);
                    return `Failed to send email: ${res.status} ${err}`;
                }
                const result = await res.json();
                return `Email sent successfully. Message id: ${result.id}${result.threadId ? `, thread: ${result.threadId}` : ''}`;
            } catch (e: any) {
                return `Error sending email: ${e?.message || e}`;
            }
        },
    },
    {
        name: 'delete_gmail',
        description: 'Trash or permanently delete an email from Gmail. Requires the message id obtained from read_gmail (action "list" or "search").',
        parameters: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'The Gmail message id to act on (from read_gmail).' },
                action: { type: 'string', enum: ['trash', 'delete'], description: '"trash" (default) moves to trash (undoable in Gmail UI). "delete" permanently deletes immediately (irreversible).' },
            },
            required: ['id'],
        },
        execute: async (args) => {
            const authResult = await ensureGoogleToken();
            if (typeof authResult === 'string') return authResult;
            const token = authResult.token;
            const wantsPermanent = args.action === 'delete';
            if (!confirmSensitiveAction(`${wantsPermanent ? 'PERMANENTLY DELETE (irreversible)' : 'Move to trash'}\nGmail message: ${String(args.id)}`)) {
                return 'User declined: the message was NOT modified. Do not retry unless the user explicitly asks again.';
            }
            try {
                const msgId = encodeURIComponent(String(args.id));
                const isPermanent = args.action === 'delete';
                const url = isPermanent
                    ? `/google-api/gmail/v1/users/me/messages/${msgId}`
                    : `/google-api/gmail/v1/users/me/messages/${msgId}/trash`;
                const res = await fetch(url, {
                    method: isPermanent ? 'DELETE' : 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                });
                if (!res.ok) {
                    const err = await res.text().catch(() => res.statusText);
                    return `Failed to ${isPermanent ? 'delete' : 'trash'} message: ${res.status} ${err}`;
                }
                return isPermanent ? `Message ${args.id} permanently deleted.` : `Message ${args.id} moved to trash.`;
            } catch (e: any) {
                return `Error deleting message: ${e?.message || e}`;
            }
        },
    },
    // --- Tensor Art ---
    {
        name: 'tensorart_list_models',
        description: 'Lists all available Tensor Art models (tools) with their names, descriptions, input schemas, and estimated costs. Call this first so the AI knows which models are available before generating.',
        parameters: {
            type: 'object',
            properties: {},
        },
        execute: async (_args: any, ctx: ToolContext) => {
            const key = ctx.settings.tensorartApiKey;
            if (!key) return 'Error: Tensor Art API key not configured. Ask the user to add it in Settings → Integrations → Tensor Art.';
            try {
                const tools = await listTools(key);
                if (!tools.length) return 'No models found on this account.';
                return JSON.stringify(tools.map(t => ({
                    name: t.name,
                    description: t.description,
                    cost: t.estimatedCost,
                    tags: t.tags,
                    inputs: t.inputs.map(i => ({ name: i.name, type: i.type, description: i.description })),
                })));
            } catch (e: any) {
                return `Error fetching models: ${e?.message || e}`;
            }
        },
    },
    {
        name: 'tensorart_generate',
        description: 'Generates an image or video using a Tensor Art model. Accepts the model name and prompt; optionally width, height, and count. The result URL is returned — tell the user it\'s ready.',
        parameters: {
            type: 'object',
            properties: {
                toolName: { type: 'string', description: 'The exact model/tool name from tensorart_list_models, e.g. strong_text2image_nano_banana2.' },
                prompt: { type: 'string', description: 'The text prompt describing what to generate.' },
                width: { type: 'integer', description: 'Image width in pixels (e.g. 1024). Omit to use the model default.' },
                height: { type: 'integer', description: 'Image height in pixels (e.g. 1024). Omit to use the model default.' },
                count: { type: 'integer', description: 'Number of images to generate (default 1).' },
            },
            required: ['toolName', 'prompt'],
        },
        execute: async (args: any, ctx: ToolContext) => {
            const key = ctx.settings.tensorartApiKey;
            if (!key) return 'Error: Tensor Art API key not configured. Ask the user to add it in Settings → Integrations → Tensor Art.';
            const { toolName, prompt, width, height, count } = args;
            try {
                // Fetch the tool definition so we can build the correct inputs array
                const tools = await listTools(key);
                const tool = tools.find(t => t.name === toolName);
                if (!tool) {
                    const names = tools.map(t => t.name).join(', ');
                    return `Error: model "${toolName}" not found. Available: ${names || '(none)'}`;
                }

                // Build the inputs array positionally matching the tool's schema
                const inputs: { type: string; value: any }[] = [];
                for (const input of tool.inputs) {
                    const nameL = input.name.toLowerCase();
                    let value: any;

                    if (nameL === 'prompt' || nameL === 'text' || nameL === 'description') {
                        value = prompt || '';
                    } else if (nameL === 'image' && input.type === 'FILE') {
                        value = args.imageUrl || null;
                    } else if (input.type === 'STRING' && (nameL === 'negative_prompt' || nameL === 'negative')) {
                        value = '';
                    } else if (input.type === 'INTEGER' && (nameL === 'width' || nameL === 'w')) {
                        value = width ?? 1024;
                    } else if (input.type === 'INTEGER' && (nameL === 'height' || nameL === 'h')) {
                        value = height ?? 1024;
                    } else if (input.type === 'INTEGER' && (nameL === 'count' || nameL === 'num' || nameL === 'n' || nameL === 'number')) {
                        value = count ?? 1;
                    } else if (input.type === 'INTEGER' && (nameL === 'steps' || nameL === 'num_steps')) {
                        value = 20;
                    } else if (input.type === 'NUMBER' && (nameL === 'cfg' || nameL === 'guidance_scale')) {
                        value = 7.0;
                    } else if (input.type === 'STRING' && nameL.includes('prompt')) {
                        value = prompt || '';
                    } else if (input.type === 'INTEGER') {
                        value = input.description?.toLowerCase().includes('count') ? (count ?? 1) :
                                input.description?.toLowerCase().includes('width') ? (width ?? 1024) :
                                input.description?.toLowerCase().includes('height') ? (height ?? 1024) :
                                input.description?.toLowerCase().includes('step') ? 20 :
                                input.description?.toLowerCase().includes('seed') ? 0 : 0;
                    } else if (input.type === 'NUMBER') {
                        value = 0;
                    } else if (input.type === 'BOOLEAN') {
                        value = false;
                    } else if (input.type === 'ARRAY') {
                        value = [];
                    } else if (input.type === 'OBJECT') {
                        value = {};
                    } else {
                        value = input.type === 'STRING' ? '' : 0;
                    }
                    inputs.push({ type: input.type, value });
                }

                // Create the task
                const task = await createTask(key, toolName, inputs);

                // Poll until done
                const result = await pollTask(key, task.taskId, 30, 3000);

                if (result.status === 'FINISH' && result.outputs?.length) {
                    const files = result.outputs
                        .filter(o => (o.type === 'FILE' || o.type === 'IMAGE' || o.type === 'VIDEO') && o.url)
                        .map(o => o.url);
                    if (files.length) {
                        return `Generation complete! Result URL${files.length > 1 ? 's' : ''}: ${files.join(', ')}`;
                    }
                    return `Generation complete (status: FINISH) but no output URLs returned. Full result: ${JSON.stringify(result.outputs)}`;
                }
                if (result.status === 'EXCEPTION') {
                    return `Generation failed: ${result.error || 'Unknown error'}`;
                }
                return `Task ${task.taskId} is still processing (status: ${result.status}). Ask the user to check back later.`;
            } catch (e: any) {
                return `Error generating with Tensor Art: ${e?.message || e}`;
            }
        },
    },
];

export const executeAssistantTool = async (name: string, args: Record<string, any>, ctx: ToolContext, extraTools: AssistantTool[] = []): Promise<string> => {
    // Check control permission for browser tools.
    if (name.startsWith('browser_') && !browserControlService.permissionGranted) {
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
