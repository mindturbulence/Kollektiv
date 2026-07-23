import { Modality } from '@google/genai';
import type { LLMSettings } from '../types';
import { getGeminiClient } from './geminiService';
import { executeAssistantTool, geminiToolDeclarations, ASSISTANT_TOOLS, AssistantTool } from './assistantTools';
import { buildSystemIdentity } from './assistantService';
import { loadMcpAssistantTools } from './mcpAssistantTools';
import { browserControlService } from './browserControlService';
import { externalBrowserService } from './externalBrowserService';
import { resolveLangKey } from '../utils/languageKey';
import { TurnManager } from './turnManager';
import { VoiceActivityService } from './voiceActivityService';

// Single source of truth for the live model constant.
// Verified against https://ai.google.dev/gemini-api/docs/live-api/capabilities (2026-07-10) —
// gemini-live-2.5-flash-preview was retired; this is the current model. If connection fails
// with "model ... is not found ... bidiGenerateContent", check that page again first.
const LIVE_MODEL = 'gemini-3.1-flash-live-preview';
const MIC_RATE = 16000;      // Live API input requirement
const SPEAKER_RATE = 24000;  // Live API output rate

/** flavour: localized flavored phrase for the Samaritan assistant screen.
 *  toolName: humanized raw tool name for the Activity panel log. Two separate
 *  fields because those two surfaces intentionally show different text for
 *  the same tool call. */
export interface ToolActivityInfo {
    flavour: string;
    toolName: string;
}

