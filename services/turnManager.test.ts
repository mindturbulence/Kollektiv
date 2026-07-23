import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TurnManager } from './turnManager';

describe('TurnManager', () => {
    let mgr: TurnManager;

    beforeEach(() => {
        vi.useFakeTimers();
        mgr = new TurnManager();
    });

    // ── State transitions ──────────────────────────────────────────────

    it('starts in idle state', () => {
        expect(mgr.state).toBe('idle');
    });

    it('idle → listening on user speech start', () => {
        mgr.onUserSpeechStart();
        expect(mgr.state).toBe('listening');
    });

    it('listening → processing on user speech end + silence timeout', () => {
        mgr.onUserSpeechStart();
        mgr.addAudioFrame(new Float32Array(320));
        mgr.addAudioFrame(new Float32Array(320));
        mgr.onUserSpeechEnd(new Float32Array(1600)); // final chunk
        expect(mgr.state).toBe('listening'); // still listening until timeout

        vi.advanceTimersByTime(mgr.silenceTimeoutMs);
        expect(mgr.state).toBe('processing');
    });

    it('processing → idle after processing completes', () => {
        mgr.onUserSpeechStart();
        mgr.addAudioFrame(new Float32Array(320));
        mgr.addAudioFrame(new Float32Array(320));
        mgr.onUserSpeechEnd(new Float32Array(1600));
        vi.advanceTimersByTime(mgr.silenceTimeoutMs);
        expect(mgr.state).toBe('processing');

        mgr.onProcessingComplete();
        expect(mgr.state).toBe('idle');
    });

    it('processing → responding when AI starts replying', () => {
        mgr.onUserSpeechStart();
        mgr.addAudioFrame(new Float32Array(320));
        mgr.addAudioFrame(new Float32Array(320));
        mgr.onUserSpeechEnd(new Float32Array(1600));
        vi.advanceTimersByTime(mgr.silenceTimeoutMs);
        expect(mgr.state).toBe('processing');

        mgr.onAISpeechStart();
        expect(mgr.state).toBe('responding');
    });

    it('responding → idle when AI finishes', () => {
        mgr.onUserSpeechStart();
        mgr.addAudioFrame(new Float32Array(320));
        mgr.addAudioFrame(new Float32Array(320));
        mgr.onUserSpeechEnd(new Float32Array(1600));
        vi.advanceTimersByTime(mgr.silenceTimeoutMs);
        mgr.onAISpeechStart();
        expect(mgr.state).toBe('responding');

        mgr.onAISpeechEnd();
        expect(mgr.state).toBe('idle');
    });

    it('responding → listening (barge-in) when user speaks over AI', () => {
        mgr.onUserSpeechStart();
        mgr.addAudioFrame(new Float32Array(320));
        mgr.addAudioFrame(new Float32Array(320));
        mgr.onUserSpeechEnd(new Float32Array(1600));
        vi.advanceTimersByTime(mgr.silenceTimeoutMs);
        mgr.onAISpeechStart();
        expect(mgr.state).toBe('responding');

        // User interrupts
        mgr.onUserSpeechStart();
        expect(mgr.state).toBe('listening');
    });

    it('user speech in idle immediately transitions to listening', () => {
        mgr.onUserSpeechStart();
        expect(mgr.state).toBe('listening');
    });

    // ── Audio buffering ────────────────────────────────────────────────

    it('buffers audio frames during listening and emits on speech end', () => {
        const onUserSpeechEnd = vi.fn();
        mgr.onUserSpeechEndCallback = onUserSpeechEnd;

        mgr.onUserSpeechStart();
        mgr.addAudioFrame(new Float32Array(320));  // 20ms
        mgr.addAudioFrame(new Float32Array(320));  // 40ms
        mgr.addAudioFrame(new Float32Array(320));  // 60ms
        const finalAudio = new Float32Array(320);
        mgr.onUserSpeechEnd(finalAudio);

        vi.advanceTimersByTime(mgr.silenceTimeoutMs);

        expect(onUserSpeechEnd).toHaveBeenCalledTimes(1);
        // Should contain buffered frames + final chunk, concatenated
        const emitted = onUserSpeechEnd.mock.calls[0][0] as Float32Array;
        expect(emitted.length).toBe(320 * 4); // 3 buffered + 1 final
    });

    it('clears audio buffer on reset', () => {
        const onUserSpeechEnd = vi.fn();
        mgr.onUserSpeechEndCallback = onUserSpeechEnd;

        mgr.onUserSpeechStart();
        mgr.addAudioFrame(new Float32Array(320));
        mgr.reset();

        // After reset, trying to complete speech should not emit
        mgr.onUserSpeechEnd(new Float32Array(320));
        vi.advanceTimersByTime(mgr.silenceTimeoutMs);

        expect(onUserSpeechEnd).not.toHaveBeenCalled();
    });

    // ── Silence timeout ────────────────────────────────────────────────

    it('resets silence timeout on new speech during listening', () => {
        const onUserSpeechEnd = vi.fn();
        mgr.onUserSpeechEndCallback = onUserSpeechEnd;

        mgr.onUserSpeechStart();
        mgr.addAudioFrame(new Float32Array(320));
        mgr.addAudioFrame(new Float32Array(320));
        mgr.onUserSpeechEnd(new Float32Array(160));

        // Advance almost to timeout
        vi.advanceTimersByTime(mgr.silenceTimeoutMs - 100);

        // More speech arrives — should reset the timer
        mgr.onUserSpeechEnd(new Float32Array(160));
        vi.advanceTimersByTime(mgr.silenceTimeoutMs - 100);
        expect(mgr.state).toBe('listening'); // not yet timed out

        vi.advanceTimersByTime(200);
        expect(mgr.state).toBe('processing');
    });

    it('clears silence timeout on transition away from listening', () => {
        mgr.onUserSpeechStart();
        mgr.onUserSpeechEnd(new Float32Array(160));
        mgr.reset();

        // After reset, the timeout should be cleared
        vi.advanceTimersByTime(mgr.silenceTimeoutMs + 1000);
        expect(mgr.state).toBe('idle'); // should not have transitioned
    });

    // ── Events / callbacks ─────────────────────────────────────────────

    it('fires onTurnStart when entering listening', () => {
        const cb = vi.fn();
        mgr.onTurnStart = cb;

        mgr.onUserSpeechStart();
        expect(cb).toHaveBeenCalledTimes(1);
    });

    it('fires onInterruption on barge-in', () => {
        const cb = vi.fn();
        mgr.onInterruption = cb;

        mgr.onUserSpeechStart();
        mgr.addAudioFrame(new Float32Array(320));
        mgr.addAudioFrame(new Float32Array(320));
        mgr.onUserSpeechEnd(new Float32Array(160));
        vi.advanceTimersByTime(mgr.silenceTimeoutMs);
        mgr.onAISpeechStart();
        expect(mgr.state).toBe('responding');

        mgr.onUserSpeechStart(); // barge-in
        expect(cb).toHaveBeenCalledTimes(1);
    });

    it('fires onTurnEnd when going idle after processing', () => {
        const cb = vi.fn();
        mgr.onTurnEnd = cb;

        mgr.onUserSpeechStart();
        mgr.addAudioFrame(new Float32Array(320));
        mgr.addAudioFrame(new Float32Array(320));
        mgr.onUserSpeechEnd(new Float32Array(160));
        vi.advanceTimersByTime(mgr.silenceTimeoutMs);
        mgr.onProcessingComplete();

        expect(cb).toHaveBeenCalledTimes(1);
    });

    it('fires onTurnEnd when going idle after AI finishes', () => {
        const cb = vi.fn();
        mgr.onTurnEnd = cb;

        mgr.onUserSpeechStart();
        mgr.addAudioFrame(new Float32Array(320));
        mgr.addAudioFrame(new Float32Array(320));
        mgr.onUserSpeechEnd(new Float32Array(160));
        vi.advanceTimersByTime(mgr.silenceTimeoutMs);
        mgr.onAISpeechStart();
        mgr.onAISpeechEnd();

        expect(cb).toHaveBeenCalledTimes(1);
    });

    // ── Edge cases ─────────────────────────────────────────────────────

    it('ignores double speech start in listening state', () => {
        mgr.onUserSpeechStart();
        expect(mgr.state).toBe('listening');

        // Second speech start while already listening — debounce
        mgr.onUserSpeechStart();
        expect(mgr.state).toBe('listening'); // no error, no extra transition
    });

    it('handles speech end without prior start (no-op)', () => {
        // Should not crash
        mgr.onUserSpeechEnd(new Float32Array(160));
        vi.advanceTimersByTime(mgr.silenceTimeoutMs);
        expect(mgr.state).toBe('idle');
    });

    it('handles barge-in from processing state', () => {
        mgr.onUserSpeechStart();
        mgr.addAudioFrame(new Float32Array(320));
        mgr.addAudioFrame(new Float32Array(320));
        mgr.onUserSpeechEnd(new Float32Array(160));
        vi.advanceTimersByTime(mgr.silenceTimeoutMs);
        expect(mgr.state).toBe('processing');

        // User starts speaking while still processing — barge-in
        mgr.onUserSpeechStart();
        expect(mgr.state).toBe('listening');
    });

    it('reset from any state returns to idle and clears buffer', () => {
        mgr.onUserSpeechStart();
        mgr.addAudioFrame(new Float32Array(320));
        mgr.onUserSpeechEnd(new Float32Array(320));

        mgr.reset();
        expect(mgr.state).toBe('idle');

        // Silence timeout should not fire
        vi.advanceTimersByTime(mgr.silenceTimeoutMs + 1000);
        expect(mgr.state).toBe('idle');
    });

    it('configurable silence timeout', () => {
        mgr.silenceTimeoutMs = 2000;
        mgr.onUserSpeechStart();
        mgr.addAudioFrame(new Float32Array(320));
        mgr.addAudioFrame(new Float32Array(320));
        mgr.onUserSpeechEnd(new Float32Array(160));

        vi.advanceTimersByTime(1500);
        expect(mgr.state).toBe('listening');

        vi.advanceTimersByTime(1000);
        expect(mgr.state).toBe('processing');
    });

    it('minSpeechFrames filters out very short utterances', () => {
        mgr.minSpeechFrames = 5;
        const onUserSpeechEnd = vi.fn();
        mgr.onUserSpeechEndCallback = onUserSpeechEnd;

        mgr.onUserSpeechStart();
        // End with very few frames
        mgr.onUserSpeechEnd(new Float32Array(160));
        vi.advanceTimersByTime(mgr.silenceTimeoutMs);

        // Should NOT fire callback — too short
        expect(onUserSpeechEnd).not.toHaveBeenCalled();
        expect(mgr.state).toBe('idle');
    });

    it('fires onVADMisfire when speech is too short', () => {
        const cb = vi.fn();
        mgr.onVADMisfire = cb;
        mgr.minSpeechFrames = 5;

        mgr.onUserSpeechStart();
        mgr.onUserSpeechEnd(new Float32Array(160)); // only 1 frame
        vi.advanceTimersByTime(mgr.silenceTimeoutMs);

        expect(cb).toHaveBeenCalledTimes(1);
    });

    it('collects audio chunks during listening and concatenates on speech end', () => {
        const cb = vi.fn();
        mgr.onUserSpeechEndCallback = cb;

        mgr.onUserSpeechStart();
        // Add multiple frames
        mgr.addAudioFrame(new Float32Array([0.1, 0.2, 0.3]));
        mgr.addAudioFrame(new Float32Array([0.4, 0.5, 0.6]));
        mgr.onUserSpeechEnd(new Float32Array([0.7, 0.8, 0.9]));
        vi.advanceTimersByTime(mgr.silenceTimeoutMs);

        expect(cb).toHaveBeenCalled();
        const result = cb.mock.calls[0][0] as Float32Array;
        expect(result.length).toBe(9);
        // Float32Array precision — use approximate comparison
        for (let i = 0; i < 9; i++) {
            expect(result[i]).toBeCloseTo((i + 1) * 0.1, 5);
        }
    });
});
