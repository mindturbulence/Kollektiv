
import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

const CustomCursor: React.FC = () => {
    const labelRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState({ x: 0, y: 0 });

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

    return (
        <div
            ref={labelRef}
            className="fixed top-5 left-5 pointer-events-none z-[9999] mix-blend-difference opacity-0 transition-opacity duration-300 flex flex-col">
            <span className="text-[10px] font-mono font-bold text-white/60 leading-none whitespace-nowrap">
                Y:{coords.y}PX
            </span>
            <span className="text-[10px] font-mono font-bold text-white/60 leading-none whitespace-nowrap">
                X:{coords.x}PX
            </span>
        </div>
    );
};

export default CustomCursor;
