import React, { useState, useEffect } from 'react';
import { motion, type Variants } from 'motion/react';
import { pageVariants } from './AnimatedPanels';
import { loadGalleryItems } from '../utils/galleryStorage';
import { loadSavedPrompts } from '../utils/promptStorage';
import { fileSystemManager } from '../utils/fileUtils';
import { isAiProviderConfigured } from '../utils/homeResume';
import type { ActiveTab, ActiveSettingsTab } from '../types';
import { useSettings } from '../contexts/SettingsContext';

interface DashboardProps {
    onNavigate: (tab: ActiveTab) => void;
    onOpenSettings: (tab: ActiveSettingsTab, subTab: string) => void;
    isExiting?: boolean;
}

// Hero blocks ride the page's stagger (pageVariants.staggerChildren) — the one load moment.
const riseVariants: Variants = {
    hidden: { opacity: 0, y: 14 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } },
    exit: { opacity: 0, transition: { duration: 0.15 } },
};

// Fonts come from the active theme's hooks, same as the header: labels use the
// nav font (.font-rajdhani + .theme-label, overridden per theme in index.css),
// the headline uses the theme's display font (.font-monoton).
const CAP_BASE = 'theme-label text-[11px] leading-snug uppercase tracking-[0.08em]';
const FOCUS = 'focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-primary';

const Dashboard: React.FC<DashboardProps> = ({ onOpenSettings, isExiting = false }) => {
    const { settings } = useSettings();
    const isPipboyTheme = settings.darkTheme === 'pipboy';
    const CAP = `${CAP_BASE} ${isPipboyTheme ? 'font-fixedsys' : 'font-rajdhani'}`;
    const [counts, setCounts] = useState<{ media: number; prompts: number } | null>(null);

    useEffect(() => {
        let active = true;
        void Promise.allSettled([loadGalleryItems(), loadSavedPrompts()]).then(([g, p]) => {
            if (!active) return;
            if (g.status === 'rejected') console.error(g.reason);
            if (p.status === 'rejected') console.error(p.reason);
            setCounts({
                media: g.status === 'fulfilled' ? g.value.length : 0,
                prompts: p.status === 'fulfilled' ? p.value.length : 0,
            });
        });
        return () => { active = false; };
    }, []);

    const vaultMissing = !fileSystemManager.isDirectorySelected();
    const aiMissing = !isAiProviderConfigured(settings);
    const fmt = (n: number | undefined) => n === undefined ? '—' : n.toLocaleString();

    return (
        <motion.div
            variants={pageVariants}
            initial="hidden"
            animate={isExiting ? "exit" : "visible"}
            exit="exit"
            className="relative h-full w-full overflow-y-auto select-none bg-transparent"
        >
            <div className="min-h-full flex flex-col justify-between gap-16 px-0 md:px-7 pt-10 md:pt-14 pb-4">
                <motion.p variants={riseVariants} className={`${CAP} text-base-content/50`}>
                    Mindturbulence's<br />creative studio.
                </motion.p>

                <motion.h1 variants={riseVariants} className={`font-normal text-[clamp(44px,7vw,116px)] leading-[0.95] tracking-[-0.02em] text-base-content ${isPipboyTheme ? 'font-monofonto' : 'font-monoton'}`}>
                    Make images<br />worth keeping<span className="text-primary">.</span>
                </motion.h1>

                <motion.div variants={riseVariants} className="flex flex-wrap items-end justify-between gap-10">
                    <div role="status" className="flex flex-col gap-2.5">
                        {vaultMissing ? (
                            <button type="button" onClick={() => onOpenSettings('app', 'general')} className={`${CAP} text-left text-primary hover:text-base-content transition-colors duration-300 ${FOCUS}`}>
                                Vault not connected, nothing can be saved →
                            </button>
                        ) : (
                            <span className={`${CAP} text-base-content`}><span className="text-success">●</span> Vault connected</span>
                        )}
                        {aiMissing && (
                            <button type="button" onClick={() => onOpenSettings('integrations', 'llm')} className={`${CAP} text-left text-primary hover:text-base-content transition-colors duration-300 ${FOCUS}`}>
                                No AI provider set up →
                            </button>
                        )}
                    </div>

                    <div>
                        <div className="grid grid-cols-2 w-max border border-base-content/20 mb-6">
                            <div className="px-6 py-4 flex flex-col gap-1.5">
                                <span className="text-[22px] leading-none tracking-[-0.04em] text-base-content">{fmt(counts?.media)}</span>
                                <span className={`${CAP} text-base-content/50`}>Media</span>
                            </div>
                            <div className="px-6 py-4 flex flex-col gap-1.5 border-l border-base-content/20">
                                <span className="text-[22px] leading-none tracking-[-0.04em] text-base-content">{fmt(counts?.prompts)}</span>
                                <span className={`${CAP} text-base-content/50`}>Prompts</span>
                            </div>
                        </div>
                        <p className="m-0 max-w-[30ch] text-lg leading-snug tracking-[-0.01em] text-base-content">
                            Prompts, media and models in one local studio. Nothing leaves the vault unless you send it.
                        </p>
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
};

export default Dashboard;
