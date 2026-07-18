import { useState, useRef, useCallback, useEffect } from 'react';
import { audioService } from '../services/audioService';

/**
 * Idle/standby detection for the app shell. Arms a timeout from settings;
 * any user activity resets it (and performs the one-time WebAudio unlock).
 * Extracted verbatim from App.tsx — behavior must not change.
 */
export function useIdleSystem(isIdleEnabled: boolean, idleTimeoutMinutes: number) {
    const [isIdle, setIsIdle] = useState(false);
    const idleTimerRef = useRef<number | null>(null);
    const isIdleRef = useRef(false);

    const resetIdleTimer = useCallback((forceWake: boolean = true) => {
        if (forceWake && isIdleRef.current) {
            setIsIdle(false);
            isIdleRef.current = false;
        }

        if (idleTimerRef.current) {
            window.clearTimeout(idleTimerRef.current);
        }

        if (!isIdleEnabled) return;

        idleTimerRef.current = window.setTimeout(() => {
            setIsIdle(true);
            isIdleRef.current = true;
        }, idleTimeoutMinutes * 60000);
    }, [isIdleEnabled, idleTimeoutMinutes]);

    useEffect(() => {
        if (!isIdleEnabled && isIdleRef.current) {
            setIsIdle(false);
            isIdleRef.current = false;
        }
        resetIdleTimer(false);
    }, [isIdleEnabled, resetIdleTimer]);

    useEffect(() => {
        const handleUserActivity = () => {
            resetIdleTimer(true);
            audioService.resume();
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                resetIdleTimer(isIdleRef.current);
            }
        };

        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

        events.forEach(name => window.addEventListener(name, handleUserActivity, { passive: true }));
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleUserActivity);

        resetIdleTimer(false);

        return () => {
            events.forEach(name => window.removeEventListener(name, handleUserActivity));
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleUserActivity);
            if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
        };
    }, [resetIdleTimer]);

    /** Force standby now (Header standby button). */
    const goIdle = useCallback(() => {
        setIsIdle(true);
        isIdleRef.current = true;
    }, []);

    return { isIdle, resetIdleTimer, goIdle };
}
