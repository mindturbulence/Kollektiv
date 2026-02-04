
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
 * Technical Portfolio Initializer.
 * Theme-aware staggered typographic mask.
 */
const InitialLoader: React.FC<{ status: string; progress: number | null }> = ({ status, progress }) => {
    const textWrapperRef = useRef<HTMLDivElement>(null);
    const percentage = Math.round((progress || 0) * 100);

    // Initial Entrance
    useLayoutEffect(() => {
        if (!textWrapperRef.current) return;
        gsap.fromTo(textWrapperRef.current, 
            { yPercent: 100, autoAlpha: 0 }, 
            { yPercent: 0, autoAlpha: 1, duration: 1.2, ease: "expo.out" }
        );
    }, []);

    // Exit Sequence: Slide up and fade when finished
    useEffect(() => {
        if (percentage >= 100 && textWrapperRef.current) {
            gsap.to(textWrapperRef.current, {
                y: -80,
                autoAlpha: 0,
                duration: 0.8,
                ease: "expo.inOut",
                delay: 0.2
            });
        }
    }, [percentage]);

    return (
        <div id="initial-loader" className="fixed inset-0 z-[500] flex flex-col items-center justify-center bg-base-100 text-base-content overflow-hidden select-none">
            <div className="absolute inset-0 bg-grid-texture opacity-[0.03] pointer-events-none"></div>
            
            <div className="relative z-10 flex flex-col items-center">
                <div className="overflow-hidden mb-4 px-2">
                    <div ref={textWrapperRef} className="grid grid-cols-1 grid-rows-1 text-2xl md:text-3xl font-black tracking-tighter uppercase select-none italic">
                        {/* Ghost Layer: Picks up text-base-content at low opacity */}
                        <span className="text-base-content/10 block leading-none py-1 row-start-1 col-start-1">Kollektiv.</span>
                        
                        {/* Fill Layer: Picks up text-base-content at full opacity */}
                        <div 
                            className="row-start-1 col-start-1 h-full overflow-hidden transition-all duration-700 ease-out border-r border-base-content/20"
                            style={{ width: `${percentage}%` }}
                        >
                            <span className="text-base-content block whitespace-nowrap leading-none py-1 drop-shadow-[0_0_15px_rgba(var(--bc),0.1)]">
                                Kollektiv.
                            </span>
                        </div>
                    </div>
                </div>

                <div className={`flex flex-col items-center gap-3 transition-all duration-500 ${percentage >= 100 ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'}`}>
                    <div className="flex items-center gap-3">
                        <p className="text-[8px] font-mono font-bold uppercase tracking-[0.5em] text-center text-base-content/40">
                            {status.toUpperCase()}
                        </p>
                    </div>
                </div>
            </div>

            <div className="absolute bottom-12 left-12 hidden md:block">
                <span className="text-[8px] font-mono font-bold text-base-content/10 uppercase tracking-widest">Protocol: Master_Load_Sequence</span>
            </div>
        </div>
    );
};

