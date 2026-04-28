import React, { useRef, useEffect, useState, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import type { Idea } from '../types';
import { CloseIcon, DeleteIcon, SparklesIcon, BookmarkIcon, RefreshIcon, PlusIcon, ArchiveIcon, CopyIcon } from './icons';
import { audioService } from '../services/audioService';

interface ClippingPanelProps {
    isOpen: boolean;
    onClose: () => void;
    clippedIdeas: Idea[];
    onRemoveIdea: (id: string) => void;
    onClearAll: () => void;
    onInsertIdea: (prompt: string) => void;
    onRefineIdea: (prompt: string) => void;
    onAddIdea: (idea: Idea) => void;
    onSaveToLibrary: (idea: Idea) => void;
}

const ManualClipModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onAdd: (title: string, text: string) => void;
}> = ({ isOpen, onClose, onAdd }) => {
    const [title, setTitle] = useState('');
    const [text, setText] = useState('');

    useEffect(() => {
        if (isOpen) {
            setTitle('');
            setText('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleConfirm = () => {
        if (!text.trim()) return;
        onAdd(title, text);
        onClose();
    };

    const modalContent = (
        <div className="fixed inset-0 bg-black/80 z-[1000] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="flex flex-col bg-transparent w-full max-w-lg mx-auto relative p-[3px] corner-frame overflow-visible" onClick={e => e.stopPropagation()}>
                <div className="bg-base-100/40 backdrop-blur-xl rounded-none w-full flex flex-col overflow-hidden relative z-10">
                    <header className="p-8 border-b border-base-300 bg-base-200/20 relative">
                        <button onClick={() => { audioService.playClick(); onClose(); }} className="absolute top-6 right-6 form-btn h-8 w-8 opacity-40 hover:opacity-100">
                            <CloseIcon className="w-6 h-6" />
                        </button>
                        <h3 className="text-3xl font-black tracking-tighter text-base-content leading-none">
                            NEW CLIP<span className="text-primary">.</span>
                        </h3>
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/30 mt-2">Manual Archival Record</p>
                    </header>

                    <div className="p-8 space-y-6">
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Entry Identity</label>
                            <input 
                                type="text" 
                                placeholder="TITLE..." 
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                className="form-input w-full"
                                autoFocus
                            />
                        </div>
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Prompt Token Data</label>
                            <textarea 
                                placeholder="TOKEN STREAM..." 
                                value={text}
                                onChange={e => setText(e.target.value)}
                                className="form-textarea w-full min-h-[120px]"
                            />
                        </div>
                    </div>

                    <footer className="border-t border-base-300 flex bg-transparent p-0 overflow-hidden">
                        <button onClick={() => { audioService.playClick(); onClose(); }} className="form-btn flex-1 h-14 rounded-none border-r border-base-300">Abort</button>
                        <button 
                            onClick={() => { audioService.playClick(); handleConfirm(); }} 
                            disabled={!text.trim()} 
                            className="form-btn form-btn-primary flex-1 h-14 rounded-none"
                        >
                            Store Token
                        </button>
                    </footer>
                </div>
                {/* Manual Corner Accents */}
                <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
            </div>
        </div>
    );

    return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};

const ClippedIdeaItem: React.FC<{
    idea: Idea;
    index: number;
    onRemove: (id: string) => void;
    onInsert: (prompt: string) => void;
    onRefine: (prompt: string) => void;
    onSave: (idea: Idea) => void;
}> = ({ idea, index, onRemove, onInsert, onRefine, onSave }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(() => {
        audioService.playClick();
        if (typeof window !== 'undefined' && (window as any).navigator?.clipboard) {
          (window as any).navigator.clipboard.writeText(idea.prompt)
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            })
            .catch((err: any) => {
              console.error('Failed to copy text: ', err);
            });
        }
      }, [idea.prompt]);

    const displayNum = String(index + 1).padStart(2, '0');

    return (
        <div className="flex flex-col group bg-transparent transition-all duration-700 hover:bg-primary/5 w-full overflow-hidden select-none h-fit border-b border-base-300/10 relative">
            <div className="flex flex-col w-full h-full p-4 md:p-6">
                {/* Header Section */}
                <div className="mb-4">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-3xl font-black text-base-content flex-shrink-0 font-mono leading-none tracking-tighter tabular-nums opacity-20">
                                {displayNum}
                            </span>
                            
                            <div className="flex flex-col min-w-0 border-l border-base-300/30 pl-3">
                                <span className="text-[9px] font-black uppercase tracking-[0.4em] text-primary/60 mb-1 leading-none">
                                    {idea.lens}
                                </span>
                                <h2 className="font-black text-sm text-base-content truncate uppercase tracking-tight font-logo leading-tight" title={idea.title}>
                                    {idea.title}
                                </h2>
                            </div>
                        </div>
                        <button
                            onClick={() => { audioService.playClick(); onRemove(idea.id); }}
                            className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 -content/20 hover:text-error transition-colors btn-snake ml-4"
                            title="Remove clip"
                        >
                            <span/><span/><span/><span/>
                            <DeleteIcon className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Content Section */}
                <div className="flex-grow mb-4">
                    <p className="text-sm font-medium leading-relaxed text-base-content/70 italic line-clamp-3" title={idea.prompt}>
                        "{idea.prompt}"
                    </p>
                </div>

                {/* Footer Section - Actions */}
                <div className="flex justify-between items-center mt-2 pt-4 border-t border-base-300/10">
                    <button
                        onClick={handleCopy}
                        className="uppercase tracking-widest -content/30 hover:text-primary transition-all flex items-center gap-1.5 group/btn"
                    >
                        <CopyIcon className="w-3 h-3 opacity-40 group-hover/btn:opacity-100" />
                        {copied ? 'COPIED' : 'COPY'}
                    </button>
                    <button
                        onClick={() => { audioService.playClick(); onInsert(idea.prompt); }}
                        className="uppercase tracking-widest -content/30 hover:text-primary transition-all flex items-center gap-1.5 group/btn"
                    >
                        <RefreshIcon className="w-3 h-3 opacity-40 group-hover/btn:opacity-100" />
                        CRAFT
                    </button>
                     <button
                        onClick={() => { audioService.playClick(); onRefine(idea.prompt); }}
                        className="uppercase tracking-widest -content/30 hover:text-primary transition-all flex items-center gap-1.5 group/btn"
                    >
                        <SparklesIcon className="w-3 h-3 opacity-40 group-hover/btn:opacity-100" />
                        REFINE
                    </button>
                    <button
                        onClick={() => { audioService.playClick(); onSave(idea); }}
                        className="uppercase tracking-widest -content/30 hover:text-primary transition-all flex items-center gap-1.5 group/btn"
                    >
                        <ArchiveIcon className="w-3 h-3 opacity-40 group-hover/btn:opacity-100" />
                        SAVE
                    </button>
                </div>
            </div>
            {/* Decorative Line (Frameline style) */}
            <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
    );
};

