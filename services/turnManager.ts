/**
 * Turn management state machine for voice conversations.
 *
 * State flow:
 *   IDLE ──onUserSpeechStart──▶ LISTENING
 *   LISTENING ──onUserSpeechEnd+silenceTimeout──▶ PROCESSING
 *   PROCESSING ──onProcessingComplete──▶ IDLE
 *   PROCESSING ──onAISpeechStart──▶ RESPONDING
 *   RESPONDING ──onAISpeechEnd──▶ IDLE
 *   RESPONDING ──onUserSpeechStart──▶ LISTENING (barge-in / interruption)
 *   PROCESSING ──onUserSpeechStart──▶ LISTENING (barge-in mid-process)
 *   ANY ──reset──▶ IDLE
 *
 * Audio chunks collected during LISTENING are concatenated and emitted
 * via onUserSpeechEndCallback when the turn completes processing.
 */

export type TurnState = 'idle' | 'listening' | 'processing' | 'responding';

export interface TurnManagerCallbacks {
    /** Fired when user starts speaking (idle → listening, or barge-in). */
    onTurnStart?: () => void;
    /** Fired when user speech end is confirmed and silence timeout expires. */
    onUserSpeechEnd?: (audio: Float32Array) => void;
    /** Fired when the user interrupts AI speech (responding → listening). */
    onInterruption?: () => void;
    /** Fired on transition to idle after a complete turn. */
    onTurnEnd?: () => void;
    /** Fired when VAD misfires (speech too short to count). */
    onVADMisfire?: () => void;
}

export class TurnManager {
    private _state: TurnState = 'idle';
    private silenceTimer: ReturnType<typeof setTimeout> | null = null;
    private audioFrames: Float32Array[] = [];
    private frameCount = 0;

    // ── Public config ──────────────────────────────────────────────
    /** ms of silence after speech end before marking the turn complete. */
    silenceTimeoutMs = 800;
    /** Minimum number of audio frames to count as valid speech. */
    minSpeechFrames = 3;

    // ── Callbacks ──────────────────────────────────────────────────
    onTurnStart?: TurnManagerCallbacks['onTurnStart'];
    /** Callback when speech end is confirmed (after min speech + timeout). */
    onUserSpeechEndCallback?: (audio: Float32Array) => void;
    onInterruption?: TurnManagerCallbacks['onInterruption'];
    onTurnEnd?: TurnManagerCallbacks['onTurnEnd'];
    onVADMisfire?: TurnManagerCallbacks['onVADMisfire'];

    get state(): TurnState {
        return this._state;
    }

    // ── State transitions ──────────────────────────────────────────

    /** Called when VAD detects user started speaking. */
    onUserSpeechStart(): void {
        switch (this._state) {
            case 'idle':
                this._transitionTo('listening');
                this.onTurnStart?.();
                break;
            case 'responding':
            case 'processing':
                // Barge-in: user interrupted AI or mid-process
                this.clearSilenceTimer();
                this.audioFrames = [];
                this.frameCount = 0;
                this.onInterruption?.();
                this._transitionTo('listening');
                this.onTurnStart?.();
                break;
            case 'listening':
                // Already listening — debounce (no-op)
                break;
        }
    }

    /** Called when VAD detects user stopped speaking (with final audio chunk). */
    onUserSpeechEnd(audio: Float32Array): void {
        if (this._state !== 'listening') return;

        this.addAudioFrame(audio);

        // Start silence timeout — if no more speech arrives, commit the turn
        this.startSilenceTimeout();
    }

    /** Called for each audio frame during listening (buffered for concatenation). */
    addAudioFrame(frame: Float32Array): void {
        this.audioFrames.push(new Float32Array(frame));
        this.frameCount++;
    }

    /** Called when AI starts responding (processor has sent data to LLM). */
    onAISpeechStart(): void {
        if (this._state === 'processing') {
            this._transitionTo('responding');
        }
        // If already responding, this is a no-op (debounce)
    }

    /** Called when AI finishes responding. */
    onAISpeechEnd(): void {
        if (this._state === 'responding') {
            this._transitionTo('idle');
            this.onTurnEnd?.();
        }
        // Also clean up from processing if it never got to responding
        if (this._state === 'processing') {
            this._transitionTo('idle');
            this.onTurnEnd?.();
        }
    }

    /** Called after the silence timeout when processing is complete (non-AI reply). */
    onProcessingComplete(): void {
        if (this._state === 'processing') {
            this._transitionTo('idle');
            this.onTurnEnd?.();
        }
    }

    /** Reset to idle, clearing all state and timers. */
    reset(): void {
        this.clearSilenceTimer();
        this.audioFrames = [];
        this.frameCount = 0;
        if (this._state !== 'idle') {
            this._transitionTo('idle');
        }
    }

    // ── Internals ──────────────────────────────────────────────────

    private _transitionTo(newState: TurnState): void {
        this._state = newState;
    }

    private startSilenceTimeout(): void {
        this.clearSilenceTimer();
        this.silenceTimer = setTimeout(() => {
            this.silenceTimer = null;

            if (this._state !== 'listening') return;

            // Check minimum speech duration
            if (this.frameCount < this.minSpeechFrames) {
                this.onVADMisfire?.();
                this.audioFrames = [];
                this.frameCount = 0;
                this._transitionTo('idle');
                return;
            }

            // Concatenate buffered audio and emit
            const totalLength = this.audioFrames.reduce((sum, f) => sum + f.length, 0);
            const combined = new Float32Array(totalLength);
            let offset = 0;
            for (const frame of this.audioFrames) {
                combined.set(frame, offset);
                offset += frame.length;
            }
            this.audioFrames = [];
            this.frameCount = 0;

            this.onUserSpeechEndCallback?.(combined);

            this._transitionTo('processing');
        }, this.silenceTimeoutMs);
    }

    private clearSilenceTimer(): void {
        if (this.silenceTimer !== null) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
    }
}
