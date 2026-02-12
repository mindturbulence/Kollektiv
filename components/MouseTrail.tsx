
import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

const MouseTrail: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Glitch elements refs
  const ringRedRef = useRef<HTMLDivElement>(null);
  const ringCyanRef = useRef<HTMLDivElement>(null);
  
  // Positional state
  const mouse = useRef({ x: -100, y: -100 });
  const trail = useRef({ x: -100, y: -100 });
  
  // Physics & Animation state
  const isHovering = useRef(false);
  const isTextMode = useRef(false);
  const hoverScale = useRef({ val: 1 });
  const velocity = useRef(0);
  const angle = useRef(0);
  const lastMoveTime = useRef(Date.now());
  const lastJitterTime = useRef(0);
  const isVisible = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const cursor = cursorRef.current;
    const container = containerRef.current;
    const ringRed = ringRedRef.current;
    const ringCyan = ringCyanRef.current;

    if (!canvas || !cursor || !container || !ringRed || !ringCyan) return;

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

    const showCursor = (instant = false) => {
      lastMoveTime.current = Date.now();
      if (!isVisible.current) {
        isVisible.current = true;
        gsap.killTweensOf(container);
        gsap.to(container, { 
          opacity: 1, 
          duration: instant ? 0 : 0.4, 
          ease: "power2.out",
          visibility: 'visible'
        });
      }
    };

    const hideCursor = () => {
      if (isVisible.current) {
        isVisible.current = false;
        gsap.killTweensOf(container);
        gsap.to(container, { 
          opacity: 0, 
          duration: 0.8, 
          ease: "power2.inOut",
          onComplete: () => {
            if (!isVisible.current) container.style.visibility = 'hidden';
          }
        });
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
      showCursor();
      
      // Precision dot using percentage translation for absolute centering
      gsap.set(cursor, { 
        x: e.clientX, 
        y: e.clientY,
        xPercent: -50,
        yPercent: -50
      });
    };

    const checkTextElement = (el: Element | null): boolean => {
      if (!el) return false;
      const tagName = el.tagName;
      const type = (el as any).type;
      return tagName === 'TEXTAREA' || 
             (tagName === 'INPUT' && ['text', 'password', 'email', 'number', 'search', 'url', 'tel'].includes(type));
    };

    const updateCursorState = (target: HTMLElement | null) => {
      const isHoveringText = checkTextElement(target);
      const isFocusingText = checkTextElement(document.activeElement);
      
      const isText = isHoveringText || isFocusingText;
      const isInteractive = isText || !!target?.closest('button, a, select, [role="button"], .cursor-pointer, .tab');
      
      if (isText) {
        if (!isTextMode.current) {
            isHovering.current = true;
            isTextMode.current = true;
            
            // Trail shrinks
            gsap.to(hoverScale.current, { val: 0.3, duration: 0.4, ease: "expo.out" });
            
            // Morph dot into vertical I-Beam
            gsap.to(cursor, { 
                scaleX: 0.5, 
                scaleY: 2.5, 
                borderRadius: "0px", 
                duration: 0.3, 
                ease: "expo.out" 
            });

            // Morph rings to small vertical bars and start pulsation
            gsap.killTweensOf([ringRed, ringCyan]);
            gsap.set([ringRed, ringCyan], { borderRadius: "0px" });
            
            gsap.to(ringRed, {
                scaleX: 2.5,
                scaleY: 1.1,
                duration: 0.4,
                ease: "sine.inOut",
                repeat: -1,
                yoyo: true
            });
            gsap.to(ringCyan, {
                scaleX: 2.5,
                scaleY: 1.1,
                delay: 0.2,
                duration: 0.4,
                ease: "sine.inOut",
                repeat: -1,
                yoyo: true
            });
        }
      } else if (isInteractive) {
        isHovering.current = true;
        isTextMode.current = false;
        
        // Kill existing animations
        gsap.killTweensOf([ringRed, ringCyan]);
        
        // Trail grows
        gsap.to(hoverScale.current, { val: 2.5, duration: 0.6, ease: "expo.out" });
        
        // Dot expands
        gsap.to(cursor, { 
            scaleX: 1.5, 
            scaleY: 1.5, 
            borderRadius: "50%", 
            duration: 0.4, 
            ease: "back.out(1.7)" 
        });

        // Circular rings with energetic throb
        gsap.set([ringRed, ringCyan], { borderRadius: "50%" });
        gsap.to(ringRed, {
            scaleX: 6,
            scaleY: 6,
            duration: 0.5,
            ease: "sine.inOut",
            repeat: -1,
            yoyo: true
        });
        gsap.to(ringCyan, {
            scaleX: 6,
            scaleY: 6,
            delay: 0.25,
            duration: 0.5,
            ease: "sine.inOut",
            repeat: -1,
            yoyo: true
        });
      } else {
        isHovering.current = false;
        isTextMode.current = false;
        
        // Return to neutral state
        gsap.killTweensOf([ringRed, ringCyan]);
        gsap.to(hoverScale.current, { val: 1, duration: 0.8, ease: "expo.out" });
        gsap.to(cursor, { 
            scaleX: 1, 
            scaleY: 1, 
            borderRadius: "50%", 
            duration: 0.6, 
            ease: "power2.out" 
        });
        
        gsap.set([ringRed, ringCyan], { borderRadius: "50%" });
        gsap.to([ringRed, ringCyan], { 
            scaleX: 5, 
            scaleY: 5, 
            duration: 0.6, 
            ease: "power2.out" 
        });
      }
    };

    const handleMouseOver = (e: MouseEvent) => {
      updateCursorState(e.target as HTMLElement);
      showCursor();
    };

    const handleFocusChange = () => {
      const target = document.elementFromPoint(mouse.current.x, mouse.current.y) as HTMLElement;
      updateCursorState(target);
    };

    const handleFocus = () => showCursor(true);
    const handleMouseEnter = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
      showCursor(true);
    };

    const update = () => {
      const now = Date.now();
      
      // Idle check: Hide if mouse hasn't moved in 3 seconds
      if (isVisible.current && now - lastMoveTime.current > 3000) {
        hideCursor();
      }

      if (!isVisible.current && container.style.opacity === "0") return;

      // 1. Digital Jitter Logic (Chromatic Aberration)
      if (now - lastJitterTime.current > 60) {
        lastJitterTime.current = now;
        
        const intensity = isTextMode.current ? 1.5 : 4;
        const rx = (Math.random() - 0.5) * intensity;
        const ry = (Math.random() - 0.5) * (isTextMode.current ? 0.5 : intensity);
        const cx = (Math.random() - 0.5) * -intensity;
        const cy = (Math.random() - 0.5) * -(isTextMode.current ? 0.5 : intensity);
        const op = isTextMode.current ? (0.6 + Math.random() * 0.4) : (0.3 + Math.random() * 0.4);

        gsap.set(ringRed, { x: rx, y: ry, opacity: op });
        gsap.set(ringCyan, { x: cx, y: cy, opacity: op });
      }

      // 2. Canvas Rendering
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      
      const rootStyle = getComputedStyle(document.documentElement);
      const p = rootStyle.getPropertyValue('--p').trim();
      const primaryColor = p ? `oklch(${p})` : '#641ae6';

      // Elastic Movement (Lerp)
      const lerpFactor = 0.15;
      trail.current.x += (mouse.current.x - trail.current.x) * lerpFactor;
      trail.current.y += (mouse.current.y - trail.current.y) * lerpFactor;

      const dx = mouse.current.x - trail.current.x;
      const dy = mouse.current.y - trail.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      velocity.current += (dist - velocity.current) * 0.1;
      angle.current = Math.atan2(dy, dx);

      const baseRadius = 12;
      const stretchFactor = Math.min(velocity.current / 80, 1.5);
      const scaleX = isTextMode.current ? 1 : 1 + stretchFactor;
      const scaleY = isTextMode.current ? 1 : 1 - (stretchFactor * 0.4);
      const currentRadius = baseRadius * hoverScale.current.val;

      ctx.save();
      ctx.translate(trail.current.x, trail.current.y);
      if (!isTextMode.current) ctx.rotate(angle.current);
      ctx.scale(scaleX, scaleY);
      
      ctx.beginPath();
      if (isTextMode.current) {
        // Vertical indicator trail
        ctx.rect(-0.5, -currentRadius, 1, currentRadius * 2);
      } else {
        ctx.arc(0, 0, currentRadius, 0, Math.PI * 2);
      }
      ctx.fillStyle = primaryColor;
      
      const alpha = isHovering.current ? 0.12 : 0.22;
      ctx.globalAlpha = alpha;
      ctx.fill();

      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 1;
      ctx.globalAlpha = isHovering.current ? 0.2 : 0.05;
      if (!isTextMode.current) ctx.stroke();

      ctx.restore();
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseover', handleMouseOver);
    window.addEventListener('mouseenter', handleMouseEnter);
    window.addEventListener('mousedown', handleFocus);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('focusin', handleFocusChange);
    window.addEventListener('focusout', handleFocusChange);
    
    handleResize();
    
    const tickerHandler = () => update();
    gsap.ticker.add(tickerHandler);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseover', handleMouseOver);
      window.removeEventListener('mouseenter', handleMouseEnter);
      window.removeEventListener('mousedown', handleFocus);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('focusin', handleFocusChange);
      window.removeEventListener('focusout', handleFocusChange);
      gsap.ticker.remove(tickerHandler);
    };
  }, []);

  return (
    <div ref={containerRef} className="fixed inset-0 z-[10000] pointer-events-none select-none" style={{ opacity: 0, visibility: 'hidden' }}>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none"
      />
      
      <div 
        ref={cursorRef}
        className="fixed top-0 left-0 w-1.5 h-1.5 bg-white rounded-full z-[10001] pointer-events-none shadow-[0_0_12px_rgba(255,255,255,0.9)]"
        style={{ willChange: 'transform' }}
      >
          {/* Main Primary Glow */}
          <div className="absolute inset-0 bg-primary rounded-full opacity-30 scale-[4.5] blur-[1px]"></div>
          
          {/* Glitch Layer: Red */}
          <div 
            ref={ringRedRef}
            className="absolute inset-0 bg-[#ff0050] rounded-full scale-[5] blur-[2px] mix-blend-screen"
          ></div>
          
          {/* Glitch Layer: Cyan */}
          <div 
            ref={ringCyanRef}
            className="absolute inset-0 bg-[#00ffff] rounded-full scale-[5] blur-[2px] mix-blend-screen"
          ></div>
      </div>
    </div>
  );
};

export default MouseTrail;
