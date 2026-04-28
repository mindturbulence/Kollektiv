import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import type { SavedPrompt, PromptCategory } from '../types';
import useAutosizeTextArea from '../utils/useAutosizeTextArea';
import { CloseIcon } from './icons';
import AutocompleteSelect from './AutocompleteSelect';
import { audioService } from '../services/audioService';

interface PromptEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (prompt: Omit<SavedPrompt, 'id' | 'createdAt'>) => Promise<void>;
  categories: PromptCategory[];
  editingPrompt?: Partial<SavedPrompt> | null;
}

const PromptEditorModal: React.FC<PromptEditorModalProps> = ({ isOpen, onClose, onSave, categories, editingPrompt }) => {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  useAutosizeTextArea(textAreaRef.current, text);

  useLayoutEffect(() => {
    if (!isOpen || !overlayRef.current || !modalRef.current || !headerRef.current || !bodyRef.current || !footerRef.current) return;

    const ctx = gsap.context(() => {
        const tl = gsap.timeline({ defaults: { ease: "power3.out", duration: 1.0 } });
        timelineRef.current = tl;
        
        // Initial state
        gsap.set(overlayRef.current, { opacity: 0 });
        gsap.set(modalRef.current, { 
            scale: 0.9, 
            transformOrigin: "center center",
            opacity: 0,
            y: 10
        });
        gsap.set(headerRef.current, { y: -5, opacity: 0 });
        gsap.set(bodyRef.current, { y: 10, opacity: 0 });
        gsap.set(footerRef.current, { y: 5, opacity: 0 });

        // Animation sequence
        tl.to(overlayRef.current, { opacity: 1, duration: 0.3 })
          .to(modalRef.current, { 
              scale: 1, 
              opacity: 1, 
              y: 0,
              duration: 0.7,
              ease: "expo.out"
          }, "-=0.15")
          .to(headerRef.current, { 
              y: 0, 
              opacity: 1, 
              duration: 0.4 
          }, "-=0.4")
          .to(bodyRef.current, { 
              y: 0, 
              opacity: 1, 
              duration: 0.6 
          }, "-=0.3")
          .to(footerRef.current, { 
              y: 0, 
              opacity: 1, 
              duration: 0.4 
          }, "-=0.4");
    });

    return () => ctx.revert();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
        audioService.playModalOpen();
        if (editingPrompt) {
          setTitle(editingPrompt.title || '');
          setText(editingPrompt.text || '');
          setCategoryId(editingPrompt.categoryId || '');
          setTags(editingPrompt.tags || []);
        } else {
          setTitle('');
          setText('');
          setCategoryId('');
          setTags([]);
        }
        setTagInput('');
        setIsSaving(false);
    }
  }, [editingPrompt, isOpen]);
  
  const categoryOptions = useMemo(() => [
    { label: 'UNCATEGORIZED', value: '' },
    ...categories.map(cat => ({ label: cat.name.toUpperCase(), value: cat.id }))
  ], [categories]);

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const newTag = tagInput.trim();
        if (newTag && !tags.includes(newTag)) {
            setTags([...tags, newTag]);
            audioService.playClick();
        }
        setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
    audioService.playClick();
  };


  const handleSave = async () => {
    if (text.trim() && !isSaving) {
      setIsSaving(true);
      try {
          await onSave({
            title: title.trim() || undefined,
            text: text.trim(),
            categoryId: categoryId || undefined,
            tags: tags,
            basePrompt: editingPrompt?.basePrompt,
            targetAI: editingPrompt?.targetAI
          });
          audioService.playClick();
          handleClose();
      } catch(e) {
          console.error("Failed to save prompt", e);
          setIsSaving(false);
      }
    }
  };

  const handleClose = () => {
    if (timelineRef.current) {
        timelineRef.current.reverse().eventCallback("onReverseComplete", () => {
            audioService.playModalClose();
            onClose();
        });
    } else {
        audioService.playModalClose();
        onClose();
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div ref={overlayRef} className="fixed inset-0 bg-black/60 backdrop-blur-xl z-[1000] flex items-center justify-center p-4 overflow-hidden" onClick={handleClose}>
      <div 
        ref={modalRef}
        className="w-full max-w-3xl mx-auto flex flex-col max-h-[90vh] relative p-[3px] corner-frame overflow-visible shadow-2xl" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col h-full w-full overflow-hidden relative z-10 bg-base-100/40 backdrop-blur-xl">
          <header ref={headerRef} className="px-8 py-4 panel-header bg-transparent relative flex-shrink-0 flex items-center justify-between">
              <div className="flex flex-col">
                  <h3 className="text-xl font-black tracking-tighter text-base-content leading-none">
                      {editingPrompt?.id ? 'EDIT' : 'ADD'}<span className="text-primary">.</span>
                  </h3>
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/30 mt-1.5">Modify prompt details and tags</p>
              </div>
              <button onClick={handleClose} className="p-2 text-error/30 hover:text-error transition-all hover:scale-110">
                  <CloseIcon className="w-5 h-5" />
              </button>
          </header>
          
          <div ref={bodyRef} className="p-10 space-y-8 flex-grow overflow-y-auto custom-scrollbar bg-transparent">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="form-control">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Prompt Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle((e.currentTarget as any).value)}
                    className="form-input w-full"
                    placeholder="E.g. Portrait Concept #1"
                  />
                </div>
                <div className="form-control">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Select Category</label>
                  <AutocompleteSelect 
                    value={categoryId} 
                    onChange={setCategoryId} 
                    options={categoryOptions} 
                    placeholder="SELECT REGISTRY FOLDER..." 
                  />
                </div>
            </div>

            <div className="form-control">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Prompt Text</label>
              <textarea
                ref={textAreaRef}
                value={text}
                onChange={(e) => setText((e.currentTarget as any).value)}
                className="form-textarea w-full min-h-[160px] font-medium leading-relaxed"
                placeholder="Paste or type your prompt here..."
                required
              />
            </div>

            <div className="form-control">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Metadata Tags</label>
              <div className="flex flex-wrap items-center gap-2 p-4 bg-base-100/20 border border-base-content/10 rounded-none min-h-[60px]">
                  {tags.map(tag => (
                      <div key={tag} className="flex items-center gap-2 bg-primary/10 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 text-primary">
                          <span>{tag}</span>
                          <button type="button" onClick={() => handleRemoveTag(tag)} className="text-error hover:text-white transition-colors">&times;</button>
                      </div>
                  ))}
                  <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput((e.currentTarget as any).value)}
                      onKeyDown={handleTagInputKeyDown}
                      className="flex-grow bg-transparent outline-none text-xs font-bold uppercase tracking-widest p-1 text-base-content"
                      placeholder="ADD TAG..."
                  />
              </div>
            </div>
          </div>
          
          <footer ref={footerRef} className="h-14 flex items-stretch bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 overflow-hidden flex-shrink-0 panel-footer">
            <button onClick={handleClose} className="btn btn-sm btn-ghost h-full flex-1 rounded-none tracking-wider uppercase btn-snake">
              <span/><span/><span/><span/>
              CANCEL
            </button>
            <button onClick={handleSave} disabled={!text.trim() || isSaving} className="btn btn-sm btn-primary h-full flex-1 rounded-none tracking-wider uppercase btn-snake-primary">
              <span/><span/><span/><span/>
              {isSaving ? 'SAVING...' : 'SAVE CHANGES'}
            </button>
          </footer>
        </div>

        {/* Manual Corner Accents */}
        <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
        <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
        <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
        <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
      </div>
    </div>
  );

  if (typeof (window as any).document !== 'undefined' && (window as any).document.body) {
    return createPortal(modalContent, (window as any).document.body);
  }
  return null;
};

export default PromptEditorModal;