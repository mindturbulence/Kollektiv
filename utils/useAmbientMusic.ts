import { useState, useCallback, useEffect, useMemo } from 'react';
import { audioService } from '../services/audioService';
import type { LLMSettings } from '../types';

export type PlayerState = 'idle' | 'syncing' | 'playing' | 'error';

const extractVideoId = (url: string): string | null => {
    if (!url) return null;
    const regExp = /^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/|shorts\/)|(?:(?:watch)?\?v(?:i)?=|\&v(?:i)?=))([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[1].length === 11) ? match[1] : null;
};

/**
 * Ambient music "uplink" (hidden YouTube iframe) + global SFX enable state.
 * Extracted verbatim from App.tsx — behavior must not change.
 */
export function useAmbientMusic(settings: LLMSettings, updateSettings: (s: LLMSettings) => void) {
    const [isUplinkActive, setIsUplinkActive] = useState(false);
    const [playerState, setPlayerState] = useState<PlayerState>('idle');
    const [audioEnabled, setAudioEnabled] = useState(true);

    useEffect(() => {
        if (audioEnabled) {
            audioService.enable();
        } else {
            audioService.disable();
        }
    }, [audioEnabled]);

    const videoId = useMemo(() => extractVideoId(settings.musicYoutubeUrl), [settings.musicYoutubeUrl]);

    useEffect(() => {
        if (isUplinkActive && playerState === 'syncing' && videoId) {
            const timer = setTimeout(() => {
                setPlayerState('playing');
                if (audioEnabled && settings.musicEnabled) {
                    audioService.startAmbient(0.3);
                }
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [videoId, isUplinkActive, playerState, audioEnabled, settings.musicEnabled]);

    /** Boot-loader CONTINUE / CONTINUE WITHOUT MUSIC handler body. */
    const startupContinue = useCallback((withMusic: boolean) => {
        audioService.enable();
        setAudioEnabled(true);

        if (!withMusic) {
            updateSettings({ ...settings, musicEnabled: false });
            setIsUplinkActive(false);
            setPlayerState('idle');
        } else {
            updateSettings({ ...settings, musicEnabled: true });
            audioService.playAppStart();
            setIsUplinkActive(true);
            setPlayerState('syncing');
        }

        audioService.playTransition();
    }, [settings, updateSettings]);

    const handleMusicToggle = useCallback(() => {
        if (!videoId) {
            setPlayerState('error');
            return;
        }

        audioService.playClick();

        if (isUplinkActive) {
            setIsUplinkActive(false);
            setPlayerState('idle');
            audioService.stopAmbient();
            updateSettings({ ...settings, musicEnabled: false });
        } else {
            setPlayerState('syncing');
            setIsUplinkActive(true);
            updateSettings({ ...settings, musicEnabled: true });
            setTimeout(() => {
                setPlayerState('playing');
                if (audioEnabled && settings.musicEnabled) {
                    audioService.startAmbient(0.3);
                }
            }, 2500);
        }
    }, [videoId, isUplinkActive, audioEnabled, settings, updateSettings]);

    const handleAudioToggle = useCallback(() => {
        audioService.playClick();
        const newState = audioService.toggle();
        setAudioEnabled(newState);
        updateSettings({ ...settings, musicEnabled: newState });
    }, [settings, updateSettings]);

    return { isUplinkActive, playerState, audioEnabled, videoId, startupContinue, handleMusicToggle, handleAudioToggle };
}
