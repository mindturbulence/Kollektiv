import { forwardRef, useImperativeHandle, useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import type { FxGeometry } from './routeFx';

/**
 * Context Shift Engine — HUD overlay.
 * Always mounted inside <main>, absolute inset-0, pointer-events-none.
 * Opaque cover geometries hide the React tree swap; a living HUD dresses the hold.
 * Zero layout impact: everything is absolutely positioned and transform-driven.
 */

export interface TransitionOverlayHandle {
    /** Close the cover geometry over the content. Resolves when fully covered. */
    cover(geometry: FxGeometry, label: { name: string; sub: string; glyph: string }): Promise<void>;
    /** Keep the HUD alive while React swaps behind the cover. */
    hold(ms: number): Promise<void>;
    /** Open the cover with the inverse geometry. Resolves when fully open. */
    reveal(geometry: FxGeometry): Promise<void>;
    /** Instant hide — reduced-motion / recovery path. */
    abort(): void;
}

const SCRAMBLE_GLYPHS = '!<>-_\\/[]{}—=+*^?#___KOLLEKTIV0123456789';

/** Scramble-decrypt text into el over `duration` ms, resolving left-to-right. */
const scrambleTo = (el: HTMLElement, text: string, duration: number): (() => void) => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
        const p = Math.min(1, (now - start) / duration);
        const resolved = Math.floor(p * text.length);
        let out = text.slice(0, resolved);
        for (let i = resolved; i < text.length; i++) {
            out += text[i] === ' ' ? ' ' : SCRAMBLE_GLYPHS[(Math.random() * SCRAMBLE_GLYPHS.length) | 0];
        }
        el.textContent = out;
        if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
};

const V_STRIPS = 10;
const H_STRIPS = 8;

// ponytail: hex ticker is cosmetic randomness, no need for real addresses
const hexLine = () =>
    `0x${((Math.random() * 0xffffff) | 0).toString(16).padStart(6, '0').toUpperCase()} :: SEG ${((Math.random() * 99) | 0).toString().padStart(2, '0')} :: OK`;

