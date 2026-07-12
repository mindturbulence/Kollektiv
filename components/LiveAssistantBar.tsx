import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { audioService } from '../services/audioService';
import { HUDNavItem } from './HUDNavItem';
import { MicrophoneIcon, MonitorIcon, AlertTriangleIcon, CloseIcon, CursorIcon } from './icons';
import { useLiveAssistantContext } from '../contexts/LiveAssistantContext';

/** Mic toggle — starts/stops the Gemini Live voice session. Renders next to
 * the header's other icon buttons. On error, faults are shown by
 * `LiveAssistantFault` (floating center-screen) rather than here — a header
 * icon has nowhere legible nearby to surface a failure. */
export const LiveAssistantMicButton: React.FC = () => {
    const { status, speaking, hasGeminiKey, toggleLive } = useLiveAssistantContext();
    if (!hasGeminiKey) return null;

    const isOn = status === 'live' || status === 'connecting';
    const title = status === 'connecting' ? 'Linking…' : status === 'error' ? 'Live error — click to retry' : isOn ? 'End Live (Ctrl+Space)' : 'Go Live (Ctrl+Space)';

    return (
        <HUDNavItem
            onClick={(e) => {
                e.stopPropagation();
                audioService.playClick();
                toggleLive();
            }}
            title={title}
            badge={isOn ? 1 : undefined}
        >
            <MicrophoneIcon className={`w-4 h-4 ${status === 'error' ? 'text-error' : speaking ? 'text-primary' : ''}`} />
        </HUDNavItem>
    );
};

/** Floating, center-screen fault message for live-session errors. Suppressed
 * on the assistant screen itself (AssistantPage.tsx renders its own
 * full-screen SYSTEM FAULT state), so pass `hidden` there — mirrors how
 * LiveCaptionOverlay is gated off that page in App.tsx. Auto-dismisses like
 * FeedbackToast's error case. */
export const LiveAssistantFault: React.FC<{ hidden?: boolean }> = ({ hidden = false }) => {
    const { status, error, setError } = useLiveAssistantContext();
    const show = !hidden && status === 'error' && !!error;

    React.useEffect(() => {
        if (!show) return;
        const t = setTimeout(() => setError(''), 5000);
        return () => clearTimeout(t);
    }, [show, error, setError]);

    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {show && (
                <div className="fixed inset-0 z-[3000] flex items-center justify-center pointer-events-none px-8">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="relative p-[1px] corner-frame overflow-visible shadow-2xl min-w-[320px] max-w-md pointer-events-auto"
                    >
                        <div className="flex items-stretch h-full w-full overflow-hidden relative z-10 bg-error/10 backdrop-blur-xl border border-error/30">
                            <div className="w-1.5 h-auto bg-error shrink-0" />
                            <div className="flex-1 p-4 pr-10">
                                <div className="flex items-center gap-2 mb-1">
                                    <AlertTriangleIcon className="w-4 h-4 text-error" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-error">SYSTEM FAULT</span>
                                </div>
                                <p className="text-[11px] font-bold uppercase tracking-wider text-base-content/80 leading-relaxed">{error}</p>
                            </div>
                            <button onClick={() => setError('')} className="absolute top-2 right-2 p-1 hover:bg-base-content/10 transition-colors rounded-none">
                                <CloseIcon className="w-3.5 h-3.5 text-base-content/40" />
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
};

/** Screen-share toggle for the active live session. Only meaningful while
 * live, so it's hidden the rest of the time rather than shown disabled. */
export const LiveAssistantScreenButton: React.FC = () => {
    const { status, sharing, shareError, hasGeminiKey, toggleShare } = useLiveAssistantContext();
    if (!hasGeminiKey || status !== 'live') return null;

    return (
        <HUDNavItem
            onClick={(e) => {
                e.stopPropagation();
                audioService.playClick();
                toggleShare();
            }}
            title={shareError || (sharing ? 'Stop sharing your screen with the assistant' : 'Share your screen so the assistant can see it')}
        >
            <MonitorIcon className={`w-4 h-4 ${shareError ? 'text-error' : sharing ? 'text-warning' : ''}`} />
        </HUDNavItem>
    );
};

/** Browser-control permission toggle. Only visible when screen sharing is active.
 * The assistant needs explicit user permission before it can click, type, or
 * scroll on the user's screen. */
export const LiveAssistantControlButton: React.FC = () => {
    const { status, sharing, controlEnabled, hasGeminiKey, grantControl, revokeControl } = useLiveAssistantContext();
    if (!hasGeminiKey || status !== 'live' || !sharing) return null;

    return (
        <HUDNavItem
            onClick={(e) => {
                e.stopPropagation();
                audioService.playClick();
                if (controlEnabled) revokeControl();
                else grantControl();
            }}
            title={controlEnabled ? 'Revoke browser control permission' : 'Grant browser control permission so the assistant can click, type, scroll on your screen'}
        >
            <CursorIcon className={`w-4 h-4 ${controlEnabled ? 'text-warning' : ''}`} />
        </HUDNavItem>
    );
};
