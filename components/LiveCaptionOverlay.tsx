import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { appEventBus } from '../utils/eventBus';

const QUIET_MS = 4000;   // fade out after this much silence
const MAX_CHARS = 220;   // keep it subtitle-sized; older text scrolls off the front

/** Movie-subtitle strip floating just above the footer oscillator. Fed by
 * live-voice transcriptions AND streamed chat replies (both emit
 * 'liveCaption'); clears after a quiet period or when a voice session ends. */
const LiveCaptionOverlay: React.FC<{ hidden?: boolean }> = ({ hidden = false }) => {
    const [caption, setCaption] = useState<{ who: 'user' | 'assistant'; text: string } | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const offCaption = appEventBus.on('liveCaption', (p: { who: 'user' | 'assistant'; text: string }) => {
            setCaption(prev => ({
                who: p.who,
                text: prev && prev.who === p.who ? (prev.text + p.text).slice(-MAX_CHARS) : p.text,
            }));
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setCaption(null), QUIET_MS);
        });
        const offState = appEventBus.on('liveAssistantState', (s: { status: string }) => {
            if (s.status === 'idle' || s.status === 'error') setCaption(null);
        });
        return () => {
            offCaption();
            offState();
            if (timer.current) clearTimeout(timer.current);
        };
    }, []);

    if (hidden) return null;

    return (
        <div className="fixed bottom-[88px] inset-x-0 z-[720] flex justify-center pointer-events-none px-8">
            <AnimatePresence>
                {caption && (
                    <motion.div
                        key="live-caption"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.25 }}
                        className="max-w-[70vw]"
                    >
                        <p className="text-center text-sm md:text-base font-medium text-base-content bg-base-100/70 backdrop-blur-md px-4 py-2 border border-base-content/10 leading-snug">
                            <span className="uppercase text-[9px] tracking-[0.3em] text-primary/70 block mb-1">
                                {caption.who === 'user' ? 'You' : 'Assistant'}
                            </span>
                            {caption.text}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default LiveCaptionOverlay;
