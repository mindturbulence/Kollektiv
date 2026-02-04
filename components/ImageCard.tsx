import React, { useState, useRef, useEffect, memo } from 'react';
import type { GalleryItem } from '../types';
import { ImageBrokenIcon, ThumbTackIcon, EllipsisVerticalIcon, EditIcon, DeleteIcon, PlayIcon } from './icons';
import { fileSystemManager } from '../utils/fileUtils';

interface ImageCardProps {
  item: GalleryItem;
  onOpenDetailView: () => void;
  onDeleteItem: (item: GalleryItem) => void;
  onTogglePin: (id: string) => void;
  isPinned: boolean;
  categoryName?: string;
  showCategory?: boolean;
}

const Media: React.FC<{
    url: string | null;
    type: 'image' | 'video';
    title: string;
    className?: string;
}> = memo(({ url, type, title, className }) => {
    const [displayUrl, setDisplayUrl] = useState<string | null>(null);
    const [hasError, setHasError] = useState(false);
    const [isInView, setIsInView] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isRevealed, setIsRevealed] = useState(false);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const objectUrlRef = useRef<string | null>(null);
    const idleHandleRef = useRef<number | null>(null);

    const cleanup = () => {
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
        }
        if (idleHandleRef.current) {
            if ('cancelIdleCallback' in window) (window as any).cancelIdleCallback(idleHandleRef.current);
            else clearTimeout(idleHandleRef.current);
            idleHandleRef.current = null;
        }
    };

    // Intersection Observer to detect scroll-into-view
    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setIsInView(true);
            }
        }, { 
            rootMargin: '100px', 
            threshold: 0.01 
        }); 

        if (containerRef.current) observer.observe(containerRef.current);
        return () => {
            observer.disconnect();
            cleanup();
        };
    }, []);

    // Load media logic
    useEffect(() => {
        if (!isInView || !url) return;
        let isActive = true;
        
        const loadMedia = async () => {
            setHasError(false);
            if (url.startsWith('data:') || url.startsWith('http') || url.startsWith('blob:')) {
                if (isActive) setDisplayUrl(url);
                return;
            }

            const startLoading = async () => {
                try {
                    const blob = await fileSystemManager.getFileAsBlob(url);
                    if (isActive && blob) {
                        cleanup();
                        const newUrl = URL.createObjectURL(blob);
                        objectUrlRef.current = newUrl;
                        setDisplayUrl(newUrl);
                    } else if (isActive) {
                        setHasError(true);
                    }
                } catch {
                     if (isActive) setHasError(true);
                }
            };

            if ('requestIdleCallback' in window) {
                idleHandleRef.current = (window as any).requestIdleCallback(() => startLoading(), { timeout: 1500 });
            } else {
                idleHandleRef.current = (window as any).setTimeout(() => startLoading(), 50) as any;
            }
        };
        loadMedia();
        return () => { isActive = false; cleanup(); };
    }, [url, isInView]);

    // Trigger reveal only when BOTH loaded and in view
    useEffect(() => {
        if (isLoaded && isInView && !isRevealed) {
            // Handshake to ensure the initial hidden state is painted
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setIsRevealed(true);
                });
            });
        }
    }, [isLoaded, isInView, isRevealed]);

    // Apply the fade-in-up classes (reveal-artifact is defined in index.css)
    const mediaClasses = `w-full h-auto block reveal-artifact ${isRevealed ? 'reveal-artifact-active' : ''} media-monochrome group-hover:filter-none ${className}`;

    return (
        <div 
            ref={containerRef} 
            className="relative w-full bg-base-300 overflow-hidden flex items-center justify-center min-h-[160px]"
        >
            {!displayUrl ? (
                 <div className="w-full h-48 bg-base-200/50 animate-pulse"></div>
            ) : hasError ? (
                <div className="flex flex-col items-center justify-center p-8 text-center bg-base-200 w-full aspect-square">
                    <ImageBrokenIcon className="w-8 h-8 text-warning/20" />
                    <p className="text-warning/30 text-[10px] font-black uppercase mt-2">Buffer Corrupt</p>
                </div>
            ) : type === 'video' ? (
                <div className="w-full h-auto relative overflow-hidden">
                    <video 
                        src={displayUrl} 
                        className={mediaClasses} 
                        muted 
                        playsInline 
                        preload="metadata"
                        onLoadedData={() => setIsLoaded(true)}
                    />
                    {isRevealed && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="bg-black/40 backdrop-blur-sm p-3 rounded-full border border-white/10 shadow-2xl transition-transform group-hover:scale-110">
                                <PlayIcon className="w-5 h-5 text-white fill-current" />
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="w-full h-auto relative overflow-hidden">
                    <img 
                        src={displayUrl} 
                        alt={title} 
                        className={mediaClasses} 
                        loading="lazy" 
                        onLoad={() => setIsLoaded(true)}
                    />
                </div>
            )}
        </div>
    );
});

