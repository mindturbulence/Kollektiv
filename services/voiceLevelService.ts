/**
 * Voice Level Service
 *
 * Makes the assistant's avatar audio-reactive. The live-voice services hand
 * their playback node to `tap()`; this service side-taps it with an
 * unconnected AnalyserNode (observes without affecting playback — an
 * unconnected AnalyserNode still analyses its input, same pattern as hark.js)
 * and exposes a smoothed RMS level (0..1).
 *
 *  - liveAssistantService taps its per-context output bus (GainNode).
 *  - openaiRealtimeService taps a MediaStreamSource of the remote stream,
 *    which itself plays through an <audio> element.
 *
 * Push model: services call `tap()` when playback starts and `untap()` on
 * teardown; consumers poll `getLevel()` each animation frame rather than
 * subscribing, so there is no re-render per audio chunk.
 *
 * Degradation: ElevenLabs manages its own audio I/O internally and never taps
 * in — consumers see level 0 and fall back to mode-driven animation.
 */

class VoiceLevelService {
    private analyser: AnalyserNode | null = null;
    private timeData: Float32Array<ArrayBuffer> | null = null;
    /** Exponential moving average of RMS — smooths per-chunk jitter. */
    private smoothed = 0;

    /** Side-tap `sourceNode` with an analyser. Safe to call repeatedly — the
     *  previous tap is replaced, never chained. */
    tap(sourceNode: AudioNode): void {
        try {
            this.disconnect();
            const analyser = sourceNode.context.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.7;
            sourceNode.connect(analyser);
            this.analyser = analyser;
            this.timeData = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
        } catch (e) {
            // Metering is cosmetic — never break playback over it.
            console.warn('[VoiceLevel] tap failed:', (e as Error)?.message);
        }
    }

    /** Remove the analyser (session teardown) and reset the meter. */
    untap(): void {
        this.disconnect();
        this.timeData = null;
        this.smoothed = 0;
    }

    private disconnect(): void {
        if (!this.analyser) return;
        try { this.analyser.disconnect(); } catch { /* context closing */ }
        this.analyser = null;
    }

    /** Compute the current smoothed level. Cheap (256-sample RMS) — designed to
     *  be called once per animation frame by the avatar. */
    getLevel(): number {
        const analyser = this.analyser;
        if (!analyser || !this.timeData) return 0;

        analyser.getFloatTimeDomainData(this.timeData);
        let sum = 0;
        for (let i = 0; i < this.timeData.length; i++) sum += this.timeData[i] * this.timeData[i];
        const rms = Math.sqrt(sum / this.timeData.length);

        // Speech RMS rarely exceeds ~0.35 in practice — normalise upward and
        // clamp so the avatar's rings use most of their range.
        const normalized = Math.min(1, rms * 3);

        // Fast attack, slow release: rings pop on speech, decay gracefully.
        this.smoothed = normalized > this.smoothed
            ? this.smoothed + (normalized - this.smoothed) * 0.55
            : this.smoothed + (normalized - this.smoothed) * 0.12;

        return this.smoothed;
    }
}

export const voiceLevelService = new VoiceLevelService();
