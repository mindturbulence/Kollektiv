
import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { fileSystemManager } from '../utils/fileUtils';
import { audioService } from '../services/audioService';

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
        <span className="text-[10px] font-sans font-black text-base-content tracking-tighter uppercase whitespace-nowrap">{label}</span>
    </div>
);

const DigitalOscillator = ({ state = 'idle' }: { state: string }) => {
    return (
        <div className="flex items-center justify-center h-4 w-12 overflow-hidden relative">
            <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                <path d="M0 20 Q 25 5, 50 20 T 100 20 T 150 20" fill="none" stroke="currentColor" strokeWidth="0.5" className={`transition-all duration-1000 ${state === 'playing' ? 'opacity-20 animate-osc-slow' : state === 'syncing' ? 'opacity-10 animate-osc-erratic' : 'opacity-0'}`} />
                <path d="M0 20 Q 15 35, 30 20 T 60 20 T 90 20 T 120 20" fill="none" stroke="currentColor" strokeWidth="1" className={`transition-all duration-1000 ${state === 'playing' ? 'opacity-40 animate-osc-mid' : state === 'syncing' ? 'opacity-20 animate-osc-erratic-reverse' : 'opacity-0'}`} />
                <path d="M0 20 Q 10 10, 20 20 T 40 20 T 60 20 T 80 20 T 100 20 T 120 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={`transition-all duration-700 ${state === 'playing' ? 'text-primary drop-shadow-[0_0_3px_oklch(var(--p))] animate-osc-fast' : state === 'syncing' ? 'text-warning animate-osc-glitch' : 'text-base-content/20 animate-osc-idle'}`} />
            </svg>
            <style>{`
                @keyframes osc-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-40px); } }
                @keyframes osc-glitch-step { 0% { transform: translateX(0) scaleY(1); } 20% { transform: translateX(-5px) scaleY(2); } 40% { transform: translateX(-15px) scaleY(0.5); } 60% { transform: translateX(-2px) scaleY(3); } 80% { transform: translateX(-10px) scaleY(1); } 100% { transform: translateX(0) scaleY(1); } }
                .animate-osc-slow { animation: osc-scroll 4s linear infinite; }
                .animate-osc-mid { animation: osc-scroll 2.5s linear infinite reverse; }
                .animate-osc-fast { animation: osc-scroll 1.2s linear infinite; }
                .animate-osc-idle { animation: osc-scroll 10s linear infinite; scale: 1 0.1; }
                .animate-osc-glitch { animation: osc-glitch-step 0.4s step-end infinite; }
            `}</style>
        </div>
    );
};

