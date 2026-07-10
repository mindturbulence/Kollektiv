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
export const fallbackProtocolPrompt = (persona: string) => `${persona} You can control the app with tools.
To call a tool, output EXACTLY one block in this format and nothing after it:
<action>{"tool": "<tool_name>", "args": { ... }}</action>
The system will reply with the result; then continue helping the user. Available tools:
${ASSISTANT_TOOLS.map(t => `- ${t.name}: ${t.description} Args schema: ${JSON.stringify(t.parameters.properties)}`).join('\n')}
Only use a tool when it helps. Otherwise answer normally.`;
