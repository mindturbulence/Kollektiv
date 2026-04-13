import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import type { CheatsheetItem } from '../types';
import { gsap } from 'gsap';
import { CloseIcon, SparklesIcon, RefreshIcon, PhotoIcon, ChevronLeftIcon, ChevronRightIcon, DeleteIcon, UploadIcon } from './icons';
import { fileSystemManager, fileToBase64 } from '../utils/fileUtils';
import { useSettings } from '../contexts/SettingsContext';
import { generateArtistDescription } from '../services/llmService';
import LoadingSpinner from './LoadingSpinner';
import { audioService } from '../services/audioService';

interface LayeredCheatsheetDetailProps {
  items: CheatsheetItem[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onInject: (item: CheatsheetItem) => void;
  onUpdateItem: (itemId: string, updates: Partial<CheatsheetItem>) => void;
}

const ImageLayer: React.FC<{ url: string; className?: string; depth?: number; onRemove?: () => void; isEditable?: boolean }> = ({ url, className = "", depth = 1, onRemove, isEditable }) => {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    useEffect(() => {
        let isActive = true;
        let objectUrl: string | null = null;
        const load = async () => {
            if (url.startsWith('data:') || url.startsWith('http')) {
                setBlobUrl(url); return;
            }
            const blob = await fileSystemManager.getFileAsBlob(url);
            if (blob && isActive) {
                objectUrl = URL.createObjectURL(blob);
                setBlobUrl(objectUrl);
            }
        };
        load();
        return () => { isActive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [url]);

    if (!blobUrl) return <div className={`bg-base-300/10 animate-pulse ${className}`} />;
    
    return (
        <div className={`overflow-hidden relative group ${className}`}>
            <img 
                src={blobUrl} 
                className="w-full h-full object-cover" 
                alt="" 
                style={{ transform: `scale(${1 + depth * 0.1})` }}
            />
            {isEditable && onRemove && (
                <button 
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    className="absolute top-4 right-4 btn btn-xs btn-square btn-error opacity-0 group-hover:opacity-100 transition-opacity"
                >
                    <DeleteIcon className="w-3 h-3" />
                </button>
            )}
        </div>
    );
};

const LayeredCheatsheetDetail: React.FC<LayeredCheatsheetDetailProps> = ({
  items, currentIndex, onClose, onNavigate, onInject, onUpdateItem
}) => {
  const item = items[currentIndex];
  const { settings } = useSettings();
  const [isSyncingDescription, setIsSyncingDescription] = useState(false);
  const [direction, setDirection] = useState<'next' | 'prev' | null>(null);
  const [isEditingImages, setIsEditingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const descRef = useRef<HTMLDivElement>(null);
  const imagesRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const tl = gsap.timeline({ defaults: { ease: "expo.out", duration: 1.8 } });

    // Initial entry animation
    tl.fromTo(bgRef.current, { scale: 1.3, opacity: 0 }, { scale: 1, opacity: 1 }, 0);
    tl.fromTo(titleRef.current, { y: 150, opacity: 0, skewY: 5 }, { y: 0, opacity: 1, skewY: 0 }, 0.3);
    tl.fromTo(descRef.current, { y: 80, opacity: 0 }, { y: 0, opacity: 1 }, 0.5);
    tl.fromTo(imagesRef.current, { x: 200, opacity: 0, rotate: 5 }, { x: 0, opacity: 1, rotate: 0 }, 0.4);

    return () => { tl.kill(); };
  }, []);

  // Handle slide transitions
  useEffect(() => {
    if (!direction || !containerRef.current) return;

    const tl = gsap.timeline({ 
        onComplete: () => setDirection(null),
        defaults: { ease: "expo.inOut", duration: 1.4 } 
    });

    const xMove = direction === 'next' ? -150 : 150;

    tl.to(titleRef.current, { x: xMove, opacity: 0, skewX: direction === 'next' ? 10 : -10, duration: 0.9 }, 0);
    tl.to(descRef.current, { x: xMove * 0.6, opacity: 0, duration: 0.9 }, 0.1);
    tl.to(imagesRef.current, { x: xMove * 2, opacity: 0, rotate: direction === 'next' ? -5 : 5, duration: 0.9 }, 0.05);
    tl.to(bgRef.current, { scale: 1.1, opacity: 0.3, duration: 0.9 }, 0);

    tl.fromTo(titleRef.current, { x: -xMove, opacity: 0, skewX: direction === 'next' ? -10 : 10 }, { x: 0, opacity: 1, skewX: 0 }, 1);
    tl.fromTo(descRef.current, { x: -xMove * 0.6, opacity: 0 }, { x: 0, opacity: 1 }, 1.1);
    tl.fromTo(imagesRef.current, { x: -xMove * 2, opacity: 0, rotate: direction === 'next' ? 5 : -5 }, { x: 0, opacity: 1, rotate: 0 }, 1.05);
    tl.fromTo(bgRef.current, { scale: 1.1, opacity: 0.3 }, { scale: 1, opacity: 1 }, 1);

  }, [currentIndex]);

  const handleNavigate = (dir: 'next' | 'prev') => {
    audioService.playClick();
    setDirection(dir);
    const nextIdx = dir === 'next' ? (currentIndex + 1) % items.length : (currentIndex - 1 + items.length) % items.length;
    onNavigate(nextIdx);
  };

  const handleManualSync = async () => {
      setIsSyncingDescription(true);
      try {
          const desc = await generateArtistDescription(item.name, settings);
          if (desc) { 
              onUpdateItem(item.id, { description: desc });
          }
      } catch (e) { console.error("AI Sync failed", e); } finally { setIsSyncingDescription(false); }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const base64Urls = await Promise.all(Array.from(files).map(file => fileToBase64(file as Blob)));
    onUpdateItem(item.id, { imageUrls: [...item.imageUrls, ...base64Urls] });
  };

  const handleRemoveImage = (idx: number) => {
    const newUrls = item.imageUrls.filter((_, i) => i !== idx);
    onUpdateItem(item.id, { imageUrls: newUrls });
  };

  const handleClose = () => {
    audioService.playClick();
    const tl = gsap.timeline({
        onComplete: onClose,
        defaults: { ease: "expo.in", duration: 0.8 }
    });

    tl.to(contentRef.current, { y: 100, opacity: 0 }, 0);
    tl.to(imagesRef.current, { x: 200, opacity: 0, rotate: 5 }, 0);
    tl.to(bgRef.current, { scale: 1.2, opacity: 0 }, 0.2);
    tl.to(containerRef.current, { opacity: 0 }, 0.4);
  };

  if (!item) return null;

  const mainImage = item.imageUrls[0] || "";

  return (
    <div ref={containerRef} className="absolute inset-0 z-[200] bg-base-100 flex flex-col overflow-hidden rounded-none">
        {/* Background Layer */}
        <div ref={bgRef} className="absolute inset-0 z-0">
            {mainImage && (
                <ImageLayer url={mainImage} className="w-full h-full opacity-20 grayscale blur-xl scale-110" depth={0} />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-base-100 via-transparent to-base-100"></div>
        </div>

        {/* Header */}
        <header className="relative z-10 flex justify-between items-center p-8 lg:p-12">
            <div className="flex items-center gap-4">
                <span className="text-[10px] font-black uppercase tracking-[0.5em] text-primary/60">ENTRY_{String(currentIndex + 1).padStart(3, '0')}</span>
                <div className="w-12 h-px bg-primary/20"></div>
            </div>
            <button 
                onClick={handleClose}
                className="group flex items-center gap-4 text-[10px] font-black uppercase tracking-[0.3em] text-base-content/40 hover:text-primary transition-colors"
            >
                <span>CLOSE_INTERFACE</span>
                <div className="w-10 h-10 rounded-full border border-base-content/10 flex items-center justify-center group-hover:border-primary transition-colors">
                    <CloseIcon className="w-4 h-4" />
                </div>
            </button>
        </header>

        {/* Main Content */}
        <div className="relative z-10 flex-grow flex flex-col lg:flex-row items-center px-8 lg:px-24 gap-8 lg:gap-24 overflow-y-auto lg:overflow-hidden py-12 lg:py-0">
            {/* Left Side: Text Content */}
            <div ref={contentRef} className="w-full lg:flex-1 max-w-2xl space-y-8 lg:space-y-12">
                <div className="space-y-4">
                    <h1 ref={titleRef} className="text-5xl md:text-6xl lg:text-8xl font-black tracking-tighter uppercase leading-[0.9] text-base-content break-words">
                        {item.name}
                    </h1>
                    <div className="flex items-center gap-4">
                        <div className="h-px flex-grow bg-base-content/10"></div>
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-base-content/20">AESTHETIC_PROFILE</span>
                    </div>
                </div>

                <div ref={descRef} className="space-y-8">
                    <div className="relative">
                        <div className="absolute -left-8 top-0 text-4xl font-serif text-primary/20">"</div>
                        <p className="text-lg lg:text-2xl font-medium leading-relaxed italic text-base-content/70">
                            {item.description || 'No descriptive data archived for this node.'}
                        </p>
                    </div>

                    {item.example && (
                        <div className="bg-base-200/50 p-6 border border-base-content/5 relative group/code">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-[8px] font-black uppercase tracking-[0.2em] text-primary/40">EXECUTION_SAMPLE</span>
                                <button 
                                    onClick={() => {
                                        navigator.clipboard.writeText(item.example!);
                                        audioService.playClick();
                                    }}
                                    className="text-[8px] font-black uppercase tracking-widest opacity-0 group-hover/code:opacity-100 transition-opacity hover:text-primary"
                                >
                                    COPY_CODE
                                </button>
                            </div>
                            <pre className="text-xs md:text-sm font-mono text-base-content/80 leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">
                                {item.example}
                            </pre>
                        </div>
                    )}

                    {item.keywords && item.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {item.keywords.map(kw => (
                                <span key={kw} className="px-3 py-1 bg-primary/5 border border-primary/10 text-[9px] font-black uppercase tracking-widest text-primary/60">
                                    {kw}
                                </span>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-4 lg:gap-6">
                        <button 
                            onClick={() => { onInject(item); handleClose(); }}
                            className="btn btn-primary px-8 rounded-none font-black text-[10px] tracking-[0.2em] h-14 min-w-[160px]"
                        >
                            <SparklesIcon className="w-5 h-5 mr-3" />
                            INJECT_DATA
                        </button>
                        <button 
                            onClick={handleManualSync}
                            disabled={isSyncingDescription}
                            className="btn btn-ghost border border-base-content/10 rounded-none font-black text-[10px] tracking-[0.2em] h-14 min-w-[160px]"
                        >
                            {isSyncingDescription ? <LoadingSpinner size={16} /> : <RefreshIcon className="w-4 h-4 mr-3" />}
                            AI_SYNC
                        </button>
                    </div>
                </div>
            </div>

            {/* Right Side: Image Layers */}
            <div ref={imagesRef} className="w-full lg:flex-1 relative h-[350px] md:h-[450px] lg:h-[600px] mt-12 lg:mt-0">
                <div className="absolute inset-0 flex items-center justify-center">
                    {/* Layered Images */}
                    {item.imageUrls.slice(0, 3).map((url, idx) => (
                        <div 
                            key={idx}
                            className="absolute transition-transform duration-700"
                            style={{ 
                                width: `${85 - idx * 15}%`,
                                height: `${85 - idx * 15}%`,
                                zIndex: 10 - idx,
                                transform: `translate(${idx * 20}px, ${idx * -20}px)`,
                                opacity: 1 - idx * 0.3
                            }}
                        >
                            <div className="w-full h-full border border-base-content/10 p-2 bg-base-100 shadow-2xl">
                                <ImageLayer 
                                    url={url} 
                                    className="w-full h-full" 
                                    depth={idx + 1} 
                                    isEditable={isEditingImages}
                                    onRemove={() => handleRemoveImage(idx)}
                                />
                            </div>
                        </div>
                    ))}
                    
                    {item.imageUrls.length === 0 && (
                        <div className="w-full h-full border-2 border-dashed border-base-content/10 flex flex-col items-center justify-center opacity-20">
                            <PhotoIcon className="w-16 h-16 mb-4" />
                            <span className="text-[10px] font-black uppercase tracking-widest">NO_VISUAL_DATA</span>
                        </div>
                    )}

                    {/* Image Management Controls */}
                    <div className="absolute bottom-0 right-0 flex gap-2">
                        <button 
                            onClick={() => setIsEditingImages(!isEditingImages)}
                            className={`btn btn-xs rounded-none font-black tracking-widest ${isEditingImages ? 'btn-primary' : 'btn-ghost border border-base-content/10'}`}
                        >
                            {isEditingImages ? 'EXIT_EDIT' : 'EDIT_ARTIFACTS'}
                        </button>
                        {isEditingImages && (
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="btn btn-xs btn-primary rounded-none font-black tracking-widest"
                            >
                                <UploadIcon className="w-3 h-3 mr-2" />
                                ADD_SAMPLE
                            </button>
                        )}
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple accept="image/*" className="hidden" />
                    </div>
                </div>
            </div>
        </div>

        {/* Navigation Controls */}
        <footer className="relative z-10 p-8 lg:p-12 flex justify-between items-end">
            <div className="flex flex-col gap-2">
                <span className="text-[8px] font-black uppercase tracking-[0.4em] text-base-content/20">NAVIGATION_ARRAY</span>
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => handleNavigate('prev')}
                        className="w-14 h-14 border border-base-content/10 flex items-center justify-center hover:bg-primary hover:text-primary-content hover:border-primary transition-all"
                    >
                        <ChevronLeftIcon className="w-6 h-6" />
                    </button>
                    <div className="flex flex-col items-center px-6">
                        <span className="text-2xl font-black tracking-tighter leading-none">{currentIndex + 1}</span>
                        <div className="w-8 h-[1px] bg-primary/40 my-1"></div>
                        <span className="text-[10px] font-bold text-base-content/30">{items.length}</span>
                    </div>
                    <button 
                        onClick={() => handleNavigate('next')}
                        className="w-14 h-14 border border-base-content/10 flex items-center justify-center hover:bg-primary hover:text-primary-content hover:border-primary transition-all"
                    >
                        <ChevronRightIcon className="w-6 h-6" />
                    </button>
                </div>
            </div>

            <div className="hidden lg:flex flex-col items-end gap-2">
                <span className="text-[8px] font-black uppercase tracking-[0.4em] text-base-content/20">SYSTEM_STATUS</span>
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                    <span className="text-[10px] font-mono font-bold text-primary/60 uppercase tracking-widest">INTERFACE_ACTIVE</span>
                </div>
            </div>
        </footer>
    </div>
  );
};

export default LayeredCheatsheetDetail;
