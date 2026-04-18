import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import type { SavedPrompt, PromptCategory } from '../types';
import {
  ChevronLeftIcon, ChevronRightIcon, CloseIcon
} from './icons';

interface PromptDetailViewProps {
  prompts: SavedPrompt[];
  currentIndex: number;
  categories: PromptCategory[];
  onClose: () => void;
  onNavigate: (index: number) => void;
  onDelete: (prompt: SavedPrompt) => void;
  onUpdate: (id: string, updates: Partial<Omit<SavedPrompt, 'id' | 'createdAt'>>) => void;
  showGlobalFeedback: (message: string) => void;
  onClip: (prompt: SavedPrompt) => void;
}

const InfoRow: React.FC<{ label: string, children: React.ReactNode, action?: React.ReactNode }> = ({ label, children, action }) => (
    <div className="space-y-2 group/info">
        <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-[0.3em] text-white/30">{label}</span>
            {action && <div className="opacity-0 group-hover/info:opacity-100 transition-opacity">{action}</div>}
        </div>
        <div className="text-sm font-medium leading-relaxed text-white/80">
            {children}
        </div>
    </div>
);

const PromptTemplatePanel: React.FC<{
  prompt: SavedPrompt;
}> = ({ prompt }) => {
    return (
        <div className="space-y-8 animate-fade-in">
            <InfoRow label="ITEM ID">
                <span className="text-[11px] font-mono text-white/70 tracking-widest uppercase">
                    {prompt.id}
                </span>
            </InfoRow>

            <InfoRow label="REGISTRY FOLDER">
                <p className="text-white/60 font-black tracking-widest uppercase text-[11px]">
                    /PROMPTS/{prompt.categoryId || 'ROOT'}
                </p>
            </InfoRow>

            <InfoRow label="CREATION DATE">
                <span className="text-[11px] font-mono whitespace-nowrap">
                    {new Date(prompt.createdAt).toLocaleDateString()}
                </span>
            </InfoRow>

            <InfoRow label="WORD COUNT">
                <span className="text-[11px] font-mono whitespace-nowrap uppercase">
                    {prompt.text.split(' ').length} WORDS
                </span>
            </InfoRow>
        </div>
    );
};

