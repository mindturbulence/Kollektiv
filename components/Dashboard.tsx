import React, { useState, useEffect, useRef, useCallback } from 'react';
import { gsap } from 'gsap';
import { loadGalleryItems } from '../utils/galleryStorage';
import type { GalleryItem, ActiveTab, Idea } from '../types';
import LoadingSpinner from './LoadingSpinner';

// --- CHROMATIC JITTER COMPONENT ---
const ChromaticText: React.FC<{ text: string; enabled?: boolean }> = ({ text, enabled = true }) => {
    const [offsets, setOffsets] = useState({ x1: 0, y1: 0, x2: 0, y2: 0, opacity: 1 });
    const requestRef = useRef<number>(0);
    const lastUpdate = useRef<number>(0);

    const update = (time: number) => {
        // Only update every ~60ms to create a "steppy" digital flicker rather than smooth motion
        if (time - lastUpdate.current > 60) {
            if (enabled) {
                const jitter = Math.random() > 0.1; // 90% chance of jittering when enabled
                
                if (jitter) {
                    setOffsets({
                        x1: (Math.random() - 0.5) * 4,
                        y1: (Math.random() - 0.5) * 2,
                        x2: (Math.random() - 0.5) * -4,
                        y2: (Math.random() - 0.5) * -2,
                        opacity: 0.8 + Math.random() * 0.2
                    });
                } else {
                    setOffsets({ x1: 0, y1: 0, x2: 0, y2: 0, opacity: 1 });
                }
            } else {
                // If disabled, snap back to clean state
                setOffsets({ x1: 0, y1: 0, x2: 0, y2: 0, opacity: 1 });
            }
            lastUpdate.current = time;
        }
        requestRef.current = requestAnimationFrame(update);
    };

    useEffect(() => {
        requestRef.current = requestAnimationFrame(update);
        return () => cancelAnimationFrame(requestRef.current);
    }, [enabled]);

    return (
        <span 
            className="relative inline-block transition-opacity duration-75"
            style={{ 
                opacity: offsets.opacity,
                // Red Shadow + Cyan Shadow = Chromatic Aberration
                textShadow: enabled ? `
                    ${offsets.x1}px ${offsets.y1}px 0px rgba(255, 0, 80, 0.7), 
                    ${offsets.x2}px ${offsets.y2}px 0px rgba(0, 255, 255, 0.7)
                ` : 'none',
                filter: (enabled && Math.random() > 0.95) ? 'contrast(1.5) brightness(1.2)' : 'none'
            }}
        >
            {text}
        </span>
    );
};

// --- ORAGE-STYLE IMAGE TRAIL ---
// Removed as per user request

const NavNode: React.FC<{ label: string; num: string; onClick: () => void }> = ({ label, num, onClick }) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <button 
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="group flex items-center gap-4 p-4 transition-all"
        >
            <span className="text-[9px] font-mono font-medium text-primary/30 group-hover:text-primary transition-colors tracking-[0.2em]">
                {num}
            </span>
            {/* Unified typeface for menu links with thin weight and expanded tracking */}
            <span className="text-[11px] font-sans font-light uppercase tracking-[0.5em] text-base-content/40 group-hover:text-base-content transition-all duration-500">
                <ChromaticText text={label} enabled={isHovered} />
            </span>
        </button>
    );
};

const MetadataCorner: React.FC<{ label: string; value: string; position: string }> = ({ label, value, position }) => (
    <div className={`absolute ${position} p-6 flex flex-col gap-1 pointer-events-none z-20`}>
        <span className="text-[8px] font-black uppercase tracking-[0.4em] text-primary/40">{label}</span>
        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-base-content/20">{value}</span>
    </div>
);

interface DashboardProps {
    onNavigate: (tab: ActiveTab) => void;
    onClipIdea: (idea: Idea) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [gallery, setGallery] = useState<GalleryItem[]>([]);
    const [time, setTime] = useState(new Date().toLocaleTimeString());

