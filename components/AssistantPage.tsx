import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { appEventBus } from '../utils/eventBus';
import { useAssistantSignals } from '../utils/useAssistantSignals';
import { useSettings } from '../contexts/SettingsContext';
import AssistantBackdrop from './AssistantBackdrop';

const PROMPT = 'WHAT ARE YOUR COMMANDS?';

/** CSS triangle in the theme accent color — the Samaritan sigil. */
const Sigil: React.FC = () => (
    <div className="w-0 h-0 border-l-[18px] border-r-[18px] border-b-[30px] border-l-transparent border-r-transparent border-b-primary" />
);

/** Types text one character at a time, restarting when `text` changes. */
const Typewriter: React.FC<{ text: string; speed?: number; className?: string }> = ({ text, speed = 30, className }) => {
    const [n, setN] = useState(0);
    useEffect(() => {
        setN(0);
        const id = setInterval(() => {
            setN(prev => {
                if (prev >= text.length) { clearInterval(id); return prev; }
                return prev + 1;
            });
        }, speed);
        return () => clearInterval(id);
    }, [text, speed]);
    return <span className={className}>{text.slice(0, n)}<span className="animate-pulse">_</span></span>;
};

// Shared type stack for the big center text — Samaritan-style: large, mono, spaced.
const BIG_TEXT = 'font-mono text-2xl md:text-4xl tracking-[0.3em] uppercase text-base-content leading-relaxed';

/** Fullscreen Samaritan-style face of the live voice assistant. Mounted as the
 * 'assistant' tab; the mic toggle navigates here on session start and this
 * page navigates back to the dashboard when the session ends. The AI reply
 * streams as the large center text (no subtitle strip on this screen). */
const AssistantPage: React.FC = () => {
    const { mode, status, error, userText, assistantText, activity } = useAssistantSignals();
    const { settings } = useSettings();
    const assistantName = settings.assistantName || 'Kollektiv';

    // Session over — return home. Also bounces straight out if someone lands
    // here without an active session. Errors linger long enough to read.
    useEffect(() => {
        if (status !== 'idle' && status !== 'error') return;
        const t = setTimeout(() => appEventBus.emit('navigate', 'dashboard'), status === 'error' ? 4000 : 800);
        return () => clearTimeout(t);
    }, [status]);

    return (
        <div className="absolute inset-0 bg-base-100 overflow-hidden select-none flex items-center justify-center">
            <AssistantBackdrop mode={mode} />

            {/* Wordmark — this is Kollektiv., not Samaritan */}
            <div className="absolute top-4 inset-x-0 flex justify-center pointer-events-none">
                <p className="font-monoton text-sm tracking-[0.4em] uppercase text-base-content/40">
                    {assistantName}<span className="text-primary italic">.</span>
                </p>
            </div>

            {/* Corner readouts */}
            <div className="absolute top-4 left-5 font-mono text-[9px] tracking-[0.4em] uppercase text-base-content/30">
                {status === 'live' ? 'UPLINK ACTIVE' : status.toUpperCase()}
            </div>
            <div className="absolute bottom-4 right-5 font-mono text-[9px] tracking-[0.4em] uppercase text-base-content/30">
                CTRL+SPACE TO END
            </div>

            {status === 'error' ? (
                <div className="relative z-10 flex flex-col items-center gap-6 max-w-3xl px-8 text-center">
                    <p className="font-mono text-xl md:text-3xl tracking-[0.4em] uppercase text-error">SYSTEM FAULT</p>
                    <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-base-content/50 leading-relaxed">{error}</p>
                </div>
            ) : (
                <AnimatePresence mode="wait">
                    <motion.div
                        key={mode}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="relative z-10 flex flex-col items-center gap-6 max-w-5xl px-8 text-center"
                    >
                        {mode === 'connecting' && (
                            <Typewriter text="ESTABLISHING UPLINK..." className="font-mono text-xl md:text-3xl tracking-[0.4em] uppercase text-base-content/70" />
                        )}

                        {mode === 'command' && (
                            <>
                                <Typewriter text={PROMPT} className={BIG_TEXT} />
                                <div className="w-64 h-[3px] bg-base-content" />
                                <motion.div animate={{ opacity: [1, 0.35, 1] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}>
                                    <Sigil />
                                </motion.div>
                            </>
                        )}

                        {mode === 'listening' && (
                            <>
                                <p className="font-mono text-[10px] tracking-[0.5em] uppercase text-primary/70">RECEIVING</p>
                                <p className={BIG_TEXT}>{userText}</p>
                                <div className="w-64 h-[3px] bg-base-content" />
                                <Sigil />
                            </>
                        )}

                        {mode === 'processing' && (
                            <>
                                <p className="font-mono text-xl md:text-3xl tracking-[0.5em] uppercase text-base-content/80">ANALYZING</p>
                                <div className="flex gap-1">
                                    {Array.from({ length: 7 }).map((_, i) => (
                                        <motion.div
                                            key={i}
                                            className="w-6 h-2 bg-primary"
                                            animate={{ opacity: [0.1, 1, 0.1] }}
                                            transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.09 }}
                                        />
                                    ))}
                                </div>
                                <div className="flex flex-col gap-1 min-h-[64px] items-center">
                                    {activity.map((line, i) => (
                                        <p key={`${i}-${line}`} className="font-mono text-[10px] tracking-[0.2em] uppercase text-primary/70 truncate max-w-[60vw]">
                                            {line}
                                        </p>
                                    ))}
                                </div>
                            </>
                        )}

                        {mode === 'responding' && (
                            <>
                                <p className={BIG_TEXT}>{assistantText}</p>
                                <div className="w-64 h-[3px] bg-base-content" />
                                <motion.div animate={{ scaleY: [1, 0.82, 1] }} transition={{ duration: 0.35, repeat: Infinity, ease: 'easeInOut' }}>
                                    <Sigil />
                                </motion.div>
                            </>
                        )}
                    </motion.div>
                </AnimatePresence>
            )}
        </div>
    );
};

export default AssistantPage;
