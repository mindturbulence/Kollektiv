
import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useBusy } from '../contexts/BusyContext';

// Reticle corner brackets — same look as .corner-frame's corners in index.css.
const CORNERS = [
    'top-0 left-0 border-t border-l',
    'top-0 right-0 border-t border-r',
    'bottom-0 left-0 border-b border-l',
    'bottom-0 right-0 border-b border-r',
];

const CustomCursor: React.FC = () => {
    const cursorRef = useRef<HTMLDivElement>(null);
    const spinnerRef = useRef<HTMLDivElement>(null);
    const [isHovering, setIsHovering] = useState(false);
    const [coords, setCoords] = useState({ x: 0, y: 0 });
    const { isBusy } = useBusy();

    useEffect(() => {
        const cursor = cursorRef.current;
        if (!cursor) return;

        // Short follow so the square stays pinned to the arrow's hotspot.
        const moveX = gsap.quickTo(cursor, 'x', { duration: 0.08, ease: 'power3.out' });
        const moveY = gsap.quickTo(cursor, 'y', { duration: 0.08, ease: 'power3.out' });
        const moveCursor = (e: MouseEvent) => {
            if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return;
            setCoords({ x: e.clientX, y: e.clientY });
            moveX(e.clientX);
            moveY(e.clientY);
        };

        const handleMouseOver = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const isInteractive = target.closest('button, a, .cursor-pointer, input, select, textarea');
            if (isInteractive) {
                setIsHovering(true);
            }
        };

        const handleMouseOut = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const isInteractive = target.closest('button, a, .cursor-pointer, input, select, textarea');
            if (isInteractive) {
                setIsHovering(false);
            }
        };

        const handleMouseEnter = () => {
            gsap.to(cursor, { opacity: 1, duration: 0.3 });
        };
        const handleMouseLeave = () => {
            gsap.to(cursor, { opacity: 0, duration: 0.3 });
        };

        window.addEventListener('mousemove', moveCursor);
        window.addEventListener('mouseover', handleMouseOver);
        window.addEventListener('mouseout', handleMouseOut);
        document.addEventListener('mouseenter', handleMouseEnter);
        document.addEventListener('mouseleave', handleMouseLeave);

        return () => {
            window.removeEventListener('mousemove', moveCursor);
            window.removeEventListener('mouseover', handleMouseOver);
            window.removeEventListener('mouseout', handleMouseOut);
            document.removeEventListener('mouseenter', handleMouseEnter);
            document.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, []);

    useEffect(() => {
        if (isBusy && spinnerRef.current) {
            gsap.to(spinnerRef.current, {
                rotation: 360,
                repeat: -1,
                duration: 1,
                ease: "none"
            });
        } else if (spinnerRef.current) {
            gsap.killTweensOf(spinnerRef.current);
        }
    }, [isBusy]);

    return (
        // Zero-size anchor at the hotspot; children position off it.
        <div
            ref={cursorRef}
            className="fixed top-0 left-0 w-0 h-0 pointer-events-none z-system opacity-0 text-primary"
        >
            {/* Tiny square on the hotspot; grows into a corner-bracket reticle over interactive elements */}
            <div
                className={`absolute -translate-x-1/2 -translate-y-1/2 transition-[width,height,background-color] duration-200 ease-out ${isHovering ? 'w-7 h-7 bg-transparent' : 'w-1 h-1 bg-primary/70'}`}
            >
                {CORNERS.map(pos => (
                    <span
                        key={pos}
                        className={`absolute ${pos} w-2 h-2 border-current transition-opacity duration-200 ${isHovering ? 'opacity-100' : 'opacity-0'}`}
                    />
                ))}
            </div>

            {/* X/Y readout at the bottom right of the system arrow */}
            <div className={`absolute left-4 top-5 flex flex-col gap-0.5 transition-opacity duration-300 ${isBusy ? 'opacity-0' : 'opacity-100'}`}>
                <span className="text-[8px] font-mono font-bold opacity-40 leading-none uppercase tracking-tighter">
                    X:{coords.x.toString().padStart(4, '0')}
                </span>
                <span className="text-[8px] font-mono font-bold opacity-40 leading-none uppercase tracking-tighter">
                    Y:{coords.y.toString().padStart(4, '0')}
                </span>
            </div>

            {isBusy && (
                <div className="absolute left-4 top-5 flex items-center gap-2 animate-fade-in whitespace-nowrap">
                    <div
                        ref={spinnerRef}
                        className="w-3 h-3 border border-current border-t-current rounded-full"
                    />
                    <span className="text-[7px] font-mono font-bold uppercase tracking-[0.3em]">
                        SYNCING
                    </span>
                </div>
            )}
        </div>
    );
};

export default CustomCursor;
