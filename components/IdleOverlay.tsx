
import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

const IdleOverlay: React.FC<{ isVisible: boolean; onInteraction: () => void }> = ({ isVisible, onInteraction }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const frameCount = useRef(0);

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
        window.addEventListener('resize', init);

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
            window.removeEventListener('resize', init);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <div 
            ref={containerRef}
            className="fixed inset-0 z-[9999] bg-base-100/60 backdrop-blur-xl cursor-none pointer-events-auto"
            style={{ opacity: 0, visibility: 'hidden' }}
            onClick={onInteraction}
            onMouseMove={onInteraction}
            onKeyDown={onInteraction}
        >
            <canvas ref={canvasRef} className="w-full h-full block" />
            <div className="absolute inset-0 bg-gradient-to-b from-base-100 via-transparent to-base-100 pointer-events-none opacity-80"></div>
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
                <span className="text-[10px] font-black uppercase tracking-[0.6em] text-primary animate-pulse drop-shadow-[0_0_8px_oklch(var(--p))]">System Standby</span>
                <span className="text-[8px] font-mono text-base-content/20 uppercase tracking-[0.4em]">Neural stream active // click to resume</span>
            </div>
        </div>
    );
};

export default IdleOverlay;
