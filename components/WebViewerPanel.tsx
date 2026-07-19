import React, { useCallback, useEffect, useState, useRef, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import { appEventBus } from '../utils/eventBus';
import { audioService } from '../services/audioService';
import { CloseIcon, GlobeIcon, ArrowsMaximizeIcon, ArrowRightIcon } from './icons';

type Mode = 'loading' | 'live' | 'reader';

/** One proxied request answers both questions: can the page be iframed
 * (X-Frame-Options / CSP frame-ancestors — readable here because
 * /proxy-remote mirrors the target's response headers to our origin), and
 * what is its readable text for reader mode. */
const probePage = async (url: string): Promise<{ embeddable: boolean; title: string; text: string }> => {
    const parsed = new URL(url);
    const res = await fetch(`/proxy-remote${parsed.pathname}${parsed.search}`, { headers: { 'x-target-url': parsed.origin } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const xfo = (res.headers.get('x-frame-options') || '').toLowerCase();
    const csp = (res.headers.get('content-security-policy') || '').toLowerCase();
    const embeddable = !xfo && !csp.includes('frame-ancestors');
    const raw = await res.text();
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    doc.querySelectorAll('script, style, noscript, svg, iframe').forEach(el => el.remove());
    return {
        embeddable,
        title: doc.title || url,
        text: (doc.body?.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(),
    };
};

// ── Props ───────────────────────────────────────────────────────────

interface WebViewerPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

/** Sliding web viewer. Opens via the 'openWebPage' bus event (assistant
 * open_web_page tool) or the header button. Live iframe when the site allows
 * embedding, reader mode otherwise. GSAP slide animation matching the other
 * panels (ClippingPanel, MediaPanel). */
const WebViewerPanel: React.FC<WebViewerPanelProps> = ({ isOpen, onClose }) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const [url, setUrl] = useState<string | null>(null);
    const [mode, setMode] = useState<Mode>('loading');
    const [embeddable, setEmbeddable] = useState(false);
    const [title, setTitle] = useState('');
    const [text, setText] = useState('');
    const [probeError, setProbeError] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);
    const [urlDraft, setUrlDraft] = useState('');
    const [flashVisible, setFlashVisible] = useState(false);

    // ── Load a URL ──────────────────────────────────────────────

    const load = useCallback((target: string) => {
        setUrl(target);
        setUrlDraft(target);
        setMode('loading');
        setEmbeddable(false);
        setTitle(target);
        setText('');
        setProbeError('');
        probePage(target)
            .then(r => {
                setTitle(r.title);
                setText(r.text);
                setEmbeddable(r.embeddable);
                setMode(r.embeddable ? 'live' : 'reader');
            })
            .catch(e => {
                // Probe failed (network/proxy) — fall back to trying the live
                // embed anyway; the browser may succeed where the proxy could not.
                setProbeError(e?.message || 'fetch failed');
                setEmbeddable(true);
                setMode('live');
            });
    }, []);

    // ── Event bus: open from assistant ──────────────────────────

    useEffect(() => {
        const off = appEventBus.on('openWebPage', (p: { url: string }) => {
            if (p?.url) {
                load(p.url);
                setFlashVisible(true);
                setTimeout(() => setFlashVisible(false), 600);
                setTimeout(() => inputRef.current?.focus(), 400);
            }
        });
        return off;
    }, [load]);

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

    // ── Click-outside to close (when open) ──────────────────────

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(event.target as Node)) onClose();
        };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose]);

    // ── Navigation helpers ──────────────────────────────────────

    const close = useCallback(() => {
        audioService.playPanelSlideOut();
        onClose();
    }, [onClose]);

    const navigate = useCallback(() => {
        const target = urlDraft.trim();
        if (!target) return;
        audioService.playClick();
        load(/^https?:\/\//i.test(target) ? target : `https://${target}`);
    }, [urlDraft, load]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); navigate(); }
    }, [navigate]);

    // ── Render ──────────────────────────────────────────────────

    return (
        <div
            ref={panelRef}
            className={`absolute top-0 right-0 bottom-0 bg-transparent z-[50] translate-x-full pointer-events-none ${isExpanded ? 'w-full' : 'w-full md:w-[720px]'}`}
            style={{ visibility: 'hidden' }}
            aria-hidden={!isOpen}
        >
            <div className="w-full h-full relative corner-frame overflow-visible flex flex-col pointer-events-auto">
                <div className="bg-base-100/95 backdrop-blur-3xl rounded-none w-[calc(100%-6px)] h-[calc(100%-6px)] m-[3px] flex flex-col overflow-hidden relative z-10 border border-white/5">
                    {/* ── Header ── */}
                    <div className="flex flex-col bg-base-100/40 flex-shrink-0 border-b border-base-300/20 relative">
                        {/* Title row */}
                        <div className="flex justify-between items-center h-14 px-6">
                            <div className="flex items-center gap-2 min-w-0">
                                <GlobeIcon className="w-5 h-5 text-primary flex-shrink-0" />
                                <h3 className="text-xs font-black uppercase tracking-[0.2em] font-logo truncate">
                                    {title || 'Web Viewer'}
                                </h3>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <button
                                    onClick={() => { audioService.playClick(); setIsExpanded(!isExpanded); }}
                                    className={`btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 hover:opacity-100 hidden md:flex ${isExpanded ? 'opacity-100' : 'opacity-40'}`}
                                    aria-label={isExpanded ? 'Shrink panel' : 'Expand panel to full width'}
                                    aria-pressed={isExpanded}
                                >
                                    <ArrowsMaximizeIcon className="w-5 h-5" />
                                </button>
                                <button onClick={close} className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 opacity-40 hover:opacity-100" aria-label="Close web viewer">
                                    <CloseIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Address bar row */}
                        <div className="flex items-center gap-2 px-6 pb-3">
                            <input
                                ref={inputRef}
                                type="text"
                                value={urlDraft}
                                onChange={(e) => setUrlDraft(e.target.value)}
                                onFocus={(e) => e.target.select()}
                                onKeyDown={handleKeyDown}
                                placeholder="Enter address…"
                                className="flex-grow min-w-0 text-[11px] font-mono text-base-content bg-base-200/50 border border-base-300/30 rounded-md px-3 py-1.5 focus:outline-none focus:border-primary/50"
                            />
                            <div className="tab-group flex flex-shrink-0">
                                <button
                                    onClick={navigate}
                                    title="Go"
                                    aria-label="Open address in panel"
                                    className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest border border-base-300/30 text-primary hover:bg-primary/20 flex items-center gap-1"
                                >
                                    <ArrowRightIcon className="w-3 h-3" /> Open
                                </button>
                                <button
                                    onClick={() => { audioService.playClick(); setMode('reader'); }}
                                    disabled={!text}
                                    className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-widest border border-base-300/30 border-l-0 ${mode === 'reader' ? 'bg-primary/20 text-primary' : 'opacity-50 hover:opacity-100'} disabled:opacity-20 disabled:pointer-events-none`}
                                >
                                    Reader
                                </button>
                            </div>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
                    </div>

                    {/* ── Body ── */}
                    <div className="flex-grow overflow-hidden relative">
                        {/* Flash border animation on open */}
                        {flashVisible && (
                            <div className="absolute -inset-[3px] border-2 border-primary z-30 pointer-events-none animate-fade-in" />
                        )}

                        {!url ? (
                            /* Empty state */
                            <div className="h-full flex flex-col items-center justify-center text-center opacity-10">
                                <GlobeIcon className="w-16 h-16 mb-6" />
                                <p className="text-xl font-black uppercase tracking-widest leading-none">No Page Open</p>
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] mt-4">
                                    Ask the assistant to open a page, or type a URL above
                                </p>
                            </div>
                        ) : mode === 'loading' ? (
                            <div className="h-full flex items-center justify-center text-[10px] font-black uppercase tracking-[0.3em] opacity-40 animate-pulse">
                                <div className="flex flex-col items-center gap-4">
                                    <div className="loading loading-spinner loading-md text-primary"></div>
                                    <span>Probing page…</span>
                                </div>
                            </div>
                        ) : mode === 'live' ? (
                            <div className="w-full h-full flex flex-col">
                                {probeError && (
                                    <p className="text-[9px] font-mono text-warning/70 px-3 py-1 bg-warning/5 border-b border-warning/10">
                                        Reader probe failed ({probeError}) — showing live embed only.
                                    </p>
                                )}
                                <iframe
                                    src={url}
                                    title="Web viewer"
                                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                                    className="w-full flex-grow bg-white"
                                />
                            </div>
                        ) : (
                            /* Reader mode */
                            <div className="h-full overflow-y-auto custom-scrollbar p-6">
                                {!embeddable && (
                                    <p className="text-[9px] font-black uppercase tracking-widest text-warning/70 mb-4">
                                        This site refuses embedding — showing reader mode.
                                    </p>
                                )}
                                <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap text-[14px] leading-relaxed">
                                    {text}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Corner accents */}
                <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/20 z-20 pointer-events-none" />
                <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/20 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/20 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/20 z-20 pointer-events-none" />
            </div>
        </div>
    );
};

export default WebViewerPanel;
