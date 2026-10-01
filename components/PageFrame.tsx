import React, { useLayoutEffect } from 'react';
import { gsap } from 'gsap';

export interface PageFrameProps {
    isInitialized: boolean;
    frameWrapperRef: React.RefObject<HTMLDivElement | null>;
    scanTopRef: React.RefObject<HTMLSpanElement | null>;
    scanRightRef: React.RefObject<HTMLSpanElement | null>;
    scanBottomRef: React.RefObject<HTMLSpanElement | null>;
    scanLeftRef: React.RefObject<HTMLSpanElement | null>;
}

const PageFrame: React.FC<PageFrameProps> = ({
    isInitialized,
    frameWrapperRef,
    scanTopRef,
    scanRightRef,
    scanBottomRef,
    scanLeftRef
}) => {
    useLayoutEffect(() => {
        if (!isInitialized || !frameWrapperRef.current) return;

        const scanTl = gsap.timeline({
            repeat: -1,
            repeatDelay: 52,
            delay: 15
        });

        const scanDuration = 2;
        const scanEase = "power1.inOut";

        if (scanTopRef.current && scanRightRef.current && scanBottomRef.current && scanLeftRef.current) {
            scanTl.set([scanTopRef.current, scanRightRef.current, scanBottomRef.current, scanLeftRef.current], { opacity: 0 });

            scanTl.fromTo(scanTopRef.current,
                { left: "-100%", opacity: 0 },
                { left: "100%", opacity: 1, duration: scanDuration, ease: scanEase }
            ).set(scanTopRef.current, { opacity: 0 });

            scanTl.fromTo(scanRightRef.current,
                { top: "-100%", opacity: 0 },
                { top: "100%", opacity: 1, duration: scanDuration, ease: scanEase }
            ).set(scanRightRef.current, { opacity: 0 });

            scanTl.fromTo(scanBottomRef.current,
                { right: "-100%", opacity: 0 },
                { right: "100%", opacity: 1, duration: scanDuration, ease: scanEase }
            ).set(scanBottomRef.current, { opacity: 0 });

            scanTl.fromTo(scanLeftRef.current,
                { bottom: "-100%", opacity: 0 },
                { bottom: "100%", opacity: 1, duration: scanDuration, ease: scanEase }
            ).set(scanLeftRef.current, { opacity: 0 });
        }

        return () => { scanTl.kill(); };
    }, [isInitialized, frameWrapperRef, scanTopRef, scanRightRef, scanBottomRef, scanLeftRef]);

    return (
        <div ref={frameWrapperRef} className="fixed inset-0 z-overlay pointer-events-none p-[10px]">
            <div className="w-full h-full border border-base-content/5 relative main-app-frame">
                <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                    <span ref={scanTopRef} className="absolute top-0 left-[-100%] w-full h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent z-10 opacity-0" />
                    <span ref={scanRightRef} className="absolute top-[-100%] right-0 w-[2px] h-full bg-gradient-to-b from-transparent via-primary to-transparent z-10 opacity-0" />
                    <span ref={scanBottomRef} className="absolute bottom-0 right-[-100%] w-full h-[2px] bg-gradient-to-l from-transparent via-primary to-transparent z-10 opacity-0" />
                    <span ref={scanLeftRef} className="absolute bottom-[-100%] left-0 w-[2px] h-full bg-gradient-to-t from-transparent via-primary to-transparent z-10 opacity-0" />
                </div>

                {/* Plus crosses (tl, tr, bl, br — the reveal in App.tsx keys fly-in direction off this order) */}
                {['-top-[6px] -left-[6px]', '-top-[6px] -right-[6px]', '-bottom-[6px] -left-[6px]', '-bottom-[6px] -right-[6px]'].map(pos => (
                    <div key={pos} className={`absolute ${pos} w-[11px] h-[11px] hidden sm:block corner-accent`}>
                        <span className="absolute left-[5px] top-0 w-px h-full bg-base-content/50" />
                        <span className="absolute top-[5px] left-0 h-px w-full bg-base-content/50" />
                    </div>
                ))}
            </div>
        </div>
    );
};

export default PageFrame;
