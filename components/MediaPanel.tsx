import React, { useRef, useEffect, useState, useCallback, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import { appEventBus } from '../utils/eventBus';
import { audioService } from '../services/audioService';
import { CloseIcon, YouTubeIcon, PlayIcon, FilmIcon, MusicNoteIcon, ChatBubbleIcon, EyeIcon } from './icons';

// ── URL parsers ─────────────────────────────────────────────────────

/** Extract a YouTube video ID from various URL formats. */
const extractYouTubeId = (url: string): string | null => {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const re of patterns) {
        const m = url.match(re);
        if (m) return m[1];
    }
    // Try loose extract — find any 11-char alphanumeric segment if nothing else matched
    const loose = url.match(/([a-zA-Z0-9_-]{11})/);
    return loose?.[1] || null;
};

/** Extract a Spotify resource type + id from a share URL. */
const extractSpotifyUri = (url: string): { type: string; id: string } | null => {
    const m = url.match(/open\.spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/);
    return m ? { type: m[1], id: m[2] } : null;
};

// ── Types ───────────────────────────────────────────────────────────

type MediaTab = 'video' | 'music';

interface MediaState {
    tab: MediaTab;
    // YouTube
    videoId: string | null;
    videoTitle: string;
    // Spotify
    spotifyType: string | null;
    spotifyId: string | null;
    spotifyTitle: string;
}

const EMPTY_STATE: MediaState = {
    tab: 'video',
    videoId: null,
    videoTitle: '',
    spotifyType: null,
    spotifyId: null,
    spotifyTitle: '',
};

// ── Component ───────────────────────────────────────────────────────

interface MediaPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

