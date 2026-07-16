import React, { useEffect, useRef, useState } from 'react';
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

/** 10 idle prompt variations. After 3 minutes of silence on the assistant
 * screen the last-words display is replaced with a randomly chosen one,
 * and it keeps cycling every 30 seconds for variety. */
const COMMAND_VARIATIONS = [
    'WHAT ARE YOUR COMMANDS?',
    'AWAITING YOUR INSTRUCTION.',
    'READY FOR YOUR INPUT.',
    'STANDING BY FOR ORDERS.',
    'HOW MAY I BE OF SERVICE?',
    'YOUR DIRECTIVE, PLEASE.',
    'AT YOUR DISPOSAL.',
    'INPUT YOUR COMMAND.',
    'READY AND WAITING.',
    'STATE YOUR REQUEST.',
];

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
const TerminalPrompt: React.FC<{ text: string; onDone?: () => void; maxWords?: number }> = ({ text, onDone, maxWords }) => {
    const [n, setN] = useState(0);
    const done = n >= text.length;
    const shown = text.slice(0, n);

    // When maxWords is set, show only the last N words so the line never
    // grows wider than ~6 tokens — prevents text overlap during long replies.
    const displayText = (() => {
        if (!maxWords) return shown;
        const words = shown.trim().split(/\s+/);
        if (words.length <= maxWords) return shown;
        return words.slice(-maxWords).join(' ');
    })();

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
        <Underline text={displayText}>
            {displayText}
            {!done && <span className="inline-block w-[0.5ch] h-[0.9em] bg-base-content align-middle ml-1 animate-pulse" />}
        </Underline>
    );
};

/** Typewriter reveal for the latest activity context line. Resets and starts
 * typing from the beginning every time the text changes. */
