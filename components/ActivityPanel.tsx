import React, { useRef, useEffect, useState, useCallback, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import { v4 as uuidv4 } from 'uuid';
import { appEventBus } from '../utils/eventBus';
import { audioService } from '../services/audioService';
import { CloseIcon, DeleteIcon, TerminalIcon, ChatBubbleIcon } from './icons';

// ── Types ───────────────────────────────────────────────────────────

interface TranscriptEntry {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
}

interface ActivityEntry {
    id: string;
    text: string;
    timestamp: number;
}

// ── Props ───────────────────────────────────────────────────────────

interface ActivityPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────

const formatTime = (ts: number): string => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
};

// ── Component ───────────────────────────────────────────────────────

const ActivityPanel: React.FC<ActivityPanelProps> = ({ isOpen, onClose }) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const transcriptScrollerRef = useRef<HTMLDivElement>(null);
    const footerActivityRef = useRef<HTMLDivElement>(null);

    // Activity entries (tool calls, thinking steps) — only latest shown in footer
    const [activity, setActivity] = useState<ActivityEntry[]>([]);

    // Transcript entries (user + assistant captions)
    const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

    // Current session status
    const [sessionActive, setSessionActive] = useState(false);
    const [modeLabel, setModeLabel] = useState('');

    // ── Event bus listeners ─────────────────────────────────────

    useEffect(() => {
        // Listen for tool activity — show the actual tool name here, distinct
        // from the flavored phrase shown on the Samaritan assistant screen.
        const offActivity = appEventBus.on('liveAssistantActivity', (info: { flavour: string; toolName: string }) => {
            if (info?.toolName) {
                setActivity(prev => [...prev, {
                    id: uuidv4(),
                    text: info.toolName,
                    timestamp: Date.now(),
                }]);
            }
        });

        // Listen for caption chunks (user + assistant)
        const offCaption = appEventBus.on('liveCaption', (p: { who: 'user' | 'assistant'; text: string }) => {
            if (p && p.who && p.text) {
                // Append to the transcript: merge into the last entry while the same
                // speaker keeps talking, so the row reads as full speech, not one chunk per row.
                setTranscript(prev => {
                    const last = prev[prev.length - 1];
                    if (last && last.role === p.who) {
                        return [...prev.slice(0, -1), { ...last, content: last.content + p.text }];
                    }
                    return [...prev, {
                        id: uuidv4(),
                        role: p.who,
                        content: p.text,
                        timestamp: Date.now(),
                    }];
                });
            }
        });

        // Track session state
        const offState = appEventBus.on('liveAssistantState', (s: { status: string }) => {
            if (s?.status === 'idle' || s?.status === 'error') {
                setSessionActive(false);
                setModeLabel(s.status === 'error' ? 'Error' : 'Idle');
                setTranscript(prev => [...prev, {
                    id: uuidv4(),
                    role: 'system',
                    content: s.status === 'error' ? 'Session ended with error.' : 'Session ended.',
                    timestamp: Date.now(),
                }]);
            } else if (s?.status === 'connecting') {
                setSessionActive(true);
                setModeLabel('Connecting');
                setTranscript([{
                    id: uuidv4(),
                    role: 'system',
                    content: 'Session started.',
                    timestamp: Date.now(),
                }]);
                setActivity([]);
            } else if (s?.status === 'live') {
                setModeLabel('Listening');
            }
        });

        // Listen for mode changes from chat panel
        const offMode = appEventBus.on('chatSpeaking', (p: { speaking: boolean }) => {
            if (p) {
                setModeLabel(p.speaking ? 'Responding' : 'Listening');
            }
        });

        return () => { offActivity(); offCaption(); offState(); offMode(); };
    }, []);

    // ── Auto-scroll transcript ──────────────────────────────────

    useEffect(() => {
        if (transcriptScrollerRef.current) {
            transcriptScrollerRef.current.scrollTop = transcriptScrollerRef.current.scrollHeight;
        }
    }, [transcript]);

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

    // ── Clear ───────────────────────────────────────────────────

    const handleClearTranscript = useCallback(() => {
        audioService.playClick();
        setTranscript([]);
    }, []);

    // ── Latest activity (for footer display) ────────────────────

    const latestActivity = activity.length > 0 ? activity[activity.length - 1] : null;

    // ── Pulse animation on new activity ─────────────────────────

    useEffect(() => {
        if (!latestActivity || !footerActivityRef.current) return;
        // Brief flash to signal new activity
        gsap.fromTo(footerActivityRef.current,
            { backgroundColor: 'rgba(255,255,255,0.08)' },
            { backgroundColor: 'rgba(255,255,255,0)', duration: 0.6, ease: 'power2.out' }
        );
    }, [latestActivity]);

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
                    {/* ── Header: title + close ── */}
                    <div className="flex justify-between items-center h-14 px-6 bg-base-100/20 flex-shrink-0 border-b border-base-300/10 relative">
                        <div className="flex items-center gap-3">
                            <ChatBubbleIcon className="w-5 h-5 text-primary" />
                            <span className="text-base font-black uppercase tracking-[0.3em] font-logo text-base-content/80">
                                Transcript
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            {transcript.length > 0 && (
                                <button
                                    onClick={handleClearTranscript}
                                    className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 opacity-40 hover:opacity-100 hover:text-error transition-all btn-snake"
                                    title="Clear transcript"
                                >
                                    <span /><span /><span /><span />
                                    <DeleteIcon className="w-5 h-5" />
                                </button>
                            )}
                            <button
                                onClick={() => { audioService.playClick(); onClose(); }}
                                className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 opacity-40 hover:opacity-100 btn-snake"
                                aria-label="Close activity panel"
                            >
                                <span /><span /><span /><span />
                                <CloseIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
                    </div>

                    {/* ── Body: transcript ── */}
                    <div className="flex-grow flex flex-col overflow-hidden relative">
                        {/* Mode indicator bar */}
                        {sessionActive && (
                            <div className="flex-shrink-0 px-6 py-2 bg-primary/5 border-b border-primary/10 flex items-center gap-3">
                                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                <span className="text-sm font-black uppercase tracking-[0.3em] text-primary">
                                    {modeLabel || 'Active'}
                                </span>
                            </div>
                        )}

                        {/* Transcript scrollable area */}
                        <div ref={transcriptScrollerRef} className="flex-grow overflow-y-auto relative">
                            {transcript.length > 0 ? (
                                <div className="flex flex-col">
                                    {transcript.map((entry) => (
                                        <div
                                            key={entry.id}
                                            className={`flex flex-col gap-1 px-6 py-3 border-b border-base-300/10 transition-colors ${
                                                entry.role === 'user'
                                                    ? 'bg-primary/[0.02]'
                                                    : entry.role === 'system'
                                                    ? 'bg-base-100/20'
                                                    : 'hover:bg-base-100/10'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <span className={`text-sm font-black uppercase tracking-[0.2em] ${
                                                    entry.role === 'user'
                                                        ? 'text-accent'
                                                        : entry.role === 'system'
                                                        ? 'text-base-content/30'
                                                        : 'text-primary'
                                                }`}>
                                                    {entry.role === 'user' ? 'You' : entry.role === 'system' ? 'Sys' : 'AI'}
                                                </span>
                                                <span className="text-sm font-mono text-base-content/20 tabular-nums">
                                                    {formatTime(entry.timestamp)}
                                                </span>
                                            </div>
                                            <span className={`text-lg leading-relaxed ${
                                                entry.role === 'system'
                                                    ? 'text-base-content/40 italic'
                                                    : 'text-base-content/80'
                                            }`}>
                                                {entry.content}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center opacity-10 py-16">
                                    <ChatBubbleIcon className="w-16 h-16 mb-6" />
                                    <p className="text-xl font-black uppercase tracking-widest leading-none">No Transcript Yet</p>
                                    <p className="text-sm font-bold uppercase tracking-[0.2em] mt-4">
                                        Conversation history appears here
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Footer: current activity ── */}
                    <div
                        ref={footerActivityRef}
                        className="flex-shrink-0 border-t border-base-300/10 bg-base-100/10 relative"
                    >
                        {latestActivity ? (
                            <div className="flex items-center gap-3 px-6 py-2.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                                <TerminalIcon className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                                <span className="text-base font-medium text-base-content/60 truncate">
                                    {latestActivity.text}
                                </span>
                                <span className="text-sm font-mono text-base-content/20 tabular-nums ml-auto shrink-0">
                                    {formatTime(latestActivity.timestamp)}
                                </span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 px-6 py-2.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-base-content/10 shrink-0" />
                                <TerminalIcon className="w-3.5 h-3.5 text-base-content/10 shrink-0" />
                                <span className="text-sm font-medium text-base-content/20 italic">
                                    Awaiting activity…
                                </span>
                            </div>
                        )}
                        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
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

export default ActivityPanel;