const App: React.FC = () => {
    const [isInitialized, setIsInitialized] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [showWelcome, setShowWelcome] = useState(false);
    const [initStatus, setInitStatus] = useState('Starting App');
    const [initProgress, setInitProgress] = useState<number | null>(0);
    
    const hasInitializedRef = useRef(false);
    const isTransitioningRef = useRef(false);
    const isFirstRevealRef = useRef(true);

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

    const mainGridRef = useRef<HTMLDivElement>(null);
    const globalGridRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // Grid config
    const gridRows = 10;
    const gridCols = 12;

    const initializeApp = useCallback(async () => {
        if (hasInitializedRef.current && isInitialized) return;
        
        setIsLoading(true);
        setShowWelcome(false);
        setInitStatus('Connecting...');
        setInitProgress(0.1);

        const onProgress = (message: string, progress?: number) => {
             setInitStatus(message.toUpperCase());
             if (progress !== undefined) setInitProgress(progress);
        };
        
        try {
            await new Promise(r => setTimeout(r, 1000)); 
            const hasHandleAndPermission = await fileSystemManager.initialize(settings, auth);
            
            if (!hasHandleAndPermission) {
                setShowWelcome(true);
                setIsLoading(false);
                return;
            }

            onProgress('Loading Folders...', 0.35);
            await verifyAndRepairFiles(onProgress, settings);
            
            onProgress('Syncing Styles...', 0.7);
            if ('fonts' in document) {
                await (document as any).fonts.ready;
            }

            onProgress('Finalizing System...', 0.9);
            onProgress('System Ready', 1.0);
            
            // Wait for the loader's exit animation (slide up text)
            await new Promise(r => setTimeout(r, 1100));

            hasInitializedRef.current = true;
            setIsInitialized(true);
            setIsLoading(false);
        } catch (err) {
            console.error("Initialization Failure:", err);
            setGlobalFeedback({ message: "Failed to initialize system.", type: 'error' });
            setIsLoading(false);
        }
    }, [settings, auth, isInitialized]);

    useEffect(() => {
        if (!hasInitializedRef.current) {
            initializeApp();
        }
    }, [initializeApp]);

    // --- INITIAL GLOBAL REVEAL ---
    useLayoutEffect(() => {
        if (!isInitialized || !globalGridRef.current || !isFirstRevealRef.current) return;
        isFirstRevealRef.current = false;

        const cells = globalGridRef.current.querySelectorAll('.transition-cell');
        
        // Ensure cells are visible and covering before starting
        gsap.set(globalGridRef.current, { autoAlpha: 1, visibility: 'visible' });
        gsap.set(cells, { scaleY: 1.01, autoAlpha: 1 });

        gsap.to(cells, {
            scaleY: 0,
            autoAlpha: 0,
            transformOrigin: "top",
            duration: 0.9,
            ease: "power4.inOut",
            stagger: {
                grid: [gridRows, gridCols],
                from: "end",
                axis: "y",
                amount: 0.6
            },
            onComplete: () => {
                gsap.set(globalGridRef.current, { autoAlpha: 0, visibility: 'hidden' });
            }
        });
    }, [isInitialized]);

    // --- SCOPED NAVIGATION TRANSITION ---
    const runScopedTransition = useCallback(async (targetTab: ActiveTab) => {
        if (isTransitioningRef.current || !mainGridRef.current) return;
        isTransitioningRef.current = true;

        const cells = mainGridRef.current.querySelectorAll('.transition-cell');
        
        // 1. LEAVING (DOWN): Cover the workspace
        gsap.set(mainGridRef.current, { autoAlpha: 1, visibility: 'visible' });
        await gsap.fromTo(cells, 
            { scaleY: 0, autoAlpha: 0, transformOrigin: "top" },
            { 
                scaleY: 1.01, 
                autoAlpha: 1, 
                duration: 0.45, 
                ease: "power2.inOut",
                stagger: {
                    grid: [gridRows, gridCols],
                    from: "start",
                    axis: "y",
                    amount: 0.3
                }
            }
        );

        // 2. STATE SWITCH: Change tab while covered
        setActiveTab(targetTab);
        await new Promise(r => requestAnimationFrame(r)); // Frame for React render

        // 3. ENTERING (UP): Reveal the new workspace
        const tl = gsap.timeline({
            onComplete: () => {
                gsap.set(mainGridRef.current, { autoAlpha: 0, visibility: 'hidden' });
                isTransitioningRef.current = false;
            }
        });

        tl.to(cells, {
            scaleY: 0,
            autoAlpha: 0,
            transformOrigin: "top",
            duration: 0.45,
            ease: "power2.inOut",
            stagger: {
                grid: [gridRows, gridCols],
                from: "end",
                axis: "y",
                amount: 0.3
            }
        });

        if (contentRef.current) {
            tl.fromTo(contentRef.current, 
                { autoAlpha: 0, y: 15 },
                { autoAlpha: 1, y: 0, duration: 0.6, ease: "power3.out" },
                "-=0.4"
            );
        }
    }, [setActiveTab]);

    const handleNavigate = (tab: ActiveTab) => {
        if (tab === activeTab) return;
        
        const isLg = window.innerWidth >= 1024;
        if (!isPinned && !isLg) setIsSidebarOpen(false);

        runScopedTransition(tab);
    };

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
    
    const showGlobalFeedback = useCallback((message: string, isError = false) => {
        setGlobalFeedback({ message, type: isError ? 'error' : 'success' });
    }, []);

    const handleSendToPromptsPage = useCallback((state: PromptsPageState) => {
        setPromptsPageState(state);
        handleNavigate('prompts');
        showGlobalFeedback('Sent to Builder!');
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
            showGlobalFeedback(`"${idea.title}" saved.`);
        } catch (e) {
            showGlobalFeedback("Failed to save.", true);
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
            case 'composer': return <ComposerPage showGlobalFeedback={showGlobalFeedback} />;
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
            {/* 1. GLOBAL REVEAL GRID - Covers everything on first load */}
            <div 
                ref={globalGridRef} 
                className="fixed inset-0 z-[700] pointer-events-none grid"
                style={{ 
                    gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                    gridTemplateRows: `repeat(${gridRows}, 1fr)`,
                    visibility: 'hidden'
                }}
            >
                {Array.from({ length: gridRows * gridCols }).map((_, i) => (
                    <div key={i} className="transition-cell bg-base-100 will-change-transform" />
                ))}
            </div>

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
                    {/* 2. SCOPED NAVIGATION GRID - Restrained to main content area */}
                    <div 
                        ref={mainGridRef} 
                        className="absolute inset-0 z-[600] pointer-events-none grid"
                        style={{ 
                            gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                            gridTemplateRows: `repeat(${gridRows}, 1fr)`,
                            visibility: 'hidden'
                        }}
                    >
                        {Array.from({ length: gridRows * gridCols }).map((_, i) => (
                            <div key={i} className="transition-cell bg-base-100 will-change-transform" />
                        ))}
                    </div>

                    <div ref={contentRef} className="h-full w-full will-change-transform z-10 relative">
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