export interface LiveHandlers {
    onStatus: (s: 'connecting' | 'live' | 'closed' | 'error', detail?: string) => void;
    onCaption: (who: 'user' | 'assistant', text: string) => void;
    onToolActivity: (info: ToolActivityInfo) => void;
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
    /** Fired when the voice turn state changes (idle/listening/processing/responding). */
    onTurnState?: (state: 'idle' | 'listening' | 'processing' | 'responding') => void;
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
        en: `Sniffing out answers on the web…`,
        ja: `ウェブで答えを探している…`,
        fr: `Je cherche des réponses sur le web…`,
        es: `Buscando respuestas en la web…`,
        de: `Durchsuche das Netz nach Antworten…`,
        tl: `Naghahanap ng sagot sa web…`,
        ko: `웹에서 답을 찾는 중…`,
        zh: `在网上寻找答案…`,
        'zh-tw': `在網路上尋找答案…`,
        it: `Cercando risposte sul web…`,
        pt: `Buscando respostas na web…`,
        ru: `Ищу ответы в интернете…`,
        ar: `أبحث عن إجابات على الويب…`,
        hi: `वेब पर जवाब ढूंढ रहा हूँ…`,
        nl: `Zoek op het web naar antwoorden…`,
    },
    fetch: {
        en: `Peeking inside a page to see what's there…`,
        ja: `ページの中を覗いている…`,
        fr: `Jette un coup d'œil à l'intérieur de la page…`,
        es: `Echando un vistazo a la página…`,
        de: `Schau mal in die Seite hinein…`,
        tl: `Sinusilip ang loob ng pahina…`,
        ko: `페이지 내용을 살펴보는 중…`,
        zh: `查看页面内容…`,
        'zh-tw': `查看頁面內容…`,
        it: `Dando un'occhiata dentro la pagina…`,
        pt: `Dando uma espiada na página…`,
        ru: `Заглядываю внутрь страницы, чтобы посмотреть, что там…`,
        ar: `أُلقِي نَظرَةً دَاخِلَ الصَّفحَةِ لِأَرَى مَا بِهَا…`,
        hi: `पेज के अंदर झांक कर देख रहा हूँ कि वहाँ क्या है…`,
        nl: `Gluren in een pagina om te zien wat erin zit…`,
    },
    navigate: {
        en: `Steering the browser somewhere new…`,
        ja: `ブラウザを新しい場所へ誘導中…`,
        fr: `Direction un nouvel endroit dans le navigateur…`,
        es: `Llevando el navegador a un nuevo lugar…`,
        de: `Navigiere zu einem neuen Ziel…`,
        tl: `Pinapunta ang browser sa bagong lugar…`,
        ko: `브라우저를 새 곳으로 이동 중…`,
        zh: `将浏览器导航到新位置…`,
        'zh-tw': `將瀏覽器導航到新位置…`,
        it: `Portando il browser verso un nuovo posto…`,
        pt: `Navegando para um novo lugar…`,
        ru: `Направляю браузер в новое место…`,
        ar: `أُوَجِّهُ المُتَصَفِّحَ إِلَى مَكَانٍ جَدِيدٍ…`,
        hi: `ब्राउज़र को किसी नई जगह ले जा रहा हूँ…`,
        nl: `Stuur de browser naar een nieuwe plek…`,
    },
    click: {
        en: `Gentle nudge on the screen…`,
        ja: `画面を優しくタップ…`,
        fr: `Petit coup doux sur l'écran…`,
        es: `Toque suave en la pantalla…`,
        de: `Sanfter Tipp auf den Bildschirm…`,
        tl: `Mahinang tapik sa screen…`,
        ko: `화면을 살짝 누르는 중…`,
        zh: `轻点屏幕…`,
        'zh-tw': `輕點螢幕…`,
        it: `Tocco leggero sullo schermo…`,
        pt: `Toque suave na tela…`,
        ru: `Лёгкое нажатие на экран…`,
        ar: `نَقرَةٌ لَطِيفَةٌ عَلَى الشَّاشَةِ…`,
        hi: `स्क्रीन पर हल्के से टैप कर रहा हूँ…`,
        nl: `Zachte tik op het scherm…`,
    },
    type: {
        en: `Tapping out a message…`,
        ja: `メッセージを打ち込んでいる…`,
        fr: `Je tape un message…`,
        es: `Escribiendo un mensaje…`,
        de: `Tippe eine Nachricht…`,
        tl: `Nagta-type ng mensahe…`,
        ko: `메시지를 입력하는 중…`,
        zh: `正在输入消息…`,
        'zh-tw': `正在輸入訊息…`,
        it: `Scrivendo un messaggio…`,
        pt: `Digitando uma mensagem…`,
        ru: `Печатаю сообщение…`,
        ar: `أَكتُبُ رِسَالَةً…`,
        hi: `संदेश टाइप कर रहा हूँ…`,
        nl: `Typ een bericht…`,
    },
    read: {
        en: `Taking a look around the page…`,
        ja: `ページを見渡している…`,
        fr: `Jette un œil autour de la page…`,
        es: `Echando un vistazo a la página…`,
        de: `Schau dich auf der Seite um…`,
        tl: `Tumingin-tingin sa paligid ng pahina…`,
        ko: `페이지를 둘러보는 중…`,
        zh: `浏览页面…`,
        'zh-tw': `瀏覽頁面…`,
        it: `Dando un'occhiata in giro per la pagina…`,
        pt: `Dando uma olhada na página…`,
        ru: `Осматриваю страницу…`,
        ar: `أُلقِي نَظرَةً حَولَ الصَّفحَةِ…`,
        hi: `पेज को देख रहा हूँ…`,
        nl: `Kijk rond op de pagina…`,
    },
    evaluate: {
        en: `Running a little snippet…`,
        ja: `小さなコードを実行中…`,
        fr: `Exécute un petit bout de code…`,
        es: `Ejecutando un pequeño fragmento…`,
        de: `Führe ein kleines Skript aus…`,
        tl: `Nagpapatakbo ng munting snippet…`,
        ko: `작은 코드를 실행하는 중…`,
        zh: `运行一小段代码…`,
        'zh-tw': `執行一小段程式碼…`,
        it: `Eseguendo un piccolo snippet…`,
        pt: `Executando um pequeno trecho…`,
        ru: `Выполняю небольшой скрипт…`,
        ar: `أُشَغِّلُ مَقطَعًا صَغِيرًا مِنَ الكُودِ…`,
        hi: `एक छोटा कोड स्निपेट चला रहा हूँ…`,
        nl: `Voer een klein codefragment uit…`,
    },
    fiddling: {
        en: `Fiddling with the browser…`,
        ja: `ブラウザをいじっている…`,
        fr: `Je tripote le navigateur…`,
        es: `Jugando con el navegador…`,
        de: `Spiele mit dem Browser herum…`,
        tl: `Kinakalikot ang browser…`,
        ko: `브라우저를 조작하는 중…`,
        zh: `摆弄浏览器…`,
        'zh-tw': `擺弄瀏覽器…`,
        it: `Armeggiando con il browser…`,
        pt: `Mexendo no navegador…`,
        ru: `Вожусь с браузером…`,
        ar: `أَعبَثُ بِالمُتَصَفِّحِ…`,
        hi: `ब्राउज़र के साथ छेड़छाड़ कर रहा हूँ…`,
        nl: `Friemel met de browser…`,
    },
    notes: {
        en: `Flipping through your notebook…`,
        ja: `ノートをめくっている…`,
        fr: `Feuillette ton carnet…`,
        es: `Hojeando tu cuaderno…`,
        de: `Blättere in deinem Notizbuch…`,
        tl: `Binabaliktan ang iyong kuwaderno…`,
        ko: `노트북을 넘겨보는 중…`,
        zh: `翻阅你的笔记本…`,
        'zh-tw': `翻閱你的筆記本…`,
        it: `Sfogliando il tuo taccuino…`,
        pt: `Folheando seu caderno…`,
        ru: `Листаю твой блокнот…`,
        ar: `أُقَلِّبُ صَفَحَاتِ دَفتَرِكَ…`,
        hi: `आपकी नोटबुक के पन्ने पलट रहा हूँ…`,
        nl: `Blader door je notitieboek…`,
    },
    inbox: {
        en: `Checking your inbox…`,
        ja: `受信箱をチェック中…`,
        fr: `Vérifie ta boîte de réception…`,
        es: `Revisando tu bandeja de entrada…`,
        de: `Überprüfe deinen Posteingang…`,
        tl: `Sinusuri ang iyong inbox…`,
        ko: `받은 편지함을 확인하는 중…`,
        zh: `检查收件箱…`,
        'zh-tw': `檢查收件匣…`,
        it: `Controllando la tua posta in arrivo…`,
        pt: `Verificando sua caixa de entrada…`,
        ru: `Проверяю твою почту…`,
        ar: `أَتَحَقَّقُ مِن صُندُوقِ وَارِدِكَ…`,
        hi: `आपका इनबॉक्स देख रहा हूँ…`,
        nl: `Controleer je inbox…`,
    },
    magic: {
        en: `Working some quiet magic…`,
        ja: `静かに魔法をかけている…`,
        fr: `Fais un peu de magie tranquille…`,
        es: `Haciendo un poco de magia silenciosa…`,
        de: `Wirke leise Magie…`,
        tl: `Gumagawa ng tahimik na mahika…`,
        ko: `조용히 마법을 부리는 중…`,
        zh: `正在施展安静的魔法…`,
        'zh-tw': `正在施展安靜的魔法…`,
        it: `Operando un po' di magia silenziosa…`,
        pt: `Fazendo uma mágica silenciosa…`,
        ru: `Тихонько колдую…`,
        ar: `أَصنَعُ بَعضَ السِّحرِ الهَادِئِ…`,
        hi: `चुपचाप थोड़ा जादू कर रहा हूँ…`,
        nl: `Doe wat stille magie…`,
    },
};

