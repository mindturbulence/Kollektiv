import React, { useState, useEffect, useRef } from 'react';
import { loadGalleryItems } from '../utils/galleryStorage';
import { useSettings } from '../contexts/SettingsContext';
import { fileSystemManager } from '../utils/fileUtils';
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

const LedStatus: React.FC<{
    label: string,
    active: boolean,
    color?: string
}> = ({ label, active, color = 'bg-success' }) => (
    <div className={`flex items-center gap-1.5 transition-all duration-700 ${active ? 'opacity-100' : 'opacity-10'}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${active ? `${color} shadow-[0_0_5px_rgba(var(--p),0.5)] animate-pulse` : 'bg-transparent'}`}></span>
        <span className="text-[8px] font-sans font-black text-base-content tracking-tighter uppercase whitespace-nowrap">{label}</span>
    </div>
);

const Dashboard: React.FC<DashboardProps> = () => {
    const { settings } = useSettings();
    const [isLoading, setIsLoading] = useState(true);
    const [gallery, setGallery] = useState<GalleryItem[]>([]);
    const [time, setTime] = useState(new Date().toLocaleTimeString());

    const headerTextRef = useRef<HTMLParagraphElement>(null);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const taglineRef = useRef<HTMLParagraphElement>(null);

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

    if (isLoading) return <div className="h-full w-full flex items-center justify-center bg-transparent"><LoadingSpinner /></div>;

    return (
        <div className="h-full w-full bg-transparent overflow-hidden relative select-none border-none p-0">
            
            <MetadataCorner label="System_Status" value="Core_Engine_Active" position="top-0 left-0" />
            <MetadataCorner label="Vault_Index" value={`${gallery.length} Arifacts_Identified`} position="top-0 right-0" />
            
            <div className="absolute bottom-0 left-0 p-6 flex flex-col gap-3 pointer-events-none z-20">
                <span className="text-[8px] font-black uppercase tracking-[0.4em] text-primary/40">Integrations</span>
                <div className="flex flex-row gap-4">
                    <LedStatus label="VAULT" active={fileSystemManager.isDirectorySelected()} />
                    <LedStatus label={settings.activeLLM === 'ollama_cloud' ? 'OLLAMA' : settings.activeLLM.toUpperCase()} active={!!process.env.GEMINI_API_KEY || settings.activeLLM.includes('ollama')} />
                    <LedStatus label="YOUTUBE" active={!!settings.youtube?.isConnected} color="bg-error" />
                </div>
            </div>

            <MetadataCorner label="Local_Sequence" value={time} position="bottom-0 right-0" />

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
            </div>

            {/* DECORATIVE ELEMENTS */}
            <div className="absolute left-1/2 top-10 -translate-x-1/2 h-20 w-px bg-gradient-to-b from-primary/40 to-transparent opacity-20 origin-top"></div>
            <div className="absolute left-1/2 bottom-10 -translate-x-1/2 h-20 w-px bg-gradient-to-t from-primary/40 to-transparent opacity-20 origin-bottom"></div>
        </div>
    );
}

export default Dashboard;