const TypewriterActivity: React.FC<{ text: string }> = ({ text }) => {
    const [n, setN] = useState(0);
    const prevRef = useRef(text);
    if (prevRef.current !== text) {
        prevRef.current = text;
        setN(0);
    }
    const done = n >= text.length;
    const shown = text.slice(0, n);

    useEffect(() => {
        if (done) return;
        const t = setTimeout(() => setN(v => v + 1), 30);
        return () => clearTimeout(t);
    }, [n, done]);

    return (
        <Underline text={shown}>
            {shown}
            {!done && <span className="inline-block w-[0.5ch] h-[0.9em] bg-primary align-middle ml-1 animate-pulse" />}
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

    // AI-translated idle variations: on mount the English COMMAND_VARIATIONS
    // are sent to Gemini for a creative translation into the user's preferred
    // language. English is shown as fallback while loading or on error.
    const [localizedVariations, setLocalizedVariations] = useState<string[] | null>(null);

    useEffect(() => {
        const lang = settings.assistantLanguage;
        if (!lang || lang === 'en' || lang.startsWith('en-')) {
            setLocalizedVariations(COMMAND_VARIATIONS);
            return;
        }
        setLocalizedVariations(null);
        const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY;
        if (!apiKey) { setLocalizedVariations(COMMAND_VARIATIONS); return; }

        let cancelled = false;
        (async () => {
            try {
                const { getGeminiClient } = await import('../services/geminiService');
                const ai = getGeminiClient({ geminiApiKey: apiKey } as any);
                const result = await ai.models.generateContent({
                    model: 'gemini-3.5-flash',
                    contents: [{
                        role: 'user',
                        parts: [{
                            text: `You are a creative translator. Below are 10 command prompts in English that a voice assistant shows on screen while waiting for the user to speak. Translate each one into ${lang}. Be creative and idiomatic — make them sound natural in ${lang}, not literal translations. Keep them short and uppercase (or the closest equivalent in ${lang}). Return ONLY the translations, one per line, in the same order, no numbering:\n\n${COMMAND_VARIATIONS.join('\n')}`
                        }]
                    }],
                });
                const text = result.text?.trim();
                if (!cancelled && text) {
                    const lines = text.split('\n').map(l => l.trim().replace(/^\d+[\.\)]\s*/, '')).filter(Boolean);
                    setLocalizedVariations(lines.length === COMMAND_VARIATIONS.length ? lines : COMMAND_VARIATIONS);
                } else if (!cancelled) {
                    setLocalizedVariations(COMMAND_VARIATIONS);
                }
            } catch {
                if (!cancelled) setLocalizedVariations(COMMAND_VARIATIONS);
            }
        })();
        return () => { cancelled = true; };
    }, [settings.assistantLanguage, settings.geminiApiKey]);

    const idleVariations = localizedVariations ?? COMMAND_VARIATIONS;

    // Only the words worth reading actually get displayed — see
    // pickImportant. Kept in a ref too so the completion callback below
    // (which fires from an effect, not a render) can read the latest value.
    const importantText = pickImportant(assistantText);

    // displayMode follows `mode` directly — no hold mechanism since the
    // RollingCaption used for responding mode is stateless and updates
    // instantly, so there's no "reveal" timing to wait for.
    const [displayMode, setDisplayMode] = useState(mode);

    useEffect(() => {
        setDisplayMode(mode);
    }, [mode]);

    // The last word from the assistant's reply lingers in command mode.
    // Tracked via mode transition rather than a TerminalPrompt callback,
    // so the limit never depends on animation timing.
    const lastWordRef = useRef('');
    const prevModeRef2 = useRef(mode);

    useEffect(() => {
        if (prevModeRef2.current === 'responding' && mode !== 'responding') {
            const words = importantText.trim().split(/\s+/).filter(Boolean);
            lastWordRef.current = words[words.length - 1] || '';
        }
        prevModeRef2.current = mode;
    }, [mode]);

    // Tracks the last moment of actual conversation (responding, listening,
    // or processing) so we can detect 3 minutes of silence on the assistant
    // screen independently of the app-wide idle timeout.
    const lastActivityRef = useRef(Date.now());

    useEffect(() => {
        if (mode !== 'command') lastActivityRef.current = Date.now();
    }, [mode]);

    // The command prompt types out once on first boot. After that, idle
    // command mode shows the last thing the assistant said until the screen
    // has been silent for 3 minutes — then it cycles through a random
    // selection of 10 prompt variations to keep the display fresh.
    const shownIntroRef = useRef(false);
    const commandViewRef = useRef<'intro' | 'idle'>('idle');
    const [idlePromptIndex, setIdlePromptIndex] = useState(0);
    const [idleShown, setIdleShown] = useState(false);
    const prevModeRef = useRef<typeof displayMode | null>(null);

    if (displayMode === 'command' && prevModeRef.current !== 'command') {
        commandViewRef.current = shownIntroRef.current ? 'idle' : 'intro';
        shownIntroRef.current = true;
    }
    prevModeRef.current = displayMode;

    // Reset idle whenever conversation activity resumes.
    useEffect(() => {
        if (mode !== 'command') setIdleShown(false);
    }, [mode]);

    // 3-minute assistant-specific idle timer: checks every second, and once
    // the screen has been in command mode for 3 continuous minutes without
    // any conversation activity, it picks a random prompt variation to show.
    useEffect(() => {
        if (displayMode !== 'command' || commandViewRef.current === 'intro') {
            setIdleShown(false);
            return;
        }
        const t = window.setInterval(() => {
            const elapsed = Date.now() - lastActivityRef.current;
            if (elapsed >= 60_000 && !idleShown) {
                setIdlePromptIndex(Math.floor(Math.random() * idleVariations.length));
                setIdleShown(true);
            }
        }, 1000);
        return () => window.clearInterval(t);
    }, [displayMode, idleShown]);

    // Cycle the idle prompt every 30 seconds for variety while idle.
    useEffect(() => {
        if (!idleShown) return;
        const t = window.setInterval(() => {
            setIdlePromptIndex(prev => {
                let next;
                do { next = Math.floor(Math.random() * idleVariations.length); }
                while (next === prev);
                return next;
            });
        }, 30_000);
        return () => window.clearInterval(t);
    }, [idleShown]);

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
                            commandViewRef.current === 'intro' ? (
                                <TerminalPrompt text={PROMPT} />
                            ) : idleShown ? (
                                <TerminalPrompt text={idleVariations[idlePromptIndex]} />
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
                            activity.length > 0 ? (
                                <TypewriterActivity text={activity[activity.length - 1]} />
                            ) : (
                                <div className="flex gap-1">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <motion.div
                                            key={i}
                                            className="w-4 h-1 bg-primary/60"
                                            animate={{ opacity: [0.1, 1, 0.1] }}
                                            transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.09 }}
                                        />
                                    ))}
                                </div>
                            )
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
