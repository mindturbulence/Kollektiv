import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { SavedPrompt, PromptCategory } from '../types';
import useAutosizeTextArea from '../utils/useAutosizeTextArea';

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
        if (editingPrompt) {
          setTitle(editingPrompt.title || '');
          setText(editingPrompt.text || '');
          setCategoryId(editingPrompt.categoryId || '');
          setTags(editingPrompt.tags || []);
        } else {
          // Reset for new prompt
          setTitle('');
          setText('');
          setCategoryId('');
          setTags([]);
        }
        setTagInput('');
        setIsSaving(false); // Reset saving state when modal opens/content changes
    }
  }, [editingPrompt, isOpen]);
  
  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const newTag = tagInput.trim();
        if (newTag && !tags.includes(newTag)) {
            setTags([...tags, newTag]);
        }
        setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
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
            // Carry over existing metadata if editing/saving suggestion
            basePrompt: editingPrompt?.basePrompt,
            targetAI: editingPrompt?.targetAI
          });
          onClose();
      } catch(e) {
          console.error("Failed to save prompt from modal", e);
          // Optional: Show an error to the user within the modal
          // For now, we just ensure the saving state is reset.
      } finally {
          setIsSaving(false);
      }
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div 
        className="bg-base-100 rounded-lg shadow-2xl w-full max-w-2xl mx-auto flex flex-col max-h-[90vh]" 
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-semibold text-primary mb-4 p-6 pb-0 flex-shrink-0">
          {editingPrompt?.id ? 'Edit Prompt' : 'Save New Prompt'}
        </h3>
        
        <div className="space-y-4 flex-grow overflow-y-auto px-6 py-4">
          <div>
            <label htmlFor="manual-prompt-title" className="block text-sm font-medium text-base-content/80 mb-1">Title (Optional):</label>
            <input
              id="manual-prompt-title"
              type="text"
              value={title}
              onChange={(e) => setTitle((e.currentTarget as any).value)}
              className="input input-bordered input-sm w-full"
              placeholder="A short, memorable title..."
            />
          </div>
          <div>
            <label htmlFor="manual-prompt-text" className="block text-sm font-medium text-base-content/80 mb-1">Prompt Text:</label>
            <textarea
              id="manual-prompt-text"
              ref={textAreaRef}
              value={text}
              onChange={(e) => setText((e.currentTarget as any).value)}
              className="textarea textarea-bordered textarea-sm w-full"
              placeholder="Paste or type your prompt..."
              rows={5}
              required
            />
          </div>
          <div>
            <label htmlFor="manual-prompt-category" className="block text-sm font-medium text-base-content/80 mb-1">Category (Optional):</label>
            <select
              id="manual-prompt-category"
              value={categoryId}
              onChange={(e) => setCategoryId((e.currentTarget as any).value)}
              className="select select-bordered select-sm w-full"
            >
              <option value="">Uncategorized</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-base-content/80 mb-1">Tags (Optional):</label>
            <div className="flex flex-wrap items-center gap-2 p-2 bg-base-200 rounded-md min-h-[40px]">
                {tags.map(tag => (
                    <div key={tag} className="flex items-center gap-1 bg-primary text-primary-content text-xs font-semibold px-2 py-1 rounded-full">
                        <span>{tag}</span>
                        <button type="button" onClick={() => handleRemoveTag(tag)} className="text-primary-content/70 hover:text-primary-content font-bold">&times;</button>
                    </div>
                ))}
                <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput((e.currentTarget as any).value)}
                    onKeyDown={handleTagInputKeyDown}
                    className="flex-grow bg-transparent outline-none text-sm text-base-content"
                    placeholder={tags.length === 0 ? "Add tags (press Enter)..." : ""}
                />
            </div>
          </div>
        </div>
        
        <div className="flex justify-end gap-4 mt-auto p-6 pt-2 flex-shrink-0">
          <button onClick={onClose} className="btn btn-neutral btn-sm">Cancel</button>
          <button onClick={handleSave} disabled={!text.trim() || isSaving} className="btn btn-primary btn-sm">
            {isSaving ? 'Saving...' : (editingPrompt?.id ? 'Save Changes' : 'Save Prompt')}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof (window as any).document !== 'undefined' && (window as any).document.body) {
    return createPortal(modalContent, (window as any).document.body);
  }
  return null;
};

export default PromptEditorModal;