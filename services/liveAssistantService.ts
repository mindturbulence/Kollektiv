import { Modality } from '@google/genai';
import type { LLMSettings } from '../types';
import { getGeminiClient } from './geminiService';
import { executeAssistantTool, geminiToolDeclarations, ASSISTANT_TOOLS, AssistantTool } from './assistantTools';
import { buildSystemIdentity } from './assistantService';
import { loadMcpAssistantTools } from './mcpAssistantTools';
import { browserControlService } from './browserControlService';
import { externalBrowserService } from './externalBrowserService';

// Single source of truth for the live model constant.
// Verified against https://ai.google.dev/gemini-api/docs/live-api/capabilities (2026-07-10) —
// gemini-live-2.5-flash-preview was retired; this is the current model. If connection fails
// with "model ... is not found ... bidiGenerateContent", check that page again first.
const LIVE_MODEL = 'gemini-3.1-flash-live-preview';
const MIC_RATE = 16000;      // Live API input requirement
const SPEAKER_RATE = 24000;  // Live API output rate

export interface LiveHandlers {
    onStatus: (s: 'connecting' | 'live' | 'closed' | 'error', detail?: string) => void;
    onCaption: (who: 'user' | 'assistant', text: string) => void;
    onToolActivity: (line: string) => void;
    onSpeaking: (speaking: boolean) => void;
    onScreenShare: (active: boolean) => void;
    /** Fired when the model attempts a browser_* tool without control permission
     *  granted. `sharingActive` distinguishes "share your screen first" (the
     *  control-permission button doesn't even exist yet) from "you're sharing
     *  but haven't granted control" — telling a non-sharing user to "click the
     *  cursor icon" sends them looking for a button that isn't there. */
    onControlDenied: (sharingActive: boolean) => void;
    /** Fired when the shared source isn't this browser tab — click/scroll
     *  coordinates can't line up with what the model sees in that case. */
    onShareWarning: (message: string) => void;
}

// Mic worklet: captures mono float32, downsamples to 16 kHz if the context refuses that rate.
const WORKLET_SRC = `
class PcmCapture extends AudioWorkletProcessor {
    process(inputs) {
        const ch = inputs[0] && inputs[0][0];
        if (ch && ch.length) this.port.postMessage(ch.slice(0));
        return true;
    }
}
registerProcessor('pcm-capture', PcmCapture);
`;

const floatTo16 = (f32: Float32Array): Int16Array => {
    const out = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
        const s = Math.max(-1, Math.min(1, f32[i]));
        out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
};

/** Linear resampler — browsers may ignore a requested AudioContext sampleRate. */
const resampleTo = (data: Float32Array, from: number, to: number): Float32Array => {
    if (from === to) return data;
    const ratio = from / to;
    const out = new Float32Array(Math.floor(data.length / ratio));
    for (let i = 0; i < out.length; i++) {
        const pos = i * ratio;
        const i0 = Math.floor(pos);
        const i1 = Math.min(i0 + 1, data.length - 1);
        out[i] = data[i0] + (data[i1] - data[i0]) * (pos - i0);
    }
    return out;
};

const toBase64 = (bytes: Uint8Array): string => {
    let bin = '';
    const CHUNK = 0x8000; // avoid call-stack overflow on large buffers
    for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
};

const fromBase64 = (b64: string): Uint8Array => {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
};

/**
 * Phrase translations for flavored tool-activity text.
 * Keys are a short phrase id, values are { language → translated string }.
 * English is the fallback and must be present for every phrase.
 */
