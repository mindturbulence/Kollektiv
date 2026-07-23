/**
 * OpenAI Realtime API voice backend.
 *
 * Connects to the OpenAI Realtime API via direct WebRTC using ephemeral
 * tokens. Mirrors the LiveAssistant interface so the context provider
 * can use either backend interchangeably.
 *
 * Flow:
 *   server.ts → /api/openai/token (mints ephemeral token)
 *   RTCPeerConnection → api.openai.com/v1/realtime/calls
 *   audio tracks via WebRTC (mic in, AI audio out)
 *   function calls via DataChannel "oai-events"
 */

import type { LLMSettings } from '../types';
import { executeAssistantTool, AssistantTool } from './assistantTools';
import { loadMcpAssistantTools } from './mcpAssistantTools';
import { browserControlService } from './browserControlService';
import { externalBrowserService } from './externalBrowserService';

export interface OpenAILiveHandlers {
    onStatus: (s: 'connecting' | 'live' | 'closed' | 'error', detail?: string) => void;
    onCaption: (who: 'user' | 'assistant', text: string) => void;
    onToolActivity: (info: { flavour: string; toolName: string }) => void;
    onSpeaking: (speaking: boolean) => void;
    onScreenShare: (active: boolean) => void;
    onCamera?: (active: boolean) => void;
    onControlDenied: (sharingActive: boolean) => void;
    onShareWarning: (message: string) => void;
    onTurnState?: (state: 'idle' | 'listening' | 'processing' | 'responding') => void;
}

