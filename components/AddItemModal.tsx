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
    return () => previews.forEach(p => URL.revokeObjectURL(p.url));
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
        setTitle(`Group_Item_${Date.now().toString().slice(-4)}`);
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
      const type = files[0].type.startsWith('image/') ? 'image' : 'video';
      await onAddItem(type, dataUrls, sources, categoryId || undefined, title, tags, notes);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
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
        if (newTag && !tags.includes(newTag)) setTags([...tags, newTag]);
        setTagInput('');
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-base-100 rounded-none border border-base-300 shadow-2xl w-full max-w-4xl mx-auto flex flex-col max-h-[95vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <header className="p-10 border-b border-base-300 bg-base-200/20 relative">
            <button onClick={onClose} className="absolute top-6 right-6 btn btn-ghost btn-sm btn-square opacity-40 hover:opacity-100">
                <CloseIcon className="w-6 h-6" />
            </button>
            <h3 className="text-3xl font-black tracking-tighter text-base-content leading-none">
                IMPORT<span className="text-primary">.</span>
            </h3>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/30 mt-2">Add files to your local gallery</p>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-col flex-grow overflow-hidden">
            <div className="flex-grow overflow-y-auto p-10 space-y-8">
                <div 
                    onDrop={handleDrop} 
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onClick={() => (fileInputRef.current as any)?.click()}
                    className={`p-12 border-4 border-dashed rounded-none text-center cursor-pointer transition-all ${isDragging ? 'border-primary bg-primary/10' : 'border-base-300 hover:border-primary/50 bg-base-200/20'}`}
                >
                    <input type="file" ref={fileInputRef} onChange={(e) => handleFileChange((e.currentTarget as any).files)} multiple accept="image/*,video/*" className="hidden"/>
                    <UploadIcon className="w-12 h-12 mx-auto text-base-content/20 mb-4"/>
                    <p className="text-sm font-black uppercase tracking-[0.2em] text-base-content/40">Drop files here or click to browse</p>
                </div>

                {previews.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-px bg-base-300 border border-base-300">
                        {previews.map((p, index) => (
                            <div key={index} className="relative aspect-square bg-base-100 group">
                                {p.type === 'image' ? (
                                    <img src={p.url} alt={p.name} className="w-full h-full object-cover" />
                                ) : (
                                    <video src={p.url} className="w-full h-full object-cover" />
                                )}
                                <button type="button" onClick={() => handleRemoveFile(index)} className="btn btn-xs btn-square btn-error absolute top-2 right-2 opacity-0 group-hover:opacity-100">✕</button>
                            </div>
                        ))}
                    </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Item Title</label>
                            <input type="text" value={title} onChange={(e) => setTitle((e.currentTarget as any).value)} className="input input-bordered rounded-none font-bold tracking-tight" required />
                        </div>
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Select Folder</label>
                            <select value={categoryId} onChange={(e) => setCategoryId((e.currentTarget as any).value)} className="select select-bordered rounded-none font-bold tracking-tight">
                                <option value="">General Library</option>
                                {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="space-y-6">
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Notes</label>
                            <textarea value={notes} onChange={(e) => setNotes((e.currentTarget as any).value)} className="textarea textarea-bordered rounded-none h-[126px]" placeholder="Add descriptions or details..." />
                        </div>
                    </div>
                </div>

                <div className="form-control">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Tags</label>
                    <div className="flex flex-wrap items-center gap-2 p-4 bg-base-200/50 border border-base-300 rounded-none">
                        {tags.map(tag => (
                            <div key={tag} className="flex items-center gap-2 bg-base-100 border border-base-300 text-[10px] font-black uppercase tracking-widest px-3 py-1.5">
                                <span>{tag}</span>
                                <button type="button" onClick={() => setTags(tags.filter(t => t !== tag))} className="text-error">&times;</button>
                            </div>
                        ))}
                        <input type="text" value={tagInput} onChange={(e) => setTagInput((e.currentTarget as any).value)} onKeyDown={handleTagInputKeyDown} className="flex-grow bg-transparent outline-none text-xs font-bold uppercase tracking-widest" placeholder="ADD TAG..."/>
                    </div>
                </div>
            </div>
            
            <footer className="border-t border-base-300 flex bg-base-200/5 p-0 overflow-hidden flex-shrink-0">
                <button type="button" onClick={onClose} className="btn flex-1 rounded-none uppercase font-black text-[10px] tracking-widest border-r border-base-300 transition-colors">Cancel</button>
                <button type="submit" className="btn btn-primary flex-1 rounded-none uppercase font-black text-[10px] tracking-widest shadow-lg transition-colors" disabled={files.length === 0 || isProcessing}>
                    {isProcessing ? 'Importing...' : 'Add to Library'}
                </button>
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

export default AddItemModal;