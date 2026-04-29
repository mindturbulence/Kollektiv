import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { pageVariants } from './AnimatedPanels';
import { loadGalleryItems } from '../utils/galleryStorage';
import type { GalleryItem, ActiveTab, Idea } from '../types';
import { useSettings } from '../contexts/SettingsContext';
import LoadingSpinner from './LoadingSpinner';
import DashboardGallery from './DashboardGallery';
import ChromaticText from './ChromaticText';

// --- ORAGE-STYLE IMAGE TRAIL ---
// Removed as per user request

interface DashboardProps {
    onNavigate?: (tab: ActiveTab) => void;
    onClipIdea?: (idea: Idea) => void;
    isExiting?: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({ isExiting = false }) => {
    const { settings } = useSettings();
    const isPipboyTheme = settings.darkTheme === 'pipboy';
    const [isLoading, setIsLoading] = useState(true);
    const [gallery, setGallery] = useState<GalleryItem[]>([]);

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
    }, []);

    if (isLoading) return <div className="h-full w-full flex items-center justify-center bg-transparent"><LoadingSpinner /></div>;

    return (
        <motion.div
            variants={pageVariants}
            initial="hidden"
            animate={isExiting ? "exit" : "visible"}
            exit="exit"
            className="flex flex-col h-full bg-transparent w-full relative overflow-hidden select-none py-12"
        >
            <div className="flex flex-col h-full w-full overflow-hidden bg-transparent relative z-10">
                {/* Background Animated Gallery */}
                <DashboardGallery items={gallery} />

                <motion.div variants={pageVariants} className="absolute inset-0 flex flex-col items-center justify-center z-[30] pointer-events-none text-center">
                    <div className="overflow-hidden py-1 mb-2">
                        <p ref={headerTextRef} className="text-[12px] tracking-[1.5em] font-normal uppercase text-primary/60">
                            MINDTURBULENCE'S
                        </p>
                    </div>
                    <div className="overflow-hidden mb-4 py-2">
                        {/* Monofonto Logo implementation for center dashboard if Pipboy */}
                        <h1 ref={titleRef} className={`text-6xl md:text-8xl uppercase text-base-content flex items-center tracking-widest leading-none translate-y-[4px] ${isPipboyTheme ? 'font-monofonto' : 'font-monoton'}`}>
                            <ChromaticText>Kollektiv</ChromaticText>
                            <span className="text-primary italic animate-pulse">.</span>
                        </h1>
                    </div>
                    <div className="overflow-hidden py-1">
                        <p ref={taglineRef} className="text-[12px] font-normal uppercase text-base-content/40 max-w-2xl leading-relaxed tracking-[0.5em]">
                            Precision tools for Generative Media Creation
                        </p>
                    </div>

                    <div className="w-12 h-px bg-base-content/10 mt-10"></div>
                </motion.div>

                {/* DECORATIVE ELEMENTS */}
            </div>
        </motion.div>
    );
};

export default Dashboard;