/** Look up a translated phrase for the user's preferred language, falling back
 *  to English. Uses the same canonical language-key resolution as the
 *  Samaritan assistant page's idle prompts (utils/languageKey.ts) — previously
 *  this did its own case-sensitive/substring matching, which silently fell
 *  back to English for language settings the idle-prompt page resolved fine. */
function t(phraseKey: string, lang: string): string {
    const phrase = toolPhrases[phraseKey];
    if (!phrase) return toolPhrases.magic.en;
    const key = resolveLangKey(lang);
    return phrase[key] || phrase.en;
}

/** 'read_gmail' -> 'Read Gmail'. Shown in the Activity panel's log, which
 *  wants the actual tool name — distinct from the flavored phrase shown on
 *  the Samaritan assistant screen (see describeToolCall). */
const humanizeToolName = (name: string): string =>
    name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Maps a tool call to a flavored, human-readable line in the user's preferred
 *  language, for display on the Samaritan assistant screen. Unmatched tools
 *  fall back to a generic flavored phrase, not the raw tool name — the
 *  Activity panel is what shows the actual name (see humanizeToolName). */
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
            return t('magic', lang);
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
    private turnManager: TurnManager | null = null;
    private vadService: VoiceActivityService | null = null;
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

        // Initialize turn management with VAD
        this.turnManager = new TurnManager();
        this.turnManager.silenceTimeoutMs = 800;
        this.turnManager.onInterruption = () => {
            console.debug('[LiveAssistant] local interruption — user spoke over AI');
            this.flushPlayback();
        };
        this.turnManager.onTurnStart = () => {
            this.handlers.onTurnState?.('listening');
        };
        this.turnManager.onUserSpeechEndCallback = (_audio) => {
            // Audio is already streaming to the LLM in real-time via the PCM worklet.
            // After silence timeout, transition to processing state for UI
            this.handlers.onTurnState?.('processing');
        };
        this.turnManager.onTurnEnd = () => {
            this.handlers.onTurnState?.('idle');
        };

        // Start VAD if we have mic access
        if (this.micCtx && this.micStream) {
            try {
                const vadService = new VoiceActivityService(this.turnManager);
                await vadService.start({
                    audioContext: this.micCtx,
                    stream: this.micStream,
                    turnManager: this.turnManager,
                    baseAssetPath: '/',
                    onnxWASMBasePath: '/',
                });
                this.vadService = vadService;
                console.debug('[LiveAssistant] VAD started');
            } catch (err) {
                console.warn('[LiveAssistant] VAD initialization failed, continuing without VAD:', err);
                // Graceful degradation — continue without VAD
            }
        }
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
                const flavour = describeToolCall(fc.name, fc.args || {}, this.settings.assistantLanguage || 'English');
                this.handlers.onToolActivity({ flavour, toolName: humanizeToolName(fc.name) });
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

        // Track AI turn state
        const wasEmpty = this.playing.size === 0;
        this.playing.add(src);
        if (wasEmpty) {
            this.handlers.onSpeaking(true);
            this.turnManager?.onAISpeechStart();
            this.handlers.onTurnState?.('responding');
        }

        src.onended = () => {
            this.playing.delete(src);
            if (this.playing.size === 0) {
                this.handlers.onSpeaking(false);
                this.turnManager?.onAISpeechEnd();
                this.handlers.onTurnState?.('idle');
            }
        };
    }

    private flushPlayback(): void {
        for (const src of this.playing) { try { src.stop(); } catch { /* already stopped */ } }
        this.playing.clear();
        this.nextStart = 0;
        this.handlers.onSpeaking(false);
        // Reset turn state — if this was triggered by a server interruption event,
        // the client-side VAD may have already handled it. Still safe to call.
        this.turnManager?.reset();
        this.handlers.onTurnState?.('idle');
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
        // Clean up VAD before stopping mic (VAD needs the stream to be alive)
        if (this.vadService) {
            void this.vadService.stop().catch(() => {});
            this.vadService = null;
        }
        this.turnManager?.reset();
        this.turnManager = null;
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
