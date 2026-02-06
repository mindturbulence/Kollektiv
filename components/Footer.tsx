
import React, { useMemo, useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { fileSystemManager } from '../utils/fileUtils';
import { PlayIcon, InstagramIcon, CpuChipIcon, FolderClosedIcon } from './icons';
import { gsap } from 'gsap';

interface FooterProps {
  onAboutClick: () => void;
}

const LedStatus: React.FC<{ 
    label: string, 
    active: boolean, 
    color?: string 
}> = ({ label, active, color = 'bg-success' }) => (
    <div className={`flex items-center gap-1.5 transition-all duration-700 ${active ? 'opacity-100' : 'opacity-10'}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${active ? `${color} shadow-[0_0_5px_rgba(var(--p),0.5)] animate-pulse` : 'bg-base-content/20'}`}></span>
        {/* Unified typeface for status labels */}
        <span className="text-[10px] font-sans font-black text-base-content tracking-tighter uppercase whitespace-nowrap">{label}</span>
    </div>
);

/**
 * Digital Oscilloscope Animation
 * Simulates a real-time signal readout with distinct behaviors for different engine states.
 */
const DigitalOscillator = ({ state = 'idle' }: { state: 'idle' | 'syncing' | 'playing' | 'error' }) => {
    return (
        <div className="flex items-center justify-center h-4 w-12 overflow-hidden relative">
            <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                {/* Harmonic Layer 1 (Slow/Deep) */}
                <path
                    d="M0 20 Q 25 5, 50 20 T 100 20 T 150 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="0.5"
                    className={`transition-all duration-1000 ${
                        state === 'playing' ? 'opacity-20 animate-osc-slow' : 
                        state === 'syncing' ? 'opacity-10 animate-osc-erratic' : 'opacity-0'
                    }`}
                />
                {/* Harmonic Layer 2 (Secondary) */}
                <path
                    d="M0 20 Q 15 35, 30 20 T 60 20 T 90 20 T 120 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                    className={`transition-all duration-1000 ${
                        state === 'playing' ? 'opacity-40 animate-osc-mid' : 
                        state === 'syncing' ? 'opacity-20 animate-osc-erratic-reverse' : 'opacity-0'
                    }`}
                />
                {/* Primary Signal Line */}
                <path
                    d="M0 20 Q 10 10, 20 20 T 40 20 T 60 20 T 80 20 T 100 20 T 120 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    className={`transition-all duration-700 ${
                        state === 'playing' ? 'text-primary drop-shadow-[0_0_3px_oklch(var(--p))] animate-osc-fast' : 
                        state === 'syncing' ? 'text-warning animate-osc-glitch' : 
                        'text-base-content/20 animate-osc-idle'
                    }`}
                />
            </svg>
            <style>{`
                @keyframes osc-scroll {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-40px); }
                }
                @keyframes osc-jitter {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-1px); }
                }
                @keyframes osc-glitch-step {
                    0% { transform: translateX(0) scaleY(1); }
                    20% { transform: translateX(-5px) scaleY(2); }
                    40% { transform: translateX(-15px) scaleY(0.5); }
                    60% { transform: translateX(-2px) scaleY(3); }
                    80% { transform: translateX(-10px) scaleY(1); }
                    100% { transform: translateX(0) scaleY(1); }
                }
                .animate-osc-slow {
                    animation: osc-scroll 4s linear infinite;
                }
                .animate-osc-mid {
                    animation: osc-scroll 2.5s linear infinite reverse;
                }
                .animate-osc-fast {
                    animation: osc-scroll 1.2s linear infinite;
                }
                .animate-osc-idle {
                    animation: osc-scroll 10s linear infinite, osc-jitter 0.2s step-end infinite;
                    scale: 1 0.1;
                }
                .animate-osc-glitch {
                    animation: osc-glitch-step 0.4s step-end infinite;
                }
                .animate-osc-erratic {
                    animation: osc-glitch-step 0.8s linear infinite;
                }
                .animate-osc-erratic-reverse {
                    animation: osc-glitch-step 1.2s linear infinite reverse;
                }
            `}</style>
        </div>
    );
};

const Footer: React.FC<FooterProps> = ({ onAboutClick }) => {
  const { settings } = useSettings();

  // Audio Engine State
  const [playerState, setPlayerState] = useState<'idle' | 'syncing' | 'playing' | 'error'>('idle');
  const [showToast, setShowToast] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLButtonElement>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  // --- NATIVE AUDIO ENGINE ---
  const handleToggle = useCallback(() => {
    if (!audioRef.current) {
        const audio = new Audio('https://stream.nightride.fm/nightride.m4a');
        audio.crossOrigin = "anonymous";
        audioRef.current = audio;

        audio.onplaying = () => {
            setPlayerState('playing');
            setShowToast(true);
            if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
            toastTimeoutRef.current = window.setTimeout(() => setShowToast(false), 5000);
        };

        audio.onwaiting = () => setPlayerState('syncing');
        audio.onloadstart = () => setPlayerState('syncing');
        
        audio.onerror = () => {
            setPlayerState('error');
            audioRef.current = null;
        };
    }

    if (playerState === 'playing') {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current.load();
        audioRef.current = null;
        setPlayerState('idle');
        setShowToast(false);
    } else {
        setPlayerState('syncing');
        audioRef.current.src = 'https://stream.nightride.fm/nightride.m4a';
        audioRef.current.play().catch(() => {
            setPlayerState('error');
            audioRef.current = null;
        });
    }
  }, [playerState]);

  useEffect(() => {
    return () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = "";
        }
        if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // --- DYNAMIC UI ANIMATIONS ---
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    gsap.killTweensOf(containerRef.current);
    
    if (playerState === 'playing') {
        gsap.to(containerRef.current, {
            scale: 1.05,
            duration: 0.6,
            ease: "back.out(1.7)"
        });
    } else {
        gsap.to(containerRef.current, {
            scale: 1,
            duration: 0.4
        });
    }
  }, [playerState]);

  const systemStatus = useMemo(() => {
    const isStorageLinked = fileSystemManager.isDirectorySelected();
    const isGeminiActive = settings.activeLLM === 'gemini' && !!process.env.API_KEY;
    const aiLabel = settings.activeLLM === 'ollama_cloud' ? 'OLLAMA_CLOUD' : settings.activeLLM.toUpperCase();
    return {
        storage: isStorageLinked,
        ai: aiLabel,
        aiActive: isGeminiActive || settings.activeLLM.includes('ollama'),
        youtube: !!settings.youtube?.isConnected,
        instagram: !!settings.instagram?.isConnected
    };
  }, [settings]);

  const statusLabel = useMemo(() => {
      switch(playerState) {
          case 'playing': return 'MUSIC: ON';
          case 'syncing': return 'SYNCING...';
          case 'error': return 'MUSIC: OFF';
          default: return 'MUSIC: IDLE';
      }
  }, [playerState]);

  const stateColorClass = useMemo(() => {
    switch(playerState) {
        case 'playing': return 'text-primary';
        case 'syncing': return 'text-warning';
        case 'error': return 'text-error';
        default: return 'text-base-content/40 hover:text-base-content/60';
    }
  }, [playerState]);

  return (
    <>
        {/* HUD OVERLAY TOAST */}
        <div className={`fixed bottom-24 right-6 z-[200] transition-all duration-700 pointer-events-none ${showToast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <div className="bg-base-100 border border-primary/40 px-6 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.8)] flex items-center gap-4 backdrop-blur-3xl">
                <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse shadow-[0_0_10px_oklch(var(--p))]"></div>
                <div className="flex flex-col">
                    <span className="text-[7px] font-black uppercase tracking-[0.5em] text-primary">Stream Activated</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-base-content truncate max-w-[280px]">NIGHTRIDE FM // SYNTHWAVE RADIO</span>
                </div>
            </div>
        </div>

        <footer className="flex-shrink-0 px-6 h-12 bg-base-100 border-t border-base-300 z-10 flex flex-row items-center justify-between overflow-hidden select-none whitespace-nowrap">
            {/* --- LEFT MODULE: ENGINE STATUS --- */}
            <div className="flex items-center h-full px-6 gap-6 bg-transparent">
                <div className="flex flex-row items-center gap-3">
                    {/* Corrected branding typeface (inheriting font-black overrides) */}
                    <span className="text-[14px] font-black uppercase tracking-tighter text-primary">
                        KOLLEKTIV
                    </span>
                </div>
                
                <div className="relative flex items-center justify-center border-l border-base-300/30 pl-6 h-full py-2">
                    <div className="flex flex-row gap-4 items-center">
                        <LedStatus label="VAULT" active={systemStatus.storage} />
                        <LedStatus label={systemStatus.ai} active={systemStatus.aiActive} />
                        <LedStatus label="YOUTUBE" active={systemStatus.youtube} color="bg-error" />
                        <LedStatus label="INSTAGRAM" active={systemStatus.instagram} color="bg-primary" />
                    </div>
                </div>
            </div>

            {/* --- RIGHT MODULE: AUDIO SIGNAL --- */}
            <button 
                ref={containerRef}
                onClick={handleToggle}
                disabled={playerState === 'syncing'}
                className={`group relative flex items-center h-full px-6 gap-6 transition-all duration-300 rounded-none overflow-hidden bg-transparent border-none outline-none ${stateColorClass}`}
            >
                <div className="flex flex-row items-center gap-2 text-right">
                    {/* Unified typeface for status messaging */}
                    <span className={`text-[10px] font-sans font-black uppercase tracking-tighter transition-colors ${playerState === 'syncing' ? 'animate-pulse' : ''}`}>
                        {statusLabel}
                    </span>
                </div>
                
                <div className="relative flex items-center justify-center border-l border-base-300/30 pl-6 h-full py-2">
                    <div className="relative">
                        <DigitalOscillator state={playerState} />
                    </div>
                </div>
            </button>
        </footer>
    </>
  );
};

export default Footer;
