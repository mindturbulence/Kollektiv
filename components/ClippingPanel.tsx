import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { Idea } from '../types';
import { CloseIcon, DeleteIcon, SparklesIcon, BookmarkIcon, PlayIcon } from './icons';

interface ClippingPanelProps {
    isOpen: boolean;
    onClose: () => void;
    clippedIdeas: Idea[];
    onRemoveIdea: (id: string) => void;
    onClearAll: () => void;
    onInsertIdea: (prompt: string) => void;
    onRefineIdea: (prompt: string) => void;
}

const ClippedIdeaItem: React.FC<{
    idea: Idea;
    onRemove: (id: string) => void;
    onInsert: (prompt: string) => void;
    onRefine: (prompt: string) => void;
}> = ({ idea, onRemove, onInsert, onRefine }) => {
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

    return (
        <div className="bg-base-200 p-3 rounded-lg flex flex-col gap-2 transition-colors hover:bg-base-300">
            <div className="flex justify-between items-start">
                <p className="font-semibold text-sm text-primary flex-grow truncate" title={idea.title}>{idea.title}</p>
                <button
                    onClick={() => onRemove(idea.id)}
                    className="btn btn-xs btn-ghost btn-circle text-error/70 hover:text-error hover:bg-error/10"
                    title="Remove clip"
                >
                    <DeleteIcon className="w-4 h-4" />
                </button>
            </div>
            <p className="text-xs text-base-content/70 line-clamp-2" title={idea.prompt}>
                {idea.prompt}
            </p>
            <div className="flex gap-2 mt-1 pt-2 border-t border-base-content/10">
                <button
                    onClick={handleCopy}
                    className="btn btn-xs btn-ghost flex-1"
                    title={copied ? "Copied!" : "Copy prompt"}
                >
                    {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                    onClick={() => onInsert(idea.prompt)}
                    className="btn btn-xs btn-ghost flex-1"
                    title="Send to Composer"
                >
                    Compose
                </button>
                 <button
                    onClick={() => onRefine(idea.prompt)}
                    className="btn btn-xs btn-ghost text-accent flex-1"
                    title="Refine with AI"
                >
                    Refine
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
}) => {
    const panelRef = useRef<HTMLDivElement>(null);

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

    const panelAnimationClass = isOpen ? 'animate-slide-in-from-right' : 'animate-slide-out-to-right pointer-events-none';

    return (
        <div
            ref={panelRef}
            className={`fixed top-4 right-4 bottom-4 w-96 bg-base-100 shadow-xl z-30 flex flex-col rounded-2xl border border-base-300 ${panelAnimationClass}`}
            aria-hidden={!isOpen}
        >
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-base-300 flex-shrink-0">
                <h3 className="font-bold text-lg flex items-center gap-2"><BookmarkIcon className="w-5 h-5"/>Clipboard ({clippedIdeas.length})</h3>
                <button onClick={onClose} className="btn btn-sm btn-ghost btn-circle" aria-label="Close clipping panel">
                    <CloseIcon className="w-5 h-5" />
                </button>
            </div>

            {/* Body */}
            <div className="flex-grow p-4 overflow-y-auto">
                {clippedIdeas.length > 0 ? (
                    <div className="space-y-3">
                        {clippedIdeas.map(idea => (
                            <ClippedIdeaItem
                                key={idea.id}
                                idea={idea}
                                onRemove={onRemoveIdea}
                                onInsert={onInsertIdea}
                                onRefine={onRefineIdea}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center text-base-content/60">
                         <BookmarkIcon className="w-12 h-12 mb-4" />
                        <p className="font-semibold">Your clipboard is empty.</p>
                        <p className="text-sm mt-1">Clip prompts from the library to save them here.</p>
                    </div>
                )}
            </div>

            {/* Footer */}
            {clippedIdeas.length > 0 && (
                <div className="p-4 border-t border-base-300 flex-shrink-0">
                    <button
                        onClick={onClearAll}
                        className="btn btn-sm btn-error btn-outline w-full"
                    >
                        Clear All Clips
                    </button>
                </div>
            )}
        </div>
    );
}

export default ClippingPanel;