const toolPhrases: Record<string, Record<string, string>> = {
    search: {
        English: `Sniffing out answers on the web…`,
        Japanese: `ウェブで答えを探している…`,
        French: `Je cherche des réponses sur le web…`,
        Spanish: `Buscando respuestas en la web…`,
        German: `Durchsuche das Netz nach Antworten…`,
        Tagalog: `Naghahanap ng sagot sa web…`,
        Korean: `웹에서 답을 찾는 중…`,
        Chinese: `在网上寻找答案…`,
        'Chinese (Simplified)': `在网上寻找答案…`,
        'Chinese (Traditional)': `在網路上尋找答案…`,
        Italian: `Cercando risposte sul web…`,
        Portuguese: `Buscando respostas na web…`,
        Russian: `Ищу ответы в интернете…`,
        Arabic: `أبحث عن إجابات على الويب…`,
        Hindi: `वेब पर जवाब ढूंढ रहा हूँ…`,
    },
    fetch: {
        English: `Peeking inside a page to see what's there…`,
        Japanese: `ページの中を覗いている…`,
        French: `Jette un coup d'œil à l'intérieur de la page…`,
        Spanish: `Echando un vistazo a la página…`,
        German: `Schau mal in die Seite hinein…`,
        Tagalog: `Sinusilip ang loob ng pahina…`,
        Korean: `페이지 내용을 살펴보는 중…`,
        Chinese: `查看页面内容…`,
        Italian: `Dando un'occhiata dentro la pagina…`,
        Portuguese: `Dando uma espiada na página…`,
    },
    navigate: {
        English: `Steering the browser somewhere new…`,
        Japanese: `ブラウザを新しい場所へ誘導中…`,
        French: `Direction un nouvel endroit dans le navigateur…`,
        Spanish: `Llevando el navegador a un nuevo lugar…`,
        German: `Navigiere zu einem neuen Ziel…`,
        Tagalog: `Pinapunta ang browser sa bagong lugar…`,
        Korean: `브라우저를 새 곳으로 이동 중…`,
        Chinese: `将浏览器导航到新位置…`,
        Italian: `Portando il browser verso un nuovo posto…`,
        Portuguese: `Navegando para um novo lugar…`,
    },
    click: {
        English: `Gentle nudge on the screen…`,
        Japanese: `画面を優しくタップ…`,
        French: `Petit coup doux sur l'écran…`,
        Spanish: `Toque suave en la pantalla…`,
        German: `Sanfter Tipp auf den Bildschirm…`,
        Tagalog: `Mahinang tapik sa screen…`,
        Korean: `화면을 살짝 누르는 중…`,
        Chinese: `轻点屏幕…`,
        Italian: `Tocco leggero sullo schermo…`,
        Portuguese: `Toque suave na tela…`,
    },
    type: {
        English: `Tapping out a message…`,
        Japanese: `メッセージを打ち込んでいる…`,
        French: `Je tape un message…`,
        Spanish: `Escribiendo un mensaje…`,
        German: `Tippe eine Nachricht…`,
        Tagalog: `Nagta-type ng mensahe…`,
        Korean: `메시지를 입력하는 중…`,
        Chinese: `正在输入消息…`,
        Italian: `Scrivendo un messaggio…`,
        Portuguese: `Digitando uma mensagem…`,
    },
    read: {
        English: `Taking a look around the page…`,
        Japanese: `ページを見渡している…`,
        French: `Jette un œil autour de la page…`,
        Spanish: `Echando un vistazo a la página…`,
        German: `Schau dich auf der Seite um…`,
        Tagalog: `Tumingin-tingin sa paligid ng pahina…`,
        Korean: `페이지를 둘러보는 중…`,
        Chinese: `浏览页面…`,
        Italian: `Dando un'occhiata in giro per la pagina…`,
        Portuguese: `Dando uma olhada na página…`,
    },
    evaluate: {
        English: `Running a little snippet…`,
        Japanese: `小さなコードを実行中…`,
        French: `Exécute un petit bout de code…`,
        Spanish: `Ejecutando un pequeño fragmento…`,
        German: `Führe ein kleines Skript aus…`,
        Tagalog: `Nagpapatakbo ng munting snippet…`,
        Korean: `작은 코드를 실행하는 중…`,
        Chinese: `运行一小段代码…`,
        Italian: `Eseguendo un piccolo snippet…`,
        Portuguese: `Executando um pequeno trecho…`,
    },
    fiddling: {
        English: `Fiddling with the browser…`,
        Japanese: `ブラウザをいじっている…`,
        French: `Je tripote le navigateur…`,
        Spanish: `Jugando con el navegador…`,
        German: `Spiele mit dem Browser herum…`,
        Tagalog: `Kinakalikot ang browser…`,
        Korean: `브라우저를 조작하는 중…`,
        Chinese: `摆弄浏览器…`,
        Italian: `Armeggiando con il browser…`,
        Portuguese: `Mexendo no navegador…`,
    },
    notes: {
        English: `Flipping through your notebook…`,
        Japanese: `ノートをめくっている…`,
        French: `Feuillette ton carnet…`,
        Spanish: `Hojeando tu cuaderno…`,
        German: `Blättere in deinem Notizbuch…`,
        Tagalog: `Binabaliktan ang iyong kuwaderno…`,
        Korean: `노트북을 넘겨보는 중…`,
        Chinese: `翻阅你的笔记本…`,
        Italian: `Sfogliando il tuo taccuino…`,
        Portuguese: `Folheando seu caderno…`,
    },
    inbox: {
        English: `Checking your inbox…`,
        Japanese: `受信箱をチェック中…`,
        French: `Vérifie ta boîte de réception…`,
        Spanish: `Revisando tu bandeja de entrada…`,
        German: `Überprüfe deinen Posteingang…`,
        Tagalog: `Sinusuri ang iyong inbox…`,
        Korean: `받은 편지함을 확인하는 중…`,
        Chinese: `检查收件箱…`,
        Italian: `Controllando la tua posta in arrivo…`,
        Portuguese: `Verificando sua caixa de entrada…`,
    },
    magic: {
        English: `Working some quiet magic…`,
        Japanese: `静かに魔法をかけている…`,
        French: `Fais un peu de magie tranquille…`,
        Spanish: `Haciendo un poco de magia silenciosa…`,
        German: `Wirke leise Magie…`,
        Tagalog: `Gumagawa ng tahimik na mahika…`,
        Korean: `조용히 마법을 부리는 중…`,
        Chinese: `正在施展安静的魔法…`,
        Italian: `Operando un po' di magia silenziosa…`,
        Portuguese: `Fazendo uma mágica silenciosa…`,
    },
};

