
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { discoveryService, type DiscoveryCollection, type PromptItem } from '../services/discoveryService';
import {
    ScanLine,
    panelVariants,
    contentVariants
} from './AnimatedPanels';
import {
    SearchIcon,
    RefreshIcon,
    LayoutDashboardIcon,
    CloseIcon
} from './icons';
import { audioService } from '../services/audioService';
import { addSavedPrompt } from '../utils/promptStorage';
import { Idea } from '../types';

interface DiscoveryPageProps {
    onSendToBuilder: (state: any) => void;
    showGlobalFeedback: (message: string, isError?: boolean) => void;
    isExiting?: boolean;
    onClipIdea?: (idea: Idea) => void;
}

const TypewriterText: React.FC<{ text: string, speed?: number, delay?: number, onComplete?: () => void }> = ({ text, speed = 20, delay = 0, onComplete }) => {
    const [displayedText, setDisplayedText] = useState('');
    const [isComplete, setIsComplete] = useState(false);
    const onCompleteRef = React.useRef(onComplete);

    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    useEffect(() => {
        let isCancelled = false;
        let i = 0;
        let lastAudioPlay = 0;

        setDisplayedText('');
        setIsComplete(false);

        const startTyping = () => {
            if (isCancelled) return;
            const typeChar = () => {
                if (isCancelled) return;
                if (i < text.length) {
                    const charsToType = Math.floor(Math.random() * 3) + 1;
                    i += charsToType;
                    if (i > text.length) i = text.length;
                    setDisplayedText(text.substring(0, i));

                    const now = Date.now();
                    if (now - lastAudioPlay > 40) {
                        audioService.playType();
                        lastAudioPlay = now;
                    }

                    if (i < text.length) {
                        setTimeout(typeChar, speed + Math.random() * 20);
                    } else {
                        setIsComplete(true);
                        onCompleteRef.current?.();
                    }
                } else {
                    setIsComplete(true);
                    onCompleteRef.current?.();
                }
            };
            typeChar();
        };

        let delayTimer: NodeJS.Timeout;
        if (delay > 0) {
            delayTimer = setTimeout(startTyping, delay);
        } else {
            startTyping();
        }

        return () => {
            isCancelled = true;
            clearTimeout(delayTimer);
        };
    }, [text, speed, delay]);

    return (
        <>
            {displayedText}
            {!isComplete && (
                <span className="inline-block w-[0.4em] h-[1em] bg-current animate-[pulse_1s_ease-in-out_infinite] ml-1 align-middle translate-y-[-0.1em]" />
            )}
        </>
    );
};

