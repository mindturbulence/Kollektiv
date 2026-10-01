import React, { useEffect, useRef } from 'react';
import { prefersReducedMotion } from './transitions/routeFx';

// Sparse drifting line fragments, a few in the primary colour — ported from the
// hero "shards" in docs/design/redesign-sample.html. Drifts up-right with a
// light pointer parallax; nearer shards (higher z) are longer, brighter, faster.
const COUNT = 70;

const ParticleField: React.FC<{ className?: string }> = ({ className = '' }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const rnd = Math.random;
        const shards = Array.from({ length: COUNT }, () => ({
            x: rnd(), y: rnd(), l: 10 + rnd() * 70, a: -1.05 + rnd() * 0.3,
            v: 0.02 + rnd() * 0.05, z: 0.3 + rnd() * 0.7, hot: rnd() < 0.08,
        }));
        let W = 0, H = 0, raf = 0, last = 0, mx = 0, my = 0;
        let acc = '', ink = '';
        const readColors = () => {
            const cs = getComputedStyle(document.documentElement);
            acc = cs.getPropertyValue('--p').trim();
            ink = cs.getPropertyValue('--bc').trim();
        };

        const size = () => {
            const d = Math.min(window.devicePixelRatio || 1, 2);
            W = canvas.clientWidth; H = canvas.clientHeight;
            canvas.width = W * d; canvas.height = H * d;
            ctx.setTransform(d, 0, 0, d, 0, 0);
        };

        const draw = (dt: number) => {
            ctx.clearRect(0, 0, W, H);
            for (const s of shards) {
                s.y -= s.v * dt * s.z * 0.02; s.x += s.v * dt * s.z * 0.012;
                if (s.y < -0.1) { s.y = 1.1; s.x = rnd(); }
                if (s.x > 1.1) s.x = -0.1;
                const x = s.x * W + mx * 30 * s.z, y = s.y * H + my * 30 * s.z;
                const dx = Math.cos(s.a) * s.l * s.z, dy = Math.sin(s.a) * s.l * s.z;
                const color = s.hot ? acc : ink;
                const g = ctx.createLinearGradient(x, y, x + dx, y + dy);
                g.addColorStop(0, `oklch(${color} / 0)`); g.addColorStop(1, `oklch(${color})`);
                ctx.strokeStyle = g;
                ctx.globalAlpha = s.hot ? 0.9 : 0.12 + s.z * 0.25;
                ctx.lineWidth = s.hot ? 1.5 : 1;
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
            }
            ctx.globalAlpha = 1;
        };

        const reduced = prefersReducedMotion();
        const loop = (t: number) => { draw(Math.min(50, t - (last || t))); last = t; raf = requestAnimationFrame(loop); };
        const start = () => { cancelAnimationFrame(raf); if (reduced) { draw(0); return; } last = 0; raf = requestAnimationFrame(loop); };
        const onVisibility = () => { if (document.hidden) cancelAnimationFrame(raf); else start(); };
        // The canvas sits under the app (pointer-events-none), so track the pointer on window.
        const onPointer = (e: PointerEvent) => { mx = e.clientX / window.innerWidth - 0.5; my = e.clientY / window.innerHeight - 0.5; };

        readColors(); size(); start();
        const ro = new ResizeObserver(() => { size(); if (reduced) draw(0); });
        ro.observe(canvas);
        // Theme switches change --p / --bc on <html>.
        const mo = new MutationObserver(() => { readColors(); if (reduced) draw(0); });
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('pointermove', onPointer, { passive: true });

        return () => {
            cancelAnimationFrame(raf);
            ro.disconnect(); mo.disconnect();
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('pointermove', onPointer);
        };
    }, []);

    return <canvas ref={canvasRef} aria-hidden="true" className={`absolute inset-0 w-full h-full pointer-events-none ${className}`} />;
};

export default ParticleField;
