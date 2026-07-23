/** Minimal type declarations for simple-rnnoise-wasm v1.x */

declare module 'simple-rnnoise-wasm' {
    export interface RNNoiseNodeInstance {
        connect(destination: AudioNode): AudioNode;
        disconnect(): void;
        update(active: boolean): void;
        port: {
            onmessage: ((ev: MessageEvent) => void) | null;
        };
        addEventListener: Function;
        removeEventListener: Function;
        dispatchEvent: Function;
    }

    export interface RNNoiseNodeConstructor {
        new (ctx: AudioContext): RNNoiseNodeInstance;
        register(ctx: AudioContext, assetBase?: string): Promise<void>;
        ready: boolean;
        module: WebAssembly.Module | null;
        scriptSrc: string | null;
    }

    export const RNNoiseNode: RNNoiseNodeConstructor;

    export function rnnoise_loadAssets(
        assetBase?: string
    ): Promise<[string, WebAssembly.Module]>;
}
