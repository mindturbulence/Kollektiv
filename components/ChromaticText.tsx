import React, { useState, useEffect, useRef } from 'react';

const ChromaticText: React.FC<{ text: string; enabled?: boolean }> = ({ text, enabled = true }) => {
    const [offsets, setOffsets] = useState({ x1: 0, y1: 0, x2: 0, y2: 0, opacity: 1 });
    const requestRef = useRef<number>(0);
    const lastUpdate = useRef<number>(0);

    const update = (time: number) => {
        // Only update every ~60ms to create a "steppy" digital flicker rather than smooth motion
        if (time - lastUpdate.current > 60) {
            if (enabled) {
                const jitter = Math.random() > 0.1; // 90% chance of jittering when enabled
                
                if (jitter) {
                    setOffsets({
                        x1: (Math.random() - 0.5) * 4,
                        y1: (Math.random() - 0.5) * 2,
                        x2: (Math.random() - 0.5) * -4,
                        y2: (Math.random() - 0.5) * -2,
                        opacity: 0.8 + Math.random() * 0.2
                    });
                } else {
                    setOffsets({ x1: 0, y1: 0, x2: 0, y2: 0, opacity: 1 });
                }
            } else {
                // If disabled, snap back to clean state
                setOffsets({ x1: 0, y1: 0, x2: 0, y2: 0, opacity: 1 });
            }
            lastUpdate.current = time;
        }
        requestRef.current = requestAnimationFrame(update);
    };

    useEffect(() => {
        requestRef.current = requestAnimationFrame(update);
        return () => cancelAnimationFrame(requestRef.current);
    }, [enabled]);

    return (
        <span 
            className="relative inline-block transition-opacity duration-75"
            style={{ 
                opacity: offsets.opacity,
                // Red Shadow + Cyan Shadow = Chromatic Aberration
                textShadow: enabled ? `
                    ${offsets.x1}px ${offsets.y1}px 0px rgba(255, 0, 80, 0.7), 
                    ${offsets.x2}px ${offsets.y2}px 0px rgba(0, 255, 255, 0.7)
                ` : 'none',
                filter: (enabled && Math.random() > 0.95) ? 'contrast(1.5) brightness(1.2)' : 'none'
            }}
        >
            {text}
        </span>
    );
};

export default ChromaticText;