const MediaPanel: React.FC<MediaPanelProps> = ({ isOpen, onClose }) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const [tab, setTab] = useState<MediaTab>('video');
    const [urlDraft, setUrlDraft] = useState('');
    const [media, setMedia] = useState<MediaState>(EMPTY_STATE);
    const [error, setError] = useState('');

    // ── URL submission ───────────────────────────────────────────

    const loadUrl = useCallback((rawUrl: string) => {
        const url = rawUrl.trim();
        if (!url) return;
        setError('');

        // Try YouTube first
        const videoId = extractYouTubeId(url);
        if (videoId) {
            setMedia(prev => ({ ...prev, tab: 'video', videoId, videoTitle: url, spotifyType: null, spotifyId: null }));
            setTab('video');
            setUrlDraft(url);
            // Emit event to open center video player
            appEventBus.emit('playVideo', { url });
            return;
        }

        // Try Spotify
        const spotify = extractSpotifyUri(url);
        if (spotify) {
            const label = `${spotify.type.slice(0, 1).toUpperCase()}${spotify.type.slice(1)} #${spotify.id}`;
            setMedia(prev => ({ ...prev, tab: 'music', spotifyType: spotify.type, spotifyId: spotify.id, spotifyTitle: label, videoId: null }));
            setTab('music');
            setUrlDraft(url);
            return;
        }

        setError('Paste a YouTube or Spotify URL to play.');
    }, []);

    // ── Event bus: open from assistant ──────────────────────────

    useEffect(() => {
        const off = appEventBus.on('openMediaPanel', (payload: { url: string }) => {
            if (payload?.url) loadUrl(payload.url);
        });
        return off;
    }, [loadUrl]);

    // ── GSAP slide animation ────────────────────────────────────

    useLayoutEffect(() => {
        if (!panelRef.current) return;
        gsap.killTweensOf(panelRef.current);
        if (isOpen) {
            audioService.playPanelSlideIn();
            gsap.to(panelRef.current, {
                x: 0, duration: 1.2, ease: 'elastic.out(1, 0.75)',
                visibility: 'visible', pointerEvents: 'auto', opacity: 1,
            });
            // Auto-focus input after slide-in completes
            setTimeout(() => inputRef.current?.focus(), 400);
        } else {
            audioService.playPanelSlideOut();
            gsap.to(panelRef.current, {
                x: '100%', duration: 0.8, ease: 'elastic.in(1, 0.75)',
                pointerEvents: 'none', opacity: 0,
                onComplete: () => {
                    if (panelRef.current && !isOpen) panelRef.current.style.visibility = 'hidden';
                },
            });
        }
    }, [isOpen]);

    // ── Click-outside to close ──────────────────────────────────

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(event.target as Node)) onClose();
        };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose]);

    // ── Handle Enter in input ───────────────────────────────────

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            loadUrl(urlDraft);
        }
    }, [urlDraft, loadUrl]);

    // ── Clear / stop playback ───────────────────────────────────

    const handleClear = useCallback(() => {
        audioService.playClick();
        setMedia(EMPTY_STATE);
        setError('');
        setUrlDraft('');
    }, []);

    // ── Render ──────────────────────────────────────────────────

    return (
        <div
            ref={panelRef}
            className="absolute top-0 right-0 bottom-0 w-full md:w-[480px] bg-transparent z-[50] translate-x-full pointer-events-none"
            style={{ visibility: 'hidden' }}
            aria-hidden={!isOpen}
        >
            <div className="w-full h-full relative corner-frame overflow-visible flex flex-col pointer-events-auto">
                <div className="bg-base-100/60 backdrop-blur-3xl rounded-none w-[calc(100%-6px)] h-[calc(100%-6px)] m-[3px] flex flex-col overflow-hidden relative z-10">
                    {/* ── Header ── */}
                    <div className="flex flex-col bg-base-100/20 flex-shrink-0 border-b border-base-300/10 relative">
                        {/* Title + Close row */}
                        <div className="flex justify-between items-center h-14 px-6">
                            <div className="flex items-center gap-3">
                                {media.tab === 'video' ? (
                                    <YouTubeIcon className="w-5 h-5 text-primary" />
                                ) : (
                                    <MusicNoteIcon className="w-5 h-5 text-primary" />
                                )}
                                <div className="flex gap-0">
                                    <button
                                        onClick={() => { audioService.playClick(); setTab('video'); }}
                                        className={`px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] font-logo border border-base-300/30 flex items-center gap-1.5 ${
                                            tab === 'video'
                                                ? 'bg-primary/20 text-primary'
                                                : 'opacity-50 hover:opacity-100'
                                        }`}
                                    >
                                        <FilmIcon className="w-3.5 h-3.5" />
                                        Video
                                    </button>
                                    <button
                                        onClick={() => { audioService.playClick(); setTab('music'); }}
                                        className={`px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] font-logo border border-base-300/30 border-l-0 flex items-center gap-1.5 ${
                                            tab === 'music'
                                                ? 'bg-primary/20 text-primary'
                                                : 'opacity-50 hover:opacity-100'
                                        }`}
                                    >
                                        <MusicNoteIcon className="w-3.5 h-3.5" />
                                        Music
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {media.videoId || media.spotifyId ? (
                                    <button
                                        onClick={handleClear}
                                        className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 opacity-40 hover:opacity-100 hover:text-error transition-all btn-snake"
                                        title="Stop playback"
                                    >
                                        <span /><span /><span /><span />
                                        <CloseIcon className="w-5 h-5" />
                                    </button>
                                ) : null}
                                <button
                                    onClick={() => { audioService.playClick(); onClose(); }}
                                    className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 opacity-40 hover:opacity-100 btn-snake"
                                    aria-label="Close media panel"
                                >
                                    <span /><span /><span /><span />
                                    <CloseIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* URL Input row */}
                        <div className="flex items-center gap-2 px-6 pb-3">
                            <input
                                ref={inputRef}
                                type="text"
                                value={urlDraft}
                                onChange={(e) => setUrlDraft(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={
                                    tab === 'video'
                                        ? 'Paste YouTube URL…'
                                        : 'Paste Spotify URL…'
                                }
                                className="flex-grow min-w-0 text-[11px] font-mono text-base-content bg-base-200/50 border border-base-300/30 rounded-md px-3 py-1.5 focus:outline-none focus:border-primary/50"
                            />
                            <button
                                onClick={() => loadUrl(urlDraft)}
                                className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest border border-base-300/30 text-primary hover:bg-primary/20 flex items-center gap-1"
                            >
                                <PlayIcon className="w-3 h-3" /> Play
                            </button>
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
                    </div>

                    {/* ── Body: Player ── */}
                    <div className="flex-grow flex flex-col overflow-hidden relative">
                        {error && (
                            <div className="text-[10px] font-mono text-warning/70 px-6 py-2 bg-warning/5 border-b border-warning/10">
                                {error}
                            </div>
                        )}

                        {tab === 'video' && media.videoId ? (
                            <div className="flex-grow flex flex-col">
                                {/* Video title bar */}
                                <div className="px-4 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-base-content/40 truncate border-b border-base-300/10 flex items-center gap-2">
                                    <EyeIcon className="w-3.5 h-3.5 text-primary" />
                                    <span>{media.videoTitle}</span>
                                </div>
                                {/* Video info / description panel */}
                                <div className="flex-grow flex flex-col items-center justify-center px-8 py-8 overflow-y-auto">
                                    <div className="max-w-md text-center">
                                        <YouTubeIcon className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                        <p className="text-[11px] font-black uppercase tracking-[0.25em] text-base-content/30 mb-2">
                                            Now Playing in Center Player
                                        </p>
                                        <p className="text-[9px] font-mono text-base-content/20 leading-relaxed">
                                            The video is playing in the center of the screen.
                                            <br />
                                            Use this panel to browse related content and video info.
                                        </p>

                                        {/* Video metadata stub */}
                                        <div className="mt-8 pt-6 border-t border-base-300/10 w-full">
                                            <div className="flex items-center gap-2 justify-center text-[9px] font-mono text-base-content/30">
                                                <ChatBubbleIcon className="w-3.5 h-3.5" />
                                                <span className="uppercase tracking-widest">Comments &amp; description coming soon</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : tab === 'music' && media.spotifyId ? (
                            <div className="flex-grow flex flex-col">
                                {/* Track info bar */}
                                <div className="px-4 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-base-content/40 truncate border-b border-base-300/10">
                                    {media.spotifyTitle}
                                </div>
                                {/* Spotify embed */}
                                <div className="flex-grow relative">
                                    <iframe
                                        src={`https://open.spotify.com/embed/${media.spotifyType}/${media.spotifyId}?utm_source=generator&autoplay=1`}
                                        title="Spotify player"
                                        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                                        allowFullScreen
                                        className="absolute inset-0 w-full h-full"
                                        style={{ border: 'none' }}
                                    />
                                </div>
                            </div>
                        ) : (
                            /* ── Empty state ── */
                            <div className="flex-grow flex flex-col items-center justify-center text-center opacity-10 py-16">
                                {tab === 'video' ? (
                                    <FilmIcon className="w-16 h-16 mb-6" />
                                ) : (
                                    <MusicNoteIcon className="w-16 h-16 mb-6" />
                                )}
                                <p className="text-xl font-black uppercase tracking-widest leading-none">
                                    {tab === 'video' ? 'No Video Playing' : 'No Music Playing'}
                                </p>
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] mt-4">
                                    {tab === 'video'
                                        ? 'Paste a YouTube URL above, or ask the assistant to play something'
                                        : 'Paste a Spotify URL above, or ask the assistant to play something'}
                                </p>
                            </div>
                        )}

                        {/* ── Quick example links ── */}
                        {!media.videoId && !media.spotifyId && (
                            <div className="flex-shrink-0 border-t border-base-300/10 px-6 py-3">
                                <p className="text-[8px] font-black uppercase tracking-[0.3em] text-base-content/20 mb-2">Examples:</p>
                                <div className="flex gap-2 flex-wrap">
                                    <button
                                        onClick={() => loadUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')}
                                        className="text-[8px] font-mono text-primary/40 hover:text-primary/80 transition-colors underline underline-offset-2"
                                    >
                                        youtube.com/watch?v=...
                                    </button>
                                    <button
                                        onClick={() => loadUrl('https://open.spotify.com/track/3n3Ppam7vLzC2UjO3yfoU')}
                                        className="text-[8px] font-mono text-primary/40 hover:text-primary/80 transition-colors underline underline-offset-2"
                                    >
                                        open.spotify.com/track/...
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Corner accents */}
                <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
            </div>
        </div>
    );
};

export default MediaPanel;
