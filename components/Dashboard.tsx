import React, { useState, useEffect } from 'react';
import { motion, type Variants } from 'motion/react';
import { pageVariants } from './AnimatedPanels';
import { loadGalleryItems } from '../utils/galleryStorage';
import { loadSavedPrompts } from '../utils/promptStorage';
import { fileSystemManager } from '../utils/fileUtils';
import { appEventBus } from '../utils/eventBus';
import { getRecentTabs } from '../utils/tabHistory';
import { setPendingOpen } from '../utils/pendingOpen';
import { latestByCreatedAt, resolveRecentTools, isAiProviderConfigured } from '../utils/homeResume';
import type { GalleryItem, SavedPrompt, ActiveTab, ActiveSettingsTab } from '../types';
import { useSettings } from '../contexts/SettingsContext';
import LoadingSpinner from './LoadingSpinner';
import DashboardGallery from './DashboardGallery';
import ChromaticText from './ChromaticText';
import EmptyState from './EmptyState';
import { ImageBrokenIcon, PlayIcon } from './icons';

interface DashboardProps {
    onNavigate: (tab: ActiveTab) => void;
    onOpenSettings: (tab: ActiveSettingsTab, subTab: string) => void;
    isExiting?: boolean;
}

const RECENT_MEDIA = 12;
const RECENT_PROMPTS = 8;
const RECENT_TOOLS = 6;

// Panels ride the page's stagger (pageVariants.staggerChildren) — the one load moment.
const panelVariants: Variants = {
    hidden: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.23, 1, 0.32, 1] } },
    exit: { opacity: 0, transition: { duration: 0.15 } },
};

const PANEL = 'relative corner-frame border border-base-content/10 bg-base-100/85 backdrop-blur-xl';
const PRESS = 'transition-transform duration-press ease-smooth-out active:scale-[0.98]';
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

const PanelHeading: React.FC<{ title: string; action?: { label: string; onClick: () => void } }> = ({ title, action }) => (
    <div className="flex items-center justify-between gap-3 mb-3 flex-shrink-0">
        <h2 className="text-2xs font-black uppercase tracking-[0.2em] text-primary/80">{title}</h2>
        {action && (
            <button type="button" onClick={action.onClick} className={`text-2xs font-black uppercase tracking-[0.2em] text-base-content/60 hover:text-primary transition-colors duration-fast ${FOCUS}`}>
                {action.label}
            </button>
        )}
    </div>
);

/** Resolves a vault path to an object URL; data/http/blob URLs pass through. */
const VaultThumb: React.FC<{ item: GalleryItem }> = ({ item }) => {
    const url = item.urls[0];
    const [src, setSrc] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!url) { setFailed(true); return; }
        if (/^(data:|https?:|blob:)/.test(url)) { setSrc(url); return; }
        let objectUrl: string | null = null;
        let active = true;
        fileSystemManager.getFileAsBlob(url)
            .then(blob => {
                if (!active) return;
                if (!blob) { setFailed(true); return; }
                objectUrl = URL.createObjectURL(blob);
                setSrc(objectUrl);
            })
            .catch(() => { if (active) setFailed(true); });
        return () => {
            active = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [url]);

    if (failed) {
        return <div className="w-full h-full flex items-center justify-center bg-base-200"><ImageBrokenIcon className="w-6 h-6 text-base-content/50" /></div>;
    }
    if (!src) return <div className="w-full h-full bg-base-200 animate-pulse" />;
    return item.type === 'video'
        ? <video src={src} muted playsInline preload="metadata" className="w-full h-full object-cover" onError={() => setFailed(true)} />
        : <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" onError={() => setFailed(true)} />;
};

