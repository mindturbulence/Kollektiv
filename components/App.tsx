
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
import FeedbackModal from './FeedbackModal';
import Footer from './Footer';
import IdleOverlay from './IdleOverlay'; 
import LlmStatusSwitcher from './LlmStatusSwitcher';

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
                <div className="h-screen w-screen flex flex-col items-center justify-center bg-base-100 p-5 text-center">
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
    const [logs, setLogs] = useState<string[]>([]);
    const logRef = useRef(0);
    const percentage = Math.round((progress || 0) * 100);
    const displayPercentage = useRef(0);
    const [smoothPercentage, setSmoothPercentage] = useState(0);

    useEffect(() => {
        const target = percentage;
        const obj = { val: displayPercentage.current };
        gsap.to(obj, {
            val: target,
            duration: 0.8,
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
            }, 200);
            return () => clearInterval(interval);
        }
    }, [percentage]);

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
        <div id="initial-loader" className="fixed inset-0 z-[500] flex flex-col items-center justify-center bg-base-100 text-base-content overflow-hidden select-none font-sans">
            <div className="absolute inset-0 bg-grid-texture opacity-[0.03] pointer-events-none"></div>
            
            {/* Large Background Percentage (SR Seventy One Style) */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                <span 
                    className="text-[25vw] font-black opacity-[0.03] leading-none select-none font-display will-change-transform"
                    style={{ transform: `translateY(${(100 - smoothPercentage) * 0.2}px)` }}
                >
                    {smoothPercentage.toString().padStart(2, '0')}
                </span>
            </div>

            {/* Terminal Logs - Left Side */}
            <div className="absolute left-16 md:left-24 top-1/2 -translate-y-1/2 flex flex-col gap-1 pointer-events-none z-10">
                {logs.slice(-6).map((log, i) => (
                    <span key={i} className="text-[8px] font-mono tracking-widest text-primary/40 animate-fade-in">
                        {log}
                    </span>
                ))}
            </div>

            <div className="relative z-10 flex flex-col items-center">
                <div className="overflow-hidden mb-6 px-4">
                    <h1 ref={textWrapperRef} className="grid grid-cols-1 grid-rows-1 text-2xl md:text-4xl font-black tracking-tighter uppercase select-none items-center font-logo">
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

                <div className={`flex flex-col items-center gap-4 transition-all duration-500 ${percentage >= 100 ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'}`}>
                    <div className="flex flex-col items-center gap-2">
                        <p className="text-[10px] font-mono font-bold uppercase tracking-[0.5em] text-center text-base-content/40">
                            {status.toUpperCase()}
                        </p>
                        
                        {/* Minimal Progress Bar */}
                        <div className="w-32 h-[1px] bg-base-content/10 relative overflow-hidden">
                            <div 
                                className="absolute inset-y-0 left-0 bg-primary transition-all duration-500 ease-out"
                                style={{ width: `${percentage}%` }}
                            />
                        </div>
                        
                        <span className="text-[10px] font-mono font-bold text-primary/60">
                            {percentage}%
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );

};

import { motion, AnimatePresence } from 'framer-motion';
import RollingText from './RollingText';
import TimedScrambledText from './TimedScrambledText';
import ThemeSwitcher from './ThemeSwitcher';

const Logo: React.FC<{ onNavigate: (tab: ActiveTab) => void }> = ({ onNavigate }) => {
    const [scrambleTrigger, setScrambleTrigger] = useState(0);

    return (
        <button 
            onClick={() => {
                audioService.playClick();
                onNavigate('dashboard');
            }}
            onMouseEnter={() => {
                audioService.playHover();
                setScrambleTrigger(prev => prev + 1);
            }}
            className="flex items-center gap-2 group pointer-events-auto"
        >
            <h1 className="text-3xl font-black tracking-tighter text-base-content uppercase flex items-center font-logo">
                <span className="font-black">
                    <TimedScrambledText text="Kollektiv" intervalMs={300000} trigger={scrambleTrigger} />
                </span>
                <span className="text-primary italic animate-pulse drop-shadow-[0_0_10px_oklch(var(--p))] transition-all inline-block ml-0.5 font-black">.</span>
            </h1>
        </button>
    );
};

