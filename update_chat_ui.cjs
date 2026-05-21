const fs = require('fs');
let code = fs.readFileSync('components/LLMChatPanel.tsx', 'utf8');

// Add TerminalIcon
code = code.replace(/import \{ CloseIcon, SparklesIcon, SidebarIcon, PlusIcon, DeleteIcon, PaperclipIcon, GlobeIcon \} from '\.\/icons';/, 
`import { CloseIcon, SparklesIcon, SidebarIcon, PlusIcon, DeleteIcon, PaperclipIcon, GlobeIcon, TerminalIcon } from './icons';`);

// Add State
const stateToAdd = `    const [showCommandMenu, setShowCommandMenu] = useState(false);
    const availableCommands = [
        { cmd: '/nav ', desc: 'Navigate to page' },
        { cmd: '/list_prompts ', desc: 'List your saved prompts' },
        { cmd: '/save_prompt ', desc: 'Save a new prompt' },
        { cmd: '/cheatsheets ', desc: 'View prompt cheatsheets' },
        { cmd: '/gallery', desc: 'View gallery info' },
        { cmd: '/discover', desc: 'Explore discovery collections' },
        { cmd: '/discover_prompts ', desc: 'View prompts in collection' },
        { cmd: '/refine', desc: 'Navigate to prompt refiner' },
        { cmd: '/help', desc: 'Show all available commands' }
    ];

    const insertCommand = (cmdStr: string) => {
        setInput(cmdStr);
        setShowCommandMenu(false);
        textareaRef.current?.focus();
    };`;

code = code.replace(/const \[useWebSearch, setUseWebSearch\] = useState\(false\);/, `const [useWebSearch, setUseWebSearch] = useState(false);
${stateToAdd}`);

// Add UI
const uiToAdd = `                                                    <div className="relative flex items-center justify-center">
                                                        <button
                                                            type="button"
                                                            title="Insert Command"
                                                            onClick={() => setShowCommandMenu(!showCommandMenu)}
                                                            disabled={isProcessing}
                                                            className={\`p-2 rounded-lg transition-colors \${showCommandMenu ? 'text-primary bg-primary/10' : 'text-white/50 hover:text-white'} disabled:opacity-50\`}
                                                        >
                                                            <TerminalIcon className="w-4 h-4" />
                                                        </button>
                                                        {showCommandMenu && (
                                                            <div className="absolute bottom-full left-0 mb-2 w-64 bg-base-300 border border-white/10 rounded-xl shadow-xl overflow-hidden z-[100]">
                                                                <div className="max-h-60 overflow-y-auto w-full flex flex-col py-1">
                                                                    {availableCommands.map((c, i) => (
                                                                        <button
                                                                            key={i}
                                                                            type="button"
                                                                            onClick={() => insertCommand(c.cmd)}
                                                                            className="text-left py-2 px-3 hover:bg-white/5 transition-colors flex flex-col w-full"
                                                                        >
                                                                            <span className="text-primary text-sm font-mono leading-none mb-1">{c.cmd}</span>
                                                                            <span className="text-white/50 text-xs leading-none">{c.desc}</span>
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>`;

code = code.replace(/<button\s*type="button"\s*title=\{settings\.activeLLM === 'gemini'/s, uiToAdd + `
                                                    <button
                                                        type="button"
                                                        title={settings.activeLLM === 'gemini'`);

fs.writeFileSync('components/LLMChatPanel.tsx', code);
