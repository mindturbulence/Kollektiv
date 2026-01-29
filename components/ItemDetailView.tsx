import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import type { GalleryItem, GalleryCategory } from '../types';
import { ChevronLeftIcon, EditIcon, DeleteIcon, CheckIcon, ThumbTackIcon, ChevronRightIcon, CloseIcon, PhotoIcon, UploadIcon, YouTubeIcon, RefreshIcon, PlusIcon } from './icons';
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

/**
 * TransitionalMedia Component
 * Manages the high-fidelity transition between images in the gallery sequence.
 */
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
            const tl = gsap.timeline({ defaults: { ease: "power4.inOut", duration: 0.8 } });
            const moveX = direction === 'next' ? 100 : -100;

            tl.fromTo(outgoingLayerRef.current, 
                { xPercent: 0, scale: 1, autoAlpha: 1 },
                { xPercent: -moveX * 0.3, scale: 0.9, autoAlpha: 0, clearProps: "all" }, 0
            );

            tl.fromTo(currentLayerRef.current, 
                { xPercent: moveX, scale: 1.1, autoAlpha: 0 },
                { xPercent: 0, scale: 1, autoAlpha: 1 }, 0
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
    onRemove?: () => void;
    isRemovable?: boolean;
}> = ({ url, type, onClick, isActive, onRemove, isRemovable }) => {
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
        <div className="carousel-item-infinite flex-shrink-0 w-24 h-24 mx-3">
            <button
                onClick={onClick}
                className={`relative w-full h-full overflow-hidden transition-all duration-500 ease-out focus:outline-none border-2 ${isActive ? 'border-primary shadow-2xl scale-110 z-20' : 'border-transparent opacity-30 hover:opacity-100 hover:scale-105'}`}
            >
                {blobUrl ? (
                    type === 'video' ? <video src={blobUrl} className="w-full h-full object-cover bg-black" /> : <img src={blobUrl} alt="Thumb" className="w-full h-full object-cover bg-black" />
                ) : <div className="w-full h-full bg-base-200 animate-pulse" />}
                
                {type === 'video' && !isActive && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                        <div className="p-1.5 bg-black/40 rounded-full border border-white/10">
                            <PlusIcon className="w-3 h-3 text-white rotate-45" />
                        </div>
                    </div>
                )}
            </button>
            {isRemovable && (
                <button 
                    onClick={(e) => { e.stopPropagation(); onRemove?.(); }}
                    className="absolute -top-1 -right-1 z-30 btn btn-xs btn-circle btn-error shadow-lg scale-75"
                >
                    <CloseIcon className="w-3 h-3" />
                </button>
            )}
        </div>
    );
};

/**
 * GSAP Horizontal Loop Helper (Optimized for programatic indexing)
 */