const DigitalOscillator = ({ state = 'idle', theme = 'light' }: { state: string, theme?: 'light' | 'dark' }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number>(0);
    const phaseRef = useRef<number>(0);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const draw = () => {
            const w = canvas.width;
            const h = canvas.height;
            const centerY = h / 2;

            ctx.clearRect(0, 0, w, h);

            const color = '#ffffff';

            phaseRef.current += 0.05;
            const p = phaseRef.current;

            const layers = [
                { amp: 0.2, freq: 0.05, speed: 1.0, opacity: state === 'idle' ? 0.3 : 0.1 },
                { amp: 0.4, freq: 0.08, speed: 1.5, opacity: state === 'idle' ? 0.5 : 0.3 },
                { amp: 0.6, freq: 0.12, speed: 2.0, opacity: state === 'idle' ? 1.0 : 0.8 }
            ];

            layers.forEach((layer, i) => {
                ctx.beginPath();
                ctx.strokeStyle = color;
                ctx.lineWidth = i === 2 ? 1.5 : 1;
                ctx.globalAlpha = layer.opacity;

                if (state === 'error') {
                    ctx.strokeStyle = 'red';
                    ctx.globalAlpha = Math.random() > 0.8 ? 0.8 : 0.2;
                }

                for (let x = 0; x < w; x++) {
                    let y = centerY;
                    if (state === 'playing') {
                        const noise = Math.sin(p * layer.speed + x * layer.freq) *
                            Math.cos(p * 0.5 + x * 0.02);
                        const spikes = Math.random() > 0.98 ? (Math.random() - 0.5) * 20 : 0;
                        y += (noise * (h * 0.4) * layer.amp) + spikes;
                    } else if (state === 'syncing') {
                        y += (Math.random() - 0.5) * (h * 0.8);
                    } else if (state === 'idle') {
                        // Flat line when idle
                        y = centerY;
                    } else if (state === 'error') {
                        y += (Math.random() - 0.5) * 2;
                    }

                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            });

            animationRef.current = requestAnimationFrame(draw);
        };

        draw();
        return () => cancelAnimationFrame(animationRef.current);
    }, [state, theme]);

    return (
        <canvas
            ref={canvasRef}
            width={120}
            height={40}
            className="w-8 h-3 opacity-60"
        />
    );
};

const HUDNavItem: React.FC<{
  children: string;
  onClick?: (e: React.MouseEvent) => void;
  onHover?: () => void;
  title?: string;
  badge?: number;
}> = ({ children, onClick, onHover, title, badge }) => {
  return (
    <motion.button
      onClick={onClick}
      onMouseEnter={() => {
          audioService.playHover();
          onHover?.();
      }}
      initial="initial"
      whileHover="hover"
      className="group relative px-3 py-1 text-[10px] font-black tracking-[0.4em] uppercase text-base-content/60 hover:text-primary transition-colors duration-300 pointer-events-auto"
      title={title}
    >
      <RollingText 
        text={children} 
        hoverClassName="text-primary"
      />
      
      {badge !== undefined && badge > 0 && (
        <span className="absolute top-0 right-0 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-none bg-primary opacity-75"></span>
          <span className="relative inline-flex rounded-none h-2 w-2 bg-primary"></span>
        </span>
      )}
    </motion.button>
  );
};

interface PageFrameProps {
    audioEnabled: boolean;
    onAudioToggle: () => void;
    playerState: 'idle' | 'syncing' | 'playing' | 'error';
    onMusicToggle: () => void;
    themeMode: 'light' | 'dark';
    onNavigate: (tab: ActiveTab) => void;
    onAboutClick: () => void;
    onToggleClippingPanel: () => void;
    onStandbyClick: (e: React.MouseEvent) => void;
    clippedIdeasCount: number;
    isInitialized: boolean;
}

