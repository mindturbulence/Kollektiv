import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { appEventBus } from '../utils/eventBus';
import { useAssistantSignals } from '../utils/useAssistantSignals';
import { useSettings } from '../contexts/SettingsContext';
import AssistantBackdrop from './AssistantBackdrop';

// Get the translated prompt based on assistant language setting
const getPrompt = (language: string | undefined): string => {
    // Default to English if no language is set or not supported
    const lang = (language || 'en').toLowerCase();
    
    // Simple translation map for the prompt
    const translations: Record<string, string> = {
        'en': 'WHAT ARE YOUR COMMANDS?',
        'es': '¿CUÁLES SON TUS COMANDOS?',
        'es-mx': '¿CUÁLES SON TUS COMANDOS?',
        'es-es': '¿CUÁLES SON TUS COMANDOS?',
        'fr': 'QUELS SONT VOS COMMANDES ?',
        'fr-fr': 'QUELS SONT VOS COMMANDES ?',
        'de': 'WAS SIND DEINE BEFEHLE?',
        'de-de': 'WAS SIND DEINE BEFEHLE?',
        'it': "QUALI SONO I TUOI COMANDI?",
        'it-it': "QUALI SONO I TUOI COMANDI?",
        'pt': 'QUAIS SÃO OS SEUS COMANDOS?',
        'pt-br': 'QUAIS SÃO OS SEUS COMANDOS?',
        'pt-pt': 'QUAIS SÃO OS SEUS COMANDOS?',
        'ru': 'КАКИЕ У ТЕБЯ КОМАНДЫ?',
        'ru-ru': 'КАКИЕ У ТЕБЯ КОМАНДЫ?',
        'ja': 'あなたのコマンドは何ですか？',
        'zh': '您的命令是什么？',
        'zh-cn': '您的命令是什么？',
        'zh-tw': '您的命令是什麼？',
        'ko': '당신의 명령은 무엇입니까?',
        'ko-kr': '당신의 명령은 무엇입니까?',
        'ar': 'مَا هِيَ أَوْامِرُكَ؟',
        'ar-sa': 'مَا هِيَ أَوْامِرُكَ؟',
        'hi': 'आपके आदेश क्या हैं?',
        'hi-in': 'आपके आदेश क्या हैं?',
    };
    
    // Try to get exact match first, then try without locale variant, then default to English
    return translations[lang] || 
           translations[lang.split('-')[0]] || 
           translations['en'];
};

const STOPWORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'so', 'because', 'as', 'of', 'to', 'in', 'on', 'at', 'by',
    'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'from', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'is', 'are', 'was', 'were', 'be',
    'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'will', 'would', 'shall',
    'should', 'can', 'could', 'may', 'might', 'must', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'this', 'that',
    'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'me', 'him', 'us', 'them', 'not', 'no',
    'yes', 'just', 'very', 'really', 'also', 'too', 'there', 'here', 'what', 'which', 'who', 'whom', 'when',
    'where', 'why', 'how', 'okay', 'ok', 'sure', 'well', 'like', 'get', 'got', 'gonna', 'going', 'let', 'lets',
]);

/** Picks the words worth putting on screen out of a full reply — content
 * words, acronyms, and numbers — instead of replaying the whole sentence
 * verbatim. A live reply is much longer than what a glanceable HUD needs,
 * and trying to reveal every single word in sync with speech is a losing
 * race; showing only what actually carries information keeps the reveal
 * short enough to stay calm and readable. */
