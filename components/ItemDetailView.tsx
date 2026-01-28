import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { GalleryItem, GalleryCategory } from '../types';
import { ChevronLeftIcon, EditIcon, DeleteIcon, CheckIcon, ThumbTackIcon, ChevronRightIcon, CloseIcon, PhotoIcon, UploadIcon, ChevronDownIcon, PlayIcon, SparklesIcon, LinkIcon, ArrowsUpDownIcon, YouTubeIcon } from './icons';
import FullscreenViewer from './FullscreenViewer';
import { fileSystemManager, extractPositivePrompt, fileToBase64 } from '../utils/fileUtils';
import { useSettings } from '../contexts/SettingsContext';
import { GoogleGenAI } from '@google/genai';
import LoadingSpinner from './LoadingSpinner';
import AutocompleteSelect from './AutocompleteSelect';
import YouTubePublishModal from './YouTubePublishModal';

interface ItemDetailViewProps {
  items: GalleryItem[];
  currentIndex: number;
  isPinned: boolean;
  categories: GalleryCategory[];
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<GalleryItem>) => void;
  onDelete: (item: GalleryItem) => void;
  onTogglePin: (id: string) => void;
  onNavigate: (index: number) => void;
  showGlobalFeedback: (message: string, isError?: boolean) => void;
}

const InfoRow: React.FC<{ label: string, children: React.ReactNode }> = ({ label, children }) => (
    <div>
        <h4 className="text-[10px] font-black text-base-content/40 uppercase tracking-widest mb-1">{label}</h4>
        {children}
    </div>
);

const Thumbnail: React.FC<{ 
    url: string; 
    type: 'image' | 'video', 
    onClick: () => void, 
    isActive: boolean,
    draggable?: boolean,
    onDragStart?: (e: React.DragEvent) => void,
    onDragOver?: (e: React.DragEvent) => void,
    onDragEnd?: (e: React.DragEvent) => void,
    isDragging?: boolean
}> = ({ url, type, onClick, isActive, draggable, onDragStart, onDragOver, onDragEnd, isDragging }) => {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);

    useEffect(() => {
        let isActiveThumb = true;
        let objectUrl: string | null = null;
        const loadMedia = async () => {
            if (url.startsWith('data:')) {
                setBlobUrl(url);
                return;
            }
            const blob = await fileSystemManager.getFileAsBlob(url);
            if (blob && isActiveThumb) {
                objectUrl = URL.createObjectURL(blob);
                setBlobUrl(objectUrl);
            }
        };
        loadMedia();
        return () => {
            isActiveThumb = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [url]);

    if (!blobUrl) {
        return <div className={`relative aspect-square rounded-none overflow-hidden bg-base-200 animate-pulse`}></div>;
    }

    return (
        <button
            onClick={onClick}
            draggable={draggable}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            className={`relative aspect-square rounded-none overflow-hidden transition-all duration-200 focus:outline-none ring-2 ${isActive ? 'ring-primary' : 'ring-transparent hover:ring-primary/70'} ${isDragging ? 'opacity-30' : 'opacity-100'} ${draggable ? 'cursor-move' : 'cursor-pointer'}`}
            aria-label={`View sample`}
        >
            {type === 'video' ? (
                <video src={blobUrl} className="w-full h-full object-cover bg-base-200 pointer-events-none" />
            ) : (
                <img src={blobUrl} alt={`Thumbnail`} className="w-full h-full object-cover bg-base-200 pointer-events-none" />
            )}
            {isActive && (
                <div className="absolute inset-0 bg-primary/20 border border-primary"></div>
            )}
        </button>
    );
};

const Media: React.FC<{
    url: string | null;
    type: 'image' | 'video';
    title: string;
    onClick: (e: React.MouseEvent) => void;
}> = React.memo(({ url, type, title, onClick }) => {
    const [displayUrl, setDisplayUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const objectUrlRef = useRef<string|null>(null);

    useEffect(() => {
        let isActive = true;
        const loadMedia = async () => {
            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
                objectUrlRef.current = null;
            }
            if (!url) { setIsLoading(false); setHasError(true); return; }
            setIsLoading(true);
            setHasError(false);
            if (url.startsWith('data:') || url.startsWith('http') || url.startsWith('blob:')) {
                if (isActive) setDisplayUrl(url);
                setIsLoading(false);
                return;
            }
            try {
                const blob = await fileSystemManager.getFileAsBlob(url);
                if (isActive && blob) {
                    const newUrl = URL.createObjectURL(blob);
                    objectUrlRef.current = newUrl;
                    setDisplayUrl(newUrl);
                } else if (isActive) {
                    setHasError(true);
                }
            } catch {
                 if (isActive) setHasError(true);
            } finally {
                 if (isActive) setIsLoading(false);
            }
        };
        loadMedia();
        return () => { isActive = false; };
    }, [url]);

    useEffect(() => {
        return () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); }
    }, []);

    if (isLoading) {
        return <div className="w-full h-full flex items-center justify-center bg-base-200"><LoadingSpinner size={48} /></div>;
    }
    if (hasError || !displayUrl) {
        return <div className="text-center opacity-20"><PhotoIcon className="w-24 h-24 mx-auto"/><p className="mt-2 text-xs font-black uppercase">Loading Error</p></div>;
    }

    return type === 'video' ? (
        <video src={displayUrl} controls autoPlay loop onClick={onClick} className="max-w-full max-h-full object-contain shadow-2xl" />
    ) : (
        <img src={displayUrl} alt={title} onClick={onClick} className="max-w-full max-h-full object-contain shadow-2xl cursor-pointer" />
    );
});

