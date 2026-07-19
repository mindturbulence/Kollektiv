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

type ActivityTab = 'activity' | 'transcript';

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
    const activityScrollerRef = useRef<HTMLDivElement>(null);
    const transcriptScrollerRef = useRef<HTMLDivElement>(null);

    const [tab, setTab] = useState<ActivityTab>('activity');

    // Activity entries (tool calls, thinking steps)
    const [activity, setActivity] = useState<ActivityEntry[]>([]);

    // Transcript entries (user + assistant captions)
    const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

    // Current session status
    const [sessionActive, setSessionActive] = useState(false);
    const [modeLabel, setModeLabel] = useState('');

    // ── Event bus listeners ─────────────────────────────────────

    useEffect(() => {
        // Listen for tool activity lines
        const offActivity = appEventBus.on('liveAssistantActivity', (line: string) => {
            if (typeof line === 'string') {
                setActivity(prev => [...prev, {
                    id: uuidv4(),
                    text: line,
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

    // ── Auto-scroll activity ────────────────────────────────────

    useEffect(() => {
        if (tab === 'activity' && activityScrollerRef.current) {
            activityScrollerRef.current.scrollTop = activityScrollerRef.current.scrollHeight;
        }
    }, [activity, tab]);

    // ── Auto-scroll transcript ──────────────────────────────────

    useEffect(() => {
        if (tab === 'transcript' && transcriptScrollerRef.current) {
            transcriptScrollerRef.current.scrollTop = transcriptScrollerRef.current.scrollHeight;
        }
    }, [transcript, tab]);

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

    const handleClearActivity = useCallback(() => {
        audioService.playClick();
        setActivity([]);
    }, []);

    const handleClearTranscript = useCallback(() => {
        audioService.playClick();
        setTranscript([]);
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
                    <div className="flex justify-between items-center h-16 px-6 bg-base-100/20 flex-shrink-0 border-b border-base-300/10 relative">
                        <div className="flex items-center gap-3">
                            <TerminalIcon className="w-5 h-5 text-primary" />
                            <div className="flex gap-0">
                                <button
                                    onClick={() => { audioService.playClick(); setTab('activity'); }}
                                    className={`px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] font-logo border border-base-300/30 flex items-center gap-1.5 ${
                                        tab === 'activity'
                                            ? 'bg-primary/20 text-primary'
                                            : 'opacity-50 hover:opacity-100'
                                    }`}
                                >
                                    <TerminalIcon className="w-3.5 h-3.5" />
                                    Activity
                                </button>
                                <button
                                    onClick={() => { audioService.playClick(); setTab('transcript'); }}
                                    className={`px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] font-logo border border-base-300/30 border-l-0 flex items-center gap-1.5 ${
                                        tab === 'transcript'
                                            ? 'bg-primary/20 text-primary'
                                            : 'opacity-50 hover:opacity-100'
                                    }`}
                                >
                                    <ChatBubbleIcon className="w-3.5 h-3.5" />
                                    Transcript
                                </button>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {tab === 'activity' && activity.length > 0 && (
                                <button
                                    onClick={handleClearActivity}
                                    className="btn btn-xs btn-ghost h-8 w-8 rounded-none p-0 opacity-40 hover:opacity-100 hover:text-error transition-all btn-snake"
                                    title="Clear activity log"
                                >
                                    <span /><span /><span /><span />
                                    <DeleteIcon className="w-5 h-5" />
                                </button>
                            )}
                            {tab === 'transcript' && transcript.length > 0 && (
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

                    {/* ── Body ── */}
                    <div className="flex-grow flex flex-col overflow-hidden relative">
                        {/* Mode indicator bar */}
                        {sessionActive && (
                            <div className="flex-shrink-0 px-6 py-2 bg-primary/5 border-b border-primary/10 flex items-center gap-3">
                                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-primary">
                                    {modeLabel || 'Active'}
                                </span>
                            </div>
                        )}

                        {/* ── Activity tab ── */}
                        {tab === 'activity' && (
                            <div ref={activityScrollerRef} className="flex-grow overflow-y-auto relative">
                                {activity.length > 0 ? (
                                    <div className="flex flex-col">
                                        {activity.map((entry) => (
                                            <div
                                                key={entry.id}
                                                className="flex flex-col gap-1 px-6 py-3 border-b border-base-300/10 hover:bg-base-100/10 transition-colors"
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60">
                                                        Log
                                                    </span>
                                                    <span className="text-[9px] font-mono text-base-content/20 tabular-nums">
                                                        {formatTime(entry.timestamp)}
                                                    </span>
                                                </div>
                                                <span className="text-sm font-medium text-base-content/70 leading-relaxed">
                                                    {entry.text}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-center opacity-10 py-16">
                                        <TerminalIcon className="w-16 h-16 mb-6" />
                                        <p className="text-xl font-black uppercase tracking-widest leading-none">No Activity Yet</p>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] mt-4">
                                            Tool calls and thinking steps appear here
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Transcript tab ── */}
                        {tab === 'transcript' && (
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
                                                    <span className={`text-[9px] font-black uppercase tracking-[0.2em] ${
                                                        entry.role === 'user'
                                                            ? 'text-accent'
                                                            : entry.role === 'system'
                                                            ? 'text-base-content/30'
                                                            : 'text-primary'
                                                    }`}>
                                                        {entry.role === 'user' ? 'You' : entry.role === 'system' ? 'Sys' : 'AI'}
                                                    </span>
                                                    <span className="text-[9px] font-mono text-base-content/20 tabular-nums">
                                                        {formatTime(entry.timestamp)}
                                                    </span>
                                                </div>
                                                <span className={`text-sm leading-relaxed ${
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
                                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] mt-4">
                                            Conversation history appears here
                                        </p>
                                    </div>
                                )}
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

export default ActivityPanel;
