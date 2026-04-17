import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { GalleryCategory } from '../types';
import { loadCategories } from '../utils/galleryStorage';
import { CloseIcon } from './icons';
import AutocompleteSelect from './AutocompleteSelect';

interface SaveToGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string, categoryId: string, notes: string) => void;
  imageUrls: string[];
  prompt: string;
}

const SaveToGalleryModal: React.FC<SaveToGalleryModalProps> = ({
  isOpen, onClose, onSave, imageUrls, prompt,
}) => {
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [notes, setNotes] = useState('');
  const [categories, setCategories] = useState<GalleryCategory[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadCategories().then(setCategories);
      if (prompt) setTitle(prompt.split(',')[0].trim().substring(0, 100));
    }
  }, [isOpen, prompt]);

  const categoryOptions = useMemo(() => [
    { label: 'MAIN COLLECTION', value: '' },
    ...categories.map(cat => ({ label: cat.name.toUpperCase(), value: cat.id }))
  ], [categories]);

  if (!isOpen) return null;
  
  const modalContent = (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xl z-[1000] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-4xl mx-auto flex flex-col max-h-[90vh] relative p-[3px] corner-frame overflow-visible shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="bg-base-100/40 backdrop-blur-xl rounded-none w-full flex flex-col overflow-hidden relative z-10">
          <header className="px-8 py-4 border-b border-base-content/5 bg-transparent relative flex-shrink-0 flex items-center justify-between">
              <div className="flex flex-col">
                  <h3 className="text-xl font-black tracking-tighter text-base-content leading-none">
                      SAVE<span className="text-primary">.</span>
                  </h3>
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/30 mt-1.5">Saving image result to gallery</p>
              </div>
              <button onClick={onClose} className="p-2 text-error/30 hover:text-error transition-all hover:scale-110">
                  <CloseIcon className="w-5 h-5" />
              </button>
          </header>

        <form onSubmit={(e) => { e.preventDefault(); onSave(title, categoryId, notes); }} className="flex flex-col flex-grow overflow-hidden">
            <div className="p-10 space-y-8 flex-grow overflow-y-auto">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-base-100/40 backdrop-blur-xl">
                    {imageUrls.map((url, index) => (
                    <div key={index} className="aspect-square bg-transparent">
                        <img src={url} alt="Result" className="w-full h-full object-cover" />
                    </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Title</label>
                            <input type="text" value={title} onChange={(e) => setTitle((e.currentTarget as any).value)} className="form-input w-full" required />
                        </div>
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Gallery Folder</label>
                            <AutocompleteSelect 
                              value={categoryId} 
                              onChange={setCategoryId} 
                              options={categoryOptions} 
                              placeholder="SELECT REGISTRY FOLDER..." 
                            />
                        </div>
                    </div>
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Description / Notes</label>
                        <textarea value={notes} onChange={(e) => setNotes((e.currentTarget as any).value)} className="form-textarea w-full h-full" rows={3} placeholder="Add keywords or notes..." />
                    </div>
                </div>
            </div>

            <footer className="h-14 flex items-stretch bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 overflow-hidden flex-shrink-0 border-t border-base-content/5">
                <button type="button" onClick={onClose} className="btn btn-sm btn-ghost h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake font-display">
                    <span/><span/><span/><span/>
                    CANCEL
                </button>
                <button type="submit" className="btn btn-sm btn-primary h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake-primary font-display">
                    <span/><span/><span/><span/>
                    SAVE IMAGE
                </button>
            </footer>
        </form>
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

export default SaveToGalleryModal;