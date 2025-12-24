
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { GalleryItem } from '../types';
import { CloseIcon, CenterIcon, ImageBrokenIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon } from './icons';
import { fileSystemManager } from '../utils/fileUtils';

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
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const objectUrlRef = useRef<string|null>(null);

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
        const loadMedia = async () => {
            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
                objectUrlRef.current = null;
            }
    
            if (!itemGroup || !itemGroup.urls[currentImageIndex]) {
                setIsLoading(false);
                setHasError(true);
                return;
            }
            
            setIsLoading(true);
            setHasError(false);
    
            const url = itemGroup.urls[currentImageIndex];
            if (url.startsWith('data:') || url.startsWith('http')) {
                setMediaBlobUrl(url);
                setIsLoading(false);
                return;
            }
            
            try {
                const blob = await fileSystemManager.getFileAsBlob(url);
                if (blob) {
                    const newUrl = URL.createObjectURL(blob);
                    objectUrlRef.current = newUrl;
                    setMediaBlobUrl(newUrl);
                } else {
                    setHasError(true);
                }
            } catch (e) {
                setHasError(true);
            } finally {
                setIsLoading(false);
            }
        };
    
        loadMedia();
    }, [itemGroup, currentImageIndex]);

    useEffect(() => {
        // Cleanup on unmount
        return () => {
            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
            }
        }
    }, []);
    
    const handleNavigation = useCallback((direction: 'next-item' | 'prev-item' | 'next-image' | 'prev-image') => {
        setZoom(1);
        setPosition({ x: 0, y: 0 });

        switch(direction) {
            case 'next-item':
                if (onNavigate) onNavigate((currentIndex + 1) % items.length);
                break;
            case 'prev-item':
                if (onNavigate) onNavigate((currentIndex - 1 + items.length) % items.length);
                break;
            case 'next-image':
                setCurrentImageIndex(prev => (prev + 1) % itemGroup.urls.length);
                break;
            case 'prev-image':
                 setCurrentImageIndex(prev => (prev - 1 + itemGroup.urls.length) % itemGroup.urls.length);
                break;
        }
    }, [onNavigate, currentIndex, items.length, itemGroup]);
    
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e as any).key === 'Escape') handleClose();
            if ((e as any).key === 'ArrowRight') handleNavigation('next-image');
            if ((e as any).key === 'ArrowLeft') handleNavigation('prev-image');
        };
        if(typeof window !== 'undefined') {
            (window as any).addEventListener('keydown', handleKeyDown);
            return () => (window as any).removeEventListener('keydown', handleKeyDown);
        }
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

    const handleDownload = async () => {
        if(mediaBlobUrl && typeof (window as any).document !== 'undefined') {
            const a = (window as any).document.createElement('a');
            a.href = mediaBlobUrl;
            a.download = itemGroup.sources[currentImageIndex] || `${itemGroup.title}_${currentImageIndex}.png`;
            (window as any).document.body.appendChild(a);
            a.click();
            (window as any).document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
        }
    };

    const modalContent = (
        <div 
          className="fixed inset-0 bg-black/90 z-50 flex flex-col animate-fade-in"
          onClick={handleClose}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
            <div className="flex-grow flex items-center justify-center p-4 relative overflow-hidden" onWheel={handleWheel}>
                {isLoading ? <div className="loading loading-spinner loading-lg text-primary"></div> :
                 hasError || !mediaBlobUrl ? <ImageBrokenIcon className="w-24 h-24 text-warning" /> :
                 itemGroup.type === 'video' ? 
                    <video src={mediaBlobUrl} controls autoPlay className="max-w-full max-h-full" onClick={e => e.stopPropagation()} /> :
                    <img 
                        src={mediaBlobUrl} 
                        alt={itemGroup.title} 
                        className="max-w-full max-h-full transition-transform duration-100" 
                        style={{ transform: `scale(${zoom}) translate(${position.x}px, ${position.y}px)`, cursor: isPanning ? 'grabbing' : zoom > 1 ? 'grab' : 'default' }}
                        onClick={e => e.stopPropagation()}
                        onMouseDown={handleMouseDown}
                    />
                }
            </div>

            {itemGroup && itemGroup.urls.length > 1 && (
                 <>
                    <button onClick={(e) => { e.stopPropagation(); handleNavigation('prev-image'); }} className="absolute left-6 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/80 text-white rounded-full transition-colors z-20" aria-label="Previous image"><ChevronLeftIcon className="w-8 h-8" /></button>
                    <button onClick={(e) => { e.stopPropagation(); handleNavigation('next-image'); }} className="absolute right-6 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/80 text-white rounded-full transition-colors z-20" aria-label="Next image"><ChevronRightIcon className="w-8 h-8" /></button>
                </>
            )}

             <div className="absolute top-4 right-4 z-20 flex gap-2">
                <button onClick={(e) => { e.stopPropagation(); handleDownload() }} className="btn btn-sm btn-ghost btn-circle" title="Download"><DownloadIcon className="w-6 h-6"/></button>
                <button onClick={(e) => { e.stopPropagation(); setZoom(1); setPosition({x:0, y:0}); }} className="btn btn-sm btn-ghost btn-circle" title="Reset view"><CenterIcon className="w-6 h-6"/></button>
                <button onClick={handleClose} className="btn btn-sm btn-ghost btn-circle" title="Close"><CloseIcon className="w-6 h-6"/></button>
            </div>
            
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 p-2 bg-black/50 text-white rounded-full text-sm">
                <span>{itemGroup.title}</span>
                {itemGroup.urls.length > 1 && <span className="ml-2 font-mono">({currentImageIndex + 1}/{itemGroup.urls.length})</span>}
            </div>
        </div>
    );
    
    if (typeof (window as any).document !== 'undefined' && (window as any).document.body) {
        return createPortal(modalContent, (window as any).document.body);
    }
    return null;
};

export default FullscreenViewer;
