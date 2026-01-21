import React, { useState, useRef, useEffect } from 'react';
import type { GalleryItem } from '../types';
import { ImageBrokenIcon, ThumbTackIcon, EllipsisVerticalIcon, EditIcon, DeleteIcon, PhotoIcon, ChevronLeftIcon, ChevronRightIcon, PlayIcon } from './icons';
import { fileSystemManager } from '../utils/fileUtils';

interface ImageCardProps {
  item: GalleryItem;
  onOpenDetailView: () => void;
  onDeleteItem: (item: GalleryItem) => void;
  onTogglePin: (id: string) => void;
  isPinned: boolean;
}

const Media: React.FC<{
    url: string | null;
    type: 'image' | 'video';
    title: string;
    className?: string;
    isLoading: boolean;
}> = React.memo(({ url, type, title, className, isLoading }) => {
    const [displayUrl, setDisplayUrl] = useState<string | null>(null);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        let isActive = true;
        let objectUrl: string | null = null;
        
        const loadMedia = async () => {
            if (!url) { if (isActive) setHasError(true); return; }
            if (isActive) setHasError(false);
            
            if (url.startsWith('data:') || url.startsWith('http') || url.startsWith('blob:')) {
                if (isActive) setDisplayUrl(url);
                return;
            }

            try {
                const blob = await fileSystemManager.getFileAsBlob(url);
                if (isActive) {
                    if (blob) {
                        objectUrl = URL.createObjectURL(blob);
                        setDisplayUrl(objectUrl);
                    } else { setHasError(true); }
                }
            } catch {
                 if (isActive) setHasError(true);
            }
        };
        loadMedia();

        return () => {
            isActive = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [url]);

    if (isLoading) {
        return <div className={`skeleton w-full aspect-square ${className}`}></div>;
    }
    if (hasError || !displayUrl) {
        return (
            <div className={`w-full aspect-square flex flex-col items-center justify-center bg-base-200 p-2 text-center ${className}`}>
                <ImageBrokenIcon className="w-12 h-12 text-warning" />
                <p className="text-warning text-sm mt-2">Could not load</p>
            </div>
        );
    }
    
    const mediaClasses = `w-full h-auto object-cover block grayscale group-hover:grayscale-0 transition-all duration-700 ${className}`;

    return type === 'video' ? (
        <video src={displayUrl} className={mediaClasses} autoPlay loop muted playsInline />
    ) : (
        <img src={displayUrl} alt={title} className={mediaClasses} />
    );
});


