import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { streamChat } from '../services/llmService';
import { useSettings } from '../contexts/SettingsContext';
import { CloseIcon, SparklesIcon, SidebarIcon, PlusIcon, DeleteIcon, PaperclipIcon, GlobeIcon } from './icons';
import { audioService } from '../services/audioService';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { getSavedChatSessions, saveChatSession, deleteChatSession, clearAllChatSessions, ChatSession } from '../utils/chatStorage';
import { v4 as uuidv4 } from 'uuid';
import { appControlService } from '../services/appControlService';

interface LLMChatPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

export const LLMChatPanel: React.FC<LLMChatPanelProps> = ({ isOpen, onClose }) => {
    const { settings } = useSettings();
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [messages, setMessages] = useState<{ role: 'user' | 'assistant' | 'system', content: string, attachments?: any[] }[]>([]);

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [savedSessions, setSavedSessions] = useState<ChatSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

    // Initial load
    useEffect(() => {
        if (isOpen) {
            audioService.playPanelSlideIn();
            const sessions = getSavedChatSessions();
            setSavedSessions(sessions);
            if (!activeSessionId && messages.length <= 1) {
                startNewSession(); // setup default view
            }
        } else {
            audioService.playPanelSlideOut();
        }
    }, [isOpen]);

    const startNewSession = () => {
        
        
        setMessages([{ role: 'system', content: `Type /help to see available local commands.` }]);
        setActiveSessionId(null);
        if (window.innerWidth < 768) setIsSidebarOpen(false);
    };

    const loadSession = (id: string) => {
        const session = savedSessions.find(s => s.id === id);
        if (session) {
            setActiveSessionId(id);
            setMessages(session.messages);
            if (window.innerWidth < 768) setIsSidebarOpen(false);
        }
    };

    const deleteSession = (id: string) => {
        deleteChatSession(id);
        const updated = getSavedChatSessions();
        setSavedSessions(updated);
        if (activeSessionId === id) {
            startNewSession();
        }
    };

    const clearAllSessions = () => {
        if (window.confirm("Are you sure you want to clear all chat history?")) {
            clearAllChatSessions();
            setSavedSessions([]);
            startNewSession();
        }
    };

    const persistSession = (currentMessages: any[], idToUse?: string) => {
        let id = idToUse || activeSessionId;
        if (!id) {
            id = uuidv4();
            setActiveSessionId(id);
        }

        const firstUser = currentMessages.find(m => m.role === 'user');
        const title = firstUser ? (firstUser.content.length > 30 ? firstUser.content.substring(0, 30) + '...' : firstUser.content) : 'New Chat Session';

        const newSession: ChatSession = { id, title, messages: currentMessages, updatedAt: Date.now() };
        saveChatSession(newSession);

        // Refresh session list without losing focus
        setSavedSessions(getSavedChatSessions());
        return id; // return created ID if needed
    };

    // Initialize system message based on active LLM (only on mount or change if we have no user messages)
    useEffect(() => {
        if (!activeSessionId && messages.length <= 1) {
            
            
            setMessages([{ role: 'system', content: `Type /help to see available local commands.` }]);
        }
    }, [settings.activeLLM]);

    const [input, setInput] = useState('');
    const [attachments, setAttachments] = useState<{data: string, mimeType: string, fileName: string}[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [useWebSearch, setUseWebSearch] = useState(false);
    const [showCommandMenu, setShowCommandMenu] = useState(false);
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
    };
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            const newAttachments = await Promise.all(
                files.map(file => new Promise<{data: string, mimeType: string, fileName: string}>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (ev) => resolve({
                        data: ev.target!.result as string,
                        mimeType: file.type,
                        fileName: file.name
                    });
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                }))
            );
            setAttachments(prev => [...prev, ...newAttachments].slice(0, 5)); // max 5
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeAttachment = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            const nextHeight = Math.min(textareaRef.current.scrollHeight, 200);
            textareaRef.current.style.height = nextHeight + 'px';
        }
    }, [input]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isOpen]);

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if ((!input.trim() && attachments.length === 0) || isProcessing) return;

        audioService.playClick();
        
        const userCommand = input.trim();
        setInput('');

        const messageAttachments = attachments.length > 0 ? [...attachments] : undefined;
        setAttachments([]);

        const newMessages = [...messages, { role: 'user' as const, content: userCommand, attachments: messageAttachments }];
        setMessages(newMessages);

        let currentSessionId = activeSessionId;
        // Save immediately as user types
        currentSessionId = persistSession(newMessages, currentSessionId || undefined);

        if (userCommand.startsWith('/')) {
            let systemResponse = '';
            const commandParts = userCommand.split(' ');
            const cmd = commandParts[0].toLowerCase();
            const arg = commandParts.slice(1).join(' ');

            try {
                if (cmd === '/list_prompts') {
                    systemResponse = await appControlService.getPrompts(arg);
                } else if (cmd === '/discover') {
                    systemResponse = await appControlService.getDiscoveryCollections();
                } else if (cmd === '/discover_prompts') {
                    systemResponse = await appControlService.getDiscoveryPrompts(arg);
                } else if (cmd === '/gallery') {
                    systemResponse = await appControlService.getGalleryInfo();
                } else if (cmd === '/save_prompt') {
                    systemResponse = await appControlService.savePrompt(arg || 'Saved via chat', arg);
                } else if (cmd === '/cheatsheets') {
                    systemResponse = await appControlService.getCheatsheets(arg);
                } else if (cmd === '/nav' || cmd === '/navigate') {
                    systemResponse = appControlService.navigate(arg);
                } else if (cmd === '/refine') {
                    systemResponse = appControlService.navigate('refiner');
                } else if (cmd === '/help') {
                    systemResponse = appControlService.help();
                } else {
                    systemResponse = `Unknown command: ${cmd}. Available local commands: /list_prompts, /discover, /discover_prompts, /gallery, /save_prompt, /cheatsheets, /nav, /help.`;
                }
            } catch (err: any) {
                systemResponse = `Error executing local command: ${err.message}`;
            }

            const sysMsg = { role: 'system' as const, content: `System Command Result:
${systemResponse}` };
            setMessages(prev => {
                const next = [...prev, sysMsg];
                persistSession(next, currentSessionId);
                return next;
            });
            return;
        }

        setIsProcessing(true);

        try {
            let currentMessages = [...newMessages];
            let shouldContinue = true;

            while (shouldContinue) {
                shouldContinue = false;

                setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
                const generator = streamChat(currentMessages, settings, useWebSearch);

                let fullResponse = '';
                for await (const chunk of generator) {
                    fullResponse += chunk;
                    if (chunk.trim() && chunk.length > 0) {
                        audioService.playType();
                    }
                    setMessages(prev => {
                        const cloned = [...prev];
                        cloned[cloned.length - 1] = {
                            ...cloned[cloned.length - 1],
                            content: fullResponse
                        };
                        return cloned;
                    });
                }

                currentMessages = [...currentMessages, { role: 'assistant' as const, content: fullResponse }];

                // Final save after stream ends
                setMessages(prev => {
                    persistSession(prev, currentSessionId);
                    return prev;
                });

                // Check for action tags
                const actionMatch = fullResponse.match(/<action>([\s\S]*?)<\/action>/);
                if (actionMatch) {
                    try {
                        const actionObj = JSON.parse(actionMatch[1].trim());
                        let result;
                        if (actionObj.type === 'navigate') {
                            result = appControlService.navigate(actionObj.page);
                        } else if (actionObj.type === 'read_prompts') {
                            result = await appControlService.getPrompts(actionObj.query);
                        } else if (actionObj.type === 'save_prompt') {
                            result = await appControlService.savePrompt(actionObj.title || 'Untitled', actionObj.prompt || '');
                        } else if (actionObj.type === 'read_cheatsheets') {
                            result = await appControlService.getCheatsheets(actionObj.query);
                        } else if (actionObj.type === 'read_chat_history') {
                            result = await appControlService.getChatHistory();
                        } else if (actionObj.type === 'read_gallery') {
                            result = await appControlService.getGalleryInfo();
                        } else if (actionObj.type === 'read_discovery_collections') {
                            result = await appControlService.getDiscoveryCollections();
                        } else if (actionObj.type === 'read_discovery_prompts') {
                            result = await appControlService.getDiscoveryPrompts(actionObj.collectionId, actionObj.query);
                        } else {
                            result = "Unknown action type: " + actionObj.type;
                        }

                        const systemMsg = "System: Action executed. Result:\n" + result;
                        setMessages(prev => [...prev, { role: 'system' as const, content: systemMsg }]);
                        currentMessages = [...currentMessages, { role: 'system' as const, content: systemMsg }];
                        
                        // Loop again to let assistant process result!
                        shouldContinue = true;
                    } catch (e) {
                         const sysErr = "System: Failed to parse or execute action: " + e;
                         setMessages(prev => [...prev, { role: 'system' as const, content: sysErr }]);
                         currentMessages = [...currentMessages, { role: 'system' as const, content: sysErr }];
                         shouldContinue = true;
                    }
                }
            }
        } catch (error: any) {
            console.error('Chat error:', error);
            setMessages(prev => {
                const next = [...prev, {
                    role: 'system' as const,
                    content: `Error: ${error.message || 'Connection failed'}. Please check your LLM configuration.`
                }];
                persistSession(next, currentSessionId);
                return next;
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const getChatTitle = () => {
        return 'Chat';
    };

    const getChatSubtitle = () => {
        if (settings.activeLLM === 'hermes') return settings.hermesModel || 'hermes-agent';
        if (settings.activeLLM === 'ollama') return settings.ollamaModel || 'llama3';
        if (settings.activeLLM === 'ollama_cloud') return settings.ollamaCloudModel || 'llama3';
        return settings.llmModel || 'gemini-2.5-flash';
    };

    const panelContent = (
        <AnimatePresence>
            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 bg-transparent z-[190] pointer-events-auto"
                        onClick={() => { audioService.playClick(); onClose(); }}
                    />
                    <motion.div
                        initial={{ x: '100%', opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: '100%', opacity: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="fixed top-[84px] right-[42px] bottom-[81px] w-full md:w-[600px] lg:w-[800px] bg-transparent z-[200] pointer-events-auto shadow-2xl"
                    >
                        <div className="w-full h-full relative corner-frame overflow-visible flex flex-col">
                            <div className="bg-base-100/90 backdrop-blur-3xl rounded-none w-[calc(100%-6px)] h-[calc(100%-6px)] m-[3px] flex flex-col overflow-hidden relative z-10 border border-white/5">

                                {/* Header */}
                                <div className="flex justify-between items-center h-20 px-4 md:px-6 bg-base-100/40 flex-shrink-0 border-b border-base-300/20 relative shadow-md">
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 opacity-60 hover:opacity-100 z-10 hidden md:flex" aria-label="Toggle Sidebar">
                                            <SidebarIcon className="w-8 h-8" />
                                        </button>
                                        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 opacity-60 hover:opacity-100 z-10 md:hidden" aria-label="Toggle Sidebar">
                                            <SidebarIcon className="w-8 h-8" />
                                        </button>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-rajdhani text-[20px] uppercase tracking-[0.3em] font-logo">{getChatTitle()} ID : </h3>
                                                {activeSessionId && <span className="opacity-40 text-[20px]">{activeSessionId.substring(0, 4)}</span>}
                                            </div>
                                            <p className="text-[10px] uppercase tracking-[0.3em] text-base-content/50 font-mono hidden md:block">
                                                {getChatSubtitle()}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => { audioService.playClick(); onClose(); }} className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 opacity-40 hover:opacity-100 btn-snake" aria-label="Close panel">
                                            <span /><span /><span /><span />
                                            <CloseIcon className="w-5 h-5" />
                                        </button>
                                    </div>
                                    <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
                                </div>

                                {/* Two-pane layout */}
                                <div className="flex flex-row flex-grow overflow-hidden relative">

                                    {/* Inner left Sidebar */}
                                    <AnimatePresence>
                                        {isSidebarOpen && (
                                            <motion.div
                                                initial={{ width: 0, opacity: 0 }}
                                                animate={{ width: 240, opacity: 1 }}
                                                exit={{ width: 0, opacity: 0 }}
                                                transition={{ type: "tween", duration: 0.2 }}
                                                className="absolute md:relative z-30 flex flex-col border-r border-white/5 bg-base-100/95 shrink-0 h-full overflow-hidden w-[240px]"
                                            >
                                                <div className="p-3 border-b border-white/5 shrink-0 bg-base-200/50">
                                                    <button onClick={startNewSession} className="w-full btn btn-sm btn-outline btn-primary rounded-sm font-logo text-xs gap-2 shrink-0">
                                                        <PlusIcon className="w-4 h-4" /> NEW CHAT
                                                    </button>
                                                </div>
                                                <div className="flex-grow overflow-y-auto custom-scrollbar p-2 space-y-1">
                                                    {savedSessions.length === 0 && (
                                                        <div className="text-center p-4 text-xs font-mono opacity-30 mt-4">No saved sessions</div>
                                                    )}
                                                    {savedSessions.map(session => (
                                                        <div key={session.id} className={`group flex items-center justify-between p-2.5 rounded-md cursor-pointer transition-colors ${activeSessionId === session.id ? 'bg-primary/10 text-primary border border-primary/20' : 'hover:bg-base-200 text-base-content/70 border border-transparent'}`} onClick={() => loadSession(session.id)}>
                                                            <div className="truncate text-xs font-mono">{session.title}</div>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                                                                className="opacity-0 group-hover:opacity-100 p-1 text-error/60 hover:text-error transition-all"
                                                            >
                                                                <DeleteIcon className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                                {savedSessions.length > 0 && (
                                                    <div className="p-2 border-t border-white/5 shrink-0">
                                                        <button onClick={clearAllSessions} className="w-full btn btn-xs btn-ghost text-error/60 hover:text-error rounded-none font-logo">
                                                            CLEAR ALL HISTORY
                                                        </button>
                                                    </div>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* Chat View Area */}
                                    <div className="flex flex-col flex-grow min-w-0 bg-base-100/40">
                                        {/* Messages Area */}
                                        <div className="flex-grow overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-6">
                                            {messages.map((msg, index) => (
                                                <div key={index} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : msg.role === 'system' ? 'items-center' : 'items-start'}`}>
                                                    {msg.role === 'system' && !msg.content.includes('Control Node initialized. Awaiting commands.') && (
                                                        <div className="text-[10px] font-mono text-warning/80 bg-warning/10 px-3 py-1.5 rounded-lg border border-warning/20 inline-block my-2">
                                                            &gt; {msg.content}
                                                        </div>
                                                    )}

                                                    {msg.role === 'user' && (
                                                        <div className="bg-primary/30 text-base-content px-4 py-3 max-w-[80%] rounded-2xl rounded-tr-sm border border-primary/40 shadow-sm backdrop-blur-sm flex flex-col gap-2">
                                                            {msg.attachments && msg.attachments.length > 0 && (
                                                                <div className="flex flex-wrap gap-2">
                                                                    {msg.attachments.map((att, idx) => (
                                                                        <div key={idx} className="relative bg-black/20 rounded p-1 overflow-hidden" style={{ width: '80px', height: '80px' }}>
                                                                            {att.mimeType.startsWith('image/') ? (
                                                                                <img src={att.data} alt={att.fileName} className="w-full h-full object-cover rounded" />
                                                                            ) : (
                                                                                <div className="w-full h-full flex flex-col items-center justify-center text-xs opacity-70">
                                                                                    <PaperclipIcon className="w-6 h-6 mb-1" />
                                                                                    <span className="truncate w-full text-center px-1">{att.fileName}</span>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <div className="text-[15px] whitespace-pre-wrap">{msg.content}</div>
                                                        </div>
                                                    )}

                                                    {msg.role === 'assistant' && (
                                                        <div className="bg-base-200/80 text-base-content px-4 py-3 max-w-[95%] rounded-2xl rounded-tl-sm border border-white/5 shadow-sm backdrop-blur-sm">
                                                            <div className="prose prose-sm prose-invert max-w-none text-[15px] leading-relaxed">
                                                                <Markdown
                                                                    remarkPlugins={[remarkGfm]}
                                                                    components={{
                                                                        table: ({node, ...props}) => (
                                                                            <div className="overflow-x-auto my-4 w-full">
                                                                                <table className="table table-zebra w-full border border-base-content/10 text-[15px]" {...props} />
                                                                            </div>
                                                                        ),
                                                                        th: ({node, ...props}) => <th className="bg-base-300 text-base-content/80 font-bold text-[15px]" {...props} />,
                                                                        td: ({node, ...props}) => <td className="text-[15px]" {...props} />,
                                                                        code({ node, inline, className, children, ...props }: any) {
                                                                            const match = /language-(\w+)/.exec(className || '');
                                                                            return !inline && match ? (
                                                                                <SyntaxHighlighter
                                                                                    {...props}
                                                                                    style={vscDarkPlus}
                                                                                    language={match[1]}
                                                                                    PreTag="div"
                                                                                    className="rounded-md my-4 !bg-base-300"
                                                                                >
                                                                                    {String(children).replace(/\n$/, '')}
                                                                                </SyntaxHighlighter>
                                                                            ) : (
                                                                                <code {...props} className={`${className} bg-base-300 text-primary px-1.5 py-0.5 rounded text-[0.85em]`}>
                                                                                    {children}
                                                                                </code>
                                                                            )
                                                                        }
                                                                    }}
                                                                >
                                                                    {msg.content}
                                                                </Markdown>
                                                            </div>
                                                            {!msg.content && isProcessing && (
                                                                <div className="flex space-x-1 items-center h-4 mt-2">
                                                                    <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                                                    <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                                                    <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce"></div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                            <div ref={messagesEndRef} />
                                        </div>

                                        {/* Input Area */}
                                        <div className="p-4 border-t border-white/5 bg-base-200/30 shrink-0 relative">
                                            {showCommandMenu && (
                                                <div className="absolute bottom-[calc(100%-1rem)] left-4 mb-2 w-64 bg-[#2d2d2d] border border-white/10 rounded-xl shadow-xl overflow-hidden z-[100]">
                                                    <div className="max-h-60 overflow-y-auto w-full flex flex-col p-1 custom-scrollbar">
                                                        {availableCommands.filter(c => input.startsWith('/') ? c.cmd.toLowerCase().includes(input.toLowerCase().split(' ')[0]) : true).map((c, i) => (
                                                            <button
                                                                key={i}
                                                                type="button"
                                                                onClick={() => insertCommand(c.cmd)}
                                                                className="text-left py-2 px-3 hover:bg-white/10 rounded-md transition-colors flex flex-col w-full"
                                                            >
                                                                <span className="text-[#64b5f6] text-[12px] font-mono leading-none mb-1">{c.cmd.replace('/', '')}</span>
                                                                <span className="text-white/50 text-[10px] leading-tight mt-1">{c.desc}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <div className="bg-[#1e1e1e] border-t border-white/10 p-2 text-xs text-white/40 flex items-center font-mono">
                                                        <span className="text-white/60 mr-1">/</span> Type to filter
                                                    </div>
                                                </div>
                                            )}
                                            <form onSubmit={handleSubmit} className="relative bg-base-100/50 border border-white/10 focus-within:border-primary/50 transition-colors rounded-xl flex flex-col">
                                                {attachments.length > 0 && (
                                                    <div className="flex flex-wrap gap-2 px-4 pt-3">
                                                        {attachments.map((att, idx) => (
                                                            <div key={idx} className="relative group bg-base-300 text-xs px-2 py-1 rounded flex items-center gap-1 border border-white/10">
                                                                <span className="truncate max-w-[120px]">{att.fileName}</span>
                                                                <button type="button" onClick={() => removeAttachment(idx)} className="text-white/40 hover:text-red-400">
                                                                    <CloseIcon className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                <textarea
                                                    ref={textareaRef}
                                                    value={input}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setInput(val);
                                                        if (val.startsWith('/') && !val.includes(' ')) {
                                                            setShowCommandMenu(true);
                                                        } else {
                                                            setShowCommandMenu(false);
                                                        }
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' && !e.shiftKey) {
                                                            e.preventDefault();
                                                            handleSubmit(e as any);
                                                        }
                                                    }}
                                                    placeholder="Enter command directive..."
                                                    className={`w-full bg-transparent px-4 ${attachments.length > 0 ? 'pt-2' : 'pt-4'} pb-2 text-[14px] font-mono focus:outline-none resize-none`}
                                                    disabled={isProcessing}
                                                    rows={1}
                                                    style={{ minHeight: '44px', maxHeight: '200px', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                                                />
                                                <style>{`
                                                    textarea::-webkit-scrollbar {
                                                        display: none;
                                                    }
                                                `}</style>
                                                <div className="flex items-center justify-between px-2 pb-2 mt-1">
                                                    <div className="flex gap-1 relative">
                                                        <input 
                                                            type="file" 
                                                            multiple 
                                                            className="hidden" 
                                                            ref={fileInputRef} 
                                                            onChange={handleFileChange} 
                                                            accept="image/*,application/pdf,text/plain,text/csv,text/markdown,application/json,.doc,.docx" 
                                                        />
                                                        <button
                                                            type="button"
                                                            title="Attach File"
                                                            onClick={() => fileInputRef.current?.click()}
                                                            disabled={isProcessing || attachments.length >= 5}
                                                            className="text-white/50 hover:text-white p-2 rounded-lg transition-colors disabled:opacity-50"
                                                        >
                                                            <PaperclipIcon className="w-4 h-4" />
                                                        </button>
                                                        
                                                        <div className="relative flex items-center justify-center">
                                                            <button
                                                                type="button"
                                                                title="Insert Command (/)"
                                                                onClick={() => {
                                                                    setShowCommandMenu(!showCommandMenu);
                                                                    if (!showCommandMenu && !input.startsWith('/')) {
                                                                        setInput('/' + input);
                                                                    }
                                                                    textareaRef.current?.focus();
                                                                }}
                                                                disabled={isProcessing}
                                                                className={`p-2 rounded-lg transition-colors font-mono font-bold leading-none w-8 h-8 flex items-center justify-center ${showCommandMenu ? 'text-primary bg-primary/10' : 'text-white/50 hover:text-white'} disabled:opacity-50`}
                                                            >
                                                                /
                                                            </button>
                                                        </div>

                                                        <button
                                                            type="button"
                                                            title="Toggle Web Search (Wikipedia for Local Models, Google for Gemini)"
                                                            onClick={() => setUseWebSearch(!useWebSearch)}
                                                            disabled={isProcessing}
                                                            className={`p-2 rounded-lg transition-colors ${useWebSearch ? 'text-primary bg-primary/10' : 'text-white/50 hover:text-white'} disabled:opacity-50`}
                                                        >
                                                            <GlobeIcon className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                    <div>
                                                        <button
                                                            type="submit"
                                                            title="Send Message"
                                                            disabled={(!input.trim() && attachments.length === 0) || isProcessing}
                                                            className="bg-primary hover:bg-primary-focus text-primary-content p-2 rounded-lg flex items-center justify-center transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            <SparklesIcon className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </form>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {/* Manual Corner Accents */}
                            <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/20 z-20 pointer-events-none" />
                            <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/20 z-20 pointer-events-none" />
                            <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/20 z-20 pointer-events-none" />
                            <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/20 z-20 pointer-events-none" />
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );

    return typeof document !== 'undefined' ? createPortal(panelContent, document.body) : null;
};
