import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import type { GalleryItem, GalleryCategory } from '../types';
import { 
    ChevronLeftIcon, EditIcon, DeleteIcon, CheckIcon, ThumbTackIcon, 
    ChevronRightIcon, CloseIcon, PhotoIcon, UploadIcon, YouTubeIcon, 
    RefreshIcon, PlusIcon, ArrowsUpDownIcon, LinkIcon
} from './icons';
import FullscreenViewer from './FullscreenViewer';
import { fileSystemManager, fileToBase64 } from '../utils/fileUtils';
import { useSettings } from '../contexts/SettingsContext';
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
    <div className="space-y-1">
        <h4 className="text-[10px] font-black text-base-content/40 uppercase tracking-widest">{label}</h4>
        {children}
    </div>
);

const TransitionalMedia: React.FC<{
    url: string | null;
    type: 'image' | 'video';
    title: string;
    onClick: () => void;
    direction: 'next' | 'prev' | 'none';
}> = React.memo(({ url, type, title, onClick, direction }) => {
    const [displayUrl, setDisplayUrl] = useState<string | null>(null);
    const [prevUrl, setPrevUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const currentLayerRef = useRef<HTMLDivElement>(null);
    const outgoingLayerRef = useRef<HTMLDivElement>(null);
    const objectUrls = useRef<Set<string>>(new Set());

    useEffect(() => {
        let isMounted = true;
        const load = async () => {
            if (!url) { setIsLoading(false); return; }
            setIsLoading(true);

            let finalUrl = url;
            if (!url.startsWith('data:') && !url.startsWith('http') && !url.startsWith('blob:')) {
                try {
                    const blob = await fileSystemManager.getFileAsBlob(url);
                    if (blob && isMounted) {
                        const newUrl = URL.createObjectURL(blob);
                        objectUrls.current.add(newUrl);
                        finalUrl = newUrl;
                    }
                } catch (e) { console.error("Buffer load failed", e); }
            }

            if (isMounted) {
                setPrevUrl(displayUrl);
                setDisplayUrl(finalUrl);
                setIsLoading(false);
            }
        };
        load();
        return () => { isMounted = false; };
    }, [url]);

    useEffect(() => {
        return () => {
            objectUrls.current.forEach(u => URL.revokeObjectURL(u));
            objectUrls.current.clear();
        };
    }, []);

    useLayoutEffect(() => {
        if (!containerRef.current || direction === 'none' || !prevUrl) return;

        const ctx = gsap.context(() => {
            const tl = gsap.timeline({ defaults: { ease: "power4.out", duration: 0.8 } });
            tl.fromTo(outgoingLayerRef.current, 
                { scale: 1, autoAlpha: 1, filter: 'blur(0px)' },
                { scale: 0.98, autoAlpha: 0, filter: 'blur(10px)', duration: 0.6, clearProps: "all" }, 0
            );
            tl.fromTo(currentLayerRef.current, 
                { scale: 1.1, autoAlpha: 0, filter: 'blur(20px)' },
                { scale: 1, autoAlpha: 1, filter: 'blur(0px)' }, 0
            );
        }, containerRef);

        return () => ctx.revert();
    }, [displayUrl, direction]);

    if (isLoading && !displayUrl) {
        return <div className="w-full h-full flex items-center justify-center bg-base-300/10"><LoadingSpinner size={48} /></div>;
    }

    return (
        <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-black flex items-center justify-center">
            {prevUrl && (
                <div ref={outgoingLayerRef} className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none opacity-0">
                    {type === 'video' ? <video src={prevUrl} muted className="max-w-full max-h-full object-contain" /> : <img src={prevUrl} className="max-w-full max-h-full object-contain" alt="outgoing" />}
                </div>
            )}
            <div ref={currentLayerRef} className="absolute inset-0 z-10 flex items-center justify-center">
                {type === 'video' ? (
                    <video src={displayUrl || ''} controls autoPlay loop onClick={onClick} className="max-w-full max-h-full object-contain shadow-2xl cursor-pointer" />
                ) : (
                    <img src={displayUrl || ''} alt={title} onClick={onClick} className="max-w-full max-h-full object-contain shadow-2xl cursor-pointer" />
                )}
            </div>
        </div>
    );
});

const Thumbnail: React.FC<{ 
    url: string; 
    type: 'image' | 'video', 
    onClick: () => void, 
    isActive: boolean;
    isEditing: boolean;
    onRemove?: () => void;
    onMove?: (dir: 'left' | 'right') => void;
    canMoveLeft?: boolean;
    canMoveRight?: boolean;
}> = ({ url, type, onClick, isActive, isEditing, onRemove, onMove, canMoveLeft, canMoveRight }) => {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);

    useEffect(() => {
        let isActiveThumb = true;
        let objectUrl: string | null = null;
        const loadMedia = async () => {
            if (url.startsWith('data:')) { setBlobUrl(url); return; }
            const blob = await fileSystemManager.getFileAsBlob(url);
            if (blob && isActiveThumb) {
                objectUrl = URL.createObjectURL(blob);
                setBlobUrl(objectUrl);
            }
        };
        loadMedia();
        return () => { isActiveThumb = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [url]);

    return (
        <div className="flex-shrink-0 w-24 h-24 mx-2 relative group/thumb">
            <button onClick={onClick} className={`relative w-full h-full overflow-hidden transition-all duration-500 ease-out focus:outline-none border-2 ${isActive ? 'border-primary shadow-2xl scale-105 z-20 opacity-100' : 'border-transparent opacity-20 hover:opacity-100 hover:scale-105'}`}>
                {blobUrl ? (type === 'video' ? <video src={blobUrl} className="w-full h-full object-cover bg-black" /> : <img src={blobUrl} alt="Thumb" className="w-full h-full object-cover bg-black" />) : <div className="w-full h-full bg-base-200 animate-pulse" />}
            </button>
            
            {isEditing && (
                <div className="absolute inset-0 z-30 flex flex-col justify-between p-1 pointer-events-none opacity-0 group-hover/thumb:opacity-100 transition-opacity bg-black/40">
                    <div className="flex justify-end w-full pointer-events-auto">
                        <button onClick={(e) => { e.stopPropagation(); onRemove?.(); }} className="btn btn-xs btn-square btn-error shadow-lg">✕</button>
                    </div>
                    <div className="flex justify-between w-full pointer-events-auto pb-1 px-1">
                        <button disabled={!canMoveLeft} onClick={(e) => { e.stopPropagation(); onMove?.('left'); }} className="btn btn-xs btn-square bg-black/60 border-none hover:bg-primary disabled:opacity-0">←</button>
                        <button disabled={!canMoveRight} onClick={(e) => { e.stopPropagation(); onMove?.('right'); }} className="btn btn-xs btn-square bg-black/60 border-none hover:bg-primary disabled:opacity-0">→</button>
                    </div>
                </div>
            )}
        </div>
    );
};

const ItemDetailView: React.FC<ItemDetailViewProps> = ({ items, currentIndex, isPinned, categories, onClose, onUpdate, onDelete, onTogglePin, onNavigate, showGlobalFeedback }) => {
  const item = useMemo(() => items[currentIndex] || null, [items, currentIndex]);
  const { settings } = useSettings();
  
  const [isEditing, setIsEditing] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [navDirection, setNavDirection] = useState<'next' | 'prev' | 'none'>('none');

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [prompt, setPrompt] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [isNsfw, setIsNsfw] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [editableUrls, setEditableUrls] = useState<string[]>([]);
  const [editableSources, setEditableSources] = useState<string[]>([]);
  
  const carouselViewportRef = useRef<HTMLDivElement>(null);
  const carouselTrackRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);

  useEffect(() => {
    if (item) {
        setTitle(item.title);
        setNotes(item.notes || '');
        setPrompt(item.prompt || '');
        setCategoryId(item.categoryId || '');
        setIsNsfw(item.isNsfw || false);
        setTags(item.tags || []);
        setEditableUrls([...item.urls]);
        setEditableSources([...item.sources]);
        setActiveImageIndex(0);
        setNavDirection('none');
        setIsEditing(false);
        setTagInput('');
    }
  }, [item]);

  useLayoutEffect(() => {
    if (!carouselTrackRef.current || !carouselViewportRef.current) return;
    const viewportWidth = carouselViewportRef.current.offsetWidth;
    const track = carouselTrackRef.current;
    const itemWidth = 112; // 24px width + 16px margins
    const viewportCenter = viewportWidth / 2;
    const itemCenter = (activeImageIndex * itemWidth) + (itemWidth / 2);
    const targetX = viewportCenter - itemCenter;
    gsap.killTweensOf(track);
    gsap.to(track, { x: targetX, duration: 0.7, ease: "expo.out" });
  }, [activeImageIndex, editableUrls.length, item?.urls.length, isEditing]);

  const handleSave = () => {
    if (item) {
        onUpdate(item.id, { 
            title, notes, prompt, 
            categoryId: categoryId || undefined, 
            isNsfw, tags, 
            urls: editableUrls, 
            sources: editableSources 
        });
        showGlobalFeedback("Changes saved.");
        onClose(); // BUG FIX: Return to list after saving
    }
  };

  const handleCancel = () => {
      if (item) {
          setTitle(item.title);
          setNotes(item.notes || '');
          setPrompt(item.prompt || '');
          setCategoryId(item.categoryId || '');
          setIsNsfw(item.isNsfw || false);
          setTags(item.tags || []);
          setEditableUrls([...item.urls]);
          setEditableSources([...item.sources]);
      }
      setIsEditing(false);
  };

  const handleAddSample = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files; if (!files) return;
      const newUrls: string[] = []; const newSources: string[] = [];
      for (const file of Array.from(files)) { 
          const base64 = await fileToBase64(file); 
          newUrls.push(base64); 
          newSources.push(file.name); 
      }
      const prevLen = editableUrls.length;
      setEditableUrls(prev => [...prev, ...newUrls]); 
      setEditableSources(prev => [...prev, ...newSources]);
      if (newUrls.length > 0) setActiveImageIndex(prevLen);
  };

  const handleRemoveSample = (idx: number) => {
      if (editableUrls.length <= 1) { showGlobalFeedback("At least one image is required.", true); return; }
      const newUrls = editableUrls.filter((_, i) => i !== idx);
      const newSources = editableSources.filter((_, i) => i !== idx);
      setEditableUrls(newUrls); 
      setEditableSources(newSources);
      if (activeImageIndex >= idx && activeImageIndex > 0) setActiveImageIndex(prev => prev - 1);
  };

  const handleMoveMedia = (idx: number, dir: 'left' | 'right') => {
      const targetIdx = dir === 'left' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= editableUrls.length) return;
      
      const newUrls = [...editableUrls];
      const newSources = [...editableSources];
      
      [newUrls[idx], newUrls[targetIdx]] = [newUrls[targetIdx], newUrls[idx]];
      [newSources[idx], newSources[targetIdx]] = [newSources[targetIdx], newUrls[idx]];
      
      setEditableUrls(newUrls);
      setEditableSources(newSources);
      setActiveImageIndex(targetIdx);
  };

  const handleInnerNavigate = (dir: 'next' | 'prev') => {
      const list = (isEditing ? editableUrls : item?.urls || []); 
      const len = list.length; 
      if (len <= 1) return;
      setNavDirection(dir); 
      const nextIdx = dir === 'next' ? (activeImageIndex + 1) % len : (activeImageIndex - 1 + len) % len;
      setActiveImageIndex(nextIdx);
  };

  const handleGlobalNavigate = (dir: 'next' | 'prev') => {
      setNavDirection(dir); 
      const nextIdx = dir === 'next' ? (currentIndex + 1) % items.length : (currentIndex - 1 + items.length) % items.length;
      onNavigate(nextIdx);
  };

  const handlePublishClick = async () => {
      if (!item || item.type !== 'video') return;
      try {
          const blob = await fileSystemManager.getFileAsBlob(item.urls[activeImageIndex]);
          if (blob) {
              setVideoBlob(blob);
              setIsPublishModalOpen(true);
          }
      } catch (e) {
          showGlobalFeedback("Failed to load binary data for publishing.", true);
      }
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = tagInput.trim();
        if (val && !tags.includes(val)) {
            setTags([...tags, val]);
        }
        setTagInput('');
    }
  };

  if (!item) return null;

  const categoryOptions = [ { label: 'ALL FOLDERS', value: '' }, ...categories.map(c => ({ label: c.name.toUpperCase(), value: c.id })) ];
  const currentMediaUrls = isEditing ? editableUrls : item.urls;
  const isPublishable = item.type === 'video' && !!settings.youtube?.isConnected;

  return (
    <div className="absolute inset-0 z-40 bg-black/95 backdrop-blur-sm animate-fade-in flex items-center justify-center p-2 lg:p-4 overflow-hidden" onClick={onClose}>
        <div className="w-full h-full bg-base-100 rounded-none border border-base-300 shadow-2xl flex flex-col lg:flex-row overflow-hidden relative" onClick={e => e.stopPropagation()}>
            <main className="flex-1 bg-black flex flex-col overflow-hidden relative group">
                <div className="flex-grow relative flex items-center justify-center overflow-hidden">
                    <TransitionalMedia url={isEditing ? editableUrls[activeImageIndex] : item.urls[activeImageIndex]} type={item.type} title={item.title} onClick={() => setIsViewerOpen(true)} direction={navDirection} />
                    
                    {currentMediaUrls.length > 1 && (
                        <>
                            <button onClick={(e) => { e.stopPropagation(); handleInnerNavigate('prev'); }} className="absolute left-6 top-1/2 -translate-y-1/2 p-6 bg-black/40 hover:bg-primary text-white rounded-none transition-all duration-500 opacity-0 -translate-x-12 group-hover:opacity-100 group-hover:translate-x-0 z-20"><ChevronLeftIcon className="w-8 h-8" /></button>
                            <button onClick={(e) => { e.stopPropagation(); handleInnerNavigate('next'); }} className="absolute right-6 top-1/2 -translate-y-1/2 p-6 bg-black/40 hover:bg-primary text-white rounded-none transition-all duration-500 opacity-0 translate-x-12 group-hover:opacity-100 group-hover:translate-x-0 z-20"><ChevronRightIcon className="w-8 h-8" /></button>
                        </>
                    )}
                    
                    <div className="absolute top-6 left-6 right-6 flex justify-between items-center pointer-events-none z-30">
                        <div className="pointer-events-auto flex items-center gap-4">
                            <div className="join bg-base-200/40 backdrop-blur-md border border-white/5 rounded-none">
                                <button onClick={() => handleGlobalNavigate('prev')} className="btn btn-sm btn-ghost join-item rounded-none"><ChevronLeftIcon className="w-4 h-4" /></button>
                                <span className="join-item flex items-center px-4 font-mono text-[10px] font-black text-white">{currentIndex + 1} / {items.length}</span>
                                <button onClick={() => handleGlobalNavigate('next')} className="btn btn-sm btn-ghost join-item rounded-none"><ChevronRightIcon className="w-4 h-4" /></button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="h-44 flex-shrink-0 bg-base-200/10 border-t border-white/5 relative flex flex-col items-center justify-center group/deck">
                    <button onClick={(e) => { e.stopPropagation(); handleInnerNavigate('prev'); }} className="absolute left-10 z-50 btn btn-circle btn-sm btn-ghost bg-black/80 text-white opacity-0 group-hover/deck:opacity-100 border border-white/10 hover:bg-primary top-1/2 -translate-y-1/2 active:scale-100"><ChevronLeftIcon className="w-5 h-5" /></button>
                    
                    <div ref={carouselViewportRef} className="w-[calc(100%-12rem)] h-32 relative overflow-hidden flex items-center z-10">
                        <div ref={carouselTrackRef} className="flex items-center absolute h-full will-change-transform">
                            {currentMediaUrls.map((url, idx) => (
                                <Thumbnail 
                                    key={`strip-${idx}-${url.slice(-8)}`} 
                                    url={url} 
                                    type={item.type} 
                                    isActive={idx === activeImageIndex} 
                                    isEditing={isEditing}
                                    onRemove={() => handleRemoveSample(idx)}
                                    onMove={(dir) => handleMoveMedia(idx, dir)}
                                    canMoveLeft={idx > 0}
                                    canMoveRight={idx < currentMediaUrls.length - 1}
                                    onClick={() => { if (idx === activeImageIndex) return; setNavDirection(idx > activeImageIndex ? 'next' : 'prev'); setActiveImageIndex(idx); }} 
                                />
                            ))}
                            {isEditing && (
                                <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex-shrink-0 w-24 h-24 mx-2 border-2 border-dashed border-primary/40 flex flex-col items-center justify-center gap-2 hover:bg-primary/10 transition-colors group/add relative z-20"
                                >
                                    <PlusIcon className="w-6 h-6 text-primary group-hover/add:scale-110 transition-transform" />
                                    <span className="text-[8px] font-black uppercase text-primary/60">Add Media</span>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="absolute inset-0 pointer-events-none z-30">
                        <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-black via-black/80 to-transparent"></div>
                        <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-black via-black/80 to-transparent"></div>
                    </div>

                    <div className="mt-1 z-40">
                        <span className="text-[9px] font-mono font-black text-primary bg-black/90 px-4 py-1.5 border border-white/5 shadow-2xl uppercase tracking-[0.6em] inline-block">
                            [ {String(activeImageIndex + 1).padStart(2, '0')} / {String(currentMediaUrls.length).padStart(2, '0')} ]
                        </span>
                    </div>

                    <button onClick={(e) => { e.stopPropagation(); handleInnerNavigate('next'); }} className="absolute right-10 z-50 btn btn-circle btn-sm btn-ghost bg-black/80 text-white opacity-0 group-hover/deck:opacity-100 border border-white/10 hover:bg-primary top-1/2 -translate-y-1/2 active:scale-100"><ChevronRightIcon className="w-5 h-5" /></button>
                </div>
            </main>

            <aside className="w-full lg:w-96 bg-base-100 border-l border-base-300 flex flex-col overflow-hidden">
                <header className="flex-shrink-0 h-16 px-6 border-b border-base-300 flex items-center justify-between bg-base-200/20">
                    <div className="flex items-center gap-3">
                        <button onClick={() => onTogglePin(item.id)} className={`btn btn-sm btn-ghost btn-square rounded-none ${isPinned ? 'text-primary' : 'opacity-20'}`}>
                            <ThumbTackIcon className="w-5 h-5" />
                        </button>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/20">Item Info</span>
                    </div>
                    <button onClick={onClose} className="btn btn-sm btn-ghost btn-square rounded-none opacity-40 hover:opacity-100">
                        <CloseIcon className="w-6 h-6" />
                    </button>
                </header>

                <div className="flex-grow p-6 space-y-8 overflow-y-auto custom-scrollbar">
                    {isEditing ? (
                        <div className="space-y-6 animate-fade-in">
                            <InfoRow label="Title">
                                <input value={title} onChange={e => setTitle(e.target.value)} className="input input-bordered rounded-none input-sm w-full font-bold uppercase tracking-tight" />
                            </InfoRow>
                            <InfoRow label="Folder">
                                <AutocompleteSelect value={categoryId} onChange={setCategoryId} options={categoryOptions} />
                            </InfoRow>
                            <InfoRow label="Access Policy">
                                <label className="label cursor-pointer justify-start gap-4 p-4 bg-base-200/50 border border-base-300 rounded-none hover:bg-base-200 transition-colors">
                                    <input 
                                        type="checkbox" 
                                        checked={isNsfw} 
                                        onChange={e => setIsNsfw(e.target.checked)} 
                                        className="toggle toggle-primary toggle-xs" 
                                    />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-base-content/60">Restricted Content (NSFW)</span>
                                </label>
                            </InfoRow>
                            <InfoRow label="Neural Tags">
                                <div className="flex flex-wrap items-center gap-2 p-3 bg-base-200/30 border border-base-300 rounded-none min-h-[52px]">
                                    {tags.map(tag => (
                                        <div key={tag} className="flex items-center gap-2 bg-base-100 border border-base-300 text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 shadow-sm">
                                            <span>{tag}</span>
                                            <button type="button" onClick={() => setTags(tags.filter(t => t !== tag))} className="text-error hover:text-error-content transition-colors">&times;</button>
                                        </div>
                                    ))}
                                    <input 
                                        type="text" 
                                        value={tagInput} 
                                        onChange={(e) => setTagInput(e.target.value)} 
                                        onKeyDown={handleTagInputKeyDown} 
                                        className="flex-grow bg-transparent outline-none text-[10px] font-bold uppercase tracking-widest px-1 h-8" 
                                        placeholder="ADD TOKEN..."
                                    />
                                </div>
                            </InfoRow>
                            <InfoRow label="Notes">
                                <textarea value={notes} onChange={e => setNotes(e.target.value)} className="textarea textarea-bordered rounded-none w-full min-h-[120px] text-sm leading-relaxed" />
                            </InfoRow>
                        </div>
                    ) : (
                        <div className="space-y-8 animate-fade-in">
                            <InfoRow label="Title">
                                <div className="flex flex-col gap-2">
                                    <h2 className="text-2xl font-black tracking-tighter uppercase leading-tight">{title}</h2>
                                    {item.isNsfw && (
                                        <div className="flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse"></span>
                                            <span className="text-[8px] font-black uppercase tracking-widest text-warning">Restricted Artifact</span>
                                        </div>
                                    )}
                                </div>
                            </InfoRow>
                            <InfoRow label="Prompt">
                                <div className="p-4 bg-base-200/50 border border-base-300 italic text-sm leading-relaxed text-base-content/70 group/prompt">
                                    "{item.prompt || 'None.'}"
                                    <button 
                                        onClick={() => navigator.clipboard.writeText(item.prompt || '')}
                                        className="mt-4 btn btn-xs btn-ghost w-full rounded-none font-black text-[8px] tracking-widest opacity-0 group-hover/prompt:opacity-40 transition-opacity"
                                    >COPY TOKEN</button>
                                </div>
                            </InfoRow>
                            {tags.length > 0 && (
                                <InfoRow label="Neural Tags">
                                    <div className="flex flex-wrap gap-2 pt-2">
                                        {tags.map(tag => (
                                            <span key={tag} className="text-[9px] font-black uppercase tracking-widest bg-base-200 border border-base-300 px-3 py-1.5 text-base-content/40">{tag}</span>
                                        ))}
                                    </div>
                                </InfoRow>
                            )}
                            {notes && (
                                <InfoRow label="Vault Documentation">
                                    <p className="text-sm text-base-content/60 leading-relaxed font-medium">"{notes}"</p>
                                </InfoRow>
                            )}
                            {item.youtubeUrl && (
                                <InfoRow label="External Uplink">
                                    <a href={item.youtubeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 bg-error/5 border border-error/20 text-error hover:bg-error/10 transition-colors">
                                        <YouTubeIcon className="w-5 h-5" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">View on YouTube</span>
                                    </a>
                                </InfoRow>
                            )}
                        </div>
                    )}
                </div>

                <footer className="border-t border-base-300 flex flex-col bg-base-200/5 p-0 overflow-hidden flex-shrink-0">
                    {isPublishable && !isEditing && (
                        <button onClick={handlePublishClick} className="btn btn-primary h-14 w-full rounded-none font-black text-[9px] tracking-[0.2em] uppercase shadow-none border-none border-b border-white/5">
                            <YouTubeIcon className="w-5 h-5 mr-3" /> PUBLISH TO CLOUD
                        </button>
                    )}
                    <div className="flex w-full h-14">
                        <button onClick={isEditing ? handleCancel : () => setIsEditing(true)} className="btn btn-ghost flex-1 h-full rounded-none font-black text-[9px] tracking-widest uppercase border-r border-base-300 opacity-40 hover:opacity-100">
                            {isEditing ? 'CANCEL' : 'EDIT'}
                        </button>
                        {isEditing ? (
                            <button onClick={handleSave} className="btn btn-primary flex-1 h-full rounded-none font-black text-[9px] tracking-widest uppercase shadow-lg">SAVE</button>
                        ) : (
                            <button onClick={() => onDelete(item)} className="btn btn-ghost flex-1 h-full rounded-none font-black text-[9px] tracking-widest uppercase text-error/40 hover:text-error">DELETE</button>
                        )}
                    </div>
                </footer>
            </aside>

            <input type="file" ref={fileInputRef} onChange={handleAddSample} multiple className="hidden" />

            {isViewerOpen && (
                <FullscreenViewer 
                    items={items} 
                    currentIndex={currentIndex} 
                    initialImageIndex={activeImageIndex} 
                    onClose={() => setIsViewerOpen(false)} 
                    onNavigate={(idx) => onNavigate(idx)} 
                />
            )}

            {isPublishModalOpen && videoBlob && (
                <YouTubePublishModal 
                    isOpen={isPublishModalOpen}
                    onClose={() => setIsPublishModalOpen(false)}
                    videoBlob={videoBlob}
                    initialTitle={title}
                    initialDescription={`Artifact: ${title}\n\nPrompt: ${item.prompt || ''}`}
                    onSuccess={(url) => {
                        onUpdate(item.id, { youtubeUrl: url, publishedAt: Date.now() });
                        showGlobalFeedback("Published successfully.");
                    }}
                />
            )}
        </div>
    </div>
  );
};

export default ItemDetailView;