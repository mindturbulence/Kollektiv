import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { pageVariants } from './AnimatedPanels';
import { loadGalleryItems } from '../utils/galleryStorage';
import type { GalleryItem, ActiveTab, Idea } from '../types';
import { useSettings } from '../contexts/SettingsContext';
import LoadingSpinner from './LoadingSpinner';
import DashboardGallery from './DashboardGallery';
import ChromaticText from './ChromaticText';
import useLocalStorage from '../utils/useLocalStorage';
import QuickActionsWidget from './widgets/QuickActionsWidget';
import IntegrationHealthWidget from './widgets/IntegrationHealthWidget';
import VaultStatsWidget from './widgets/VaultStatsWidget';
import RecentActivityWidget from './widgets/RecentActivityWidget';

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
    const [clippedIdeas] = useLocalStorage<Idea[]>('clippedIdeas', []);

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

                {/* Content overlay — 3 columns */}
                <div className="absolute inset-0 z-20 flex">
                {/* Left column: Quick Actions + Integrations */}
                <div className="w-96 h-full p-6 flex flex-col">
                    <QuickActionsWidget />
                    <div className="mt-4 flex-1 flex flex-col overflow-hidden">
                        <IntegrationHealthWidget />
                    </div>
                </div>

                {/* Center column: Logo */}
                <div className="flex-1 flex flex-col items-center justify-center pointer-events-none">
                    <motion.div variants={pageVariants} className="flex flex-col items-center text-center">
                        <div className="overflow-hidden mb-4">
                            <p ref={headerTextRef} className="text-sm tracking-[1.5em] font-normal uppercase text-primary/40">
                                MINDTURBULENCE'S
                            </p>
                        </div>
                        <div className="overflow-hidden">
                            <h1 ref={titleRef} className={`dashboard-wordmark uppercase text-base-content flex items-center tracking-widest leading-none translate-y-[2px] ${isPipboyTheme ? 'font-monofonto' : 'font-monoton'}`}>
                                <ChromaticText>Kollektiv</ChromaticText>
                                <span className="text-primary italic animate-pulse">.</span>
                            </h1>
                        </div>
                        <div className="overflow-hidden py-2">
                            <p ref={taglineRef} className="text-xs font-normal uppercase text-base-content/30 max-w-2xl leading-relaxed tracking-[0.5em]">
                                Precision tools for Generative Media Creation
                            </p>
                        </div>
                    </motion.div>
                </div>

                {/* Right column: Vault Stats + Recent Activity */}
                <div className="w-96 h-full p-6 flex flex-col">
                    <VaultStatsWidget />
                    <div className="mt-4 flex-1 flex flex-col overflow-hidden">
                        <RecentActivityWidget ideas={clippedIdeas} />
                    </div>
                </div>
            </div>
            </div>
        </motion.div>
    );
};

export default Dashboard;
