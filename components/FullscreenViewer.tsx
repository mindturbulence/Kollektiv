import React, { useState, useRef, useEffect, useCallback, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import type { GalleryItem } from '../types';
import { CloseIcon, CenterIcon, ImageBrokenIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon } from './icons';
import { fileSystemManager } from '../utils/fileUtils';
import LoadingSpinner from './LoadingSpinner';

interface FullscreenViewerProps {
    items: GalleryItem[];
    currentIndex: number;
    initialImageIndex?: number;
    onClose: () => void;
    onNavigate?: (newIndex: number) => void;
}

const FullscreenViewer: React.FC<FullscreenViewerProps> = ({ items, currentIndex, initialImageIndex = 0, onClose, onNavigate }) => {
    const itemGroup = useMemo(() => items[currentIndex], [items, currentIndex]);
    
    const [currentImageIndex, setCurrentImageIndex] = useState(initialImageIndex);
    const [mediaBlobUrl, setMediaBlobUrl] = useState<string | null>(null);
    const [prevMediaBlobUrl, setPrevMediaBlobUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [navDirection, setNavDirection] = useState<'next' | 'prev' | 'none'>('none');
    
    const containerRef = useRef<HTMLDivElement>(null);
    const currentLayerRef = useRef<HTMLDivElement>(null);
    const outgoingLayerRef = useRef<HTMLDivElement>(null);
    const objectUrls = useRef<Set<string>>(new Set());
    const imgRef = useRef<HTMLImageElement>(null);

    const [zoom, setZoom] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const panStartRef = useRef({ x: 0, y: 0 });

    const handleClose = useCallback(() => {
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
    
            const url = itemGroup.urls[currentImageIndex];
            let finalUrl = url;

            if (!url.startsWith('data:') && !url.startsWith('http')) {
                try {
                    const blob = await fileSystemManager.getFileAsBlob(url);
                    if (blob && isMounted) {
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
    
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleClose();
            if (e.key === 'ArrowRight') handleNavigation('next-image');
            if (e.key === 'ArrowLeft') handleNavigation('prev-image');
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleClose, handleNavigation]);

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

    const modalContent = (
        <div 
          ref={containerRef}
          className="fixed inset-0 bg-black/95 z-[150] flex flex-col animate-fade-in group select-none overflow-hidden"
          onClick={handleClose}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
            <div className="flex-grow flex items-center justify-center relative overflow-hidden" onWheel={handleWheel}>
                
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
                        <video src={mediaBlobUrl} controls autoPlay className="max-w-full max-h-full" onClick={e => e.stopPropagation()} />
                    ) : (
                        <img 
                            ref={imgRef}
                            src={mediaBlobUrl} 
                            alt={itemGroup.title} 
                            className="max-w-full max-h-full transition-transform duration-100 ease-out" 
                            style={{ 
                                transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`, 
                                cursor: isPanning ? 'grabbing' : zoom > 1 ? 'grab' : 'default' 
                            }}
                            onClick={e => e.stopPropagation()}
                            onMouseDown={handleMouseDown}
                            onDoubleClick={handleDoubleClick}
                            draggable={false}
                        />
                    )}
                </div>
            </div>

            {itemGroup && itemGroup.urls.length > 1 && zoom === 1 && (
                 <>
                    <button 
                        onClick={(e) => { e.stopPropagation(); handleNavigation('prev-image'); }} 
                        className="absolute left-10 top-1/2 -translate-y-1/2 p-8 bg-black/40 hover:bg-primary text-white rounded-none transition-all duration-500 opacity-0 -translate-x-12 group-hover:opacity-100 group-hover:translate-x-0 z-30" 
                        aria-label="Previous image"
                    >
                        <ChevronLeftIcon className="w-10 h-10" />
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); handleNavigation('next-image'); }} 
                        className="absolute right-10 top-1/2 -translate-y-1/2 p-8 bg-black/40 hover:bg-primary text-white rounded-none transition-all duration-500 opacity-0 translate-x-12 group-hover:opacity-100 group-hover:translate-x-0 z-30" 
                        aria-label="Next image"
                    >
                        <ChevronRightIcon className="w-10 h-10" />
                    </button>
                </>
            )}

             <div className="absolute top-8 right-8 z-40 flex gap-4 pointer-events-auto">
                <button onClick={(e) => { e.stopPropagation(); handleDownload() }} className="btn btn-ghost btn-circle bg-black/40 text-white/60 hover:text-white" title="Download"><DownloadIcon className="w-6 h-6"/></button>
                <button onClick={(e) => { e.stopPropagation(); setZoom(1); setPosition({x:0, y:0}); }} className="btn btn-ghost btn-circle bg-black/40 text-white/60 hover:text-white" title="Reset view"><CenterIcon className="w-6 h-6"/></button>
                <button onClick={handleClose} className="btn btn-ghost btn-circle bg-black/40 text-white/60 hover:text-white" title="Close"><CloseIcon className="w-6 h-6"/></button>
            </div>
            
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 p-4 bg-black/60 text-white rounded-none text-xs font-black uppercase tracking-widest px-12 backdrop-blur-xl border border-white/5 shadow-2xl pointer-events-none">
                <span>{itemGroup.title}</span>
                {itemGroup.urls.length > 1 && <span className="ml-6 font-mono text-primary">[{currentImageIndex + 1} / {itemGroup.urls.length}]</span>}
            </div>
        </div>
    );
    
    if (typeof document !== 'undefined' && document.body) {
        return createPortal(modalContent, document.body);
    }
    return null;
};

export default FullscreenViewer;