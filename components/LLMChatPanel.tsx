import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { streamChat } from '../services/llmService';
import { useSettings } from '../contexts/SettingsContext';
import { CloseIcon, SparklesIcon, SidebarIcon, PlusIcon, DeleteIcon, PaperclipIcon, CpuChipIcon } from './icons';
import { mcpService } from '../services/mcpService';
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
    const { settings, updateSettings } = useSettings();
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
    
    // Model Context Protocol (MCP) States
    const [showMcpPanel, setShowMcpPanel] = useState(false);
    const [mcpServerUrl, setMcpServerUrl] = useState(settings.mcpServerUrl || 'http://localhost:3010');
    const [mcpEnabled, setMcpEnabled] = useState(settings.mcpEnabled || false);
    const [mcpTools, setMcpTools] = useState<any[]>([]);
    const [mcpPrompts, setMcpPrompts] = useState<any[]>([]);
    const [mcpResources, setMcpResources] = useState<any[]>([]);
    const [mcpConnected, setMcpConnected] = useState<boolean | null>(null);
    const [isPingingMcp, setIsPingingMcp] = useState(false);
    const [selectedMcpTool, setSelectedMcpTool] = useState<any | null>(null);
    const [toolArgsInput, setToolArgsInput] = useState<string>('{}');
    const [toolRunning, setToolRunning] = useState(false);

    // Connect to MCP Server and retrieve capabilities (Tools, Prompts, Resources)
    const handleConnectMcp = async (customUrl?: string) => {
        const urlToUse = (customUrl || mcpServerUrl).trim();
        if (!urlToUse) return;

        setIsPingingMcp(true);
        audioService.playClick();
        try {
            const connected = await mcpService.ping(urlToUse);
            setMcpConnected(connected);
            if (connected) {
                const [tools, prompts, resources] = await Promise.all([
                    mcpService.listTools(urlToUse).catch(() => []),
                    mcpService.listPrompts(urlToUse).catch(() => []),
                    mcpService.listResources(urlToUse).catch(() => [])
                ]);
                setMcpTools(tools);
                setMcpPrompts(prompts);
                setMcpResources(resources);
                setMessages(prev => [
                    ...prev,
                    { role: 'system', content: `🛸 [MCP Connected]: Established Session at ${urlToUse} successfully. Cataloged ${tools.length} Tools, ${prompts.length} Prompts, ${resources.length} Resources.` }
                ]);
            } else {
                setMessages(prev => [
                    ...prev,
                    { role: 'system', content: `⚠️ [MCP Warning]: Unable to connect to MCP at ${urlToUse}. Verification failed.` }
                ]);
            }
        } catch (err: any) {
            setMcpConnected(false);
            
            // Build a highly-actionable troubleshooting guide for connection failure
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            let helpContent = `❌ [MCP Failure]: Connection failed: ${err.message}`;
            
            if (!isLocal && (urlToUse.includes('localhost') || urlToUse.includes('127.0.0.1') || urlToUse.includes('3010'))) {
                helpContent += `\n\n💡 **Why this is happening:** Since this Kollektiv app is hosted on Google's cloud servers, the remote container cannot connect to "localhost" running on your computer. Additionally, browsers block insecure HTTP requests (\`http://localhost:3010\`) from secure HTTPS pages due to **Mixed Content constraints**.\n\n` +
                               `🛠️ **How to solve this in 3 easy steps:**\n\n` +
                               `1. **Run a secure public tunnel** using **ngrok** to forward the local bridge: \n` +
                               `   \`ngrok http 3010\`\n\n` +
                               `2. **Copy the HTTPS URL** generated by ngrok (e.g., \`https://abcd-ef-gh.ngrok-free.app\`)\n\n` +
                               `3. **Update the address** in your Kollektiv settings to use that new HTTPS URL, then click Connect!`;
            } else {
                helpContent += `\n\n💡 **Troubleshooting suggestions:**\n` +
                               `1. Ensure that you have run \`node mcp-bridge.js\` in your terminal and that it started successfully without errors.\n` +
                               `2. Verify that Docker Desktop is running and that your local MCP server or containers (like Docker MCP client) are online.\n` +
                               `3. If you are accessing Kollektiv remotely, remember to expose port 3010 via a public secure HTTPS tunnel (such as ngrok) and configure the resulting HTTPS URL in the Settings.`;
            }

            setMessages(prev => [
                ...prev,
                { role: 'system', content: helpContent }
            ]);
        } finally {
            setIsPingingMcp(false);
        }
    };

    // Execute an MCP Tool from client console
    const handleRunMcpTool = async (toolName: string, argsObj: Record<string, any>) => {
        setToolRunning(true);
        audioService.playClick();
        try {
            setMessages(prev => [
                ...prev,
                { role: 'system', content: `⚙️ [MCP Execute]: Calling "${toolName}" with args: ${JSON.stringify(argsObj)}...` }
            ]);
            const response = await mcpService.callTool(mcpServerUrl, toolName, argsObj);
            
            // Format output string
            let outStr = '';
            if (response && Array.isArray(response)) {
                outStr = response.map((item: any) => item.text || JSON.stringify(item)).join('\n');
            } else if (response && typeof response === 'object') {
                outStr = JSON.stringify(response, null, 2);
            } else {
                outStr = String(response || 'No raw output');
            }

            setMessages(prev => [
                ...prev,
                { role: 'system', content: `✅ [MCP Success]: Tool "${toolName}" returned output:\n\n${outStr}` }
            ]);
        } catch (err: any) {
            setMessages(prev => [
                ...prev,
                { role: 'system', content: `🛑 [MCP Error]: Tool execution "${toolName}" failed: ${err.message}` }
            ]);
        } finally {
            setToolRunning(false);
        }
    };

    const [showCommandMenu, setShowCommandMenu] = useState(false);
    const availableCommands = [
        { cmd: '/mcp connect ', desc: 'Connect to MCP Server address' },
        { cmd: '/mcp list', desc: 'Discover MCP Tools & Resources' },
        { cmd: '/mcp call ', desc: 'Execute MCP Tool with arguments' },
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

    // Auto-focus chat textarea on open, finished processing, or session changes
    useEffect(() => {
        if (isOpen && !isProcessing) {
            const timer = setTimeout(() => {
                textareaRef.current?.focus();
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [isOpen, isProcessing, activeSessionId]);

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
            const arg = commandParts.slice(1).join(' ').trim();

            if (cmd === '/mcp') {
                const parts = arg.split(' ');
                const action = parts[0].toLowerCase();
                const rest = parts.slice(1).join(' ').trim();

                if (action === 'connect') {
                    const targetUrl = rest || mcpServerUrl;
                    setMcpServerUrl(targetUrl);
                    // Persist to LLMSettings automatically
                    updateSettings({
                        ...settings,
                        mcpServerUrl: targetUrl,
                        mcpEnabled: true
                    });
                    setMcpEnabled(true);
                    handleConnectMcp(targetUrl);
                    return;
                }

                if (action === 'list') {
                    if (mcpConnected === false || mcpTools.length === 0) {
                        setMessages(prev => [...prev, { role: 'system', content: 'MCP is not connected or has no items. Run `/mcp connect` first.' }]);
                    } else {
                        const toolDetails = mcpTools.map(t => `- **${t.name}**: ${t.description || 'No description'}`).join('\n');
                        const promptDetails = mcpPrompts.map(p => `- **${p.name}**: ${p.description || 'No description'}`).join('\n');
                        const resDetails = mcpResources.map(r => `- **${r.name}** (${r.uri})`).join('\n');
                        
                        setMessages(prev => [...prev, {
                            role: 'system',
                            content: `📡 **Active MCP Catalog Details**\n\n**Tools:**\n${toolDetails || '_None_'}\n\n**Prompts:**\n${promptDetails || '_None_'}\n\n**Resources:**\n${resDetails || '_None_'}`
                        }]);
                    }
                    return;
                }

                if (action === 'call') {
                    const toolName = rest.split(' ')[0];
                    const argsString = rest.substring(toolName.length).trim() || '{}';
                    if (!toolName) {
                        setMessages(prev => [...prev, { role: 'system', content: 'Usage: /mcp call <tool_name> <json_args>' }]);
                        return;
                    }

                    try {
                        const parsedArgs = JSON.parse(argsString);
                        handleRunMcpTool(toolName, parsedArgs);
                    } catch (err: any) {
                        setMessages(prev => [...prev, { role: 'system', content: `❌ Parameters must be valid JSON: ${err.message}` }]);
                    }
                    return;
                }

                setMessages(prev => [...prev, {
                    role: 'system',
                    content: `💡 **MCP Commands Help**\n- \`/mcp connect <url>\` - Associate and ping local/remote server (default: http://localhost:3010)\n- \`/mcp list\` - Review available Tools, Prompts, and Resources\n- \`/mcp call <tool> <args_json>\` - Call a function directly\n  _Example:_ \`/mcp call search_web {"query": "Vite React"}\``
                }]);
                return;
            }

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
                persistSession(next, currentSessionId || undefined);
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
                const generator = streamChat(currentMessages, settings);

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
        if (settings.activeLLM === 'llamacpp') return settings.llamacppModel || 'llamacpp';
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
                                            {showMcpPanel && (
                                                <div className="absolute bottom-[calc(100%-1.25rem)] left-4 mb-2 w-80 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-xl p-4 z-[100] flex flex-col gap-3 max-h-[420px] overflow-y-auto custom-scrollbar">
                                                    <div className="flex justify-between items-center pb-2 border-b border-white/5">
                                                        <div className="flex items-center gap-2">
                                                            <CpuChipIcon className="w-4 h-4 text-primary" />
                                                            <span className="text-xs font-bold uppercase tracking-wider text-white">Model Context Protocol</span>
                                                        </div>
                                                        <button 
                                                            type="button" 
                                                            onClick={() => setShowMcpPanel(false)}
                                                            className="text-white/40 hover:text-white transition-colors p-1 rounded hover:bg-white/5 animate-pulse"
                                                        >
                                                            <CloseIcon className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>

                                                    {/* MCP Enabled Switch */}
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="text-white/70">Enable Web Server Context</span>
                                                        <label className="relative inline-flex items-center cursor-pointer">
                                                            <input 
                                                                type="checkbox" 
                                                                checked={mcpEnabled}
                                                                onChange={(e) => {
                                                                    const val = e.target.checked;
                                                                    setMcpEnabled(val);
                                                                    updateSettings({
                                                                        ...settings,
                                                                        mcpEnabled: val
                                                                    });
                                                                    if (val) {
                                                                        handleConnectMcp();
                                                                    } else {
                                                                        setMcpConnected(null);
                                                                    }
                                                                }}
                                                                className="sr-only peer" 
                                                            />
                                                            <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                                                        </label>
                                                    </div>

                                                    {/* Server Configuration */}
                                                    <div className="flex flex-col gap-1.5 bg-black/30 p-2 rounded-lg border border-white/5">
                                                        <label className="text-[10px] uppercase tracking-wider text-white/40 font-mono">Server URL</label>
                                                        <div className="flex gap-1.5">
                                                            <input 
                                                                type="text" 
                                                                value={mcpServerUrl}
                                                                onChange={(e) => {
                                                                    setMcpServerUrl(e.target.value);
                                                                    updateSettings({
                                                                        ...settings,
                                                                        mcpServerUrl: e.target.value
                                                                    });
                                                                }}
                                                                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-white placeholder-white/20 flex-1 focus:outline-none font-mono"
                                                                placeholder="e.g. http://localhost:3100"
                                                                disabled={!mcpEnabled || isPingingMcp}
                                                            />
                                                            <button 
                                                                type="button" 
                                                                onClick={() => handleConnectMcp()}
                                                                disabled={!mcpEnabled || isPingingMcp}
                                                                className="bg-primary/20 text-primary hover:bg-primary/30 active:scale-95 disabled:opacity-30 disabled:pointer-events-none rounded-md px-2.5 py-1 text-xs font-mono font-bold transition-all"
                                                            >
                                                                {isPingingMcp ? '...' : (mcpConnected ? 'Sync' : 'Connect')}
                                                            </button>
                                                        </div>

                                                        {/* Status Details */}
                                                        {mcpEnabled && (
                                                            <div className="flex justify-between items-center text-[10px] mt-1 pr-1 font-mono">
                                                                <span className="text-white/40">Status:</span>
                                                                {mcpConnected === true ? (
                                                                    <span className="text-emerald-400 font-bold flex items-center gap-1">🟢 Connected</span>
                                                                ) : mcpConnected === false ? (
                                                                    <span className="text-rose-400 font-bold flex items-center gap-1">🔴 Unreachable</span>
                                                                ) : (
                                                                    <span className="text-white/30">Not Triggered</span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {mcpEnabled && mcpConnected && (
                                                        <div className="flex flex-col gap-2 mt-1">
                                                            {/* Catalog Counters */}
                                                            <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-center">
                                                                <div className="bg-white/5 p-1 rounded">
                                                                    <div className="text-primary font-bold">{mcpTools.length}</div>
                                                                    <div className="text-white/30">Tools</div>
                                                                </div>
                                                                <div className="bg-white/5 p-1 rounded">
                                                                    <div className="text-teal-400 font-bold">{mcpPrompts.length}</div>
                                                                    <div className="text-white/30">Prompts</div>
                                                                </div>
                                                                <div className="bg-white/5 p-1 rounded">
                                                                    <div className="text-amber-400 font-bold">{mcpResources.length}</div>
                                                                    <div className="text-white/30">Resources</div>
                                                                </div>
                                                            </div>

                                                            {/* Tool List Selection & Interactive Run */}
                                                            {mcpTools.length > 0 && (
                                                                <div className="flex flex-col gap-1.5 border-t border-white/5 pt-2">
                                                                    <div className="text-[10px] font-mono font-bold text-white/55">💡 Interactive Tool Console:</div>
                                                                    <select 
                                                                        value={selectedMcpTool?.name || ''}
                                                                        onChange={(e) => {
                                                                            const tool = mcpTools.find(t => t.name === e.target.value);
                                                                            setSelectedMcpTool(tool || null);
                                                                            if (tool && tool.inputSchema?.properties) {
                                                                                // Auto fill schema inputs keys
                                                                                const sampleArgs: Record<string, any> = {};
                                                                                Object.keys(tool.inputSchema.properties).forEach(k => {
                                                                                    sampleArgs[k] = "";
                                                                                });
                                                                                setToolArgsInput(JSON.stringify(sampleArgs, null, 2));
                                                                            }
                                                                        }}
                                                                        className="bg-black/60 border border-white/15 text-xs text-white rounded-md px-2 py-1 focus:outline-none"
                                                                    >
                                                                        <option value="">-- Choose target tool --</option>
                                                                        {mcpTools.map(t => (
                                                                            <option key={t.name} value={t.name}>{t.name}</option>
                                                                        ))}
                                                                    </select>

                                                                    {selectedMcpTool && (
                                                                        <div className="flex flex-col gap-1.5 mt-1 font-mono text-[10px] bg-black/20 p-2 rounded">
                                                                            <div className="text-white/60 leading-normal">{selectedMcpTool.description || 'No description provided'}</div>
                                                                            
                                                                            <div className="text-white/40 mt-1">Arguments (JSON):</div>
                                                                            <textarea 
                                                                                value={toolArgsInput}
                                                                                onChange={(e) => setToolArgsInput(e.target.value)}
                                                                                className="bg-black/50 text-white rounded p-1.5 border border-white/10 h-16 w-full focus:outline-none text-[10px] resize-none"
                                                                            />

                                                                            <button 
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    try {
                                                                                        const parsed = JSON.parse(toolArgsInput);
                                                                                        handleRunMcpTool(selectedMcpTool.name, parsed);
                                                                                    } catch (err: any) {
                                                                                        setMessages(p => [...p, { role: 'system', content: `Invalid JSON syntax: ${err.message}` }]);
                                                                                    }
                                                                                }}
                                                                                disabled={toolRunning}
                                                                                className="bg-primary text-primary-content hover:bg-opacity-90 rounded px-2.5 py-1 text-center font-bold font-mono text-[10px] leading-tight active:scale-95 disabled:opacity-50 transition-all mt-1"
                                                                            >
                                                                                {toolRunning ? 'Executing...' : `Execute ${selectedMcpTool.name}`}
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
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
                                                            title="Model Context Protocol (MCP) Console"
                                                            onClick={() => {
                                                                setShowMcpPanel(!showMcpPanel);
                                                                setShowCommandMenu(false);
                                                            }}
                                                            disabled={isProcessing}
                                                            className={`p-2 rounded-lg transition-colors flex items-center justify-center relative ${showMcpPanel ? 'text-primary bg-primary/10' : 'text-white/50 hover:text-white'} disabled:opacity-50`}
                                                        >
                                                            <CpuChipIcon className="w-4 h-4" />
                                                            {mcpEnabled && (
                                                                <span className={`absolute top-0.5 right-0.5 w-2 h-2 rounded-full border border-[#1e1e1e] ${mcpConnected ? 'bg-emerald-400' : 'bg-rose-400 opacity-60'}`}></span>
                                                            )}
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
