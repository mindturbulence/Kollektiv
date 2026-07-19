import { appEventBus } from '../utils/eventBus';
import { loadSavedPrompts, addSavedPrompt } from '../utils/promptStorage';
import { loadCheatsheet } from '../utils/cheatsheetStorage';
import { getSavedChatSessions } from '../utils/chatStorage';
import { discoveryService } from './discoveryService';
import { loadGalleryItems } from '../utils/galleryStorage';

export const appControlService = {
    navigate: (page: string) => {
        appEventBus.emit('navigate', page);
        return "Navigated to " + page;
    },
    
    getPrompts: async (query?: string) => {
        let prompts = await loadSavedPrompts();
        if (query) {
            const q = query.toLowerCase();
            prompts = prompts.filter(p => p.title?.toLowerCase().includes(q) || p.text?.toLowerCase().includes(q));
        }
        return JSON.stringify(prompts.map(p => ({ id: p.id, title: p.title, prompt: p.text, category: p.categoryId })).slice(0, 50));
    },
    
    savePrompt: async (title: string, prompt: string) => {
        await addSavedPrompt({ title, text: prompt });
        return "Successfully saved prompt: " + title;
    },

    getCheatsheets: async (query?: string) => {
        const cheatsheets = await loadCheatsheet();
        if (!query) {
             return JSON.stringify(cheatsheets.map(c => ({ name: c.category, items: c.items.length })).slice(0, 20));
        }
        
        const q = query.toLowerCase();
        const results: any[] = [];
        cheatsheets.forEach(c => {
             c.items.forEach((item: any) => {
                 if (item.prompt?.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q)) {
                     results.push({ category: c.category, prompt: item.prompt, description: item.description });
                 }
             });
        });
        return JSON.stringify(results.slice(0, 30));
    },
    
    getChatHistory: async () => {
        const sessions = await getSavedChatSessions();
        return JSON.stringify(sessions.map(s => ({ id: s.id, name: s.title, msgCount: s.messages.length })).slice(0, 10));
    },

    getGalleryInfo: async () => {
        const items = await loadGalleryItems();
        const images = items.filter(i => i.type === 'image').length;
        const videos = items.filter(i => i.type === 'video').length;
        return JSON.stringify({ totalItems: items.length, images, videos, latestItems: items.slice(0, 5).map(i => ({ title: i.title, type: i.type, prompt: i.prompt })) });
    },

    getDiscoveryCollections: async () => {
        const collections = await discoveryService.getCollections();
        return JSON.stringify(collections.map(c => ({ id: c.id, name: c.name, desc: c.description })));
    },

    getDiscoveryPrompts: async (collectionId: string, query?: string) => {
        const collections = await discoveryService.getCollections();
        const collection = collections.find(c => c.id === collectionId);
        if (!collection) return "Collection not found";
        const resultString = await discoveryService.fetchPrompts(collection, 0, 50); // Fetch more
        let items = discoveryService.parsePromptsFromMarkdown(resultString);
        if (query) {
            const q = query.toLowerCase();
            items = items.filter(i => i.title?.toLowerCase().includes(q) || i.prompt?.toLowerCase().includes(q));
        }
        return JSON.stringify(items.map(i => ({ title: i.title, prompt: i.prompt, category: i.category })).slice(0, 20));
    },
    
    help: () => {
        return `Commands available:
- /nav <page_name> — Navigate to any page (dashboard, assistant, discovery, prompts, crafter, refiner, prompt_analyzer, media_analyzer, prompt, gallery, resizer, video_to_frames, image_compare, color_palette_extractor, composer, lora_editor, settings)
- /refine — Navigate to the prompt refiner
- /composer — Navigate to the prompt composer/crafter
- /settings — Open settings
- /analyzer — Open the prompt analyzer
- /media_analyzer — Open the media analyzer
- /compare — Open the image compare tool
- /resizer — Open the image resizer
- /lora_editor — Open the LoRA editor
- /list_prompts <optional query> — List your saved prompts
- /save_prompt <title> <prompt> — Save a new prompt
- /cheatsheets <optional query> — View prompt cheatsheets
- /gallery — View gallery info
- /discover — Explore discovery collections
- /discover_prompts <collection_id> <optional query> — View prompts in a discovery collection
- /chat — View your chat session history
- /help — Show this help message`;
    },

    getYouTubeApiKey: () => {
        // Try window var first (synced from handleSettingsChange)
        const fromWindow = (window as any).__YOUTUBE_API_KEY;
        if (fromWindow) return fromWindow;
        // Fallback: read directly from localStorage (avoids bundler issues with require/import)
        try {
            const raw = localStorage.getItem('kollektivSettingsV4');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed.googleApiKey) return parsed.googleApiKey;
                if (parsed.youtube?.customApiKey) return parsed.youtube.customApiKey;
            }
        } catch {}
        return '';
    },
};
