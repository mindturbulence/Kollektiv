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
import LoadingSpinner from './LoadingSpinner';

type PromptsPageState = { prompt?: string, artStyle?: string, artist?: string, view?: 'enhancer' | 'composer' | 'create', id?: string } | null;

/**
 * Unified System Loader.
 */
const InitialLoader: React.FC<{ status: string; progress: number | null }> = ({ status, progress }) => {
    return (
        <div id="initial-loader" className="flex flex-col items-center justify-center w-full h-full bg-base-100 text-white transition-colors duration-300">
            <div className="flex flex-col items-center">
                <LoadingSpinner size={120} />
                <div className="flex flex-col items-center mt-8 relative z-10">
                    <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white opacity-40 animate-pulse">
                        {status}
                    </p>
                    {progress !== null && (
                        <div className="w-48 h-0.5 bg-white/5 rounded-full mt-4 overflow-hidden">
                            <div 
                                className="h-full bg-white rounded-full transition-all duration-300" 
                                style={{ width: `${progress * 100}%` }} 
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const App: React.FC = () => {
    const [isInitialized, setIsInitialized] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [showWelcome, setShowWelcome] = useState(false);
    const [initStatus, setInitStatus] = useState('Initializing System Registry');
    const [initProgress, setInitProgress] = useState<number | null>(null);

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

    // --- Transition State ---
    const pageContentRef = useRef<HTMLDivElement>(null);
    const shutterRef = useRef<HTMLDivElement>(null);
    const shutterSecondaryRef = useRef<HTMLDivElement>(null);
    const isTransitioning = useRef(false);

    const initializeApp = useCallback(async () => {
        setIsLoading(true);
        setShowWelcome(false);
        setInitStatus('Preparing Neural Buffers');

        const onProgress = (message: string, progress?: number) => {
             setInitStatus(message.toUpperCase());
             if (progress !== undefined) setInitProgress(progress);
             else setInitProgress(null);
        };
        
        try {
            onProgress('Establishing File Link...');
            const hasHandleAndPermission = await fileSystemManager.initialize(settings, auth);
            
            if (!hasHandleAndPermission) {
                setShowWelcome(true);
                setIsLoading(false);
                return;
            }

            await verifyAndRepairFiles(onProgress, settings);
            
            onProgress('Stabilizing Neural Sync...');
            await new Promise(resolve => setTimeout(resolve, 300));

            requestAnimationFrame(() => {
                setIsInitialized(true);
                setIsLoading(false);
            });
        } catch (err) {
            console.error("Initialization Critical Failure:", err);
            setGlobalFeedback({ 
                message: "System failed to initialize. Access interrupted.", 
                type: 'error' 
            });
            setIsLoading(false);
        }
        
    }, [settings, auth]);

    useEffect(() => {
        initializeApp();
    }, [initializeApp]);

    // --- Optimized GSAP Transition Logic ---
    useLayoutEffect(() => {
        if (!isInitialized || !pageContentRef.current) return;

        const ctx = gsap.context(() => {
            isTransitioning.current = true;
            
            const tl = gsap.timeline({
                defaults: { ease: "power4.inOut", duration: 0.7 },
                onComplete: () => {
                    isTransitioning.current = false;
                    // Fully clear state after reveal to ensure no layout issues
                    gsap.set([shutterRef.current, shutterSecondaryRef.current], { 
                        autoAlpha: 0, 
                        pointerEvents: 'none' 
                    });
                    gsap.set(pageContentRef.current, { clearProps: "all" });
                }
            });

            // 1. Initial State: BLANK CONTENT IMMEDIATELY
            // Use autoAlpha 0 to hide container and all children
            gsap.set(pageContentRef.current, { autoAlpha: 0 });
            
            // 2. Prepare Shutters at the BOTTOM
            gsap.set([shutterRef.current, shutterSecondaryRef.current], { 
                yPercent: 100, 
                autoAlpha: 1,
                pointerEvents: 'auto',
                force3D: true
            });

            // 3. The Wipe: Move shutters UP
            tl.to(shutterSecondaryRef.current, { yPercent: -100, duration: 0.75 }, 0);
            tl.to(shutterRef.current, { yPercent: -100, duration: 0.8 }, 0.05);

            // 4. Reveal Phase
            // CRITICAL: First, we MUST set the container to visible so its contents can be seen
            tl.set(pageContentRef.current, { autoAlpha: 1 }, 0.4);

            // Try to find specific elements for high-fidelity staggered entrance
            const revealElements = pageContentRef.current.querySelectorAll('section, h1, .elastic-grid-container, footer');
            
            if (revealElements.length > 0) {
                 tl.fromTo(revealElements, 
                    { autoAlpha: 0, y: 15 }, 
                    { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.04, ease: "power2.out", clearProps: "all" }, 
                    0.4 // Synchronized with container reveal
                );
            } else {
                // Graceful fallback for simpler pages
                tl.fromTo(pageContentRef.current, 
                    { autoAlpha: 0, y: 10 }, 
                    { autoAlpha: 1, y: 0, duration: 0.4, ease: "power2.out", clearProps: "all" }, 
                    0.4
                );
            }

            // Safety catch to unlock input if animation fails
            const timer = setTimeout(() => { isTransitioning.current = false; }, 1200);
            return () => clearTimeout(timer);
        });

        return () => ctx.revert();
    }, [activeTab, isInitialized]);
    
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
        if (tab === activeTab || isTransitioning.current) return;
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
            showGlobalFeedback(`"${idea.title}" archived to Library.`);
        } catch (e) {
            showGlobalFeedback("Failed to archive idea.", true);
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
    if (!isInitialized) return (
        <div className="p-8 h-full w-full flex flex-col items-center justify-center bg-base-100">
            <p className="text-error font-black uppercase tracking-tighter text-4xl mb-4 text-center">Neural Link Failure.</p>
            <button onClick={() => window.location.reload()} className="btn btn-primary rounded-none font-black text-xs tracking-widest uppercase">Retry Uplink</button>
        </div>
    );

    return (
        <div className="h-full bg-base-300">
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
                    {/* High-Fidelity Shutter Layers */}
                    <div 
                        ref={shutterRef} 
                        className="absolute inset-0 z-[60] bg-base-100 opacity-0 pointer-events-none will-change-transform" 
                        style={{ backfaceVisibility: 'hidden' }}
                    />
                    <div 
                        ref={shutterSecondaryRef} 
                        className="absolute inset-0 z-[59] bg-base-200 opacity-0 pointer-events-none will-change-transform" 
                        style={{ backfaceVisibility: 'hidden' }}
                    />

                    <div 
                        ref={pageContentRef}
                        className="h-full w-full will-change-transform"
                    >
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