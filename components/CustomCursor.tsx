
import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useBusy } from '../contexts/BusyContext';

const CustomCursor: React.FC = () => {
    const cursorRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const spinnerRef = useRef<HTMLDivElement>(null);
    const [isHovering, setIsHovering] = useState(false);
    const [coords, setCoords] = useState({ x: 0, y: 0 });
    const { isBusy } = useBusy();

    useEffect(() => {
        const cursor = cursorRef.current;
        const inner = innerRef.current;
        if (!cursor || !inner) return;

        // Set initial state - positioned at bottom right of system cursor
        gsap.set(cursor, { xPercent: 10, yPercent: 10 });
        gsap.set(inner, { scale: 1 });

        const moveCursor = (e: MouseEvent) => {
            setCoords({ x: e.clientX, y: e.clientY });
            
            gsap.to(cursor, {
                x: e.clientX,
                y: e.clientY,
                duration: 0.4,
                ease: "power3.out",
            });
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
        if (!innerRef.current) return;
        if (isHovering) {
            gsap.to(innerRef.current, {
                scale: 1.8,
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                borderColor: 'rgba(255, 255, 255, 0.8)',
                duration: 0.3,
                ease: "back.out(1.7)"
            });
        } else {
            gsap.to(innerRef.current, {
                scale: 1,
                backgroundColor: 'transparent',
                borderColor: 'rgba(255, 255, 255, 0.6)',
                duration: 0.3,
                ease: "power2.out"
            });
        }
    }, [isHovering]);

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
        <div
            ref={cursorRef}
            className="fixed top-1 left-1 pointer-events-none z-[9999] mix-blend-difference opacity-0 flex items-center"
            style={{ width: 'auto', height: '40px' }}
        >
            <div className={`relative flex items-center justify-center transition-opacity duration-300 ${isBusy ? 'opacity-0' : 'opacity-100'}`}>
                <div 
                    ref={innerRef}
                    className="w-5 h-5 border border-white rounded-full flex items-center justify-center overflow-hidden"
                >
                    {/* Arrow Icon inside circle on hover */}
                    <svg 
                        className={`w-3 h-3 text-white transition-all duration-300 ${isHovering ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="3" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                    >
                        <line x1="7" y1="17" x2="17" y2="7"></line>
                        <polyline points="7 7 17 7 17 17"></polyline>
                    </svg>
                </div>

                {/* X and Y Coordinates at the side */}
                <div className="ml-4 flex flex-col gap-0.5 pointer-events-none">
                    <span className="text-[8px] font-mono font-bold text-white/40 leading-none uppercase tracking-tighter">
                        X:{coords.x.toString().padStart(4, '0')}
                    </span>
                    <span className="text-[8px] font-mono font-bold text-white/40 leading-none uppercase tracking-tighter">
                        Y:{coords.y.toString().padStart(4, '0')}
                    </span>
                </div>
            </div>
            
            {isBusy && (
                <div className="absolute flex items-center gap-2 animate-fade-in whitespace-nowrap left-0">
                    <div 
                        ref={spinnerRef}
                        className="w-3 h-3 border border-white/20 border-t-white rounded-full"
                    />
                    <span className="text-[7px] font-mono font-bold text-white uppercase tracking-[0.3em]">
                        SYNCING
                    </span>
                </div>
            )}
        </div>
    );
};

export default CustomCursor;
