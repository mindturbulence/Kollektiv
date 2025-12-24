import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { GalleryCategory } from '../types';
import { loadCategories } from '../utils/galleryStorage';

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
      if (prompt) {
          const potentialTitle = prompt.split(',')[0].trim();
          setTitle(potentialTitle.substring(0, 100));
      }
    }
  }, [isOpen, prompt]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(title, categoryId, notes);
  };

  if (!isOpen) {
    return null;
  }
  
  const modalContent = (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="modal-box w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-lg text-primary">Save to Gallery</h3>
        <form onSubmit={handleSubmit} className="py-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto bg-base-200 p-2 rounded-lg">
            {imageUrls.map((url, index) => (
              <img key={index} src={url} alt={`Result ${index + 1}`} className="w-full h-auto object-cover rounded-md" />
            ))}
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">Title</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle((e.currentTarget as any).value)}
              className="input input-bordered"
              required
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">Category (Optional)</span>
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId((e.currentTarget as any).value)}
              className="select select-bordered"
            >
              <option value="">Uncategorized</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">Notes (Optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes((e.currentTarget as any).value)}
              className="textarea textarea-bordered"
              rows={3}
            />
          </div>
          <div className="modal-action mt-4">
            <button type="button" onClick={onClose} className="btn btn-sm btn-ghost">Cancel</button>
            <button type="submit" className="btn btn-sm btn-primary">Save</button>
          </div>
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