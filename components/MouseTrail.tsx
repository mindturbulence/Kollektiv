
import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

const MouseTrail: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  
  const mouse = useRef({ x: 0, y: 0 });
  const ringPos = useRef({ x: 0, y: 0 });
  const points = useRef<{ x: number; y: number }[]>([]);
  const isHovering = useRef(false);

  // Configuration
  const nodeCount = 12; // Trail nodes
  const trailLerp = 0.2;    
  const ringLerp = 0.15;   
  
  // Frequency Ring Config
  const ringSegments = 128; // Increased for smoother circularity
  const baseRadius = 20;
  const hoverRadius = 26;
  const currentRadius = useRef(baseRadius);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    const cursor = cursorRef.current;
    if (!canvas || !cursor) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const initX = window.innerWidth / 2;
    const initY = window.innerHeight / 2;
    mouse.current = { x: initX, y: initY };
    ringPos.current = { x: initX, y: initY };
    points.current = Array.from({ length: nodeCount }, () => ({ x: initX, y: initY }));

    const setCursorX = gsap.quickSetter(cursor, "x", "px");
    const setCursorY = gsap.quickSetter(cursor, "y", "px");

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
            gsap.to(currentRadius, { current: hoverRadius, duration: 0.4, ease: "power3.out" });
            gsap.to(cursor, { scale: 1.5, duration: 0.3 });
        } else if (!isInteractive && isHovering.current) {
            isHovering.current = false;
            gsap.to(currentRadius, { current: baseRadius, duration: 0.6, ease: "elastic.out(1, 0.5)" });
            gsap.to(cursor, { scale: 1, duration: 0.3 });
        }
    };

    const update = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Get theme primary color dynamically
      const rootStyle = getComputedStyle(document.documentElement);
      const primaryColorStr = rootStyle.getPropertyValue('--p').trim();
      const primaryColor = primaryColorStr ? `oklch(${primaryColorStr})` : '#641ae6';

      // 1. Move Inner Dot
      setCursorX(mouse.current.x);
      setCursorY(mouse.current.y);

      // 2. Move Ring Position (Lerped)
      ringPos.current.x += (mouse.current.x - ringPos.current.x) * ringLerp;
      ringPos.current.y += (mouse.current.y - ringPos.current.y) * ringLerp;

      // 3. Draw Frequency Ring
      ctx.beginPath();
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = isHovering.current ? 1.2 : 1;
      ctx.globalAlpha = isHovering.current ? 0.6 : 0.15;

      for (let i = 0; i <= ringSegments; i++) {
          const angle = (i / ringSegments) * Math.PI * 2;
          
          // Improved Neural Frequency Logic:
          // We use higher frequencies (16, 32, 64) so the shape stays circular
          // but the "texture" of the line vibrates.
          const timeScale = time * 0.004;
          const rippleA = Math.sin(angle * 16 + timeScale) * (isHovering.current ? 1.5 : 0.8);
          const rippleB = Math.sin(angle * 32 - timeScale * 1.5) * (isHovering.current ? 1.0 : 0.4);
          
          // Subtle random micro-jitter for that "electric" feel
          const microJitter = (Math.random() - 0.5) * (isHovering.current ? 1.2 : 0.4);
          
          const r = currentRadius.current + rippleA + rippleB + microJitter;
          
          const x = ringPos.current.x + Math.cos(angle) * r;
          const y = ringPos.current.y + Math.sin(angle) * r;
          
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 4. Update and Draw Trail
      ctx.globalAlpha = isHovering.current ? 0.2 : 0.08;
      ctx.lineWidth = 1;
      let leader = { x: ringPos.current.x, y: ringPos.current.y };
      
      points.current.forEach((p, i) => {
        p.x += (leader.x - p.x) * trailLerp;
        p.y += (leader.y - p.y) * trailLerp;
        
        if (i > 0) {
            ctx.beginPath();
            ctx.moveTo(points.current[i-1].x, points.current[i-1].y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
        }
        leader = { ...p };
      });
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseover', handleMouseOver);
    handleResize();
    
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
      <canvas
        ref={canvasRef}
        className="fixed inset-0 z-[9990] pointer-events-none select-none"
      />
      
      {/* Precision Core Dot */}
      <div 
        ref={cursorRef}
        className="fixed top-0 left-0 w-1.5 h-1.5 -ml-0.75 -mt-0.75 bg-primary rounded-full z-[9992] pointer-events-none shadow-[0_0_10px_oklch(var(--p))]"
        style={{ willChange: 'transform' }}
      />
    </>
  );
};

export default MouseTrail;
