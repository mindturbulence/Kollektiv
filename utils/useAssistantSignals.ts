import { useEffect, useRef, useState } from 'react';
import { appEventBus } from './eventBus';
import { useLiveAssistantContext } from '../contexts/LiveAssistantContext';
import { deriveMode, type AssistantMode } from './assistantMode';

const TICK_MS = 400; // clock tick so time-decayed modes (processing/listening) expire

export interface AssistantSignals {
    mode: AssistantMode;
    status: 'idle' | 'connecting' | 'live' | 'error';
    error: string;
    userText: string;
    assistantText: string;
    activity: string[];
}

/** Live-session signals digested for UI: current visual mode plus the latest
 * transcripts and tool-activity lines. Used by the Samaritan assistant page
 * (full detail) and the footer indicator (mode label only). Ticks only while
 * a session is active, so an always-mounted consumer like the footer costs
 * nothing when idle. */
export function useAssistantSignals(): AssistantSignals {
    const { status, speaking, error } = useLiveAssistantContext();
    const [now, setNow] = useState(() => Date.now());
    const [userText, setUserText] = useState('');
    const [assistantText, setAssistantText] = useState('');
    const [activity, setActivity] = useState<string[]>([]);
    const lastActivityAt = useRef(0);
    const lastUserCaptionAt = useRef(0);
    const wasSpeakingRef = useRef(speaking);

    // Clear assistant text when the assistant stops speaking — prevents the
    // last utterance from lingering on screen after the AI goes quiet.
    useEffect(() => {
        if (wasSpeakingRef.current && !speaking) {
            setAssistantText('');
        }
        wasSpeakingRef.current = speaking;
    }, [speaking]);

    useEffect(() => {
        if (status === 'idle' || status === 'error') return;
        const id = setInterval(() => setNow(Date.now()), TICK_MS);
        return () => clearInterval(id);
    }, [status]);

    useEffect(() => {
        const offCaption = appEventBus.on('liveCaption', (p: { who: 'user' | 'assistant'; text: string }) => {
            if (p.who === 'user') {
                lastUserCaptionAt.current = Date.now();
                setUserText(prev => (prev + p.text).slice(-160));
                setAssistantText('');
            } else {
                // Full turn kept (reset on next user caption) — the assistant page
                // plays it word-by-word, so truncating would drop words mid-reply.
                setAssistantText(prev => prev + p.text);
                setUserText('');
            }
        });
        const offActivity = appEventBus.on('liveAssistantActivity', (line: string) => {
            lastActivityAt.current = Date.now();
            setActivity(prev => [...prev, line].slice(-4));
        });
        return () => { offCaption(); offActivity(); };
    }, []);

    const mode = deriveMode({
        status,
        speaking,
        lastActivityAt: lastActivityAt.current,
        lastUserCaptionAt: lastUserCaptionAt.current,
        now,
    });

    return { mode, status, error, userText, assistantText, activity };
}
