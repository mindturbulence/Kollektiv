import React from 'react';
import { audioService } from '../services/audioService';
import { HUDNavItem } from './HUDNavItem';
import { MicrophoneIcon, MonitorIcon } from './icons';
import { useLiveAssistantContext } from '../contexts/LiveAssistantContext';

/** Mic toggle — starts/stops the Gemini Live voice session. Renders next to
 * the header's other icon buttons; shows a small error popover on connect
 * failure since a header icon has nowhere else to surface that. */
export const LiveAssistantMicButton: React.FC = () => {
    const { status, speaking, error, hasGeminiKey, toggleLive } = useLiveAssistantContext();
    if (!hasGeminiKey) return null;

    const isOn = status === 'live' || status === 'connecting';
    const title = status === 'connecting' ? 'Linking…' : status === 'error' ? 'Live error — click to retry' : isOn ? 'End Live' : 'Go Live';

    return (
        <div className="relative">
            <HUDNavItem
                onClick={(e) => {
                    e.stopPropagation();
                    audioService.playClick();
                    toggleLive();
                }}
                title={title}
                badge={isOn ? 1 : undefined}
            >
                <MicrophoneIcon className={`w-4 h-4 ${status === 'error' ? 'text-error' : speaking ? 'text-primary animate-pulse' : ''}`} />
            </HUDNavItem>

            {status === 'error' && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-base-100/95 backdrop-blur-sm border border-base-300/30 rounded-lg shadow-xl p-3 z-[99999] font-sf-mono text-[10px] tracking-widest">
                    <p className="text-error normal-case tracking-normal leading-snug">{error}</p>
                </div>
            )}
        </div>
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
