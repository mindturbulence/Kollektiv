import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import { useSettings } from '../contexts/SettingsContext';
import useLocalStorage from '../utils/useLocalStorage';
import { fileSystemManager } from '../utils/fileUtils';
import { verifyAndRepairFiles } from '../utils/integrity';
import { addSavedPrompt } from '../utils/promptStorage';
import type { ActiveTab, Idea, ActiveSettingsTab } from '../types';

// Layout & Global Components
import Sidebar from './Sidebar';
import Header from './Header';
import Welcome from './Welcome';
import AboutModal from './AboutModal';
import ClippingPanel from './ClippingPanel';
import FeedbackModal from './FeedbackModal';
import Footer from './Footer';

// Page Components
import Dashboard from './Dashboard';
import PromptsPage from './PromptsPage';
import SavedPrompts from './SavedPrompts';
import ImageGallery from './ImageGallery';
import Cheatsheet from './Cheatsheet';
import ArtstyleCheatsheet from './ArtstyleCheatsheet';
import ArtistCheatsheet from './ArtistCheatsheet';
import { SetupPage } from './SetupPage';
import ImageCompare from './ImageCompare';
import { ColorPaletteExtractor } from './ColorPaletteExtractor';
import ComposerPage from './ComposerPage';
import ImageResizer from './ImageResizer';
import { VideoToFrames } from './VideoToFrames';
import { useAuth } from '../contexts/AuthContext';

type PromptsPageState = { prompt?: string, artStyle?: string, artist?: string, view?: 'enhancer' | 'composer' | 'create', id?: string } | null;

/**
 * Character Shuffle Hook for technical portfolio aesthetic.
 */
const useCharacterShuffle = (text: string, active: boolean) => {
    const [display, setDisplay] = useState('');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';
    
    useEffect(() => {
        if (!active) return;
        let iteration = 0;
        const interval = setInterval(() => {
            setDisplay(text.split('').map((char, index) => {
                if (index < iteration) return text[index];
                return chars[Math.floor(Math.random() * chars.length)];
            }).join(''));
            
            if (iteration >= text.length) clearInterval(interval);
            iteration += 1 / 3;
        }, 30);
        return () => clearInterval(interval);
    }, [text, active]);
    
    return display;
};

/**
 * Technical Portfolio Initializer.
 */
const InitialLoader: React.FC<{ status: string; progress: number | null }> = ({ status, progress }) => {
    const displayStatus = useCharacterShuffle(status, true);
    const percentage = Math.round((progress || 0) * 100);
    const displayPercent = String(percentage).padStart(3, '0');

    return (
        <div id="initial-loader" className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-base-100 text-white overflow-hidden select-none">
            <div className="absolute inset-0 bg-grid-texture opacity-[0.05] pointer-events-none"></div>
            
            <div className="relative z-10 flex flex-col items-center text-center">
                <div className="mb-16 flex flex-col items-center">
                    <span className="text-[120px] md:text-[200px] font-black tracking-tighter leading-none font-mono tabular-nums text-primary/90">
                        {displayPercent}<span className="text-white/5">%</span>
                    </span>
                    <div className="w-80 h-px bg-white/5 relative overflow-hidden mt-6">
                         <div 
                            className="absolute inset-y-0 left-0 bg-primary transition-all duration-700 ease-out shadow-[0_0_10px_oklch(var(--p))]" 
                            style={{ width: `${percentage}%` }}
                         />
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-center gap-6 mb-4">
                        <div className="w-1.5 h-1.5 bg-primary animate-ping"></div>
                        <p className="text-[11px] font-black uppercase tracking-[0.8em] text-white/50">
                            {displayStatus}
                        </p>
                    </div>
                </div>
            </div>

            <div className="absolute bottom-16 left-16 hidden md:flex flex-col gap-2">
                <span className="text-[9px] font-black uppercase tracking-[0.4em] text-white/10">Kernel Access</span>
                <span className="text-[11px] font-mono font-bold text-white/20">VAULT_STABILITY_OK</span>
            </div>
        </div>
    );
};

