import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { GalleryCategory } from '../types';
import { loadCategories } from '../utils/galleryStorage';
import { CloseIcon } from './icons';

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

  if (!isOpen) return null;
  
  const modalContent = (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-base-100 rounded-none border border-base-300 shadow-2xl w-full max-w-4xl mx-auto flex flex-col max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <header className="p-10 border-b border-base-300 bg-base-200/20 relative">
            <button onClick={onClose} className="absolute top-6 right-6 btn btn-ghost btn-sm btn-square opacity-40 hover:opacity-100">
                <CloseIcon className="w-6 h-6" />
            </button>
            <h3 className="text-3xl font-black tracking-tighter text-base-content leading-none">
                SAVE<span className="text-primary">.</span>
            </h3>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/30 mt-2">Saving image result to gallery</p>
        </header>

        <form onSubmit={(e) => { e.preventDefault(); onSave(title, categoryId, notes); }} className="flex flex-col flex-grow overflow-hidden">
            <div className="p-10 space-y-8 flex-grow overflow-y-auto">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-base-300 border border-base-300">
                    {imageUrls.map((url, index) => (
                    <div key={index} className="aspect-square bg-base-100">
                        <img src={url} alt="Result" className="w-full h-full object-cover" />
                    </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Title</label>
                            <input type="text" value={title} onChange={(e) => setTitle((e.currentTarget as any).value)} className="input input-bordered rounded-none font-bold tracking-tight" required />
                        </div>
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Gallery Folder</label>
                            <select value={categoryId} onChange={(e) => setCategoryId((e.currentTarget as any).value)} className="select select-bordered rounded-none font-bold tracking-tight">
                                <option value="">Main Collection</option>
                                {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Description / Notes</label>
                        <textarea value={notes} onChange={(e) => setNotes((e.currentTarget as any).value)} className="textarea textarea-bordered rounded-none h-full" rows={3} placeholder="Add keywords or notes..." />
                    </div>
                </div>
            </div>

            <footer className="border-t border-base-300 flex bg-base-200/5 p-0 overflow-hidden flex-shrink-0">
                <button type="button" onClick={onClose} className="btn flex-1 rounded-none uppercase font-black text-[10px] tracking-widest border-r border-base-300 transition-colors">Cancel</button>
                <button type="submit" className="btn btn-primary flex-1 rounded-none uppercase font-black text-[10px] tracking-widest shadow-lg transition-colors">Save Image</button>
            </footer>
        </form>
      </div>
    </div>
  );
  
  if (typeof (window as any).document !== 'undefined' && (window as any).document.body) {
    return createPortal(modalContent, (window as any).document.body);
  }
  return null;
};

export default SaveToGalleryModal;