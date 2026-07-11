import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';
import { LiveAssistant } from '../services/liveAssistantService';
import { useSettings } from './SettingsContext';
import { appEventBus } from '../utils/eventBus';

type Status = 'idle' | 'connecting' | 'live' | 'error';

interface LiveAssistantContextValue {
    status: Status;
    speaking: boolean;
    sharing: boolean;
    error: string;
    shareError: string;
    hasGeminiKey: boolean;
    toggleLive: () => void;
    toggleShare: () => void;
}

const LiveAssistantCtx = createContext<LiveAssistantContextValue | null>(null);

/** Owns the single LiveAssistant session so the mic toggle and the screen-share
 * toggle — rendered as separate header buttons — control the same call instead
 * of each spinning up its own connection. */
export const LiveAssistantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { settings } = useSettings();
    const liveRef = useRef<LiveAssistant | null>(null);
    const [status, setStatus] = useState<Status>('idle');
    const [speaking, setSpeaking] = useState(false);
    const [sharing, setSharing] = useState(false);
    const [error, setError] = useState('');
    const [shareError, setShareError] = useState('');

    useEffect(() => () => { liveRef.current?.disconnect(); }, []); // unmount cleanup

    useEffect(() => {
        appEventBus.emit('liveAssistantState', { status, speaking });
    }, [status, speaking]);

    const stop = useCallback(() => {
        liveRef.current?.disconnect();
        liveRef.current = null;
        setStatus('idle'); setSpeaking(false); setSharing(false); setShareError('');
    }, []);

    const start = useCallback(async () => {
        setError('');
        const live = new LiveAssistant();
        liveRef.current = live;
        try {
            await live.connect(settings, {
                onStatus: (s, detail) => {
                    if (s === 'live') setStatus('live');
                    else if (s === 'connecting') setStatus('connecting');
                    else if (s === 'error') {
                        // Tear down mic/audio like stop() would, but keep the error
                        // message on screen instead of silently reverting to idle.
                        liveRef.current?.disconnect();
                        liveRef.current = null;
                        setStatus('error'); setSpeaking(false); setSharing(false);
                        setError(detail || 'Live session error');
                    }
                    else stop();
                },
                onCaption: (who, text) => appEventBus.emit('liveCaption', { who, text }),
                onToolActivity: (line) => appEventBus.emit('liveAssistantActivity', line),
                onSpeaking: setSpeaking,
                onScreenShare: setSharing,
            });
        } catch (e: any) {
            setStatus('error');
            setError(e?.message || 'Failed to start live session');
            live.disconnect();
            liveRef.current = null;
        }
    }, [settings, stop]);

    const toggleLive = useCallback(() => {
        if (status === 'live' || status === 'connecting') stop();
        else void start();
    }, [status, stop, start]);

    const toggleShare = useCallback(() => {
        if (!liveRef.current) return;
        setShareError('');
        (sharing ? Promise.resolve(liveRef.current.stopScreenShare()) : liveRef.current.startScreenShare())
            .catch((e: any) => {
                // NotAllowedError covers both "permission denied" and "user closed
                // the picker dialog" — both are a normal no-op, not a failure.
                if (e?.name === 'NotAllowedError') return;
                console.error('[LiveAssistant] screen share failed', e);
                setShareError(e?.message || 'Screen share failed — see console.');
            });
    }, [sharing]);

    // Live voice always runs on Gemini regardless of the footer's active-engine
    // switch (same reasoning as the text assistant) — gate on key presence, not
    // on activeLLM, so switching engines for manual work doesn't hide this.
    const hasGeminiKey = !!(settings.geminiApiKey || process.env.GEMINI_API_KEY);

    return (
        <LiveAssistantCtx.Provider value={{ status, speaking, sharing, error, shareError, hasGeminiKey, toggleLive, toggleShare }}>
            {children}
        </LiveAssistantCtx.Provider>
    );
};

export const useLiveAssistantContext = (): LiveAssistantContextValue => {
    const ctx = useContext(LiveAssistantCtx);
    if (!ctx) throw new Error('useLiveAssistantContext must be used within LiveAssistantProvider');
    return ctx;
};
