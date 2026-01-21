import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { SavedPrompt } from '../types';
import CopyIcon from './CopyIcon';
import { DeleteIcon, CheckIcon, EditIcon, EllipsisVerticalIcon, SparklesIcon, BookmarkIcon } from './icons';

interface SavedPromptCardProps {
  prompt: SavedPrompt;
  categoryName?: string;
  onDeleteClick: (prompt: SavedPrompt) => void;
  onEditClick: (prompt: SavedPrompt) => void;
  onSendToEnhancer: (text: string) => void;
  onOpenDetailView: () => void;
  onClip: (prompt: SavedPrompt) => void;
}

const SavedPromptCard: React.FC<SavedPromptCardProps> = ({ prompt, categoryName, onDeleteClick, onEditClick, onSendToEnhancer, onOpenDetailView, onClip }) => {
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
    setIsExpanded(false);
    const checkOverflow = () => {
        const element = textRef.current;
        if (element) setCanExpand((element as any).scrollHeight > (element as any).clientHeight);
    };
    const timer = setTimeout(checkOverflow, 100);
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
  
  const title = prompt.title?.trim() || prompt.basePrompt?.trim() || 'UNTITLED_IDEA';
  const displayCategory = categoryName || 'Uncategorized';

  return (
    <div className="flex flex-col group bg-base-100 transition-all duration-300 hover:bg-base-200/30 border-b border-base-300 last:border-b-0">
      <div className="p-8 flex flex-col h-full">
        {/* Header */}
        <div className="flex justify-between items-start gap-4 mb-4">
          <div className="flex-grow min-w-0 cursor-pointer" onClick={onOpenDetailView}>
            <div className="flex items-center gap-3 mb-2">
                 <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60 truncate">
                  {displayCategory}
                </span>
                <span className="text-[9px] font-mono text-base-content/20 truncate uppercase">ID: {prompt.id.slice(-6)}</span>
            </div>
            <h2 className="text-2xl font-black tracking-tighter text-base-content leading-tight truncate group-hover:text-primary transition-colors" title={title}>
              {title}
            </h2>
          </div>
          <div className="relative flex-shrink-0" ref={menuRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setIsMenuOpen(!isMenuOpen); }}
              className="btn btn-sm btn-ghost btn-square opacity-20 hover:opacity-100"
            >
              <EllipsisVerticalIcon className="w-5 h-5" />
            </button>
            {isMenuOpen && (
              <ul onClick={(e) => e.stopPropagation()} className="absolute right-0 mt-2 w-48 menu menu-sm bg-base-200 border border-base-300 shadow-2xl z-20 animate-fade-in">
                <li><a onClick={() => { onEditClick(prompt); setIsMenuOpen(false); }} className="font-bold"><EditIcon className="w-4 h-4" /> Rename / Tag</a></li>
                <li><a onClick={() => { onDeleteClick(prompt); setIsMenuOpen(false); }} className="text-error font-bold"><DeleteIcon className="w-4 h-4" /> Purge Entry</a></li>
              </ul>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-grow mb-6">
          <p
            ref={textRef}
            className={`text-sm font-medium leading-relaxed text-base-content/60 break-words italic ${!isExpanded ? 'line-clamp-4' : ''}`}
          >
            "{prompt.text}"
          </p>
           {canExpand && (
            <button onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }} className="text-primary text-[10px] font-black uppercase tracking-widest mt-3 hover:underline">
              {isExpanded ? 'Collapse' : 'Expand'}
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="pt-6 flex justify-between items-center mt-auto">
            <div className="flex flex-col">
                <span className="text-[8px] font-black uppercase tracking-widest text-base-content/20 mb-1">Archival Date</span>
                <time className="text-[10px] font-mono text-base-content/40">
                    {new Date(prompt.createdAt).toLocaleDateString()}
                </time>
            </div>
            
            <div className="flex items-center gap-1">
                <button onClick={(e) => { e.stopPropagation(); onClip(prompt); }} title="Clip to Notebook" className="btn btn-sm btn-ghost btn-square text-base-content/20 hover:text-primary">
                    <BookmarkIcon className="w-4 h-4" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); onSendToEnhancer(prompt.text); }} title="Analyze Artifact" className="btn btn-sm btn-ghost btn-square text-base-content/20 hover:text-primary">
                    <SparklesIcon className="w-4 h-4" />
                </button>
                <button onClick={handleCopy} title="Copy Token Stream" className="btn btn-sm btn-ghost btn-square text-base-content/20 hover:text-success">
                    {copied ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default SavedPromptCard;