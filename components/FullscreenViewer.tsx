import React, { useState, useRef, useEffect, useCallback, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { motion } from 'framer-motion';
import type { GalleryItem } from '../types';
import { CloseIcon, CenterIcon, ImageBrokenIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon, PlayIcon, PauseIcon } from './icons';
import { fileSystemManager } from '../utils/fileUtils';
import LoadingSpinner from './LoadingSpinner';

interface FullscreenViewerProps {
    items: GalleryItem[];
    currentIndex: number;
    initialImageIndex?: number;
    onClose: () => void;
    onNavigate?: (newIndex: number) => void;
}

const ScramblingText: React.FC<{ text: string, className?: string }> = ({ text, className }) => {
    const [display, setDisplay] = useState(text);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';
    const frameRef = useRef<number | null>(null);

    useEffect(() => {
        let iteration = 0;
        const target = text;
        
        const scroll = () => {
            setDisplay(() => 
                target.split('').map((_, index) => {
                    // Reverse reveal: Resolve characters from right to left
                    // Use a more relaxed pace for smoother visual
                    if (index > target.length - iteration) return target[index];
                    return chars[Math.floor(Math.random() * chars.length)];
                }).join('')
            );
            
            if (iteration >= target.length) {
                if (frameRef.current) cancelAnimationFrame(frameRef.current);
                return;
            }
            
            iteration += 0.25; // Slower, smoother reveal
            frameRef.current = requestAnimationFrame(scroll);
        };
        
        frameRef.current = requestAnimationFrame(scroll);
        return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
    }, [text]);

    return <span className={className}>{display}</span>;
}

const FullscreenViewer: React.FC<FullscreenViewerProps> = ({ items, currentIndex, initialImageIndex = 0, onClose, onNavigate }) => {
    const itemGroup = useMemo(() => items[currentIndex], [items, currentIndex]);
    
    const [currentImageIndex, setCurrentImageIndex] = useState(initialImageIndex);
    const [mediaBlobUrl, setMediaBlobUrl] = useState<string | null>(null);
    const [prevMediaBlobUrl, setPrevMediaBlobUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [navDirection, setNavDirection] = useState<'next' | 'prev' | 'none'>('none');
    const [metadata, setMetadata] = useState<{ width: number; height: number; size: number; ratio: string } | null>(null);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const currentLayerRef = useRef<HTMLDivElement>(null);
    const outgoingLayerRef = useRef<HTMLDivElement>(null);
    const objectUrls = useRef<Set<string>>(new Set());
    const imgRef = useRef<HTMLImageElement>(null);

    const [zoom, setZoom] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [isSlideshowPlaying, setIsSlideshowPlaying] = useState(false);
    const slideshowTimerRef = useRef<NodeJS.Timeout | null>(null);
    const panStartRef = useRef({ x: 0, y: 0 });

    const handleClose = useCallback(() => {
        setIsSlideshowPlaying(false);
        setZoom(1);
        setPosition({ x: 0, y: 0 });
        onClose();
    }, [onClose]);

    useEffect(() => {
        let isMounted = true;
        const loadMedia = async () => {
            if (!itemGroup || !itemGroup.urls[currentImageIndex]) {
                setIsLoading(false);
                setHasError(true);
                return;
            }
            
            setIsLoading(true);
            setHasError(false);
            setMetadata(null);
    
            const url = itemGroup.urls[currentImageIndex];
            let finalUrl = url;
            let fileSize = 0;

            if (!url.startsWith('data:') && !url.startsWith('http')) {
                try {
                    const blob = await fileSystemManager.getFileAsBlob(url);
                    if (blob && isMounted) {
                        fileSize = blob.size;
                        const newUrl = URL.createObjectURL(blob);
                        objectUrls.current.add(newUrl);
                        finalUrl = newUrl;
                    }
                } catch (e) {
                    if (isMounted) setHasError(true);
                }
            }

            if (isMounted) {
                setPrevMediaBlobUrl(mediaBlobUrl);
                setMediaBlobUrl(finalUrl);
                if (fileSize > 0) {
                    setMetadata(m => m ? { ...m, size: fileSize } : { width: 0, height: 0, size: fileSize, ratio: '' });
                }
                setIsLoading(false);
                // Reset zoom on navigation
                setZoom(1);
                setPosition({ x: 0, y: 0 });
            }
        };
    
        loadMedia();
        return () => { isMounted = false; };
    }, [itemGroup, currentImageIndex]);

    useEffect(() => {
        return () => {
            objectUrls.current.forEach(u => URL.revokeObjectURL(u));
            objectUrls.current.clear();
        }
    }, []);

    useLayoutEffect(() => {
        if (!containerRef.current || navDirection === 'none' || !prevMediaBlobUrl) return;

        const ctx = gsap.context(() => {
            const tl = gsap.timeline({ defaults: { ease: "power4.inOut", duration: 0.8 } });
            const moveX = navDirection === 'next' ? 100 : -100;

            tl.fromTo(outgoingLayerRef.current, 
                { xPercent: 0, scale: 1, autoAlpha: 1 },
                { xPercent: -moveX * 0.4, scale: 0.8, autoAlpha: 0, clearProps: "all" }, 0
            );

            tl.fromTo(currentLayerRef.current, 
                { xPercent: moveX, scale: 1.1, autoAlpha: 0 },
                { xPercent: 0, scale: 1, autoAlpha: 1 }, 0
            );
        }, containerRef);

        return () => ctx.revert();
    }, [mediaBlobUrl, navDirection]);
    
    const handleNavigation = useCallback((direction: 'next-image' | 'prev-image') => {
        if (zoom > 1) return; // Prevent navigation while zoomed
        const dir = direction === 'next-image' ? 'next' : 'prev';
        setNavDirection(dir);
        setCurrentImageIndex(prev => direction === 'next-image' ? (prev + 1) % itemGroup.urls.length : (prev - 1 + itemGroup.urls.length) % itemGroup.urls.length);
    }, [itemGroup, zoom]);
    
    const handleGlobalNavigation = useCallback((direction: 'next' | 'prev') => {
        if (!onNavigate || zoom > 1) return;
        const nextIdx = direction === 'next' ? (currentIndex + 1) % items.length : (currentIndex - 1 + items.length) % items.length;
        onNavigate(nextIdx);
        setNavDirection(direction);
        setCurrentImageIndex(0); // Reset to first image of new item
    }, [items, currentIndex, onNavigate, zoom]);
    
    const handleUnifiedNavigation = useCallback((direction: 'next' | 'prev') => {
        if (zoom > 1) return;
        if (direction === 'next') {
            if (itemGroup.urls.length > 1 && currentImageIndex < itemGroup.urls.length - 1) {
                handleNavigation('next-image');
            } else {
                handleGlobalNavigation('next');
            }
        } else {
            if (itemGroup.urls.length > 1 && currentImageIndex > 0) {
                handleNavigation('prev-image');
            } else {
                handleGlobalNavigation('prev');
            }
        }
    }, [zoom, currentImageIndex, itemGroup.urls.length, handleNavigation, handleGlobalNavigation]);

    useEffect(() => {
        if (isSlideshowPlaying) {
            slideshowTimerRef.current = setInterval(() => {
                handleUnifiedNavigation('next');
            }, 3000); // 3 seconds per slide
        } else {
            if (slideshowTimerRef.current) clearInterval(slideshowTimerRef.current);
        }
        return () => {
            if (slideshowTimerRef.current) clearInterval(slideshowTimerRef.current);
        };
    }, [isSlideshowPlaying, handleUnifiedNavigation]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleClose();
            if (e.key === 'ArrowRight') { setIsSlideshowPlaying(false); handleUnifiedNavigation('next'); }
            if (e.key === 'ArrowLeft') { setIsSlideshowPlaying(false); handleUnifiedNavigation('prev'); }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleClose, handleUnifiedNavigation]);

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const scaleAmount = -e.deltaY * 0.005;
        setZoom(prev => {
            const newZoom = Math.max(1, prev + scaleAmount);
            if(newZoom <= 1) setPosition({x:0, y:0});
            return newZoom;
        });
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if(zoom > 1) {
            e.preventDefault();
            setIsPanning(true);
            panStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
        }
    };
    
    const handleMouseMove = (e: React.MouseEvent) => {
        if(isPanning) {
            setPosition({
                x: e.clientX - panStartRef.current.x,
                y: e.clientY - panStartRef.current.y
            });
        }
    };

    const handleMouseUp = () => setIsPanning(false);

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (zoom > 1) {
            setZoom(1);
            setPosition({ x: 0, y: 0 });
        } else {
            setZoom(2.5);
        }
    };

    const handleDownload = async () => {
        if(mediaBlobUrl && typeof document !== 'undefined') {
            const a = document.createElement('a');
            a.href = mediaBlobUrl;
            a.download = itemGroup.sources[currentImageIndex] || `${itemGroup.title}_${currentImageIndex}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    };

    const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        
        // Calculate simplified ratio
        const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
        const common = gcd(w, h);
        const ratio = `${w / common}:${h / common}`;
        
        setMetadata(prev => ({
            ...prev,
            width: w,
            height: h,
            size: prev?.size || 0,
            ratio
        }));
    };

    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const modalContent = (
        <motion.div 
            ref={containerRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="fixed inset-0 bg-black/95 z-[1000] group select-none overflow-hidden"
            onClick={handleClose}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
        >
                {/* Media Layer - Absolute inset-0 ensures true centering across the whole screen height */}
                <motion.div 
                    initial={{ scale: 1.1, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-0 flex items-center justify-center overflow-hidden" 
                    onWheel={handleWheel}
                >
                    
                    {/* Outgoing Layer */}
                    {prevMediaBlobUrl && (
                        <div ref={outgoingLayerRef} className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none opacity-0">
                             {itemGroup.type === 'video' ? (
                                <video src={prevMediaBlobUrl} muted className="max-w-full max-h-full object-contain" />
                            ) : (
                                <img src={prevMediaBlobUrl} className="max-w-full max-h-full object-contain" alt="prev" />
                            )}
                        </div>
                    )}

                    {/* Current Layer */}
                    <div ref={currentLayerRef} className="absolute inset-0 z-10 flex items-center justify-center">
                        {isLoading && !mediaBlobUrl ? (
                            <LoadingSpinner size={64} />
                        ) : hasError || !mediaBlobUrl ? (
                            <ImageBrokenIcon className="w-24 h-24 text-warning" />
                        ) : itemGroup.type === 'video' ? (
                            <video 
                                src={mediaBlobUrl} 
                                controls 
                                autoPlay 
                                className="transition-transform duration-100 ease-out"
                                style={{ 
                                    translate: `${position.x}px ${position.y}px`,
                                    scale: `${zoom}`,
                                    maxHeight: '100%',
                                    maxWidth: 'none',
                                    width: 'auto',
                                    height: 'auto',
                                    cursor: isPanning ? 'grabbing' : zoom > 1 ? 'grab' : 'default' 
                                }}
                                onClick={e => e.stopPropagation()} 
                            />
                        ) : (
                            <img 
                                ref={imgRef}
                                src={mediaBlobUrl} 
                                alt={itemGroup.title} 
                                className="transition-transform duration-100 ease-out" 
                                style={{ 
                                    translate: `${position.x}px ${position.y}px`,
                                    scale: `${zoom}`,
                                    maxHeight: '100%',
                                    maxWidth: 'none',
                                    width: 'auto',
                                    height: 'auto',
                                    cursor: isPanning ? 'grabbing' : zoom > 1 ? 'grab' : 'default' 
                                }}
                                onClick={e => e.stopPropagation()}
                                onMouseDown={handleMouseDown}
                                onDoubleClick={handleDoubleClick}
                                onLoad={handleImageLoad}
                                draggable={false}
                            />
                        )}
                    </div>
                </motion.div>

                {/* Navigation Controls - High Z-index for visibility */}
                <div className="pointer-events-none absolute inset-0 z-[100]">
                    {/* Unified Navigation (Items & Groups) - Docked to far edges */}
                    <div className="absolute inset-y-0 left-0 w-32 flex items-center justify-center">
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleUnifiedNavigation('prev'); }} 
                            className="pointer-events-auto p-4 text-white hover:text-primary transition-all duration-300 opacity-40 hover:opacity-100 scale-100 hover:scale-110" 
                            aria-label="Previous"
                        >
                            <ChevronLeftIcon className="w-16 h-16" />
                        </button>
                    </div>
                    <div className="absolute inset-y-0 right-0 w-32 flex items-center justify-center">
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleUnifiedNavigation('next'); }} 
                            className="pointer-events-auto p-4 text-white hover:text-primary transition-all duration-300 opacity-40 hover:opacity-100 scale-100 hover:scale-110" 
                            aria-label="Next"
                        >
                            <ChevronRightIcon className="w-16 h-16" />
                        </button>
                    </div>
                </div>

                <div className="absolute top-8 right-8 z-[110] flex items-center gap-4 pointer-events-auto">
                    <button 
                        onClick={(e) => { e.stopPropagation(); setIsSlideshowPlaying(!isSlideshowPlaying); }} 
                        className={`p-2 transition-all duration-300 ${isSlideshowPlaying ? 'text-primary scale-110' : 'text-white/40 hover:text-white'}`} 
                        title={isSlideshowPlaying ? "Pause Slideshow" : "Play Slideshow"}
                    >
                        {isSlideshowPlaying ? <PauseIcon className="w-6 h-6"/> : <PlayIcon className="w-6 h-6"/>}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDownload() }} className="p-2 text-white/40 hover:text-white transition-colors" title="Download"><DownloadIcon className="w-6 h-6"/></button>
                    <button onClick={(e) => { e.stopPropagation(); setZoom(1); setPosition({x:0, y:0}); }} className="p-2 text-white/40 hover:text-white transition-colors" title="Reset view"><CenterIcon className="w-6 h-6"/></button>
                    <button onClick={handleClose} className="p-2 text-error/40 hover:text-error transition-colors" title="Close"><CloseIcon className="w-6 h-6"/></button>
                </div>
                
                <motion.div 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                    className="absolute bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-black/80 to-transparent pointer-events-none flex items-end px-10 pb-5 h-20"
                >
                    <div className="w-full flex items-center justify-between pointer-events-auto translate-y-2">
                        {/* Left: Title & Index */}
                        <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-4">
                                <span className="text-sm font-black uppercase tracking-[0.2em] text-white">
                                    <ScramblingText text={itemGroup.title} />
                                </span>
                            </div>
                            <div className="flex items-center gap-3 opacity-30">
                                <span className="text-[11px] font-mono font-normal uppercase tracking-widest text-white/50">Registry ID:</span>
                                <span className="text-[11px] font-mono font-normal uppercase tracking-widest text-white">
                                    <ScramblingText text={itemGroup.id} />
                                </span>
                            </div>
                        </div>

                        {/* Right: Technical Specs (SR-71 Style) */}
                        <div className="flex items-center gap-10">
                            {metadata && (
                                <>
                                    <div className="flex items-center gap-3">
                                        <span className="text-[11px] font-mono font-normal text-white/30 uppercase tracking-widest whitespace-nowrap pt-0.5">Resolution:</span>
                                        <div className="min-w-[120px] flex items-center">
                                            <ScramblingText className="text-[11px] font-mono font-normal text-white tracking-tighter" text={`${metadata.width} × ${metadata.height}`} />
                                        </div>
                                    </div>
                                    <div className="w-px h-5 bg-white/5" />
                                    <div className="flex items-center gap-3">
                                        <span className="text-[11px] font-mono font-normal text-white/30 uppercase tracking-widest whitespace-nowrap pt-0.5">Aspect Ratio:</span>
                                        <div className="min-w-[60px] flex items-center">
                                            <ScramblingText className="text-[11px] font-mono font-normal text-white tracking-tighter" text={metadata.ratio} />
                                        </div>
                                    </div>
                                    <div className="w-px h-5 bg-white/5" />
                                    <div className="flex items-center gap-3">
                                        <span className="text-[11px] font-mono font-normal text-white/30 uppercase tracking-widest whitespace-nowrap pt-0.5">File Size:</span>
                                        <div className="min-w-[80px] flex items-center">
                                            <ScramblingText className="text-[11px] font-mono font-normal text-white tracking-tighter" text={formatFileSize(metadata.size)} />
                                        </div>
                                    </div>
                                </>
                            )}
                            <div className="w-px h-5 bg-white/5" />
                            <div className="flex items-center gap-3">
                                <span className="text-[11px] font-mono font-normal text-white/30 uppercase tracking-widest whitespace-nowrap">Media Library:</span>
                                <span className="text-[11px] font-mono font-normal text-white tracking-tighter min-w-[50px]">
                                    {String(currentImageIndex + 1).padStart(2, '0')} / {String(itemGroup.urls.length).padStart(2, '0')}
                                </span>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
    );
    
    if (typeof document !== 'undefined' && document.body) {
        return createPortal(modalContent, document.body);
    }
    return null;
};

export default FullscreenViewer;