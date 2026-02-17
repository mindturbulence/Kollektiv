import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
  useAutosizeTextArea(textAreaRef.current, text);

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
          onClose();
      } catch(e) {
          console.error("Failed to save prompt", e);
      } finally {
          setIsSaving(false);
      }
    }
  };

  const handleClose = () => {
    audioService.playModalClose();
    onClose();
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 bg-black/80 z-[1000] flex items-center justify-center p-4 animate-fade-in" onClick={handleClose}>
      <div 
        className="bg-base-100 rounded-none border border-base-300 shadow-2xl w-full max-w-3xl mx-auto flex flex-col max-h-[90vh] overflow-hidden" 
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-10 border-b border-base-300 bg-base-200/20 relative">
            <button onClick={handleClose} className="absolute top-6 right-6 btn btn-ghost btn-sm btn-square opacity-40 hover:opacity-100">
                <CloseIcon className="w-6 h-6" />
            </button>
            <h3 className="text-3xl font-black tracking-tighter text-base-content leading-none">
                {editingPrompt?.id ? 'EDIT' : 'ADD'}<span className="text-primary">.</span>
            </h3>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/30 mt-2">Modify prompt details and tags</p>
        </header>
        
        <div className="p-10 space-y-6 flex-grow overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="form-control">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Prompt Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle((e.currentTarget as any).value)}
                  className="input input-bordered rounded-none w-full font-bold tracking-tight h-10"
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
              className="textarea textarea-bordered rounded-none w-full min-h-[120px] font-medium leading-relaxed"
              placeholder="Paste or type your prompt here..."
              required
            />
          </div>

          <div className="form-control">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Tags</label>
            <div className="flex flex-wrap items-center gap-2 p-4 bg-base-200/50 border border-base-300 rounded-none min-h-[60px]">
                {tags.map(tag => (
                    <div key={tag} className="flex items-center gap-2 bg-base-100 border border-base-300 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 shadow-sm">
                        <span>{tag}</span>
                        <button type="button" onClick={() => handleRemoveTag(tag)} className="text-error hover:text-error-focus">&times;</button>
                    </div>
                ))}
                <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput((e.currentTarget as any).value)}
                    onKeyDown={handleTagInputKeyDown}
                    className="flex-grow bg-transparent outline-none text-xs font-bold uppercase tracking-widest p-1"
                    placeholder="ADD TAG..."
                />
            </div>
          </div>
        </div>
        
        <footer className="border-t border-base-300 flex bg-base-200/5 p-0 overflow-hidden flex-shrink-0">
          <button onClick={handleClose} className="btn flex-1 rounded-none uppercase font-black text-[10px] tracking-widest border-r border-base-300 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={!text.trim() || isSaving} className="btn btn-primary flex-1 rounded-none uppercase font-black text-[10px] tracking-widest shadow-lg transition-colors">
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </footer>
      </div>
    </div>
  );

  if (typeof (window as any).document !== 'undefined' && (window as any).document.body) {
    return createPortal(modalContent, (window as any).document.body);
  }
  return null;
};

export default PromptEditorModal;