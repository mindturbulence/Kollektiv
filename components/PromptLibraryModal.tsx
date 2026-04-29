import React from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, ArchiveIcon } from './icons';
import type { SavedPrompt } from '../types';

interface PromptLibraryModalProps {
    isOpen: boolean;
    onClose: () => void;
    libraryItems: SavedPrompt[];
    onSelect: (prompt: SavedPrompt) => void;
}

const PromptLibraryModal: React.FC<PromptLibraryModalProps> = ({ isOpen, onClose, libraryItems, onSelect }) => {
    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl z-[1000] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="flex flex-col bg-transparent w-full max-w-2xl mx-auto relative p-[3px] corner-frame overflow-visible" onClick={(e) => e.stopPropagation()}>
                <div className="bg-base-100/40 backdrop-blur-xl rounded-none w-full flex flex-col overflow-hidden relative z-10">
                    <header className="px-8 py-4 border-b border-base-content/10 bg-transparent relative flex items-center justify-between">
                        <div className="flex flex-col">
                            <h3 className="text-xl font-black tracking-tighter text-base-content leading-none uppercase">
                                Prompt Library<span className="text-primary">.</span>
                            </h3>
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/30 mt-1.5">Neural Pattern Archival Access</p>
                        </div>
                        <button onClick={onClose} className="p-2 text-error/30 hover:text-error transition-all hover:scale-110">
                            <CloseIcon className="w-5 h-5" />
                        </button>
                    </header>

                    <div className="p-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                        {libraryItems.length === 0 ? (
                            <div className="p-16 text-center border border-dashed border-base-content/10 opacity-20">
                                <ArchiveIcon className="w-12 h-12 mx-auto mb-4" />
                                <p className="text-sm font-bold uppercase tracking-widest">Library is empty</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3">
                                {libraryItems.map(item => (
                                    <button 
                                        key={item.id}
                                        onClick={() => { onSelect(item); onClose(); }}
                                        className="p-5 text-left border border-base-content/5 hover:border-primary/40 hover:bg-primary/5 transition-all group flex flex-col gap-3"
                                    >
                                        <div className="flex justify-between items-start">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-primary/60 group-hover:text-primary transition-colors">{item.title || 'Untitled Pattern'}</span>
                                            <span className="text-[9px] font-mono opacity-20">{new Date(item.createdAt).toLocaleDateString()}</span>
                                        </div>
                                        <p className="text-sm line-clamp-3 italic opacity-60 group-hover:opacity-100 transition-opacity leading-relaxed">
                                            "{item.text}"
                                        </p>
                                        <div className="mt-2 flex justify-end">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-primary/40 group-hover:text-primary transition-all flex items-center gap-1">
                                                LOAD PATTERN <ArrowRightIcon className="w-2.5 h-2.5" />
                                            </span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    <footer className="p-6 bg-base-100/10 border-t border-base-content/10 flex justify-end">
                        <button onClick={onClose} className="btn btn-ghost rounded-none uppercase tracking-widest h-12 px-8 border border-base-content/5">
                            DISMISS
                        </button>
                    </footer>
                </div>
            </div>
            {/* Corner Decorative Frames */}
            <div className="absolute top-[-5px] left-[-5px] w-4 h-4 border-t-2 border-l-2 border-primary z-20 pointer-events-none" />
            <div className="absolute top-[-5px] right-[-5px] w-4 h-4 border-t-2 border-r-2 border-primary z-20 pointer-events-none" />
            <div className="absolute bottom-[-5px] left-[-5px] w-4 h-4 border-b-2 border-l-2 border-primary z-20 pointer-events-none" />
            <div className="absolute bottom-[-5px] right-[-5px] w-4 h-4 border-b-2 border-r-2 border-primary z-20 pointer-events-none" />
        </div>,
        document.body
    );
};

export default PromptLibraryModal;

const ArrowRightIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
);
