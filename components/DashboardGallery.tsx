import React, { useMemo, useState, useEffect, useRef, memo } from 'react';
import { motion } from 'framer-motion';
import { gsap } from 'gsap';
import type { GalleryItem } from '../types';
import { fileSystemManager } from '../utils/fileUtils';

interface DashboardGalleryProps {
    items: GalleryItem[];
}

const GalleryCard: React.FC<{ url: string; id: string }> = memo(({ url, id }) => {
    const [displayUrl, setDisplayUrl] = useState<string | null>(null);
    const objectUrlRef = useRef<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const filterId = useMemo(() => `retro-shader-${id.replace(/[^a-zA-Z0-9]/g, '')}`, [id]);

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

    // Retro GSAP "Shader" Effect
    useEffect(() => {
        if (!imgRef.current || !displayUrl) return;

        const turb = document.querySelector(`#${filterId} feTurbulence`);
        const disp = document.querySelector(`#${filterId} feDisplacementMap`);

        if (!turb || !disp) return;

        const ctx = gsap.context(() => {
            // Ambient "breathing" of the shader
            gsap.to(turb, {
                attr: { baseFrequency: "0.01 0.08" },
                duration: 10,
                repeat: -1,
                yoyo: true,
                ease: "sine.inOut"
            });

            // Occasional digital "glitch" spikes
            const triggerGlitch = () => {
                const tl = gsap.timeline({ 
                    onComplete: () => { setTimeout(triggerGlitch, Math.random() * 8000 + 2000); } 
                });

                tl.to(disp, {
                    attr: { scale: Math.random() * 30 + 10 },
                    duration: 0.05,
                    ease: "power4.in"
                })
                .to(imgRef.current, {
                    x: (Math.random() - 0.5) * 10,
                    filter: `grayscale(1) contrast(3) brightness(2) url(#${filterId})`,
                    duration: 0.05
                }, 0)
                .to(disp, {
                    attr: { scale: 0 },
                    duration: 0.1,
                    ease: "power2.out"
                })
                .to(imgRef.current, {
                    x: 0,
                    filter: `grayscale(1) contrast(1) brightness(1) url(#${filterId})`,
                    duration: 0.1
                });
            };

            triggerGlitch();
        });

        return () => ctx.revert();
    }, [displayUrl, filterId]);

    // Position-based GSAP Blur Effect
    useEffect(() => {
        if (!containerRef.current) return;

        const updateBlur = () => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const vh = window.innerHeight;
            
            // Threshold for blur (25% of screen height)
            const threshold = vh * 0.25;
            let blur = 0;

            // Calculate blur based on center position relative to edges
            const centerY = rect.top + rect.height / 2;
            
            if (centerY < threshold) {
                // Top edge blur
                blur = gsap.utils.mapRange(0, threshold, 20, 0, Math.max(0, centerY));
            } else if (centerY > vh - threshold) {
                // Bottom edge blur
                blur = gsap.utils.mapRange(vh - threshold, vh, 0, 20, Math.min(vh, centerY));
            }

            gsap.set(containerRef.current, { 
                filter: `blur(${blur}px)`,
                opacity: gsap.utils.mapRange(0, 20, 1, 0.3, blur) // Subtle opacity fade with blur
            });
        };

        gsap.ticker.add(updateBlur);
        return () => gsap.ticker.remove(updateBlur);
    }, []);

    if (!displayUrl) return <div className="w-full aspect-[4/5] bg-base-content/5 animate-pulse" />;

    return (
        <div ref={containerRef} className="w-full aspect-[4/5] bg-transparent overflow-hidden relative group">
            <svg className="absolute w-0 h-0 overflow-hidden">
                <filter id={filterId}>
                    <feTurbulence type="fractalNoise" baseFrequency="0.001 0.01" numOctaves="2" result="noise" />
                    <feDisplacementMap in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G" />
                </filter>
            </svg>
            
            <img 
                ref={imgRef}
                src={displayUrl} 
                alt="" 
                className="w-full h-full object-cover grayscale opacity-20 transition-all duration-1000"
                style={{ filter: `url(#${filterId})` }}
                referrerPolicy="no-referrer"
            />
            {/* Subtle scanline overlay on each card */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%)] bg-[length:100%_4px] pointer-events-none opacity-10" />
        </div>
    );
});

const DashboardGallery: React.FC<DashboardGalleryProps> = ({ items }) => {
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
            {/* Dark Overlay removed as per user request */}
            
            {/* Fading Edges Mask removed as per user request */}
            
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
                                    <GalleryCard key={`${colIndex}-${imgIndex}-${item.id}`} url={item.url} id={`${item.id}-${imgIndex}`} />
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
