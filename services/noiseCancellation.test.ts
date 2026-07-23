import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock simple-rnnoise-wasm BEFORE any import of noiseCancellation.
// Since the source uses dynamic import('simple-rnnoise-wasm') inside register(),
// the mock must be installed before that dynamic import resolves.
// vi.mock is hoisted to the top of the file by Vitest.
vi.mock('simple-rnnoise-wasm', () => {
    const mockNode = {
        connect: vi.fn().mockReturnThis(),
        disconnect: vi.fn(),
        update: vi.fn(),
        port: { onmessage: null as any },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    };

    const MockRNNoiseNode = Object.assign(
        function MockRNNoiseNode() { return mockNode; },
        {
            register: vi.fn().mockResolvedValue(undefined),
            ready: false,
            module: null,
            scriptSrc: null,
        }
    );

    return {
        RNNoiseNode: MockRNNoiseNode,
        rnnoise_loadAssets: vi.fn().mockResolvedValue(['/rnnoise.worklet.js', {}]),
    };
});

describe('NoiseCancellation', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        // Reset RNNoiseNode.ready on the mock too
        const { RNNoiseNode } = await import('simple-rnnoise-wasm');
        RNNoiseNode.ready = false;
        // Reset NoiseCancellation static state
        const mod = await import('./noiseCancellation');
        (mod.NoiseCancellation as any)._registered = false;
        (mod.NoiseCancellation as any)._RNNoiseCtor = null;
    });

    it('isSupported returns false when AudioContext is not available', async () => {
        const origAC = (globalThis as any).AudioContext;
        (globalThis as any).AudioContext = undefined;

        const { NoiseCancellation } = await import('./noiseCancellation');
        expect(NoiseCancellation.isSupported).toBe(false);

        (globalThis as any).AudioContext = origAC;
    });

    it('isSupported returns false when AudioWorklet is not available', async () => {
        const origAC = (globalThis as any).AudioContext;
        (globalThis as any).AudioContext = vi.fn().mockImplementation(() => ({})) as any;

        const { NoiseCancellation } = await import('./noiseCancellation');
        expect(NoiseCancellation.isSupported).toBe(false);

        (globalThis as any).AudioContext = origAC;
    });

    it('isSupported returns true when AudioWorklet is available', async () => {
        const origAC = (globalThis as any).AudioContext;
        // Mock AudioContext with audioWorklet on the prototype
        const MockAC = vi.fn() as any;
        MockAC.prototype = { audioWorklet: { addModule: vi.fn() } };
        (globalThis as any).AudioContext = MockAC;

        const { NoiseCancellation } = await import('./noiseCancellation');
        expect(NoiseCancellation.isSupported).toBe(true);

        (globalThis as any).AudioContext = origAC;
    });

    it('register() calls RNNoiseNode.register with AudioContext', async () => {
        const { NoiseCancellation } = await import('./noiseCancellation');
        const { RNNoiseNode } = await import('simple-rnnoise-wasm');

        const mockCtx = {} as AudioContext;
        await NoiseCancellation.register(mockCtx);

        expect(RNNoiseNode.register).toHaveBeenCalledWith(mockCtx);
    });

    it('register() can be called multiple times safely', async () => {
        const { NoiseCancellation } = await import('./noiseCancellation');
        const { RNNoiseNode } = await import('simple-rnnoise-wasm');

        const mockCtx = {} as AudioContext;
        await NoiseCancellation.register(mockCtx);
        await NoiseCancellation.register(mockCtx);

        expect(RNNoiseNode.register).toHaveBeenCalledTimes(1);
    });

    it('requires register() before create()', async () => {
        const { NoiseCancellation } = await import('./noiseCancellation');
        const nc = new NoiseCancellation();

        expect(() => nc.create({} as any, {} as any)).toThrow('register');
    });

    it('create() returns an AudioNode connected to the source', async () => {
        const { NoiseCancellation } = await import('./noiseCancellation');
        const mockCtx = {} as AudioContext;
        await NoiseCancellation.register(mockCtx);

        const mockSource = { connect: vi.fn().mockReturnThis() } as any;
        const nc = new NoiseCancellation();
        const node = nc.create(mockCtx, mockSource);

        expect(node).toBeDefined();
        expect(mockSource.connect).toHaveBeenCalled();
    });

    it('vadStatus starts at 0', async () => {
        const { NoiseCancellation } = await import('./noiseCancellation');
        const nc = new NoiseCancellation();
        expect(nc.vadStatus).toBe(0);
    });

    it('enabled property toggles processing', async () => {
        const { NoiseCancellation } = await import('./noiseCancellation');
        const nc = new NoiseCancellation();

        expect(nc.enabled).toBe(true);
        nc.enabled = false;
        expect(nc.enabled).toBe(false);
        nc.enabled = true;
        expect(nc.enabled).toBe(true);
    });

    it('dispose() cleans up and stops processing', async () => {
        const { NoiseCancellation } = await import('./noiseCancellation');
        const mockCtx = {} as AudioContext;
        await NoiseCancellation.register(mockCtx);

        const mockSource = { connect: vi.fn().mockReturnThis() } as any;
        const nc = new NoiseCancellation();
        nc.create(mockCtx, mockSource);
        nc.dispose();

        expect(nc.enabled).toBe(false);
    });
});