/** Look up a translated phrase for the user's preferred language. Falls back
 *  to English if the language has no entry for that phrase. */
function t(phraseKey: string, lang: string): string {
    const phrase = toolPhrases[phraseKey];
    if (!phrase) return toolPhrases.magic?.English || `Working some quiet magic…`;
    // Try exact match first, then check if the language string contains the key
    if (phrase[lang]) return phrase[lang];
    const match = Object.keys(phrase).find(k => lang.toLowerCase().includes(k.toLowerCase()));
    return match ? phrase[match] : phrase.English;
}

/** 'read_gmail' -> 'Read Gmail'. Used when a tool has no flavored phrase above. */
const humanizeToolName = (name: string): string =>
    name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Maps a tool call to a flavored, human-readable line in the user's preferred
 *  language, telling them what the assistant is actually doing. Falls back to
 *  the tool's own name (humanized) rather than a vague phrase when unmatched. */
const describeToolCall = (name: string, _args: Record<string, any>, lang: string): string => {
    switch (true) {
        case name === 'search' || name === 'websearch':
            return t('search', lang);
        case name === 'fetch' || name === 'fetch_content' || name === 'scrape':
            return t('fetch', lang);
        case name.startsWith('browser_navigate'):
            return t('navigate', lang);
        case name.startsWith('browser_click'):
            return t('click', lang);
        case name.startsWith('browser_type'):
            return t('type', lang);
        case name.startsWith('browser_snapshot') || name.startsWith('browser_screenshot'):
            return t('read', lang);
        case name.startsWith('browser_') && name.includes('evaluate'):
            return t('evaluate', lang);
        case name.startsWith('browser_'):
            return t('fiddling', lang);
        case name.startsWith('obsidian_'):
            return t('notes', lang);
        case name.startsWith('gmail_'):
            return t('inbox', lang);
        default:
            return humanizeToolName(name);
    }
};

export class LiveAssistant {
    private session: any = null;
    private micCtx: AudioContext | null = null;
    private micStream: MediaStream | null = null;
    private micNode: AudioWorkletNode | null = null;
    private outCtx: AudioContext | null = null;
    private nextStart = 0;
    private playing = new Set<AudioBufferSourceNode>();
    private screenStream: MediaStream | null = null;
    private screenTimer: ReturnType<typeof setInterval> | null = null;
    private videoEl: HTMLVideoElement | null = null;
    private handlers!: LiveHandlers;
    private settings!: LLMSettings;
    private mcpTools: AssistantTool[] = [];
    private closedByUs = false;

