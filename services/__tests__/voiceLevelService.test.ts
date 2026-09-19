import { describe, it, expect, beforeEach, vi } from 'vitest';
import { voiceLevelService } from '../voiceLevelService';

/**
 * Minimal AnalyserNode double — jsdom has no Web Audio, so we exercise the
 * service's smoothing/normalization logic against a fake that returns a
 * deterministic waveform.
 */
function makeFakeAnalyser(samples: number[]) {
    // Holder keeps the waveform mutable so tests can change what the analyser
    // reports AFTER tap() has captured it (the service caches the analyser).
    const holder = { samples };
    const analyser = {
        context: {} as unknown as AudioContext,
        fftSize: samples.length,
        smoothingTimeConstant: 0.7,
        connect: vi.fn(),
        disconnect: vi.fn(),
        getFloatTimeDomainData: (out: Float32Array) => {
            for (let i = 0; i < out.length; i++) out[i] = holder.samples[i % holder.samples.length];
        },
    };
    return Object.assign(analyser, {
        setSamples: (s: number[]) => { holder.samples = s; },
    }) as unknown as AnalyserNode & { setSamples: (s: number[]) => void };
}

/** Fake source node — tap() calls sourceNode.connect(analyser). */
const makeFakeSource = (fakeCtx: AudioContext): AudioNode =>
    ({ context: fakeCtx, connect: vi.fn() }) as unknown as AudioNode;

describe('voiceLevelService', () => {
    beforeEach(() => {
        voiceLevelService.untap();
    });

    it('returns 0 when nothing is tapped', () => {
        expect(voiceLevelService.getLevel()).toBe(0);
    });

    it('re-tapping replaces the previous analyser instead of chaining', () => {
        const first = makeFakeAnalyser([0.5, -0.5]);
        const second = makeFakeAnalyser([0.5, -0.5]);
        const firstDisconnect = vi.spyOn(first, 'disconnect');
        const secondDisconnect = vi.spyOn(second, 'disconnect');
        voiceLevelService.tap(makeFakeSource({ createAnalyser: () => first } as unknown as AudioContext));
        voiceLevelService.tap(makeFakeSource({ createAnalyser: () => second } as unknown as AudioContext));
        expect(firstDisconnect).toHaveBeenCalled();
        expect(secondDisconnect).not.toHaveBeenCalled();
    });

    it('smooths RMS with fast attack, slow release', () => {
        // Silence first.
        expect(voiceLevelService.getLevel()).toBe(0);

        // Simulate a tapped analyser via the private path: tap a node whose
        // context "creates" our fake analyser.
        const fakeAnalyser = makeFakeAnalyser([0.3, -0.3, 0.3, -0.3]);
        const fakeCtx = {
            createAnalyser: () => fakeAnalyser,
        } as unknown as AudioContext;
        const source = makeFakeSource(fakeCtx);

        voiceLevelService.tap(source);

        // RMS of ±0.3 square wave = 0.3 → normalized = min(1, 0.9) = 0.9.
        // First read: fast attack → smoothed ≈ 0.9 * 0.55 ≈ 0.495.
        const l1 = voiceLevelService.getLevel();
        expect(l1).toBeGreaterThan(0.4);
        expect(l1).toBeLessThanOrEqual(0.9);

        // Subsequent reads climb toward 0.9 (attack).
        const l2 = voiceLevelService.getLevel();
        expect(l2).toBeGreaterThan(l1);

        // Sustained speech plateaus below the raw max (clamped normalise).
        for (let i = 0; i < 20; i++) voiceLevelService.getLevel();
        expect(voiceLevelService.getLevel()).toBeCloseTo(0.9, 1);
    });

    it('decays toward zero on silence (slow release)', () => {
        const fakeAnalyser = makeFakeAnalyser([0.5, -0.5, 0.5, -0.5]);
        const fakeCtx = {
            createAnalyser: () => fakeAnalyser,
        } as unknown as AudioContext;
        const source = makeFakeSource(fakeCtx);

        voiceLevelService.tap(source);
        for (let i = 0; i < 30; i++) voiceLevelService.getLevel();
        const loudLevel = voiceLevelService.getLevel();
        expect(loudLevel).toBeGreaterThan(0.8);

        // Switch the same analyser to silence — the service keeps reading it.
        fakeAnalyser.setSamples(new Array(256).fill(0));
        const afterSilence = voiceLevelService.getLevel();
        expect(afterSilence).toBeLessThan(loudLevel);

        // Release converges toward zero over repeated reads.
        for (let i = 0; i < 60; i++) voiceLevelService.getLevel();
        expect(voiceLevelService.getLevel()).toBeLessThan(0.1);
    });

    it('untap resets the level', () => {
        const fakeAnalyser = makeFakeAnalyser([0.4, -0.4]);
        const fakeCtx = { createAnalyser: () => fakeAnalyser } as unknown as AudioContext;
        voiceLevelService.tap(makeFakeSource(fakeCtx));
        voiceLevelService.getLevel();
        voiceLevelService.untap();

        expect(voiceLevelService.getLevel()).toBe(0);
    });
});
