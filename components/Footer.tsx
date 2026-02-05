
import React, { useMemo, useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { fileSystemManager } from '../utils/fileUtils';
import { PlayIcon, InstagramIcon, CpuChipIcon, FolderClosedIcon, WaveSineIcon } from './icons';
import { gsap } from 'gsap';

interface FooterProps {
  onAboutClick: () => void;
}

const StatusIndicator: React.FC<{ 
    label: string, 
    active: boolean, 
    icon?: React.ReactNode,
    color?: string 
}> = ({ label, active, icon, color = 'bg-success' }) => (
    <div className={`flex items-center gap-1.5 px-2 py-0.5 border border-base-300 transition-all duration-500 ${active ? 'opacity-100' : 'opacity-20 grayscale'}`}>
        {icon && <div className="w-3 h-3 flex items-center justify-center">{icon}</div>}
        <span className="text-[9px] font-mono font-black text-base-content/50 tracking-widest uppercase">{label}</span>
        <span className={`w-1 h-1 rounded-full ${active ? color : 'bg-base-content/20'}`}></span>
    </div>
);

// Animated Soundwave Component - Uses currentColor for bars
const SoundWaveActive = () => (
    <div className="flex items-end justify-center gap-[3px] h-4 w-6">
        {[0.6, 1.2, 0.8, 1.4, 0.5].map((val, i) => (
            <div 
                key={i}
                className="w-1 bg-current origin-bottom"
                style={{ 
                    animation: `neural-pulse ${0.4 + (i * 0.15)}s ease-in-out infinite alternate`,
                }}
            />
        ))}
        <style>{`
            @keyframes neural-pulse {
                0% { height: 20%; opacity: 0.4; }
                100% { height: 100%; opacity: 1; }
            }
        `}</style>
    </div>
);

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
    // 1. Construct Engine on first interaction
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

    // 2. Playback Modulation
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

  // --- DYNAMIC UI ANIMATIONS (TRANSITIONS ONLY, NO BACKGROUNDS) ---
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    gsap.killTweensOf(containerRef.current);
    
    // Scale slightly when active
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
    const aiLabel = settings.activeLLM === 'ollama_cloud' ? 'OLLAMA_CL' : settings.activeLLM.toUpperCase();
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
          case 'syncing': return 'UPLINKING...';
          case 'error': return 'FAIL';
          default: return 'MUSIC: OFF';
      }
  }, [playerState]);

  // Color logic for text and icon
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
                    <span className="text-[7px] font-black uppercase tracking-[0.5em] text-primary">Neural Stream Active</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-base-content truncate max-w-[280px]">NIGHTRIDE FM // SYNTHWAVE RADIO</span>
                </div>
            </div>
        </div>

        <footer className="flex-shrink-0 px-6 py-2 bg-base-100 border-t border-base-300 z-10 flex flex-wrap items-center justify-between gap-4 select-none">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 border-r border-base-300 pr-4">
                    <span className="text-[9px] font-mono font-black text-primary tracking-widest uppercase">KOLLEKTIV V2.0</span>
                </div>
                <div className="flex gap-1">
                    <StatusIndicator label="VAULT" active={systemStatus.storage} icon={<FolderClosedIcon className="w-3 h-3" />} />
                    <StatusIndicator label={systemStatus.ai} active={systemStatus.aiActive} icon={<CpuChipIcon className="w-3 h-3" />} />
                    <StatusIndicator label="YT" active={systemStatus.youtube} icon={<PlayIcon className="w-3 h-3 fill-current" />} />
                    <StatusIndicator label="IG" active={systemStatus.instagram} icon={<InstagramIcon className="w-3 h-3" />} />
                </div>
            </div>

            <div className="flex items-center gap-4">
                {/* UNIFIED NEURAL SIGNAL CONTROL (TRANSPARENT BACKGROUND) */}
                <button 
                    ref={containerRef}
                    onClick={handleToggle}
                    disabled={playerState === 'syncing'}
                    className={`group relative flex items-center h-12 px-6 gap-6 transition-all duration-300 rounded-none overflow-hidden bg-transparent border-none outline-none ${stateColorClass}`}
                >
                    {/* Status Text Stack */}
                    <div className="flex flex-col items-start">
                        <span className={`text-[10px] font-black uppercase tracking-widest leading-none transition-colors ${playerState === 'syncing' ? 'animate-pulse' : ''}`}>
                            {statusLabel}
                        </span>
                    </div>
                    
                    {/* Integrated Wave Module */}
                    <div className="relative flex items-center justify-center border-l border-base-300/30 pl-6 h-full py-2">
                        <div className="relative">
                            {playerState === 'playing' ? (
                                <SoundWaveActive />
                            ) : (
                                <WaveSineIcon className={`w-6 h-6 transition-all duration-700 ${
                                    playerState === 'syncing' ? 'animate-pulse' : ''
                                }`} />
                            )}
                            
                            {/* Pulse Rings for Active State (Stays primary for that tech look) */}
                            {playerState === 'playing' && (
                                <span className="absolute inset-0 border border-current rounded-full animate-ping opacity-20 pointer-events-none scale-150"></span>
                            )}
                        </div>
                    </div>

                    {/* Minimalist Syncing Indicator (No background fill) */}
                    {playerState === 'syncing' && (
                        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-warning/20 animate-pulse pointer-events-none"></div>
                    )}
                </button>
            </div>
        </footer>
    </>
  );
};

export default Footer;
