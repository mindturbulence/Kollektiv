import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

interface CustomScrollbarProps {
  containerRef: React.RefObject<HTMLDivElement>;
}

const CustomScrollbar: React.FC<CustomScrollbarProps> = ({ containerRef }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateThumb = () => {
      const thumb = thumbRef.current;
      const { scrollTop, scrollHeight, clientHeight } = container;
      const canScroll = scrollHeight > clientHeight + 2;
      
      if (canScroll !== isVisible) {
        setIsVisible(canScroll);
      }

      if (!canScroll || !thumb) return;

      const scrollPercent = scrollTop / (scrollHeight - clientHeight);
      const thumbHeight = Math.max(80, (clientHeight / scrollHeight) * clientHeight);
      const maxThumbTravel = clientHeight - thumbHeight;
      
      gsap.to(thumb, {
        y: scrollPercent * maxThumbTravel,
        height: thumbHeight,
        duration: 0.1,
        ease: "none",
        overwrite: true
      });
    };

    container.addEventListener('scroll', updateThumb, { passive: true });
    
    const resizeObserver = new ResizeObserver(() => {
        updateThumb();
    });
    
    resizeObserver.observe(container);
    // Observe children for content changes
    Array.from(container.children).forEach(child => resizeObserver.observe(child));

    // Initial check
    updateThumb();

    return () => {
      container.removeEventListener('scroll', updateThumb);
      resizeObserver.disconnect();
    };
  }, [containerRef, isVisible]);

  return (
    <div 
      ref={trackRef} 
      className={`absolute right-1 top-2 bottom-2 w-[1px] bg-primary/10 z-[100] pointer-events-none transition-opacity duration-500 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
    >
      <div 
        ref={thumbRef} 
        className="w-full bg-primary/60 rounded-none shadow-[0_0_8px_rgba(var(--p),0.2)]"
        style={{ 
            willChange: 'transform, height',
            backgroundColor: 'oklch(var(--p) / 0.6)'
        }}
      />
    </div>
  );
};

export default CustomScrollbar;