    async connect(settings: LLMSettings, handlers: LiveHandlers): Promise<void> {
        this.settings = settings;
        this.handlers = handlers;
        this.closedByUs = false;
        handlers.onStatus('connecting');
        const ai = getGeminiClient(settings);
        
        // Load MCP tools (cached) and combine with built-in tools
        const mcpTools = await loadMcpAssistantTools(settings);
        this.mcpTools = mcpTools;
        const allTools = mcpTools.length ? [...ASSISTANT_TOOLS, ...mcpTools] : ASSISTANT_TOOLS;
        
        this.session = await ai.live.connect({
            model: LIVE_MODEL,
            config: {
                responseModalities: [Modality.AUDIO],
                systemInstruction: buildSystemIdentity(settings) + ' You are in live voice mode; keep spoken replies short. If the user shares their screen and explicitly asks you to interact with it, they will grant browser control permission — then you can call browser_* tools to click buttons, type text, scroll, and navigate on their screen. Do NOT attempt to use browser_* tools or ask for control permission on your own. Wait quietly until the user explicitly asks you to click, type, or navigate something.',
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.assistantVoice || 'Kore' } },
                },
                tools: [{ functionDeclarations: geminiToolDeclarations(allTools) as any }],
                inputAudioTranscription: {},
                outputAudioTranscription: {},
            },
            callbacks: {
                onopen: () => handlers.onStatus('live'),
                onmessage: (msg: any) => { void this.handleMessage(msg); },
                onerror: (e: any) => {
                    console.error('[LiveAssistant] session error', e);
                    handlers.onStatus('error', e?.message || 'live session error');
                },
                onclose: (e: CloseEvent) => {
                    if (this.closedByUs) return;
                    // Surface the real reason instead of silently resetting to idle —
                    // a session that dies right after opening (bad model name, no Live
                    // API access on this key, malformed tool config, quota) otherwise
                    // just looks like the button "does nothing".
                    console.error('[LiveAssistant] session closed unexpectedly', e?.code, e?.reason);
                    handlers.onStatus('error', e?.reason || `Live session closed unexpectedly (code ${e?.code ?? '?'})`);
                },
            },
        });

        await this.startMic();
    }

    private async startMic(): Promise<void> {
        this.micStream = await navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        });
        this.micCtx = new AudioContext({ sampleRate: MIC_RATE });
        await this.micCtx.resume();
        const workletUrl = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
        try {
            await this.micCtx.audioWorklet.addModule(workletUrl);
        } finally {
            URL.revokeObjectURL(workletUrl);
        }
        const source = this.micCtx.createMediaStreamSource(this.micStream);
        this.micNode = new AudioWorkletNode(this.micCtx, 'pcm-capture');
        const actualRate = this.micCtx.sampleRate;
        this.micNode.port.onmessage = (ev: MessageEvent<Float32Array>) => {
            if (!this.session) return;
            const pcm = floatTo16(resampleTo(ev.data, actualRate, MIC_RATE));
            const b64 = toBase64(new Uint8Array(pcm.buffer));
            try {
                this.session.sendRealtimeInput({ audio: { data: b64, mimeType: `audio/pcm;rate=${MIC_RATE}` } });
            } catch { /* session mid-close */ }
        };
        source.connect(this.micNode);
        // Do NOT connect micNode to destination — no local echo.
    }

    private async handleMessage(msg: any): Promise<void> {
        // 1. Tool calls
        if (msg.toolCall?.functionCalls?.length) {
            const responses: any[] = [];
            for (const fc of msg.toolCall.functionCalls) {
                console.debug('[LiveAssistant] tool call', fc.name, fc.args);
                const ctx = describeToolCall(fc.name, fc.args || {}, this.settings.assistantLanguage || 'English');
                this.handlers.onToolActivity(ctx);
                // Check permission for browser tools BEFORE executing — don't waste
                // a turn running the tool only for assertPermission() to throw.
                if (fc.name.startsWith('browser_') && !browserControlService.permissionGranted) {
                    console.debug('[LiveAssistant] browser tool blocked — permission not granted', fc.name);
                    this.handlers.onControlDenied(!!this.screenStream);
                    responses.push({ id: fc.id, name: fc.name, response: { result: 'Permission denied — user has not granted browser control permission.' } });
                } else {
                    const result = await executeAssistantTool(fc.name, fc.args || {}, { settings: this.settings }, this.mcpTools);
                    console.debug('[LiveAssistant] tool result', fc.name, result.slice(0, 200));
                    responses.push({ id: fc.id, name: fc.name, response: { result } });
                }
            }
            try { this.session?.sendToolResponse({ functionResponses: responses }); } catch { /* closed */ }
            return;
        }
        // 2. Interruption: user spoke over the assistant -> kill queued audio immediately.
        if (msg.serverContent?.interrupted) {
            this.flushPlayback();
            return;
        }
        // 3. Captions
        const inTr = msg.serverContent?.inputTranscription?.text;
        if (inTr) this.handlers.onCaption('user', inTr);
        const outTr = msg.serverContent?.outputTranscription?.text;
        if (outTr) this.handlers.onCaption('assistant', outTr);
        // 4. Audio out (24 kHz PCM16 in msg.data)
        if (msg.data) this.playChunk(fromBase64(msg.data));
    }

    private playChunk(bytes: Uint8Array): void {
        if (!this.outCtx) {
            this.outCtx = new AudioContext({ sampleRate: SPEAKER_RATE });
            this.nextStart = 0;
        }
        void this.outCtx.resume();
        const i16 = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
        const f32 = new Float32Array(i16.length);
        for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 0x8000;
        const buf = this.outCtx.createBuffer(1, f32.length, SPEAKER_RATE);
        buf.copyToChannel(f32, 0);
        const src = this.outCtx.createBufferSource();
        src.buffer = buf;
        src.connect(this.outCtx.destination);
        const startAt = Math.max(this.outCtx.currentTime, this.nextStart);
        src.start(startAt);
        this.nextStart = startAt + buf.duration;
        this.playing.add(src);
        this.handlers.onSpeaking(true);
        src.onended = () => {
            this.playing.delete(src);
            if (this.playing.size === 0) this.handlers.onSpeaking(false);
        };
    }

    private flushPlayback(): void {
        for (const src of this.playing) { try { src.stop(); } catch { /* already stopped */ } }
        this.playing.clear();
        this.nextStart = 0;
        this.handlers.onSpeaking(false);
    }

    async startScreenShare(): Promise<void> {
        this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const track = this.screenStream.getVideoTracks()[0];
        track.addEventListener('ended', () => this.stopScreenShare());

        const displaySurface = (track.getSettings() as any)?.displaySurface;
        if (displaySurface && displaySurface !== 'browser') {
            this.handlers.onShareWarning(
                'You shared a window/screen instead of this browser tab. To let the assistant click or type on external windows, you must connect the CDP bridge in Settings. Otherwise, clicks will only affect this Kollektiv tab.'
            );
        }

        this.videoEl = document.createElement('video');
        this.videoEl.srcObject = this.screenStream;
        this.videoEl.muted = true;
        await this.videoEl.play();
        const canvas = document.createElement('canvas');
        this.screenTimer = setInterval(() => {
            if (!this.session || !this.videoEl || this.videoEl.videoWidth === 0) return;
            const scale = Math.min(1, 1024 / Math.max(this.videoEl.videoWidth, this.videoEl.videoHeight));
            canvas.width = Math.round(this.videoEl.videoWidth * scale);
            canvas.height = Math.round(this.videoEl.videoHeight * scale);
            canvas.getContext('2d')!.drawImage(this.videoEl, 0, 0, canvas.width, canvas.height);
            browserControlService.setCaptureSize(canvas.width, canvas.height);
            externalBrowserService.setCaptureSize(canvas.width, canvas.height);
            const b64 = canvas.toDataURL('image/jpeg', 0.7).split('base64,')[1];
            try {
                this.session.sendRealtimeInput({ video: { data: b64, mimeType: 'image/jpeg' } });
            } catch { /* session mid-close */ }
        }, 1000); // 1 fps
        this.handlers.onScreenShare(true);
    }

    stopScreenShare(): void {
        if (this.screenTimer) { clearInterval(this.screenTimer); this.screenTimer = null; }
        this.screenStream?.getTracks().forEach(t => t.stop());
        this.screenStream = null;
        if (this.videoEl) { this.videoEl.srcObject = null; this.videoEl = null; }
        browserControlService.setCaptureSize(0, 0);
        externalBrowserService.setCaptureSize(0, 0);
        this.handlers?.onScreenShare(false);
    }

    disconnect(): void {
        this.closedByUs = true;
        this.stopScreenShare();
        this.flushPlayback();
        this.micNode?.port.close();
        this.micNode?.disconnect();
        this.micNode = null;
        this.micStream?.getTracks().forEach(t => t.stop());
        this.micStream = null;
        void this.micCtx?.close(); this.micCtx = null;
        void this.outCtx?.close(); this.outCtx = null;
        try { this.session?.close(); } catch { /* already closed */ }
        this.session = null;
    }
}
