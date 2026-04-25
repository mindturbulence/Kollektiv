import React, { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { gsap } from 'gsap';
import type { GalleryItem, GalleryCategory } from '../types';
import { 
    ChevronLeftIcon, ThumbTackIcon, 
    ChevronRightIcon, CloseIcon, YouTubeIcon, 
    PlusIcon, CopyIcon, CheckIcon
} from './icons';
import FullscreenViewer from './FullscreenViewer';
import { fileSystemManager, fileToBase64 } from '../utils/fileUtils';
import { useSettings } from '../contexts/SettingsContext';
import LoadingSpinner from './LoadingSpinner';
import AutocompleteSelect from './AutocompleteSelect';
import YouTubePublishModal from './YouTubePublishModal';
import { audioService } from '../services/audioService';

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

const ScramblingText: React.FC<{ text: string, className?: string }> = ({ text, className }) => {
    return (
        <span className={`${className} inline-block font-mono`}>
            {text}
        </span>
    );
}

const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const InfoRow: React.FC<{ label: string, children: React.ReactNode, action?: React.ReactNode }> = ({ label, children, action }) => (
    <div className="space-y-1.5">
        <div className="flex justify-between items-center pr-1">
            <h4 className="text-xs font-nunito font-semibold text-base-content/50 uppercase tracking-[0.15em]">{label}</h4>
            {action && <div className="flex items-center">{action}</div>}
        </div>
        {children}
    </div>
);

const TransitionalMedia: React.FC<{
    url: string | null;
    type: 'image' | 'video';
    title: string;
    onClick: () => void;
    direction: 'next' | 'prev' | 'none';
    onLoaded?: (e: React.SyntheticEvent<HTMLImageElement | HTMLVideoElement>) => void;
}> = React.memo(({ url, type, title, onClick, direction, onLoaded }) => {
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
        return <div className="w-full h-full flex items-center justify-center bg-transparent"><LoadingSpinner size={48} /></div>;
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
                    <video src={displayUrl || ''} controls autoPlay loop onClick={onClick} onLoad={onLoaded} onLoadedMetadata={onLoaded} className="max-w-full max-h-full object-contain cursor-pointer" />
                ) : (
                    <img src={displayUrl || ''} alt={title} onClick={onClick} onLoad={onLoaded} className="max-w-full max-h-full object-contain cursor-pointer" />
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
}> = ({ url, type, onClick, isActive, isEditing, onRemove }) => {
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
        <div className={`flex-shrink-0 flex flex-col items-center gap-2 group/thumb transition-all duration-300 ${isEditing ? 'w-16' : 'w-12'}`}>
            <div 
                onClick={(e) => { 
                    e.preventDefault(); 
                    audioService.playClick();
                    onClick(); 
                }} 
                className={`relative w-12 h-12 aspect-square overflow-hidden transition-all duration-300 ease-out focus:outline-none cursor-pointer ${isActive ? 'scale-110 z-20 opacity-100 ring-2 ring-primary ring-offset-2 ring-offset-black' : 'opacity-40 hover:opacity-100'}`}
            >
                {blobUrl ? (type === 'video' ? <video src={blobUrl} className="w-full h-full object-cover bg-black" /> : <img src={blobUrl} alt="Thumb" className="w-full h-full object-cover bg-black" />) : <div className="w-full h-full bg-transparent animate-pulse" />}
            </div>
            
            {isEditing && (
                <button 
                    type="button"
                    onClick={(e) => { 
                        e.stopPropagation(); 
                        e.preventDefault();
                        audioService.playClick();
                        onRemove?.(); 
                    }} 
                    className="w-5 h-5 flex items-center justify-center bg-red-600/90 text-white rounded-full shadow-lg opacity-40 group-hover/thumb:opacity-100 transition-all hover:scale-125 hover:bg-red-500 active:scale-90"
                    title="Remove item"
                >
                    <CloseIcon className="w-3 h-3 stroke-[3]" />
                </button>
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
  const [editableSamples, setEditableSamples] = useState<{ id: string, url: string, source: string }[]>([]);
  const [metadata, setMetadata] = useState<{ width: number; height: number; size: number; ratio: string } | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  
  const carouselViewportRef = useRef<HTMLDivElement>(null);
  const carouselTrackRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const infoPanelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

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
        setEditableSamples(item.urls.map((url, i) => ({ 
            id: `sample-${i}-${Math.random().toString(36).substr(2, 9)}`, 
            url, 
            source: item.sources[i] 
        })));
        setActiveImageIndex(0);
        setNavDirection('none');
        setIsEditing(false);
        setTagInput('');
        setMetadata(null);
    }
  }, [item]);

  useEffect(() => {
    const loadMetadata = async () => {
        const url = isEditing ? editableSamples[activeImageIndex]?.url : item?.urls[activeImageIndex];
        if (!url) return;

        let size = 0;
        if (!url.startsWith('data:')) {
            try {
                const blob = await fileSystemManager.getFileAsBlob(url);
                if (blob) size = blob.size;
            } catch (e) {}
        }
        
        // For video/image dimensions, we'll wait for the media to load and trigger onLoaded
        setMetadata(prev => ({ ...prev, size, width: prev?.width || 0, height: prev?.height || 0, ratio: prev?.ratio || '' }));
    };
    loadMetadata();
  }, [activeImageIndex, item, isEditing, editableSamples]);

  const handleMediaLoad = (e: React.SyntheticEvent<HTMLImageElement | HTMLVideoElement>) => {
      let w = 0;
      let h = 0;
      if (e.currentTarget instanceof HTMLImageElement) {
          w = e.currentTarget.naturalWidth;
          h = e.currentTarget.naturalHeight;
      } else if (e.currentTarget instanceof HTMLVideoElement) {
          w = e.currentTarget.videoWidth;
          h = e.currentTarget.videoHeight;
      }

      if (w > 0 && h > 0) {
          const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
          const common = gcd(w, h);
          const ratio = `${w / common}:${h / common}`;
          setMetadata(prev => ({ ...prev, width: w, height: h, size: prev?.size || 0, ratio }));
      }
  };

    useLayoutEffect(() => {
    if (!carouselTrackRef.current || !carouselViewportRef.current) return;
    const viewportWidth = carouselViewportRef.current.offsetWidth;
    const track = carouselTrackRef.current;
    
    // Updated item width calculation: dynamic based on isEditing
    const gapWidth = 16;
    const itemPixelWidth = isEditing ? 64 : 48; // Thumbnail component width
    const itemTotalWidth = itemPixelWidth + gapWidth;
    const paddingOffset = 16; // px-4 on the track container
    
    const viewportCenter = viewportWidth / 2;
    // Offset calculation for centered alignment, including the container padding
    const itemCenter = (activeImageIndex * itemTotalWidth) + (itemPixelWidth / 2) + paddingOffset;
    const targetX = viewportCenter - itemCenter;
    
    gsap.killTweensOf(track);
    gsap.to(track, { x: targetX, duration: 0.7, ease: "expo.out" });
  }, [activeImageIndex, editableSamples.length, item?.urls.length, isEditing]);

  useLayoutEffect(() => {
    if (!overlayRef.current || !modalRef.current || !leftPanelRef.current || !rightPanelRef.current || !headerRef.current) return;

    const ctx = gsap.context(() => {
        const tl = gsap.timeline({ defaults: { ease: "power3.out", duration: 1.0 } });
        timelineRef.current = tl;
        
        // Initial state
        gsap.set(overlayRef.current, { opacity: 0 });
        gsap.set(modalRef.current, { 
            scale: 0.9, 
            transformOrigin: "center center",
            opacity: 0,
            y: 10
        });
        gsap.set(leftPanelRef.current, { x: -20, opacity: 0 });
        gsap.set(rightPanelRef.current, { x: 20, opacity: 0 });
        gsap.set(headerRef.current, { y: -5, opacity: 0 });

        // Animation sequence
        tl.to(overlayRef.current, { opacity: 1, duration: 0.3 })
          .to(modalRef.current, { 
              scale: 1, 
              opacity: 1, 
              y: 0,
              duration: 0.7,
              ease: "expo.out"
          }, "-=0.15")
          .to(headerRef.current, { 
              y: 0, 
              opacity: 1, 
              duration: 0.4 
          }, "-=0.4")
          .to(leftPanelRef.current, { 
              x: 0, 
              opacity: 1, 
              duration: 0.6 
          }, "-=0.3")
          .to(rightPanelRef.current, { 
              x: 0, 
              opacity: 1, 
              duration: 0.6 
          }, "-=0.5");
    });

    return () => ctx.revert();
  }, []);

  const handleClose = useCallback(() => {
    audioService.playClick();
    if (timelineRef.current) {
        timelineRef.current.reverse().eventCallback("onReverseComplete", () => {
            onClose();
        });
    } else {
        onClose();
    }
  }, [onClose]);

  const handleSave = () => {
    audioService.playClick();
    if (item) {
        onUpdate(item.id, { 
            title, notes, prompt, 
            categoryId: categoryId || undefined, 
            isNsfw, tags, 
            urls: editableSamples.map(s => s.url), 
            sources: editableSamples.map(s => s.source) 
        });
        setIsEditing(false);
    }
  };

  const handleCancel = () => {
      audioService.playClick();
      if (item) {
          setTitle(item.title);
          setNotes(item.notes || '');
          setPrompt(item.prompt || '');
          setCategoryId(item.categoryId || '');
          setIsNsfw(item.isNsfw || false);
          setTags(item.tags || []);
          setEditableSamples(item.urls.map((url, i) => ({ 
              id: `sample-${i}-${Math.random().toString(36).substr(2, 9)}`, 
              url, 
              source: item.sources[i] 
          })));
      }
      setIsEditing(false);
  };

  const handleAddSample = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files; if (!files) return;
      const newSamples: { id: string, url: string, source: string }[] = [];
      for (const file of Array.from(files)) { 
          const base64 = await fileToBase64(file); 
          newSamples.push({
              id: `new-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              url: base64,
              source: file.name
          });
      }
      const prevLen = editableSamples.length;
      setEditableSamples(prev => [...prev, ...newSamples]); 
      if (newSamples.length > 0) setActiveImageIndex(prevLen);
  };

  const handleRemoveSample = (idx: number) => {
      if (editableSamples.length <= 1) { showGlobalFeedback("At least one image is required.", true); return; }
      setEditableSamples(prev => prev.filter((_, i) => i !== idx));
      if (activeImageIndex >= idx && activeImageIndex > 0) setActiveImageIndex(prev => prev - 1);
  };

  const handleInnerNavigate = (dir: 'next' | 'prev') => {
      audioService.playClick();
      const list = (isEditing ? editableSamples.map(s => s.url) : item?.urls || []); 
      const len = list.length; 
      if (len <= 1) return;
      setNavDirection(dir); 
      const nextIdx = dir === 'next' ? (activeImageIndex + 1) % len : (activeImageIndex - 1 + len) % len;
      setActiveImageIndex(nextIdx);
  };

  const handleGlobalNavigate = (dir: 'next' | 'prev') => {
      audioService.playClick();
      setNavDirection(dir); 
      const nextIdx = dir === 'next' ? (currentIndex + 1) % items.length : (currentIndex - 1 + items.length) % items.length;
      onNavigate(nextIdx);
  };

  const handleCopyPrompt = () => {
      audioService.playClick();
      navigator.clipboard.writeText(item.prompt || '');
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
  };

  const handlePublishClick = async () => {
      audioService.playClick();
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
  const currentMediaUrls = isEditing ? editableSamples.map(s => s.url) : item.urls;
  const isPublishable = item.type === 'video' && !!settings.youtube?.isConnected;

  return (
    <AnimatePresence>
      <motion.div 
        ref={overlayRef} 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="absolute inset-0 z-40 bg-black/40 backdrop-blur-xl flex items-center justify-center p-4 lg:p-8 overflow-hidden" 
        onClick={handleClose}
      >
        <motion.div 
            ref={modalRef} 
            className="w-full h-full bg-transparent flex flex-col lg:flex-row overflow-visible relative p-[3px] corner-frame" 
            onClick={e => e.stopPropagation()}
        >
            <div className="w-full h-full bg-base-100/40 backdrop-blur-xl flex flex-col lg:flex-row overflow-hidden relative z-10">
            
            <main ref={leftPanelRef} className="flex-1 flex flex-col overflow-hidden relative group bg-black">
                <div className="flex-grow relative flex items-center justify-center overflow-hidden">
                    <TransitionalMedia url={isEditing ? editableSamples[activeImageIndex]?.url : item.urls[activeImageIndex]} type={item.type} title={item.title} onClick={() => setIsViewerOpen(true)} direction={navDirection} onLoaded={handleMediaLoad} />
                    
                    {currentMediaUrls.length > 1 && (
                        <div className="pointer-events-none absolute inset-0 z-20 flex items-center">
                            <div className="w-full flex justify-between px-6">
                                <button onClick={(e) => { e.stopPropagation(); handleInnerNavigate('prev'); }} className="pointer-events-auto p-4 text-white/20 hover:text-primary transition-all duration-300 opacity-0 group-hover:opacity-100 scale-90 hover:scale-125"><ChevronLeftIcon className="w-16 h-16" /></button>
                                <button onClick={(e) => { e.stopPropagation(); handleInnerNavigate('next'); }} className="pointer-events-auto p-4 text-white/20 hover:text-primary transition-all duration-300 opacity-0 group-hover:opacity-100 scale-90 hover:scale-125"><ChevronRightIcon className="w-16 h-16" /></button>
                            </div>
                        </div>
                    )}
                    
                    <div className="absolute top-6 left-6 right-6 flex justify-between items-center pointer-events-none z-30">
                        <div className="pointer-events-auto flex items-center gap-2 bg-black/40 backdrop-blur-md p-1 border border-white/5">
                            <button onClick={() => handleGlobalNavigate('prev')} className="p-1.5 text-white/30 hover:text-primary transition-colors"><ChevronLeftIcon className="w-4 h-4" /></button>
                            <span className="font-mono text-[10px] font-bold text-white/60 px-2">{currentIndex + 1} / {items.length}</span>
                            <button onClick={() => handleGlobalNavigate('next')} className="p-1.5 text-white/30 hover:text-primary transition-colors"><ChevronRightIcon className="w-4 h-4" /></button>
                        </div>
                    </div>
                </div>

                <div className={`h-24 flex-shrink-0 bg-black/40 border-t border-white/5 relative flex flex-col items-center justify-center group/deck transition-all duration-500 ${isEditing ? 'h-28' : 'h-24'}`}>
                    <button onClick={(e) => { e.stopPropagation(); handleInnerNavigate('prev'); }} className="absolute left-2 z-50 p-2 text-white/10 hover:text-primary opacity-0 group-hover/deck:opacity-100 top-1/2 -translate-y-1/2 transition-all"><ChevronLeftIcon className="w-5 h-5" /></button>
                    
                    <div ref={carouselViewportRef} className="w-[calc(100%-4rem)] h-20 relative overflow-visible flex items-center z-10 px-2 transition-all">
                        <div ref={carouselTrackRef} className="absolute flex items-center h-full gap-4 px-4 will-change-transform">
                            {editableSamples.map((sample, idx) => (
                                <Thumbnail 
                                    key={sample.id}
                                    url={sample.url} 
                                    type={item.type} 
                                    isActive={idx === activeImageIndex} 
                                    isEditing={isEditing}
                                    onRemove={() => handleRemoveSample(idx)}
                                    onClick={() => { if (idx === activeImageIndex) return; if(idx > activeImageIndex) setNavDirection('next'); else setNavDirection('prev'); setActiveImageIndex(idx); }} 
                                />
                            ))}
                            {isEditing && (
                                <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex-shrink-0 w-12 h-12 border border-dashed border-white/20 flex items-center justify-center hover:bg-white/5 hover:border-primary/40 transition-all group/add self-start mt-0"
                                >
                                    <PlusIcon className="w-4 h-4 text-white/20 group-hover:text-primary transition-colors" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="absolute inset-0 pointer-events-none z-30">
                        <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-black via-black/40 to-transparent"></div>
                        <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-black via-black/40 to-transparent"></div>
                    </div>

                    <button onClick={(e) => { e.stopPropagation(); handleInnerNavigate('next'); }} className="absolute right-2 z-50 p-2 text-white/10 hover:text-primary opacity-0 group-hover/deck:opacity-100 top-1/2 -translate-y-1/2 transition-all"><ChevronRightIcon className="w-5 h-5" /></button>
                </div>
            </main>

            <aside ref={rightPanelRef} className="w-full lg:w-96 flex flex-col overflow-hidden border-l border-white/5 bg-base-100/40 backdrop-blur-xl">
                <header ref={headerRef} className="flex-shrink-0 h-16 px-6 flex items-center justify-between border-b border-white/5 bg-base-100/10 backdrop-blur-md">
                    <div className="flex items-center gap-3">
                        <button onClick={(e) => { e.stopPropagation(); audioService.playClick(); onTogglePin(item.id); }} className={`p-1.5 transition-all ${isPinned ? 'text-primary' : 'text-base-content/20 hover:text-base-content/60'}`}>
                            <ThumbTackIcon className="w-5 h-5" />
                        </button>
                        <span className="text-[10px] font-nunito font-bold uppercase tracking-[0.2em] text-base-content/40">Details</span>
                    </div>

                    <button onClick={handleClose} className="p-2 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-all group/close">
                        <CloseIcon className="w-5 h-5 stroke-[2.5]" />
                    </button>
                </header>

                <div className="flex-grow flex flex-col min-h-0 overflow-hidden relative">
                    <div ref={infoPanelRef} className="absolute inset-0 p-6 space-y-8 overflow-y-auto custom-scrollbar">
                        {isEditing ? (
                            <div className="space-y-6 animate-fade-in">
                                <InfoRow label="POST TITLE">
                                    <input value={title} onChange={e => setTitle(e.target.value)} className="form-input w-full font-nunito" />
                                </InfoRow>
                                <InfoRow label="Folder">
                                    <AutocompleteSelect value={categoryId} onChange={setCategoryId} options={categoryOptions} />
                                </InfoRow>
                                <InfoRow label="Access Policy">
                                    <label className="label cursor-pointer justify-start gap-4 p-4 hover:bg-primary/10 transition-colors">
                                        <input 
                                            type="checkbox" 
                                            checked={isNsfw} 
                                            onChange={e => setIsNsfw(e.target.checked)} 
                                            className="toggle toggle-primary toggle-xs" 
                                        />
                                        <span className="text-[10px] font-nunito font-bold uppercase tracking-widest text-base-content/60">Not Safe For Work</span>
                                    </label>
                                </InfoRow>
                                <InfoRow label="Neural Tags">
                                    <div className="flex flex-wrap items-center gap-2 p-3 bg-white/5 min-h-[52px]">
                                        {tags.map(tag => (
                                            <div key={tag} className="flex items-center gap-2 bg-primary/10 text-[10px] font-nunito font-bold uppercase tracking-widest px-2.1 py-0.5">
                                                <span>{tag}</span>
                                                <button type="button" onClick={() => { audioService.playClick(); setTags(tags.filter(t => t !== tag)); }} className="text-error hover:text-error-content transition-colors font-bold text-lg leading-none">&times;</button>
                                            </div>
                                        ))}
                                        <input 
                                            type="text" 
                                            value={tagInput} 
                                            onChange={(e) => setTagInput(e.target.value)} 
                                            onKeyDown={handleTagInputKeyDown} 
                                            className="bg-transparent border-none focus:outline-none focus:ring-0 text-[10px] font-nunito font-bold uppercase tracking-widest px-1 h-8" 
                                            placeholder="ADD TOKEN..."
                                        />
                                    </div>
                                </InfoRow>
                                <InfoRow label="Notes">
                                    <textarea value={notes} onChange={e => setNotes(e.target.value)} className="form-textarea w-full min-h-[120px] font-nunito" />
                                </InfoRow>
                            </div>
                        ) : (
                            <div className="space-y-8 animate-fade-in">
                                <InfoRow 
                                    label="POST TITLE" 
                                    action={
                                        <div className="flex items-center gap-2">
                                            <ScramblingText text={item.id} className="text-[10px] font-mono text-base-content/30" />
                                        </div>
                                    }
                                >
                                    <div className="flex flex-col gap-2 mt-2">
                                        <h2 className="text-2xl font-black tracking-tighter uppercase leading-tight">{title}</h2>
                                        <div className="flex items-center gap-2">
                                            {item.isNsfw && (
                                                <div className="flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse"></span>
                                                    <span className="text-[10px] font-nunito font-bold uppercase tracking-widest text-warning">Not Safe For Work</span>
                                                </div>
                                            )}
                                            {isPublishable && (
                                                <button onClick={handlePublishClick} className="btn btn-xs btn-ghost gap-2 border-white/10 hover:border-primary px-3 text-[9px] tracking-widest uppercase text-white/40 hover:text-primary transition-all">
                                                    <YouTubeIcon className="w-3 h-3" />
                                                    Publish
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </InfoRow>
                                <InfoRow 
                                    label="Prompt"
                                    action={
                                        <button 
                                            onClick={handleCopyPrompt}
                                            className={`p-1 transition-all duration-300 cursor-pointer ${isCopied ? 'text-primary scale-110' : 'text-base-content/20 hover:text-primary'}`}
                                            title="Copy Prompt"
                                        >
                                            {isCopied ? <CheckIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
                                        </button>
                                    }
                                >
                                    <div className="p-4 bg-white/5 italic text-sm leading-relaxed text-base-content/70 group/prompt relative">
                                        "{item.prompt || 'None.'}"
                                    </div>
                                </InfoRow>
                                {tags.length > 0 && (
                                    <InfoRow label="Tags">
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {tags.map(tag => (
                                                <button key={tag} className="form-btn wildcard-tag-btn h-auto px-2 py-0.5 text-[10px] font-nunito font-bold lowercase tracking-tight bg-white/5 border-white/10 hover:bg-primary/20 hover:text-primary transition-colors font-nunito">
                                                    {tag}
                                                </button>
                                            ))}
                                        </div>
                                    </InfoRow>
                                )}
                                {notes && (
                                    <InfoRow label="Notes">
                                        <p className="text-sm text-base-content/60 leading-relaxed font-nunito">"{notes}"</p>
                                    </InfoRow>
                                )}

                                <InfoRow label="Metadata">
                                    <div className="space-y-4 py-2">
                                        {metadata && (
                                            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[11px] font-mono tracking-widest text-base-content/30 uppercase">RESOLUTION</span>
                                                    <ScramblingText text={`${metadata.width} × ${metadata.height}`} className="text-base-content/70" />
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[11px] font-mono tracking-widest text-base-content/30 uppercase">ASPECT RATIO</span>
                                                    <ScramblingText text={metadata.ratio} className="text-base-content/70" />
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[11px] font-mono tracking-widest text-base-content/30 uppercase">FILE SIZE</span>
                                                    <ScramblingText text={formatFileSize(metadata.size)} className="text-base-content/70" />
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[11px] font-mono tracking-widest text-base-content/30 uppercase">SAMPLE COUNT</span>
                                                    <ScramblingText text={`${activeImageIndex + 1} OF ${currentMediaUrls.length}`} className="text-base-content/70" />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </InfoRow>
                            </div>
                        )}
                    </div>
                </div>

                <footer className="h-14 flex items-stretch bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 border-t border-white/5">
                    {isEditing ? (
                        <>
                            <button onClick={handleCancel} className="btn btn-sm btn-ghost h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake font-display">
                                <span/><span/><span/><span/>
                                CANCEL
                            </button>
                            <button onClick={handleSave} className="btn btn-sm btn-primary h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake-primary font-display">
                                <span/><span/><span/><span/>
                                SAVE
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={() => setIsEditing(true)} className="btn btn-sm btn-ghost h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake font-display">
                                <span/><span/><span/><span/>
                                EDIT
                            </button>
                            <button onClick={() => onDelete(item)} className="btn btn-sm btn-ghost h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake text-error font-display">
                                <span/><span/><span/><span/>
                                DELETE
                            </button>
                        </>
                    )}
                </footer>
            </aside>

            <input type="file" ref={fileInputRef} onChange={handleAddSample} multiple className="hidden" />

            <AnimatePresence>
                {isViewerOpen && (
                    <FullscreenViewer 
                        items={items} 
                        currentIndex={currentIndex} 
                        initialImageIndex={activeImageIndex} 
                        onClose={() => setIsViewerOpen(false)} 
                        onNavigate={(idx) => onNavigate(idx)} 
                    />
                )}
            </AnimatePresence>

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
            {/* Manual Corner Accents */}
            <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
            <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
            <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
            <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  };

export default ItemDetailView;