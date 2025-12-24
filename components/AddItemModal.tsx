
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { GalleryCategory } from '../types';
import { UploadIcon, CloseIcon } from './icons';
import { fileToBase64 } from '../utils/fileUtils';

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddItem: (
    type: 'image' | 'video',
    urls: string[],
    sources: string[],
    categoryId?: string,
    title?: string,
    tags?: string[],
    notes?: string
  ) => Promise<void>;
  categories: GalleryCategory[];
}

interface FilePreview {
  url: string;
  name: string;
  type: 'image' | 'video';
}

const AddItemModal: React.FC<AddItemModalProps> = ({ isOpen, onClose, onAddItem, categories }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<FilePreview[]>([]);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setFiles([]);
    setPreviews([]);
    setTitle('');
    setNotes('');
    setCategoryId('');
    setTags([]);
    setTagInput('');
    setIsProcessing(false);
    setError(null);
  }, []);
  
  useEffect(() => {
    if (isOpen) {
      resetState();
    }
  }, [isOpen, resetState]);

  useEffect(() => {
    // Cleanup blob URLs
    return () => {
      previews.forEach(p => URL.revokeObjectURL(p.url));
    };
  }, [previews]);

  const handleFileChange = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    const newFiles = Array.from(selectedFiles).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
    
    if (newFiles.length === 0) return;
    
    setFiles(f => [...f, ...newFiles]);
    const newPreviews: FilePreview[] = newFiles.map(f => ({
      url: URL.createObjectURL(f),
      name: f.name,
      type: f.type.startsWith('image/') ? 'image' : 'video'
    }));
    setPreviews(p => [...p, ...newPreviews]);

    if (files.length === 0 && newFiles.length === 1) {
        setTitle(newFiles[0].name.replace(/\.[^/.]+$/, ""));
    } else if (files.length === 0 && newFiles.length > 1) {
        setTitle(`New Group (${newFiles.length} items)`);
    }
  };

  const handleRemoveFile = (index: number) => {
    setFiles(f => f.filter((_, i) => i !== index));
    setPreviews(p => {
      const newPreviews = p.filter((_, i) => i !== index);
      URL.revokeObjectURL(p[index].url);
      return newPreviews;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setError(null);
    try {
      const dataUrls = await Promise.all(files.map(file => fileToBase64(file)));
      const sources = files.map(file => file.name);
      // Assuming all files are of the same type, based on the first file.
      const type = files[0].type.startsWith('image/') ? 'image' : 'video';
      
      await onAddItem(type, dataUrls, sources, categoryId || undefined, title, tags, notes);
      onClose();
    } catch (err) {
      console.error("Failed to add item:", err);
      setError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileChange((e.dataTransfer as any).files);
  };

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

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="modal-box w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-lg text-primary">Add New Item to Gallery</h3>
        <form onSubmit={handleSubmit} className="py-4 space-y-4">
            <div 
                onDrop={handleDrop} 
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onClick={() => (fileInputRef.current as any)?.click()}
                className={`p-6 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${isDragging ? 'border-primary bg-primary/10' : 'border-base-content/20 hover:border-primary/50'}`}
            >
                <input type="file" ref={fileInputRef} onChange={(e) => handleFileChange((e.currentTarget as any).files)} multiple accept="image/*,video/*" className="hidden"/>
                <UploadIcon className="w-10 h-10 mx-auto text-base-content/40 mb-2"/>
                <p className="text-base-content/70">Drop images or videos here</p>
                <p className="text-xs text-base-content/50">or click to browse</p>
            </div>

            {previews.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 max-h-48 overflow-y-auto bg-base-200 p-2 rounded-lg">
                    {previews.map((p, index) => (
                        <div key={index} className="relative group aspect-square">
                            {p.type === 'image' ? (
                                <img src={p.url} alt={p.name} className="w-full h-full object-cover rounded-md" />
                            ) : (
                                <video src={p.url} className="w-full h-full object-cover rounded-md" />
                            )}
                            <button
                                type="button"
                                onClick={() => handleRemoveFile(index)}
                                className="btn btn-xs btn-circle btn-error absolute -top-1 -right-1 opacity-0 group-hover:opacity-100"
                            >
                                <CloseIcon className="w-3 h-3"/>
                            </button>
                        </div>
                    ))}
                </div>
            )}
            
            <div className="form-control">
                <label className="label"><span className="label-text">Title</span></label>
                <input type="text" value={title} onChange={(e) => setTitle((e.currentTarget as any).value)} className="input input-bordered" required />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="form-control">
                    <label className="label"><span className="label-text">Category (Optional)</span></label>
                    <select value={categoryId} onChange={(e) => setCategoryId((e.currentTarget as any).value)} className="select select-bordered">
                        <option value="">Uncategorized</option>
                        {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                    </select>
                </div>
                
                <div className="form-control">
                  <label className="label"><span className="label-text">Tags (Optional)</span></label>
                  <div className="flex flex-wrap items-center gap-2 p-2 bg-base-200 rounded-lg min-h-[48px] h-full">
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

            <div className="form-control">
                <label className="label"><span className="label-text">Notes (Optional)</span></label>
                <textarea value={notes} onChange={(e) => setNotes((e.currentTarget as any).value)} className="textarea textarea-bordered" rows={2} />
            </div>
            
            {error && <p className="text-error text-sm">{error}</p>}
            
            <div className="modal-action mt-4">
                <button type="button" onClick={onClose} className="btn btn-sm btn-ghost">Cancel</button>
                <button type="submit" className="btn btn-sm btn-primary" disabled={files.length === 0 || isProcessing}>
                    {isProcessing ? 'Saving...' : 'Save to Gallery'}
                </button>
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

export default AddItemModal;
