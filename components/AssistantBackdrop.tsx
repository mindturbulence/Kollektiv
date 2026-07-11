import React from 'react';
import { motion } from 'motion/react';
import type { AssistantMode } from '../utils/assistantMode';

// Deterministic pseudo-random so the glitch layout is stable across renders
const rand = (seed: number) => {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
};

const GLITCHES = Array.from({ length: 14 }, (_, i) => ({
    left: `${8 + rand(i) * 84}%`,
    top: `${8 + rand(i + 50) * 84}%`,
    width: 30 + rand(i + 100) * 160,
    height: 4 + rand(i + 150) * 26,
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

            {/* Horizontal scanline — leisurely sweep at rest, frantic while busy */}
            <motion.div
                className="absolute inset-x-0 h-px bg-primary/40"
                animate={{ top: ['-2%', '102%'] }}
                transition={{ duration: busy ? 1.8 : 9, repeat: Infinity, ease: 'linear', repeatDelay: busy ? 0 : 4 }}
            />

            {/* Glitch bursts while connecting/thinking — the video's flickering blocks */}
            {busy && GLITCHES.map((g, i) => (
                <motion.div
                    key={i}
                    className={i % 4 === 0 ? 'absolute bg-primary' : 'absolute bg-base-content'}
                    style={{ left: g.left, top: g.top, width: g.width, height: g.height }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.55, 0] }}
                    transition={{ duration: g.duration, repeat: Infinity, repeatDelay: 0.6 + g.delay, delay: g.delay }}
                />
            ))}

            {/* Radial pulse rings behind the center text while the assistant speaks */}
            {mode === 'responding' && [0, 1, 2].map(i => (
                <motion.div
                    key={i}
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border border-primary/30"
                    style={{ width: 240, height: 240 }}
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: [0.6, 2.2], opacity: [0.5, 0] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut', delay: i * 0.8 }}
                />
            ))}
        </div>
    );
};

export default AssistantBackdrop;