const PromptDetailView: React.FC<PromptDetailViewProps> = ({
  prompts,
  currentIndex,
  categories,
  onClose,
  onNavigate,
  onDelete,
  onUpdate,
  showGlobalFeedback,
  onClip
}) => {
  const prompt = prompts[currentIndex] || null;
  const [editedText, setEditedText] = useState(prompt ? prompt.text : '');
  const [editedTitle, setEditedTitle] = useState(prompt ? prompt.title || '' : '');
  const [editedCategoryId, setEditedCategoryId] = useState(prompt ? prompt.categoryId || '' : '');
  const [editedTags, setEditedTags] = useState<string[]>(prompt ? prompt.tags || [] : []);
  const [tagInput, setTagInput] = useState('');
  const [copied, setCopied] = useState(false);

  const overlayRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const infoPanelRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    if (prompt) {
        setEditedText(prompt.text);
        setEditedTitle(prompt.title || '');
        setEditedCategoryId(prompt.categoryId || '');
        setEditedTags(prompt.tags || []);
        setTagInput('');
        setCopied(false);
    }
  }, [prompt]);

  useLayoutEffect(() => {
    if (!overlayRef.current || !modalRef.current || !leftPanelRef.current || !rightPanelRef.current || !headerRef.current || !infoPanelRef.current) return;

    const ctx = gsap.context(() => {
        const tl = gsap.timeline({ defaults: { ease: "expo.out", duration: 1.4 } });
        timelineRef.current = tl;
        
        // Initial state
        gsap.set(overlayRef.current, { opacity: 0 });
        gsap.set(modalRef.current, { 
            scale: 0.95, 
            transformOrigin: "center center",
            opacity: 0,
            y: 10
        });
        gsap.set(leftPanelRef.current, { opacity: 0 });
        gsap.set(rightPanelRef.current, { x: 40, opacity: 0 });
        gsap.set(headerRef.current, { y: -10, opacity: 0 });
        gsap.set(infoPanelRef.current, { opacity: 0, y: 10 });

        // Animation sequence
        tl.to(overlayRef.current, { opacity: 1, duration: 0.4 })
          .to(modalRef.current, { 
              scale: 1, 
              opacity: 1, 
              y: 0,
              duration: 1.0,
              ease: "expo.out"
          }, "-=0.2")
          .to(headerRef.current, { 
              y: 0, 
              opacity: 1, 
              duration: 0.5 
          }, "-=0.6")
          .to(leftPanelRef.current, { 
              opacity: 1, 
              duration: 1.0 
          }, "-=0.6")
          .to(rightPanelRef.current, { 
              x: 0, 
              opacity: 1, 
              duration: 0.8 
          }, "-=0.7")
          .to(infoPanelRef.current, {
              opacity: 1,
              y: 0,
              duration: 0.6
          }, "-=0.5");
    });

    return () => ctx.revert();
  }, []);

  const handleClose = useCallback(() => {
    if (timelineRef.current) {
        timelineRef.current.reverse().eventCallback("onReverseComplete", () => {
            onClose();
        });
    } else {
        onClose();
    }
  }, [onClose]);

  const handleNavigation = useCallback((direction: 'next' | 'prev') => {
    if (!prompts.length) return;
    const newIndex = direction === 'next'
      ? (currentIndex + 1) % prompts.length
      : (currentIndex - 1 + prompts.length) % prompts.length;
    onNavigate(newIndex);
  }, [currentIndex, prompts.length, onNavigate]);

  const handleCopyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        showGlobalFeedback("Copied.");
        setTimeout(() => setCopied(false), 2000);
      });
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const newTag = tagInput.trim();
        if (newTag && !editedTags.includes(newTag)) {
            setEditedTags([...editedTags, newTag]);
        }
        setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setEditedTags(editedTags.filter(tag => tag !== tagToRemove));
  };

  const handleSaveChanges = () => {
      if (prompt) {
          onUpdate(prompt.id, { 
            text: editedText,
            title: editedTitle,
            categoryId: editedCategoryId || undefined,
            tags: editedTags
          });
          showGlobalFeedback("Changes saved.");
          handleClose();
      }
  };
  
  const isDirty = prompt && (
    editedText.trim() !== (prompt.text || '').trim() ||
    editedTitle.trim() !== (prompt.title || '').trim() ||
    editedCategoryId !== (prompt.categoryId || '') ||
    JSON.stringify(editedTags) !== JSON.stringify(prompt.tags || [])
  );

  if (!prompt) return null;

  return (
    <div ref={overlayRef} className="absolute inset-0 z-40 bg-black/40 flex items-center justify-center p-4 lg:p-8 overflow-hidden" onClick={handleClose}>
        <div ref={modalRef} className="w-full h-full bg-transparent flex flex-col overflow-visible relative p-[3px] corner-frame" onClick={e => e.stopPropagation()}>
            <div className="w-full h-full bg-[#0a0a0a]/95 backdrop-blur-md flex flex-col overflow-hidden relative z-10 border border-white/5">
                <div className="flex-grow flex flex-col lg:flex-row overflow-hidden p-0 gap-0">
                    <main ref={leftPanelRef} className="flex-1 flex flex-col overflow-hidden bg-base-100/40 backdrop-blur-xl border-r border-white/5">
                        <div className="flex-grow p-1.5 relative overflow-hidden flex flex-col bg-transparent">
                            <div className="flex flex-col gap-4 p-8">
                                <div className="form-control w-full">
                                    <label className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 mb-2">Prompt Title</label>
                                    <input 
                                        type="text" 
                                        value={editedTitle}
                                        onChange={(e) => setEditedTitle(e.target.value)}
                                        placeholder="Enter prompt title..."
                                        className="form-input w-full uppercase"
                                    />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="form-control w-full">
                                        <label className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 mb-2">Category</label>
                                        <select 
                                            value={editedCategoryId}
                                            onChange={(e) => setEditedCategoryId(e.target.value)}
                                            className="form-select w-full"
                                        >
                                            <option value="">UNCATEGORIZED</option>
                                            {categories.map(cat => (
                                                <option key={cat.id} value={cat.id}>{cat.name.toUpperCase()}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-control w-full">
                                        <label className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 mb-2">Neural Tags (Comma or Enter to add)</label>
                                        <div className="flex flex-wrap items-center gap-2 px-4 py-1 bg-white/5 border border-white/10 rounded-none min-h-[44px] transition-all focus-within:border-primary/50">
                                            {editedTags.map(tag => (
                                                <div key={tag} className="flex items-center gap-2 bg-primary/10 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 text-primary border border-primary/20">
                                                    <span>{tag}</span>
                                                    <button type="button" onClick={() => handleRemoveTag(tag)} className="text-white/30 hover:text-error transition-colors text-xs">&times;</button>
                                                </div>
                                            ))}
                                            <input 
                                                type="text" 
                                                value={tagInput}
                                                onChange={(e) => setTagInput(e.target.value)}
                                                onKeyDown={handleTagInputKeyDown}
                                                placeholder={editedTags.length === 0 ? "ADD TAGS..." : ""}
                                                className="flex-grow bg-transparent outline-none text-[10px] font-bold uppercase tracking-widest h-8 text-white placeholder:text-white/10"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex-grow p-8 pt-0 relative overflow-hidden flex flex-col">
                                <textarea 
                                    value={editedText}
                                    onChange={(e) => setEditedText(e.target.value)}
                                    className="form-textarea flex-grow w-full bg-transparent text-xl font-medium leading-relaxed resize-none focus:outline-none p-0 border-none shadow-none text-white/90"
                                    placeholder="Type prompt here..."
                                ></textarea>
                            </div>
                        </div>
                        
                        <footer className="h-14 p-1.5 flex gap-1.5 bg-black/20 backdrop-blur-md items-stretch">
                            <button onClick={() => onClip(prompt)} className="btn btn-sm btn-ghost h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake font-display">
                                <span/><span/><span/><span/>
                                Clip
                            </button>
                            <button onClick={() => handleCopyToClipboard(editedText)} className="btn btn-sm btn-ghost h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake font-display">
                                <span/><span/><span/><span/>
                                {copied ? 'Copied' : 'Copy'}
                            </button>
                            <button onClick={() => onDelete(prompt)} className="btn btn-sm btn-ghost h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake text-error/60 hover:text-error font-display">
                                <span/><span/><span/><span/>
                                Delete
                            </button>
                            <button 
                                onClick={handleSaveChanges} 
                                disabled={!isDirty}
                                className={`btn btn-sm btn-ghost h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake font-display ${!isDirty ? 'opacity-20 cursor-not-allowed' : 'opacity-100'}`}
                            >
                                <span/><span/><span/><span/>
                                Save
                            </button>
                        </footer>
                    </main>
                    <aside className="w-full lg:w-[480px] flex-shrink-0 flex flex-col overflow-hidden relative border-l border-white/5 bg-base-100/40 backdrop-blur-xl">
                        <header ref={headerRef} className="flex-shrink-0 h-16 px-6 flex items-center justify-between border-b border-white/5 bg-white/5">
                            <div className="form-tab-group !w-auto">
                                <button onClick={() => handleNavigation('prev')} className="form-tab-item px-4"><ChevronLeftIcon className="w-4 h-4" /></button>
                                <span className="flex items-center px-4 font-mono text-[10px] font-black text-white/40 uppercase tracking-widest border-x border-white/10">{currentIndex + 1} / {prompts.length}</span>
                                <button onClick={() => handleNavigation('next')} className="form-tab-item px-4"><ChevronRightIcon className="w-4 h-4" /></button>
                            </div>
                            <button onClick={handleClose} className="p-2 text-white/20 hover:text-white transition-all hover:scale-110">
                                <CloseIcon className="w-5 h-5 stroke-[2]"/>
                            </button>
                        </header>
                        <div ref={rightPanelRef} className="flex-grow flex flex-col min-h-0 overflow-hidden relative">
                            <div ref={infoPanelRef} className="absolute inset-0 p-8 space-y-10 overflow-y-auto custom-scrollbar">
                                <PromptTemplatePanel prompt={prompt} />
                            </div>
                        </div>
                    </aside>
                </div>
            </div>
            {/* Manual Corner Accents */}
            <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
            <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
            <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
            <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
        </div>
    </div>
  );
};

export default PromptDetailView;