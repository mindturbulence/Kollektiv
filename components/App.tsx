
import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import useLocalStorage from '../utils/useLocalStorage';
import { fileSystemManager } from '../utils/fileUtils';
import { verifyAndRepairFiles } from '../utils/integrity';
import { addSavedPrompt } from '../utils/promptStorage';
import { audioService } from '../services/audioService';
import type { ActiveTab, Idea, ActiveSettingsTab } from '../types';

// Layout & Global Components
import Sidebar from './Sidebar';
import Header from './Header';
import Welcome from './Welcome';
import AboutModal from './AboutModal';
import ClippingPanel from './ClippingPanel';
import FeedbackModal from './FeedbackModal';
import Footer from './Footer';
import MouseTrail from './MouseTrail';
import IdleOverlay from './IdleOverlay'; 

// Page components
import Dashboard from './Dashboard';
import PromptsPage from './PromptsPage';
import { StoryboardPage } from './StoryboardPage';
import SavedPrompts from './SavedPrompts';
import ImageGallery from './ImageGallery';
import Cheatsheet from './Cheatsheet';
import ArtstyleCheatsheet from './ArtstyleCheatsheet';
import ArtistCheatsheet from './ArtistCheatsheet';
import { SetupPage } from './SetupPage';
import ComposerPage from './ComposerPage';
import ImageCompare from './ImageCompare';
import ColorPaletteExtractor from './ColorPaletteExtractor';
import ImageResizer from './ImageResizer';
import { VideoToFrames } from './VideoToFrames';

