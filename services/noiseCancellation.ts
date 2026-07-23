/**
 * Client-side noise cancellation using RNNoise WASM in an AudioWorklet.
 *
 * The RNNoise module is loaded lazily via dynamic import so that tests can
 * mock it easily — RNNoise is browser-only (WASM + AudioWorklet) and has no
 * Node.js entry point, so static imports fail in test runners.
 *
 * Usage:
 *   if (!NoiseCancellation.isSupported) { /* fallback to raw mic *\/ }
 *   await NoiseCancellation.register(audioContext);
 *   const nc = new NoiseCancellation();
 *   const cleanNode = nc.create(audioContext, mediaStreamSource);
 *   // connect cleanNode → next destination
 *
 * Graceful degradation: if WASM or AudioWorklet is unavailable,
 * isSupported returns false. create() checks register() was called.
 */

export class NoiseCancellation {
    private _enabled = true;
    private node: import('simple-rnnoise-wasm').RNNoiseNodeInstance | null = null;
    private _vadStatus = 0;
    private static _registered = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private static _RNNoiseCtor: new (ctx: AudioContext) => any = null as any;

    /** Whether RNNoise + AudioWorklet are supported in this browser. */
    static get isSupported(): boolean {
        if (typeof AudioContext === 'undefined' && typeof (globalThis as any).webkitAudioContext === 'undefined') {
            return false;
        }
        try {
            const AC: typeof AudioContext =
                (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
            const proto = AC.prototype as any;
            return typeof proto.audioWorklet !== 'undefined' && proto.audioWorklet !== null;
        } catch {
            return false;
        }
    }

    /**
     * Register the RNNoise AudioWorklet with an AudioContext.
     * Must be called once before creating instances. Safe to call multiple times.
     */
    static async register(ctx: AudioContext): Promise<void> {
        if (NoiseCancellation._registered) return;
        const { RNNoiseNode } = await import('simple-rnnoise-wasm');
        await RNNoiseNode.register(ctx);
        RNNoiseNode.ready = true;
        NoiseCancellation._RNNoiseCtor = RNNoiseNode;
        NoiseCancellation._registered = true;
    }

    /**
     * Create a new noise cancellation node and insert it into the audio graph.
     * @throws If register() has not been called yet.
     */
    create(ctx: AudioContext, source: AudioNode): import('simple-rnnoise-wasm').RNNoiseNodeInstance {
        if (!NoiseCancellation._RNNoiseCtor) {
            throw new Error(
                'NoiseCancellation.register(ctx) must be called before create().'
            );
        }
        const Ctor = NoiseCancellation._RNNoiseCtor;
        const node = new Ctor(ctx);
        node.port.onmessage = ({ data }: MessageEvent) => {
            if (typeof data?.vadProb === 'number') {
                this._vadStatus = data.vadProb;
            }
        };
        source.connect(node as unknown as AudioNode);
        node.update(true);
        this.node = node;
        return node;
    }

    /** Most recent VAD probability (0-1) from the RNNoise frame processor. */
    get vadStatus(): number {
        return this._vadStatus;
    }

    /** Enable or disable noise cancellation processing. */
    get enabled(): boolean {
        return this._enabled;
    }

    set enabled(v: boolean) {
        this._enabled = v;
        if (this.node) {
            this.node.update(v);
        }
    }

    /** Disconnect and clean up. */
    dispose(): void {
        if (this.node) {
            this.node.update(false);
            this.node.disconnect();
            this.node = null;
        }
        this._enabled = false;
    }
}
