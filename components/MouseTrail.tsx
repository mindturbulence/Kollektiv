
import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

const MouseTrail: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  
  const mouse = useRef({ x: 0, y: 0 });
  const ringPos = useRef({ x: 0, y: 0 });
  const points = useRef<{ x: number; y: number }[]>([]);
  const isHovering = useRef(false);

  // Configuration
  const nodeCount = 18; 
  const trailLerp = 0.18;    
  const ringLerp = 0.15;   
  const jitterIntensity = 2.5;
  const pulseSpeed = 0.008; // Radians per frame
  const pulseMagnitude = 0.12; // 12% scale variation
  
  useEffect(() => {
    const canvas = canvasRef.current;
    const cursor = cursorRef.current;
    const ring = ringRef.current;
    if (!canvas || !cursor || !ring) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set initial positions
    const initX = window.innerWidth / 2;
    const initY = window.innerHeight / 2;
    mouse.current = { x: initX, y: initY };
    ringPos.current = { x: initX, y: initY };
    points.current = Array.from({ length: nodeCount }, () => ({ x: initX, y: initY }));

    // GSAP QuickSetters for high-performance frame updates
    const setCursorX = gsap.quickSetter(cursor, "x", "px");
    const setCursorY = gsap.quickSetter(cursor, "y", "px");
    const setRingX = gsap.quickSetter(ring, "x", "px");
    const setRingY = gsap.quickSetter(ring, "y", "px");
    const setRingScale = gsap.quickSetter(ring, "scale");

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseOver = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const isInteractive = target.closest('button, a, input, select, textarea, [role="button"], .cursor-pointer, .tab');
        
        if (isInteractive && !isHovering.current) {
            isHovering.current = true;
            gsap.to([cursor, ring, canvas], {
                autoAlpha: 1,
                scale: 1,
                duration: 0.5,
                ease: "elastic.out(1, 0.5)",
                overwrite: true
            });
        } else if (!isInteractive && isHovering.current) {
            isHovering.current = false;
            gsap.to([cursor, ring, canvas], {
                autoAlpha: 0,
                scale: 0.2,
                duration: 0.4,
                ease: "power2.in",
                overwrite: true
            });
        }
    };

    const update = (time: number) => {
      // 1. Move Inner Dot (Snappy follower)
      setCursorX(mouse.current.x);
      setCursorY(mouse.current.y);

      // 2. Move Outer Ring (Delayed follower)
      ringPos.current.x += (mouse.current.x - ringPos.current.x) * ringLerp;
      ringPos.current.y += (mouse.current.y - ringPos.current.y) * ringLerp;

      // Apply Neural Jitter & Pulse Effect
      let jitterX = 0;
      let jitterY = 0;
      let currentPulse = 1;

      if (isHovering.current) {
          // Pulse scale based on time
          currentPulse = 1 + (Math.sin(time * pulseSpeed) * pulseMagnitude);
          
          // Neural Jitter
          jitterX = (Math.random() - 0.5) * jitterIntensity;
          jitterY = (Math.random() - 0.5) * jitterIntensity;
          
          setRingScale(currentPulse);
      }

      setRingX(ringPos.current.x + jitterX);
      setRingY(ringPos.current.y + jitterY);

      // 3. Update Trail Physics (Follows the RING position)
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      let leader = { x: ringPos.current.x, y: ringPos.current.y };
      
      points.current.forEach((p, i) => {
        p.x += (leader.x - p.x) * trailLerp;
        p.y += (leader.y - p.y) * trailLerp;
        leader = { ...p };
      });

      // 4. Draw Trail
      if (isHovering.current) {
          const rootStyle = getComputedStyle(document.documentElement);
          const primaryColor = rootStyle.getPropertyValue('--p').trim();
          
          ctx.strokeStyle = primaryColor ? `oklch(${primaryColor})` : '#641ae6';
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          for (let i = 1; i < points.current.length; i++) {
            const p1 = points.current[i - 1];
            const p2 = points.current[i];
            
            const opacity = (1 - (i / points.current.length)) * 0.4;
            const width = (points.current.length - i) * 0.8;

            ctx.beginPath();
            ctx.globalAlpha = opacity;
            ctx.lineWidth = Math.max(0.5, width);
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseover', handleMouseOver);
    handleResize();
    
    // Set initial state
    gsap.set([cursor, ring, canvas], { autoAlpha: 0, scale: 0.5 });
    
    // Use GSAP ticker with time for smooth modulation
    const tickerHandler = () => update(performance.now());
    gsap.ticker.add(tickerHandler);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseover', handleMouseOver);
      gsap.ticker.remove(tickerHandler);
    };
  }, []);

  return (
    <>
      {/* Visual Canvas for the trailing segment */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 z-[9990] pointer-events-none select-none"
      />
      
      {/* The Pulsating/Jittery Outer Ring */}
      <div 
        ref={ringRef}
        className="fixed top-0 left-0 w-12 h-12 -ml-6 -mt-6 border border-primary/30 rounded-full z-[9991] pointer-events-none bg-primary/5 shadow-[0_0_20px_oklch(var(--p)/0.1)]"
        style={{ willChange: 'transform' }}
      />

      {/* The Core Dot */}
      <div 
        ref={cursorRef}
        className="fixed top-0 left-0 w-1.5 h-1.5 -ml-0.75 -mt-0.75 bg-primary rounded-full z-[9992] pointer-events-none shadow-[0_0_12px_oklch(var(--p))]"
        style={{ willChange: 'transform' }}
      />
    </>
  );
};

export default MouseTrail;
