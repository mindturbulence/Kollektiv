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
- /nav <page_name>
- /list_prompts <optional query>
- /save_prompt <prompt_text>
- /cheatsheets <optional query>
- /gallery
- /discover
- /discover_prompts <collection_id> <optional query>`;
    },

    getYouTubeApiKey: () => {
        // This will be set via settings
        return (window as any).__YOUTUBE_API_KEY || '';
    },
};