const pickImportant = (text: string): string => {
    const words = text.trim() ? text.trim().split(/\s+/) : [];
    return words.filter(w => {
        const clean = w.replace(/[^a-zA-Z0-9']/g, '');
        if (!clean) return false;
        if (/\d/.test(clean)) return true;
        if (clean.length >= 2 && clean.length <= 4 && clean === clean.toUpperCase() && /[A-Z]/.test(clean)) return true;
        return clean.length >= 5 && !STOPWORDS.has(clean.toLowerCase());
    }).join(' ');
};

/** CSS triangle in the theme accent color — the Samaritan sigil. Always on
 * screen, gently pulsing; it never collapses or hides. */
const Sigil: React.FC = () => (
    <motion.div animate={{ opacity: [1, 0.25, 1] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}>
        <div className="w-0 h-0 border-l-[18px] border-r-[18px] border-b-[30px] border-l-transparent border-r-transparent border-b-primary" />
    </motion.div>
);

// Shared type stack for the big center text — Samaritan-style: large, mono, spaced.
const BIG_TEXT = 'font-mono text-3xl md:text-5xl tracking-[0.2em] uppercase text-base-content leading-relaxed';

/** Text row with its underline bar sized to match — the bar always stays on
 * screen (30px when there's no text yet) and grows/shrinks to the text's
 * width as it changes. `layout` gives the resize a smooth tween instead of
 * an instant jump whenever the word changes. */
const Underline: React.FC<{ children: React.ReactNode; text: string }> = ({ children, text }) => (
    <div className="inline-flex flex-col items-center gap-5">
        <span className={`${BIG_TEXT} whitespace-nowrap px-2`}>{children}</span>
        <motion.div
            layout
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="h-[3px] bg-base-content self-stretch"
            style={text ? undefined : { width: 30, alignSelf: 'center' }}
        />
    </div>
);

/** Word-at-a-time display per the reference demo: each word replaces the
 * last, with its underline growing/shrinking to match. When `streaming` the
 * trailing token is held back until whitespace confirms it's a complete
 * word. `onDone` fires once the full, non-streaming text has been revealed
 * — the caller uses it to know when it's finally safe to switch away from
 * this view. */
const Stage: React.FC<{ text: string; streaming?: boolean; wordTime?: number; onDone?: () => void }> = ({
    text,
    streaming = false,
    wordTime = 550,
    onDone,
}) => {
    const words = text.trim() ? text.trim().split(/\s+/) : [];
    const ready = streaming ? Math.max(0, words.length - 1) : words.length;
    const [idx, setIdx] = useState(-1);
    const onDoneRef = useRef(onDone);
    onDoneRef.current = onDone;
    const notifiedRef = useRef(false);

    useEffect(() => {
        if (idx >= ready) {
            if (!streaming && !notifiedRef.current) {
                notifiedRef.current = true;
                onDoneRef.current?.();
            }
            return;
        }
        notifiedRef.current = false;
        // Longer words linger longer, like the reference implementation.
        const shown = idx >= 0 ? words[idx] : '';
        const hold = idx < 0 ? 120 : wordTime + Math.max(0, shown.length - 7) * 60;
        const t = setTimeout(() => setIdx(i => i + 1), hold);
        return () => clearTimeout(t);
    }, [idx, ready, wordTime, streaming]);

    // Once caught up to `ready`, keep showing the last word revealed instead
    // of blanking out while waiting for the next one (or for streaming to
    // end) — the gap between replies should never go empty.
    const shownIdx = Math.min(idx, ready - 1);
    const word = shownIdx >= 0 ? words[shownIdx] : '';

    return <Underline text={word}>{word || ' '}</Underline>;
};

/** Terminal-style reveal of the command prompt: the sentence types out
 * character-by-character with a blinking cursor and a matching underline.
 * Used both for the very first boot and as the periodic idle reminder (see
 * AssistantPage). */
const TerminalPrompt: React.FC<{ text: string; onDone?: () => void }> = ({ text, onDone }) => {
    const [n, setN] = useState(0);
    const done = n >= text.length;
    const shown = text.slice(0, n);

    useEffect(() => {
        if (done) {
            if (onDone) {
                onDone();
            }
            return;
        }
        const t = setTimeout(() => setN(v => v + 1), 45);
        return () => clearTimeout(t);
    }, [n, done, onDone]);

    return (
        <Underline text={shown}>
            {shown}
            {!done && <span className="inline-block w-[0.5ch] h-[0.9em] bg-base-content align-middle ml-1 animate-pulse" />}
        </Underline>
    );
};

/** Fullscreen Samaritan-style face of the live voice assistant. Mounted as the
 * 'assistant' tab; the mic toggle navigates here on session start and this
 * page navigates back to the dashboard when the session ends. The AI reply
 * streams as the large center text (no subtitle strip on this screen). */
const AssistantPage: React.FC = () => {
    const { mode, status, error, userText, assistantText, activity } = useAssistantSignals();
    const { settings } = useSettings();
    const PROMPT = getPrompt(settings.assistantLanguage);

    // Only the words worth reading actually get displayed — see
    // pickImportant. Kept in a ref too so the completion callback below
    // (which fires from an effect, not a render) can read the latest value.
    const importantText = pickImportant(assistantText);
    const importantTextRef = useRef(importantText);
    importantTextRef.current = importantText;

    // The word-by-word reveal can't always keep pace with speech, so leaving
    // 'responding' the instant audio playback ends would cut the reply off
    // mid-sentence. displayMode mirrors `mode` except it holds on
    // 'responding' until Stage finishes revealing the full text, then jumps
    // to wherever `mode` has moved on to.
    const [displayMode, setDisplayMode] = useState(mode);
    const modeRef = useRef(mode);
    modeRef.current = mode;
    const holdingRef = useRef(false);

    useEffect(() => {
        if (mode === 'responding') {
            holdingRef.current = false;
            setDisplayMode('responding');
            return;
        }
        setDisplayMode(prev => {
            if (holdingRef.current) return prev;
            if (prev === 'responding') {
                holdingRef.current = true;
                return prev;
            }
            return mode;
        });
    }, [mode]);

    // Once a reply finishes revealing, its last word stays on screen through
    // idle command mode — a lingering "last thing said" — until either a new
    // conversation starts or the idle reminder below takes over.
    const lastWordRef = useRef('');
    const handleStageDone = useCallback(() => {
        holdingRef.current = false;
        const words = importantTextRef.current.trim().split(/\s+/).filter(Boolean);
        lastWordRef.current = words[words.length - 1] || '';
        setDisplayMode(modeRef.current);
    }, []);

    // The command prompt types out once on first boot. After that, idle
    // command mode shows the last thing the assistant said until the user
    // has been idle for as long as the app's own idle-screen timeout
    // (settings.idleTimeoutMinutes) — then it resurfaces as a reminder.
    const shownIntroRef = useRef(false);
    const commandViewRef = useRef<'intro' | 'idle'>('idle');
    const [reminderShown, setReminderShown] = useState(false);
    const prevModeRef = useRef<typeof displayMode | null>(null);
    if (displayMode === 'command' && prevModeRef.current !== 'command') {
        commandViewRef.current = shownIntroRef.current ? 'idle' : 'intro';
        shownIntroRef.current = true;
    }
    prevModeRef.current = displayMode;

    useEffect(() => {
        setReminderShown(false);
        if (displayMode !== 'command' || commandViewRef.current === 'intro') return;
        const t = window.setTimeout(() => setReminderShown(true), settings.idleTimeoutMinutes * 60000);
        return () => window.clearTimeout(t);
    }, [displayMode, settings.idleTimeoutMinutes]);

    // Session over — return home. Also bounces straight out if someone lands
    // here without an active session. Errors linger long enough to read.
    useEffect(() => {
        if (status !== 'idle' && status !== 'error') return;
        const t = setTimeout(() => appEventBus.emit('navigate', 'dashboard'), status === 'error' ? 4000 : 800);
        return () => clearTimeout(t);
    }, [status]);

    return (
        <div className="absolute inset-0 bg-base-100 overflow-hidden select-none flex items-center justify-center">
            <AssistantBackdrop mode={displayMode} />

            {/* Status readouts, centered top and bottom */}
            <div className="absolute top-4 inset-x-0 flex justify-center font-mono text-[9px] tracking-[0.4em] uppercase text-base-content/30 pointer-events-none">
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
                <AnimatePresence mode="popLayout">
                    <motion.div
                        key={displayMode}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="relative z-10 flex flex-col items-center gap-6 max-w-5xl px-8 text-center"
                    >
                        {/* Fixed-height label slot above the core text — keeps the
                            core text and sigil pinned to the same spot whether or
                            not a given mode uses this row. */}
                        <div className="h-5 flex items-center justify-center">
                            {displayMode === 'listening' && (
                                <p className="font-mono text-[10px] tracking-[0.5em] uppercase text-primary/70">RECEIVING</p>
                            )}
                        </div>

                        {/* Core: exactly one text+underline row in every mode, so
                            its position never shifts with the text's presence or
                            length. */}
                        {displayMode === 'connecting' && (
                            <Stage text="ESTABLISHING UPLINK..." wordTime={450} />
                        )}

                        {displayMode === 'command' && (
                            commandViewRef.current === 'intro' || reminderShown ? (
                                <TerminalPrompt text={PROMPT} />
                            ) : lastWordRef.current ? (
                                <Underline text={lastWordRef.current}>{lastWordRef.current}</Underline>
                            ) : (
                                <Underline text="">{' '}</Underline>
                            )
                        )}

                        {displayMode === 'listening' && (
                            <Underline text={userText}>{userText || ' '}</Underline>
                        )}

                        {displayMode === 'processing' && (
                            <Underline text="ANALYZING">ANALYZING</Underline>
                        )}

                        {displayMode === 'responding' && (
                            <TerminalPrompt
                                text={importantText}
                                onDone={handleStageDone}
                            />
                        )}

                        <Sigil />

                        {/* Fixed-height slot below the sigil — processing's
                            activity feed lives here; empty (but the same height)
                            everywhere else, so the core above never shifts. */}
                        <div className="min-h-[96px] flex flex-col items-center gap-6">
                            {displayMode === 'processing' && (
                                <>
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
                        </div>
                    </motion.div>
                </AnimatePresence>
            )}
        </div>
    );
};

export default AssistantPage;