const TransitionOverlay = forwardRef<TransitionOverlayHandle>((_props, ref) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const vStripsRef = useRef<HTMLDivElement>(null);
    const hStripsRef = useRef<HTMLDivElement>(null);
    const irisRef = useRef<HTMLDivElement>(null);
    const shardsRef = useRef<HTMLDivElement>(null);
    const hudRef = useRef<HTMLDivElement>(null);
    const sweepRef = useRef<HTMLDivElement>(null);
    const glyphRef = useRef<HTMLDivElement>(null);
    const nameRef = useRef<HTMLDivElement>(null);
    const subRef = useRef<HTMLDivElement>(null);
    const hexRef = useRef<HTMLDivElement>(null);
    const progressRef = useRef<HTMLDivElement>(null);

    const activeTl = useRef<gsap.core.Timeline | null>(null);
    const scrambleCancel = useRef<(() => void) | null>(null);
    const hexInterval = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => () => {
        activeTl.current?.kill();
        scrambleCancel.current?.();
        if (hexInterval.current) clearInterval(hexInterval.current);
    }, []);

    const stopDressing = () => {
        scrambleCancel.current?.();
        scrambleCancel.current = null;
        if (hexInterval.current) { clearInterval(hexInterval.current); hexInterval.current = null; }
    };

    const geoEls = (geometry: FxGeometry): { wrap: HTMLElement | null; parts: HTMLElement[] } => {
        if (geometry === 'shutterV') return { wrap: vStripsRef.current, parts: Array.from(vStripsRef.current?.children ?? []) as HTMLElement[] };
        if (geometry === 'shutterH' || geometry === 'doors') return { wrap: hStripsRef.current, parts: Array.from(hStripsRef.current?.children ?? []) as HTMLElement[] };
        if (geometry === 'shards') return { wrap: shardsRef.current, parts: Array.from(shardsRef.current?.children ?? []) as HTMLElement[] };
        return { wrap: irisRef.current, parts: irisRef.current ? [irisRef.current] : [] };
    };

    const hideAllGeometries = () => {
        [vStripsRef, hStripsRef, irisRef, shardsRef].forEach(r => {
            if (r.current) gsap.set(r.current, { display: 'none' });
        });
    };

    useImperativeHandle(ref, () => ({
        cover(geometry, label) {
            return new Promise<void>((resolve) => {
                activeTl.current?.kill();
                stopDressing();
                const root = rootRef.current;
                const { wrap, parts } = geoEls(geometry);
                if (!root || !wrap || parts.length === 0) { resolve(); return; }

                hideAllGeometries();
                gsap.set(root, { visibility: 'visible' });
                gsap.set(wrap, { display: geometry.startsWith('iris') ? 'block' : 'flex' });
                gsap.set(hudRef.current, { opacity: 0 });
                gsap.set(progressRef.current, { scaleX: 0 });

                const tl = gsap.timeline({ onComplete: resolve });
                activeTl.current = tl;

                if (geometry === 'shutterV') {
                    parts.forEach((el, i) => gsap.set(el, { scaleY: 0, transformOrigin: i % 2 === 0 ? 'top center' : 'bottom center' }));
                    tl.to(parts, { scaleY: 1, duration: 0.34, ease: 'power3.inOut', stagger: { each: 0.028, from: 'center' } });
                } else if (geometry === 'shutterH') {
                    parts.forEach((el, i) => gsap.set(el, { scaleX: 0, transformOrigin: i % 2 === 0 ? 'left center' : 'right center' }));
                    tl.to(parts, { scaleX: 1, duration: 0.3, ease: 'power3.inOut', stagger: { each: 0.024, from: 'start' } });
                } else if (geometry === 'doors') {
                    parts.forEach((el, i) => gsap.set(el, { scaleX: 0, transformOrigin: i % 2 === 0 ? 'left center' : 'right center' }));
                    tl.to(parts, { scaleX: 1, duration: 0.32, ease: 'power4.inOut', stagger: { each: 0.03, from: 'edges' } });
                } else if (geometry === 'shards') {
                    const offsets = [{ yPercent: -101 }, { xPercent: 101 }, { yPercent: 101 }, { xPercent: -101 }];
                    parts.forEach((el, i) => gsap.set(el, { xPercent: 0, yPercent: 0, ...offsets[i % 4] }));
                    tl.to(parts, { xPercent: 0, yPercent: 0, duration: 0.36, ease: 'power3.inOut', stagger: 0.04 });
                } else {
                    const origin = geometry === 'irisTop' ? '50% 10%' : '50% 45%';
                    gsap.set(parts[0], { clipPath: `circle(0% at ${origin})` });
                    tl.to(parts[0], { clipPath: `circle(142% at ${origin})`, duration: 0.42, ease: 'power4.in' });
                }

                // HUD dressing rides the tail of the cover
                tl.add(() => {
                    if (glyphRef.current) glyphRef.current.textContent = label.glyph;
                    if (nameRef.current) scrambleCancel.current = scrambleTo(nameRef.current, label.name, 520);
                    if (subRef.current) subRef.current.textContent = label.sub;
                    if (hexRef.current) {
                        hexRef.current.textContent = hexLine();
                        hexInterval.current = setInterval(() => {
                            if (hexRef.current) hexRef.current.textContent = hexLine();
                        }, 90);
                    }
                }, '-=0.1');
                tl.to(hudRef.current, { opacity: 1, duration: 0.16, ease: 'power2.out' }, '-=0.1');
            });
        },

        hold(ms) {
            return new Promise<void>((resolve) => {
                gsap.to(progressRef.current, { scaleX: 1, duration: ms / 1000, ease: 'power1.inOut' });
                gsap.delayedCall(ms / 1000, resolve);
            });
        },

        reveal(geometry) {
            return new Promise<void>((resolve) => {
                activeTl.current?.kill();
                const root = rootRef.current;
                const { parts } = geoEls(geometry);
                if (!root || parts.length === 0) {
                    stopDressing();
                    if (rootRef.current) gsap.set(rootRef.current, { visibility: 'hidden' });
                    hideAllGeometries();
                    resolve();
                    return;
                }

                const tl = gsap.timeline({
                    onComplete: () => {
                        stopDressing();
                        gsap.set(root, { visibility: 'hidden' });
                        if (sweepRef.current) gsap.set(sweepRef.current, { display: 'none' });
                        hideAllGeometries();
                        resolve();
                    }
                });
                activeTl.current = tl;

                tl.to(hudRef.current, { opacity: 0, duration: 0.14, ease: 'power2.in' });

                if (geometry === 'shutterV') {
                    tl.to(parts, {
                        scaleY: 0, duration: 0.55, ease: 'expo.inOut',
                        transformOrigin: (i: number) => (i % 2 === 0 ? 'bottom center' : 'top center'),
                        stagger: { each: 0.03, from: 'edges' }
                    }, '-=0.05');
                } else if (geometry === 'shutterH') {
                    tl.to(parts, {
                        scaleX: 0, duration: 0.52, ease: 'expo.inOut',
                        transformOrigin: (i: number) => (i % 2 === 0 ? 'right center' : 'left center'),
                        stagger: { each: 0.026, from: 'end' }
                    }, '-=0.05');
                } else if (geometry === 'doors') {
                    tl.to(parts, {
                        scaleX: 0, duration: 0.56, ease: 'expo.inOut',
                        transformOrigin: (i: number) => (i % 2 === 0 ? 'left center' : 'right center'),
                        stagger: { each: 0.032, from: 'center' }
                    }, '-=0.05');
                } else if (geometry === 'shards') {
                    const outs = [{ yPercent: -101 }, { xPercent: 101 }, { yPercent: 101 }, { xPercent: -101 }];
                    parts.forEach((el, i) => tl.to(el, { ...outs[i % 4], duration: 0.5, ease: 'expo.inOut' }, i === 0 ? '-=0.05' : '<0.045'));
                } else {
                    const origin = geometry === 'irisTop' ? '50% 10%' : '50% 45%';
                    tl.to(parts[0], { clipPath: `circle(0% at ${origin})`, duration: 0.6, ease: 'expo.inOut' }, '-=0.05');
                }

                // Light leads the curtain: a specular sweep crosses the incoming
                // module while the geometry opens. Pure transform, blend: screen.
                if (sweepRef.current) {
                    tl.set(sweepRef.current, { display: 'block' }, '<');
                    tl.fromTo(sweepRef.current,
                        { xPercent: -120 },
                        { xPercent: 120, duration: 0.65, ease: 'power2.inOut' },
                        '<0.1'
                    );
                }
            });
        },

        abort() {
            activeTl.current?.kill();
            stopDressing();
            if (rootRef.current) gsap.set(rootRef.current, { visibility: 'hidden' });
            hideAllGeometries();
        },
    }), []);

    const shardClips = [
        'polygon(0 0, 100% 0, 50% 50%)',
        'polygon(100% 0, 100% 100%, 50% 50%)',
        'polygon(0 100%, 100% 100%, 50% 50%)',
        'polygon(0 0, 0 100%, 50% 50%)',
    ];

    return (
        <div
            ref={rootRef}
            className="absolute inset-0 z-[1000] pointer-events-none overflow-hidden"
            style={{ visibility: 'hidden' }}
            aria-hidden="true"
        >
            <div ref={vStripsRef} className="absolute inset-0 flex-row" style={{ display: 'none' }}>
                {Array.from({ length: V_STRIPS }).map((_, i) => (
                    <div key={i} className="fx-overlay-strip flex-1 h-full" />
                ))}
            </div>
            <div ref={hStripsRef} className="absolute inset-0 flex-col" style={{ display: 'none' }}>
                {Array.from({ length: H_STRIPS }).map((_, i) => (
                    <div key={i} className="fx-overlay-strip w-full flex-1" />
                ))}
            </div>
            <div ref={irisRef} className="absolute inset-0 fx-overlay-strip" style={{ display: 'none' }} />
            <div ref={shardsRef} className="absolute inset-0" style={{ display: 'none' }}>
                {shardClips.map((clip, i) => (
                    <div key={i} className="fx-overlay-strip absolute inset-0" style={{ clipPath: clip }} />
                ))}
            </div>

            {/* Cinematic light sweep — fires as the curtain opens */}
            <div ref={sweepRef} className="fx-light-sweep" style={{ display: 'none' }} />

            {/* HUD — lives above the cover geometry */}
            <div ref={hudRef} className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ opacity: 0 }}>
                <div className="fx-hud-vignette" />
                <div className="fx-hud-bracket top-8 left-8 border-t border-l" style={{ borderTopWidth: 1, borderLeftWidth: 1 }} />
                <div className="fx-hud-bracket top-8 right-8 border-t border-r" style={{ borderTopWidth: 1, borderRightWidth: 1 }} />
                <div className="fx-hud-bracket bottom-8 left-8 border-b border-l" style={{ borderBottomWidth: 1, borderLeftWidth: 1 }} />
                <div className="fx-hud-bracket bottom-8 right-8 border-b border-r" style={{ borderBottomWidth: 1, borderRightWidth: 1 }} />

                <div ref={glyphRef} className="text-3xl text-primary/80 fx-hud-blink font-mono" />
                <div ref={nameRef} className="text-lg md:text-2xl font-black uppercase tracking-[0.5em] text-base-content font-mono" />
                <div ref={subRef} className="text-[10px] uppercase tracking-[0.35em] text-base-content/40 font-mono" />
                <div className="w-48 h-px bg-base-content/10 mt-2 overflow-hidden">
                    <div ref={progressRef} className="fx-hud-progress w-full" style={{ transform: 'scaleX(0)' }} />
                </div>
                <div ref={hexRef} className="text-[9px] tracking-[0.25em] text-primary/40 font-mono mt-1" />
            </div>
        </div>
    );
});

TransitionOverlay.displayName = 'TransitionOverlay';
export default TransitionOverlay;
