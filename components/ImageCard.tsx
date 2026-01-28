import React, { useState, useRef, useEffect } from 'react';
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
}> = React.memo(({ url, type, title, className }) => {
    const [displayUrl, setDisplayUrl] = useState<string | null>(null);
    const [hasError, setHasError] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const objectUrlRef = useRef<string | null>(null);

    const cleanup = () => {
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
        }
    };

    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setIsVisible(true);
            } else {
                if (isLoaded) {
                    setIsVisible(false);
                    setIsLoaded(false);
                    setDisplayUrl(null);
                    cleanup();
                }
            }
        }, { rootMargin: '600px' });

        if (containerRef.current) observer.observe(containerRef.current);
        return () => {
            observer.disconnect();
            cleanup();
        };
    }, [isLoaded]);

    useEffect(() => {
        if (!isVisible || !url) return;
        let isActive = true;
        
        const loadMedia = async () => {
            setHasError(false);
            if (url.startsWith('data:') || url.startsWith('http') || url.startsWith('blob:')) {
                if (isActive) setDisplayUrl(url);
                return;
            }
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
        loadMedia();
        return () => { isActive = false; };
    }, [url, isVisible]);

    const mediaClasses = `w-full h-auto block transition-all duration-700 ${isLoaded ? 'opacity-100' : 'opacity-0'} media-monochrome group-hover:filter-none group-hover:opacity-100 ${className}`;

    return (
        <div ref={containerRef} className="relative w-full bg-base-300 min-h-[120px] flex items-center justify-center overflow-hidden">
            {!isVisible || !displayUrl ? (
                 <div className="w-full aspect-[4/3] bg-base-200/50 animate-pulse"></div>
            ) : hasError ? (
                <div className="flex flex-col items-center justify-center p-8 text-center bg-base-200 w-full aspect-square">
                    <ImageBrokenIcon className="w-8 h-8 text-warning/20" />
                    <p className="text-warning/30 text-[10px] font-black uppercase mt-2">Relic Unreadable</p>
                </div>
            ) : type === 'video' ? (
                <div className="relative w-full h-full">
                    <video 
                        src={displayUrl} 
                        className={mediaClasses} 
                        muted 
                        playsInline 
                        preload="metadata"
                        onLoadedData={() => setIsLoaded(true)}
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="bg-black/40 backdrop-blur-sm p-3 rounded-full border border-white/10 shadow-2xl transition-transform group-hover:scale-110">
                            <PlayIcon className="w-5 h-5 text-white fill-current" />
                        </div>
                    </div>
                </div>
            ) : (
                <div className="relative w-full h-full">
                    <img 
                        src={displayUrl} 
                        alt={title} 
                        className={mediaClasses} 
                        loading="lazy" 
                        onLoad={() => setIsLoaded(true)}
                    />
                </div>
            )}
            {!isLoaded && isVisible && !hasError && (
                <div className="absolute inset-0 flex items-center justify-center bg-base-200">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
            )}
        </div>
    );
});

const ImageCard: React.FC<ImageCardProps> = ({ item, onOpenDetailView, onDeleteItem, onTogglePin, isPinned, categoryName, showCategory }) => {
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
    month: 'long', 
    day: 'numeric' 
  });

  return (
    <div 
      onClick={() => onOpenDetailView()}
      className={`relative group bg-base-100 transition-all duration-300 ease-in-out cursor-pointer border-b border-base-300 ${isMenuOpen ? 'z-50 overflow-visible' : 'overflow-hidden'}`}
    >
      <div className="absolute top-3 left-3 z-20 flex flex-col gap-1.5 pointer-events-none">
          {isPinned && <ThumbTackIcon className="w-4 h-4 drop-shadow-lg text-primary" />}
          {item.youtubeUrl && (
              <span className="bg-error text-error-content p-1 shadow-lg">
                <PlayIcon className="w-3 h-3 fill-current" />
              </span>
          )}
          {item.isNsfw && <div className="badge badge-warning badge-xs rounded-none font-black text-[8px]">NSFW</div>}
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
              <EditIcon className="w-3.5 h-3.5 mr-3" /> View Artifact
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

      <div className="relative w-full">
        <Media
          url={item.urls[0]}
          type={item.type}
          title={item.title}
        />
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-6 z-20 opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300 ease-in-out pointer-events-none bg-gradient-to-t from-black/95 via-black/80 to-transparent">
        {showCategory && categoryName && (
            <p className="text-primary text-[10px] font-black uppercase tracking-[0.2em] mb-1 truncate opacity-90">
                {categoryName}
            </p>
        )}
        <p className="text-white text-[18px] font-black uppercase tracking-widest truncate leading-tight mb-1" title={item.title}>
            {item.title}
        </p>
        {item.notes && (
            <p className="text-white/60 text-[11px] font-medium italic line-clamp-2 mt-1 leading-relaxed" title={item.notes}>
                {item.notes}
            </p>
        )}
        <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/10">
            <p className="text-[10px] font-mono font-bold text-white/40 uppercase">{fullDate}</p>
            {item.urls.length > 1 && (
                <span className="text-[10px] font-black text-primary uppercase tracking-[0.15em]">
                    SEQ: {item.urls.length}
                </span>
            )}
        </div>
      </div>
    </div>
  );
};

export default ImageCard;