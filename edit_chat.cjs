const fs = require('fs');
let code = fs.readFileSync('components/LLMChatPanel.tsx', 'utf8');
code = code.replace(/import \{ CloseIcon, SparklesIcon, SidebarIcon, PlusIcon, DeleteIcon, PaperclipIcon, GlobeIcon, TerminalIcon \} from '\.\/icons';/g, "import { CloseIcon, SparklesIcon, SidebarIcon, PlusIcon, DeleteIcon, PaperclipIcon, GlobeIcon } from './icons';");
code = code.replace(/const title = settings\.activeLLM \=\=\= 'openclaw'.*?;/gs, '');
code = code.replace(/const kollektivContext \= `.*?`;/gs, '');
fs.writeFileSync('components/LLMChatPanel.tsx', code);
