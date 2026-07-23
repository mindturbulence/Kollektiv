import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';
import { LiveAssistant, type LiveHandlers } from '../services/liveAssistantService';
import { OpenAIRealtimeAssistant, type OpenAILiveHandlers } from '../services/openaiRealtimeService';
import { ElevenLabsAssistant } from '../services/elevenLabsService';
import { useSettings } from './SettingsContext';
import { appEventBus } from '../utils/eventBus';
import { audioService } from '../services/audioService';
import { browserControlService } from '../services/browserControlService';

type Status = 'idle' | 'connecting' | 'live' | 'error';

interface LiveAssistantContextValue {
    status: Status;
    speaking: boolean;
    sharing: boolean;
    cameraActive: boolean;
    controlEnabled: boolean;
    error: string;
    setError: (message: string) => void;
    shareError: string;
    cameraError: string;
    /** MediaStream from the active camera — pass to a <video> element for
     *  PIP preview. Null when camera is off or backend doesn't expose one
     *  (ElevenLabs manages its own audio I/O internally). */
    activeCameraStream: MediaStream | null;
    hasVoiceKey: boolean;
    /** Which voice backend is currently active. */
    voiceProvider: 'gemini_live' | 'openai_realtime' | 'elevenlabs';
    toggleLive: () => void;
    toggleShare: () => void;
    toggleCamera: () => void;
    grantControl: () => void;
    revokeControl: () => void;
}

const LiveAssistantCtx = createContext<LiveAssistantContextValue | null>(null);

/** Owns the single LiveAssistant session so the mic toggle and the screen-share
 * toggle — rendered as separate header buttons — control the same call instead
 * of each spinning up its own connection. */