    const headerTextRef = useRef<HTMLParagraphElement>(null);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const taglineRef = useRef<HTMLParagraphElement>(null);
    const isExitingRef = useRef(false);

    useEffect(() => {
        const fetch = async () => {
            try {
                const items = await loadGalleryItems();
                setGallery(items.filter(i => !i.isNsfw));
            } catch (e) { console.error(e); } finally { setIsLoading(false); }
        };
        fetch();
        const timer = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
        return () => clearInterval(timer);
    }, []);

    const handleNodeClick = useCallback((tab: ActiveTab) => {
        if (isExitingRef.current) return;
        isExitingRef.current = true;

        const tl = gsap.timeline({
            onComplete: () => onNavigate(tab)
        });

        tl.to(headerTextRef.current, {
            yPercent: 100,
            duration: 0.6,
            ease: "power4.in"
        });

        tl.to(titleRef.current, {
            yPercent: 100,
            duration: 0.7,
            ease: "power4.in"
        }, "-=0.45");

        tl.to(taglineRef.current, {
            yPercent: 100,
            duration: 0.6,
            ease: "power4.in"
        }, "-=0.55");

    }, [onNavigate]);

    if (isLoading) return <div className="h-full w-full flex items-center justify-center bg-transparent"><LoadingSpinner /></div>;

    return (
        <div className="h-full w-full bg-transparent overflow-hidden relative select-none border-none p-0">
            
            <MetadataCorner label="System_Status" value="Core_Engine_Active" position="top-0 left-0" />
            <MetadataCorner label="Vault_Index" value={`${gallery.length} Arifacts_Identified`} position="top-0 right-0" />
            <MetadataCorner label="Local_Sequence" value={time} position="bottom-0 left-0" />
            <MetadataCorner label="Protocol" value="Kollektiv_Engine_v2" position="bottom-0 right-0" />

            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none text-center">
                <div className="overflow-hidden py-1 mb-2">
                    <p ref={headerTextRef} className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.5em] text-primary/60">
                        MINDTURBULENCE'S
                    </p>
                </div>
                <div className="overflow-hidden mb-4 py-2">
                    {/* Unified branding typeface (inheriting font-black overrides from index.css) */}
                    <h1 ref={titleRef} className="text-6xl md:text-8xl font-black tracking-tighter uppercase text-base-content flex items-center">
                        <ChromaticText text="Kollektiv" />
                        <span className="text-primary italic animate-pulse">.</span>
                    </h1>
                </div>
                <div className="overflow-hidden py-1">
                    <p ref={taglineRef} className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.5em] text-base-content/40 max-w-2xl leading-loose">
                         Creativity, organized… unlike your desktop
                    </p>
                </div>

                <div className="w-12 h-px bg-base-content/10 mt-10"></div>
            </div>

            <div className="absolute inset-x-0 bottom-32 flex flex-wrap justify-center gap-6 md:gap-12 z-20">
                <NavNode num="01" label="Builder" onClick={() => handleNodeClick('prompts')} />
                <NavNode num="02" label="Library" onClick={() => handleNodeClick('prompt')} />
                <NavNode num="03" label="Gallery" onClick={() => handleNodeClick('gallery')} />
                <NavNode num="04" label="Guides" onClick={() => handleNodeClick('cheatsheet')} />
                <NavNode num="05" label="Utilities" onClick={() => handleNodeClick('composer')} />
            </div>

            {/* DECORATIVE ELEMENTS */}
            <div className="absolute left-1/2 top-10 -translate-x-1/2 h-20 w-px bg-gradient-to-b from-primary/40 to-transparent opacity-20 origin-top"></div>
            <div className="absolute left-1/2 bottom-10 -translate-x-1/2 h-20 w-px bg-gradient-to-t from-primary/40 to-transparent opacity-20 origin-bottom"></div>
        </div>
    );
}

export default Dashboard;