const ImageCard: React.FC<ImageCardProps> = ({ item, onOpenDetailView, onDeleteItem, onTogglePin, isPinned }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number|null>(null);
  const [animationClass, setAnimationClass] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});
  const [isLoadingUrls, setIsLoadingUrls] = useState(true);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let isActive = true;
    const objectUrls: string[] = [];

    const loadUrls = async () => {
        setIsLoadingUrls(true);
        const urlsToLoad = item.urls;
        const newBlobUrls: Record<string, string> = {};
        for (const url of urlsToLoad) {
            if (!isActive) return;
            try {
                const blob = await fileSystemManager.getFileAsBlob(url);
                if (blob) {
                    const objectUrl = URL.createObjectURL(blob);
                    objectUrls.push(objectUrl);
                    newBlobUrls[url] = objectUrl;
                } else {
                    newBlobUrls[url] = 'error';
                }
            } catch {
                newBlobUrls[url] = 'error';
            }
        }
        if (isActive) {
            setBlobUrls(newBlobUrls);
            setIsLoadingUrls(false);
        }
    };
    
    loadUrls();

    return () => {
        isActive = false;
        objectUrls.forEach(url => URL.revokeObjectURL(url));
        if (transitionTimerRef.current && typeof window !== 'undefined') clearTimeout(transitionTimerRef.current);
    };
  }, [item.urls]);
  
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
  
  const handleNavigate = (direction: 'next' | 'prev', e: React.MouseEvent) => {
    if (transitionTimerRef.current || item.urls.length <= 1) return;
    e.stopPropagation();
    
    const newIndex = direction === 'next'
        ? (currentIndex + 1) % item.urls.length
        : (currentIndex - 1 + item.urls.length) % item.urls.length;

    setPrevIndex(currentIndex);
    setAnimationClass(direction === 'next' ? 'animate-slide-out-to-left' : 'animate-slide-out-to-right');
    setCurrentIndex(newIndex); 

    if (typeof window !== 'undefined') {
        transitionTimerRef.current = setTimeout(() => {
            setPrevIndex(null);
            setAnimationClass('');
            transitionTimerRef.current = undefined;
        }, 300);
    }
  };

  const handleNext = (e: React.MouseEvent) => handleNavigate('next', e);
  const handlePrev = (e: React.MouseEvent) => handleNavigate('prev', e);

  return (
    <div 
      onClick={() => onOpenDetailView()}
      className="relative group bg-base-100 transition-all duration-300 ease-in-out transform hover:z-10 cursor-pointer overflow-hidden"
    >
      <div className="absolute top-2 left-2 z-30 flex flex-col gap-1.5">
          {isPinned && (
              <span title="Pinned">
                <ThumbTackIcon className="w-5 h-5 drop-shadow-lg text-primary" />
              </span>
          )}
          {item.youtubeUrl && (
              <span title="Published to YouTube" className="bg-error text-error-content p-1 shadow-lg">
                <PlayIcon className="w-3.5 h-3.5 fill-current" />
              </span>
          )}
      </div>

      {item.isNsfw && (
        <div
          className={`absolute top-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity ${isPinned ? 'left-9' : 'left-2'}`}
        >
          <div className="badge badge-warning badge-xs rounded-none font-black text-[8px]" title="NSFW">NSFW</div>
        </div>
      )}

      <div className="absolute top-2 right-2 z-30" ref={menuRef}>
        <button
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); setIsMenuOpen(!isMenuOpen); }}
          className="btn btn-xs btn-circle border-none bg-black/50 text-white/80 hover:bg-black/80 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
          title="More options"
        >
          <EllipsisVerticalIcon className="w-4 h-4" />
        </button>
        {isMenuOpen && (
          <div
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            className="absolute right-0 mt-2 w-48 bg-base-200/95 backdrop-blur-sm rounded-none shadow-2xl py-1 z-20 animate-fade-in-up border border-base-300"
          >
            <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); onOpenDetailView(); setIsMenuOpen(false); }} className="w-full text-left flex items-center px-4 py-2 text-xs font-black uppercase tracking-widest text-base-content hover:bg-base-300">
              <EditIcon className="w-4 h-4 mr-3" /> View & Edit
            </button>
            <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); onTogglePin(item.id); setIsMenuOpen(false); }} className="w-full text-left flex items-center px-4 py-2 text-xs font-black uppercase tracking-widest text-base-content hover:bg-base-300">
              <ThumbTackIcon className="w-4 h-4 mr-3" /> {isPinned ? 'Unpin Item' : 'Pin Item'}
            </button>
            <div className="my-1 h-px bg-base-300"></div>
            <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDeleteItem(item); setIsMenuOpen(false); }} className="w-full text-left flex items-center px-4 py-2 text-xs font-black uppercase tracking-widest text-error hover:bg-base-300">
              <DeleteIcon className="w-4 h-4 mr-3" /> Delete Item
            </button>
          </div>
        )}
      </div>

      <div className="relative w-full bg-black overflow-hidden">
        <Media
          url={blobUrls[item.urls[currentIndex]] || null}
          type={item.type}
          title={item.title}
          isLoading={isLoadingUrls}
        />
        {prevIndex !== null && (
          <div className={`absolute inset-0 w-full h-full ${animationClass}`}>
            <Media
                url={blobUrls[item.urls[prevIndex]] || null}
                type={item.type}
                title={item.title}
                isLoading={false}
            />
          </div>
        )}
      </div>
          
      {item.urls.length > 1 && (
      <>
          <button onClick={handlePrev} className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/80 text-white rounded-full transition-opacity opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-0 disabled:cursor-not-allowed z-20" aria-label="Previous image">
              <ChevronLeftIcon className="w-4 h-4"/>
          </button>
          <button onClick={handleNext} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/80 text-white rounded-full transition-opacity opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-0 disabled:cursor-not-allowed z-20" aria-label="Next image">
              <ChevronRightIcon className="w-4 h-4"/>
          </button>
      </>
      )}

      <div className="absolute bottom-0 left-0 right-0 p-3 z-20 opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 ease-in-out pointer-events-none bg-gradient-to-t from-black/90 via-black/50 to-transparent">
        <p className="text-white text-xs font-black uppercase tracking-widest truncate" title={item.title}>{item.title}</p>
        <p className="text-[9px] font-mono text-white/50 mt-0.5 uppercase">
          {new Date(item.createdAt).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </p>
        {item.urls.length > 1 && (
          <p className="text-[9px] font-mono text-white/30 mt-1 uppercase">{currentIndex + 1} / {item.urls.length} SAMPLES</p>
        )}
      </div>
    </div>
  );
};

export default ImageCard;
