
import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useSettings } from '../contexts/SettingsContext';
import { loadGalleryItems } from '../utils/galleryStorage';
import DashboardGallery from './DashboardGallery';
import type { GalleryItem } from '../types';
import ChromaticText from './ChromaticText';

const IdleOverlay: React.FC<{ isVisible: boolean; onInteraction: () => void }> = ({ isVisible, onInteraction }) => {
    const { settings } = useSettings();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const frameCount = useRef(0);
    const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);

    useEffect(() => {
        if (isVisible && settings.idleScreenType === 'gallery') {
            loadGalleryItems().then(items => setGalleryItems(items.filter(i => !i.isNsfw)));
        }
    }, [isVisible, settings.idleScreenType]);

    useEffect(() => {
        if (!containerRef.current) return;
        
        gsap.killTweensOf(containerRef.current);
        
        if (isVisible) {
            gsap.to(containerRef.current, { 
                autoAlpha: 1, 
                duration: 2, 
                ease: "power2.inOut" 
            });
        } else {
            gsap.to(containerRef.current, { 
                autoAlpha: 0, 
                duration: 0.8, 
                ease: "power2.out" 
            });
        }
    }, [isVisible]);

    useEffect(() => {
        if (settings.idleScreenType !== 'matrix') return;
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        
        // Configuration for Density
        const fontSize = 11; 
        let columns: number;
        let drops: number[];

        const init = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            columns = Math.floor(canvas.width / (fontSize * 0.8));
            // Initialize drops with random negative values for staggered start
            drops = Array(columns).fill(1).map(() => Math.floor(Math.random() * -100));
        };

        init();
        const handleResize = () => init();
        window.addEventListener('resize', handleResize);

        // Character set: Cryptographic / Neural mix
        const chars = '01ABCDEFXX_[]{}//\\*^!#%&?+=$@ΣΩΨΦ0123456789';

        const draw = () => {
            animationFrameId = requestAnimationFrame(draw);
            
            // Speed Throttle: Only update every 3 frames for a slower, more deliberate feel
            frameCount.current++;
            if (frameCount.current % 3 !== 0) return;

            const style = getComputedStyle(document.documentElement);
            const primary = style.getPropertyValue('--p').trim();
            const base = style.getPropertyValue('--b1').trim();
            
            // Denser Trails: Smaller opacity for the fade-out
            ctx.fillStyle = `oklch(${base} / 0.05)`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.font = `900 ${fontSize}px "Space Mono"`;

            for (let i = 0; i < drops.length; i++) {
                // Skip drawing if the drop hasn't entered the screen yet
                if (drops[i] < 0) {
                    drops[i]++;
                    continue;
                }

                const text = chars.charAt(Math.floor(Math.random() * chars.length));
                
                // Varied brightness for depth and glow
                const brightness = Math.random();
                if (brightness > 0.98) {
                    // Critical highlight node
                    ctx.fillStyle = '#fff';
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = `oklch(${primary})`;
                } else {
                    // Layered opacity based on column index for depth variation
                    const depthFactor = (i % 3 === 0) ? 0.8 : (i % 2 === 0) ? 0.5 : 0.3;
                    ctx.fillStyle = `oklch(${primary} / ${depthFactor + brightness * 0.2})`;
                    ctx.shadowBlur = 0;
                }

                ctx.fillText(text, i * fontSize * 0.8, drops[i] * fontSize);

                // Reset drop with low probability once off screen
                if (drops[i] * fontSize > canvas.height && Math.random() > 0.98) {
                    drops[i] = 0;
                }
                drops[i]++;
            }
        };

        draw();

        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationFrameId);
        };
    }, [settings.idleScreenType]);

    return (
        <div 
            ref={containerRef}
            className="fixed inset-0 z-[9999] bg-transparent backdrop-blur-3xl cursor-none pointer-events-auto"
            style={{ opacity: 0, visibility: 'hidden' }}
            onClick={onInteraction}
            onMouseMove={onInteraction}
            onKeyDown={onInteraction}
        >
            {settings.idleScreenType === 'matrix' ? (
                <>
                    <canvas ref={canvasRef} className="w-full h-full block" />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-transparent pointer-events-none opacity-80"></div>
                </>
            ) : (
                <div className="w-full h-full opacity-60">
                    <DashboardGallery items={galleryItems} />
                    <div className="absolute inset-0 bg-base-100/40 pointer-events-none" />
                    
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-[30] pointer-events-none text-center">
                        <div className="overflow-hidden py-1 mb-2">
                            <p className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.5em] text-primary/60">
                                MINDTURBULENCE'S
                            </p>
                        </div>
                        <div className="overflow-hidden mb-4 py-2">
                            <h1 className="text-6xl md:text-8xl uppercase text-base-content flex items-center font-monoton tracking-widest">
                                <ChromaticText>Kollektiv</ChromaticText>
                                <span className="text-primary italic animate-pulse">.</span>
                            </h1>
                        </div>
                        <div className="overflow-hidden py-1">
                            <p className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.5em] text-base-content/40 max-w-2xl leading-loose">
                                 Creativity, organized… unlike your desktop
                            </p>
                        </div>
                        <div className="w-12 h-px bg-base-content/10 mt-10"></div>
                    </div>
                </div>
            )}
            
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
                <span className="text-[12px] font-black uppercase tracking-[0.6em] text-primary animate-pulse drop-shadow-[0_0_8px_oklch(var(--p))]">System Standby</span>
                <span className="text-[10px] font-black text-base-content/20 uppercase tracking-[0.4em]">Hover your mouse to resume</span>
            </div>
        </div>
    );
};

export default IdleOverlay;
