import React, { useRef, useEffect, useState, useCallback } from 'react';
import { gsap } from 'gsap';
import { CloseIcon } from './icons';

/** Extract a YouTube video ID from various URL formats. */
const extractYouTubeId = (url: string): string | null => {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /(?:www\.youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const re of patterns) {
        const m = url.match(re);
        if (m) return m[1];
    }
    const loose = url.match(/([a-zA-Z0-9_-]{11})/);
    return loose?.[1] || null;
};

interface VideoPlayerOverlayProps {
    url: string | null;
    onClose: () => void;
}

const VideoPlayerOverlay: React.FC<VideoPlayerOverlayProps> = ({ url, onClose }) => {
    const overlayRef = useRef<HTMLDivElement>(null);
    const backdropRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);

    const videoId = url ? extractYouTubeId(url) : null;

    // ── GSAP entrance / exit ──────────────────────────────────

    useEffect(() => {
        if (!overlayRef.current || !backdropRef.current || !playerRef.current) return;

        if (url && videoId) {
            // Enter
            setVisible(true);
            gsap.killTweensOf([backdropRef.current, playerRef.current, overlayRef.current]);

            gsap.set(overlayRef.current, { display: 'flex', visibility: 'visible' });
            gsap.set(backdropRef.current, { opacity: 0 });
            gsap.set(playerRef.current, { scale: 0.85, opacity: 0, y: 20 });

            gsap.to(backdropRef.current, {
                opacity: 1,
                duration: 0.5,
                ease: 'power2.out',
            });
            gsap.to(playerRef.current, {
                scale: 1,
                opacity: 1,
                y: 0,
                duration: 0.6,
                ease: 'back.out(1.7)',
                delay: 0.05,
            });
        } else {
            // Exit
            if (!visible) return;
            gsap.to(playerRef.current, {
                scale: 0.85,
                opacity: 0,
                y: -20,
                duration: 0.3,
                ease: 'power2.in',
            });
            gsap.to(backdropRef.current, {
                opacity: 0,
                duration: 0.3,
                ease: 'power2.in',
                onComplete: () => {
                    gsap.set(overlayRef.current, { display: 'none', visibility: 'hidden' });
                    setVisible(false);
                },
            });
        }
    }, [url, videoId]);

    // ── Keyboard: Escape to close ─────────────────────────────

    useEffect(() => {
        if (!visible) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [visible, onClose]);

    // ── Click backdrop to close ───────────────────────────────

    const handleBackdropClick = useCallback((e: React.MouseEvent) => {
        if (e.target === backdropRef.current) onClose();
    }, [onClose]);

    if (!url || !videoId) return null;

    return (
        <div
            ref={overlayRef}
            className="fixed inset-0 z-[900] flex items-center justify-center"
            style={{ display: 'none', visibility: 'hidden' }}
        >
            {/* Backdrop */}
            <div
                ref={backdropRef}
                className="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-pointer"
                onClick={handleBackdropClick}
            />

            {/* Player container */}
            <div
                ref={playerRef}
                className="relative w-full max-w-5xl mx-4 md:mx-8 aspect-video bg-black rounded-lg overflow-hidden shadow-2xl"
                style={{ boxShadow: '0 0 60px rgba(0,0,0,0.5)' }}
            >
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 z-10 w-9 h-9 flex items-center justify-center bg-black/50 hover:bg-black/80 rounded-full transition-all opacity-60 hover:opacity-100 text-white"
                    aria-label="Close video player"
                >
                    <CloseIcon className="w-5 h-5" />
                </button>

                {/* YouTube embed */}
                <iframe
                    src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
                    title="YouTube video player"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full"
                />
            </div>
        </div>
    );
};

export default VideoPlayerOverlay;
