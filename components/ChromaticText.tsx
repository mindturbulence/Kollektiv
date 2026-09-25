import React, { useState, useEffect, useRef } from 'react';

/** Idle CPU fix (M2): when disabled or hidden, the rAF loop doesn't start at
 *  all (previously it kept re-scheduling forever, re-rendering ~16×/s even
 *  while disabled and snapping to the clean state on every tick). The jitter
 *  also writes whole-state (no partial style churn) and picks the occasional
 *  contrast flash in the tick, not during render. */
const ChromaticText: React.FC<{ children: React.ReactNode; enabled?: boolean }> = ({ children, enabled = true }) => {
    const [offsets, setOffsets] = useState({ x1: 0, y1: 0, x2: 0, y2: 0, opacity: 1, flash: false });
    const requestRef = useRef<number>(0);
    const lastUpdate = useRef<number>(0);
    const [isVisible, setIsVisible] = useState(true);

    const spanRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        const el = spanRef.current;
        if (!el || typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver((entries) => {
            setIsVisible(entries[0]?.isIntersecting ?? true);
        }, { threshold: 0.01 });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        // Disabled or off-screen: cancel any scheduled frame and snap clean once.
        if (!enabled || !isVisible) {
            cancelAnimationFrame(requestRef.current);
            setOffsets({ x1: 0, y1: 0, x2: 0, y2: 0, opacity: 1, flash: false });
            return undefined;
        }

        const update = (time: number) => {
            // ~60ms "steppy" digital flicker, matching the original cadence.
            if (time - lastUpdate.current > 60) {
                lastUpdate.current = time;
                if (Math.random() > 0.1) { // 90% chance of jittering
                    setOffsets({
                        x1: (Math.random() - 0.5) * 4,
                        y1: (Math.random() - 0.5) * 2,
                        x2: (Math.random() - 0.5) * -4,
                        y2: (Math.random() - 0.5) * -2,
                        opacity: 0.8 + Math.random() * 0.2,
                        flash: Math.random() > 0.95,
                    });
                } else {
                    setOffsets({ x1: 0, y1: 0, x2: 0, y2: 0, opacity: 1, flash: false });
                }
            }
            requestRef.current = requestAnimationFrame(update);
        };
        requestRef.current = requestAnimationFrame(update);
        return () => cancelAnimationFrame(requestRef.current);
    }, [enabled, isVisible]);

    return (
        <span
            ref={spanRef}
            className="relative inline-block transition-opacity duration-75"
            style={{
                opacity: offsets.opacity,
                // Red Shadow + Cyan Shadow = Chromatic Aberration
                textShadow: enabled ? `
                    ${offsets.x1}px ${offsets.y1}px 0px rgba(255, 0, 80, 0.7),
                    ${offsets.x2}px ${offsets.y2}px 0px rgba(0, 255, 255, 0.7)
                ` : 'none',
                filter: (enabled && offsets.flash) ? 'contrast(1.5) brightness(1.2)' : 'none',
            }}
        >
            {children}
        </span>
    );
};

export default ChromaticText;
