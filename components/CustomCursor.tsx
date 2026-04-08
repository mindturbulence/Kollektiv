
import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useBusy } from '../contexts/BusyContext';

const CustomCursor: React.FC = () => {
    const labelRef = useRef<HTMLDivElement>(null);
    const spinnerRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState({ x: 0, y: 0 });
    const { isBusy } = useBusy();

    useEffect(() => {
        const label = labelRef.current;
        if (!label) return;

        const moveCursor = (e: MouseEvent) => {
            setCoords({ x: e.clientX, y: e.clientY });

            gsap.to(label, {
                x: e.clientX,
                y: e.clientY,
                duration: 0.1,
                ease: "power2.out",
            });
        };

        const handleMouseEnter = () => {
            if (label) label.style.opacity = '1';
        };
        const handleMouseLeave = () => {
            if (label) label.style.opacity = '0';
        };

        window.addEventListener('mousemove', moveCursor);
        document.addEventListener('mouseenter', handleMouseEnter);
        document.addEventListener('mouseleave', handleMouseLeave);

        return () => {
            window.removeEventListener('mousemove', moveCursor);
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
        <div
            ref={labelRef}
            className="fixed top-5 left-5 pointer-events-none z-[9999] mix-blend-difference opacity-0 transition-opacity duration-300 flex items-center gap-3">
            
            {isBusy ? (
                <div className="flex items-center gap-3 animate-fade-in">
                    <div 
                        ref={spinnerRef}
                        className="w-6 h-6 border border-white/20 border-t-white rounded-full"
                    />
                    <span className="text-[10px] font-mono font-bold text-white uppercase tracking-[0.2em]">
                        Processing...
                    </span>
                </div>
            ) : (
                <div className="flex flex-col animate-fade-in">
                    <span className="text-[10px] font-mono font-bold text-white/60 leading-none whitespace-nowrap">
                        Y:{coords.y}PX
                    </span>
                    <span className="text-[10px] font-mono font-bold text-white/60 leading-none whitespace-nowrap">
                        X:{coords.x}PX
                    </span>
                </div>
            )}
        </div>
    );
};

export default CustomCursor;