const Footer: React.FC<FooterProps> = ({ onAboutClick }) => {
  const { settings } = useSettings();
  const [isUplinkActive, setIsUplinkActive] = useState(false);
  const [playerState, setPlayerState] = useState<'idle' | 'syncing' | 'playing' | 'error'>('idle');
  const [showMonitor, setShowMonitor] = useState(false);
  
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const extractVideoId = useCallback((url: string) => {
      if (!url) return null;
      const regExp = /^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/|shorts\/)|(?:(?:watch)?\?v(?:i)?=|\&v(?:i)?=))([^#\&\?]*).*/;
      const match = url.match(regExp);
      return (match && match[1].length === 11) ? match[1] : null;
  }, []);

  const videoId = useMemo(() => extractVideoId(settings.musicYoutubeUrl), [settings.musicYoutubeUrl, extractVideoId]);

  // dismiss UI after success
  useEffect(() => {
    if (playerState === 'playing') {
        const timer = setTimeout(() => {
            setShowMonitor(false);
        }, 3000); // Wait 3 seconds after connected, then hide the toast
        return () => clearTimeout(timer);
    }
  }, [playerState]);

  const handleToggle = useCallback(() => {
    if (!videoId) {
        setPlayerState('error');
        return;
    }

    audioService.playClick();

    if (isUplinkActive) {
        setIsUplinkActive(false);
        setPlayerState('idle');
        setShowMonitor(false);
    } else {
        setPlayerState('syncing');
        setIsUplinkActive(true);
        setShowMonitor(true);
        // Transition to playing after handshake delay
        setTimeout(() => {
            setPlayerState('playing');
        }, 2500);
    }
  }, [videoId, isUplinkActive]);

  const statusLabel = useMemo(() => {
      switch(playerState) {
          case 'playing': return 'AUDIO: ON';
          case 'syncing': return 'SYNCING...';
          case 'error': return 'AUDIO: ERR';
          default: return 'AUDIO: IDLE';
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

  const isActive = playerState === 'playing' || playerState === 'syncing';

  return (
    <>
        {/* HIDDEN AUDIO ENGINE HOST: 1x1 and transparent to keep browser media focus */}
        <div className="fixed top-0 left-0 w-1 h-1 pointer-events-none opacity-[0.001] z-[-1] overflow-hidden">
            {isUplinkActive && videoId && (
                <iframe
                    ref={iframeRef}
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

        {/* NEURAL MONITOR TOAST: Sleek and Minimal text-only status */}
        <div className={`fixed bottom-20 right-6 z-[200] transition-all duration-1000 ease-out pointer-events-none ${showMonitor ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
            <div className="bg-base-100 border border-primary/40 p-4 shadow-[0_30px_90px_rgba(0,0,0,0.9)] flex items-center gap-4 backdrop-blur-3xl min-w-[320px] overflow-hidden">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${playerState === 'playing' ? 'bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--p),0.8)]' : 'bg-warning animate-ping'}`}></div>
                
                <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary leading-none">
                        {playerState === 'playing' ? 'UPLINK_STABLE' : 'ESTABLISHING_LINK'}
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-base-content/40 mt-1 truncate">
                        {playerState === 'playing' ? 'SIGNAL_LOCKED // UI DISMISSING' : 'BYPASSING_RESTRICTIONS...'}
                    </span>
                </div>

                <div className="ml-auto opacity-20">
                    <DigitalOscillator state={playerState} />
                </div>
            </div>
        </div>

        <footer className="flex-shrink-0 px-0 h-12 bg-base-100 border-t border-base-300 z-10 flex flex-row items-center justify-between overflow-hidden select-none whitespace-nowrap">
            <div className="flex items-center h-full px-6 gap-6 bg-transparent">
                <span className="text-[14px] font-black uppercase tracking-tighter text-primary">KOLLEKTIV. V2</span>
                <div className="relative flex items-center justify-center border-l border-base-300/30 pl-6 h-full py-2">
                    <div className="flex flex-row gap-4 items-center">
                        <LedStatus label="VAULT" active={fileSystemManager.isDirectorySelected()} />
                        <LedStatus label={settings.activeLLM === 'ollama_cloud' ? 'OLLAMA' : settings.activeLLM.toUpperCase()} active={!!process.env.API_KEY || settings.activeLLM.includes('ollama')} />
                        <LedStatus label="STREAM" active={playerState === 'playing'} color="bg-primary" />
                        <LedStatus label="YOUTUBE" active={!!settings.youtube?.isConnected} color="bg-error" />
                    </div>
                </div>
            </div>

            <div className="flex flex-row items-center h-full">
                <button 
                    onClick={handleToggle} 
                    className={`relative flex items-center h-full px-10 transition-all duration-300 bg-transparent border-l border-base-300/30 outline-none ${stateColorClass}`}
                >
                    <div className="flex flex-row items-center h-full relative z-10 pointer-events-none">
                        <div className={`flex flex-row items-center transition-all duration-500 ease-out ${isActive ? '-translate-x-2' : 'translate-x-0'}`}>
                            <span className={`text-[10px] font-sans font-black uppercase tracking-tighter ${playerState === 'syncing' ? 'animate-pulse' : ''}`}>{statusLabel}</span>
                        </div>
                        <div className={`flex items-center transition-all duration-500 ease-in-out border-l border-base-300/30 ${isActive ? 'w-16 opacity-100 ml-4 pl-4' : 'w-0 opacity-0 pointer-events-none ml-0 pl-0'}`}>
                            <DigitalOscillator state={playerState} />
                        </div>
                    </div>
                </button>
            </div>
        </footer>
    </>
  );
};

export default Footer;
