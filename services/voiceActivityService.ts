/**
 * Voice Activity Detection service wrapping @ricky0123/vad-web.
 *
 * Initializes a MicVAD instance on the given AudioContext + stream and
 * forwards speech start/end events to a TurnManager for conversation
 * turn management.
 *
 * The VAD assets (ONNX model + ONNX Runtime WASM) are served from the
 * application's public directory via vite-plugin-static-copy.
 */

import { MicVAD } from '@ricky0123/vad-web';
import { TurnManager } from './turnManager';

export interface VoiceActivityOptions {
    /** AudioContext to attach the VAD worklet to. */
    audioContext: AudioContext;
    /** MediaStream (mic) to analyze. */
    stream: MediaStream;
    /** TurnManager instance to feed events into. */
    turnManager: TurnManager;
    /** Base path for VAD assets (model .onnx files). Default: '/' */
    baseAssetPath?: string;
    /** Base path for ONNX Runtime WASM files. Default: '/' */
    onnxWASMBasePath?: string;
    /** Model to use: 'legacy' (smaller, faster) or 'v5' (more accurate). Default: 'legacy' */
    model?: 'legacy' | 'v5';
}

export class VoiceActivityService {
    private vad: MicVAD | null = null;
    private turnManager: TurnManager;
    private _active = false;
    private _errored: string | null = null;

    constructor(turnManager: TurnManager) {
        this.turnManager = turnManager;
    }

    get active(): boolean {
        return this._active;
    }

    get errored(): string | null {
        return this._errored;
    }

    /** Initialize and start the VAD. */
    async start(options: VoiceActivityOptions): Promise<void> {
        if (this.vad) await this.stop();

        try {
            this.vad = await MicVAD.new({
                audioContext: options.audioContext,
                getStream: () => Promise.resolve(options.stream),
                startOnLoad: true,
                baseAssetPath: options.baseAssetPath ?? '/',
                onnxWASMBasePath: options.onnxWASMBasePath ?? '/',
                model: options.model ?? 'legacy',
                onSpeechStart: () => {
                    this.turnManager.onUserSpeechStart();
                },
                onSpeechEnd: (audio: Float32Array) => {
                    this.turnManager.onUserSpeechEnd(audio);
                },
                onVADMisfire: () => {
                    this.turnManager.onVADMisfire?.();
                },
                onFrameProcessed: () => {
                    // Could be used for level meter in the future
                },
            });
            this._active = true;
            this._errored = null;
        } catch (err) {
            this._errored = err instanceof Error ? err.message : String(err);
            this._active = false;
            throw err;
        }
    }

    /** Pause VAD processing without destroying it. */
    async pause(): Promise<void> {
        if (this.vad && this._active) {
            await this.vad.pause();
            this._active = false;
        }
    }

    /** Resume paused VAD. */
    async resume(): Promise<void> {
        if (this.vad && !this._active) {
            await this.vad.start();
            this._active = true;
        }
    }

    /** Stop and destroy the VAD. */
    async stop(): Promise<void> {
        if (this.vad) {
            try { await this.vad.destroy(); } catch { /* already destroyed */ }
            this.vad = null;
        }
        this._active = false;
    }
}
