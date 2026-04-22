import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { loadGalleryItems } from '../utils/galleryStorage';
import { useSettings } from '../contexts/SettingsContext';
import { fileSystemManager } from '../utils/fileUtils';
import type { GalleryItem, ActiveTab, Idea } from '../types';
import LoadingSpinner from './LoadingSpinner';
import DashboardGallery from './DashboardGallery';
import ChromaticText from './ChromaticText';

// --- ORAGE-STYLE IMAGE TRAIL ---
// Removed as per user request

const TerminalStatus: React.FC = () => {
    const [lines, setLines] = useState<string[]>([]);
    const allLines = useMemo(() => [
        "BOOT_SEQUENCE_INITIATED",
        "KERNEL_LOADED_V2.4.0",
        "VAULT_SYNC_COMPLETE",
        "NEURAL_NET_READY",
        "UPLINK_ESTABLISHED",
        "CORE_ENGINE_ACTIVE",
        "MONITORING_ARTIFACTS...",
        "SYSTEM_STABLE",
        "MEMORY_OPTIMIZED",
        "ENCRYPTION_ACTIVE"
    ], []);

    useEffect(() => {
        let currentLine = 0;
        const interval = setInterval(() => {
            setLines(prev => {
                const next = [...prev, allLines[currentLine]];
                if (next.length > 3) next.shift();
                return next;
            });
            currentLine = (currentLine + 1) % allLines.length;
        }, 3000);
        return () => clearInterval(interval);
    }, [allLines]);

    return (
        <div className="absolute top-0 left-0 p-6 flex flex-col items-start gap-1 pointer-events-none z-20">
            <span className="text-[8px] font-black uppercase tracking-[0.4em] text-primary/40">System_Status</span>
            <div className="flex flex-col gap-0.5">
                {lines.map((line, i) => (
                    <motion.span 
                        key={`${line}-${i}`}
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-[9px] font-mono font-bold uppercase tracking-widest text-base-content/20 text-left"
                    >
                        {`> ${line}`}
                    </motion.span>
                ))}
                <motion.span 
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ repeat: Infinity, duration: 0.8 }}
                    className="text-[9px] font-mono font-bold text-primary/40"
                >
                    _
                </motion.span>
            </div>
        </div>
    );
};

const MetadataCorner: React.FC<{ label: string; value: string; position: string }> = ({ label, value, position }) => (
    <div className={`absolute ${position} p-6 flex flex-col items-start gap-1 pointer-events-none z-20`}>
        <span className="text-[8px] font-black uppercase tracking-[0.4em] text-primary/40">{label}</span>
        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-base-content/20 text-left">{value}</span>
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
        <span className={`w-1.5 h-1.5 rounded-none ${active ? `${color} shadow-[0_0_5px_rgba(var(--p),0.5)] animate-pulse` : 'bg-transparent'}`}></span>
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
            {/* Background Animated Gallery */}
            <DashboardGallery items={gallery} />
            
            <TerminalStatus />
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

            <div className="absolute inset-0 flex flex-col items-center justify-center z-[30] pointer-events-none text-center">
                <div className="overflow-hidden py-1 mb-2">
                    <p ref={headerTextRef} className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.5em] text-primary/60">
                        MINDTURBULENCE'S
                    </p>
                </div>
                <div className="overflow-hidden mb-4 py-2">
                    {/* Monoton Logo implementation for center dashboard */}
                    <h1 ref={titleRef} className="text-6xl md:text-8xl uppercase text-base-content flex items-center font-monoton tracking-widest">
                        <ChromaticText>Kollektiv</ChromaticText>
                        <span className="text-primary italic animate-pulse">.</span>
                    </h1>
                </div>
                <div className="overflow-hidden py-1">
                    <p ref={taglineRef} className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.5em] text-base-content/40 max-w-2xl leading-loose">
                         Precision tools for creative minds.
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