const PageFrame: React.FC<PageFrameProps> = ({ 
    audioEnabled, 
    onAudioToggle, 
    playerState, 
    onMusicToggle, 
    themeMode,
    onNavigate,
    onAboutClick,
    onToggleClippingPanel,
    onStandbyClick,
    clippedIdeasCount,
    isInitialized
}) => {
    const topRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const logoRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (!isInitialized) return;

        const tl = gsap.timeline({ delay: 2.2 }); // Start after blinds

        gsap.set([topRef.current, logoRef.current], { yPercent: -50, y: -20, autoAlpha: 0 });
        gsap.set(bottomRef.current, { yPercent: 50, y: 20, autoAlpha: 0 });

        tl.to([topRef.current, logoRef.current], {
            y: 0,
            autoAlpha: 1,
            duration: 1.2,
            ease: "power3.out",
            stagger: 0.1
        });

        tl.to(bottomRef.current, {
            y: 0,
            autoAlpha: 1,
            duration: 1.2,
            ease: "power3.out"
        }, "-=0.8");

    }, [isInitialized]);

    return (
        <div className="fixed inset-0 z-[1000] pointer-events-none p-4 md:p-10">
            <div className="w-full h-full border border-base-content/5 relative">
                {/* Corner Accents */}
                <div className="absolute -top-[1px] -left-[1px] w-4 h-4 border-t border-l border-primary/20" />
                <div className="absolute -top-[1px] -right-[1px] w-4 h-4 border-t border-r border-primary/20" />
                <div className="absolute -bottom-[1px] -left-[1px] w-4 h-4 border-b border-l border-primary/20" />
                <div className="absolute -bottom-[1px] -right-[1px] w-4 h-4 border-b border-r border-primary/20" />
                
                {/* Technical Labels - Top (Relocated Header Menus) */}
                <div ref={topRef} className="absolute top-0 left-12 right-12 flex justify-between items-center pointer-events-auto opacity-0">
                    <div className="flex gap-1 items-center">
                        <HUDNavItem
                            onClick={() => {
                                audioService.playClick();
                                onNavigate('dashboard');
                            }}
                        >
                            HOME
                        </HUDNavItem>
                        <div className="w-px h-3 bg-base-content/10" />
                        <HUDNavItem
                            onClick={() => {
                                audioService.playClick();
                                onAboutClick();
                            }}
                        >
                            ABOUT
                        </HUDNavItem>
                        <div className="w-px h-3 bg-base-content/10" />
                        <div className="flex items-center">
                            <ThemeSwitcher compact />
                        </div>
                    </div>

                    <div className="flex gap-1 items-center">
                        <HUDNavItem
                            onClick={() => {
                                audioService.playClick();
                                onToggleClippingPanel();
                            }}
                            badge={clippedIdeasCount}
                        >
                            CLIPBOARD
                        </HUDNavItem>
                        <div className="w-px h-3 bg-base-content/10" />
                        <HUDNavItem
                            onClick={() => {
                                audioService.playClick();
                                onNavigate('settings');
                            }}
                        >
                            SETTINGS
                        </HUDNavItem>
                        <div className="w-px h-3 bg-base-content/10" />
                        <HUDNavItem
                            onClick={(e) => {
                                e.stopPropagation();
                                audioService.playClick();
                                onStandbyClick(e);
                            }}
                        >
                            STANDBY
                        </HUDNavItem>
                    </div>
                </div>

                {/* Center Logo */}
                <div ref={logoRef} className="absolute top-0 left-1/2 -translate-x-1/2 flex items-center pointer-events-auto opacity-0">
                    <Logo onNavigate={onNavigate} />
                </div>
                
                {/* Technical Labels - Bottom (Relocated Controls) */}
                <div ref={bottomRef} className="absolute bottom-0 left-12 right-12 flex justify-between items-center pointer-events-auto opacity-0">
                    <div className="flex gap-3 items-center">
                        <span className="text-[8px] font-mono font-black uppercase tracking-[0.5em] text-primary/60">ENGINE</span>
                        <div className="w-px h-3 bg-base-content/10 mx-1" />
                        <div className="min-w-[120px] flex items-center">
                            <LlmStatusSwitcher />
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={onAudioToggle}
                            className="flex items-center gap-2 text-[8px] font-mono uppercase tracking-[0.5em] transition-all"
                        >
                            <span className="text-primary/60 font-black">SFX</span>
                            <span className={`font-bold ${audioEnabled ? 'text-base-content/40' : 'text-base-content/20'}`}>{audioEnabled ? 'ON' : 'OFF'}</span>
                        </button>
                        <div className="w-px h-3 bg-base-content/10" />
                        <button
                            onClick={onMusicToggle}
                            className="flex items-center gap-2 text-[8px] font-mono uppercase tracking-[0.5em] transition-all"
                        >
                            <span className="text-primary/60 font-black">MUSIC</span>
                            <span className={`font-bold ${playerState === 'playing' ? 'text-base-content/40' : 'text-base-content/20'}`}>
                                {playerState === 'playing' ? 'ON' : playerState === 'syncing' ? 'SYNC' : 'OFF'}
                            </span>
                            <AnimatePresence mode="wait">
                                {playerState !== 'idle' && (
                                    <motion.div 
                                        key="oscillator"
                                        initial={{ x: -10, opacity: 0 }}
                                        animate={{ x: 0, opacity: 1 }}
                                        exit={{ x: 10, opacity: 0 }}
                                        transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                                        className="ml-4"
                                    >
                                        <DigitalOscillator state={playerState} theme={themeMode} />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </button>
                    </div>
                </div>

                {/* Side Markers */}
                <div className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-2">
                    <div className="w-[1px] h-4 bg-primary/10" />
                    <div className="w-[1px] h-[1px] bg-primary/20" />
                    <div className="w-[1px] h-4 bg-primary/10" />
                </div>

                <div className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 flex flex-col gap-2">
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
    const isTransitioningRef = useRef(false);
    const isFirstRevealRef = useRef(true);
    
    // --- IDLE STATE REFS ---
    const idleTimerRef = useRef<number | null>(null); 
    const isIdleRef = useRef(false); 

    const { settings, updateSettings } = useSettings();
    const auth = useAuth();

    const [activeTab, setActiveTab] = useLocalStorage<ActiveTab>('activeTab', 'dashboard');
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
    const blindsRef = useRef<HTMLDivElement>(null);
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

            await new Promise(r => setTimeout(r, 1500));

            hasInitializedRef.current = true;
            setIsInitialized(true);
            
            // Wait for blinds to start before hiding loader
            await new Promise(r => setTimeout(r, 500));
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
        if (!isInitialized || !apertureRef.current || !isFirstRevealRef.current || !blindsRef.current) return;
        
        isFirstRevealRef.current = false;

        const tl = gsap.timeline({
            defaults: { ease: "power3.inOut" }
        });

        const blindItems = Array.from(blindsRef.current.children) as HTMLElement[];

        // Ensure blinds are visible and covering everything
        gsap.set(apertureRef.current, { visibility: 'visible', autoAlpha: 1 });
        
        // Set alternating origins for vertical blinds
        blindItems.forEach((item, i) => {
            gsap.set(item, { 
                scaleY: 1, 
                scaleX: 1,
                transformOrigin: i % 2 === 0 ? "top" : "bottom" 
            });
        });

        gsap.set(appWrapperRef.current, { autoAlpha: 0, scale: 1.01 });

        // Vertical Blinds effect: Each strip scales down vertically
        tl.to(blindItems, {
            scaleY: 0,
            duration: 2.0,
            stagger: {
                each: 0.12,
                from: "start"
            },
            ease: "expo.inOut"
        }, 0.2);

        tl.to(appWrapperRef.current, {
            autoAlpha: 1,
            scale: 1,
            duration: 2.2,
            ease: "power2.out"
        }, 0.8);

        tl.set(apertureRef.current, { visibility: 'hidden', autoAlpha: 0 });

        return () => {};
    }, [isInitialized]);

    const runScopedTransition = useCallback(async (targetTab: ActiveTab) => {
        if (isTransitioningRef.current || !mainGridRef.current || !contentRef.current) return;
        isTransitioningRef.current = true;
        audioService.playClick();

        const tl = gsap.timeline();

        // Phase 1: Current content slides down and fades out
        tl.to(contentRef.current, {
            y: 80,
            autoAlpha: 0,
            duration: 0.8,
            ease: "power2.in"
        });

        // Show grid cover
        tl.set(mainGridRef.current, { autoAlpha: 1, visibility: 'visible' });

        // Phase 2: Grid slides down to cover
        const cells = mainGridRef.current.querySelectorAll('.transition-cell');
        tl.fromTo(cells,
            { y: 0, scaleY: 1 },
            {
                y: 100,
                scaleY: 0.5,
                duration: 1,
                ease: "power3.inOut",
                stagger: {
                    grid: [gridRows, gridCols],
                    from: "start",
                    axis: "y",
                    amount: 0.3
                }
            },
            "-=0.4"
        );

        // Switch tab
        tl.call(() => setActiveTab(targetTab));
        tl.call(() => {
            if (contentRef.current) {
                gsap.set(contentRef.current, { y: -80, autoAlpha: 0 });
            }
        });

        // Phase 3: New content slides up from below
        tl.call(() => {
            if (contentRef.current) {
                gsap.fromTo(contentRef.current,
                    { y: 80, autoAlpha: 0 },
                    { y: 0, autoAlpha: 1, duration: 0.8, ease: "power3.out" }
                );
            }
        });

        // Phase 4: Grid slides back up to reveal
        tl.to(cells,
            {
                y: 0,
                scaleY: 1,
                duration: 1,
                ease: "power3.inOut",
                stagger: {
                    grid: [gridRows, gridCols],
                    from: "end",
                    axis: "y",
                    amount: 0.3
                },
                onComplete: () => {
                    gsap.set(mainGridRef.current, { autoAlpha: 0, visibility: 'hidden' });
                    isTransitioningRef.current = false;
                }
            },
            "-=0.6"
        );
    }, [setActiveTab]);

    const handleNavigate = (tab: ActiveTab) => {
        if (tab === activeTab) return;
        runScopedTransition(tab);
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
            case 'gallery': return <ImageGallery {...categoryPanelProps} isSidebarPinned={false} showGlobalFeedback={showGlobalFeedback} />;
            case 'cheatsheet': return <Cheatsheet />;
            case 'artstyles': return <ArtstyleCheatsheet onSendToPromptsPage={(state) => handleSendToPromptsPage({ ...state, view: 'enhancer' })} />;
            case 'artists': return <ArtistCheatsheet onSendToPromptsPage={(state) => handleSendToPromptsPage({ ...state, view: 'enhancer' })} />;
            case 'settings': return <SetupPage activeSettingsTab={activeSettingsTab} setActiveSettingsTab={setActiveSettingsTab} activeSubTab={activeSettingsSubTab} setActiveSubTab={setActiveSettingsSubTabSetter} showGlobalFeedback={showGlobalFeedback} />;
            case 'composer': return <ComposerPage showGlobalFeedback={showGlobalFeedback} />;
            case 'image_compare': return <ImageCompare />;
            case 'color_palette_extractor': return <ColorPaletteExtractor onClipIdea={handleClipIdea} />;
            case 'resizer': return <ImageResizer />;
            case 'video_to_frames': return <VideoToFrames />;
            default: return <Dashboard onNavigate={handleNavigate} onClipIdea={handleClipIdea} />;
        }
    };
    
    const [isUplinkActive, setIsUplinkActive] = useState(true);
    const [playerState, setPlayerState] = useState<'idle' | 'syncing' | 'playing' | 'error'>('syncing');
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
                if (audioEnabled) {
                    audioService.startAmbient(0.3);
                }
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [videoId, isUplinkActive, playerState, audioEnabled]);

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
        } else {
            setPlayerState('syncing');
            setIsUplinkActive(true);
            setTimeout(() => {
                setPlayerState('playing');
                if (audioEnabled) {
                    audioService.startAmbient(0.3);
                }
            }, 2500);
        }
    }, [videoId, isUplinkActive, audioEnabled]);

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
        <div className="h-full w-full flex overflow-hidden relative font-sans">
            {isLoading && (
                <div ref={loaderRef} className="fixed inset-0 z-[1000]">
                    <InitialLoader status={initStatus} progress={initProgress} />
                </div>
            )}
            {/* AMBIENT VIDEO BACKGROUND */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                {!videoError && settings.dashboardVideoUrl ? (
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
            
            <IdleOverlay isVisible={isIdle} onInteraction={() => resetIdleTimer(true)} />

            {!isInitialized ? (
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
                        className="fixed inset-4 md:inset-10 z-[900] pointer-events-none"
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
                        className="flex-1 flex flex-col overflow-hidden relative z-0 bg-transparent rounded-none p-6 md:p-14 pt-12 md:pt-20"
                    >
                        <Header
                            onNavigate={handleNavigate}
                            isInitialized={isInitialized}
                        />

                        <div className="flex-1 flex overflow-hidden relative p-4 bg-transparent">
                            <main className={`flex-grow min-w-0 relative overflow-hidden bg-transparent rounded-none ${activeTab === 'dashboard' ? 'border-none shadow-none backdrop-blur-none' : 'border border-base-300/20'} z-10`}>
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
                                        <div key={i} className="transition-cell bg-transparent" />
                                    ))}
                                </div>

                                <div ref={contentRef} className="h-full w-full z-10 relative">
                                    {renderContent()}
                                </div>
                            </main>
                        </div>
                        
                        <Footer />
                    </div>
                </>
            )}
            
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
            <CustomCursor />
            <PageFrame 
                audioEnabled={audioEnabled}
                onAudioToggle={handleAudioToggle}
                playerState={playerState}
                onMusicToggle={handleMusicToggle}
                themeMode={settings.activeThemeMode}
                onNavigate={handleNavigate}
                onAboutClick={() => setIsAboutModalOpen(true)}
                onToggleClippingPanel={() => setIsClippingPanelOpen(!isClippingPanelOpen)}
                onStandbyClick={handleStandbyClick}
                clippedIdeasCount={clippedIdeas.length}
                isInitialized={isInitialized}
            />
            
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
