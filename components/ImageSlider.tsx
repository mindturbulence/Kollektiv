import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import { PhotoIcon } from './icons';
import { fileSystemManager } from '../utils/fileUtils';

interface ImageSliderProps {
    imageUrls: string[];
    name: string;
}

const ImageSlider: React.FC<ImageSliderProps> = ({ imageUrls, name }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [currentBlobUrl, setCurrentBlobUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [errorIndices, setErrorIndices] = useState<Set<number>>(new Set());
    
    const imageRef = useRef<HTMLImageElement>(null);
    const shutterRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const currentRelativeUrl = imageUrls[currentIndex];

    useEffect(() => {
        let isActive = true;
        let objectUrl: string | null = null;
        
        const loadUrl = async () => {
            if (!currentRelativeUrl) {
                if(isActive) setCurrentBlobUrl(null);
                return;
            }

            if (currentRelativeUrl.startsWith('http') || currentRelativeUrl.startsWith('data:')) {
                if(isActive) setCurrentBlobUrl(currentRelativeUrl);
                return;
            }
            
            if(isActive) setIsLoading(true);
            try {
                const blob = await fileSystemManager.getFileAsBlob(currentRelativeUrl);
                if (isActive) {
                    if (blob) {
                        objectUrl = URL.createObjectURL(blob);
                        setCurrentBlobUrl(objectUrl);
                        setErrorIndices(prev => { const newSet = new Set(prev); newSet.delete(currentIndex); return newSet; });
                    } else {
                        handleError();
                    }
                }
            } catch (e) {
                if (isActive) handleError();
            } finally {
                if(isActive) setIsLoading(false);
            }
        };
        
        const handleError = () => {
            console.error(`Failed to load image from local disk: ${currentRelativeUrl}`);
            setErrorIndices(prev => new Set(prev).add(currentIndex));
            setCurrentBlobUrl(null);
        };

        loadUrl();

        return () => {
            isActive = false;
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [currentRelativeUrl, currentIndex]);

    useLayoutEffect(() => {
        if (currentBlobUrl && imageRef.current && shutterRef.current) {
            const tl = gsap.timeline({
                defaults: { ease: "expo.inOut", duration: 1.2 }
            });

            tl.fromTo(shutterRef.current, 
                { clipPath: 'inset(0% 0% 0% 0%)' },
                { clipPath: 'inset(0% 100% 0% 0%)' }
            )
            .fromTo(imageRef.current, 
                { scale: 1.3, filter: 'grayscale(100%) brightness(0.5)' },
                { scale: 1, filter: 'grayscale(0%) brightness(1)', duration: 1.6 },
                "-=1"
            );
        }
    }, [currentBlobUrl]);

    const handleNext = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentIndex((prev) => (prev + 1) % imageUrls.length);
    };

    const handlePrev = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentIndex((prev) => (prev - 1 + imageUrls.length) % imageUrls.length);
    };
    
    const hasError = errorIndices.has(currentIndex);

    if (imageUrls.length === 0) {
        return (
            <div className="w-full h-full bg-slate-800 flex flex-col items-center justify-center text-center p-2">
                <PhotoIcon className="w-10 h-10 text-slate-600" />
                <p className="text-slate-500 text-xs mt-2">No image samples</p>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="relative w-full h-full bg-slate-800 overflow-hidden">
            {/* Shutter Overlay */}
            <div 
                ref={shutterRef}
                className="absolute inset-0 bg-base-300 z-20 pointer-events-none"
            />

            {isLoading ? (
                 <div className="w-full h-full flex items-center justify-center animate-pulse">
                    <PhotoIcon className="w-10 h-10 text-slate-700" />
                </div>
            ) : hasError || !currentBlobUrl ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-center p-2">
                    <PhotoIcon className="w-10 h-10 text-slate-600" />
                    <p className="text-slate-500 text-xs mt-2">Image unavailable</p>
                </div>
            ) : (
                <img 
                    ref={imageRef}
                    src={currentBlobUrl} 
                    alt={`Sample for ${name} ${currentIndex + 1}`}
                    className="w-full h-full object-cover will-change-transform"
                    loading="lazy"
                />
            )}
            
            {imageUrls.length > 1 && (
                <>
                    <button onClick={handlePrev} className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/80 text-white rounded-full transition-opacity opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-0 disabled:cursor-not-allowed z-30" aria-label="Previous image">
                        &#10094;
                    </button>
                    <button onClick={handleNext} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/80 text-white rounded-full transition-opacity opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-0 disabled:cursor-not-allowed z-30" aria-label="Next image">
                        &#10095;
                    </button>
                    <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[8px] font-black uppercase tracking-widest py-1 px-3 rounded-none z-30">
                        {currentIndex + 1} / {imageUrls.length}
                    </div>
                </>
            )}
        </div>
    );
};

export default ImageSlider;