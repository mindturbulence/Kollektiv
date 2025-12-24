
import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { SavedPrompt } from '../types';
import CopyIcon from './CopyIcon';
import { DeleteIcon, CheckIcon, EditIcon, EllipsisVerticalIcon, SparklesIcon } from './icons';

interface SavedPromptItemProps {
  prompt: SavedPrompt;
  onDeleteClick: (prompt: SavedPrompt) => void;
  onEditClick: (prompt: SavedPrompt) => void;
  onSendToEnhancer: (text: string) => void;
  onOpenDetailView: () => void;
}

const SavedPromptItem: React.FC<SavedPromptItemProps> = ({ prompt, onDeleteClick, onEditClick, onSendToEnhancer, onOpenDetailView }) => {
  const [copied, setCopied] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    <div className="bg-base-100 rounded-lg transition-all hover:bg-base-200/50">
        <div className="p-3 flex justify-between items-center gap-2">
            <div className="flex-grow min-w-0 cursor-pointer" onClick={onOpenDetailView}>
                <h4 className="font-semibold text-primary truncate" title={title}>
                  {title}
                </h4>
                <p className="text-sm text-base-content/70 truncate">{prompt.text}</p>
            </div>
            <div className="flex gap-2 flex-shrink-0 items-center">
                <div className="relative" ref={menuRef}>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsMenuOpen(!isMenuOpen);
                        }}
                        title="More options"
                        className="btn btn-sm btn-square btn-ghost"
                    >
                        <EllipsisVerticalIcon className="w-5 h-5" />
                    </button>
                    {isMenuOpen && (
                        <ul 
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 mt-2 w-48 menu menu-sm dropdown-content bg-base-200 rounded-box shadow-xl z-10 animate-fade-in-up"
                        >
                            <li><a onClick={() => { onEditClick(prompt); setIsMenuOpen(false); }}><EditIcon className="w-4 h-4" /> Edit</a></li>
                            <li><a onClick={(e) => { handleCopy(e); setIsMenuOpen(false); }}>
                                {copied ? <CheckIcon className="w-4 h-4 text-success" /> : <CopyIcon className="w-4 h-4" />}
                                {copied ? "Copied!" : "Copy"}
                            </a></li>
                            <li><a onClick={() => { onSendToEnhancer(prompt.text); setIsMenuOpen(false); }}><SparklesIcon className="w-4 h-4" /> Send to Refine</a></li>
                            <div className="divider my-1"></div>
                            <li><a onClick={() => { onDeleteClick(prompt); setIsMenuOpen(false); }} className="text-error"><DeleteIcon className="w-4 h-4" /> Delete</a></li>
                        </ul>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};

export default SavedPromptItem;
