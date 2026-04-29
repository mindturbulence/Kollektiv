import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { streamChat } from '../services/llmService';
import { useSettings } from '../contexts/SettingsContext';
import { CloseIcon, SparklesIcon, SidebarIcon, PlusIcon, DeleteIcon } from './icons';
import { audioService } from '../services/audioService';
import Markdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { getSavedChatSessions, saveChatSession, deleteChatSession, clearAllChatSessions, ChatSession } from '../utils/chatStorage';
import { v4 as uuidv4 } from 'uuid';

interface LLMChatPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

export const LLMChatPanel: React.FC<LLMChatPanelProps> = ({ isOpen, onClose }) => {
    const { settings } = useSettings();
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [messages, setMessages] = useState<{ role: 'user' | 'assistant' | 'system', content: string }[]>([]);

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
        const title = settings.activeLLM === 'openclaw' ? 'OpenClaw Agent' :
            settings.activeLLM === 'ollama' ? 'Ollama Local' :
                settings.activeLLM === 'ollama_cloud' ? 'Ollama Cloud' : 'Gemini AI';
        setMessages([{ role: 'system', content: `${title} Control Node initialized. Awaiting commands.` }]);
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
            const title = settings.activeLLM === 'openclaw' ? 'OpenClaw Agent' :
                settings.activeLLM === 'ollama' ? 'Ollama Local' :
                    settings.activeLLM === 'ollama_cloud' ? 'Ollama Cloud' : 'Gemini AI';
            setMessages([{ role: 'system', content: `${title} Control Node initialized. Awaiting commands.` }]);
        }
    }, [settings.activeLLM]);

    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

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
        if (!input.trim() || isProcessing) return;

        audioService.playClick();
        const userCommand = input.trim();
        setInput('');

        const newMessages = [...messages, { role: 'user' as const, content: userCommand }];
        setMessages(newMessages);

        let currentSessionId = activeSessionId;
        // Save immediately as user types
        currentSessionId = persistSession(newMessages, currentSessionId || undefined);

        setIsProcessing(true);

        try {
            setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

            const generator = streamChat(newMessages, settings);

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

            // Final save after stream ends
            setMessages(prev => {
                persistSession(prev, currentSessionId);
                return prev;
            });

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
        if (settings.activeLLM === 'openclaw') return settings.openclawModel || 'ollama/kimi-k2.5:cloud';
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
                        className="fixed top-[84px] right-[42px] bottom-[74px] w-full md:w-[600px] lg:w-[800px] bg-transparent z-[200] pointer-events-auto shadow-2xl"
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
                                                    {msg.role === 'system' && (
                                                        <div className="text-[10px] font-mono text-warning/80 bg-warning/10 px-3 py-1.5 rounded-lg border border-warning/20 inline-block my-2">
                                                            &gt; {msg.content}
                                                        </div>
                                                    )}

                                                    {msg.role === 'user' && (
                                                        <div className="bg-primary/30 text-base-content px-4 py-3 max-w-[80%] rounded-2xl rounded-tr-sm border border-primary/40 shadow-sm backdrop-blur-sm">
                                                            <div className="text-[15px] whitespace-pre-wrap">{msg.content}</div>
                                                        </div>
                                                    )}

                                                    {msg.role === 'assistant' && (
                                                        <div className="bg-base-200/80 text-base-content px-4 py-3 max-w-[95%] rounded-2xl rounded-tl-sm border border-white/5 shadow-sm backdrop-blur-sm">
                                                            <div className="prose prose-sm prose-invert max-w-none text-[15px] leading-relaxed">
                                                                <Markdown
                                                                    components={{
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
                                        <div className="p-4 border-t border-white/5 bg-base-200/30 shrink-0">
                                            <form onSubmit={handleSubmit} className="relative bg-base-100/50 border border-white/10 focus-within:border-primary/50 transition-colors rounded-xl flex flex-col">
                                                <textarea
                                                    ref={textareaRef}
                                                    value={input}
                                                    onChange={(e) => setInput(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' && !e.shiftKey) {
                                                            e.preventDefault();
                                                            handleSubmit(e as any);
                                                        }
                                                    }}
                                                    placeholder="Enter command directive..."
                                                    className="w-full bg-transparent px-4 pt-4 pb-12 text-[14px] font-mono focus:outline-none resize-none"
                                                    disabled={isProcessing}
                                                    rows={1}
                                                    style={{ minHeight: '60px', maxHeight: '200px', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                                                />
                                                <style>{`
                                                    textarea::-webkit-scrollbar {
                                                        display: none;
                                                    }
                                                `}</style>
                                                <div className="absolute right-2 bottom-2">
                                                    <button
                                                        type="submit"
                                                        title="Send Message"
                                                        disabled={!input.trim() || isProcessing}
                                                        className="bg-primary hover:bg-primary-focus text-primary-content p-2 rounded-lg flex items-center justify-center transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <SparklesIcon className="w-4 h-4" />
                                                    </button>
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
