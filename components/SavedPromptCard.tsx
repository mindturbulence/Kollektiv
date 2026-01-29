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
  const contentRef = useRef<HTMLDivElement>(null);

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
    // Reset expansion state when prompt changes
    setIsExpanded(false);
    
    // Small delay to allow layout to settle before calculating scrollHeight
    const checkOverflow = () => {
        const element = textRef.current;
        if (element) {
            // Check if text exceeds approx 4 lines (baseline for line-clamp-4 is usually around 80-96px depending on line-height)
            setCanExpand(element.scrollHeight > 96);
        }
    };
    const timer = setTimeout(checkOverflow, 150);
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

  const fullDate = new Date(prompt.createdAt).toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  return (
    <div className="flex flex-col group bg-base-100 transition-all duration-300 hover:bg-base-200/30 border-b border-base-300">
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

        {/* Body with Animated Expansion */}
        <div className="flex-grow mb-6">
          <div 
            ref={contentRef}
            className={`relative overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${isExpanded ? 'max-h-[2000px]' : 'max-h-24'}`}
          >
            <p
              ref={textRef}
              className={`text-sm font-medium leading-relaxed text-base-content/60 break-words italic`}
            >
              "{prompt.text}"
            </p>
            
            {/* Subtle fade overlay for collapsed state */}
            {!isExpanded && canExpand && (
              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-base-100 to-transparent pointer-events-none transition-opacity duration-300 group-hover:from-base-200/30"></div>
            )}
          </div>

           {canExpand && (
            <button 
                onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }} 
                className="text-primary text-[10px] font-black uppercase tracking-[0.2em] mt-4 hover:underline flex items-center gap-1.5 transition-all active:scale-95"
            >
              {isExpanded ? 'COLLAPSE SEQUENCE' : 'EXPAND SEQUENCE'}
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="3" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className={`w-3 h-3 transition-transform duration-500 ${isExpanded ? 'rotate-180' : ''}`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="pt-6 flex justify-between items-center mt-auto border-t border-base-300/50">
            <div className="flex flex-col">
                <span className="text-[8px] font-black uppercase tracking-widest text-base-content/20 mb-1">Archival Date</span>
                <time className="text-[10px] font-mono font-bold text-base-content/40 uppercase">
                    {fullDate}
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