const ImageCard: React.FC<ImageCardProps> = memo(({ item, onOpenDetailView, onDeleteItem, onTogglePin, isPinned, categoryName, showCategory }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !(menuRef.current as any).contains(event.target as any)) {
        setIsMenuOpen(false);
      }
    };
    if (typeof (window as any).document !== 'undefined') {
        (window as any).document.addEventListener('mousedown', handleClickOutside);
        return () => (window as any).document.removeEventListener('mousedown', handleClickOutside);
    }
  }, []);

  const fullDate = new Date(item.createdAt).toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });

  return (
    <div 
      onClick={() => onOpenDetailView()}
      className={`relative group bg-base-100 transition-all duration-300 ease-in-out cursor-pointer border-b border-base-300 ${isMenuOpen ? 'z-50 overflow-visible' : 'overflow-hidden'}`}
    >
      <div className="absolute top-3 left-3 z-20 flex flex-col gap-1.5 pointer-events-none">
          {isPinned && <ThumbTackIcon className="w-4 h-4 drop-shadow-lg text-primary" />}
          {item.isNsfw && <div className="badge badge-warning badge-xs rounded-none font-black text-[8px] uppercase">Restricted</div>}
      </div>

      <div className="absolute top-2 right-2 z-30" ref={menuRef}>
        <button
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); setIsMenuOpen(!isMenuOpen); }}
          className={`btn btn-xs btn-square btn-ghost text-white hover:bg-black/40 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 ${isMenuOpen ? 'opacity-100 bg-black/40' : ''}`}
        >
          <EllipsisVerticalIcon className="w-5 h-5" />
        </button>
        {isMenuOpen && (
          <div
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            className="absolute right-0 mt-2 w-44 bg-base-200/95 backdrop-blur-md rounded-none shadow-2xl py-1 z-40 animate-fade-in border border-base-300"
          >
            <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); onOpenDetailView(); setIsMenuOpen(false); }} className="w-full text-left flex items-center px-4 py-2 text-[10px] font-black uppercase tracking-widest text-base-content hover:bg-base-300">
              <EditIcon className="w-3.5 h-3.5 mr-3" /> Inspect Artifact
            </button>
            <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); onTogglePin(item.id); setIsMenuOpen(false); }} className="w-full text-left flex items-center px-4 py-2 text-[10px] font-black uppercase tracking-widest text-base-content hover:bg-base-300">
              <ThumbTackIcon className="w-3.5 h-3.5 mr-3" /> {isPinned ? 'Unpin' : 'Pin'}
            </button>
            <div className="my-1 h-px bg-base-300"></div>
            <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDeleteItem(item); setIsMenuOpen(false); }} className="w-full text-left flex items-center px-4 py-2 text-[10px] font-black uppercase tracking-widest text-error hover:bg-base-300">
              <DeleteIcon className="w-3.5 h-3.5 mr-3" /> Purge
            </button>
          </div>
        )}
      </div>

      <Media
        url={item.urls[0]}
        type={item.type}
        title={item.title}
      />

      <div className="absolute bottom-0 left-0 right-0 p-6 z-20 opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-500 ease-out pointer-events-none bg-gradient-to-t from-black/95 via-black/40 to-transparent">
        {showCategory && categoryName && (
            <p className="text-primary text-[9px] font-black uppercase tracking-[0.2em] mb-1 truncate opacity-90">
                {categoryName}
            </p>
        )}
        <p className="text-white text-[16px] font-black uppercase tracking-widest truncate leading-tight mb-1">
            {item.title}
        </p>
        <p className="text-[10px] font-mono font-bold text-white/30 uppercase mt-2 pt-2 border-t border-white/5">{fullDate}</p>
      </div>
    </div>
  );
});

export default ImageCard;