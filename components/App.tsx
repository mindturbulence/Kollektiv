import React, { useState, useCallback, useRef, useLayoutEffect, useMemo } from 'react';
import { gsap } from 'gsap';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import useLocalStorage from '../utils/useLocalStorage';
import { audioService } from '../services/audioService';
import { BusyProvider } from '../contexts/BusyContext';
import type { ActiveTab } from '../types';
import CommandPalette from './CommandPalette';

// Layout & Global Components
import Header from './Header';
import Welcome from './Welcome';
import CustomCursor from './CustomCursor';
import AboutModal from './AboutModal';
import ClippingPanel from './ClippingPanel';
import MediaPanel from './MediaPanel';
import ActivityPanel from './ActivityPanel';
import LlmStatusPanel from './LlmStatusPanel';
import FeedbackToast from './FeedbackToast';
import Footer from './Footer';
import IdleOverlay from './IdleOverlay';
import { TabTitleManager } from './TabTitleManager';

// Page components
import Dashboard from './Dashboard';
import AssistantPage from './AssistantPage';
import DiscoveryPage from './DiscoveryPage';
import PromptsPage from './PromptsPage';
import SavedPrompts from './SavedPrompts';
import ImageGallery from './ImageGallery';

import { SetupPage } from './SetupPage';
import ComposerPage from './ComposerPage';
import ImageCompare from './ImageCompare';
import ColorPaletteExtractor from './ColorPaletteExtractor';
import ImageResizer from './ImageResizer';
import { VideoToFrames } from './VideoToFrames';
import LoraEditorPage from './loraEditor/LoraEditorPage';
import { LLMChatPanel } from './LLMChatPanel';
import { LiveAssistantProvider } from '../contexts/LiveAssistantContext';
import WebViewerPanel from './WebViewerPanel';
import VideoPlayerOverlay from './VideoPlayerOverlay';

import InitialLoader from './InitialLoader';
import PageFrame from './PageFrame';
import { useIdleSystem } from '../utils/useIdleSystem';
import { useAmbientMusic } from '../utils/useAmbientMusic';

import LiveCaptionOverlay from './LiveCaptionOverlay';
import { ScreenControlOverlay } from './ScreenControlOverlay';
import { motion, AnimatePresence } from 'motion/react';
import { shellVariants } from './AnimatedPanels';
import TransitionOverlay, { type TransitionOverlayHandle } from './transitions/TransitionOverlay';
import { useBootSequence } from '../hooks/useBootSequence';
import { useAppTheme } from '../hooks/useAppTheme';
import { usePageTransitions } from '../hooks/usePageTransitions';
import { useAppShell } from '../hooks/useAppShell';
import { useAppEventBus } from '../hooks/useAppEventBus';


