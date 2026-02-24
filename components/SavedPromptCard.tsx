
import React, { useState, useCallback, useRef, useEffect, memo } from 'react';
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

const KeywordTag: React.FC<{ text: string }> = ({ text }) => (
    <span className="bg-base-300 text-base-content text-[9px] font-black uppercase tracking-widest py-1.5 px-3 rounded-none border border-base-300/50">
        {text}
    </span>
);

const SavedPromptCard: React.FC<SavedPromptCardProps> = memo(({ 
    prompt, 
    categoryName, 
    onDeleteClick, 
    onEditClick, 
    onSendToEnhancer, 
    onOpenDetailView, 
    onClip 
}) => {
  const [copied, setCopied] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
        document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);
  
  // Efficient overflow detection using single run on mount/change
  useEffect(() => {
    const element = textRef.current;
    if (element) {
        // Approximate height for 3 lines of text (approx 1.625 line height * 16px font * 3)
        // If content is significantly larger, allow expansion.
        setCanExpand(element.scrollHeight > 80); 
    }
  }, [prompt.text]);

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if(navigator.clipboard) {
      navigator.clipboard.writeText(prompt.text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }, [prompt.text]);
  
  const title = prompt.title?.trim() || prompt.basePrompt?.trim() || 'Untitled Prompt';
  const displayCategory = categoryName || 'Uncategorized';

  const dateObj = new Date(prompt.createdAt);
  const fullDate = isNaN(dateObj.getTime()) 
    ? 'Unknown Date' 
    : dateObj.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });

  return (
    <div className="flex flex-col group bg-base-100 transition-all duration-500 hover:bg-base-200/50 w-full overflow-hidden select-none h-fit">
      <div className="p-8 md:p-10 flex flex-col w-full h-full">
        {/* Header Section - Category Label and Menu Button Aligned */}
        <div className="mb-6 space-y-3">
          <div className="flex items-center gap-3">
             <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/60">{displayCategory}</span>
             <div className="flex-grow h-px bg-base-300/50"></div>
             
             <div className="relative flex-shrink-0" ref={menuRef}>
                <button
                  onClick={(e) => { e.stopPropagation(); setIsMenuOpen(!isMenuOpen); }}
                  className={`btn btn-xs btn-ghost btn-square transition-all ${isMenuOpen ? 'bg-base-300' : 'opacity-20 group-hover:opacity-100'}`}
                  title="Prompt options"
                >
                  <EllipsisVerticalIcon className="w-4 h-4" />
                </button>
                {isMenuOpen && (
                  <ul onClick={(e) => e.stopPropagation()} className="absolute right-0 mt-2 w-48 menu menu-sm bg-base-100 border border-base-300 shadow-2xl z-20 animate-fade-in p-1 rounded-none">
                    <li><button onClick={() => { onEditClick(prompt); setIsMenuOpen(false); }} className="w-full text-left font-bold py-2 flex items-center gap-2"><EditIcon className="w-4 h-4" /> Edit Details</button></li>
                    <div className="divider my-0 opacity-10"></div>
                    <li><button onClick={() => { onDeleteClick(prompt); setIsMenuOpen(false); }} className="w-full text-left text-error font-bold py-2 flex items-center gap-2"><DeleteIcon className="w-4 h-4" /> Delete Prompt</button></li>
                  </ul>
                )}
              </div>
          </div>
          
          <div className="space-y-3 cursor-pointer" onClick={onOpenDetailView}>
            <h2 className="text-3xl font-black tracking-tighter text-base-content leading-[0.9] capitalize group-hover:text-primary transition-colors break-words">
              {title}
            </h2>
            <div className="flex items-center gap-4 opacity-40">
                <span className="text-[9px] font-mono font-bold uppercase tracking-widest">ID: {prompt.id ? prompt.id.slice(-6) : 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Content Section - The Prompt Text */}
        <div className="flex-grow space-y-6">
            <div className="relative group/content">
                <div className={`relative transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${isExpanded ? 'max-h-[2000px]' : 'max-h-[78px] overflow-hidden'}`}>
                    <p 
                        ref={textRef} 
                        className={`text-base font-medium leading-relaxed text-base-content/80 italic pr-4 ${!isExpanded ? 'line-clamp-3' : ''}`}
                    >
                        "{prompt.text}"
                    </p>
                </div>
            </div>

            {canExpand && (
                <button 
                    onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }} 
                    className="text-primary text-[10px] font-black uppercase tracking-[0.2em] hover:underline transition-all active:scale-95"
                >
                    {isExpanded ? 'Collapse' : 'Expand'}
                </button>
            )}

            {prompt.tags && prompt.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                    {prompt.tags.map(t => <KeywordTag key={t} text={t} />)}
                </div>
            )}
        </div>

        {/* Footer Section - Date and Actions */}
        <div className="pt-8 flex justify-between items-center mt-8 border-t border-base-300/50">
            <div className="flex flex-col">
                <time className="text-sm font-mono font-bold text-base-content/40 tabular-nums uppercase">
                    {fullDate}
                </time>
            </div>
            
            <div className="flex items-center gap-1">
                <button onClick={(e) => { e.stopPropagation(); onClip(prompt); }} title="Clip Idea" className="btn btn-sm btn-ghost btn-square text-base-content/20 hover:text-primary transition-colors">
                    <BookmarkIcon className="w-4 h-4" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); onSendToEnhancer(prompt.text); }} title="Refine Prompt" className="btn btn-sm btn-ghost btn-square text-base-content/20 hover:text-primary transition-colors">
                    <SparklesIcon className="w-4 h-4" />
                </button>
                <button onClick={handleCopy} title="Copy Text" className="btn btn-sm btn-ghost btn-square text-base-content/20 hover:text-success transition-colors">
                    {copied ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
});

export default SavedPromptCard;
