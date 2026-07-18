import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import ChromaticText from './ChromaticText';

const InitialLoader: React.FC<{ status: string; progress: number | null; onContinue: (withMusic: boolean) => void }> = ({ status, progress, onContinue }) => {
    const textWrapperRef = useRef<HTMLHeadingElement>(null);
    const logoFillRef = useRef<HTMLDivElement>(null);
    const systemTextRef = useRef<HTMLSpanElement>(null);
    const [displayStatus, setDisplayStatus] = useState<string>('');
    const [history, setHistory] = useState<string[]>([]);
    const [smoothPercentage, setSmoothPercentage] = useState(0);
    const [isComplete, setIsComplete] = useState(false);
    const actionButtonsRef = useRef<HTMLDivElement>(null);
    const progressStatusRef = useRef<HTMLDivElement>(null);
    const [showCursor, setShowCursor] = useState(true);

    useEffect(() => {
        const interval = setInterval(() => { setShowCursor(prev => !prev); }, 500);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!status) return;
        const formatted = `> ${status.toUpperCase()}`;
        setHistory(prev => {
            if (prev.includes(formatted)) return prev;
            return [...prev, formatted].slice(-2);
        });
        let isCancelled = false;
        let i = 0;
        const typeChar = () => {
            if (isCancelled) return;
            if (i <= formatted.length) {
                setDisplayStatus(formatted.substring(0, i));
                i++;
                setTimeout(typeChar, 15);
            }
        };
        typeChar();
        return () => { isCancelled = true; };
    }, [status]);

    const displayPercentageRef = useRef(0);
    const targetPercentage = Math.round((progress || 0) * 100);

    useEffect(() => {
        const obj = { val: displayPercentageRef.current };
        const animation = gsap.to(obj, {
            val: targetPercentage,
            duration: 0.4,
            ease: "power2.out",
            onUpdate: () => {
                displayPercentageRef.current = obj.val;
                setSmoothPercentage(Math.round(obj.val));
            }
        });
        return () => { animation.kill(); };
    }, [targetPercentage]);

    useLayoutEffect(() => {
        if (!textWrapperRef.current) return;
        gsap.fromTo(textWrapperRef.current,
            { yPercent: 100, autoAlpha: 0 },
            { yPercent: 0, autoAlpha: 1, duration: 1.5, ease: "expo.out" }
        );
        if (logoFillRef.current) {
            gsap.fromTo(logoFillRef.current,
                { width: '0%' },
                { width: '100%', duration: 2.5, ease: "power2.inOut", delay: 0.5 }
            );
        }
        if (systemTextRef.current) {
            gsap.fromTo(systemTextRef.current,
                { y: 24, autoAlpha: 0 },
                { y: 0, autoAlpha: 1, duration: 0.8, ease: "power2.out", delay: 3.2 }
            );
        }
    }, []);

    useEffect(() => {
        if (targetPercentage >= 100 && smoothPercentage >= 99) {
            const t = setTimeout(() => { setIsComplete(true); }, 1000);
            return () => clearTimeout(t);
        }
    }, [targetPercentage, smoothPercentage]);

    const handleContinue = (withMusic: boolean) => {
        if (actionButtonsRef.current) {
            gsap.to(actionButtonsRef.current, { autoAlpha: 0, duration: 0.4 });
        }
        const footerEl = document.querySelector('#initial-loader .absolute.bottom-8');
        if (footerEl) gsap.to(footerEl, { autoAlpha: 0, duration: 0.4 });
        if (systemTextRef.current) {
            gsap.to(systemTextRef.current, { y: -20, autoAlpha: 0, duration: 0.6, ease: "power2.inOut" });
        }
        if (textWrapperRef.current) {
            gsap.to(textWrapperRef.current, {
                y: -80,
                autoAlpha: 0,
                duration: 0.8,
                ease: "expo.inOut",
                onComplete: () => { onContinue(withMusic); }
            });
        } else {
            onContinue(withMusic);
        }
    };

    return (
        <div id="initial-loader" className="fixed inset-0 z-[500] flex flex-col items-center justify-center bg-base-100 text-base-content overflow-hidden select-none font-sans" style={{ background: 'oklch(var(--b1))', opacity: 1 }}>
            <div className="absolute inset-0 bg-grid-texture opacity-[0.03] pointer-events-none"></div>
            <div className="absolute inset-0 pointer-events-none opacity-20" style={{ backgroundImage: 'linear-gradient(transparent 50%, rgba(0, 0, 0, 0.25) 50%)', backgroundSize: '100% 4px', zIndex: 1 }}></div>

            <div className="relative z-10 flex flex-col items-center">
                <div className="mb-6 px-4 flex flex-col items-center">
                    <h1 ref={textWrapperRef} className="flex flex-col items-center text-2xl md:text-4xl font-normal tracking-widest uppercase select-none leading-none translate-y-[2px]">
                        <div className="grid grid-cols-1 grid-rows-1 font-monoton">
                            <span className="text-base-content/10 block leading-none py-2 row-start-1 col-start-1">
                                <ChromaticText enabled={false}>Kollektiv</ChromaticText><span className="text-primary/10 italic">.</span>
                            </span>

                            <div
                                ref={logoFillRef}
                                className="row-start-1 col-start-1 h-full overflow-hidden"
                                style={{ width: '0%' }}
                            >
                                <span className="text-base-content block whitespace-nowrap leading-none py-2 drop-shadow-[0_0_20px_rgba(var(--bc),0.15)]">
                                    <ChromaticText>Kollektiv</ChromaticText><span className="text-primary italic">.</span>
                                </span>
                            </div>
                        </div>
                    </h1>
                    <span
                        ref={systemTextRef}
                        className="block -mt-10 md:-mt-10 font-rainmaker text-primary text-xl md:text-5xl whitespace-nowrap leading-[0] pulse-glow pointer-events-none normal-case"
                    >
                        _Systems_
                    </span>
                </div>

                <div className="relative h-28 w-80">
                    <div ref={progressStatusRef} className={`absolute inset-0 flex flex-col items-center gap-4 transition-all duration-1000 origin-center ${isComplete ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}>
                        <div className="flex flex-col items-center gap-2 w-full">
                            <div className="flex flex-col items-center gap-1 mb-2">
                                <div className="w-48 h-[2px] bg-base-content/10 relative overflow-hidden rounded-full">
                                    <div
                                        className="absolute inset-y-0 left-0 bg-primary transition-all duration-500 ease-out"
                                        style={{ width: `${smoothPercentage}%` }}
                                    />
                                </div>
                                <span className="text-[9px] font-mono font-bold text-primary/60 tracking-widest">{smoothPercentage}%</span>
                            </div>

                            <div className="flex flex-col items-start justify-end min-h-[48px] max-h-[48px] overflow-hidden leading-snug w-full px-6 text-[10px] font-mono font-bold uppercase tracking-widest text-left text-base-content/40">
                                {history.slice(-2).map((h, idx) => (
                                    <div key={idx} className="opacity-40 w-full truncate">{h}</div>
                                ))}
                                <div className="w-full truncate">{displayStatus}{showCursor ? '_' : '\u00A0'}</div>
                            </div>
                        </div>
                    </div>

                    <div ref={actionButtonsRef} className={`absolute inset-0 flex flex-col items-center justify-center gap-4 transition-opacity duration-1000 ${isComplete ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
                        <button
                            className="form-btn form-btn-primary w-48 h-10 text-[10px]"
                            onClick={() => handleContinue(true)}
                        >
                            CONTINUE
                        </button>
                        <button
                            className="text-xs font-rajdhani uppercase tracking-widest font-normal text-base-content/30 hover:text-base-content px-4 py-2 transition-colors bg-transparent hover:bg-transparent"
                            onClick={() => handleContinue(false)}
                        >
                            CONTINUE WITHOUT MUSIC
                        </button>
                    </div>
                </div>
            </div>

            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-[10px] font-mono uppercase tracking-widest text-base-content/40 opacity-70 flex flex-col items-center gap-0.5">
                <span className="font-bold text-base-content/30 text-[8px]">Built by</span>
                <span className="text-primary font-bold">MindTurbulence</span>
            </div>
        </div>
    );
};

export default InitialLoader;
