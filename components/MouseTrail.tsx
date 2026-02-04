
import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

const MouseTrail: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  
  const mouse = useRef({ x: 0, y: 0 });
  const ringPos = useRef({ x: 0, y: 0 });
  const lastMouse = useRef({ x: 0, y: 0 });
  const points = useRef<{ x: number; y: number }[]>([]);
  const idleTime = useRef(0);
  const isIdle = useRef(false);

  // Configuration for "Manifesto" style
  const nodeCount = 14; 
  const trailSpeed = 0.3;    
  const ringSpeed = 0.15;   
  
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
    lastMouse.current = { x: initX, y: initY };
    points.current = Array.from({ length: nodeCount }, () => ({ x: initX, y: initY }));

    // GSAP QuickSetters for high performance
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

    let tick = 0;
    const update = () => {
      tick += 0.05;
      
      // 1. Idle Detection
      const distMoved = Math.hypot(mouse.current.x - lastMouse.current.x, mouse.current.y - lastMouse.current.y);
      if (distMoved < 0.1) {
          idleTime.current += 16;
          if (idleTime.current > 150) isIdle.current = true;
      } else {
          idleTime.current = 0;
          isIdle.current = false;
      }
      lastMouse.current = { ...mouse.current };

      // 2. Move DOM Elements
      setCursorX(mouse.current.x);
      setCursorY(mouse.current.y);

      ringPos.current.x += (mouse.current.x - ringPos.current.x) * ringSpeed;
      ringPos.current.y += (mouse.current.y - ringPos.current.y) * ringSpeed;
      setRingX(ringPos.current.x);
      setRingY(ringPos.current.y);

      // 3. Idle Pulsation (Ring breathing)
      if (isIdle.current) {
          const scale = 1 + Math.sin(tick * 2.5) * 0.15;
          setRingScale(scale);
      } else {
          setRingScale(1);
      }

      // 4. Update Trail Physics
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      let leader = { ...mouse.current };
      points.current.forEach((p, i) => {
        p.x += (leader.x - p.x) * trailSpeed;
        p.y += (leader.y - p.y) * trailSpeed;
        leader = { ...p };
      });

      // 5. Draw Trail
      const rootStyle = getComputedStyle(document.documentElement);
      const primaryColor = rootStyle.getPropertyValue('--p').trim();
      
      // Use the resolved oklch value or fallback to a standard hex if CSS var is missing
      ctx.strokeStyle = primaryColor ? `oklch(${primaryColor})` : '#641ae6';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (let i = 1; i < points.current.length; i++) {
        const p1 = points.current[i - 1];
        const p2 = points.current[i];
        
        const opacity = 1 - (i / points.current.length);
        const width = (points.current.length - i) * 0.45;

        ctx.beginPath();
        ctx.globalAlpha = opacity * 0.5;
        ctx.lineWidth = Math.max(0.5, width);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    handleResize();
    
    gsap.ticker.add(update);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      gsap.ticker.remove(update);
    };
  }, []);

  return (
    <>
      {/* The Trail Canvas (Lowest Z) */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 z-[9990] pointer-events-none select-none opacity-60"
      />
      
      {/* The Outer Ring (Middle Z) */}
      <div 
        ref={ringRef}
        className="fixed top-0 left-0 w-12 h-12 -ml-6 -mt-6 border border-primary/50 rounded-full z-[9991] pointer-events-none bg-primary/5"
        style={{ willChange: 'transform' }}
      />

      {/* The Inner Dot (Highest Z) */}
      <div 
        ref={cursorRef}
        className="fixed top-0 left-0 w-2 h-2 -ml-1 -mt-1 bg-primary rounded-full z-[9992] pointer-events-none shadow-[0_0_10px_rgba(var(--p),0.5)]"
        style={{ willChange: 'transform' }}
      />
    </>
  );
};

export default MouseTrail;
