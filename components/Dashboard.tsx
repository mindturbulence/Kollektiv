import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { pageBodyVariants } from './AnimatedPanels';
import { loadGalleryItems } from '../utils/galleryStorage';
import type { GalleryItem, ActiveTab, Idea } from '../types';
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

const Dashboard: React.FC<DashboardProps> = () => {
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
            variants={pageBodyVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="h-full w-full bg-transparent overflow-hidden relative select-none border-none p-0"
        >
            {/* Background Animated Gallery */}
            <DashboardGallery items={gallery} />
            
            <motion.div variants={pageBodyVariants} className="absolute inset-0 flex flex-col items-center justify-center z-[30] pointer-events-none text-center">
                <div className="overflow-hidden py-1 mb-2">
                    <p ref={headerTextRef} className="text-[12px] font-normal uppercase text-primary/60">
                        MINDTURBULENCE'S
                    </p>
                </div>
                <div className="overflow-hidden mb-4 py-2">
                    {/* Monoton Logo implementation for center dashboard */}
                    <h1 ref={titleRef} className="text-6xl md:text-8xl uppercase text-base-content flex items-center font-monoton tracking-widest leading-none translate-y-[4px]">
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

            <div className="absolute inset-x-0 bottom-32 flex flex-wrap justify-center gap-6 md:gap-12 z-20">
            </div>

            {/* DECORATIVE ELEMENTS */}
        </motion.div>
    );
};

export default Dashboard;