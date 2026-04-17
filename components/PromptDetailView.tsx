import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import type { SavedPrompt } from '../types';
import {
  ChevronLeftIcon, ChevronRightIcon, CloseIcon
} from './icons';

interface PromptDetailViewProps {
  prompts: SavedPrompt[];
  currentIndex: number;
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
            <span className="text-[12px] font-black uppercase tracking-[0.3em] text-white/30">{label}</span>
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
            <InfoRow label="GENRE / STYLE">
                <span className="text-primary font-black uppercase tracking-widest text-[11px] px-2 py-0.5 bg-primary/10 border border-primary/20">
                    {prompt.tags?.find(t => t.toLowerCase() === 'style') || 'UNSPECIFIED'}
                </span>
            </InfoRow>

            <InfoRow label="SUBJECT COMPOSITION">
                <p className="text-white/70 italic leading-relaxed">
                    {prompt.text.split(',').slice(0, 3).join(', ')}...
                </p>
            </InfoRow>

            <InfoRow label="REGISTRY FOLDER">
                <p className="text-white/60 font-black tracking-widest uppercase text-[11px]">
                    /PROMPTS/{prompt.categoryId || 'ROOT'}
                </p>
            </InfoRow>

            <InfoRow label="ARCHIVE DATA">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <span className="block text-[9px] font-black text-white/20 uppercase mb-1">Created At</span>
                        <span className="text-[11px] font-mono whitespace-nowrap">{new Date(prompt.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div>
                        <span className="block text-[9px] font-black text-white/20 uppercase mb-1">Word Count</span>
                        <span className="text-[11px] font-mono">{prompt.text.split(' ').length} WORDS</span>
                    </div>
                </div>
            </InfoRow>
        </div>
    );
};

const PromptDetailView: React.FC<PromptDetailViewProps> = ({
  prompts,
  currentIndex,
  onClose,
  onNavigate,
  onDelete,
  onUpdate,
  showGlobalFeedback,
  onClip
}) => {
  const prompt = prompts[currentIndex] || null;
  const [editedText, setEditedText] = useState(prompt ? prompt.text : '');
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

  const handleSaveChanges = () => {
      if (prompt && editedText.trim() !== prompt.text.trim()) {
          onUpdate(prompt.id, { text: editedText });
          showGlobalFeedback("Changes saved.");
          handleClose();
      }
  };
  
  if (!prompt) return null;

  return (
    <div ref={overlayRef} className="absolute inset-0 z-40 bg-transparent flex items-center justify-center p-4 lg:p-8 overflow-hidden" onClick={handleClose}>
        <div ref={modalRef} className="w-full h-full bg-transparent flex flex-col overflow-visible relative p-[3px] corner-frame" onClick={e => e.stopPropagation()}>
            <div className="w-full h-full bg-base-100/40 backdrop-blur-xl flex flex-col overflow-hidden relative z-10 border border-white/5">
                <div className="flex-grow flex flex-col lg:flex-row overflow-hidden p-0 gap-0">
                    <main ref={leftPanelRef} className="flex-1 flex flex-col overflow-hidden bg-transparent border-r border-white/5">
                        <div className="flex-grow p-10 relative overflow-hidden flex flex-col bg-transparent">
                            <textarea 
                                value={editedText}
                                onChange={(e) => setEditedText(e.target.value)}
                                className="form-textarea flex-grow w-full bg-transparent text-lg font-medium leading-relaxed resize-none focus:outline-none p-0 border-none shadow-none text-white/90"
                                placeholder="Type prompt here..."
                            ></textarea>
                        </div>
                        
                        <footer className="h-14 p-1.5 flex gap-1.5 bg-black/20 backdrop-blur-md items-stretch">
                            <button onClick={() => onClip(prompt)} className="btn btn-sm btn-ghost h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake font-display">
                                <span/><span/><span/><span/>
                                Clip
                            </button>
                            <button onClick={() => onDelete(prompt)} className="btn btn-sm btn-ghost h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake text-error/60 hover:text-error font-display">
                                <span/><span/><span/><span/>
                                Delete
                            </button>
                            <button onClick={() => handleCopyToClipboard(editedText)} className="btn btn-sm btn-ghost h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake font-display">
                                <span/><span/><span/><span/>
                                {copied ? 'Copied' : 'Copy Text'}
                            </button>
                            <button 
                                onClick={handleSaveChanges} 
                                disabled={editedText.trim() === prompt.text.trim()}
                                className={`btn btn-sm btn-ghost h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake font-display ${editedText.trim() === prompt.text.trim() ? 'opacity-20 cursor-not-allowed' : 'opacity-100'}`}
                            >
                                <span/><span/><span/><span/>
                                Save Changes
                            </button>
                        </footer>
                    </main>
                    <aside className="w-full lg:w-[480px] flex-shrink-0 flex flex-col overflow-hidden relative border-l border-white/5 bg-transparent">
                        <header ref={headerRef} className="flex-shrink-0 p-6 flex flex-col gap-4 bg-white/5 backdrop-blur-md border-b border-white/10">
                            <div className="flex items-center justify-between">
                                <div className="form-tab-group !w-auto">
                                    <button onClick={() => handleNavigation('prev')} className="form-tab-item px-4"><ChevronLeftIcon className="w-4 h-4" /></button>
                                    <span className="flex items-center px-4 font-mono text-[10px] font-black text-white/40 uppercase tracking-widest border-x border-white/10">{currentIndex + 1} / {prompts.length}</span>
                                    <button onClick={() => handleNavigation('next')} className="form-tab-item px-4"><ChevronRightIcon className="w-4 h-4" /></button>
                                </div>
                                <button onClick={handleClose} className="p-2 text-white/20 hover:text-white transition-all hover:scale-110">
                                    <CloseIcon className="w-5 h-5 stroke-[2]"/>
                                </button>
                            </div>
                            <div className="min-w-0">
                                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary mb-1.5 block">ITEM ID : {prompt.id.slice(-8)}</span>
                                <h2 className="text-xl font-black tracking-tighter text-white leading-tight uppercase">
                                    {prompt.title || 'Untitled Prompt'}
                                </h2>
                            </div>
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