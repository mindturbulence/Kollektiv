
import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useBusy } from '../contexts/BusyContext';

const CustomCursor: React.FC = () => {
    const cursorRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const arrowRef = useRef<SVGSVGElement>(null);
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
        if (!cursorRef.current || !innerRef.current) return;
        
        const updateCursorColor = () => {
            const style = getComputedStyle(document.documentElement);
            const themeColor = style.getPropertyValue('--p').trim() || '#00ffa3';
            const textColor = style.getPropertyValue('--bc').trim() || '#ffffff';
            
            gsap.set(cursorRef.current, { color: textColor });
            gsap.set(innerRef.current, { borderColor: themeColor + '99' });
        };
        
        updateCursorColor();
        
        const observer = new MutationObserver(updateCursorColor);
        observer.observe(document.documentElement, { 
            attributes: true, 
            attributeFilter: ['data-theme'] 
        });
        
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!innerRef.current || !arrowRef.current) return;
        
        const getThemeColor = () => {
            if (typeof document !== 'undefined') {
                const style = getComputedStyle(document.documentElement);
                return style.getPropertyValue('--p').trim() || '#00ffa3';
            }
            return '#00ffa3';
        };
        
        const themeColor = getThemeColor();
        
        if (isHovering) {
            gsap.to(innerRef.current, {
                scale: 1.8,
                backgroundColor: themeColor + '26',
                borderColor: themeColor,
                borderRadius: '50%',
                duration: 0.6,
                ease: "power2.out"
            });
            gsap.to(arrowRef.current, {
                opacity: 1,
                scale: 1,
                rotation: 360,
                repeat: -1,
                duration: 1.5,
                ease: "none"
            });
        } else {
            gsap.to(innerRef.current, {
                scale: 1,
                backgroundColor: 'transparent',
                borderColor: themeColor + '99',
                borderRadius: '50%',
                duration: 0.8,
                ease: "power2.inOut"
            });
            gsap.to(arrowRef.current, {
                opacity: 0,
                scale: 0.5,
                rotation: 0,
                duration: 0.5,
                ease: "power2.inOut"
            });
            gsap.killTweensOf(arrowRef.current);
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
            className="fixed top-1 left-1 pointer-events-none z-[9999] opacity-0 flex items-center"
            style={{ width: 'auto', height: '40px' }}
        >
            <div className={`relative flex items-center justify-center transition-opacity duration-300 ${isBusy ? 'opacity-0' : 'opacity-100'}`}>
                <div 
                    ref={innerRef}
                    className="w-5 h-5 border rounded-full flex items-center justify-center overflow-hidden cursor-inner"
                    style={{ borderRadius: '50%', borderStyle: 'solid' }}
                >
                    {/* Rotating Half-Circle on hover */}
                    <svg 
                        ref={arrowRef}
                        className="w-3 h-3 opacity-0 scale-50"
                        style={{ color: 'inherit' }}
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="3" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                    >
                        <path d="M 12 4 A 8 8 0 0 1 12 20" />
                    </svg>
                </div>

                {/* X and Y Coordinates at the side */}
                <div className="ml-4 flex flex-col gap-0.5 pointer-events-none">
                    <span className="text-[8px] font-mono font-bold opacity-40 leading-none uppercase tracking-tighter">
                        X:{coords.x.toString().padStart(4, '0')}
                    </span>
                    <span className="text-[8px] font-mono font-bold opacity-40 leading-none uppercase tracking-tighter">
                        Y:{coords.y.toString().padStart(4, '0')}
                    </span>
                </div>
            </div>
            
            {isBusy && (
                <div className="absolute flex items-center gap-2 animate-fade-in whitespace-nowrap left-0">
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
