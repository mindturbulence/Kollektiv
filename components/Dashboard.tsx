
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { gsap } from 'gsap';
import { loadGalleryItems } from '../utils/galleryStorage';
import type { GalleryItem, ActiveTab, Idea } from '../types';
import { fileSystemManager } from '../utils/fileUtils';
import LoadingSpinner from './LoadingSpinner';
import { useSettings } from '../contexts/SettingsContext';

interface DashboardProps {
    onNavigate: (tab: ActiveTab) => void;
    onClipIdea: (idea: Idea) => void;
}

// --- NEURAL EXPOSURE TRAIL ---
const NeuralTrail: React.FC<{ images: GalleryItem[] }> = ({ images }) => {
    const trailRef = useRef<HTMLDivElement>(null);
    const lastPos = useRef({ x: 0, y: 0 });
    const imageIndex = useRef(0);

    const spawnArtifact = useCallback(async (x: number, y: number) => {
        if (!trailRef.current || images.length === 0) return;

        const item = images[imageIndex.current];
        const blob = await fileSystemManager.getFileAsBlob(item.urls[0]);
        if (!blob) return;

        const url = URL.createObjectURL(blob);
        const img = document.createElement('img');
        
        img.className = "absolute pointer-events-none z-10 border border-white/20 shadow-[0_25px_60px_rgba(0,0,0,0.6)] opacity-0 will-change-transform";
        
        img.onload = () => {
            if (!trailRef.current) return;

            const aspect = img.naturalWidth / img.naturalHeight;
            const baseSize = 160 + Math.random() * 100;
            
            if (aspect > 1) {
                img.style.width = `${baseSize}px`;
                img.style.height = `${baseSize / aspect}px`;
            } else {
                img.style.height = `${baseSize}px`;
                img.style.width = `${baseSize * aspect}px`;
            }

            img.style.left = `${x}px`;
            img.style.top = `${y}px`;
            img.style.transform = `translate(-50%, -50%) scale(0.1) rotate(${(Math.random() - 0.5) * 15}deg)`;
            
            trailRef.current.appendChild(img);

            const tl = gsap.timeline({
                onComplete: () => {
                    img.remove();
                    URL.revokeObjectURL(url);
                }
            });

            tl.to(img, {
                opacity: 1,
                scale: 1,
                duration: 0.6,
                ease: "expo.out"
            });

            tl.to(img, {
                opacity: 0,
                scale: 0.4,
                duration: 0.5,
                ease: "power4.in"
            }, "+=0.3");
        };

        img.src = url;
        imageIndex.current = (imageIndex.current + 1) % images.length;
    }, [images]);

    useEffect(() => {
        const handleMove = (e: MouseEvent) => {
            const dist = Math.hypot(e.clientX - lastPos.current.x, e.clientY - lastPos.current.y);
            if (dist > 180) { 
                spawnArtifact(e.clientX, e.clientY);
                lastPos.current = { x: e.clientX, y: e.clientY };
            }
        };
        window.addEventListener('mousemove', handleMove);
        return () => window.removeEventListener('mousemove', handleMove);
    }, [spawnArtifact]);

    return <div ref={trailRef} className="fixed inset-0 pointer-events-none overflow-hidden z-[5]" />;
};

const NavNode: React.FC<{ label: string; num: string; onClick: () => void }> = ({ label, num, onClick }) => (
    <button 
        onClick={onClick}
        className="group flex items-center gap-6 p-4 transition-all hover:bg-primary/5"
    >
        <span className="text-[10px] font-mono font-black text-primary/40 group-hover:text-primary transition-colors tracking-widest">
            [ {num} ]
        </span>
        <span className="text-xs font-black uppercase tracking-[0.4em] text-base-content/40 group-hover:text-base-content group-hover:tracking-[0.6em] transition-all duration-500">
            {label}
        </span>
    </button>
);

const MetadataCorner: React.FC<{ label: string; value: string; position: string }> = ({ label, value, position }) => (
    <div className={`absolute ${position} p-10 flex flex-col gap-1 pointer-events-none z-20`}>
        <span className="text-[8px] font-black uppercase tracking-[0.4em] text-primary/40">{label}</span>
        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-base-content/20">{value}</span>
    </div>
);

const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
    const { settings } = useSettings();
    const [isLoading, setIsLoading] = useState(true);
    const [gallery, setGallery] = useState<GalleryItem[]>([]);
    const [time, setTime] = useState(new Date().toLocaleTimeString());
    const [videoError, setVideoError] = useState(false);

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

        // SLIDE DOWN EXIT - MASKED STAGGER
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

    if (isLoading) return <div className="h-full w-full flex items-center justify-center bg-base-100"><LoadingSpinner /></div>;

    return (
        <div className="h-full w-full bg-base-100 overflow-hidden relative select-none">
            {/* AMBIENT BACKGROUND LAYER */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                {!videoError && settings.dashboardVideoUrl ? (
                    <video 
                        key={settings.dashboardVideoUrl}
                        src={settings.dashboardVideoUrl}
                        autoPlay 
                        muted 
                        loop 
                        playsInline 
                        crossOrigin="anonymous"
                        className="w-full h-full object-cover grayscale brightness-[0.6] contrast-125 opacity-30 transition-opacity duration-1000"
                        style={{ filter: 'grayscale(1) brightness(0.6) contrast(1.1)' }}
                        onError={() => setVideoError(true)}
                    />
                ) : (
                    <div className="w-full h-full bg-base-300 opacity-20"></div>
                )}
                <div className="absolute inset-0 bg-grid-texture opacity-[0.03] z-10"></div>
                <div className="absolute inset-0 bg-gradient-to-t from-base-100 via-transparent to-base-100 opacity-60 z-10"></div>
            </div>
            
            {/* Image Exposure Layer */}
            <NeuralTrail images={gallery} />

            {/* UI CHASSIS - Metadata Corners */}
            <MetadataCorner label="System_Status" value="Core_Engine_Active" position="top-0 left-0" />
            <MetadataCorner label="Vault_Index" value={`${gallery.length} Arifacts_Identified`} position="top-0 right-0" />
            <MetadataCorner label="Local_Sequence" value={time} position="bottom-0 left-0" />
            <MetadataCorner label="Protocol" value="Kollektive_Engine_v2" position="bottom-0 right-0" />

            {/* CENTRAL BRANDING WITH MASKED TEXT REVEAL */}
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none px-6 text-center">
                <div className="overflow-hidden py-1 mb-2">
                    <p ref={headerTextRef} className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.5em] text-primary/60">
                        MINDTURBULENCE'S
                    </p>
                </div>
                <div className="overflow-hidden mb-4 py-2">
                    <h1 ref={titleRef} className="text-6xl md:text-8xl font-black tracking-tighter uppercase text-base-content flex items-center">
                        Kollektiv<span className="text-primary italic animate-pulse">.</span>
                    </h1>
                </div>
                <div className="overflow-hidden py-1">
                    <p ref={taglineRef} className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.5em] text-base-content/40 max-w-2xl leading-loose">
                         Your creative intern, except never asks for coffee breaks
                    </p>
                </div>

                <div className="w-12 h-px bg-base-content/10 mt-10"></div>
            </div>

            {/* NAVIGATION NODES - Positioned as an Interface */}
            <div className="absolute inset-x-0 bottom-32 flex flex-wrap justify-center gap-8 md:gap-16 z-20">
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
