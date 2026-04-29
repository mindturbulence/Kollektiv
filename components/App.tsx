
import React, { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from 'react';
import { gsap } from 'gsap';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import useLocalStorage from '../utils/useLocalStorage';
import { fileSystemManager } from '../utils/fileUtils';
import { verifyAndRepairFiles } from '../utils/integrity';
import { addSavedPrompt } from '../utils/promptStorage';
import { audioService } from '../services/audioService';
import { BusyProvider } from '../contexts/BusyContext';
import type { ActiveTab, Idea, ActiveSettingsTab } from '../types';

// Layout & Global Components
import Header from './Header';
import Welcome from './Welcome';
import CustomCursor from './CustomCursor';
import AboutModal from './AboutModal';
import ClippingPanel from './ClippingPanel';
import LlmStatusPanel from './LlmStatusPanel';
import FeedbackModal from './FeedbackModal';
import Footer from './Footer';
import IdleOverlay from './IdleOverlay';
import { TabTitleManager } from './TabTitleManager';

// Page components
import Dashboard from './Dashboard';
import DiscoveryPage from './DiscoveryPage';
import PromptsPage from './PromptsPage';
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
import { LLMChatPanel } from './LLMChatPanel';
import { motion, AnimatePresence } from 'framer-motion';
import { pageVariants } from './AnimatedPanels';
import ChromaticText from './ChromaticText';


type PromptsPageState = { prompt?: string, artStyle?: string, artist?: string, view?: 'enhancer' | 'composer' | 'create', id?: string } | null;

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

const InitialLoader: React.FC<{ status: string; progress: number | null; onContinue: (withMusic: boolean) => void }> = ({ status, progress, onContinue }) => {
    const textWrapperRef = useRef<HTMLHeadingElement>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const logRef = useRef(0);
    const percentage = Math.round((progress || 0) * 100);
    const displayPercentage = useRef(0);
    const [smoothPercentage, setSmoothPercentage] = useState(0);
    const [isComplete, setIsComplete] = useState(false);

    useEffect(() => {
        const target = percentage;
        const obj = { val: displayPercentage.current };
        gsap.to(obj, {
            val: target,
            duration: 1.2,
            ease: "power2.out",
            onUpdate: () => {
                displayPercentage.current = obj.val;
                setSmoothPercentage(Math.round(obj.val));
            }
        });
    }, [percentage]);

    const bootLogs = [
        '> BOOT_SEQUENCE_INIT...',
        '> KERNEL_LOAD...',
        '> MOUNT_VOLUMES...',
        '> INIT_DAEMONS...',
        '> SYNC_REGISTRIES...',
        '> VERIFY_INTEGRITY...',
        '> ACTIVATE_MODULES...',
        '> SYSTEM_ONLINE'
    ];

    useEffect(() => {
        if (percentage > 10 && logRef.current < bootLogs.length) {
            const interval = setInterval(() => {
                if (logRef.current < bootLogs.length) {
                    setLogs(prev => [...prev, bootLogs[logRef.current]]);
                    logRef.current++;
                }
            }, 300);
            return () => clearInterval(interval);
        }
    }, [percentage]);

    useLayoutEffect(() => {
        if (!textWrapperRef.current) return;
        gsap.fromTo(textWrapperRef.current,
            { yPercent: 100, autoAlpha: 0 },
            { yPercent: 0, autoAlpha: 1, duration: 1.5, ease: "expo.out" }
        );
    }, []);

    useEffect(() => {
        if (percentage >= 100 && smoothPercentage === 100) {
            setIsComplete(true);
        }
    }, [percentage, smoothPercentage]);

    const handleContinue = (withMusic: boolean) => {
        if (textWrapperRef.current) {
            gsap.to(textWrapperRef.current, {
                y: -80,
                autoAlpha: 0,
                duration: 0.8,
                ease: "expo.inOut",
                onComplete: () => {
                    onContinue(withMusic);
                }
            });
        } else {
            onContinue(withMusic);
        }
    };

    return (
        <div id="initial-loader" className="fixed inset-0 z-[500] flex flex-col items-center justify-center bg-base-100 text-base-content overflow-hidden select-none font-sans" style={{ background: 'oklch(var(--b1))', opacity: 1 }}>
            <div className="absolute inset-0 bg-grid-texture opacity-[0.03] pointer-events-none"></div>

            {/* Large Background Percentage (SR Seventy One Style) */}
            <div className={`absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden transition-opacity duration-1000 ${isComplete ? 'opacity-0' : 'opacity-100'}`}>
                <span
                    className="text-[25vw] font-normal opacity-[0.03] leading-none select-none font-monoton tracking-widest will-change-transform"
                    style={{ transform: `translateY(${(100 - smoothPercentage) * 0.2}px)` }}
                >
                    {smoothPercentage.toString().padStart(2, '0')}
                </span>
            </div>

            {/* Terminal Logs - Left Side */}
            <div className={`absolute left-16 md:left-24 top-1/2 -translate-y-1/2 flex flex-col gap-1 pointer-events-none z-10 transition-opacity duration-1000 ${isComplete ? 'opacity-0' : 'opacity-100'}`}>
                {logs.slice(-6).map((log, i) => (
                    <span key={i} className="text-[8px] font-mono tracking-widest text-primary/40 animate-fade-in">
                        {log}
                    </span>
                ))}
            </div>

            <div className="relative z-10 flex flex-col items-center">
                <div className="overflow-hidden mb-6 px-4">
                    <h1 ref={textWrapperRef} className="grid grid-cols-1 grid-rows-1 text-2xl md:text-4xl font-normal tracking-widest uppercase select-none items-center font-monoton leading-none translate-y-[2px]">
                        <span className="text-base-content/10 block leading-none py-2 row-start-1 col-start-1">
                            <ChromaticText enabled={false}>Kollektiv</ChromaticText><span className="text-primary/10 italic">.</span>
                        </span>

                        <div
                            className={`row-start-1 col-start-1 h-full overflow-hidden transition-all duration-700 ease-out border-base-content/20 ${isComplete ? 'border-r-0' : 'border-r'}`}
                            style={{ width: `${percentage}%` }}
                        >
                            <span className="text-base-content block whitespace-nowrap leading-none py-2 drop-shadow-[0_0_20px_rgba(var(--bc),0.15)]">
                                <ChromaticText>Kollektiv</ChromaticText><span className="text-primary italic">.</span>
                            </span>
                        </div>
                    </h1>
                </div>

                <div className="relative h-20 w-80">
                    {/* Progress Bar & Status - Crossfade out */}
                    <div className={`absolute inset-0 flex flex-col items-center gap-4 transition-all duration-1000 ${isComplete ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}>
                        <div className="flex flex-col items-center gap-2">
                            <p className="text-[10px] font-mono font-bold uppercase tracking-[0.5em] text-center text-base-content/40">
                                {(status || 'DIAGNOSTIC_ACTIVE').toUpperCase()}
                            </p>

                            {/* Minimal Progress Bar */}
                            <div className="w-32 h-[1px] bg-base-content/10 relative overflow-hidden">
                                <div
                                    className="absolute inset-y-0 left-0 bg-primary transition-all duration-500 ease-out"
                                    style={{ width: `${smoothPercentage}%` }}
                                />
                            </div>

                            <span className="text-[10px] font-mono font-bold text-primary/60">
                                {smoothPercentage}%
                            </span>
                        </div>
                    </div>

                    {/* Action Buttons - Crossfade in */}
                    <div className={`absolute inset-0 flex flex-col items-center gap-6 transition-all duration-1000 ${isComplete ? 'opacity-100 scale-100 pointer-events-auto delay-500' : 'opacity-0 scale-105 pointer-events-none'}`}>
                        <button
                            className="form-btn form-btn-primary w-48 h-10 text-[10px]"
                            onClick={() => handleContinue(true)}
                        >
                            CONTINUE
                        </button>
                        <button
                            className="text-xs font-rajdhani uppercase tracking-widest font-normal text-base-content/30 hover:text-base-content px-4 py-2 transition-colors bg-transparent hover:bg-transparent"
                            onClick={() => handleContinue(false)}
                        >
                            CONTINUE WITHOUT MUSIC
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

};

interface PageFrameProps {
    isInitialized: boolean;
    frameWrapperRef: React.RefObject<HTMLDivElement>;
    scanTopRef: React.RefObject<HTMLSpanElement>;
    scanRightRef: React.RefObject<HTMLSpanElement>;
    scanBottomRef: React.RefObject<HTMLSpanElement>;
    scanLeftRef: React.RefObject<HTMLSpanElement>;
}

const PageFrame: React.FC<PageFrameProps> = ({
    isInitialized,
    frameWrapperRef,
    scanTopRef,
    scanRightRef,
    scanBottomRef,
    scanLeftRef
}) => {
    useLayoutEffect(() => {
        if (!isInitialized || !frameWrapperRef.current) return;

        // Periodic Frame Scan Animation (Snake effect)
        // Triggered every 1 minute (60 seconds)
        const scanTl = gsap.timeline({
            repeat: -1,
            repeatDelay: 52, // exactly 1 minute cycle (60s total - 8s animation)
            delay: 15
        });

        const scanDuration = 2;
        const scanEase = "power1.inOut";

        if (scanTopRef.current && scanRightRef.current && scanBottomRef.current && scanLeftRef.current) {
            scanTl.set([scanTopRef.current, scanRightRef.current, scanBottomRef.current, scanLeftRef.current], { opacity: 0 });

            // Sequence: Top -> Right -> Bottom -> Left
            scanTl.fromTo(scanTopRef.current,
                { left: "-100%", opacity: 0 },
                { left: "100%", opacity: 1, duration: scanDuration, ease: scanEase }
            ).set(scanTopRef.current, { opacity: 0 });

            scanTl.fromTo(scanRightRef.current,
                { top: "-100%", opacity: 0 },
                { top: "100%", opacity: 1, duration: scanDuration, ease: scanEase }
            ).set(scanRightRef.current, { opacity: 0 });

            scanTl.fromTo(scanBottomRef.current,
                { right: "-100%", opacity: 0 },
                { right: "100%", opacity: 1, duration: scanDuration, ease: scanEase }
            ).set(scanBottomRef.current, { opacity: 0 });

            scanTl.fromTo(scanLeftRef.current,
                { bottom: "-100%", opacity: 0 },
                { bottom: "100%", opacity: 1, duration: scanDuration, ease: scanEase }
            ).set(scanLeftRef.current, { opacity: 0 });
        }

        return () => {
            scanTl.kill();
        };
    }, [isInitialized, frameWrapperRef, scanTopRef, scanRightRef, scanBottomRef, scanLeftRef]);

    return (
        <div ref={frameWrapperRef} className="fixed inset-0 z-[1000] pointer-events-none p-4 md:p-6">
            <div className="w-full h-full border border-base-content/5 relative main-app-frame">
                {/* Dedicated Clipping Container for Scan Lines */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                    <span ref={scanTopRef} className="absolute top-0 left-[-100%] w-full h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent z-10 opacity-0" />
                    <span ref={scanRightRef} className="absolute top-[-100%] right-0 w-[2px] h-full bg-gradient-to-b from-transparent via-primary to-transparent z-10 opacity-0" />
                    <span ref={scanBottomRef} className="absolute bottom-0 right-[-100%] w-full h-[2px] bg-gradient-to-l from-transparent via-primary to-transparent z-10 opacity-0" />
                    <span ref={scanLeftRef} className="absolute bottom-[-100%] left-0 w-[2px] h-full bg-gradient-to-t from-transparent via-primary to-transparent z-10 opacity-0" />
                </div>

                {/* Corner Accents */}
                <div className="absolute -top-[1px] -left-[1px] w-4 h-4 border-t border-l border-primary/20 corner-accent" />
                <div className="absolute -top-[1px] -right-[1px] w-4 h-4 border-t border-r border-primary/20 corner-accent" />
                <div className="absolute -bottom-[1px] -left-[1px] w-4 h-4 border-b border-l border-primary/20 corner-accent" />
                <div className="absolute -bottom-[1px] -right-[1px] w-4 h-4 border-b border-r border-primary/20 corner-accent" />

                {/* Side Markers */}
                <div className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-2 side-marker">
                    <div className="w-[1px] h-4 bg-primary/10" />
                    <div className="w-[1px] h-[1px] bg-primary/20" />
                    <div className="w-[1px] h-4 bg-primary/10" />
                </div>

                <div className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 flex flex-col gap-2 side-marker">
                    <div className="w-[1px] h-4 bg-primary/10" />
                    <div className="w-[1px] h-[1px] bg-primary/20" />
                    <div className="w-[1px] h-4 bg-primary/10" />
                </div>
            </div>
        </div>
    );
};

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
    const [isInitialized, setIsInitialized] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [showWelcome, setShowWelcome] = useState(false);
    const [initStatus, setInitStatus] = useState('Starting App');
    const [initProgress, setInitProgress] = useState<number | null>(0);
    const [isIdle, setIsIdle] = useState(false);
    const [videoError, setVideoError] = useState(false);

    const hasInitializedRef = useRef(false);
    const isFirstRevealRef = useRef(true);

    // --- IDLE STATE REFS ---
    const idleTimerRef = useRef<number | null>(null);
    const isIdleRef = useRef(false);

    const { settings, updateSettings } = useSettings();
    const auth = useAuth();

    const [activeTab, setActiveTab] = useLocalStorage<ActiveTab>('activeTab', 'dashboard');
    const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
    const [isClippingPanelOpen, setIsClippingPanelOpen] = useState(false);
    const [isOpenClawOpen, setIsOpenClawOpen] = useState(false);
    const [isLlmPanelOpen, setIsLlmPanelOpen] = useState(false);
    const [collapsedPanels, setCollapsedPanels] = useLocalStorage<Record<string, boolean>>('collapsedPanels', {});
    const [globalFeedback, setGlobalFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const [promptsPageState, setPromptsPageState] = useState<PromptsPageState>(null);
    const [activeSettingsTab, setActiveSettingsTab] = useLocalStorage<ActiveSettingsTab>('activeSettingsTab', 'app');
    const [activeSettingsSubTab, setActiveSettingsSubTabSetter] = useLocalStorage<string>('activeSettingsSubTab', 'general');

    const [clippedIdeas, setClippedIdeas] = useLocalStorage<Idea[]>('clippedIdeas', []);

    const currentTitle = useMemo(() => {
        const base = "KOLLEKTIV";
        switch (activeTab) {
            case 'dashboard': return `DASHBOARD | ${base}`;
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
            case 'cheatsheet': return `CHEATSHEET | ${base}`;
            case 'artstyles': return `STYLES | ${base}`;
            case 'artists': return `ARTISTS | ${base}`;
            case 'image_compare': return `COMPARE | ${base}`;
            case 'color_palette_extractor': return `PALETTE | ${base}`;
            case 'resizer': return `RESIZER | ${base}`;
            case 'video_to_frames': return `VIDEO | ${base}`;
            default: return base;
        }
    }, [activeTab]);

    const transitionOverlayRef = useRef<HTMLDivElement>(null);
    const transitionLogoRef = useRef<HTMLDivElement>(null);
    const topOverlayPanelRef = useRef<HTMLDivElement>(null);
    const bottomOverlayPanelRef = useRef<HTMLDivElement>(null);
    const apertureRef = useRef<HTMLDivElement>(null);
    const blindsRef = useRef<HTMLDivElement>(null);
    const appWrapperRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const resetIdleTimer = useCallback((forceWake: boolean = true) => {
        if (forceWake && isIdleRef.current) {
            setIsIdle(false);
            isIdleRef.current = false;
        }

        if (idleTimerRef.current) {
            window.clearTimeout(idleTimerRef.current);
        }

        if (!settings.isIdleEnabled) return;

        idleTimerRef.current = window.setTimeout(() => {
            setIsIdle(true);
            isIdleRef.current = true;
        }, settings.idleTimeoutMinutes * 60000);
    }, [settings.isIdleEnabled, settings.idleTimeoutMinutes]);

    useEffect(() => {
        if (!settings.isIdleEnabled && isIdleRef.current) {
            setIsIdle(false);
            isIdleRef.current = false;
        }
        resetIdleTimer(false);
    }, [settings.isIdleEnabled, resetIdleTimer]);

    useEffect(() => {
        const handleUserActivity = () => {
            resetIdleTimer(true);
            // One-time audio unlock
            audioService.resume();
        };
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

    const frameWrapperRef = useRef<HTMLDivElement>(null);
    const scanTopRef = useRef<HTMLSpanElement>(null);
    const scanRightRef = useRef<HTMLSpanElement>(null);
    const scanBottomRef = useRef<HTMLSpanElement>(null);
    const scanLeftRef = useRef<HTMLSpanElement>(null);

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
            const hasHandleAndPermission = await (fileSystemManager as any).initialize(settings, auth);

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

            // Wait for user to interact with the continue buttons exposed by InitialLoader.
            // The InitialLoader component will call handleInitContinue.
        } catch (err) {
            console.error("Initialization Failure:", err);
            hasInitializedRef.current = true; // Mark as "attempted" to prevent loop
            const errorMsg = err instanceof Error ? err.message : String(err);
            setGlobalFeedback({ message: `System error: ${errorMsg}`, type: 'error' });
            setIsLoading(false);
        }
        // Removed settings dependency to prevent re-init on theme switch
        // settings are only needed for initial storage handle check
    }, [auth, isInitialized]);

    const handleInitContinue = useCallback(async (withMusic: boolean) => {
        // ALWAYS enable audio system for SFX
        audioService.enable();
        setAudioEnabled(true);

        if (!withMusic) {
            updateSettings({ ...settings, musicEnabled: false });
            setIsUplinkActive(false);
            setPlayerState('idle');
        } else {
            updateSettings({ ...settings, musicEnabled: true });
            audioService.playAppStart();
            setIsUplinkActive(true);
            setPlayerState('syncing');
            // Ambient start is handled by the syncing -> playing effect
        }

        hasInitializedRef.current = true;
        setIsInitialized(true);

        // Wait briefly for isInitialized to propagate before starting reveal
        await new Promise(r => setTimeout(r, 100));
        setIsLoading(false);
    }, [settings, updateSettings]);

    useEffect(() => {
        if (!hasInitializedRef.current) {
            initializeApp();
        }
    }, [initializeApp]);

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

            // Initial State: Frame slightly scaled up, layout items hidden
            gsap.set(apertureRef.current, { visibility: 'visible', autoAlpha: 1 });
            gsap.set(appWrapperRef.current, { autoAlpha: 1 }); // Outer wrapper visible
            gsap.set(contentRef.current, { autoAlpha: 0 }); // Inner content hidden
            gsap.set(['.app-header', '.app-footer'], { opacity: 0 });

            blindItems.forEach((item, i) => {
                gsap.set(item, {
                    scaleY: 1,
                    scaleX: 1,
                    transformOrigin: i % 2 === 0 ? "top" : "bottom"
                });
            });

            // STEP 1: Main Frame Scale In
            if (frame) {
                tl.fromTo(frame,
                    { scale: 1.04, autoAlpha: 1 },
                    { scale: 1, duration: 2.0, ease: "expo.out" }
                );

                if (corners && corners.length > 0) {
                    tl.fromTo(corners,
                        {
                            opacity: 0,
                            x: (i) => (i % 2 === 0 ? -40 : 40),
                            y: (i) => (i < 2 ? -40 : 40)
                        },
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

            // STEP 2: Blinds animation (After frame is mostly settled)
            tl.to(blindItems, {
                scaleY: 0,
                duration: 1.6,
                stagger: {
                    each: 0.08,
                    from: "start"
                },
                ease: "expo.inOut"
            }, ">-0.5");

            // STEP 3: App Header and Footer reveal
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

            // STEP 4: Reveal main content
            tl.to(contentRef.current, {
                autoAlpha: 1,
                duration: 0.8,
                ease: "power2.out"
            }, ">-0.3");

            tl.set(apertureRef.current, { visibility: 'hidden', autoAlpha: 0 });
        });

        return () => ctx.revert();
    }, [isInitialized]);


    const handleNavigate = (tab: ActiveTab) => {
        if (tab === activeTab) return;
        audioService.playTransition();
        setActiveTab(tab);
    };

    useEffect(() => {
        const currentTheme = settings.darkTheme;
        document.documentElement.setAttribute('data-theme', currentTheme);
        document.documentElement.style.fontSize = `${settings.fontSize}px`;
    }, [settings.darkTheme, settings.fontSize]);

    const { features } = settings;
    useEffect(() => {
        let isTabAllowed = true;
        switch (activeTab) {
            case 'prompts':
            case 'crafter':
            case 'refiner':
            case 'prompt_analyzer':
            case 'media_analyzer': isTabAllowed = true; break;
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

    const showGlobalFeedback = useCallback((message: string, isError = false) => {
        setGlobalFeedback({ message, type: isError ? 'error' : 'success' });
    }, []);

    const handleSendToPromptsPage = useCallback((state: PromptsPageState) => {
        setPromptsPageState(state);

        // Map internal views to top-level navigation tabs
        let targetTab: ActiveTab = 'crafter';
        if (state?.view === 'enhancer') {
            targetTab = 'refiner';
        } else if (state?.view === 'composer' || state?.view === 'create') {
            targetTab = 'crafter';
        } else {
            // Fallback to generic prompts tab if needed, 
            // but user wants them separate so we prefer the specific ones
            targetTab = 'crafter';
        }

        handleNavigate(targetTab);
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
                setCollapsedPanels(p => ({ ...p, [activeTab]: !p[activeTab] }));
            },
        };

        switch (activeTab) {
            case 'dashboard': return <Dashboard key="dashboard" onNavigate={handleNavigate} onClipIdea={handleClipIdea} isExiting={false} />;
            case 'discovery': return <DiscoveryPage key="discovery" isExiting={false} onClipIdea={handleClipIdea} onSendToBuilder={handleSendToPromptsPage} showGlobalFeedback={showGlobalFeedback} />;
            case 'prompts': return <PromptsPage key="prompts" onClipIdea={handleClipIdea} initialState={promptsPageState} onStateHandled={() => setPromptsPageState(null)} showGlobalFeedback={showGlobalFeedback} isExiting={false} />;
            case 'crafter': return <PromptsPage key="crafter" forcedView="composer" onClipIdea={handleClipIdea} initialState={promptsPageState} onStateHandled={() => setPromptsPageState(null)} showGlobalFeedback={showGlobalFeedback} isExiting={false} />;
            case 'refiner': return <PromptsPage key="refiner" forcedView="refine" onClipIdea={handleClipIdea} initialState={promptsPageState} onStateHandled={() => setPromptsPageState(null)} showGlobalFeedback={showGlobalFeedback} isExiting={false} />;
            case 'prompt_analyzer': return <PromptsPage key="prompt_analyzer" forcedView="prompt_analyzer" onClipIdea={handleClipIdea} initialState={promptsPageState} onStateHandled={() => setPromptsPageState(null)} showGlobalFeedback={showGlobalFeedback} isExiting={false} />;
            case 'media_analyzer': return <PromptsPage key="media_analyzer" forcedView="analyzer" onClipIdea={handleClipIdea} initialState={promptsPageState} onStateHandled={() => setPromptsPageState(null)} showGlobalFeedback={showGlobalFeedback} isExiting={false} />;
            case 'prompt': return <SavedPrompts key="prompt" {...categoryPanelProps} onSendToEnhancer={(prompt) => handleSendToPromptsPage({ prompt, view: 'enhancer' })} showGlobalFeedback={showGlobalFeedback} onClipIdea={handleClipIdea} isExiting={false} />;
            case 'gallery': return <ImageGallery key="gallery" {...categoryPanelProps} isSidebarPinned={false} showGlobalFeedback={showGlobalFeedback} isExiting={false} />;
            case 'cheatsheet': return <Cheatsheet key="cheatsheet" isExiting={false} />;
            case 'artstyles': return <ArtstyleCheatsheet key="artstyles" onSendToPromptsPage={(state) => handleSendToPromptsPage({ ...state, view: 'enhancer' })} isExiting={false} />;
            case 'artists': return <ArtistCheatsheet key="artists" onSendToPromptsPage={(state) => handleSendToPromptsPage({ ...state, view: 'enhancer' })} isExiting={false} />;
            case 'settings': return <SetupPage key="settings" activeSettingsTab={activeSettingsTab} setActiveSettingsTab={setActiveSettingsTab} activeSubTab={activeSettingsSubTab} setActiveSubTab={setActiveSettingsSubTabSetter} showGlobalFeedback={showGlobalFeedback} isExiting={false} />;
            case 'composer': return <ComposerPage key="composer" showGlobalFeedback={showGlobalFeedback} isExiting={false} />;
            case 'image_compare': return <ImageCompare key="image_compare" isExiting={false} />;
            case 'color_palette_extractor': return <ColorPaletteExtractor key="color_palette_extractor" onClipIdea={handleClipIdea} isExiting={false} />;
            case 'resizer': return <ImageResizer key="resizer" isExiting={false} />;
            case 'video_to_frames': return <VideoToFrames key="video_to_frames" isExiting={false} />;
            default: return <Dashboard key="default" onNavigate={handleNavigate} onClipIdea={handleClipIdea} isExiting={false} />;
        }
    };

    const [isUplinkActive, setIsUplinkActive] = useState(false);
    const [playerState, setPlayerState] = useState<'idle' | 'syncing' | 'playing' | 'error'>('idle');
    const [audioEnabled, setAudioEnabled] = useState(true); // Default to true

    useEffect(() => {
        if (audioEnabled) {
            audioService.enable();
        } else {
            audioService.disable();
        }
    }, [audioEnabled]);

    const extractVideoId = useCallback((url: string) => {
        if (!url) return null;
        const regExp = /^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/|shorts\/)|(?:(?:watch)?\?v(?:i)?=|\&v(?:i)?=))([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[1].length === 11) ? match[1] : null;
    }, []);

    const videoId = useMemo(() => extractVideoId(settings.musicYoutubeUrl), [settings.musicYoutubeUrl, extractVideoId]);

    useEffect(() => {
        if (isUplinkActive && playerState === 'syncing' && videoId) {
            const timer = setTimeout(() => {
                setPlayerState('playing');
                if (audioEnabled && settings.musicEnabled) {
                    audioService.startAmbient(0.3);
                }
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [videoId, isUplinkActive, playerState, audioEnabled, settings.musicEnabled]);

    const handleMusicToggle = useCallback(() => {
        if (!videoId) {
            setPlayerState('error');
            return;
        }

        audioService.playClick();

        if (isUplinkActive) {
            setIsUplinkActive(false);
            setPlayerState('idle');
            audioService.stopAmbient();
            updateSettings({ ...settings, musicEnabled: false });
        } else {
            setPlayerState('syncing');
            setIsUplinkActive(true);
            updateSettings({ ...settings, musicEnabled: true });
            setTimeout(() => {
                setPlayerState('playing');
                if (audioEnabled && settings.musicEnabled) {
                    audioService.startAmbient(0.3);
                }
            }, 2500);
        }
    }, [videoId, isUplinkActive, audioEnabled, settings, updateSettings]);

    const loaderRef = useRef<HTMLDivElement>(null);

    const handleAudioToggle = useCallback(() => {
        audioService.playClick();
        const newState = audioService.toggle();
        setAudioEnabled(newState);
        updateSettings({ ...settings, musicEnabled: newState });
    }, [settings, updateSettings]);

    const handleStandbyClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        audioService.playClick();
        setIsIdle(true);
        isIdleRef.current = true;
    };

    if (showWelcome) return <Welcome onSetupComplete={initializeApp} />;

    return (
        <div className="h-full w-full overflow-hidden relative font-sans">
            {isLoading && (
                <div ref={loaderRef} className="fixed inset-0 z-[1000]">
                    <InitialLoader status={initStatus} progress={initProgress} onContinue={handleInitContinue} />
                </div>
            )}
            {/* AMBIENT VIDEO BACKGROUND */}
            {isInitialized && (
                <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                    {!videoError && settings.dashboardVideoUrl && settings.isDashboardVideoEnabled ? (
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
                    ) : (
                        <div className="w-full h-full bg-transparent"></div>
                    )}
                    <div className="absolute inset-0 bg-grid-texture opacity-[0.03] z-10"></div>
                </div>
            )}

            <IdleOverlay isVisible={isIdle} onInteraction={() => resetIdleTimer(true)} />

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
                                    className="flex-1 bg-base-100/80 backdrop-blur-xl will-change-transform"
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
                                onAboutClick={() => setIsAboutModalOpen(true)}
                                onToggleClippingPanel={() => setIsClippingPanelOpen(!isClippingPanelOpen)}
                                onToggleOpenClaw={() => setIsOpenClawOpen(!isOpenClawOpen)}
                                onStandbyClick={handleStandbyClick}
                                clippedIdeasCount={clippedIdeas.length}
                            />
                        </div>

                        <div className={`flex-1 flex flex-col overflow-hidden relative ${activeTab === 'prompts' ? 'pt-0' : 'pt-0'} p-0 bg-transparent min-h-0 gap-0`}>
                            <main className="flex-grow min-w-0 relative overflow-hidden rounded-none bg-transparent border-none shadow-none backdrop-blur-none z-10 py-6 px-7">
                                {/* Cinematic Transition Overlay (Tesoro Style) */}
                                <div
                                    ref={transitionOverlayRef}
                                    className="absolute inset-0 z-[1000] pointer-events-none flex flex-col overflow-hidden"
                                    style={{ visibility: 'hidden' }}
                                >
                                    <div
                                        ref={topOverlayPanelRef}
                                        className="bg-base-100/98 flex-1 w-full h-0"
                                        style={{ height: '0%' }}
                                    />
                                    <div
                                        ref={bottomOverlayPanelRef}
                                        className="bg-base-100/98 flex-1 w-full h-0"
                                        style={{ height: '0%' }}
                                    />
                                    <div
                                        ref={transitionLogoRef}
                                        className="absolute top-1/2 left-1/2 opacity-0 scale-90"
                                    >
                                        <h1 className="text-3xl md:text-5xl font-normal tracking-[0.4em] text-base-content uppercase font-monoton whitespace-nowrap">
                                            <ChromaticText>Kollektiv</ChromaticText><span className="text-primary italic">.</span>
                                        </h1>
                                    </div>
                                </div>

                                <div ref={contentRef} className="h-full w-full z-10 relative">
                                    <AnimatePresence mode="wait">
                                        <motion.div
                                            key={activeTab}
                                            variants={pageVariants}
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
                                        onClose={() => setIsClippingPanelOpen(false)}
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
                                        onClose={() => setIsLlmPanelOpen(false)}
                                    />

                                    <LLMChatPanel
                                        isOpen={isOpenClawOpen}
                                        onClose={() => setIsOpenClawOpen(false)}
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
                                    onToggleLlmPanel={() => {
                                        audioService.playClick();
                                        setIsLlmPanelOpen(!isLlmPanelOpen)
                                    }}
                                    isLlmPanelOpen={isLlmPanelOpen}
                                />
                            </div>
                        </div>
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
            <TabTitleManager defaultTitle={currentTitle} />
            <CustomCursor />
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
    );
};

export default App;
