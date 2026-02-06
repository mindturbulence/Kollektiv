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
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-base-100 rounded-none border border-base-300 shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
                <header className="p-8 border-b border-base-300 bg-base-200/20 relative">
                    <button onClick={onClose} className="absolute top-6 right-6 btn btn-ghost btn-sm btn-square opacity-40 hover:opacity-100">
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
                            className="input input-bordered rounded-none font-bold uppercase tracking-tight h-10 w-full"
                            autoFocus
                        />
                    </div>
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Prompt Token Data</label>
                        <textarea 
                            placeholder="TOKEN STREAM..." 
                            value={text}
                            onChange={e => setText(e.target.value)}
                            className="textarea textarea-bordered rounded-none w-full min-h-[120px] font-medium leading-relaxed"
                        />
                    </div>
                </div>

                <footer className="border-t border-base-300 flex bg-base-200/5 p-0 overflow-hidden">
                    <button onClick={onClose} className="btn flex-1 rounded-none uppercase font-black text-[10px] tracking-widest border-r border-base-300 transition-colors">Abort</button>
                    <button 
                        onClick={handleConfirm} 
                        disabled={!text.trim()} 
                        className="btn btn-primary flex-1 rounded-none uppercase font-black text-[10px] tracking-widest shadow-lg transition-colors"
                    >
                        Store Token
                    </button>
                </footer>
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
        <div className="bg-base-200/50 border border-base-300 p-4 rounded-none flex flex-col gap-3 transition-all hover:bg-base-200 group">
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
                    className="btn btn-xs btn-square btn-ghost text-error/20 hover:text-error hover:bg-error/10 transition-colors"
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
                    className="btn btn-xs btn-ghost flex-1 h-8 min-h-0 font-black text-[9px] tracking-widest uppercase"
                    title={copied ? "Copied!" : "Copy prompt"}
                >
                    {copied ? <CheckIcon className="w-3 h-3 mr-1.5 text-success" /> : <CopyIcon className="w-3.5 h-3.5 mr-1.5 opacity-40" />}
                    {copied ? 'OK' : 'COPY'}
                </button>
                <button
                    onClick={() => onInsert(idea.prompt)}
                    className="btn btn-xs btn-ghost border border-base-300 flex-1 h-8 min-h-0 font-black text-[9px] tracking-widest uppercase hover:bg-base-300"
                    title="Send to Crafter"
                >
                    <RefreshIcon className="w-3 h-3 mr-1.5 opacity-40" />
                    CRAFT
                </button>
                 <button
                    onClick={() => onRefine(idea.prompt)}
                    className="btn btn-xs btn-ghost border border-base-300 flex-1 h-8 min-h-0 font-black text-[9px] tracking-widest uppercase hover:bg-base-300"
                    title="Send back to Refiner"
                >
                    <SparklesIcon className="w-3 h-3 mr-1.5 opacity-40" />
                    REFINE
                </button>
                <button
                    onClick={() => onSave(idea)}
                    className="btn btn-xs btn-primary flex-1 h-8 min-h-0 font-black text-[9px] tracking-widest uppercase shadow-lg"
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
                className="absolute top-0 right-0 bottom-0 w-full md:w-[512px] bg-base-100 shadow-2xl z-[100] flex flex-col border-l border-base-300 translate-x-full"
                style={{ visibility: 'hidden' }}
                aria-hidden={!isOpen}
            >
                {/* Header */}
                <div className="flex justify-between items-center h-16 px-6 border-b border-base-300 bg-base-200/20 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <BookmarkIcon className="w-5 h-5 text-primary"/>
                        <h3 className="font-black text-sm uppercase tracking-[0.3em]">Clipboard <span className="text-base-content/20 font-mono text-xs ml-2">[{clippedIdeas.length}]</span></h3>
                    </div>
                    <div className="flex items-center gap-1">
                        <button 
                            onClick={() => setIsModalOpen(true)} 
                            className="btn btn-sm btn-ghost btn-square opacity-40 hover:opacity-100 hover:text-primary transition-all"
                            title="Manual Entry"
                        >
                            <PlusIcon className="w-5 h-5" />
                        </button>
                        <button onClick={onClose} className="btn btn-sm btn-ghost btn-square opacity-40 hover:opacity-100" aria-label="Close clipping panel">
                            <CloseIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-grow p-6 overflow-y-auto custom-scrollbar">
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

                {/* Footer */}
                {clippedIdeas.length > 0 && (
                    <div className="p-6 border-t border-base-300 bg-base-200/20 flex-shrink-0">
                        <button
                            onClick={onClearAll}
                            className="btn btn-sm btn-ghost w-full rounded-none font-black text-[9px] tracking-[0.3em] uppercase text-error/40 hover:text-error hover:bg-error/5"
                        >
                            PURGE ALL CLIPS
                        </button>
                    </div>
                )}
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