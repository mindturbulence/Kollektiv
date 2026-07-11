import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { appEventBus } from '../utils/eventBus';
import { useAssistantSignals } from '../utils/useAssistantSignals';
import AssistantBackdrop from './AssistantBackdrop';

const PROMPT = 'WHAT ARE YOUR COMMANDS?';

/** CSS triangle in the theme accent color — the Samaritan sigil. */
const Sigil: React.FC = () => (
    <div className="w-0 h-0 border-l-[18px] border-r-[18px] border-b-[30px] border-l-transparent border-r-transparent border-b-primary" />
);

// Shared type stack for the big center text — Samaritan-style: large, mono, spaced.
const BIG_TEXT = 'font-mono text-3xl md:text-5xl tracking-[0.2em] uppercase text-base-content leading-relaxed';

/** Word-at-a-time display per the reference demo: each word replaces the last,
 * the underline bar matches the word's width (30px when empty), and the sigil
 * collapses while words play, then blinks once the phrase is done. When
 * `streaming` the trailing token is held back until whitespace confirms it's a
 * complete word. */
const Stage: React.FC<{ text: string; streaming?: boolean; wordTime?: number; sigil?: boolean }> = ({
    text,
    streaming = false,
    wordTime = 550,
    sigil = true,
}) => {
    const words = text.trim() ? text.trim().split(/\s+/) : [];
    const ready = streaming ? Math.max(0, words.length - 1) : words.length;
    const [idx, setIdx] = useState(-1);

    useEffect(() => {
        if (idx >= ready) return;
        // Longer words linger longer, like the reference implementation.
        const shown = idx >= 0 ? words[idx] : '';
        const hold = idx < 0 ? 120 : wordTime + Math.max(0, shown.length - 7) * 60;
        const t = setTimeout(() => setIdx(i => i + 1), hold);
        return () => clearTimeout(t);
    }, [idx, ready, wordTime]);

    const word = idx >= 0 && idx < ready ? words[idx] : '';
    const playing = idx < ready || word !== '';

    return (
        <div className="flex flex-col items-center gap-6">
            <div className="inline-flex flex-col items-center gap-5">
                <span className={`${BIG_TEXT} whitespace-nowrap px-2`}>{word || ' '}</span>
                <div className="h-[3px] bg-base-content self-stretch" style={word ? undefined : { width: 30, alignSelf: 'center' }} />
            </div>
            {sigil && (
                <motion.div animate={{ scale: playing ? 0 : 1 }} transition={{ duration: 0.15 }}>
                    <motion.div animate={{ opacity: [1, 0.25, 1] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}>
                        <Sigil />
                    </motion.div>
                </motion.div>
            )}
        </div>
    );
};

/** One-time terminal-style reveal of the command prompt: the full sentence
 * types out character-by-character with a blinking cursor. Only ever shown
 * once per page visit — later returns to command mode just show the idle
 * sigil (see AssistantPage). */
const TerminalPrompt: React.FC<{ text: string }> = ({ text }) => {
    const [n, setN] = useState(0);
    const done = n >= text.length;

    useEffect(() => {
        if (done) return;
        const t = setTimeout(() => setN(v => v + 1), 45);
        return () => clearTimeout(t);
    }, [n, done]);

    return (
        <div className="flex flex-col items-center gap-6">
            <p className={`${BIG_TEXT} text-center`}>
                {text.slice(0, n)}
                {!done && <span className="inline-block w-[0.5ch] h-[0.9em] bg-base-content align-middle ml-1 animate-pulse" />}
            </p>
            <motion.div animate={{ scale: done ? 1 : 0 }} transition={{ duration: 0.15 }}>
                <motion.div animate={{ opacity: [1, 0.25, 1] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}>
                    <Sigil />
                </motion.div>
            </motion.div>
        </div>
    );
};

/** Fullscreen Samaritan-style face of the live voice assistant. Mounted as the
 * 'assistant' tab; the mic toggle navigates here on session start and this
 * page navigates back to the dashboard when the session ends. The AI reply
 * streams as the large center text (no subtitle strip on this screen). */
const AssistantPage: React.FC = () => {
    const { mode, status, error, userText, assistantText, activity } = useAssistantSignals();

    // Tracks whether the command-mode intro sentence has played this visit —
    // it only ever types out once; later returns to command mode just show
    // the idle sigil.
    const shownIntroRef = useRef(false);
    const commandViewRef = useRef<'intro' | 'idle'>('idle');
    const prevModeRef = useRef<typeof mode | null>(null);
    if (mode === 'command' && prevModeRef.current !== 'command') {
        commandViewRef.current = shownIntroRef.current ? 'idle' : 'intro';
        shownIntroRef.current = true;
    }
    prevModeRef.current = mode;

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

            {/* Corner readout */}
            <div className="absolute top-4 left-5 font-mono text-[9px] tracking-[0.4em] uppercase text-base-content/30">
                {status === 'live' ? 'UPLINK ACTIVE' : status.toUpperCase()}
            </div>
            <div className="absolute bottom-4 inset-x-0 flex justify-center font-mono text-[9px] tracking-[0.4em] uppercase text-base-content/30 pointer-events-none">
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
                            <Stage text="ESTABLISHING UPLINK..." wordTime={450} />
                        )}

                        {mode === 'command' && (
                            commandViewRef.current === 'intro' ? (
                                <TerminalPrompt text={PROMPT} />
                            ) : (
                                <motion.div animate={{ opacity: [1, 0.25, 1] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}>
                                    <Sigil />
                                </motion.div>
                            )
                        )}

                        {mode === 'listening' && (
                            <>
                                <p className="font-mono text-[10px] tracking-[0.5em] uppercase text-primary/70">RECEIVING</p>
                                <p className="font-mono text-xl md:text-2xl tracking-[0.2em] uppercase text-base-content/80 leading-relaxed">{userText}</p>
                                <div className="w-[30px] h-[3px] bg-base-content" />
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
                            // Sigil stays collapsed for the whole reply, per the reference:
                            // the triangle only returns once the phrase is over (command mode).
                            <Stage text={assistantText} streaming wordTime={280} sigil={false} />
                        )}
                    </motion.div>
                </AnimatePresence>
            )}
        </div>
    );
};

export default AssistantPage;