class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any, errorInfo: any }> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }
    static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
    componentDidCatch(error: any, errorInfo: any) {
        console.error("App Crash:", error, errorInfo);
        this.setState({ errorInfo });
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="h-screen w-screen flex flex-col items-center justify-center bg-base-100 p-5 text-center">
                    <h1 className="text-4xl font-black uppercase tracking-tighter mb-4">CRITICAL ERROR</h1>
                    <p className="text-base-content/60 font-bold uppercase tracking-widest mb-4">The application encountered an unrecoverable state.</p>

                    <div className="bg-error/10 border border-error/20 p-4 mb-8 max-w-4xl w-full overflow-auto transition-all animate-fade-in shadow-2xl">
                        <div className="text-xs text-error font-mono font-black uppercase tracking-widest mb-2 border-b border-error/20 pb-1">Trace Summary</div>
                        <code className="text-xs text-error font-mono break-words whitespace-pre-wrap text-left block max-h-[30vh]">
                            {typeof this.state.error === 'object' ? (this.state.error.stack || this.state.error.message || JSON.stringify(this.state.error)) : String(this.state.error)}
                        </code>

                        {this.state.errorInfo && (
                            <>
                                <div className="text-xs text-error font-mono font-black uppercase tracking-widest mt-4 mb-2 border-b border-error/20 pb-1">Component Stack</div>
                                <code className="text-xs text-error/60 font-mono break-words whitespace-pre-wrap text-left block max-h-[30vh]">
                                    {this.state.errorInfo.componentStack}
                                </code>
                            </>
                        )}
                    </div>

                    <div className="flex flex-col gap-4">
                        <button onClick={() => window.location.reload()} className="form-btn form-btn-primary">Restart Application</button>
                        <button
                            onClick={async () => {
                                if (confirm("This will clear all local settings and storage handles. Your actual files will NOT be deleted. Proceed?")) {
                                    const { resetAllSettings } = await import('../utils/settingsStorage');
                                    await resetAllSettings();
                                    window.location.reload();
                                }
                            }}
                            className="form-btn h-8 opacity-60 hover:opacity-100 text-error"
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

const App: React.FC = () => {
    return (
        <ErrorBoundary>
            <BusyProvider>
                <AppContent />
            </BusyProvider>
        </ErrorBoundary>
    );
};

const AppContent: React.FC = () => {
    const [videoError, setVideoError] = useState(false);
    const isFirstRevealRef = useRef(true);

    const { settings, updateSettings } = useSettings();
    const auth = useAuth();

    const [activeTab, setActiveTab] = useLocalStorage<ActiveTab>('activeTab', 'dashboard');

    const currentTitle = useMemo(() => {
        const base = "KOLLEKTIV";
        switch (activeTab) {
            case 'dashboard': return `DASHBOARD | ${base}`;
            case 'assistant': return `ASSISTANT | ${base}`;
            case 'discovery': return `DISCOVERY | ${base}`;
            case 'prompts': return `BUILDER | ${base}`;
            case 'crafter': return `CRAFTER | ${base}`;
            case 'refiner': return `REFINER | ${base}`;
            case 'prompt_analyzer': return `ANALYZER | ${base}`;
            case 'media_analyzer': return `MEDIA | ${base}`;
            case 'gallery': return `VAULT | ${base}`;
            case 'prompt': return `LIBRARY | ${base}`;
            case 'settings': return `SETTINGS | ${base}`;
            case 'composer': return `COMPOSER | ${base}`;

            case 'image_compare': return `COMPARE | ${base}`;
            case 'color_palette_extractor': return `PALETTE | ${base}`;
            case 'resizer': return `RESIZER | ${base}`;
            case 'video_to_frames': return `VIDEO | ${base}`;
            case 'lora_editor': return `LORA | ${base}`;
            default: return base;
        }
    }, [activeTab]);

    const { isIdle, resetIdleTimer, goIdle } = useIdleSystem(settings.isIdleEnabled, settings.idleTimeoutMinutes);

    useAppTheme(settings.darkTheme, settings.fontSize);

    const transitionOverlayHandleRef = useRef<TransitionOverlayHandle>(null);
    const apertureRef = useRef<HTMLDivElement>(null);
    const blindsRef = useRef<HTMLDivElement>(null);
    const appWrapperRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const frameWrapperRef = useRef<HTMLDivElement>(null);
    const scanTopRef = useRef<HTMLSpanElement>(null);
    const scanRightRef = useRef<HTMLSpanElement>(null);
    const scanBottomRef = useRef<HTMLSpanElement>(null);
    const scanLeftRef = useRef<HTMLSpanElement>(null);

    const { isUplinkActive, playerState, audioEnabled, videoId, startupContinue, handleMusicToggle, handleAudioToggle } = useAmbientMusic(settings, updateSettings);

    // Hooks must be ordered to satisfy dependencies:
    // 1. Page transitions (needs activeTab/setActiveTab from useLocalStorage)
    // 2. App shell (needs handleNavigate from transitions)
    // 3. Boot sequence (needs setGlobalFeedback from shell)

    const { pageFxKind, handleNavigate } = usePageTransitions({
        activeTab,
        setActiveTab,
        contentRef,
        transitionOverlayHandleRef,
    });

    const shell = useAppShell({ handleNavigate });

    const {
        isAboutModalOpen,
        isClippingPanelOpen,
        isMediaPanelOpen,
        isWebViewerOpen,
        isChatPanelOpen,
        isLlmPanelOpen,
        isCommandPaletteOpen,
        isActivityPanelOpen,
        videoPlayerUrl,
        globalFeedback,
        promptsPageState,
        activeSettingsTab,
        activeSettingsSubTab,
        clippedIdeas,
        notesCount,
        filesCount,
        collapsedPanels,
        showGlobalFeedback,
        handleSendToPromptsPage,
        handleClipIdea,
        handleRemoveIdea,
        handleClearAllIdeas,
        handleInsertIdea,
        handleRefineIdea,
        handleSaveClippedIdea,
        handleSendToEnhancer,
        handleClearPromptsPageState,
        handleAboutClick,
        handleToggleClippingPanel,
        handleToggleActivityPanel,
        handleCloseActivityPanel,
        handleToggleMediaPanel,
        handleCloseMediaPanel,
        handleToggleWebViewer,
        handleCloseWebViewer,
        handleCloseVideoPlayer,
        handleToggleChatPanel,
        handleCloseChatPanel,
        handleCloseLlmStatus,
        setIsLlmPanelOpen,
        setIsAboutModalOpen,
        setGlobalFeedback,
        setVideoPlayerUrl,
        setIsClippingPanelOpen,
        setIsMediaPanelOpen,
        setIsWebViewerOpen,
        setIsCommandPaletteOpen,
        setCollapsedPanels,
        setActiveSettingsTab,
        setActiveSettingsSubTab,
    } = shell;

    const {
        bootState,
        loaderRef,
        initializeApp,
        handleInitContinue,
        hasInitializedRef,
    } = useBootSequence({
        auth,
        showGlobalFeedback,
        startupContinue,
    });

    const { isInitialized, isLoading, showWelcome, initStatus, initProgress } = bootState;

    useLayoutEffect(() => {
        if (!isInitialized || !frameWrapperRef.current || !apertureRef.current || !blindsRef.current || !isFirstRevealRef.current) return;

        isFirstRevealRef.current = false;

        const ctx = gsap.context(() => {
            const tl = gsap.timeline({
                defaults: { ease: "power4.inOut" }
            });

            const frame = frameWrapperRef.current?.querySelector('.main-app-frame');
            const corners = frameWrapperRef.current?.querySelectorAll('.corner-accent');
            const markers = frameWrapperRef.current?.querySelectorAll('.side-marker');
            const blindItems = Array.from(blindsRef.current!.children) as HTMLElement[];

            gsap.set(apertureRef.current, { visibility: 'visible', alpha: 1 });
            gsap.set(appWrapperRef.current, { alpha: 1 });
            gsap.set(contentRef.current, { alpha: 0 });
            gsap.set(['.app-header', '.app-footer'], { opacity: 0 });

            blindItems.forEach((item) => {
                gsap.set(item, { yPercent: 0, scaleX: 1, scaleY: 1 });
            });

            if (frame) {
                tl.fromTo(frame,
                    { scale: 1.04, alpha: 1 },
                    { scale: 1, duration: 2.0, ease: "expo.out" }
                );
                if (corners && corners.length > 0) {
                    tl.fromTo(corners,
                        { opacity: 0, x: (i) => (i % 2 === 0 ? -40 : 40), y: (i) => (i < 2 ? -40 : 40) },
                        { opacity: 1, x: 0, y: 0, duration: 1.5, stagger: 0.05, ease: "expo.out" },
                        0.2
                    );
                }
                if (markers && markers.length > 0) {
                    tl.fromTo(markers,
                        { opacity: 0, scaleY: 0 },
                        { opacity: 1, scaleY: 1, duration: 1.2, ease: "expo.out" },
                        0.8
                    );
                }
            }

            tl.to(blindItems, {
                yPercent: (i) => i % 2 === 0 ? -100 : 100,
                duration: 1.2,
                stagger: { each: 0.05, from: "center" },
                ease: "expo.inOut"
            }, "<0.5");

            tl.fromTo('.app-header',
                { y: -30, opacity: 0 },
                { y: 0, opacity: 1, duration: 1.0, ease: "expo.out" },
                ">-0.4"
            );
            tl.fromTo('.app-footer',
                { y: 30, opacity: 0 },
                { y: 0, opacity: 1, duration: 1.0, ease: "expo.out" },
                "<"
            );
            tl.to(contentRef.current, { alpha: 1, duration: 1.0, ease: "power2.out" }, "<0.2");
            tl.set(apertureRef.current, { visibility: 'hidden', alpha: 0 });
        });

        return () => ctx.revert();
    }, [isInitialized]);

    useAppEventBus({
        handleNavigate,
        handleSendToPromptsPage,
        showGlobalFeedback,
        isCommandPaletteOpen,
        setIsCommandPaletteOpen,
        setIsClippingPanelOpen,
        setIsMediaPanelOpen,
        setIsWebViewerOpen,
        setVideoPlayerUrl,
        handleClipIdea,
    });

    const renderContent = () => {
        const categoryPanelProps = {
            isCategoryPanelCollapsed: !!collapsedPanels[activeTab],
            onToggleCategoryPanel: () => {
                setCollapsedPanels(p => ({ ...p, [activeTab]: !p[activeTab] }));
            },
        };

        switch (activeTab) {
            case 'dashboard': return <Dashboard key="dashboard" onNavigate={handleNavigate} onClipIdea={handleClipIdea} isExiting={false} />;
            case 'assistant': return <AssistantPage key="assistant" />;
            case 'discovery': return <DiscoveryPage key="discovery" isExiting={false} onClipIdea={handleClipIdea} onSendToBuilder={handleSendToPromptsPage} showGlobalFeedback={showGlobalFeedback} />;
            case 'prompts': return <PromptsPage key="prompts" onClipIdea={handleClipIdea} initialState={promptsPageState}                            onStateHandled={handleClearPromptsPageState} showGlobalFeedback={showGlobalFeedback} isExiting={false} onSendToBuilder={handleSendToPromptsPage} />;
            case 'crafter': return <PromptsPage key="prompts" forcedView="composer" onNavigate={handleNavigate} onClipIdea={handleClipIdea} initialState={promptsPageState}                            onStateHandled={handleClearPromptsPageState} showGlobalFeedback={showGlobalFeedback} isExiting={false} onSendToBuilder={handleSendToPromptsPage} />;
            case 'refiner': return <PromptsPage key="prompts" forcedView="refine" onNavigate={handleNavigate} onClipIdea={handleClipIdea} initialState={promptsPageState}                            onStateHandled={handleClearPromptsPageState} showGlobalFeedback={showGlobalFeedback} isExiting={false} onSendToBuilder={handleSendToPromptsPage} />;
            case 'prompt_analyzer': return <PromptsPage key="prompts" forcedView="prompt_analyzer" onNavigate={handleNavigate} onClipIdea={handleClipIdea} initialState={promptsPageState}                            onStateHandled={handleClearPromptsPageState} showGlobalFeedback={showGlobalFeedback} isExiting={false} onSendToBuilder={handleSendToPromptsPage} />;
            case 'media_analyzer': return <PromptsPage key="prompts" forcedView="analyzer" onNavigate={handleNavigate} onClipIdea={handleClipIdea} initialState={promptsPageState}                            onStateHandled={handleClearPromptsPageState} showGlobalFeedback={showGlobalFeedback} isExiting={false} onSendToBuilder={handleSendToPromptsPage} />;
            case 'prompt': return <SavedPrompts key="prompts" {...categoryPanelProps}                    onSendToEnhancer={handleSendToEnhancer} showGlobalFeedback={showGlobalFeedback} onClipIdea={handleClipIdea} isExiting={false} />;
            case 'gallery': return <ImageGallery key="gallery" {...categoryPanelProps} isSidebarPinned={false} showGlobalFeedback={showGlobalFeedback} isExiting={false} />;

            case 'settings': return <SetupPage key="settings" activeSettingsTab={activeSettingsTab} setActiveSettingsTab={setActiveSettingsTab} activeSubTab={activeSettingsSubTab} setActiveSubTab={setActiveSettingsSubTab} showGlobalFeedback={showGlobalFeedback} isExiting={false} />;
            case 'composer': return <ComposerPage key="composer" showGlobalFeedback={showGlobalFeedback} isExiting={false} />;
            case 'image_compare': return <ImageCompare key="image_compare" isExiting={false} />;
            case 'color_palette_extractor': return <ColorPaletteExtractor key="color_palette_extractor" onClipIdea={handleClipIdea} isExiting={false} />;
            case 'resizer': return <ImageResizer key="resizer" isExiting={false} />;
            case 'video_to_frames': return <VideoToFrames key="video_to_frames" isExiting={false} />;
            case 'lora_editor': return <LoraEditorPage key="lora_editor" isExiting={false} />;
            default: return <Dashboard key="default" onNavigate={handleNavigate} onClipIdea={handleClipIdea} isExiting={false} />;
        }
    };



    // --- Inline-callbacks that add audio-service side-effects on top of shell state ---
    const handleToggleLlmPanel = useCallback(() => {
        audioService.playClick();
        setIsLlmPanelOpen(prev => !prev);
    }, [setIsLlmPanelOpen]);
    const handleCloseAboutModal = useCallback(() => {
        audioService.playModalClose();
        setIsAboutModalOpen(false);
    }, [setIsAboutModalOpen]);
    const handleCloseFeedback = useCallback(() => setGlobalFeedback(null), [setGlobalFeedback]);
    const handleCloseClippingPanel = useCallback(() => setIsClippingPanelOpen(false), [setIsClippingPanelOpen]);
    const handleIdleInteraction = useCallback(() => resetIdleTimer(true), [resetIdleTimer]);

    if (showWelcome) return <Welcome onSetupComplete={initializeApp} />;

    return (
        <LiveAssistantProvider>
        <div className="h-full w-full overflow-hidden relative font-sans">
            {isLoading && (
                <div ref={loaderRef} className="fixed inset-0 z-[1000]">
                    <InitialLoader status={initStatus} progress={initProgress} onContinue={handleInitContinue} />
                </div>
            )}
            {/* AMBIENT VIDEO BACKGROUND */}
            {isInitialized && (
                <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                    {((settings.dashboardBackgroundType === 'video' || (!settings.dashboardBackgroundType && settings.isDashboardVideoEnabled)) && !videoError && settings.dashboardVideoUrl) ? (
                        <video
                            key={settings.dashboardVideoUrl}
                            src={settings.dashboardVideoUrl}
                            autoPlay
                            muted
                            loop
                            playsInline
                            crossOrigin="anonymous"
                            className="w-full h-full object-cover grayscale brightness-[0.6] contrast-125 opacity-30 transition-opacity duration-1000"
                            style={{ filter: 'grayscale(1) brightness(0.6) contrast(1.1)' }}
                            onError={() => setVideoError(true)}
                        />
                    ) : settings.dashboardBackgroundType === 'image' && settings.dashboardImageUrl ? (
                        <div 
                            className="w-full h-full bg-cover bg-center grayscale brightness-[0.6] contrast-125 opacity-30 transition-opacity duration-1000"
                            style={{ 
                                backgroundImage: `url(${settings.dashboardImageUrl})`,
                                filter: 'grayscale(1) brightness(0.6) contrast(1.1)' 
                            }}
                        />
                    ) : (
                        <div className="w-full h-full bg-transparent"></div>
                    )}
                    <div className="absolute inset-0 bg-grid-texture opacity-[0.03] z-10"></div>
                </div>
            )}

            {/* Don't show idle overlay on the assistant screen — the
                assistant page manages its own full-screen state and should
                never be interrupted by the idle timer. */}
            {activeTab !== 'assistant' && (
                <IdleOverlay isVisible={isIdle} onInteraction={handleIdleInteraction} />
            )}

            {!isInitialized ? (
                !isLoading ? (
                    <div className="flex-1 flex flex-col items-center justify-center bg-transparent rounded">
                        <div className="text-center space-y-4 max-w-md px-6">
                            <h2 className="text-2xl font-black uppercase tracking-tighter">System Offline</h2>
                            <p className="text-xs font-mono opacity-40 uppercase tracking-widest">Initialization failed or interrupted</p>

                            <div className="flex flex-col gap-3 pt-4">
                                <button
                                    onClick={() => {
                                        hasInitializedRef.current = false;
                                        initializeApp(); 
                                    }}
                                    className="form-btn form-btn-primary h-10"
                                >
                                    Retry Initialization
                                </button>

                                <button
                                    onClick={() => window.location.reload()}
                                    className="form-btn h-10 opacity-60"
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
                                    className="form-btn h-8 opacity-60 hover:opacity-100 text-error"
                                >
                                    Reset Storage Config
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null
            ) : (
                <>
                    <div
                        ref={apertureRef}
                        className="fixed inset-4 md:inset-6 z-[900] pointer-events-none"
                        style={{ visibility: 'hidden' }}
                    >
                        <div ref={blindsRef} className="absolute inset-0 flex flex-row">
                            {Array.from({ length: 12 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="flex-1 bg-base-100/80 backdrop-blur-md will-change-transform z-50"
                                /> 
                            ))}
                        </div>
                    </div>

                    <div
                        ref={appWrapperRef}
                        className="w-full h-full flex flex-col overflow-hidden relative z-0 bg-transparent rounded-none p-4 md:p-6"
                    >
                        <div className="app-header flex-shrink-0">
                            <Header
                                onNavigate={handleNavigate}
                                activeTab={activeTab}
                                isInitialized={isInitialized}
                                onAboutClick={handleAboutClick}
                                onToggleClippingPanel={handleToggleClippingPanel}
                                onToggleMediaPanel={handleToggleMediaPanel}
                                onToggleChatPanel={handleToggleChatPanel}
                                onToggleWebViewer={handleToggleWebViewer}
                                onToggleActivityPanel={handleToggleActivityPanel}
                                onStandbyClick={goIdle}
                                clippedIdeasCount={clippedIdeas.length + notesCount + filesCount}
                            />
                        </div>

                        <div className={`flex-1 flex flex-col overflow-hidden relative ${activeTab === 'prompts' ? 'pt-0' : 'pt-0'} p-0 bg-transparent min-h-0 gap-0`}>
                            <main className="flex-grow min-w-0 relative overflow-hidden rounded-none bg-transparent border-none shadow-none backdrop-blur-none z-10 py-6 px-7">
                                {/* Context Shift Engine — futuristic OS transition overlay */}
                                <TransitionOverlay ref={transitionOverlayHandleRef} />

                                <div ref={contentRef} className="h-full w-full z-10 relative">
                                    <AnimatePresence mode="wait" custom={pageFxKind}>
                                        <motion.div
                                            key={['crafter', 'refiner', 'prompt_analyzer', 'media_analyzer', 'prompts'].includes(activeTab) ? 'prompts_group' : activeTab}
                                            custom={pageFxKind}
                                            variants={shellVariants}
                                            initial="hidden"
                                            animate="visible"
                                            exit="exit"
                                            className="h-full w-full"
                                        >
                                            {renderContent()}
                                        </motion.div>
                                    </AnimatePresence>

                                    <ClippingPanel
                                        isOpen={isClippingPanelOpen}
                                        onClose={handleCloseClippingPanel}
                                        clippedIdeas={clippedIdeas}
                                        onRemoveIdea={handleRemoveIdea}
                                        onClearAll={handleClearAllIdeas}
                                        onInsertIdea={handleInsertIdea}
                                        onRefineIdea={handleRefineIdea}
                                        onAddIdea={handleClipIdea}
                                        onSaveToLibrary={handleSaveClippedIdea}
                                    />

                                    <LlmStatusPanel
                                        isOpen={isLlmPanelOpen}
                                        onClose={handleCloseLlmStatus}
                                    />

                                    <LLMChatPanel
                                        isOpen={isChatPanelOpen}
                                        onClose={handleCloseChatPanel}
                                    />

                                    <MediaPanel
                                        isOpen={isMediaPanelOpen}
                                        onClose={handleCloseMediaPanel}
                                    />

                                    <WebViewerPanel
                                        isOpen={isWebViewerOpen}
                                        onClose={handleCloseWebViewer}
                                    />

                                    <VideoPlayerOverlay
                                        url={videoPlayerUrl}
                                        onClose={handleCloseVideoPlayer}
                                    />

                                    <ActivityPanel
                                        isOpen={isActivityPanelOpen}
                                        onClose={handleCloseActivityPanel}
                                    />
                                </div>
                            </main>

                            <div className="app-footer flex-shrink-0">
                                <Footer
                                    audioEnabled={audioEnabled}
                                    onAudioToggle={handleAudioToggle}
                                    playerState={playerState}
                                    onMusicToggle={handleMusicToggle}
                                    themeMode={settings.activeThemeMode}
                                    onToggleLlmPanel={handleToggleLlmPanel}
                                    isLlmPanelOpen={isLlmPanelOpen}
                                />
                            </div>
                        </div>
                    </div>
                </>
            )}

            <CommandPalette
                isOpen={isCommandPaletteOpen}
                onClose={() => setIsCommandPaletteOpen(false)}
            />

            <AboutModal
                isOpen={isAboutModalOpen}
                onClose={handleCloseAboutModal}
            />

            {globalFeedback && (
                <FeedbackToast
                    isOpen={!!globalFeedback}
                    onClose={handleCloseFeedback}
                    message={globalFeedback.message}
                    type={globalFeedback.type}
                />
            )}
            <TabTitleManager defaultTitle={currentTitle} />
            <CustomCursor />
            <LiveCaptionOverlay hidden={activeTab === 'assistant'} />
            <ScreenControlOverlay />
            {isInitialized && (
                <PageFrame
                    isInitialized={isInitialized}
                    frameWrapperRef={frameWrapperRef}
                    scanTopRef={scanTopRef}
                    scanRightRef={scanRightRef}
                    scanBottomRef={scanBottomRef}
                    scanLeftRef={scanLeftRef}
                />
            )}

            {/* Hidden Audio Engine */}
            <div className="fixed top-0 left-0 w-1 h-1 pointer-events-none opacity-[0.001] z-[-1] overflow-hidden">
                {isUplinkActive && videoId && (
                    <iframe
                        src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=0&controls=0&modestbranding=1&loop=1&playlist=${videoId}`}
                        title="Hidden Audio Engine"
                        frameBorder="0"
                        allow="autoplay; encrypted-media"
                        /* @ts-ignore */
                        credentialless="true"
                        referrerPolicy="no-referrer-when-downgrade"
                    />
                )}
            </div>
        </div>
        </LiveAssistantProvider>
    );
};

export default App;