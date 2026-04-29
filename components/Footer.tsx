
import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import LlmStatusSwitcher from './LlmStatusSwitcher';
import { useSettings } from '../contexts/SettingsContext';
import { fileSystemManager } from '../utils/fileUtils';
import { audioService } from '../services/audioService';
import { loadGalleryItems } from '../utils/galleryStorage';

const MetadataItem: React.FC<{ label: string; value: string }> = ({ label, value }) => {
    const { settings } = useSettings();
    const isPipboyTheme = settings.darkTheme === 'pipboy';
    const fontClass = isPipboyTheme ? 'font-fixedsys text-[11px]' : 'font-rajdhani text-[12px] font-normal';

    return (
        <div className="flex items-center gap-2">
            <span className={`uppercase tracking-widest text-primary/60 leading-none inline-block ${fontClass}`}>{label}</span>
            <span className={`uppercase tracking-widest text-base-content/40 leading-none inline-block ${fontClass}`}>{value}</span>
        </div>
    );
};

const BatteryStatus: React.FC = () => {
    const [battery, setBattery] = useState<{ level: number, charging: boolean } | null>(null);
    const { settings } = useSettings();
    const isPipboyTheme = settings.darkTheme === 'pipboy';
    const fontClass = isPipboyTheme ? 'font-fixedsys text-[11px]' : 'font-rajdhani text-[12px] font-normal';

    useEffect(() => {
        // Battery API is not available in all browsers
        if ('getBattery' in navigator) {
            (navigator as any).getBattery().then((batt: any) => {
                const updateBattery = () => {
                    setBattery({
                        level: Math.round(batt.level * 100),
                        charging: batt.charging
                    });
                };
                updateBattery();
                batt.addEventListener('levelchange', updateBattery);
                batt.addEventListener('chargingchange', updateBattery);

                return () => {
                    batt.removeEventListener('levelchange', updateBattery);
                    batt.removeEventListener('chargingchange', updateBattery);
                };
            });
        }
    }, []);

    if (!battery) return null;

    return (
        <div className="flex items-center gap-2">
            <span className={`uppercase tracking-widest text-primary/60 leading-none inline-block ${fontClass}`}>PWR</span>
            <span className={`uppercase tracking-widest text-base-content/40 leading-none inline-block ${fontClass}`}>
                {battery.level}%
            </span>
        </div>
    );
};