export const LiveAssistantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { settings } = useSettings();
    const liveRef = useRef<LiveAssistant | OpenAIRealtimeAssistant | ElevenLabsAssistant | null>(null);
    const [status, setStatus] = useState<Status>('idle');
    const [speaking, setSpeaking] = useState(false);
    const [sharing, setSharing] = useState(false);
    const [cameraActive, setCameraActive] = useState(false);
    const [cameraError, setCameraError] = useState('');
    const [activeCameraStream, setActiveCameraStream] = useState<MediaStream | null>(null);
    const [controlEnabled, setControlEnabled] = useState(false);
    const [error, setError] = useState('');
    const [shareError, setShareError] = useState('');
    const voiceProvider = settings.voiceProvider || 'gemini_live';

    useEffect(() => () => { liveRef.current?.disconnect(); }, []); // unmount cleanup

    useEffect(() => {
        appEventBus.emit('liveAssistantState', { status, speaking });
    }, [status, speaking]);

    const stop = useCallback(() => {
        liveRef.current?.disconnect();
        liveRef.current = null;
        setStatus('idle'); setSpeaking(false); setSharing(false); setCameraActive(false);
        setActiveCameraStream(null); setControlEnabled(false); setShareError(''); setCameraError('');
        // Do NOT revoke browser control permission here — it persists across
        // session boundaries so the user doesn't have to re-grant it every time
        // a session reconnects or errors. Permission is only revoked when the
        // user explicitly clicks the cursor/Release button.
        // https://github.com/user-attachments/assets/??? (auto-revoke bug)
        console.debug('[LiveAssistant] stop() — preserving browser control permission');
    }, []);

    const start = useCallback(async () => {
        // Assistant activation opens the dedicated fullscreen assistant view.
        appEventBus.emit('navigate', 'assistant');
        setError('');
        const handlers: LiveHandlers | OpenAILiveHandlers = {
            onStatus: (s, detail) => {
                if (s === 'live') setStatus('live');
                else if (s === 'connecting') setStatus('connecting');
                else if (s === 'error') {
                    liveRef.current?.disconnect();
                    liveRef.current = null;
                    setStatus('error'); setSpeaking(false); setSharing(false); setCameraActive(false); setActiveCameraStream(null);
                    setError(detail || 'Live session error');
                }
                else stop();
            },
            onCaption: (who, text) => appEventBus.emit('liveCaption', { who, text }),
            onToolActivity: (info) => appEventBus.emit('liveAssistantActivity', info),
            onSpeaking: setSpeaking,
            onScreenShare: setSharing,
            onCamera: (active) => {
                setCameraActive(active);
                // Mirror the active MediaStream from the backend into state for
                // the PIP preview. Backend exposes this via activeCameraStream.
                const stream = (liveRef.current as any)?.activeCameraStream ?? null;
                setActiveCameraStream(active ? stream : null);
            },
            onControlDenied: (sharingActive) => appEventBus.emit('assistantFeedback', {
                message: sharingActive
                    ? 'Assistant tried to control your browser, but control permission isn\'t granted — click the cursor icon in the header to allow it.'
                    : 'Assistant tried to control your browser, but you haven\'t shared your screen yet — click the monitor icon in the header first, then click the cursor icon that appears next to it.',
                isError: true,
            }),
            onShareWarning: (message) => appEventBus.emit('assistantFeedback', { message, isError: true }),
            onTurnState: (state) => console.debug('[LiveAssistant] turn state:', state),
        };

        const live = voiceProvider === 'openai_realtime'
            ? new OpenAIRealtimeAssistant()
            : voiceProvider === 'elevenlabs'
                ? new ElevenLabsAssistant()
                : new LiveAssistant();
        liveRef.current = live;
        try {
            await live.connect(settings, handlers as any);
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
    }, [status, stop, start, voiceProvider]);

    // Check for the right API key based on the selected voice provider
    const hasVoiceKey = voiceProvider === 'openai_realtime'
        ? !!(settings.openaiApiKey || process.env.OPENAI_API_KEY)
        : voiceProvider === 'elevenlabs'
            ? !!(settings.elevenlabsApiKey || process.env.ELEVENLABS_API_KEY)
            : !!(settings.geminiApiKey || process.env.GEMINI_API_KEY);

    // Global hotkey: Ctrl+Space toggles the live voice session from anywhere.
    useEffect(() => {
        if (!hasVoiceKey) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.code === 'Space' && !e.repeat) {
                e.preventDefault();
                audioService.playClick();
                toggleLive();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [toggleLive, hasVoiceKey]);

    const toggleShare = useCallback(() => {
        if (!liveRef.current) return;
        setShareError('');
        (sharing ? Promise.resolve(liveRef.current.stopScreenShare()) : liveRef.current.startScreenShare())
            .catch((e: any) => {
                if (e?.name === 'NotAllowedError') return;
                console.error('[LiveAssistant] screen share failed', e);
                setShareError(e?.message || 'Screen share failed — see console.');
            });
    }, [sharing]);

    const toggleCamera = useCallback(() => {
        if (!liveRef.current) return;
        setCameraError('');
        // ElevenLabs rejects startCamera with an Error — surface it; otherwise
        // fall through to the standard cameras-active check.
        if (cameraActive) {
            liveRef.current.stopCamera();
        } else {
            Promise.resolve(liveRef.current.startCamera?.())
                .catch((e: any) => {
                    if (e?.name === 'NotAllowedError') {
                        setCameraError('Camera permission denied.');
                        return;
                    }
                    console.error('[LiveAssistant] camera failed', e);
                    setCameraError(e?.message || 'Camera failed — see console.');
                });
        }
    }, [cameraActive]);

    // Subscribe to browserControlService permission changes.
    useEffect(() => {
        // Sync initial state from the service (covers Strict Mode remount where
        // React state resets but the service singleton kept its value).
        setControlEnabled(browserControlService.permissionGranted);
        const unsub = browserControlService.onPermissionChange((granted) => {
            console.debug('[LiveAssistant] permission changed', granted);
            setControlEnabled(granted);
        });
        return unsub;
    }, []);

    const grantControl = useCallback(() => {
        browserControlService.grant();
    }, []);

    const revokeControl = useCallback(() => {
        browserControlService.revoke();
    }, []);

    return (
        <LiveAssistantCtx.Provider value={{
            status, speaking, sharing, cameraActive, activeCameraStream, controlEnabled,
            error, setError, shareError, cameraError, hasVoiceKey, voiceProvider,
            toggleLive, toggleShare, toggleCamera, grantControl, revokeControl,
        }}>
            {children}
        </LiveAssistantCtx.Provider>
    );
};

export const useLiveAssistantContext = (): LiveAssistantContextValue => {
    const ctx = useContext(LiveAssistantCtx);
    if (!ctx) throw new Error('useLiveAssistantContext must be used within LiveAssistantProvider');
    return ctx;
};
