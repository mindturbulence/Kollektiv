import React, { useMemo, useState, useEffect, useRef, memo } from 'react';
import { motion } from 'framer-motion';
import { gsap } from 'gsap';
import type { GalleryItem } from '../types';
import { fileSystemManager } from '../utils/fileUtils';

interface DashboardGalleryProps {
    items: GalleryItem[];
}

const GalleryCard: React.FC<{ url: string }> = memo(({ url }) => {
    const [displayUrl, setDisplayUrl] = useState<string | null>(null);
    const objectUrlRef = useRef<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const colorImgRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        let isActive = true;
        const loadMedia = async () => {
            if (url.startsWith('data:') || url.startsWith('http') || url.startsWith('blob:')) {
                if (isActive) setDisplayUrl(url);
                return;
            }

            try {
                const blob = await fileSystemManager.getFileAsBlob(url);
                if (isActive && blob) {
                    const newUrl = URL.createObjectURL(blob);
                    objectUrlRef.current = newUrl;
                    setDisplayUrl(newUrl);
                }
            } catch (e) {
                console.error("Failed to load dashboard gallery image:", e);
            }
        };

        loadMedia();
        return () => {
            isActive = false;
            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
            }
        };
    }, [url]);

    // Retro GSAP "Shader" Effect - Median speed with performance optimizations
    useEffect(() => {
        if (!imgRef.current || !colorImgRef.current || !displayUrl) return;

        const turb = document.querySelector('#global-retro-shader feTurbulence');
        const disp = document.querySelector('#global-retro-shader feDisplacementMap');

        if (!turb || !disp) return;

        const ctx = gsap.context(() => {
            const triggerGlitch = () => {
                const tl = gsap.timeline({ 
                    onComplete: () => { setTimeout(triggerGlitch, Math.random() * 9000 + 3000); } 
                });

                const attackTime = 0.4;
                const releaseTime = 1.6;

                tl.to(disp, {
                    attr: { scale: Math.random() * 40 + 20 },
                    duration: attackTime,
                    ease: "sine.inOut"
                })
                .to(colorImgRef.current, {
                    opacity: 1,
                    x: (Math.random() - 0.5) * 15,
                    filter: `contrast(1.5) brightness(1.2) url(#global-retro-shader)`,
                    duration: attackTime,
                    ease: "sine.inOut"
                }, 0)
                .to(disp, {
                    attr: { scale: 0 },
                    duration: releaseTime,
                    delay: 0.2,
                    ease: "expo.out"
                })
                .to(colorImgRef.current, {
                    opacity: 0,
                    x: 0,
                    filter: `contrast(1) brightness(1) url(#global-retro-shader)`,
                    duration: releaseTime,
                    ease: "expo.out"
                }, "-=" + releaseTime);
            };

            triggerGlitch();
        });

        return () => ctx.revert();
    }, [displayUrl]);

    // Cleanup object URL
    useEffect(() => {
        return () => {
            if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        };
    }, []);

    if (!displayUrl) return <div className="w-full aspect-[4/5] bg-base-content/5 animate-pulse" />;

    return (
        <div ref={containerRef} className="w-full aspect-[4/5] bg-transparent overflow-hidden relative group will-change-[filter,opacity]">
            {/* Layer 1: Base Grayscale Image */}
            <img 
                ref={imgRef}
                src={displayUrl} 
                alt="" 
                className="w-full h-full object-cover grayscale opacity-20 transition-all duration-1000 will-change-transform"
                style={{ filter: 'grayscale(1)' }}
                referrerPolicy="no-referrer"
            />
            
            {/* Layer 2: Color Image (Visible during active shader) */}
            <img 
                ref={colorImgRef}
                src={displayUrl} 
                alt="" 
                className="absolute inset-0 w-full h-full object-cover opacity-0 transition-none will-change-[opacity,transform,filter]"
                style={{ filter: `url(#global-retro-shader)` }}
                referrerPolicy="no-referrer"
            />

            {/* Subtle scanline overlay on each card */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%)] bg-[length:100%_4px] pointer-events-none opacity-10" />
        </div>
    );
});

const DashboardGallery: React.FC<DashboardGalleryProps> = ({ items }) => {
    // Shared SVG Filter to reduce total SVG node count and avoid per-card re-paints
    useEffect(() => {
        const turb = document.querySelector('#global-retro-shader feTurbulence');
        if (!turb) return;
        
        const ctx = gsap.context(() => {
            gsap.to(turb, {
                attr: { baseFrequency: "0.01 0.08" },
                duration: 10,
                repeat: -1,
                yoyo: true,
                ease: "sine.inOut"
            });
        });
        return () => ctx.revert();
    }, []);

    // Filter only images and extract URLs, excluding NSFW
    const imageUrls = useMemo(() => {
        const urls = items
            .filter(item => item.type === 'image' && item.urls && item.urls.length > 0 && !item.isNsfw)
            .flatMap(item => item.urls.map((url, index) => ({ url, id: `${item.id}-${index}` })));
        
        // If we don't have enough images, use some placeholders to fill the space
        if (urls.length < 15) {
            const placeholders = Array.from({ length: 15 - urls.length }).map((_, i) => ({
                url: `https://picsum.photos/seed/kollektiv-${i}/600/800`,
                id: `placeholder-${i}`
            }));
            return [...urls, ...placeholders];
        }
        return urls;
    }, [items]);

    // Create 5 columns for a dense look
    const columnsCount = 5;
    
    // Distribute images into columns
    const columns = useMemo(() => {
        const cols: { url: string; id: string }[][] = Array.from({ length: columnsCount }, () => []);
        const shuffled = [...imageUrls].sort(() => Math.random() - 0.5);
        
        shuffled.forEach((item, i) => {
            cols[i % columnsCount].push(item);
        });
        
        return cols;
    }, [imageUrls, columnsCount]);

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none bg-transparent">
            {/* Single Global SVG Filter to reduce total GPU pressure */}
            <svg className="absolute w-0 h-0 overflow-hidden pointer-events-none">
                <filter id="global-retro-shader">
                    <feTurbulence type="fractalNoise" baseFrequency="0.001 0.01" numOctaves="2" result="noise" />
                    <feDisplacementMap in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G" />
                </filter>
            </svg>
            
            <div className="flex gap-12 h-[140%] -top-[20%] relative px-12">
                {columns.map((colItems, colIndex) => {
                    const isUp = colIndex % 2 === 0;
                    // Much slower speed: 120-180 seconds for a full loop
                    const duration = 120 + (colIndex * 20) + Math.random() * 30;
                    
                    return (
                        <div key={colIndex} className="flex-1 relative overflow-hidden">
                            <motion.div
                                className="flex flex-col gap-12"
                                animate={{
                                    y: isUp ? [0, '-50%'] : ['-50%', 0]
                                }}
                                transition={{
                                    duration: duration,
                                    repeat: Infinity,
                                    ease: "linear"
                                }}
                            >
                                {/* Duplicate images for seamless loop */}
                                {[...colItems, ...colItems].map((item, imgIndex) => (
                                    <GalleryCard key={`${colIndex}-${imgIndex}-${item.id}`} url={item.url} />
                                ))}
                            </motion.div>
                        </div>
                    );
                })}
            </div>
            
            {/* Vignette effect removed as per user request */}
        </div>
    );
};

export default DashboardGallery;