const DetailPanel: React.FC<{
    prompt: PromptItem | null;
    onCopy: (text: string) => void;
    onClip: (p: PromptItem) => void;
    onClipboardClip: (p: PromptItem) => void;
    onSend: (text: string) => void;
}> = ({ prompt, onCopy, onClip, onClipboardClip, onSend }) => {
    const [isTitleDone, setIsTitleDone] = useState(false);

    // Reset title done state when prompt changes
    useEffect(() => {
        setIsTitleDone(false);
    }, [prompt?.id]);

    if (!prompt) {
        return (
            <div className="h-full flex flex-col items-center justify-center opacity-20 space-y-4">
                <LayoutDashboardIcon className="w-12 h-12" />
                <p className="text-[10px] font-black uppercase tracking-[0.4em]">Detail Node Idle</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col relative">
            <div className="flex-grow flex flex-col p-8 space-y-8 overflow-y-auto custom-scrollbar">
                <div className="space-y-1">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-base-content/50 shrink-0">Title</span>
                    <h2 className="text-[34px] font-jardhani tracking-tighter leading-tight break-all text-primary/80">
                        <TypewriterText
                            text={prompt.category || 'Archive Record'}
                            speed={50}
                            onComplete={() => setIsTitleDone(true)}
                        />
                    </h2>
                </div>

                <div className="space-y-3 flex-grow flex flex-col min-h-0">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-base-content/50 shrink-0">Prompt</span>
                    <div className="p-0 bg-base-100/50 backdrop-blur-sm relative flex-grow overflow-y-auto custom-scrollbar">
                        <p className="text-[16px] font-jardhani leading-relaxed  transition-colors">
                            {isTitleDone ? (
                                <TypewriterText text={prompt.prompt} speed={8} />
                            ) : (
                                <span className="inline-block w-[0.4em] h-[1em] bg-transparent animate-[pulse_1s_ease-in-out_infinite] ml-1 align-middle translate-y-[-0.1em]" />
                            )}
                        </p>
                    </div>
                </div>
            </div>

            {/* ACTION FOOTER */}
            <div className="h-14 flex items-stretch p-1.5 bg-base-100/10 backdrop-blur-md border-t border-white/10 gap-1.5 shrink-0">
                <button
                    onClick={() => onSend(prompt.prompt)}
                    className="btn btn-sm btn-ghost h-full rounded-none flex-1 text-[10px] tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake"
                    title="Send to Refiner"
                >
                    <span /><span /><span /><span />
                    Refine
                </button>
                <button
                    onClick={() => onClipboardClip(prompt)}
                    className="btn btn-sm btn-ghost h-full rounded-none flex-1 text-[10px] tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake"
                    title="Add to Clipboard"
                >
                    <span /><span /><span /><span />
                    Clip
                </button>
                <button
                    onClick={() => onCopy(prompt.prompt)}
                    className="btn btn-sm btn-ghost h-full rounded-none flex-1 text-[10px] tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake"
                    title="Copy to Clipboard"
                >
                    <span /><span /><span /><span />
                    Copy
                </button>
                <button
                    onClick={() => onClip(prompt)}
                    className="btn btn-sm btn-ghost h-full rounded-none flex-1 text-[10px] tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake"
                    title="Save to Memory"
                >
                    <span /><span /><span /><span />
                    Save
                </button>
            </div>
        </div>
    );
};

const TerminalDisplay: React.FC<{ prompt: PromptItem | null }> = ({ prompt }) => {
    const [text, setText] = useState('');
    const containerRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!prompt) {
            setText('> AWAITING ARCHIVE SELECTION_\n\n');
            return;
        }

        const randomHex = () => Math.floor(Math.random() * 16777215).toString(16).toUpperCase().padStart(6, '0');
        const latency = Math.floor(Math.random() * 24 + 4);

        const fullText = `> ESTABLISHING SECURE PROTOCOL...
> HANDSHAKE ACCEPTED [NODE_VER: 4.9.1.a]
> UPLINK LATENCY: ${latency}ms || PACKET_LOSS: 0.00%
>
> RECORD_ID: ${prompt.id}
> CATEGORY: ${prompt.category}
> TITLE: ${prompt.title}
> ENCRYPTION_MATRIX: AES-256-GCM / ${randomHex()}-${randomHex()}
> INTEGRITY_CHECKSUM: 0x${randomHex()}${randomHex()}... VERIFIED
>
> INITIATING DECRYPTION...
> EXECUTING [||||||||||||||||||||||||||||||||||||||||] 100%
>
${prompt.prompt}
>
> PAYLOAD EXTRACTED SECURELY.
> EOF_`;

        setText('');
        let i = 0;
        let isCancelled = false;
        let lastAudioPlay = 0;

        const typeChar = () => {
            if (isCancelled) return;
            if (i < fullText.length) {
                const charsToType = Math.floor(Math.random() * 3) + 2;
                i += charsToType;
                if (i > fullText.length) i = fullText.length;
                setText(fullText.substring(0, i));

                const now = Date.now();
                if (now - lastAudioPlay > 40) {
                    audioService.playType();
                    lastAudioPlay = now;
                }

                // Scroll to bottom
                if (containerRef.current) {
                    containerRef.current.scrollTop = containerRef.current.scrollHeight;
                }

                setTimeout(typeChar, 10 + Math.random() * 20);
            }
        };
        typeChar();

        return () => { isCancelled = true; };
    }, [prompt]);

    return (
        <div className="h-full w-full relative">
            {/* Fader at the top */}
            <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-base-100/80 to-transparent z-10 pointer-events-none" />
            <div ref={containerRef} className="h-full w-full p-6 pt-8 font-mono text-[10px] leading-[1.6] text-primary/80 overflow-y-auto scrollbar-hide whitespace-pre-wrap break-words relative">
                {text}
                <span className="inline-block w-1.5 h-2.5 bg-primary/80 animate-[pulse_1s_ease-in-out_infinite] ml-1 align-middle" />
            </div>
        </div>
    );
};