function horizontalLoop(items: HTMLElement[], config: any) {
	items = gsap.utils.toArray(items);
	config = config || {};
	let tl = gsap.timeline({
        repeat: config.repeat, 
        paused: config.paused, 
        defaults: {ease: "none"}, 
        onReverseComplete: () => tl.totalTime(tl.rawTime() + tl.duration() * 100)
    }),
    length = items.length,
    startX = items[0].offsetLeft,
    times: number[] = [],
    widths: number[] = [],
    xPercents: number[] = [],
    curIndex = 0,
    pixelsPerSecond = (config.speed || 1) * 100,
    snap = config.snap === false ? (v: any) => v : gsap.utils.snap(config.snap || 1),
    totalWidth, curX, distanceToStart, distanceToLoop, item, i;
	
    gsap.set(items, { xPercent: 0 });

	for (i = 0; i < length; i++) {
		item = items[i];
		widths[i] = parseFloat(gsap.getProperty(item, "width", "px") as string);
		xPercents[i] = snap(parseFloat(gsap.getProperty(item, "x", "px") as string) / widths[i] * 100 + (gsap.getProperty(item, "xPercent") as number));
	}
	
    gsap.set(items, {x: 0});
	totalWidth = items[length-1].offsetLeft + xPercents[length-1] / 100 * widths[length-1] - startX + items[length-1].offsetWidth * (gsap.getProperty(items[length-1], "scaleX") as number) + (parseFloat(config.paddingRight) || 0);
	
    for (i = 0; i < length; i++) {
		item = items[i];
		curX = xPercents[i] / 100 * widths[i];
		distanceToStart = item.offsetLeft + curX - startX;
		distanceToLoop = distanceToStart + widths[i] * (gsap.getProperty(item, "scaleX") as number);
		tl.to(item, {xPercent: snap((curX - distanceToLoop) / widths[i] * 100), duration: distanceToLoop / pixelsPerSecond}, 0)
		  .fromTo(item, {xPercent: snap((curX - distanceToLoop + totalWidth) / widths[i] * 100)}, {xPercent: xPercents[i], duration: (curX - distanceToLoop + totalWidth) / pixelsPerSecond, immediateRender: false}, distanceToLoop / pixelsPerSecond)
		  .add("label" + i, distanceToStart / pixelsPerSecond);
		times[i] = distanceToStart / pixelsPerSecond;
	}

	function toIndex(index: number, vars: any) {
		vars = vars || {};
		(Math.abs(index - curIndex) > length / 2) && (index += index > curIndex ? -length : length);
		let newIndex = gsap.utils.wrap(0, length, index),
			time = times[newIndex];
		if (time > tl.time() !== index > curIndex) {
			vars.modifiers = {time: gsap.utils.wrap(0, tl.duration())};
			time += tl.duration() * (index > curIndex ? 1 : -1);
		}
		curIndex = newIndex;
		vars.overwrite = true;
		return tl.tweenTo(time, vars);
	}

	(tl as any).next = (vars: any) => toIndex(curIndex + 1, vars);
	(tl as any).prev = (vars: any) => toIndex(curIndex - 1, vars);
	(tl as any).current = () => curIndex;
	(tl as any).toIndex = (index: number, vars: any) => toIndex(index, vars);
	(tl as any).times = times;

	tl.progress(1, true).progress(0, true);
	if (config.reversed) {
	  (tl.vars as any).onReverseComplete();
	  tl.reverse();
	}
	return tl;
}

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
  const [editableUrls, setEditableUrls] = useState<string[]>([]);
  const [editableSources, setEditableSources] = useState<string[]>([]);
  
  const carouselTrackRef = useRef<HTMLDivElement>(null);
  const carouselContainerRef = useRef<HTMLDivElement>(null);
  const loopRef = useRef<any>(null);
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
    }
  }, [item]);

  // --- Core Lifecycle: Setup Loop with Left Alignment ---
  useLayoutEffect(() => {
    const track = carouselTrackRef.current;
    const container = carouselContainerRef.current;
    if (!track || !container) return;
    
    const mediaItems = gsap.utils.toArray<HTMLElement>('.carousel-item-infinite');
    if (mediaItems.length === 0) return;

    const ctx = gsap.context(() => {
        // 1. Initialize Loop
        loopRef.current = horizontalLoop(mediaItems, {
            speed: 1,
            repeat: -1,
            paused: true,
            paddingRight: 24,
        });

        // 2. Set Left Anchor
        // Instead of centering, we align the start of the track to a standard margin
        // so the active item appears on the left side of the viewport.
        gsap.set(track, { x: 32 });

        // 3. Sync
        loopRef.current.toIndex(activeImageIndex, { duration: 0 });
    }, track);

    return () => {
        ctx.revert();
        loopRef.current = null;
    };
  }, [item?.urls.length, editableUrls.length, isEditing]);

  // --- Interaction Layer ---
  useLayoutEffect(() => {
    if (!loopRef.current) return;
    
    loopRef.current.toIndex(activeImageIndex, {
        duration: 0.8,
        ease: "power4.inOut"
    });
  }, [activeImageIndex]);

  const handleSave = () => {
    if (item) {
        onUpdate(item.id, { 
            title, 
            notes, 
            prompt, 
            categoryId: categoryId || undefined, 
            isNsfw, 
            tags,
            urls: editableUrls,
            sources: editableSources
        });
        setIsEditing(false);
        showGlobalFeedback("Artifact committed.");
    }
  };

  const handleAddSample = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      const newUrls: string[] = [];
      const newSources: string[] = [];

      for (const file of Array.from(files)) {
          const base64 = await fileToBase64(file);
          newUrls.push(base64);
          newSources.push(file.name);
      }

      setEditableUrls(prev => [...prev, ...newUrls]);
      setEditableSources(prev => [...prev, ...newSources]);
      
      if (newUrls.length > 0) {
          setActiveImageIndex(editableUrls.length);
      }
  };

  const handleRemoveSample = (idx: number) => {
      if (editableUrls.length <= 1) {
          showGlobalFeedback("Artifact requires at least one media sample.", true);
          return;
      }
      setEditableUrls(prev => prev.filter((_, i) => i !== idx));
      setEditableSources(prev => prev.filter((_, i) => i !== idx));
      if (activeImageIndex >= idx && activeImageIndex > 0) {
          setActiveImageIndex(prev => prev - 1);
      }
  };

  const handleInnerNavigate = (dir: 'next' | 'prev') => {
      setNavDirection(dir);
      const len = (isEditing ? editableUrls : item?.urls || []).length;
      const nextIdx = dir === 'next' ? (activeImageIndex + 1) % len : (activeImageIndex - 1 + len) % len;
      setActiveImageIndex(nextIdx);
  };

  const handleGlobalNavigate = (dir: 'next' | 'prev') => {
      setNavDirection(dir);
      const nextIdx = dir === 'next' ? (currentIndex + 1) % items.length : (currentIndex - 1 + items.length) % items.length;
      onNavigate(nextIdx);
  };

  const handleThumbSelect = (idx: number) => {
      if (idx === activeImageIndex) return;
      setNavDirection(idx > activeImageIndex ? 'next' : 'prev');
      setActiveImageIndex(idx);
  };

  const handlePublishClick = async () => {
      if (!item || item.type !== 'video') return;
      const blob = await fileSystemManager.getFileAsBlob(item.urls[activeImageIndex]);
      if (blob) {
          setVideoBlob(blob);
          setIsPublishModalOpen(true);
      }
  };

  if (!item) return null;

  const categoryOptions = [
      { label: 'GENERAL ARCHIVE', value: '' },
      ...categories.map(c => ({ label: c.name.toUpperCase(), value: c.id }))
  ];

  const currentMediaUrls = isEditing ? editableUrls : item.urls;

  return (
    <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm animate-fade-in flex items-center justify-center p-2 lg:p-4 overflow-hidden" onClick={onClose}>
        <div className="w-full h-full bg-base-100 rounded-none border border-base-300 shadow-2xl w-full h-full flex flex-col lg:flex-row overflow-hidden relative" onClick={e => e.stopPropagation()}>
            
            {/* Viewport & Deck Side */}
            <main className="flex-1 bg-black flex flex-col overflow-hidden relative group">
                
                {/* Media Viewport */}
                <div className="flex-grow relative flex items-center justify-center overflow-hidden">
                    <TransitionalMedia 
                        url={isEditing ? editableUrls[activeImageIndex] : item.urls[activeImageIndex]} 
                        type={item.type} 
                        title={item.title} 
                        onClick={() => setIsViewerOpen(true)}
                        direction={navDirection}
                    />

                    {/* Navigation Arrows */}
                    {currentMediaUrls.length > 1 && (
                        <>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleInnerNavigate('prev'); }}
                                className="absolute left-6 top-1/2 -translate-y-1/2 p-6 bg-black/40 hover:bg-primary text-white rounded-none transition-all duration-500 opacity-0 -translate-x-12 group-hover:opacity-100 group-hover:translate-x-0 z-20"
                            >
                                <ChevronLeftIcon className="w-8 h-8" />
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleInnerNavigate('next'); }}
                                className="absolute right-6 top-1/2 -translate-y-1/2 p-6 bg-black/40 hover:bg-primary text-white rounded-none transition-all duration-500 opacity-0 translate-x-12 group-hover:opacity-100 group-hover:translate-x-0 z-20"
                            >
                                <ChevronRightIcon className="w-8 h-8" />
                            </button>
                        </>
                    )}

                    {/* Top Stats Overlay */}
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

                {/* Left-Aligned Deck */}
                {currentMediaUrls.length > 1 && (
                    <div className="h-40 flex-shrink-0 bg-base-200/30 border-t border-white/5 relative flex items-center overflow-hidden group/deck">
                        {/* Thumbnail Navigation Arrows */}
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleInnerNavigate('prev'); }}
                            className="absolute left-4 z-40 btn btn-circle btn-sm btn-ghost bg-black/60 text-white opacity-0 group-hover/deck:opacity-100 transition-opacity border border-white/10"
                        >
                            <ChevronLeftIcon className="w-4 h-4" />
                        </button>

                        <div 
                            ref={carouselContainerRef}
                            className="w-full h-full relative overflow-hidden"
                        >
                            <div 
                                ref={carouselTrackRef}
                                className="flex items-center h-full relative"
                            >
                                {currentMediaUrls.map((url, idx) => (
                                    <Thumbnail 
                                        key={idx}
                                        url={url}
                                        type={item.type}
                                        isActive={idx === activeImageIndex}
                                        onClick={() => handleThumbSelect(idx)}
                                        isRemovable={isEditing}
                                        onRemove={() => handleRemoveSample(idx)}
                                    />
                                ))}
                            </div>
                        </div>

                        <button 
                            onClick={(e) => { e.stopPropagation(); handleInnerNavigate('next'); }}
                            className="absolute right-4 z-40 btn btn-circle btn-sm btn-ghost bg-black/60 text-white opacity-0 group-hover/deck:opacity-100 transition-opacity border border-white/10"
                        >
                            <ChevronRightIcon className="w-4 h-4" />
                        </button>
                        
                        {/* Gradient Viewport Masks (Adjusted for Left Alignment) */}
                        <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-black/60 to-transparent pointer-events-none z-30"></div>
                        <div className="absolute inset-y-0 right-0 w-48 bg-gradient-to-l from-black/90 via-black/40 to-transparent pointer-events-none z-30"></div>
                    </div>
                )}
            </main>

            {/* Information Sidebar */}
            <aside className="w-full lg:w-96 bg-base-100 border-l border-base-300 flex flex-col overflow-hidden">
                <header className="flex-shrink-0 h-16 px-6 border-b border-base-300 flex items-center justify-between bg-base-200/20">
                    <div className="flex items-center gap-3">
                        <button onClick={() => onTogglePin(item.id)} className={`btn btn-sm btn-ghost btn-square rounded-none ${isPinned ? 'text-primary' : 'opacity-20'}`}>
                            <ThumbTackIcon className="w-5 h-5" />
                        </button>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/20">Registry Data</span>
                    </div>
                    <button onClick={onClose} className="btn btn-sm btn-ghost btn-square rounded-none opacity-40 hover:opacity-100">
                        <CloseIcon className="w-6 h-6" />
                    </button>
                </header>

                <div className="flex-grow p-6 space-y-8 overflow-y-auto custom-scrollbar">
                    {isEditing ? (
                        <div className="space-y-6 animate-fade-in">
                            <InfoRow label="Identity Title">
                                <input value={title} onChange={e => setTitle(e.target.value)} className="input input-bordered rounded-none input-sm w-full font-bold uppercase tracking-tight" />
                            </InfoRow>
                            <InfoRow label="Sector Mapping">
                                <AutocompleteSelect value={categoryId} onChange={setCategoryId} options={categoryOptions} />
                            </InfoRow>
                            <InfoRow label="Media Archive (Samples)">
                                <div className="flex flex-wrap gap-2 p-3 bg-base-200/50 border border-base-300 rounded-none">
                                    {editableUrls.map((url, idx) => (
                                        <div key={idx} className="relative group/thumb w-12 h-12 bg-black border border-base-300">
                                            <img src={url.startsWith('data:') ? url : ''} alt="" className="w-full h-full object-cover opacity-60" />
                                            {!url.startsWith('data:') && <div className="absolute inset-0 flex items-center justify-center"><PhotoIcon className="w-4 h-4 opacity-20"/></div>}
                                            <button 
                                                onClick={() => handleRemoveSample(idx)}
                                                className="absolute -top-1 -right-1 btn btn-xs btn-circle btn-error scale-50 opacity-0 group-hover/thumb:opacity-100"
                                            >✕</button>
                                        </div>
                                    ))}
                                    <button 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-12 h-12 flex items-center justify-center border-2 border-dashed border-base-300 hover:border-primary hover:text-primary transition-all opacity-40 hover:opacity-100"
                                    >
                                        <PlusIcon className="w-5 h-5" />
                                    </button>
                                    <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*,video/*" onChange={handleAddSample} />
                                </div>
                            </InfoRow>
                            <InfoRow label="Archive Notes">
                                <textarea value={notes} onChange={e => setNotes(e.target.value)} className="textarea textarea-bordered rounded-none w-full min-h-[120px] text-sm leading-relaxed" />
                            </InfoRow>
                            <div className="p-4 bg-base-200/50 border border-base-300 space-y-4">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input type="checkbox" checked={isNsfw} onChange={e => setIsNsfw(e.target.checked)} className="checkbox checkbox-primary checkbox-sm rounded-none" />
                                    <span className="text-[10px] font-black uppercase text-base-content/40">Sensitive Fragment</span>
                                </label>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-8 animate-fade-in">
                            <InfoRow label="Fragment Identity">
                                <h2 className="text-2xl font-black tracking-tighter uppercase leading-tight">{title}</h2>
                            </InfoRow>

                            <InfoRow label="Neural Foundation">
                                <div className="p-4 bg-base-200/50 border border-base-300 italic text-sm leading-relaxed text-base-content/70">
                                    "{item.prompt || 'No blueprint archived.'}"
                                </div>
                            </InfoRow>

                            {notes && (
                                <InfoRow label="Registry Documentation">
                                    <p className="text-sm text-base-content/60 leading-relaxed font-medium">"{notes}"</p>
                                </InfoRow>
                            )}

                            <div className="pt-4 border-t border-base-300 flex flex-col gap-4">
                                 <div className="flex items-center justify-between">
                                    <span className="text-[8px] font-black uppercase text-base-content/20">Artifact Hash</span>
                                    <span className="text-[8px] font-mono opacity-20">{item.id}</span>
                                 </div>
                                 <div className="flex items-center justify-between">
                                    <span className="text-[8px] font-black uppercase text-base-content/20">Creation Stamp</span>
                                    <span className="text-[8px] font-mono opacity-20">{new Date(item.createdAt).toLocaleString()}</span>
                                 </div>
                            </div>
                        </div>
                    )}
                </div>

                <footer className="flex-shrink-0 p-4 border-t border-base-300 bg-base-200/20">
                    {isEditing ? (
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => setIsEditing(false)} className="btn btn-sm btn-ghost rounded-none font-black text-[10px] tracking-widest uppercase">Abort</button>
                            <button onClick={handleSave} className="btn btn-sm btn-primary rounded-none font-black text-[10px] tracking-widest uppercase shadow-lg">Commit</button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => setIsEditing(true)} className="btn btn-sm btn-ghost border border-base-300 rounded-none font-black text-[10px] tracking-widest uppercase">Modify</button>
                                <button onClick={() => onDelete(item)} className="btn btn-sm btn-ghost border border-base-300 text-error/60 rounded-none font-black text-[10px] tracking-widest uppercase">Delete</button>
                            </div>
                            {item.type === 'video' && settings.youtube?.isConnected && (
                                <button onClick={handlePublishClick} className="btn btn-sm btn-error rounded-none font-black text-[9px] tracking-[0.2em] uppercase">
                                    <YouTubeIcon className="w-4 h-4 mr-2" /> PUBLISH TO YOUTUBE
                                </button>
                            )}
                        </div>
                    )}
                </footer>
            </aside>
        </div>

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
                initialDescription={notes || prompt || ""}
                onSuccess={(url) => {
                    onUpdate(item.id, { youtubeUrl: url, publishedAt: Date.now() });
                    showGlobalFeedback("Archival successful.");
                }}
            />
        )}
    </div>
  );
};

export default ItemDetailView;