
import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { SavedPrompt } from '../types';
import CopyIcon from './CopyIcon';
import { DeleteIcon, CheckIcon, EditIcon, EllipsisVerticalIcon, SparklesIcon, BookmarkIcon } from './icons';

interface SavedPromptCardProps {
  prompt: SavedPrompt;
  onDeleteClick: (prompt: SavedPrompt) => void;
  onEditClick: (prompt: SavedPrompt) => void;
  onSendToEnhancer: (text: string) => void;
  onOpenDetailView: () => void;
  onClip: (prompt: SavedPrompt) => void;
}

const SavedPromptCard: React.FC<SavedPromptCardProps> = ({ prompt, onDeleteClick, onEditClick, onSendToEnhancer, onOpenDetailView, onClip }) => {
  const [copied, setCopied] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !(menuRef.current as any).contains(event.target as any)) {
        setIsMenuOpen(false);
      }
    };
    if (typeof (window as any).document !== 'undefined') {
      (window as any).document.addEventListener('mousedown', handleClickOutside);
      return () => {
        (window as any).document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, []);
  
  useEffect(() => {
    // Reset expansion state when the prompt changes
    setIsExpanded(false);

    const checkOverflow = () => {
        const element = textRef.current;
        if (element) {
            // In its default clamped state, does the text overflow?
            setCanExpand((element as any).scrollHeight > (element as any).clientHeight);
        }
    };
    
    // We check after a very short delay to let the DOM render with the new text.
    const timer = setTimeout(checkOverflow, 50);

    return () => clearTimeout(timer);
  }, [prompt.text]);

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if(typeof (window as any).navigator !== 'undefined' && (window as any).navigator.clipboard) {
      (window as any).navigator.clipboard.writeText(prompt.text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }, [prompt.text]);
  
  const title = prompt.title?.trim() || prompt.basePrompt?.trim() || 'Untitled Prompt';

  return (
    <div className="card bg-base-100 shadow-xl border border-base-300 h-full flex flex-col">
      <div className="card-body p-4 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-start gap-2">
          <div className="flex-grow min-w-0 cursor-pointer" onClick={onOpenDetailView}>
            <h2 className="card-title text-base font-semibold truncate" title={title}>
              {title}
            </h2>
            {prompt.targetAI && (
                <div className="text-xs text-base-content/60 mt-1">
                    <span className="font-semibold uppercase tracking-wider">
                        {prompt.targetAI}
                    </span>
                </div>
            )}
          </div>
          <div className="relative flex-shrink-0" ref={menuRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsMenuOpen(!isMenuOpen);
              }}
              className="btn btn-sm btn-ghost btn-square"
              title="More options"
            >
              <EllipsisVerticalIcon className="w-5 h-5" />
            </button>
            {isMenuOpen && (
              <ul
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 mt-2 w-48 menu menu-sm dropdown-content bg-base-200 rounded-box shadow-xl z-10 animate-fade-in-up"
              >
                <li><a onClick={() => { onEditClick(prompt); setIsMenuOpen(false); }}><EditIcon className="w-4 h-4" /> Edit</a></li>
                <li><a onClick={() => { onDeleteClick(prompt); setIsMenuOpen(false); }} className="text-error"><DeleteIcon className="w-4 h-4" /> Delete</a></li>
              </ul>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-grow my-2">
          <p
            ref={textRef}
            className={`text-sm text-base-content/80 break-words ${!isExpanded ? 'line-clamp-5' : ''}`}
          >
            {prompt.text}
          </p>
           {canExpand && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-primary text-xs font-semibold mt-2 hover:underline"
            >
              {isExpanded ? 'Read less' : 'Read more'}
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="card-actions justify-between items-center mt-auto pt-2">
            <time dateTime={new Date(prompt.createdAt).toISOString()} className="text-xs text-base-content/60">
                {new Date(prompt.createdAt).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                })}
            </time>
            <div className="flex items-center">
                <button
                    onClick={(e) => { e.stopPropagation(); onClip(prompt); }}
                    title="Clip to Clipboard"
                    className="btn btn-sm btn-ghost btn-square"
                >
                    <BookmarkIcon className="w-5 h-5" />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onSendToEnhancer(prompt.text); }}
                    title="Send to Refine"
                    className="btn btn-sm btn-ghost btn-square"
                >
                    <SparklesIcon className="w-5 h-5" />
                </button>
                <button
                    onClick={handleCopy}
                    title={copied ? "Copied!" : "Copy prompt"}
                    className="btn btn-sm btn-ghost btn-square"
                >
                    {copied ? <CheckIcon className="w-5 h-5 text-success" /> : <CopyIcon className="w-5 h-5" />}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default SavedPromptCard;
