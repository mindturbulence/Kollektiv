import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ScanLine } from './AnimatedPanels';
import type { AssistantMode } from '../utils/assistantMode';

// Deterministic pseudo-random so the glitch layout is stable across renders
const rand = (seed: number) => {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
};

const GLITCHES = Array.from({ length: 14 }, (_, i) => ({
    size: 30 + rand(i + 100) * 160,
    delay: rand(i + 200) * 1.4,
    duration: 0.25 + rand(i + 250) * 0.5,
}));

// Shared keyframe stops — triangle and strip glow run the same animation
const BUSY_LEFT_STOPS    = ['33%', '66%', '33%'];
const BUSY_RIGHT_STOPS   = ['66%', '33%', '66%'];
const SPEAK_LEFT_STOPS   = ['33%', '50%', '45%', '60%', '40%', '55%', '33%'];
const SPEAK_RIGHT_STOPS  = ['60%', '45%', '55%', '38%', '50%', '42%', '60%'];

const BUSY_TRANSITION  = { duration: 2.5, repeat: Infinity, ease: 'easeInOut' } as const;
const SPEAK_TRANSITION = { duration: 9,   repeat: Infinity, ease: 'easeInOut' } as const;

/** The glowing segment that runs along a strip — same `top` animation as its
 *  sibling triangle, offset upward by half its height so it stays centred on
 *  the triangle. */
const StripGlow: React.FC<{
    side: 'left' | 'right';
    topStops: string[];
    transition: object;
}> = ({ side, topStops, transition }) => {
    const sideClass = side === 'left' ? 'left-6' : 'right-6';
    return (
        <motion.div
            className={`absolute ${sideClass} w-[2px] pointer-events-none`}
            style={{
                height: 80,
                marginTop: -40,   // keep centred on the triangle
                background: 'linear-gradient(to bottom, transparent 0%, var(--color-primary, oklch(var(--p))) 50%, transparent 100%)',
                opacity: 0.6,
                filter: 'blur(1px)',
            }}
            animate={{ top: topStops }}
            transition={transition}
        />
    );
};

/** Animated Samaritan-style background field. Sits behind the assistant
 * page's center text; every color is a theme token via currentColor or
 * Tailwind classes, so it adapts to the active data-theme. */
const AssistantBackdrop: React.FC<{ mode: AssistantMode }> = ({ mode }) => {
    const busy     = mode === 'processing' || mode === 'connecting';
    const speaking = mode === 'responding';
    const active   = busy || speaking;

    // Pick the right keyframes based on mode
    const leftStops  = speaking ? SPEAK_LEFT_STOPS  : BUSY_LEFT_STOPS;
    const rightStops = speaking ? SPEAK_RIGHT_STOPS : BUSY_RIGHT_STOPS;
    const triTx      = speaking ? SPEAK_TRANSITION  : BUSY_TRANSITION;

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>

            {/* ── LEFT metering strip + glow + triangle ── */}
            <div
                className="absolute top-1/3 left-6 bottom-1/3 w-[2px] opacity-25 text-base-content"
                style={{ backgroundImage: 'repeating-linear-gradient(0deg, currentColor 0 2px, transparent 2px 6px)' }}
            />
            <AnimatePresence>
                {active && (
                    <>
                        {/* Strip glow follows triangle */}
                        <StripGlow
                            key="left-glow"
                            side="left"
                            topStops={leftStops}
                            transition={triTx}
                        />
                        {/* Triangle faces LEFT (◀) — points toward the strip */}
                        <motion.div
                            key="left-tri"
                            className="absolute left-[2.5rem] w-0 h-0 border-y-[6px] border-y-transparent border-r-[8px] border-r-primary"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1, top: leftStops }}
                            exit={{ opacity: 0 }}
                            transition={{ opacity: { duration: 0.8 }, top: triTx }}
                        />
                    </>
                )}
            </AnimatePresence>

            {/* ── RIGHT metering strip + glow + triangle ── */}
            <div
                className="absolute top-1/3 right-6 bottom-1/3 w-[2px] opacity-25 text-base-content"
                style={{ backgroundImage: 'repeating-linear-gradient(0deg, currentColor 0 2px, transparent 2px 6px)' }}
            />
            <AnimatePresence>
                {active && (
                    <>
                        {/* Strip glow follows triangle */}
                        <StripGlow
                            key="right-glow"
                            side="right"
                            topStops={rightStops}
                            transition={triTx}
                        />
                        {/* Triangle faces RIGHT (▶) — points toward the strip */}
                        <motion.div
                            key="right-tri"
                            className="absolute right-[2.5rem] w-0 h-0 border-y-[6px] border-y-transparent border-l-[8px] border-l-primary"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1, top: rightStops }}
                            exit={{ opacity: 0 }}
                            transition={{ opacity: { duration: 0.8 }, top: triTx }}
                        />
                    </>
                )}
            </AnimatePresence>

            {/* Scanline — same sweep used across the other page panels */}
            <ScanLine />

            {/* Glitch bursts while connecting/thinking — pulsing circles fixed at center */}
            {busy && GLITCHES.map((g, i) => (
                <motion.div
                    key={i}
                    className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${i % 4 === 0 ? 'bg-primary' : 'bg-base-content'}`}
                    style={{ width: g.size, height: g.size }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.55, 0] }}
                    transition={{ duration: g.duration, repeat: Infinity, repeatDelay: 0.6 + g.delay, delay: g.delay }}
                />
            ))}

            {/* Radial pulse rings while the assistant speaks */}
            {speaking && [0, 1, 2].map(i => (
                <motion.div
                    key={i}
                    className="absolute top-1/2 left-1/2 rounded-full border border-primary/30"
                    style={{ width: 240, height: 240, marginLeft: -120, marginTop: -120 }}
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: [0.6, 2.2], opacity: [0.5, 0] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut', delay: i * 0.8 }}
                />
            ))}
        </div>
    );
};

export default AssistantBackdrop;