const IntegrationItem: React.FC<{
    label: string,
    active: boolean
}> = ({ label, active }) => {
    const { settings } = useSettings();
    const isPipboyTheme = settings.darkTheme === 'pipboy';
    const fontClass = isPipboyTheme ? 'font-fixedsys text-[11px]' : 'font-rajdhani text-[12px] font-normal';

    return (
        <span className={`uppercase tracking-widest transition-colors duration-500 leading-none inline-block ${fontClass} ${active ? 'text-base-content/40' : 'text-base-content/20'}`}>
            {label}
        </span>
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

            const color = theme === 'dark' ? '#ffffff' : '#000000';

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

                if (state === 'playing') {
                    // Sterling style vertical bars
                    const barWidth = 1;
                    const gap = 2;
                    const barCount = Math.floor(w / (barWidth + gap));

                    for (let j = 0; j < barCount; j++) {
                        const x = j * (barWidth + gap);
                        const hFactor = Math.sin(p * (layer.speed * 0.5) + j * 0.3) * 0.5 + 0.5;
                        const barHeight = 2 + hFactor * (h * 0.6 * layer.amp);

                        ctx.moveTo(x, centerY - barHeight / 2);
                        ctx.lineTo(x, centerY + barHeight / 2);
                    }
                } else {
                    for (let x = 0; x < w; x++) {
                        let y = centerY;
                        if (state === 'syncing') {
                            // Use the old 'playing' waveform for 'syncing'
                            const noise = Math.sin(p * layer.speed + x * layer.freq) *
                                Math.cos(p * 0.5 + x * 0.02);
                            const spikes = Math.random() > 0.98 ? (Math.random() - 0.5) * 20 : 0;
                            y += (noise * (h * 0.4) * layer.amp) + spikes;
                        } else if (state === 'idle') {
                            y = centerY;
                        } else if (state === 'error') {
                            y += (Math.random() - 0.5) * 2;
                        }

                        if (x === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }
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

interface FooterProps {
    audioEnabled: boolean;
    onAudioToggle: () => void;
    playerState: 'idle' | 'syncing' | 'playing' | 'error';
    onMusicToggle: () => void;
    themeMode: 'light' | 'dark';
    onToggleLlmPanel: () => void;
    isLlmPanelOpen: boolean;
}

const Footer: React.FC<FooterProps> = ({
    audioEnabled,
    onAudioToggle,
    playerState,
    onMusicToggle,
    themeMode,
    onToggleLlmPanel,
    isLlmPanelOpen
}) => {
    const { settings } = useSettings();
    const [vaultCount, setVaultCount] = useState<number>(0);
    const [time, setTime] = useState(new Date().toLocaleTimeString());
    const isPipboyTheme = settings.darkTheme === 'pipboy';
    const mainFontClass = isPipboyTheme ? 'font-fixedsys text-[11px]' : 'font-rajdhani text-[12px] font-normal';

    useEffect(() => {
        const fetch = async () => {
            try {
                const items = await loadGalleryItems();
                setVaultCount(items.filter(i => !i.isNsfw).length);
            } catch (e) { console.error(e); }
        };
        fetch();
        const timer = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <footer className="flex-shrink-0 px-8 py-4 bg-base-200/20 backdrop-blur-md z-[700] flex flex-row items-center justify-between select-none whitespace-nowrap relative pointer-events-auto border-t border-base-content/10 mt-auto">
            {/* Background Technical Noise */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]"></div>

            <div className="flex items-center h-full gap-4 bg-transparent relative z-[710] pointer-events-auto">
                <div className="flex gap-3 items-center">
                    <span className={`uppercase tracking-widest text-primary/60 leading-none inline-block ${mainFontClass}`}>ENG</span>
                    <div className="min-w-[120px] flex items-center">
                        <LlmStatusSwitcher onClick={onToggleLlmPanel} isOpen={isLlmPanelOpen} />
                    </div>
                </div>

                <div className={`flex gap-4 ${mainFontClass} items-center pl-4 ps-6 border-l border-base-content/10`}>
                    <span className="uppercase tracking-widest text-primary/60 leading-none inline-block">INT</span>
                    <IntegrationItem label="VAULT" active={fileSystemManager.isDirectorySelected()} />
                    <IntegrationItem label={(settings.activeLLM === 'ollama_cloud' ? 'OLLAMA' : settings.activeLLM?.toUpperCase()) || 'LLM'} active={!!process.env.GEMINI_API_KEY || settings.activeLLM?.includes('ollama') || settings.activeLLM === 'openclaw'} />
                    <IntegrationItem label="YOUTUBE" active={!!settings.youtube?.isConnected} />
                </div>
            </div>

            <div className="flex flex-row items-center h-full gap-6 relative z-[710] pointer-events-auto">
                <div className="flex items-center gap-6">
                    <div className="hidden md:flex items-center gap-6">
                        <MetadataItem label="VLT" value={`${vaultCount} UNITS`} />
                        <div className="w-[1px] h-3 bg-base-content/10" />
                        <MetadataItem label="SEQ" value={time} />
                    </div>

                    <div className="w-[1px] h-3 bg-base-content/10 invisible md:visible" />

                    <BatteryStatus />

                    <div className="w-[1px] h-3 bg-base-content/10" />

                    <button
                        onClick={onAudioToggle}
                        onMouseEnter={() => audioService.playHover()}
                        className="flex items-center gap-2 group transition-all"
                    >
                        <span className={`uppercase tracking-widest text-primary/60 group-hover:text-primary leading-none inline-block ${mainFontClass}`}>SFX</span>
                        <span className={`uppercase tracking-widest leading-none inline-block ${audioEnabled ? 'text-base-content/40' : 'text-base-content/20'} ${mainFontClass}`}>{audioEnabled ? 'ON' : 'OFF'}</span>
                    </button>

                    <div className="w-[1px] h-3 bg-base-content/10" />

                    <button
                        onClick={onMusicToggle}
                        onMouseEnter={() => audioService.playHover()}
                        className="flex items-center gap-2 group transition-all"
                    >
                        <span className={`uppercase tracking-widest text-primary/60 group-hover:text-primary leading-none inline-block ${mainFontClass}`}>MSC</span>
                        <span className={`uppercase tracking-widest leading-none inline-block ${playerState === 'playing' ? 'text-base-content/40' : 'text-base-content/20'} ${mainFontClass}`}>
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
                                    className="ml-2"
                                >
                                    <DigitalOscillator state={playerState} theme={themeMode} />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </button>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