type PromptsPageState = { prompt?: string, artStyle?: string, artist?: string, view?: 'enhancer' | 'composer' | 'create', id?: string } | null;

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() { return { hasError: true }; }
    componentDidCatch(error: any, errorInfo: any) { console.error("App Crash:", error, errorInfo); }
    render() {
        if (this.state.hasError) {
            return (
                <div className="h-screen w-screen flex flex-col items-center justify-center bg-base-100 p-10 text-center">
                    <h1 className="text-4xl font-black uppercase tracking-tighter mb-4">CRITICAL ERROR</h1>
                    <p className="text-base-content/60 font-bold uppercase tracking-widest mb-8">The application encountered an unrecoverable state.</p>
                    <div className="flex flex-col gap-4">
                        <button onClick={() => window.location.reload()} className="btn btn-primary rounded-none font-black tracking-widest uppercase">Restart Application</button>
                        <button 
                            onClick={async () => {
                                if (confirm("This will clear all local settings and storage handles. Your actual files will NOT be deleted. Proceed?")) {
                                    const { resetAllSettings } = await import('../utils/settingsStorage');
                                    await resetAllSettings();
                                    window.location.reload();
                                }
                            }}
                            className="btn btn-error btn-outline btn-sm rounded-none font-bold tracking-widest uppercase opacity-60 hover:opacity-100"
                        >
                            Emergency Reset
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

const InitialLoader: React.FC<{ status: string; progress: number | null }> = ({ status, progress }) => {
    const textWrapperRef = useRef<HTMLHeadingElement>(null);
    const percentage = Math.round((progress || 0) * 100);

    useLayoutEffect(() => {
        if (!textWrapperRef.current) return;
        gsap.fromTo(textWrapperRef.current, 
            { yPercent: 100, autoAlpha: 0 }, 
            { yPercent: 0, autoAlpha: 1, duration: 1.2, ease: "expo.out" }
        );
    }, []);

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
                <div className="overflow-hidden mb-8 px-4">
                    <h1 ref={textWrapperRef} className="grid grid-cols-1 grid-rows-1 text-xl md:text-3xl font-black tracking-tighter uppercase select-none items-center">
                        <span className="text-base-content/10 block leading-none py-2 row-start-1 col-start-1">
                            Kollektiv<span className="text-primary/10 italic">.</span>
                        </span>
                        
                        <div 
                            className="row-start-1 col-start-1 h-full overflow-hidden transition-all duration-700 ease-out border-r border-base-content/20"
                            style={{ width: `${percentage}%` }}
                        >
                            <span className="text-base-content block whitespace-nowrap leading-none py-2 drop-shadow-[0_0_20px_rgba(var(--bc),0.15)]">
                                Kollektiv<span className="text-primary italic">.</span>
                            </span>
                        </div>
                    </h1>
                </div>

                <div className={`flex flex-col items-center gap-3 transition-all duration-500 ${percentage >= 100 ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'}`}>
                    <div className="flex items-center gap-3">
                        <p className="text-[10px] font-mono font-bold uppercase tracking-[0.5em] text-center text-base-content/40">
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
    return (
        <ErrorBoundary>
            <AppContent />
        </ErrorBoundary>
    );
};

const AppContent: React.FC = () => {
    const [isInitialized, setIsInitialized] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [showWelcome, setShowWelcome] = useState(false);
    const [initStatus, setInitStatus] = useState('Starting App');
    const [initProgress, setInitProgress] = useState<number | null>(0);
    const [isIdle, setIsIdle] = useState(false); 
    
    const hasInitializedRef = useRef(false);
    const isTransitioningRef = useRef(false);
    const isFirstRevealRef = useRef(true);
    
    // --- IDLE STATE REFS ---
    const idleTimerRef = useRef<number | null>(null); 
    const isIdleRef = useRef(false); 

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
    const apertureRef = useRef<HTMLDivElement>(null);
    const curtainTopRef = useRef<HTMLDivElement>(null);
    const curtainBottomRef = useRef<HTMLDivElement>(null);
    const appWrapperRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const gridRows = 10;
    const gridCols = 12;

    const resetIdleTimer = useCallback((forceWake: boolean = true) => {
        if (forceWake && isIdleRef.current) {
            setIsIdle(false);
            isIdleRef.current = false;
        }

        if (idleTimerRef.current) {
            window.clearTimeout(idleTimerRef.current);
        }

        idleTimerRef.current = window.setTimeout(() => {
            setIsIdle(true);
            isIdleRef.current = true;
        }, 60000);
    }, []);

    useEffect(() => {
        const handleUserActivity = () => resetIdleTimer(true);
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                resetIdleTimer(isIdleRef.current);
            }
        };

        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
        
        events.forEach(name => window.addEventListener(name, handleUserActivity, { passive: true }));
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleUserActivity);

        resetIdleTimer(false); 

        return () => {
            events.forEach(name => window.removeEventListener(name, handleUserActivity));
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleUserActivity);
            if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
        };
    }, [resetIdleTimer]);

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
                hasInitializedRef.current = true; // Mark as "attempted" to prevent loop
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
            
            audioService.playModalOpen(); // Chime for system ready

            await new Promise(r => setTimeout(r, 1100));

            hasInitializedRef.current = true;
            setIsInitialized(true);
            setIsLoading(false);
        } catch (err) {
            console.error("Initialization Failure:", err);
            hasInitializedRef.current = true; // Mark as "attempted" to prevent loop
            setGlobalFeedback({ message: "Failed to initialize system.", type: 'error' });
            setIsLoading(false);
        }
    }, [settings, auth, isInitialized]);

    useEffect(() => {
        if (!hasInitializedRef.current) {
            initializeApp();
        }
    }, [initializeApp]);

    useLayoutEffect(() => {
        if (!isInitialized || !apertureRef.current || !isFirstRevealRef.current) return;
        isFirstRevealRef.current = false;

        const tl = gsap.timeline({
            defaults: { ease: "expo.inOut", duration: 1.4 }
        });

        gsap.set(apertureRef.current, { visibility: 'visible', autoAlpha: 1 });
        gsap.set(appWrapperRef.current, { scale: 0.96, autoAlpha: 0 });

        tl.to(curtainTopRef.current, {
            yPercent: -100,
        }, 0);

        tl.to(curtainBottomRef.current, {
            yPercent: 100,
        }, 0);

        tl.to(appWrapperRef.current, {
            scale: 1,
            autoAlpha: 1,
            duration: 1.2,
            ease: "expo.out"
        }, 0.2);

        tl.set(apertureRef.current, { visibility: 'hidden', autoAlpha: 0 });

        // Safety timeout to ensure curtains are hidden even if GSAP fails
        const timer = setTimeout(() => {
            if (apertureRef.current) {
                apertureRef.current.style.visibility = 'hidden';
                apertureRef.current.style.opacity = '0';
            }
        }, 3000);

        return () => clearTimeout(timer);
    }, [isInitialized]);

    const runScopedTransition = useCallback(async (targetTab: ActiveTab) => {
        if (isTransitioningRef.current || !mainGridRef.current) return;
        isTransitioningRef.current = true;
        audioService.playClick();

        const cells = mainGridRef.current.querySelectorAll('.transition-cell');
        
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

        setActiveTab(targetTab);
        await new Promise(r => requestAnimationFrame(r)); 

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
        audioService.playClick();
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
            onToggleCategoryPanel: () => {
                audioService.playClick();
                setCollapsedPanels(p => ({ ...p, [activeTab]: !p[activeTab] }));
            },
        };

        switch (activeTab) {
            case 'dashboard': return <Dashboard onNavigate={handleNavigate} onClipIdea={handleClipIdea} />;
            case 'prompts': return <PromptsPage onClipIdea={handleClipIdea} initialState={promptsPageState} onStateHandled={() => setPromptsPageState(null)} showGlobalFeedback={showGlobalFeedback} />;
            case 'storyboard': return <StoryboardPage showGlobalFeedback={showGlobalFeedback} />;
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

    return (
        <div className="h-full flex overflow-hidden relative p-1.5 md:p-3 bg-transparent">
            <MouseTrail />
            
            <IdleOverlay isVisible={isIdle} onInteraction={() => resetIdleTimer(true)} />

            {!isInitialized ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-base-100 border border-base-content/10 rounded shadow-2xl">
                    <div className="text-center space-y-4 max-w-md px-6">
                        <h2 className="text-2xl font-black uppercase tracking-tighter">System Offline</h2>
                        <p className="text-xs font-mono opacity-40 uppercase tracking-widest">Initialization failed or interrupted</p>
                        
                        <div className="flex flex-col gap-3 pt-4">
                            <button 
                                onClick={() => {
                                    hasInitializedRef.current = false;
                                    initializeApp();
                                }}
                                className="btn btn-primary btn-sm rounded-none font-black tracking-widest uppercase"
                            >
                                Retry Initialization
                            </button>
                            
                            <button 
                                onClick={() => window.location.reload()}
                                className="btn btn-ghost btn-sm rounded-none font-bold tracking-widest uppercase opacity-60"
                            >
                                Reboot System
                            </button>

                            <div className="divider opacity-10">OR</div>

                            <button 
                                onClick={async () => {
                                    if (confirm("This will clear all local settings and storage handles. Your actual files will NOT be deleted. Proceed?")) {
                                        const { resetAllSettings } = await import('../utils/settingsStorage');
                                        await resetAllSettings();
                                        window.location.reload();
                                    }
                                }}
                                className="btn btn-error btn-outline btn-xs rounded-none font-bold tracking-widest uppercase opacity-60 hover:opacity-100"
                            >
                                Reset Storage Config
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <div 
                        ref={apertureRef} 
                        className="fixed inset-0 z-[700] pointer-events-none flex flex-col"
                        style={{ visibility: 'hidden' }}
                    >
                        <div ref={curtainTopRef} className="flex-1 bg-base-100 border-b border-base-300" />
                        <div ref={curtainBottomRef} className="flex-1 bg-base-100" />
                    </div>

                    <div 
                        ref={appWrapperRef}
                        className="flex-1 flex overflow-hidden relative z-0 border border-base-content/10 shadow-2xl rounded bg-base-100"
                    >
                        
                        <Sidebar
                            activeTab={activeTab}
                            onNavigate={handleNavigate}
                            isSidebarOpen={isSidebarOpen}
                            isPinned={isPinned}
                            setIsPinned={(val) => {
                                audioService.playClick();
                                setIsPinned(val);
                            }}
                            onAboutClick={() => {
                                audioService.playModalOpen();
                                setIsAboutModalOpen(true);
                            }}
                        />
                        
                        {isSidebarOpen && !isPinned && <div onClick={() => setIsSidebarOpen(false)} className="absolute inset-0 bg-black/50 z-[90]" />}

                        <div className="flex-1 flex flex-col min-w-0 h-full relative z-0">
                            <Header
                                onMenuClick={handleMenuClick}
                                onStandbyClick={() => { setIsIdle(true); isIdleRef.current = true; }}
                                activeTab={activeTab}
                                clippedIdeasCount={clippedIdeas.length}
                                onToggleClippingPanel={() => {
                                    audioService.playClick();
                                    setIsClippingPanelOpen(p => !p);
                                }}
                            />
                            
                            <main className="flex-grow relative overflow-hidden bg-base-100">
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
                            
                            <Footer onAboutClick={() => {
                                audioService.playModalOpen();
                                setIsAboutModalOpen(true);
                            }} />
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
                    </div>
                </>
            )}
            
            <AboutModal 
                isOpen={isAboutModalOpen} 
                onClose={() => {
                    audioService.playModalClose();
                    setIsAboutModalOpen(false);
                }} 
            />
            
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