const ItemDetailView: React.FC<ItemDetailViewProps> = ({ items, currentIndex, isPinned, categories, onClose, onUpdate, onDelete, onTogglePin, onNavigate, showGlobalFeedback }) => {
  const item = useMemo(() => items[currentIndex] || null, [items, currentIndex]);
  const { settings } = useSettings();
  
  const [isEditing, setIsEditing] = useState(false);
  const [isRearranging, setIsRearranging] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [prompt, setPrompt] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [isNsfw, setIsNsfw] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const newFileInputRef = useRef<HTMLInputElement>(null);

  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [currentVideoBlob, setCurrentVideoBlob] = useState<Blob | null>(null);

  useEffect(() => {
    if (item) {
        setTitle(item.title);
        setNotes(item.notes || '');
        setPrompt(item.prompt || '');
        setCategoryId(item.categoryId || '');
        setIsNsfw(!!item.isNsfw);
        setTags(item.tags || []);
        setImageUrls(item.urls || []);
        setSources(item.sources || []);
        setActiveImageIndex(0);
        setIsEditing(false);
        setIsRearranging(false);
    }
  }, [item]);
  
  const displayPrompt = useMemo(() => {
    if (!item) return '';
    const rawPrompt = (item.prompt || '').trim();
    if (!rawPrompt) return 'No prompt archived.';
    try {
        const parsed = JSON.parse(rawPrompt);
        if (parsed?.prompt?.trim()) return parsed.prompt.trim();
    } catch (e) {}
    return rawPrompt;
  }, [item]);

  const categoryOptions = useMemo(() => [
    { label: 'GENERAL ARCHIVE', value: '' },
    ...categories.map(cat => ({ label: cat.name.toUpperCase(), value: cat.id }))
  ], [categories]);

  const handlePostNavigation = useCallback((direction: 'next' | 'prev') => {
    const newIndex = direction === 'next'
      ? (currentIndex + 1) % items.length
      : (currentIndex - 1 + items.length) % items.length;
    onNavigate(newIndex);
  }, [currentIndex, items.length, onNavigate]);

  const handleImageNavigation = useCallback((direction: 'next' | 'prev') => {
    const newIndex = direction === 'next'
        ? (activeImageIndex + 1) % imageUrls.length
        : (activeImageIndex - 1 + imageUrls.length) % imageUrls.length;
    setActiveImageIndex(newIndex);
  }, [activeImageIndex, imageUrls.length]);

  useEffect(() => {
    if (isViewerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
        const target = e.target as HTMLElement;
        if (target && ['TEXTAREA', 'INPUT'].includes(target.tagName)) return;
        if (e.key === 'ArrowRight') {
            if (imageUrls.length > 1) handleImageNavigation('next');
            else handlePostNavigation('next');
        }
        if (e.key === 'ArrowLeft') {
            if (imageUrls.length > 1) handleImageNavigation('prev');
            else handlePostNavigation('prev');
        }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isViewerOpen, handleImageNavigation, handlePostNavigation, imageUrls.length]);

  const handleSave = () => {
    if (item) {
        onUpdate(item.id, { title, notes, prompt, categoryId: categoryId || undefined, isNsfw, tags, urls: imageUrls, sources });
        setIsEditing(false);
        setIsRearranging(false);
    }
  };
  
  const handleCancel = () => {
      if (item) {
          setTitle(item.title);
          setNotes(item.notes || '');
          setPrompt(item.prompt || '');
          setCategoryId(item.categoryId || '');
          setIsNsfw(!!item.isNsfw);
          setTags(item.tags || []);
          setImageUrls(item.urls || []);
          setSources(item.sources || []);
          setIsEditing(false);
          setIsRearranging(false);
      }
  };
  
  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const newTag = tagInput.trim();
        if (newTag && !tags.includes(newTag)) setTags([...tags, newTag]);
        setTagInput('');
    }
  };

  const handleAddImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const filesArray = Array.from(files) as File[];
    const base64Urls = await Promise.all(filesArray.map(file => fileToBase64(file)));
    const fileNames = filesArray.map(f => f.name);
    setImageUrls(prev => [...prev, ...base64Urls]);
    setSources(prev => [...prev, ...fileNames]);
  };

  const handleOpenPublishModal = async () => {
    if (!item || !item.urls[0]) return;
    try {
        const blob = await fileSystemManager.getFileAsBlob(item.urls[0]);
        if (blob) {
            setCurrentVideoBlob(blob);
            setIsPublishModalOpen(true);
        } else {
            showGlobalFeedback("Failed to access local video binary.", true);
        }
    } catch (e) {
        showGlobalFeedback("Vault access error.", true);
    }
  };

  const handlePublishSuccess = (videoUrl: string) => {
    if (item) {
        onUpdate(item.id, { youtubeUrl: videoUrl, publishedAt: Date.now() });
        showGlobalFeedback("Artifact transmitted and linked to YouTube.");
    }
  };

  if (!item) return null;

  return (
    <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm animate-fade-in flex items-center justify-center p-2 lg:p-4 overflow-hidden" onClick={onClose}>
        <div className="w-full h-full bg-base-300 rounded-none border border-base-300 shadow-2xl flex flex-col lg:flex-row overflow-hidden relative" onClick={e => e.stopPropagation()}>
            <main className="flex-1 flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="relative flex-grow flex items-center justify-center min-h-0 group bg-black/50" onClick={onClose}>
                    <Media 
                        url={imageUrls[activeImageIndex] || null} 
                        type={item.type} 
                        title={title} 
                        onClick={(e) => { e.stopPropagation(); setIsViewerOpen(true); }}
                    />
                    
                    {imageUrls.length > 1 && (
                        <>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleImageNavigation('prev'); }} 
                                className="absolute left-6 top-1/2 -translate-y-1/2 p-4 bg-black/40 hover:bg-black/80 text-white rounded-none transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] opacity-0 -translate-x-8 group-hover:opacity-100 group-hover:translate-x-0 z-20"
                            >
                                <ChevronLeftIcon className="w-8 h-8"/>
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleImageNavigation('next'); }} 
                                className="absolute right-6 top-1/2 -translate-y-1/2 p-4 bg-black/40 hover:bg-black/80 text-white rounded-none transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] opacity-0 translate-x-8 group-hover:opacity-100 group-hover:translate-x-0 z-20"
                            >
                                <ChevronRightIcon className="w-8 h-8"/>
                            </button>
                        </>
                    )}

                    <div className="absolute top-6 right-6 z-20 flex items-center">
                        <div className="join bg-black/40 backdrop-blur-md border border-white/10">
                            <button onClick={(e) => { e.stopPropagation(); handlePostNavigation('prev'); }} className="btn btn-sm btn-ghost join-item text-white"><ChevronLeftIcon className="w-4 h-4" /></button>
                            <span className="join-item flex items-center px-6 font-mono text-[10px] font-black text-white uppercase tracking-widest border-x border-white/10">{currentIndex + 1} / {items.length}</span>
                            <button onClick={(e) => { e.stopPropagation(); handlePostNavigation('next'); }} className="btn btn-sm btn-ghost join-item text-white"><ChevronRightIcon className="w-4 h-4" /></button>
                        </div>
                    </div>
                </div>
            </main>
            
            <aside className="w-full lg:w-96 bg-base-100 flex-shrink-0 flex flex-col border-l border-base-300" onClick={(e) => e.stopPropagation()}>
                <header className="px-4 h-16 flex justify-between items-center border-b border-base-300 flex-shrink-0 bg-base-200/20">
                    <button onClick={() => onTogglePin(item.id)} className={`btn btn-sm btn-ghost btn-square rounded-none ${isPinned ? 'text-primary' : 'opacity-20'}`} title="Pin Artifact">
                        <ThumbTackIcon className="w-5 h-5"/>
                    </button>
                    <button onClick={onClose} className="btn btn-sm btn-ghost btn-square rounded-none opacity-40 hover:opacity-100 ml-4" title="Close"><CloseIcon className="w-6 h-6"/></button>
                </header>

                <div className="p-6 space-y-8 overflow-y-auto flex-grow custom-scrollbar">
                    <InfoRow label="Artifact Identity">
                        {isEditing ? <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="input input-bordered input-sm w-full font-bold uppercase rounded-none"/> : <p className="font-black text-2xl tracking-tighter uppercase leading-none">{title}</p>}
                    </InfoRow>

                    {imageUrls.length > 0 && (
                        <InfoRow label={isRearranging ? "Drag to Rearrange" : `Samples Archive (${activeImageIndex + 1}/${imageUrls.length})`}>
                            <div className="grid grid-cols-4 gap-px bg-base-300 border border-base-300">
                                {imageUrls.map((url, index) => (
                                <div key={`${item.id}-${index}`} className="relative aspect-square bg-base-100">
                                        <Thumbnail 
                                            url={url} 
                                            type={item.type} 
                                            onClick={() => !isRearranging && setActiveImageIndex(index)} 
                                            isActive={index === activeImageIndex}
                                            draggable={isRearranging}
                                            onDragStart={() => setIsRearranging(true)}
                                            onDragOver={(e) => e.preventDefault()}
                                            onDragEnd={() => setIsRearranging(false)}
                                        />
                                        {isEditing && (
                                            <button onClick={() => setImageUrls(prev => prev.filter((_, i) => i !== index))} className="btn btn-xs btn-square btn-error absolute top-1 right-1 z-10">✕</button>
                                        )}
                                </div>
                                ))}
                                {isEditing && (
                                    <button onClick={() => (newFileInputRef.current as any)?.click()} className="aspect-square bg-base-200 flex items-center justify-center text-base-content/20 hover:text-primary transition-colors">
                                        <UploadIcon className="w-6 h-6"/>
                                    </button>
                                )}
                            </div>
                        </InfoRow>
                    )}

                    <InfoRow label="Vault Notes">
                        {isEditing ? <textarea value={notes} onChange={e => setNotes(e.target.value)} className="textarea textarea-bordered rounded-none w-full h-32 leading-relaxed" placeholder="Archive documentation..."></textarea> : <p className="text-sm font-medium leading-relaxed text-base-content/70 whitespace-pre-wrap italic">"{notes || 'No description archived.'}"</p>}
                    </InfoRow>

                    <InfoRow label="Sensitive Status">
                        <div className="flex items-center gap-4">
                            {isEditing ? (
                                <label className="label cursor-pointer justify-start gap-4 p-0">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-base-content/40">NSFW Warning</span>
                                    <input type="checkbox" checked={isNsfw} onChange={e => setIsNsfw((e.currentTarget as any).checked)} className="checkbox checkbox-primary rounded-none" />
                                </label>
                            ) : (
                                <p className={`font-black uppercase text-[10px] tracking-widest ${isNsfw ? 'text-warning' : 'text-base-content/20'}`}>
                                    {isNsfw ? 'SENSITIVE CONTENT' : 'GENERAL ACCESS'}
                                </p>
                            )}
                        </div>
                    </InfoRow>

                    <InfoRow label="Registry Folder">
                        {isEditing ? (
                            <AutocompleteSelect 
                              value={categoryId} 
                              onChange={setCategoryId} 
                              options={categoryOptions} 
                              placeholder="SELECT REGISTRY FOLDER..." 
                            />
                        ) : <p className="font-black uppercase text-[10px] tracking-widest text-primary/40">{categories.find(c => c.id === categoryId)?.name || 'General Archive'}</p>}
                    </InfoRow>

                    <InfoRow label="Neural Blueprint">
                         <p className="text-sm font-medium leading-relaxed text-base-content/60 break-words italic">"{displayPrompt}"</p>
                    </InfoRow>
                </div>

                <footer className="border-t border-base-300 flex bg-base-200/5 p-0 overflow-hidden flex-shrink-0">
                    <button onClick={() => onDelete(item)} className="btn flex-none w-16 h-full flex items-center justify-center text-error/20 hover:text-error hover:bg-error/5 border-r border-base-300 transition-colors" title="Purge Sequence">
                            <DeleteIcon className="w-5 h-5"/>
                    </button>
                    
                    <div className="flex-1 flex h-full">
                        {isEditing ? (
                            <>
                                <button onClick={handleCancel} className="btn flex-1 rounded-none uppercase font-black text-[10px] tracking-widest hover:bg-base-200 border-r border-base-300 transition-colors">Abort</button>
                                <button onClick={handleSave} className="btn btn-primary flex-1 rounded-none uppercase font-black text-[10px] tracking-widest shadow-lg transition-colors">Commit</button>
                            </>
                        ) : (
                            <>
                                {item.type === 'video' && settings.youtube?.isConnected && (
                                    item.youtubeUrl ? (
                                        <a 
                                            href={item.youtubeUrl} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="btn btn-sm btn-ghost flex-1 h-full rounded-none uppercase font-black text-[10px] tracking-widest px-4 text-success hover:bg-success/10 border-r border-base-300 flex items-center justify-center"
                                        >
                                            <YouTubeIcon className="w-4 h-4 mr-2" />
                                            Live
                                        </a>
                                    ) : (
                                        <button 
                                            onClick={handleOpenPublishModal}
                                            className="btn btn-sm btn-ghost flex-1 h-full rounded-none uppercase font-black text-[10px] tracking-widest px-4 text-primary hover:bg-primary/10 border-r border-base-300 flex items-center justify-center"
                                        >
                                            <YouTubeIcon className="w-4 h-4 mr-2" />
                                            Publish
                                        </button>
                                    )
                                )}
                                <button onClick={() => setIsEditing(true)} className="btn btn-secondary flex-1 rounded-none text-secondary-content uppercase font-black text-[10px] tracking-widest transition-colors hover:brightness-110">
                                    <EditIcon className="w-3.5 h-3.5 mr-2 inline-block"/> Modify
                                </button>
                            </>
                        )}
                    </div>
                </footer>
                <input type="file" ref={newFileInputRef} multiple accept="image/*,video/*" onChange={handleAddImages} className="hidden" />
            </aside>
            {isViewerOpen && <FullscreenViewer items={items} currentIndex={currentIndex} initialImageIndex={activeImageIndex} onClose={() => setIsViewerOpen(false)} />}
        </div>
        
        {item.type === 'video' && currentVideoBlob && (
            <YouTubePublishModal 
                isOpen={isPublishModalOpen}
                onClose={() => { setIsPublishModalOpen(false); setCurrentVideoBlob(null); }}
                videoBlob={currentVideoBlob}
                initialTitle={item.title}
                initialDescription={`${item.notes || ''}\n\nGenerated with Kollektiv.\nPrompt: ${displayPrompt}`}
                onSuccess={handlePublishSuccess}
            />
        )}
    </div>
  );
};
export default ItemDetailView;