const OPENAI_REALTIME_MODEL = 'gpt-realtime-2.1';
const STUN_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export class OpenAIRealtimeAssistant {
    private pc: RTCPeerConnection | null = null;
    private dc: RTCDataChannel | null = null;
    private micStream: MediaStream | null = null;
    private audioEl: HTMLAudioElement | null = null;
    private outCtx: AudioContext | null = null;
    private screenStream: MediaStream | null = null;
    private screenTimer: ReturnType<typeof setInterval> | null = null;
    private screenVideoEl: HTMLVideoElement | null = null;
    private cameraStream: MediaStream | null = null;
    private cameraTimer: ReturnType<typeof setInterval> | null = null;
    private cameraVideoEl: HTMLVideoElement | null = null;
    /** A captured MediaStream from the camera, exposed to the UI for PIP preview. */
    public activeCameraStream: MediaStream | null = null;
    private handlers!: OpenAILiveHandlers;
    private settings!: LLMSettings;
    private mcpTools: AssistantTool[] = [];
    private ephemeralKey: string | null = null;

    async connect(settings: LLMSettings, handlers: OpenAILiveHandlers): Promise<void> {
        this.settings = settings;
        this.handlers = handlers;
        handlers.onStatus('connecting');

        // Load MCP tools
        this.mcpTools = await loadMcpAssistantTools(settings);

        // 1. Get ephemeral token from our server
        const tokenRes = await fetch('/api/openai/token');
        if (!tokenRes.ok) {
            const err = await tokenRes.json().catch(() => ({ error: tokenRes.statusText }));
            throw new Error(err.error || `Token endpoint returned ${tokenRes.status}`);
        }
        const tokenData = await tokenRes.json();
        this.ephemeralKey = tokenData.client_secret?.value || tokenData.value;
        if (!this.ephemeralKey) {
            throw new Error('No ephemeral key in token response');
        }

        // 2. Create RTCPeerConnection
        this.pc = new RTCPeerConnection(STUN_SERVERS);

        // 3. Remote audio — play model's audio
        this.audioEl = document.createElement('audio');
        this.audioEl.autoplay = true;
        this.pc.ontrack = (e: RTCTrackEvent) => {
            console.debug('[OpenAIRealtime] remote track received');
            if (this.audioEl) {
                this.audioEl.srcObject = e.streams[0];
            }
            this.handlers.onSpeaking(true);
            this.handlers.onTurnState?.('responding');
        };

        // 4. Get mic audio and add to peer connection
        this.micStream = await navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        });
        for (const track of this.micStream.getAudioTracks()) {
            this.pc.addTrack(track, this.micStream);
        }

        // 5. Data channel for function calling
        this.dc = this.pc.createDataChannel('oai-events');
        this.dc.addEventListener('message', (e: MessageEvent) => {
            void this.handleDataChannelMessage(e.data);
        });
        this.dc.addEventListener('open', () => {
            console.debug('[OpenAIRealtime] data channel open');
        });

        // 6. Create SDP offer and send to OpenAI
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);

        const sdpResponse = await fetch(
            `https://api.openai.com/v1/realtime/calls?model=${OPENAI_REALTIME_MODEL}`,
            {
                method: 'POST',
                body: offer.sdp,
                headers: {
                    Authorization: `Bearer ${this.ephemeralKey}`,
                    'Content-Type': 'application/sdp',
                },
            }
        );

        if (!sdpResponse.ok) {
            const errText = await sdpResponse.text().catch(() => '');
            throw new Error(`OpenAI connection failed: ${sdpResponse.status} ${errText}`);
        }

        const answerSdp = await sdpResponse.text();
        await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

        handlers.onStatus('live');
        console.debug('[OpenAIRealtime] connected');
    }

    private async handleDataChannelMessage(data: string): Promise<void> {
        let event: any;
        try {
            event = JSON.parse(data);
        } catch {
            return;
        }

        switch (event.type) {
            case 'input_audio_transcription.delta':
                this.handlers.onCaption('user', event.delta);
                break;
            case 'conversation.item.created':
                // Track AI response start
                if (event.item?.role === 'assistant' && event.item?.type === 'message') {
                    this.handlers.onTurnState?.('responding');
                }
                break;
            case 'response.audio.delta':
                // Audio is handled via RTCPeerConnection track — this is a text delta
                break;
            case 'response.done':
                this.handlers.onSpeaking(false);
                this.handlers.onTurnState?.('idle');
                break;
            case 'response.function_call_arguments.done':
                await this.handleToolCall(event);
                break;
            case 'error':
                console.error('[OpenAIRealtime] API error', event.error);
                break;
        }
    }

    private async handleToolCall(event: any): Promise<void> {
        const name = event.name;
        let args: any = {};
        try {
            args = JSON.parse(event.arguments || '{}');
        } catch { /* use empty args */ }

        console.debug('[OpenAIRealtime] tool call', name, args);
        this.handlers.onToolActivity({ flavour: name, toolName: name });

        // Check permission for browser tools
        if (name.startsWith('browser_') && !browserControlService.permissionGranted) {
            this.handlers.onControlDenied(!!this.screenStream);
            this.sendDataChannelEvent({
                type: 'conversation.item.create',
                item: {
                    type: 'function_call_output',
                    call_id: event.call_id,
                    output: 'Permission denied — user has not granted browser control permission.',
                },
            });
            return;
        }

        const result = await executeAssistantTool(
            name,
            args,
            { settings: this.settings },
            this.mcpTools
        );
        console.debug('[OpenAIRealtime] tool result', name, result.slice(0, 200));

        this.sendDataChannelEvent({
            type: 'conversation.item.create',
            item: {
                type: 'function_call_output',
                call_id: event.call_id,
                output: result,
            },
        });

        // Trigger the model to continue after function response
        this.sendDataChannelEvent({ type: 'response.create' });
    }

    private sendDataChannelEvent(event: any): void {
        if (this.dc?.readyState === 'open') {
            this.dc.send(JSON.stringify(event));
        }
    }

    disconnect(): void {
        this.ephemeralKey = null;
        this.stopScreenShare();
        this.stopCamera();
        if (this.audioEl) {
            this.audioEl.srcObject = null;
            this.audioEl = null;
        }
        if (this.dc) {
            try { this.dc.close(); } catch { /* already closed */ }
            this.dc = null;
        }
        if (this.pc) {
            try { this.pc.close(); } catch { /* already closed */ }
            this.pc = null;
        }
        this.micStream?.getTracks().forEach(t => t.stop());
        this.micStream = null;
        void this.outCtx?.close();
        this.outCtx = null;
    }

    setMicEnabled(enabled: boolean): boolean {
        if (!this.micStream) return false;
        for (const track of this.micStream.getAudioTracks()) {
            track.enabled = enabled;
        }
        return true;
    }

    // ── Screen share ──────────────────────────────────────────────────

    async startScreenShare(): Promise<void> {
        this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const track = this.screenStream.getVideoTracks()[0];
        track.addEventListener('ended', () => this.stopScreenShare());

        const displaySurface = (track.getSettings() as any)?.displaySurface;
        if (displaySurface && displaySurface !== 'browser') {
            this.handlers.onShareWarning(
                'You shared a window/screen instead of this browser tab. To let the assistant click or type on external windows, you must connect the CDP bridge in Settings.'
            );
        }

        this.screenVideoEl = document.createElement('video');
        this.screenVideoEl.srcObject = this.screenStream;
        this.screenVideoEl.muted = true;
        void this.screenVideoEl.play();
        this.screenTimer = this.startVideoFrameLoop({
            videoEl: this.screenVideoEl,
            maxDim: 1024,
            send: (b64, w, h) => {
                browserControlService.setCaptureSize(w, h);
                externalBrowserService.setCaptureSize(w, h);
                this.sendDataChannelEvent({
                    type: 'input_image_frame',
                    data: b64,
                    mimeType: 'image/jpeg',
                });
            },
        });
        this.handlers.onScreenShare(true);
    }

    stopScreenShare(): void {
        if (this.screenTimer) { clearInterval(this.screenTimer); this.screenTimer = null; }
        this.screenStream?.getTracks().forEach(t => t.stop());
        this.screenStream = null;
        if (this.screenVideoEl) { this.screenVideoEl.srcObject = null; this.screenVideoEl = null; }
        browserControlService.setCaptureSize(0, 0);
        externalBrowserService.setCaptureSize(0, 0);
        this.handlers?.onScreenShare(false);
    }

    // ── Camera (face) ─────────────────────────────────────────────────

    /**
     * Camera stream for the user's face. Mirrors screen-share but skips
     * browserControlService — there's no clicking on the user. Both feeds
     * can run simultaneously; the LLM receives both video tracks.
     */
    async startCamera(): Promise<MediaStream> {
        if (this.cameraStream) return this.cameraStream;
        this.cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
            audio: false,
        });
        const track = this.cameraStream.getVideoTracks()[0];
        track.addEventListener('ended', () => this.stopCamera());

        this.cameraVideoEl = document.createElement('video');
        this.cameraVideoEl.srcObject = this.cameraStream;
        this.cameraVideoEl.muted = true;
        await this.cameraVideoEl.play();
        this.cameraTimer = this.startVideoFrameLoop({
            videoEl: this.cameraVideoEl,
            maxDim: 720,
            send: (b64) => {
                this.sendDataChannelEvent({
                    type: 'input_image_frame',
                    data: b64,
                    mimeType: 'image/jpeg',
                });
            },
        });
        this.activeCameraStream = this.cameraStream;
        this.handlers?.onCamera?.(true);
        return this.cameraStream;
    }

    stopCamera(): void {
        if (this.cameraTimer) { clearInterval(this.cameraTimer); this.cameraTimer = null; }
        this.cameraStream?.getTracks().forEach(t => t.stop());
        this.cameraStream = null;
        if (this.cameraVideoEl) { this.cameraVideoEl.srcObject = null; this.cameraVideoEl = null; }
        this.activeCameraStream = null;
        this.handlers?.onCamera?.(false);
    }

    /** Draws `videoEl` to an off-screen canvas at `maxDim` and calls `send`
     *  with a JPEG base64 string at 1fps. Shared by screen share and camera. */
    private startVideoFrameLoop(opts: {
        videoEl: HTMLVideoElement;
        maxDim: number;
        send: (b64: string, w: number, h: number) => void;
    }): ReturnType<typeof setInterval> {
        const canvas = document.createElement('canvas');
        return setInterval(() => {
            const { videoEl } = opts;
            if (!videoEl || videoEl.videoWidth === 0) return;
            const scale = Math.min(1, opts.maxDim / Math.max(videoEl.videoWidth, videoEl.videoHeight));
            canvas.width = Math.round(videoEl.videoWidth * scale);
            canvas.height = Math.round(videoEl.videoHeight * scale);
            canvas.getContext('2d')!.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            const b64 = canvas.toDataURL('image/jpeg', 0.7).split('base64,')[1];
            opts.send(b64, canvas.width, canvas.height);
        }, 1000);
    }
}
