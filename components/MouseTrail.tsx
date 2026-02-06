
import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

const MouseTrail: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Positional state
  const mouse = useRef({ x: -100, y: -100 });
  const trail = useRef({ x: -100, y: -100 });
  
  // Physics & Animation state
  const isHovering = useRef(false);
  const hoverScale = useRef({ val: 1 });
  const velocity = useRef(0);
  const angle = useRef(0);
  const lastMoveTime = useRef(Date.now());
  const isVisible = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const cursor = cursorRef.current;
    const container = containerRef.current;
    if (!canvas || !cursor || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
    };

    const showCursor = () => {
      if (!isVisible.current) {
        isVisible.current = true;
        gsap.to(container, { opacity: 1, duration: 0.3, ease: "power2.out" });
      }
    };

    const hideCursor = () => {
      if (isVisible.current) {
        isVisible.current = false;
        gsap.to(container, { opacity: 0, duration: 0.6, ease: "power2.inOut" });
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
      lastMoveTime.current = Date.now();
      showCursor();
      
      // The precision center dot follows 1:1
      gsap.set(cursor, { x: e.clientX, y: e.clientY });
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isInteractive = !!target.closest('button, a, input, select, textarea, [role="button"], .cursor-pointer, .tab');
      
      if (isInteractive && !isHovering.current) {
        isHovering.current = true;
        gsap.to(hoverScale.current, { val: 2.5, duration: 0.6, ease: "expo.out" });
        gsap.to(cursor, { scale: 1.5, duration: 0.4, ease: "back.out(1.7)" });
      } else if (!isInteractive && isHovering.current) {
        isHovering.current = false;
        gsap.to(hoverScale.current, { val: 1, duration: 0.8, ease: "expo.out" });
        gsap.to(cursor, { scale: 1, duration: 0.6, ease: "power2.out" });
      }
    };

    const update = () => {
      // Idle check: Hide if mouse hasn't moved in 1.5 seconds
      if (Date.now() - lastMoveTime.current > 1500) {
        hideCursor();
      }

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      
      const rootStyle = getComputedStyle(document.documentElement);
      const p = rootStyle.getPropertyValue('--p').trim();
      const primaryColor = p ? `oklch(${p})` : '#641ae6';

      // 1. Elastic Movement (Lerp)
      const lerpFactor = 0.15;
      trail.current.x += (mouse.current.x - trail.current.x) * lerpFactor;
      trail.current.y += (mouse.current.y - trail.current.y) * lerpFactor;

      // 2. Velocity & Angle Calculation
      const dx = mouse.current.x - trail.current.x;
      const dy = mouse.current.y - trail.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Smooth out the velocity values
      velocity.current += (dist - velocity.current) * 0.1;
      angle.current = Math.atan2(dy, dx);

      // 3. Jelly Deformation Logic
      // The shape stretches along the direction of movement (scaleX) 
      // and squishes perpendicular to it (scaleY)
      const baseRadius = 12;
      const stretchFactor = Math.min(velocity.current / 80, 1.5);
      const scaleX = 1 + stretchFactor;
      const scaleY = 1 - (stretchFactor * 0.4);
      const currentRadius = baseRadius * hoverScale.current.val;

      ctx.save();
      ctx.translate(trail.current.x, trail.current.y);
      ctx.rotate(angle.current);
      ctx.scale(scaleX, scaleY);
      
      // Main fluid body
      ctx.beginPath();
      ctx.arc(0, 0, currentRadius, 0, Math.PI * 2);
      ctx.fillStyle = primaryColor;
      
      // Dynamic opacity: gets more "ethereal" as it stretches
      const alpha = isHovering.current ? 0.12 : 0.22;
      ctx.globalAlpha = alpha;
      ctx.fill();

      // Soft rim for depth
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 1;
      ctx.globalAlpha = isHovering.current ? 0.2 : 0.05;
      ctx.stroke();

      ctx.restore();
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseover', handleMouseOver);
    handleResize();
    
    const tickerHandler = () => update();
    gsap.ticker.add(tickerHandler);

    // Ensure hidden initially
    gsap.set(container, { opacity: 0 });

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseover', handleMouseOver);
      gsap.ticker.remove(tickerHandler);
    };
  }, []);

  return (
    <div ref={containerRef} className="fixed inset-0 z-[9990] pointer-events-none select-none opacity-0">
      {/* Liquid / Jelly Trail Layer */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none"
      />
      
      {/* Precision Center Dot */}
      <div 
        ref={cursorRef}
        className="fixed top-0 left-0 w-1.5 h-1.5 -ml-0.75 -mt-0.75 bg-white rounded-full z-[9992] pointer-events-none shadow-[0_0_12px_rgba(255,255,255,0.9)]"
        style={{ willChange: 'transform' }}
      >
          {/* Ambient atmosphere around the precision dot */}
          <div className="absolute inset-0 bg-primary rounded-full opacity-30 scale-[3.5] blur-[1px]"></div>
      </div>
    </div>
  );
};

export default MouseTrail;
