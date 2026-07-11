import React from 'react';
import { motion } from 'motion/react';
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

/** Animated Samaritan-style background field. Sits behind the assistant
 * page's center text; every color is a theme token via currentColor or
 * Tailwind classes, so it adapts to the active data-theme. */
const AssistantBackdrop: React.FC<{ mode: AssistantMode }> = ({ mode }) => {
    const busy = mode === 'processing' || mode === 'connecting';
    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
            {/* Static decoration: side data strip */}
            <div
                className="absolute top-1/3 right-6 bottom-1/3 w-2 opacity-25 text-base-content"
                style={{ backgroundImage: 'repeating-linear-gradient(0deg, currentColor 0 2px, transparent 2px 6px)' }}
            />

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

            {/* Radial pulse rings behind the center text while the assistant speaks.
                Centered via margin offsets, not a translate transform — Framer
                Motion's `scale` animation writes directly to this element's
                inline transform, which would silently cancel out a Tailwind
                -translate-x/y centering class instead of combining with it. */}
            {mode === 'responding' && [0, 1, 2].map(i => (
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