const DiscoveryPage: React.FC<DiscoveryPageProps> = ({
    onSendToBuilder,
    showGlobalFeedback,
    isExiting = false,
    onClipIdea
}) => {
    const [activeCollection, setActiveCollection] = useState<DiscoveryCollection | null>(null);
    const [prompts, setPrompts] = useState<PromptItem[]>([]);
    const [selectedPrompt, setSelectedPrompt] = useState<PromptItem | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    const LIMIT = 50;

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 600);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    useEffect(() => {
        const load = async () => {
            const cols = await discoveryService.getCollections();
            if (cols.length > 0) {
                setActiveCollection(cols[0]);
            }
        };
        load();
    }, []);

    useEffect(() => {
        if (!activeCollection) return;

        const loadContent = async () => {
            setIsLoading(true);
            setPrompts([]);
            setOffset(0);
            setHasMore(true);
            setSelectedPrompt(null);

            try {
                let md = '';
                if (debouncedSearchQuery) {
                    md = await discoveryService.searchPrompts(activeCollection, debouncedSearchQuery, 0, LIMIT);
                } else {
                    md = await discoveryService.fetchPrompts(activeCollection, 0, LIMIT);
                }

                if (md.startsWith('---ERROR---')) {
                    const errorMsg = md.split('\n')[1] || 'Unknown Link Error';
                    showGlobalFeedback(errorMsg, true);
                    setPrompts([]);
                    return;
                }

                const extracted = discoveryService.parsePromptsFromMarkdown(md);
                const hasMoreFromSource = activeCollection.sourceType === 'huggingface' ? extracted.length >= (LIMIT * 0.8) : false;

                let results = extracted;
                if (debouncedSearchQuery) {
                    const q = debouncedSearchQuery.toLowerCase();
                    results = extracted.filter(p =>
                        p.prompt.toLowerCase().includes(q) ||
                        p.title.toLowerCase().includes(q) ||
                        p.category.toLowerCase().includes(q)
                    );
                }

                setPrompts(results);
                setHasMore(hasMoreFromSource);

                if (results.length === 0 && !debouncedSearchQuery) {
                    showGlobalFeedback('UPLINK_EMPTY: NO_RECORDS_FOUND');
                }
                // Removed the auto-loading as it can create infinite loops easily without state control
            } catch (err) {
                console.error('Discovery fetch error:', err);
                showGlobalFeedback('CRITICAL_UPLINK_FAILURE', true);
            } finally {
                setIsLoading(false);
            }
        };

        loadContent();
    }, [activeCollection, debouncedSearchQuery, showGlobalFeedback]);

    const handleLoadMore = async () => {
        if (!activeCollection || isLoadingMore) return;

        audioService.playClick();
        setIsLoadingMore(true);
        const newOffset = offset + LIMIT;

        try {
            let md = '';
            if (debouncedSearchQuery) {
                md = await discoveryService.searchPrompts(activeCollection, debouncedSearchQuery, newOffset, LIMIT);
            } else {
                md = await discoveryService.fetchPrompts(activeCollection, newOffset, LIMIT);
            }

            if (md.startsWith('---ERROR---')) {
                showGlobalFeedback('DATABASE_LINK_SEVERED', true);
                return;
            }

            const extracted = discoveryService.parsePromptsFromMarkdown(md);
            const hasMoreFromSource = activeCollection.sourceType === 'huggingface' ? extracted.length >= (LIMIT * 0.8) : false;

            let results = extracted;
            if (debouncedSearchQuery) {
                const q = debouncedSearchQuery.toLowerCase();
                results = extracted.filter(p =>
                    p.prompt.toLowerCase().includes(q) ||
                    p.title.toLowerCase().includes(q) ||
                    p.category.toLowerCase().includes(q)
                );
            }

            if (results.length > 0) {
                setPrompts(prev => [...prev, ...results]);
                setOffset(newOffset);
                setHasMore(hasMoreFromSource);
            } else {
                setOffset(newOffset);
                setHasMore(hasMoreFromSource);
                if (!hasMoreFromSource) {
                    showGlobalFeedback('DATABASE_TERMINUS_REACHED');
                }
            }
        } catch (err) {
            console.error('Discovery load more error:', err);
            showGlobalFeedback('UPLINK_INTERRUPTED', true);
        } finally {
            setIsLoadingMore(false);
        }
    };

    const isSearching = searchQuery !== debouncedSearchQuery;

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        audioService.playClick();
        showGlobalFeedback('SCRIPT_COPIED');
    };

    const handleClip = async (p: PromptItem) => {
        try {
            await addSavedPrompt({
                text: p.prompt,
                title: `${p.category} Sequence`,
                tags: ['Discovery', p.category]
            });
            audioService.playSuccess();
            showGlobalFeedback('SAVED_TO_VAULT');
        } catch (err) {
            console.error('Failed to save to vault:', err);
            showGlobalFeedback('VAULT_FAILURE', true);
        }
    };

    const handleClipboardClip = (p: PromptItem) => {
        if (!onClipIdea) return;
        const newIdea: Idea = {
            id: Date.now().toString(),
            title: p.category + ' Idea',
            prompt: p.prompt,
            lens: 'Discovery',
            source: 'Discovery'
        };
        onClipIdea(newIdea);
        audioService.playClick();
    };

    const handleSendToBuilder = (prompt: string) => {
        onSendToBuilder({ prompt, view: 'enhancer' });
        audioService.playClick();
    };

    return (
        <motion.div
            variants={panelVariants}
            initial="hidden"
            animate={isExiting ? "exit" : "visible"}
            className="flex h-full w-full gap-4"
        >
            {/* LEFT PANEL - FIXED WIDTH */}
            <div className="hidden lg:flex w-[300px] shrink-0 flex-col h-full relative group p-[1px] corner-frame">
                <div className="flex flex-col h-full w-full bg-base-100/50 backdrop-blur-xl relative overflow-hidden">
                    <ScanLine delay={1} />

                    {/* Left Panel Header */}
                    <div className="h-16 flex items-center px-6 bg-base-100/10 backdrop-blur-md border-b border-primary/10 flex-shrink-0 z-20">
                        <div className="flex items-center gap-3">
                            <span className="text-[12px] font-rajdhani uppercase tracking-[0.2em] text-base-content/80">UPLINK - TERMINAL</span>
                        </div>
                    </div>

                    <div className="flex-grow flex flex-col h-full overflow-hidden">
                        {activeCollection && (
                            <TerminalDisplay prompt={selectedPrompt} />
                        )}
                    </div>

                    <div className="p-5 border-t border-white/10 bg-white/[0.02] shrink-0">
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full ${isLoading ? 'bg-primary animate-pulse' : 'bg-success shadow-[0_0_8px_rgba(34,197,94,0.4)]'}`} />
                                <span className="text-[10px] font-rajdhani font-bold uppercase tracking-[0.2em] text-base-content/40">
                                    {isLoading ? 'SYNCING_BITSTREAM' : 'UPLINK_ESTABLISHED'}
                                </span>
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex justify-between text-[8px] font-mono text-base-content/20 uppercase tracking-widest">
                                    <span>Signal_Strength</span>
                                    <span>99.9%</span>
                                </div>
                                <div className="h-[1px] w-full bg-white/5 relative overflow-hidden">
                                    <motion.div
                                        animate={{ x: ['-100%', '100%'] }}
                                        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                        className="absolute inset-y-0 w-1/3 bg-primary/20"
                                    />
                                    <div className="h-full w-full bg-primary/10" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* CENTER PANEL - MAIN LIST */}
            <div className="flex-grow min-w-0 flex flex-col h-full relative p-[1px] corner-frame">
                <div className="flex flex-col h-full w-full bg-base-100/50 backdrop-blur-xl relative overflow-hidden">
                    <ScanLine delay={2} />

                    {/* Panel Header */}
                    <div className="h-16 flex items-center px-6 bg-base-100/10 backdrop-blur-md border-b border-primary/10 flex-shrink-0 z-20">
                        <div className="flex items-center gap-3">
                            <span className="text-[12px] font-rajdhani uppercase tracking-[0.2em] text-base-content/80">Discovery Vault Database</span>
                        </div>
                    </div>

                    {/* Search Area */}
                    <div className="border-b border-primary/10 bg-base-100/20 backdrop-blur-md sticky top-16 z-30">
                        <div className="flex items-center h-14 relative px-4">
                            {isSearching ? (
                                <RefreshIcon className="absolute left-8 w-4 h-4 text-primary animate-spin" />
                            ) : (
                                <SearchIcon className="absolute left-8 w-4 h-4 opacity-60 pointer-events-none" />
                            )}
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => { audioService.playHover(); setSearchQuery(e.target.value); }}
                                placeholder="SEARCH ARCHIVES..."
                                className="w-full h-full bg-transparent border-none focus:outline-none pl-14 pr-12 text-[12px] font-mono uppercase tracking-[0.2em] text-base-content/80 placeholder:text-base-content/40"
                            />
                            {searchQuery && (
                                <button onClick={() => { setSearchQuery(''); audioService.playClick(); }} className="absolute right-6 btn btn-xs btn-ghost btn-circle opacity-40">
                                    <CloseIcon className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Table Header */}
                    <div className="flex items-center px-5 py-5 border-b border-primary/10 bg-white/[0.05] text-[12px] font-rajdhani uppercase tracking-[0.3em] text-base-content/50">
                        <div className="w-[250px] shrink-0">Title</div>
                        <div className="flex-grow px-4 ml-4">Prompt</div>
                    </div>

                    {/* Scrollable List */}
                    <div className="flex-grow overflow-y-auto custom-scrollbar">
                        {isLoading ? (
                            <div className="h-full flex flex-col items-center justify-center opacity-40">
                                <RefreshIcon className="w-6 h-6 animate-spin text-primary" />
                                <span className="text-[12px] font-rajdhani mt-3 tracking-[0.4em] uppercase">Syncing</span>
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                {prompts.map((p, idx) => (
                                    <motion.div
                                        key={p.id}
                                        variants={contentVariants}
                                        custom={idx * 0.05}
                                        initial="hidden"
                                        animate="visible"
                                        onClick={() => { audioService.playClick(); setSelectedPrompt(p); }}
                                        className={`group px-5 py-4 flex items-center transition-all cursor-pointer relative border-b border-primary/10 overflow-hidden ${selectedPrompt?.id === p.id
                                            ? 'bg-primary/5'
                                            : 'bg-transparent hover:bg-white/[0.02]'
                                            }`}
                                    >
                                        <div className="w-[250px] shrink-0 text-[16px] font-rajdhani truncate">
                                            {p.category}
                                        </div>
                                        <div className="flex-grow min-w-0 px-4 ml-4 overflow-hidden">
                                            <h3 className={`text-[14px] font-jardhani tracking-tight truncate block w-full transition-colors ${selectedPrompt?.id === p.id ? 'text-base-content' : 'text-base-content/60 group-hover:text-base-content/90'}`}>
                                                {p.prompt.trim().replace(/\n/g, ' ')}
                                            </h3>
                                        </div>
                                    </motion.div>
                                ))}

                                {hasMore && (
                                    <button
                                        onClick={handleLoadMore}
                                        disabled={isLoadingMore}
                                        className="w-full py-6 flex items-center justify-center gap-3 text-[12px] font-rajdhani uppercase tracking-[0.4em] text-base-content/20 hover:text-primary transition-colors border-b border-white/5"
                                    >
                                        {isLoadingMore ? (
                                            <>
                                                <RefreshIcon className="w-3 h-3 animate-spin" />
                                                <span>Expanding Buffer</span>
                                            </>
                                        ) : (
                                            prompts.length === 0 ? 'Scan Deeper' : 'Load More'
                                        )}
                                    </button>
                                )}

                                {prompts.length === 0 && !isLoading && !hasMore && (
                                    <div className="py-20 text-center opacity-10">
                                        <p className="text-[12px] font-black uppercase tracking-widest">No Data Syncable</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Center Panel Footer */}
                    <div className="h-10 flex items-center justify-end px-6 border-t border-white/10 bg-white/[0.02] text-[12px] shrink-0">
                        <div className="flex items-center font-rajdhani gap-2 text-base-content/30 text-[12px] uppercase tracking-[0.2em]">
                            <span className="font-medium">RECORDS</span>
                            <span className="text-primary/60 font-bold">{prompts.length}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* RIGHT PANEL - FIXED WIDTH (DETAILS) */}
            <div className="hidden lg:flex w-[440px] shrink-0 flex-col h-full relative p-[1px] corner-frame">
                <div className="flex flex-col h-full w-full bg-base-100/50 backdrop-blur-xl relative overflow-hidden">
                    <ScanLine delay={3} />

                    {/* Right Panel Header */}
                    <div className="h-16 flex items-center px-6 bg-base-100/10 backdrop-blur-md border-b border-primary/10 flex-shrink-0 z-20">
                        <div className="flex items-center gap-3">
                            <span className="text-[12px] font-rajdhani uppercase tracking-[0.2em] uppercase text-base-content/70">Prompt Detail</span>
                        </div>
                    </div>

                    <DetailPanel
                        prompt={selectedPrompt}
                        onCopy={handleCopy}
                        onClip={handleClip}
                        onClipboardClip={handleClipboardClip}
                        onSend={handleSendToBuilder}
                    />
                </div>
            </div>
        </motion.div>
    );
};

export default DiscoveryPage;
