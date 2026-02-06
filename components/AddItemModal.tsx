import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { GalleryCategory } from '../types';
import { UploadIcon, CloseIcon } from './icons';
import { fileToBase64 } from '../utils/fileUtils';
import AutocompleteSelect from './AutocompleteSelect';

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
    notes?: string,
    prompt?: string,
    isNsfw?: boolean
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
  const [isNsfw, setIsNsfw] = useState(false);
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
    setIsNsfw(false);
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

  const categoryOptions = useMemo(() => [
    { label: 'GENERAL ARCHIVE', value: '' },
    ...categories.map(cat => ({ label: cat.name.toUpperCase(), value: cat.id }))
  ], [categories]);

  const handleFileChange = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    const newFiles = Array.from(selectedFiles).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (newFiles.length === 0) return;
    
    const isFirstLoad = files.length === 0;
    
    setFiles(f => [...f, ...newFiles]);
    const newPreviews: FilePreview[] = newFiles.map(f => ({
      url: URL.createObjectURL(f),
      name: f.name,
      type: f.type.startsWith('image/') ? 'image' : 'video'
    }));
    setPreviews(p => [...p, ...newPreviews]);

    if (isFirstLoad) {
        if (newFiles.length === 1) {
            setTitle(newFiles[0].name.replace(/\.[^/.]+$/, ""));
        } else if (newFiles.length > 1) {
            setTitle(`Group_Item_${Date.now().toString().slice(-4)}`);
        }
    }
  };

  const handleRemoveFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
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
      await onAddItem(type, dataUrls, sources, categoryId || undefined, title, tags, notes, undefined, isNsfw);
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

  const hasFiles = previews.length > 0;

  const modalContent = (
    <div 
        className="fixed inset-0 bg-black/80 z-[1000] flex items-center justify-center p-4 animate-fade-in" 
        onClick={onClose}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
    >
      <div 
        className={`bg-base-100 rounded-none border border-base-300 shadow-2xl w-full max-w-5xl mx-auto flex flex-col max-h-[95vh] overflow-hidden transition-all duration-300 ${isDragging ? 'ring-2 ring-primary' : ''}`} 
        onClick={e => e.stopPropagation()}
      >
        <header className="p-8 border-b border-base-300 bg-base-200/20 relative">
            <button onClick={onClose} className="absolute top-6 right-6 btn btn-ghost btn-sm btn-square opacity-40 hover:opacity-100">
                <CloseIcon className="w-6 h-6" />
            </button>
            <h3 className="text-3xl font-black tracking-tighter text-base-content leading-none">
                IMPORT<span className="text-primary">.</span>
            </h3>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/30 mt-2">Local Archival Accession</p>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-col flex-grow overflow-hidden">
            <div className="flex-grow overflow-y-auto p-8 space-y-8 custom-scrollbar">
                {!hasFiles ? (
                    <div 
                        onClick={() => (fileInputRef.current as any)?.click()}
                        className={`p-20 border-4 border-dashed rounded-none text-center cursor-pointer transition-all ${isDragging ? 'border-primary bg-primary/10' : 'border-base-300 hover:border-primary/50 bg-base-200/20'}`}
                    >
                        <UploadIcon className="w-16 h-16 mx-auto text-base-content/20 mb-4"/>
                        <p className="text-sm font-black uppercase tracking-[0.2em] text-base-content/40">Drop artifacts here or click to browse</p>
                        <p className="text-[9px] font-bold text-base-content/20 mt-4 uppercase">Batch processing enabled for image sequences</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-px bg-base-300 border border-base-300">
                        {previews.map((p, index) => (
                            <div key={`${p.name}-${index}`} className="relative aspect-square bg-base-100 group overflow-hidden">
                                {p.type === 'image' ? (
                                    <img src={p.url} alt={p.name} className="w-full h-full object-cover grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500" />
                                ) : (
                                    <video src={p.url} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
                                )}
                                <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                                <button type="button" onClick={() => handleRemoveFile(index)} className="btn btn-xs btn-square btn-error absolute top-1 right-1 opacity-0 group-hover:opacity-100 shadow-2xl rounded-none">✕</button>
                            </div>
                        ))}
                        <button 
                            type="button" 
                            onClick={() => (fileInputRef.current as any)?.click()}
                            className="aspect-square bg-base-200/50 flex flex-col items-center justify-center text-base-content/20 hover:text-primary hover:bg-base-200 transition-all group border-2 border-dashed border-transparent hover:border-primary/50"
                        >
                            <UploadIcon className="w-8 h-8 mb-2 group-hover:scale-110 transition-transform"/>
                            <span className="text-[8px] font-black uppercase tracking-widest">Add more</span>
                        </button>
                    </div>
                )}

                <input type="file" ref={fileInputRef} onChange={(e) => handleFileChange((e.currentTarget as any).files)} multiple accept="image/*,video/*" className="hidden"/>

                <div className="space-y-6">
                    {/* Row 1: Title, Folder, NSFW */}
                    <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
                        <div className="form-control flex-grow w-full">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Item Identity</label>
                            <input type="text" value={title} onChange={(e) => setTitle((e.currentTarget as any).value)} className="input input-bordered rounded-none font-bold tracking-tight h-10 w-full" placeholder="Artifact title..." required />
                        </div>
                        <div className="form-control w-full md:w-[420px]">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Registry Folder</label>
                            <AutocompleteSelect 
                              value={categoryId} 
                              onChange={setCategoryId} 
                              options={categoryOptions} 
                              placeholder="SELECT FOLDER..." 
                            />
                        </div>
                        <div className="form-control flex-shrink-0 h-10 flex justify-center mb-0 md:mb-1">
                            <label className="label cursor-pointer justify-start gap-3 p-0 hover:bg-base-200/50 transition-colors px-3 h-full border border-base-300">
                                <input type="checkbox" checked={isNsfw} onChange={(e) => setIsNsfw((e.currentTarget as any).checked)} className="checkbox checkbox-primary rounded-none checkbox-sm" />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40">NSFW</span>
                            </label>
                        </div>
                    </div>

                    {/* Row 2: Tags */}
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Neural Tags</label>
                        <div className="flex flex-wrap items-center gap-2 p-3 bg-base-200/30 border border-base-300 rounded-none min-h-[52px]">
                            {tags.map(tag => (
                                <div key={tag} className="flex items-center gap-2 bg-base-100 border border-base-300 text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 shadow-sm">
                                    <span>{tag}</span>
                                    <button type="button" onClick={() => setTags(tags.filter(t => t !== tag))} className="text-error hover:text-error-content transition-colors">&times;</button>
                                </div>
                            ))}
                            <input type="text" value={tagInput} onChange={(e) => setTagInput((e.currentTarget as any).value)} onKeyDown={handleTagInputKeyDown} className="flex-grow bg-transparent outline-none text-[10px] font-bold uppercase tracking-widest px-1 h-8" placeholder="ADD TOKEN..."/>
                        </div>
                    </div>

                    {/* Row 3: Notes */}
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Vault Documentation</label>
                        <textarea value={notes} onChange={(e) => setNotes((e.currentTarget as any).value)} className="textarea textarea-bordered rounded-none min-h-[120px] font-medium leading-relaxed bg-base-200/20" placeholder="Archive additional details or prompt context..." />
                    </div>
                </div>

                {error && (
                    <div className="p-4 bg-error/10 border border-error/20 rounded-none">
                        <p className="text-error font-bold text-[10px] uppercase tracking-widest">{error}</p>
                    </div>
                )}
            </div>
            
            <footer className="border-t border-base-300 flex bg-base-200/5 p-0 overflow-hidden flex-shrink-0">
                <button type="button" onClick={onClose} className="btn flex-1 h-14 rounded-none uppercase font-black text-[10px] tracking-widest border-r border-base-300 transition-colors">Abort</button>
                <button type="submit" className="btn btn-primary flex-1 h-14 rounded-none uppercase font-black text-[10px] tracking-widest shadow-lg transition-colors" disabled={files.length === 0 || isProcessing}>
                    {isProcessing ? (
                        <span className="flex items-center gap-3">
                            <span className="loading loading-spinner loading-xs"></span>
                            INGESTING...
                        </span>
                    ) : 'COMMIT TO VAULT'}
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