const ClippingPanel: React.FC<ClippingPanelProps> = ({
    isOpen,
    onClose,
    clippedIdeas,
    onRemoveIdea,
    onClearAll,
    onInsertIdea,
    onRefineIdea,
    onAddIdea,
    onSaveToLibrary,
}) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // GSAP Animation for the panel
    useLayoutEffect(() => {
        if (!panelRef.current) return;

        if (isOpen) {
            audioService.playPanelSlideIn();
            // Cancel any current animation
            gsap.killTweensOf(panelRef.current);
            gsap.to(panelRef.current, {
                x: 0,
                duration: 1.2,
                ease: "elastic.out(1, 0.75)",
                visibility: 'visible',
                pointerEvents: 'auto',
                opacity: 1
            });
        } else {
            audioService.playPanelSlideOut();
            // Cancel any current animation
            gsap.killTweensOf(panelRef.current);
            gsap.to(panelRef.current, {
                x: '100%',
                duration: 0.8,
                ease: "elastic.in(1, 0.75)",
                pointerEvents: 'none',
                opacity: 0,
                onComplete: () => {
                    // Set visibility to hidden only after the bounce animation is fully done
                    if (panelRef.current && !isOpen) {
                        panelRef.current.style.visibility = 'hidden';
                    }
                }
            });
        }
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (panelRef.current && !(panelRef.current as any).contains(event.target as any)) {
                onClose();
            }
        };

        if (isOpen && typeof (window as any).document !== 'undefined') {
            (window as any).document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            if (typeof (window as any).document !== 'undefined') {
                (window as any).document.removeEventListener('mousedown', handleClickOutside);
            }
        };
    }, [isOpen, onClose]);

    const handleAddManual = (title: string, text: string) => {
        const newIdea: Idea = {
            id: `manual-${Date.now()}`,
            lens: 'Manual',
            title: title.trim() || 'Untitled Manual Entry',
            prompt: text.trim(),
            source: 'User'
        };
        onAddIdea(newIdea);
    };

    return (
        <>
            <div
                ref={panelRef}
                className="absolute top-0 right-0 bottom-0 w-full md:w-[480px] bg-transparent z-[50] translate-x-full pointer-events-none"
                style={{ visibility: 'hidden' }}
                aria-hidden={!isOpen}
            >
                <div className="w-full h-full relative corner-frame overflow-visible flex flex-col pointer-events-auto">
                    <div className="bg-base-100/60 backdrop-blur-3xl rounded-none w-[calc(100%-6px)] h-[calc(100%-6px)] m-[3px] flex flex-col overflow-hidden relative z-10">
                        {/* Header */}
        <div className="flex justify-between items-center h-16 px-6 bg-base-100/20 flex-shrink-0 border-b border-base-300/10 relative">
                            <div className="flex items-center gap-3">
                                <BookmarkIcon className="w-5 h-5 text-primary"/>
                                <h3 className="font-black text-xs uppercase tracking-[0.3em] font-logo">Clipboard <span className="text-base-content/20 font-mono text-xs ml-2">[{clippedIdeas.length}]</span></h3>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => { audioService.playClick(); setIsModalOpen(true); }} 
                                    className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 opacity-40 hover:opacity-100 hover:text-primary transition-all btn-snake"
                                    title="Manual Entry"
                                >
                                    <span/><span/><span/><span/>
                                    <PlusIcon className="w-5 h-5" />
                                </button>
                                {clippedIdeas.length > 0 && (
                                    <button 
                                        onClick={() => { audioService.playClick(); onClearAll(); }} 
                                        className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 opacity-40 hover:opacity-100 hover:text-error transition-all btn-snake"
                                        title="Purge All Clips"
                                    >
                                        <span/><span/><span/><span/>
                                        <DeleteIcon className="w-5 h-5" />
                                    </button>
                                )}
                                <button onClick={() => { audioService.playClick(); onClose(); }} className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 opacity-40 hover:opacity-100 btn-snake" aria-label="Close clipping panel">
                                    <span/><span/><span/><span/>
                                    <CloseIcon className="w-5 h-5" />
                                </button>
                            </div>
                            {/* Decorative Line (Frameline style) */}
                            <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
                        </div>

                        {/* Body */}
                        <div ref={scrollRef} className="flex-grow p-0 overflow-y-auto relative scrollbar-thin">
                            {clippedIdeas.length > 0 ? (
                                <div className="flex flex-col divide-y divide-base-300/10">
                                    {clippedIdeas.map((idea, index) => (
                                        <ClippedIdeaItem
                                            key={idea.id}
                                            idea={idea}
                                            index={index}
                                            onRemove={onRemoveIdea}
                                            onInsert={onInsertIdea}
                                            onRefine={onRefineIdea}
                                            onSave={onSaveToLibrary}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center opacity-10 py-12">
                                    <BookmarkIcon className="w-16 h-16 mb-6" />
                                    <p className="text-xl font-black uppercase tracking-widest leading-none">Archives Empty</p>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] mt-4">Clip tokens from the library or add manually</p>
                                </div>
                            )}
                        </div>
                    </div>
                    {/* Manual Corner Accents */}
                    <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                    <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                    <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                    <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
                </div>
            </div>

            <ManualClipModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                onAdd={handleAddManual} 
            />
        </>
    );
}

export default ClippingPanel;