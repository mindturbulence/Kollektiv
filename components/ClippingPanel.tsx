import React, { useRef, useEffect, useState, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import type { Idea } from '../types';
import { CloseIcon, DeleteIcon, SparklesIcon, BookmarkIcon, RefreshIcon, CheckIcon, PlusIcon, ArchiveIcon } from './icons';
import CopyIcon from './CopyIcon';

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
                        <button onClick={onClose} className="absolute top-6 right-6 form-btn h-8 w-8 opacity-40 hover:opacity-100">
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
                        <button onClick={onClose} className="form-btn flex-1 h-14 rounded-none border-r border-base-300">Abort</button>
                        <button 
                            onClick={handleConfirm} 
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
        <div className="bg-base-100/40 backdrop-blur-xl p-4 rounded-none flex flex-col gap-3 transition-all hover:bg-primary/5 group">
            <div className="flex justify-between items-start">
                <div className="flex items-center gap-0 min-w-0">
                    <span className="text-3xl font-black text-base-content flex-shrink-0 font-mono leading-none tracking-tighter tabular-nums">
                        {displayNum}
                    </span>
                    
                    <div className="flex flex-col min-w-0 border-l border-base-300 pl-4 h-full py-0.5">
                        <span className="text-[8px] font-black uppercase tracking-widest text-primary/60 mb-0.5">
                            {idea.lens}
                        </span>
                        <p className="font-black text-xs text-base-content truncate uppercase tracking-tight" title={idea.title}>
                            {idea.title}
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => onRemove(idea.id)}
                    className="form-btn h-8 w-8 text-error/20 hover:text-error hover:bg-error/10 transition-colors"
                    title="Remove clip"
                >
                    <DeleteIcon className="w-3.5 h-3.5" />
                </button>
            </div>
            
            <p className="text-[11px] font-medium text-base-content/60 line-clamp-2 italic leading-relaxed" title={idea.prompt}>
                "{idea.prompt}"
            </p>
            
            <div className="flex gap-1 mt-2 pt-3 border-t border-base-300">
                <button
                    onClick={handleCopy}
                    className="form-btn flex-1 h-8 px-2"
                    title={copied ? "Copied!" : "Copy prompt"}
                >
                    {copied ? <CheckIcon className="w-3 h-3 mr-1.5 text-success" /> : <CopyIcon className="w-3.5 h-3.5 mr-1.5 opacity-40" />}
                    {copied ? 'OK' : 'COPY'}
                </button>
                <button
                    onClick={() => onInsert(idea.prompt)}
                    className="form-btn flex-1 h-8 px-2 hover:bg-base-300"
                    title="Send to Crafter"
                >
                    <RefreshIcon className="w-3 h-3 mr-1.5 opacity-40" />
                    CRAFT
                </button>
                 <button
                    onClick={() => onRefine(idea.prompt)}
                    className="form-btn flex-1 h-8 px-2 hover:bg-base-300"
                    title="Send back to Refiner"
                >
                    <SparklesIcon className="w-3 h-3 mr-1.5 opacity-40" />
                    REFINE
                </button>
                <button
                    onClick={() => onSave(idea)}
                    className="form-btn form-btn-primary flex-1 h-8 px-2"
                    title="Save to Prompt Library"
                >
                    <ArchiveIcon className="w-3 h-3 mr-1.5" />
                    SAVE
                </button>
            </div>
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
                className="fixed top-6 right-6 bottom-6 md:top-12 md:right-12 md:bottom-12 w-[calc(100%-3rem)] md:w-[480px] bg-transparent z-[1100] translate-x-full pointer-events-none"
                style={{ visibility: 'hidden' }}
                aria-hidden={!isOpen}
            >
                <div className="w-full h-full relative corner-frame overflow-visible flex flex-col pointer-events-auto">
                    <div className="bg-base-100/60 backdrop-blur-3xl rounded-none w-[calc(100%-6px)] h-[calc(100%-6px)] m-[3px] flex flex-col overflow-hidden relative z-10">
                        {/* Header */}
                        <div className="flex justify-between items-center h-16 px-6 bg-base-100/20 flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <BookmarkIcon className="w-5 h-5 text-primary"/>
                                <h3 className="font-black text-sm uppercase tracking-[0.3em]">Clipboard <span className="text-base-content/20 font-mono text-xs ml-2">[{clippedIdeas.length}]</span></h3>
                            </div>
                            <div className="flex items-center gap-1">
                                <button 
                                    onClick={() => setIsModalOpen(true)} 
                                    className="form-btn h-8 w-8 opacity-40 hover:opacity-100 hover:text-primary transition-all"
                                    title="Manual Entry"
                                >
                                    <PlusIcon className="w-5 h-5" />
                                </button>
                                {clippedIdeas.length > 0 && (
                                    <button 
                                        onClick={onClearAll} 
                                        className="form-btn h-8 w-8 opacity-40 hover:opacity-100 hover:text-error transition-all"
                                        title="Purge All Clips"
                                    >
                                        <DeleteIcon className="w-5 h-5" />
                                    </button>
                                )}
                                <button onClick={onClose} className="form-btn h-8 w-8 opacity-40 hover:opacity-100" aria-label="Close clipping panel">
                                    <CloseIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Body */}
                        <div ref={scrollRef} className="flex-grow p-6 overflow-y-auto relative">
                            {clippedIdeas.length > 0 ? (
                                <div className="flex flex-col gap-4">
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