
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
            
            const style = getComputedStyle(document.documentElement);
            const primary = style.getPropertyValue('--p').trim();
            const color = primary ? `oklch(${primary})` : '#641ae6';
            
            phaseRef.current += 0.05;
            const p = phaseRef.current;

            // Render 3 layers of waves for depth
            const layers = [
                { amp: 0.2, freq: 0.05, speed: 1.0, opacity: 0.1 },
                { amp: 0.4, freq: 0.08, speed: 1.5, opacity: 0.3 },
                { amp: 0.6, freq: 0.12, speed: 2.0, opacity: 0.8 }
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
                        // Complex reactive wave
                        const noise = Math.sin(p * layer.speed + x * layer.freq) * 
                                      Math.cos(p * 0.5 + x * 0.02);
                        const spikes = Math.random() > 0.98 ? (Math.random() - 0.5) * 20 : 0;
                        y += (noise * (h * 0.4) * layer.amp) + spikes;
                    } else if (state === 'syncing') {
                        // High-frequency jitter
                        y += (Math.random() - 0.5) * (h * 0.8);
                    } else if (state === 'idle') {
                        // Calm breathing wave
                        y += Math.sin(p * 0.5 + x * 0.05) * (h * 0.1);
                    } else if (state === 'error') {
                        // Glitching flatline
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
    }, [state]);

    return (
        <canvas 
            ref={canvasRef} 
            width={120} 
            height={40} 
            className="w-12 h-4 opacity-80"
        />
    );
};

const Footer: React.FC<FooterProps> = ({ }) => {
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

  useEffect(() => {
    if (playerState === 'playing') {
        const timer = setTimeout(() => {
            setShowMonitor(false);
        }, 3000);
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

                <div className="ml-auto">
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