const App: React.FC = () => {
    const [isInitialized, setIsInitialized] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [showWelcome, setShowWelcome] = useState(false);
    const [initStatus, setInitStatus] = useState('Initializing Registry');
    const [initProgress, setInitProgress] = useState<number | null>(0);
    const isFirstLoad = useRef(true);

    const { settings } = useSettings();
    const auth = useAuth();

    const [activeTab, setActiveTab] = useLocalStorage<ActiveTab>('activeTab', 'dashboard');
    const [isPinned, setIsPinned] = useLocalStorage('sidebarPinned', true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(isPinned);
    const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
    const [isClippingPanelOpen, setIsClippingPanelOpen] = useState(false);
    const [collapsedPanels, setCollapsedPanels] = useLocalStorage<Record<string, boolean>>('collapsedPanels', {});
    const [globalFeedback, setGlobalFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const [promptsPageState, setPromptsPageState] = useState<PromptsPageState>(null);
    const [activeSettingsTab, setActiveSettingsTab] = useLocalStorage<ActiveSettingsTab>('activeSettingsTab', 'app');
    const [activeSettingsSubTab, setActiveSettingsSubTabSetter] = useLocalStorage<string>('activeSettingsSubTab', 'general');

    const [clippedIdeas, setClippedIdeas] = useLocalStorage<Idea[]>('clippedIdeas', []);

    // --- Transition Refs ---
    const pageContentRef = useRef<HTMLDivElement>(null);
    
    // Phase 2: Navigation shutters (Constrained to <main>)
    const navShutterTopRef = useRef<HTMLDivElement>(null);
    const navShutterBottomRef = useRef<HTMLDivElement>(null);
    
    // Phase 1: Global shutters (Full screen)
    const globalShutterTopRef = useRef<HTMLDivElement>(null);
    const globalShutterBottomRef = useRef<HTMLDivElement>(null);
    
    const activeTimeline = useRef<gsap.core.Timeline | null>(null);

    const initializeApp = useCallback(async () => {
        setIsLoading(true);
        setShowWelcome(false);
        setInitStatus('Negotiating Link');
        setInitProgress(0.1);

        const onProgress = (message: string, progress?: number) => {
             setInitStatus(message.toUpperCase());
             if (progress !== undefined) setInitProgress(progress);
        };
        
        try {
            await new Promise(r => setTimeout(r, 400)); 
            const hasHandleAndPermission = await fileSystemManager.initialize(settings, auth);
            
            if (!hasHandleAndPermission) {
                setShowWelcome(true);
                setIsLoading(false);
                return;
            }

            onProgress('Verifying Folders...', 0.35);
            await verifyAndRepairFiles(onProgress, settings);
            
            onProgress('Stabilizing Neural Node...', 0.8);
            await new Promise(resolve => setTimeout(resolve, 500));

            onProgress('Registry Healthy', 1.0);
            await new Promise(r => setTimeout(r, 300));

            setIsInitialized(true);
            setIsLoading(false);
        } catch (err) {
            console.error("Initialization Critical Failure:", err);
            setGlobalFeedback({ message: "System failed to initialize.", type: 'error' });
            setIsLoading(false);
        }
    }, [settings, auth]);

    useEffect(() => {
        initializeApp();
    }, [initializeApp]);

    /**
     * Specialized Shutter Engine.
     * Manages global reveal (init) and local reveal (navigation).
     */
    useLayoutEffect(() => {
        if (!isInitialized || !pageContentRef.current) return;

        if (activeTimeline.current) {
            activeTimeline.current.kill();
        }

        const ctx = gsap.context(() => {
            const isFirst = isFirstLoad.current;
            
            // Choose correct shutters based on phase
            const topShutter = isFirst ? globalShutterTopRef.current : navShutterTopRef.current;
            const bottomShutter = isFirst ? globalShutterBottomRef.current : navShutterBottomRef.current;
            
            // Safety: Ensure all other shutters are hidden
            const unusedShutters = isFirst 
                ? [navShutterTopRef.current, navShutterBottomRef.current] 
                : [globalShutterTopRef.current, globalShutterBottomRef.current];
            gsap.set(unusedShutters, { autoAlpha: 0, pointerEvents: 'none' });

            const tl = gsap.timeline({
                defaults: { ease: "expo.inOut", duration: 1.0 }, // Snappier 1s duration
                onComplete: () => {
                    isFirstLoad.current = false;
                    // Reset visibility and disable interactions with shutters
                    gsap.set([globalShutterTopRef.current, globalShutterBottomRef.current, navShutterTopRef.current, navShutterBottomRef.current], { 
                        autoAlpha: 0,
                        pointerEvents: 'none'
                    });
                    // Final state ensure for content - prevents blank page bug
                    gsap.set(pageContentRef.current, { autoAlpha: 1, filter: 'none', scale: 1 });
                    activeTimeline.current = null;
                }
            });

            activeTimeline.current = tl;

            // 1. Initial State Setup (Reset to closed state)
            gsap.set([topShutter, bottomShutter], { 
                yPercent: 0, 
                autoAlpha: 1, 
                pointerEvents: 'auto' 
            });
            
            gsap.set(pageContentRef.current, { 
                autoAlpha: 0, 
                scale: isFirst ? 1.02 : 0.98,
                filter: 'blur(10px)'
            });

            // 2. The Reveal (Snap movement)
            tl.to(topShutter, { yPercent: -100 }, 0);
            tl.to(bottomShutter, { yPercent: 100 }, 0);

            // 3. Content Focus (Simultaneous with shutters)
            tl.to(pageContentRef.current, { 
                autoAlpha: 1, 
                scale: 1, 
                filter: 'blur(0px)',
                duration: 0.8
            }, 0.1);

            // 4. Staggered Interior Entrance
            const revealElements = pageContentRef.current.querySelectorAll('h1, h2, section, .reveal-on-scroll');
            if (revealElements.length > 0) {
                tl.from(revealElements, {
                    y: 20,
                    autoAlpha: 0,
                    stagger: 0.05,
                    duration: 0.7,
                    ease: "power3.out",
                    clearProps: "all"
                }, 0.3);
            }
        });

        return () => ctx.revert();
    }, [isInitialized, activeTab]);
    
    useEffect(() => {
        const isLg = window.innerWidth >= 1024;
        if (isPinned && isLg) setIsSidebarOpen(true);
        else if (!isLg) setIsSidebarOpen(false); 
    }, [isPinned]);

    useEffect(() => {
        const currentTheme = settings.activeThemeMode === 'light' ? settings.lightTheme : settings.darkTheme;
        document.documentElement.setAttribute('data-theme', currentTheme);
        document.documentElement.style.fontSize = `${settings.fontSize}px`;
    }, [settings.activeThemeMode, settings.lightTheme, settings.darkTheme, settings.fontSize]);

    const { features } = settings;
    useEffect(() => {
        let isTabAllowed = true;
        switch (activeTab) {
            case 'prompt': isTabAllowed = features.isPromptLibraryEnabled; break;
            case 'gallery': isTabAllowed = features.isGalleryEnabled; break;
            case 'cheatsheet':
            case 'artstyles':
            case 'artists': isTabAllowed = features.isCheatsheetsEnabled; break;
            case 'composer':
            case 'image_compare':
            case 'color_palette_extractor':
            case 'resizer':
            case 'video_to_frames': isTabAllowed = features.isToolsEnabled; break;
        }
        if (!isTabAllowed) setActiveTab('dashboard');
    }, [activeTab, features, setActiveTab]);

    const handleMenuClick = () => {
        const isLg = window.innerWidth >= 1024;
        if (isLg && isPinned) setIsPinned(false);
        setIsSidebarOpen(p => !p);
    };

    const handleNavigate = (tab: ActiveTab) => {
        if (tab === activeTab) return;
        setActiveTab(tab);
        const isLg = window.innerWidth >= 1024;
        if (!isPinned && !isLg) setIsSidebarOpen(false);
    };
    
    const showGlobalFeedback = useCallback((message: string, isError = false) => {
        setGlobalFeedback({ message, type: isError ? 'error' : 'success' });
    }, []);

    const handleSendToPromptsPage = useCallback((state: PromptsPageState) => {
        setPromptsPageState(state);
        handleNavigate('prompts');
        showGlobalFeedback('Sent to Prompt Builder!');
    }, [showGlobalFeedback, handleNavigate]);

    const handleClipIdea = useCallback((idea: Idea) => {
        setClippedIdeas(prev => [idea, ...prev]);
        showGlobalFeedback(`Clipped "${idea.title}"`);
    }, [setClippedIdeas, showGlobalFeedback]);

    const handleRemoveIdea = (id: string) => setClippedIdeas(prev => prev.filter(idea => idea.id !== id));
    const handleClearAllIdeas = () => setClippedIdeas([]);
    const handleInsertIdea = (prompt: string) => {
        handleSendToPromptsPage({ prompt, view: 'composer', id: `clip-${Date.now()}` });
        setIsClippingPanelOpen(false);
    };
    const handleRefineIdea = (prompt: string) => {
        handleSendToPromptsPage({ prompt, view: 'enhancer' });
        setIsClippingPanelOpen(false);
    };

    const handleSaveClippedIdea = async (idea: Idea) => {
        try {
            await addSavedPrompt({
                text: idea.prompt,
                title: idea.title,
                tags: [idea.lens]
            });
            showGlobalFeedback(`"${idea.title}" archived.`);
        } catch (e) {
            showGlobalFeedback("Failed to archive.", true);
        }
    };

    const renderContent = () => {
        const categoryPanelProps = {
            isCategoryPanelCollapsed: !!collapsedPanels[activeTab],
            onToggleCategoryPanel: () => setCollapsedPanels(p => ({ ...p, [activeTab]: !p[activeTab] })),
        };

        switch (activeTab) {
            case 'dashboard': return <Dashboard onNavigate={handleNavigate} onClipIdea={handleClipIdea} />;
            case 'prompts': return <PromptsPage onClipIdea={handleClipIdea} initialState={promptsPageState} onStateHandled={() => setPromptsPageState(null)} showGlobalFeedback={showGlobalFeedback} />;
            case 'prompt': return <SavedPrompts {...categoryPanelProps} onSendToEnhancer={(prompt) => handleSendToPromptsPage({ prompt, view: 'enhancer' })} showGlobalFeedback={showGlobalFeedback} onClipIdea={handleClipIdea} />;
            case 'gallery': return <ImageGallery {...categoryPanelProps} isSidebarPinned={isPinned && isSidebarOpen} showGlobalFeedback={showGlobalFeedback} />;
            case 'cheatsheet': return <Cheatsheet {...categoryPanelProps} isSidebarPinned={isPinned && isSidebarOpen} />;
            case 'artstyles': return <ArtstyleCheatsheet {...categoryPanelProps} isSidebarPinned={isPinned && isSidebarOpen} onSendToPromptsPage={(state) => handleSendToPromptsPage({ ...state, view: 'enhancer' })} />;
            case 'artists': return <ArtistCheatsheet {...categoryPanelProps} isSidebarPinned={isPinned && isSidebarOpen} onSendToPromptsPage={(state) => handleSendToPromptsPage({ ...state, view: 'enhancer' })} />;
            case 'settings': return <SetupPage activeSettingsTab={activeSettingsTab} setActiveSettingsTab={setActiveSettingsTab} activeSubTab={activeSettingsSubTab} setActiveSubTab={setActiveSettingsSubTabSetter} showGlobalFeedback={showGlobalFeedback} />;
            case 'composer': return <ComposerPage />;
            case 'image_compare': return <ImageCompare />;
            case 'color_palette_extractor': return <ColorPaletteExtractor onClipIdea={handleClipIdea} />;
            case 'resizer': return <ImageResizer />;
            case 'video_to_frames': return <VideoToFrames />;
            default: return <Dashboard onNavigate={handleNavigate} onClipIdea={handleClipIdea} />;
        }
    };
    
    if (isLoading) return <InitialLoader status={initStatus} progress={initProgress} />;
    if (showWelcome) return <Welcome onSetupComplete={initializeApp} />;
    if (!isInitialized) return null;

    return (
        <div className="h-full bg-base-300">
            {/* 1. Global Shutter (First Load - Entire Window) */}
            <div ref={globalShutterTopRef} className="fixed inset-x-0 top-0 h-1/2 z-[500] bg-base-100 border-b border-base-300/30 pointer-events-none will-change-transform" />
            <div ref={globalShutterBottomRef} className="fixed inset-x-0 bottom-0 h-1/2 z-[500] bg-base-100 border-t border-base-300/30 pointer-events-none will-change-transform" />

            <Sidebar
                activeTab={activeTab}
                onNavigate={handleNavigate}
                isSidebarOpen={isSidebarOpen}
                isPinned={isPinned}
                setIsPinned={setIsPinned}
                onAboutClick={() => setIsAboutModalOpen(true)}
            />
            
            {isSidebarOpen && !isPinned && <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/50 z-30" />}

            <div className={`flex flex-col h-full transition-all duration-300 ease-in-out ${isSidebarOpen && isPinned ? 'lg:ml-80' : ''}`}>
                <Header
                    onMenuClick={handleMenuClick}
                    activeTab={activeTab}
                    clippedIdeasCount={clippedIdeas.length}
                    onToggleClippingPanel={() => setIsClippingPanelOpen(p => !p)}
                />
                
                <main className="flex-grow relative overflow-hidden bg-base-100">
                    {/* 2. Navigation Shutter (Phase 2 - Strictly inside <main>) - Behind Sidebar Shadow */}
                    <div ref={navShutterTopRef} className="absolute inset-x-0 top-0 h-1/2 z-[30] bg-base-100 border-b border-base-300/30 pointer-events-none will-change-transform" />
                    <div ref={navShutterBottomRef} className="absolute inset-x-0 bottom-0 h-1/2 z-[30] bg-base-100 border-t border-base-300/30 pointer-events-none will-change-transform" />

                    <div ref={pageContentRef} className="h-full w-full will-change-transform z-10 relative">
                        {renderContent()}
                    </div>
                </main>
                
                <Footer onAboutClick={() => setIsAboutModalOpen(true)} />
            </div>
            
            <ClippingPanel 
                isOpen={isClippingPanelOpen}
                onClose={() => setIsClippingPanelOpen(false)}
                clippedIdeas={clippedIdeas}
                onRemoveIdea={handleRemoveIdea}
                onClearAll={handleClearAllIdeas}
                onInsertIdea={handleInsertIdea}
                onRefineIdea={handleRefineIdea}
                onAddIdea={handleClipIdea}
                onSaveToLibrary={handleSaveClippedIdea}
            />
            
            <AboutModal isOpen={isAboutModalOpen} onClose={() => setIsAboutModalOpen(false)} />
            
            {globalFeedback && (
                <FeedbackModal
                    isOpen={!!globalFeedback}
                    onClose={() => setGlobalFeedback(null)}
                    message={globalFeedback.message}
                    type={globalFeedback.type}
                />
            )}
        </div>
    );
};

export default App;