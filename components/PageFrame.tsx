import React, { useLayoutEffect } from 'react';
import { gsap } from 'gsap';

export interface PageFrameProps {
    isInitialized: boolean;
    frameWrapperRef: React.RefObject<HTMLDivElement>;
    scanTopRef: React.RefObject<HTMLSpanElement>;
    scanRightRef: React.RefObject<HTMLSpanElement>;
    scanBottomRef: React.RefObject<HTMLSpanElement>;
    scanLeftRef: React.RefObject<HTMLSpanElement>;
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
        <div ref={frameWrapperRef} className="fixed inset-0 z-[1000] pointer-events-none p-4 md:p-6">
            <div className="w-full h-full border border-base-content/5 relative main-app-frame">
                <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                    <span ref={scanTopRef} className="absolute top-0 left-[-100%] w-full h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent z-10 opacity-0" />
                    <span ref={scanRightRef} className="absolute top-[-100%] right-0 w-[2px] h-full bg-gradient-to-b from-transparent via-primary to-transparent z-10 opacity-0" />
                    <span ref={scanBottomRef} className="absolute bottom-0 right-[-100%] w-full h-[2px] bg-gradient-to-l from-transparent via-primary to-transparent z-10 opacity-0" />
                    <span ref={scanLeftRef} className="absolute bottom-[-100%] left-0 w-[2px] h-full bg-gradient-to-t from-transparent via-primary to-transparent z-10 opacity-0" />
                </div>

                <div className="absolute -top-[1px] -left-[1px] w-4 h-4 border-t border-l border-primary/20 corner-accent" />
                <div className="absolute -top-[1px] -right-[1px] w-4 h-4 border-t border-r border-primary/20 corner-accent" />
                <div className="absolute -bottom-[1px] -left-[1px] w-4 h-4 border-b border-l border-primary/20 corner-accent" />
                <div className="absolute -bottom-[1px] -right-[1px] w-4 h-4 border-b border-r border-primary/20 corner-accent" />

                <div className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-2 side-marker">
                    <div className="w-[1px] h-4 bg-primary/10" />
                    <div className="w-[1px] h-[1px] bg-primary/20" />
                    <div className="w-[1px] h-4 bg-primary/10" />
                </div>

                <div className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 flex flex-col gap-2 side-marker">
                    <div className="w-[1px] h-4 bg-primary/10" />
                    <div className="w-[1px] h-[1px] bg-primary/20" />
                    <div className="w-[1px] h-4 bg-primary/10" />
                </div>
            </div>
        </div>
    );
};

export default PageFrame;
