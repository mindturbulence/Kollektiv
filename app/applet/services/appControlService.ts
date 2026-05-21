import { appEventBus } from '../utils/eventBus';
import { loadSavedPrompts } from '../utils/promptStorage';
import { loadCheatsheets, loadCategories } from '../utils/cheatsheetStorage';
import { getSavedChatSessions } from '../utils/chatStorage';

export const appControlService = {
    navigate: (page: string) => {
        appEventBus.emit('navigate', page);
        return `Navigated to ${page}`;
    },
    
    getPrompts: async () => {
        const prompts = await loadSavedPrompts();
        return JSON.stringify(prompts.map(p => ({ id: p.id, title: p.title, prompt: p.prompt, category: p.categoryId })).slice(0, 20));
    },
    
    getCheatsheets: async () => {
        const cheatsheets = await loadCheatsheets();
        const categories = await loadCategories();
        return JSON.stringify({ 
            categories: categories.map(c => ({ id: c.id, name: c.name })), 
            cheatsheets: cheatsheets.map(c => ({ id: c.id, name: c.name, type: c.type, prompt: c.prompt })).slice(0, 20) 
        });
    },
    
    getChatHistory: async () => {
        const sessions = await getSavedChatSessions();
        return JSON.stringify(sessions.map(s => ({ id: s.id, name: s.name, msgCount: s.messages.length })).slice(0, 10));
    },
    
    help: () => {
        return `Available Pages: 'dashboard', 'discovery', 'crafter', 'refiner', 'prompt_analyzer', 'media_analyzer', 'prompts', 'composer', 'cheatsheets', 'settings'.
Available Actions:
- navigate({"page": "page_name"})
- getPrompts()
- getCheatsheets()
- getChatHistory()`;
    }
};
