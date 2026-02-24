
import React, { useState, useRef, useEffect, memo, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import type { GalleryItem } from '../types';
import { ImageBrokenIcon, ThumbTackIcon, PlayIcon } from './icons';
import { fileSystemManager } from '../utils/fileUtils';
import type { GalleryViewMode } from './ImageGallery';

interface ImageCardProps {
  item: GalleryItem;
  viewMode: GalleryViewMode;
  onOpenDetailView: () => void;
  isPinned: boolean;
  categoryName?: string;
  showCategory?: boolean;
}

const Media: React.FC<{
    url: string | null;
    type: 'image' | 'video';
    title: string;
    viewMode: GalleryViewMode;
    isHovered: boolean;
}> = memo(({ url, type, title, viewMode, isHovered }) => {
    const [displayUrl, setDisplayUrl] = useState<string | null>(null);
    const [hasError, setHasError] = useState(false);
    const [isInView, setIsInView] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const mediaRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
    const shutterRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const objectUrlRef = useRef<string | null>(null);
    const idleHandleRef = useRef<number | null>(null);

    const handleLoad = () => {
        setIsLoaded(true);
    };

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

    // GSAP Reveal Animation
    useLayoutEffect(() => {
        if (isLoaded && isInView && mediaRef.current && shutterRef.current) {
            const tl = gsap.timeline({
                defaults: { ease: "expo.inOut", duration: 1.6 }
            });

            tl.fromTo(shutterRef.current, 
                { clipPath: 'inset(0% 0% 0% 0%)' },
                { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.4 }
            )
            .fromTo(mediaRef.current, 
                { scale: 1.4, filter: 'grayscale(100%) brightness(0.5)' },
                { scale: 1, filter: 'grayscale(0%) brightness(1)', duration: 2 },
                "-=1.2"
            );
        }
    }, [isLoaded, isInView]);

    // Hover Animation
    useEffect(() => {
        if (!mediaRef.current) return;
        if (isHovered) {
            gsap.to(mediaRef.current, {
                scale: 1.1,
                duration: 2.5,
                ease: "power2.out"
            });
        } else {
            gsap.to(mediaRef.current, {
                scale: 1,
                duration: 1.5,
                ease: "power2.inOut"
            });
        }
    }, [isHovered]);

    // Manual video playback control based on hover
    useEffect(() => {
        if (type === 'video' && videoRef.current) {
            if (isHovered) {
                videoRef.current.play().catch(() => {});
            } else {
                videoRef.current.pause();
                videoRef.current.currentTime = 0;
            }
        }
    }, [isHovered, type]);

    const minH = viewMode === 'compact' ? '80px' : viewMode === 'focus' ? '300px' : '160px';

    return (
        <div 
            ref={containerRef} 
            className="relative w-full bg-base-300 overflow-hidden flex items-center justify-center group/media"
            style={{ minHeight: minH }}
        >
            {/* Shutter Overlay */}
            <div 
                ref={shutterRef}
                className="absolute inset-0 bg-base-300 z-20 pointer-events-none"
            />

            {!displayUrl ? (
                 <div className="w-full h-48 bg-base-200/50 animate-pulse"></div>
            ) : hasError ? (
                <div className="flex flex-col items-center justify-center p-8 text-center bg-base-200 w-full aspect-square">
                    <ImageBrokenIcon className="w-8 h-8 text-warning/20" />
                    <p className="text-warning/30 text-[10px] font-black uppercase mt-2">Buffer Corrupt</p>
                </div>
            ) : type === 'video' ? (
                <div className="w-full h-full relative overflow-hidden">
                    <video 
                        ref={(el) => {
                            videoRef.current = el;
                            mediaRef.current = el;
                        }}
                        src={displayUrl} 
                        className="w-full h-full object-cover will-change-transform" 
                        muted 
                        playsInline 
                        loop
                        preload="metadata"
                        onLoadedData={handleLoad}
                    />
                    <div className={`absolute inset-0 flex items-center justify-center pointer-events-none z-10 transition-opacity duration-500 ${isHovered ? 'opacity-0' : 'opacity-100'}`}>
                        <div className="bg-black/40 backdrop-blur-sm p-2 rounded-full border border-white/10 shadow-2xl">
                            <PlayIcon className="w-4 h-4 text-white fill-current" />
                        </div>
                    </div>
                </div>
            ) : (
                <div className="w-full h-full relative overflow-hidden">
                    <img 
                        ref={mediaRef as React.RefObject<HTMLImageElement>}
                        src={displayUrl} 
                        alt={title} 
                        className="w-full h-full object-cover will-change-transform" 
                        loading="lazy" 
                        onLoad={handleLoad}
                    />
                </div>
            )}
        </div>
    );
});

const ImageCard: React.FC<ImageCardProps> = memo(({ item, viewMode, onOpenDetailView, isPinned, categoryName, showCategory }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  const styles = {
    title: viewMode === 'focus' ? 'text-2xl md:text-3xl tracking-tighter' : viewMode === 'compact' ? 'text-[10px]' : 'text-xl tracking-tight',
    label: viewMode === 'focus' ? 'text-[9px]' : viewMode === 'compact' ? 'text-[7px]' : 'text-[8px]',
    padding: viewMode === 'focus' ? 'p-8 lg:p-10' : viewMode === 'compact' ? 'p-3' : 'p-6',
    badge: viewMode === 'focus' ? 'px-3 py-1.5 text-[9px]' : 'px-2 py-1 text-[8px]',
    iconSize: viewMode === 'focus' ? 'w-5 h-5' : 'w-3.5 h-3.5',
    gap: viewMode === 'focus' ? 'space-y-4' : 'space-y-2'
  };

  return (
    <div 
      onClick={() => onOpenDetailView()}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative group bg-base-100 cursor-pointer overflow-hidden select-none transition-all duration-700`}
    >
      <Media
        url={item.urls[0]}
        type={item.type}
        title={item.title}
        viewMode={viewMode}
        isHovered={isHovered}
      />

      <div className="absolute inset-0 bg-gradient-to-t from-base-100 via-base-100/30 to-transparent opacity-90 group-hover:opacity-40 transition-opacity duration-1000 z-10 pointer-events-none"></div>

      <div className={`absolute inset-0 flex flex-col ${styles.padding} z-30 pointer-events-none`}>
        
        <div className="flex items-center gap-4 mb-auto opacity-70 group-hover:opacity-100 transition-opacity duration-500">
            <span className={`${styles.label} font-mono font-black text-primary tracking-[0.3em] uppercase whitespace-nowrap drop-shadow-sm`}>
                ID#{item.id.slice(-4).toUpperCase()}
            </span>
            <div className="flex-grow h-px bg-primary/30"></div>
            {isPinned && (
                <div className="text-primary drop-shadow-md flex-shrink-0">
                    <ThumbTackIcon className={styles.iconSize} />
                </div>
            )}
        </div>

        <div className={styles.gap}>
            <div className="group-hover:translate-y-0 transition-all duration-1000 ease-[cubic-bezier(0.65,0,0.35,1)] translate-y-2">
                {(showCategory && categoryName) && (
                    <span className={`${styles.label} font-black uppercase tracking-[0.3em] text-primary/60 block mb-1 opacity-0 group-hover:opacity-100 transition-opacity duration-700`}>
                        {categoryName}
                    </span>
                )}
                
                <h3 className={`${styles.title} font-black text-white uppercase leading-[1] line-clamp-2 transition-colors duration-700 group-hover:text-primary opacity-0 group-hover:opacity-100 drop-shadow-md`}>
                    {item.title}
                </h3>

                {viewMode !== 'compact' && (
                    <div className="grid transition-[grid-template-rows] duration-1000 ease-[cubic-bezier(0.65,0,0.35,1)] grid-rows-[0fr] group-hover:grid-rows-[1fr]">
                        <div className="overflow-hidden">
                            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50 leading-relaxed pt-4 opacity-0 group-hover:opacity-100 transition-opacity duration-1000">
                                {item.notes ? `"${item.notes}"` : "NO NOTES ARCHIVED"}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex items-center pt-4 opacity-70 group-hover:opacity-100 transition-opacity duration-500 pointer-events-auto">
                <span className={`font-black uppercase tracking-[0.3em] bg-primary/10 text-primary border border-primary/20 backdrop-blur-md shadow-lg ${styles.badge}`}>
                    {item.urls.length} {item.type.toUpperCase()}{item.urls.length > 1 ? 'S' : ''}
                </span>
                
                {item.isNsfw && (
                    <div className="ml-3 badge badge-warning badge-xs rounded-none font-black text-[7px] uppercase h-4 px-2 border-none">Restricted</div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
});

export default ImageCard;