const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onOpenSettings, isExiting = false }) => {
    const { settings } = useSettings();
    const isPipboyTheme = settings.darkTheme === 'pipboy';
    const [isLoading, setIsLoading] = useState(true);
    const [gallery, setGallery] = useState<GalleryItem[]>([]);
    const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
    const [tools] = useState(() => resolveRecentTools(getRecentTabs(RECENT_TOOLS * 2)).slice(0, RECENT_TOOLS));

    useEffect(() => {
        let active = true;
        void Promise.allSettled([loadGalleryItems(), loadSavedPrompts()]).then(([g, p]) => {
            if (!active) return;
            if (g.status === 'fulfilled') setGallery(g.value.filter(i => !i.isNsfw));
            else console.error(g.reason);
            if (p.status === 'fulfilled') setPrompts(latestByCreatedAt(p.value, RECENT_PROMPTS));
            else console.error(p.reason);
            setIsLoading(false);
        });
        return () => { active = false; };
    }, []);

    if (isLoading) return <div className="h-full w-full flex items-center justify-center bg-transparent"><LoadingSpinner /></div>;

    const recentMedia = latestByCreatedAt(gallery, RECENT_MEDIA);
    const vaultMissing = !fileSystemManager.isDirectorySelected();
    const aiMissing = !isAiProviderConfigured(settings);

    const openMedia = (item: GalleryItem) => {
        setPendingOpen('gallery', item.id);
        onNavigate('gallery');
    };
    const openPrompt = (prompt: SavedPrompt) => {
        setPendingOpen('prompt', prompt.id);
        onNavigate('prompt');
    };

    return (
        <motion.div
            variants={pageVariants}
            initial="hidden"
            animate={isExiting ? "exit" : "visible"}
            exit="exit"
            className="flex flex-col h-full bg-transparent w-full relative overflow-hidden select-none py-12"
        >
            <div className="flex flex-col h-full w-full overflow-hidden bg-transparent relative z-raised">
                {/* Background montage — the user's own images first, stock fill to 15. */}
                <DashboardGallery items={gallery} />

                <div className="absolute inset-0 z-raised overflow-y-auto">
                    <div className="max-w-6xl mx-auto min-h-full p-6 flex flex-col gap-4">
                        <motion.div variants={panelVariants} className="flex flex-wrap items-end justify-between gap-4">
                            <div className={`${PANEL} px-4 py-3`}>
                                <p className="text-2xs tracking-[0.6em] uppercase text-primary/80">Mindturbulence's</p>
                                <h1 className={`text-2xl uppercase text-base-content flex items-center tracking-widest leading-none mt-1 ${isPipboyTheme ? 'font-monofonto' : 'font-monoton'}`}>
                                    <ChromaticText>Kollektiv</ChromaticText>
                                    <span className="text-primary italic">.</span>
                                </h1>
                            </div>

                            {(vaultMissing || aiMissing) && (
                                <div role="status" className={`${PANEL} border-warning/50 px-4 py-3 flex flex-col gap-2 max-w-xl`}>
                                    {vaultMissing && (
                                        <div className="flex items-center justify-between gap-4">
                                            <p className="text-sm text-base-content/80">Vault folder isn't connected, so nothing you make can be saved.</p>
                                            <button type="button" onClick={() => onOpenSettings('app', 'general')} className={`form-btn form-btn-primary h-8 px-3 text-2xs font-black uppercase tracking-widest flex-shrink-0 ${PRESS} ${FOCUS}`}>Connect vault</button>
                                        </div>
                                    )}
                                    {aiMissing && (
                                        <div className="flex items-center justify-between gap-4">
                                            <p className="text-sm text-base-content/80">No AI provider is set up. Add a key or a local model to use the AI tools.</p>
                                            <button type="button" onClick={() => onOpenSettings('integrations', 'llm')} className={`form-btn form-btn-primary h-8 px-3 text-2xs font-black uppercase tracking-widest flex-shrink-0 ${PRESS} ${FOCUS}`}>Set up AI</button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </motion.div>

                        <div className="grid grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_22rem] gap-4">
                            <motion.section variants={panelVariants} className={`${PANEL} p-4`}>
                                <PanelHeading title="Recent media" action={recentMedia.length ? { label: 'Open gallery', onClick: () => onNavigate('gallery') } : undefined} />
                                {recentMedia.length === 0 ? (
                                    <EmptyState
                                        className="py-10"
                                        title="No media yet"
                                        body="Images and videos you save to the vault show up here."
                                        action={{ label: 'Import media', onClick: () => onNavigate('gallery') }}
                                    />
                                ) : (
                                    <ul className="grid grid-cols-4 lg:grid-cols-6 gap-2">
                                        {recentMedia.map(item => (
                                            <li key={item.id} className="group relative aspect-square overflow-hidden border border-base-content/10 bg-base-200">
                                                <button
                                                    type="button"
                                                    onClick={() => openMedia(item)}
                                                    aria-label={`Open ${item.title || 'untitled item'}`}
                                                    className={`block w-full h-full ${PRESS} ${FOCUS}`}
                                                >
                                                    <VaultThumb item={item} />
                                                </button>
                                                {item.type === 'video' && (
                                                    <span aria-hidden="true" className="absolute left-1 bottom-1 p-1 bg-base-100/85 text-base-content pointer-events-none">
                                                        <PlayIcon className="w-3 h-3 fill-current" />
                                                    </span>
                                                )}
                                                {item.type === 'image' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => appEventBus.emit('openInEditor', { galleryItemId: item.id, url: item.urls[0] })}
                                                        aria-label={`Edit ${item.title || 'image'} in the image editor`}
                                                        className={`absolute right-1 top-1 px-1.5 py-0.5 text-2xs font-black uppercase tracking-widest bg-base-100/90 text-primary border border-primary/30 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-fast hover:bg-primary hover:text-primary-content ${FOCUS}`}
                                                    >
                                                        Edit
                                                    </button>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </motion.section>

                            <motion.section variants={panelVariants} className={`${PANEL} p-4`}>
                                <PanelHeading title="Recent prompts" action={prompts.length ? { label: 'Library', onClick: () => onNavigate('prompt') } : undefined} />
                                {prompts.length === 0 ? (
                                    <EmptyState
                                        className="py-10"
                                        title="No saved prompts"
                                        body="Prompts you save to the library show up here."
                                        action={{ label: 'Write a prompt', onClick: () => onNavigate('crafter') }}
                                    />
                                ) : (
                                    <ul className="flex flex-col -mx-2">
                                        {prompts.map(p => (
                                            <li key={p.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => openPrompt(p)}
                                                    className={`w-full text-left px-2 py-2 border-l-2 border-transparent hover:border-primary hover:bg-base-content/5 transition-colors duration-fast ${FOCUS}`}
                                                >
                                                    <span className="block text-sm font-bold text-base-content truncate">{p.title || p.text.split('\n')[0] || 'Untitled prompt'}</span>
                                                    <span className="block text-xs text-base-content/60 truncate">{p.title ? p.text : new Date(p.createdAt).toLocaleDateString()}</span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </motion.section>
                        </div>

                        {tools.length > 0 && (
                            <motion.section variants={panelVariants} className={`${PANEL} p-4`}>
                                <PanelHeading title="Pick up where you left off" />
                                <ul className="grid grid-cols-3 lg:grid-cols-6 gap-2">
                                    {tools.map(t => (
                                        <li key={t.tab}>
                                            <button
                                                type="button"
                                                onClick={() => onNavigate(t.tab)}
                                                className={`w-full h-full text-left px-3 py-3 border border-base-content/10 bg-base-200/60 hover:border-primary/60 hover:bg-primary/10 transition-colors duration-fast ${FOCUS}`}
                                            >
                                                <span className="block text-2xs uppercase tracking-[0.2em] text-base-content/60">{t.group}</span>
                                                <span className="block text-lg font-black uppercase tracking-tight text-base-content truncate">{t.label}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </motion.section>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default Dashboard;
