# Implementation Plan: Port Friday's Advantages to Kollektiv

## Overview

Port the AI assistant capabilities from [ruxakK/friday_jarvis](https://github.com/ruxakK/friday_jarvis) that do not yet exist in Kollektiv. Each phase is independently testable and leaves the app in a working state. Ordered easiest → hardest.

## Decisions Made

| Question | Decision | Rationale |
|----------|----------|-----------|
| LiveKit Cloud vs self-hosted? | **Self-hosted** (if needed) | Full control, no per-minute costs, aligns with local-first ethos |
| Noise cancellation approach? | **Client-side WASM first** — RNNoise via AudioWorkletNode | Fits Kollektiv's local-first architecture. No server dependency. |
| VAD approach? | **@ricky0123/vad** (Silero VAD via ONNX WASM) | De facto standard browser VAD, 133K weekly downloads, AudioWorklet-based |
| Multi-LLM voice? | **Direct WebRTC** to each provider | OpenAI Realtime via WebRTC (same pattern as existing Gemini Live API). No LiveKit routing needed. |
| Camera + screen share? | **Both** — camera (face) + screen share through voice pipeline | Full multimodal visibility for the AI |
| Memory backend? | **Keep IndexedDB** — drop Mem0, drop MemoryBackend refactoring | Existing system works, free, local-first. Zero risk in skipping. |
| Agent worker language? | **Node.js** (if LiveKit needed) | Matches existing stack |
| Ordering? | **Easiest → hardest** | No deadline pressure — this evolves with the project |

## What Friday Has That Kollektiv Doesn't

| # | Feature | How Friday Does It | How We'll Do It | Effort |
|---|---------|-------------------|-----------------|--------|
| 1 | Weather lookup | wttr.in via `requests` | wttr.in via browser `fetch` — same data, no deps | XS |
| 2 | Noise cancellation | LiveKit Cloud BVC (server-side) | **RNNoise WASM** via `simple-rnnoise-wasm` AudioWorkletNode — client-side, zero server | M |
| 3 | Voice Activity Detection | LiveKit Agent VAD (Silero) | **@ricky0123/vad-web** — Silero VAD via ONNX WASM, client-side | S |
| 4 | Turn management | LiveKit AgentSession (built-in) | **State machine** consuming VAD events + silence timeout — pure JS | S |
| 5 | Multi-LLM voice (OpenAI) | LiveKit routes to OpenAI Realtime | **Direct WebRTC** to OpenAI Realtime API — same pattern as existing Gemini Live API | M |
| 6 | Live camera feed | LiveKit `video_enabled=True` | **getUserMedia + WebRTC track** — send camera track to LLM via WebRTC | M |
| 7 | Screen share + camera | Implicit via LiveKit tracks | **getDisplayMedia + getUserMedia** — two tracks to LLM via WebRTC | S |

## Research Results — Phase 3 Client-Side Pipeline

### We Can Replicate LiveKit Entirely Client-Side

The research confirms that ALL of Friday's voice pipeline features can be built purely in the browser with WASM-based libraries. This is **better** than Friday's architecture because:

- **No server-side agent worker needed** — everything runs in the browser
- **No LiveKit infrastructure** — self-hosting not required
- **Lower latency** — noise cancellation and VAD happen locally before audio leaves the device
- **Works with any LLM** — not locked to LiveKit's routing
- **Fits Kollektiv's local-first ethos** — data stays on device until sent to LLM

### Recommended Libraries

| Feature | Library | Why | Bundle Impact |
|---------|---------|-----|--------------|
| Noise cancellation | `simple-rnnoise-wasm` v1.1.0 | Smallest (140KB), MIT, built-in AudioWorkletNode + VAD status events, 0 deps | 122KB WASM + 1KB worklet |
| VAD (backup) | `@ricky0123/vad-web` v0.0.30 | Industry standard, proven in production, 133K weekly downloads | ~500KB model file (loaded once, cached) |
| Audio Worklet | Built into browser API | RNNoise and VAD both run in AudioWorklet — off main thread | 0 |

### Proposed Audio Pipeline

```
Mic (getUserMedia)
  │ Float32 audio
  ▼
AudioContext
  │
  ├── [simple-rnnoise-wasm] AudioWorkletNode
  │     ↓ Clean audio (background noise removed)
  │
  ├── [@ricky0123/vad] MicVAD (separate worklet)
  │     ↓ Events: onSpeechStart, onSpeechEnd, onFrameProcessed
  │
  ├── Turn State Machine (JS, main thread)
  │     IDLE ──onSpeechStart──▶ LISTENING
  │     LISTENING ──onSpeechEnd + timeout──▶ PROCESSING
  │     PROCESSING ──send to LLM──▶ RESPONDING
  │     RESPONDING ──onSpeechStart──▶ (cancel AI) LISTENING
  │     RESPONDING ──AI done──▶ IDLE
  │     ↓ Clean audio buffer (Float32Array @ 16kHz)
  │
  ├── WebRTC PeerConnection → OpenAI Realtime API
  │   OR Keep existing Gemini Live API WebRTC path
  │     ↓ Response audio
  │
  └── <audio> element playback
        ← VAD monitors playback for interruption detection
```

---

## Implementation Phases

---

### Phase 1: Weather Tool (XS, ~30 min)

**Description:** Add a `get_weather` tool to `ASSISTANT_TOOLS`. Uses wttr.in, no API key needed. Same pattern as `get_current_time` / `fetch_url`.

**Files to modify:**
- `services/assistantTools.ts` — add tool entry

**Tool entry:**
```typescript
{
  name: 'get_weather',
  description: 'Get the current weather for a city. Returns temperature, conditions, wind, humidity as formatted text. No API key needed.',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'City name (e.g. "London", "Tokyo", "New York"). Optionally add country code for accuracy ("London,UK").' },
    },
    required: ['city'],
  },
  execute: async ({ city }) => {
    try {
      const res = await fetch(`https://wttr.in/${encodeURIComponent(String(city))}?format=%C+%t+%w+%h`);
      if (!res.ok) return `Could not retrieve weather for ${city}.`;
      const text = await res.text();
      return `Weather in ${city}: ${text.trim()}`;
    } catch (e: any) {
      return `Weather lookup failed: ${e?.message || e}. Verify network connectivity.`;
    }
  },
}
```

**Test:** Unit test with mocked fetch. Verify appears in all three declaration outputs.

**Edge cases:** City with special chars (encodeURIComponent), city not found (wttr.in returns descriptive text), network failure.

**Verification:** `pnpm lint && pnpm test` passes. Manual: "weather in Tokyo?"

---

### Phase 2: Client-Side Noise Cancellation (M, ~1 session) ✅ Done

**Description:** Add RNNoise WASM noise cancellation to the live voice path. The `simple-rnnoise-wasm` AudioWorkletNode cleans mic audio before it's sent to the LLM.

**Files created:**
- `services/noiseCancellation.ts` — `NoiseCancellation` class wrapping RNNoiseNode
- `services/noiseCancellation.test.ts` — 10 tests (all passing)
- `simple-rnnoise-wasm.d.ts` — type declarations for browser-only package

**Files modified:**
- `package.json` — added `simple-rnnoise-wasm` (v1.1.0), `vite-plugin-static-copy` (dev)
- `vite.config.ts` — added `viteStaticCopy` plugin to copy `rnnoise.wasm` and `rnnoise.worklet.js` to dist root

**Actual interface:**
```typescript
export class NoiseCancellation {
  static get isSupported(): boolean;
  static register(ctx: AudioContext): Promise<void>;
  create(ctx: AudioContext, source: AudioNode): RNNoiseNodeInstance;
  get vadStatus(): number;
  get enabled(): boolean;
  set enabled(v: boolean);
  dispose(): void;
}
```

**Key decisions made:**
- Used **dynamic import** for `simple-rnnoise-wasm` to avoid Node.js resolution failures (browser-only package with no `main` entry) — Vitest mocks intercept the dynamic import
- Created `simple-rnnoise-wasm.d.ts` for TS declarations since the package has none
- `vite-plugin-static-copy` copies WASM + Worklet files to build output at `/rnnoise.wasm` and `/rnnoise.worklet.js`
- `register()` is async and idempotent — safe to call multiple times
- `isSupported` checks `AudioContext.prototype.audioWorklet` existence (feature detection, not browser sniffing)
- The class stores the RNNoiseNode constructor after a successful `register()`, so `create()` doesn't need the dynamic import

**Integration into existing voice path:**
```typescript
// Current (liveAssistantService.ts):
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const source = ctx.createMediaStreamSource(stream);
// → audio goes directly to WebRTC peer connection

// New:
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const source = ctx.createMediaStreamSource(stream);
await NoiseCancellation.register(ctx);
const nc = new NoiseCancellation();
const ncNode = nc.create(ctx, source);
// → ncNode outputs clean audio → send to WebRTC peer connection
```

**Test results:** 10 unit tests cover:
- Feature detection (`isSupported` with/without AudioContext, with/without AudioWorklet)
- Registration flow (single, idempotent)
- Precondition check (create before register throws)
- Audio graph wiring (node created, source connected)
- VAD status initial value
- Enabled toggling
- Dispose cleanup

**Edge cases handled:**
- AudioContext not available → `isSupported` returns false
- AudioWorklet not on prototype (Safari < 14.1) → `isSupported` returns false
- Multiple register() calls → no-op after first
- create() before register() → throws with descriptive error
- Dispose after create → node disconnected, processing stopped
- WASM module not supported in older browsers → feature detection via `isSupported`

**Verification:**
- [x] `pnpm lint && pnpm test` passes
- [ ] Noise cancellation activates on live voice sessions (manual — needs Phase 3 VAD to test end-to-end)
- [x] VAD readings available from the module
- [ ] Graceful fallback if WASM unavailable (manual — needs browser without AudioWorklet)

---

### Phase 3: Voice Activity Detection + Turn Management (M, ~1 session)

**Description:** Add Silero VAD via `@ricky0123/vad-web` and build the turn management state machine. The VAD detects when the user starts/stops speaking. The state machine manages the conversation flow: listening → processing → responding → back to listening.

**Files to create:**
- `services/turnManager.ts` — state machine consuming VAD events

**Files to modify:**
- `package.json` — add `@ricky0123/vad-web` (and `@ricky0123/vad-react` if React hooks desired)
- `vite.config.ts` — add copy config for .onnx and .wasm assets
- `services/liveAssistantService.ts` — integrate VAD + turn manager

**Turn State Machine:**
```typescript
export type TurnState = 'idle' | 'listening' | 'processing' | 'responding';

export interface TurnEvents {
  onUserSpeechStart: () => void;
  onUserSpeechEnd: (audioBuffer: Float32Array) => void;
  onAISpeechStart: () => void;
  onAISpeechEnd: () => void;
  onInterruption: () => void;
}

export class TurnManager {
  private state: TurnState = 'idle';
  private silenceTimeout: number | null = null;
  private audioBuffer: Float32Array[] = [];

  // VAD callback
  onSpeechStart() { /* transition: idle→listening, responding→interruption */ }
  onSpeechEnd(audio: Float32Array) { /* start silence timeout, then →processing */ }
  onAIResponding() { /* →responding */ }
  onAIFinished() { /* →idle */ }

  // Config
  silenceTimeoutMs = 800;  // ms of silence before "end of turn"
  minSpeechMs = 300;       // minimum speech to avoid false triggers

  interrupt() { /* cancel AI playback, flush buffer, →listening */ }
  reset() { /* →idle, clear buffer */ }
}
```

**Integration with @ricky0123/vad-web:**
```typescript
import { MicVAD } from '@ricky0123/vad-web';

const vad = await MicVAD.new({
  onSpeechStart: () => turnManager.onSpeechStart(),
  onSpeechEnd: (audio) => turnManager.onSpeechEnd(audio),
  onFrameProcessed: (probs) => { /* optional: visual indicator */ },
  positiveSpeechThreshold: 0.7,
  negativeSpeechThreshold: 0.3,
  redemptionFrames: 8,
  preSpeechPadFrames: 4,
});
vad.start();
```

**Test:**
- Unit: TurnManager state transitions, timeout behavior, interruption handling
- Manual: Speak → VAD detects → state machine records audio → send to AI
- Manual: Interrupt AI → VAD detects → cancel AI response → listen again
- Manual: Silence → no false triggers after `minSpeechMs`

**Edge cases:**
- Very short utterances (<300ms) → VAD misfire event
- Background noise → calibrated thresholds + RNNoise pre-processing
- Multiple rapid speech segments → debounce
- Browser tab hidden → pause VAD to save resources
- AudioWorklet not supported → disable VAD, fall back to push-to-talk

**Verification:**
- [ ] `pnpm lint && pnpm test` passes
- [ ] VAD correctly detects speech start/end with <300ms latency
- [ ] TurnManager transitions correctly in all scenarios
- [ ] Interruption cancels AI playback and re-opens mic
- [ ] No false triggers from silence or background noise with RNNoise active

---

### Phase 4: OpenAI Realtime Voice Backend (M, ~2 sessions)

**Description:** Add OpenAI Realtime API as an alternative voice backend alongside the existing Gemini Live API. Uses direct WebRTC — same browser `RTCPeerConnection` pattern already used for Gemini, but connecting to OpenAI's endpoints via ephemeral token.

**Files to create:**
- `services/openaiRealtimeService.ts` — `OpenAIRealtimeAssistant` class
- `server.ts` — add `/api/openai/token` endpoint that mints ephemeral tokens using the server-side OpenAI API key

**Files to modify:**
- `types.ts` — add `voiceProvider` to `LLMSettings`: `'gemini_live' | 'openai_realtime'`
- `components/settings/IntegrationsSection.tsx` — add voice provider selector
- `contexts/LiveAssistantContext.tsx` — conditionally instantiate the right backend

**Client interface (mirrors existing LiveAssistant):**
```typescript
export class OpenAIRealtimeAssistant {
  private pc: RTCPeerConnection;
  private dc: RTCDataChannel;
  private turnManager: TurnManager;

  async connect(settings: LLMSettings, handlers: LiveHandlers): Promise<void>;
  disconnect(): void;
  setMicEnabled(enabled: boolean): boolean;
  setSpeakerEnabled(enabled: boolean): boolean;
  // These add video tracks to the PC (for camera + screen share in Phase 5)
  startCamera(): Promise<void>;
  stopCamera(): void;
  startScreenShare(): Promise<void>;
  stopScreenShare(): void;
}
```

**Server endpoint (`server.ts`):**
```typescript
app.get('/api/openai/token', async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'OpenAI API key not configured' });

  const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session: {
        type: 'realtime',
        model: 'gpt-realtime-2.1',
        audio: { output: { voice: 'marin' } },
      },
    }),
  });
  const data = await response.json();
  res.json(data);
});
```

**Test:**
- Integration: Server endpoint mints valid token from OpenAI
- Manual: Switch to OpenAI Realtime backend, speak, hear response
- Manual: Tool calling (function calling) works via WebRTC data channel
- Manual: Switch back to Gemini Live API, confirm no regression

**Edge cases:**
- No OpenAI API key → hide the option, or show "configure in Settings"
- Token expires during session → server generates new one, reconnect
- OpenAI model not available (region, account tier) → descriptive error
- WebRTC connection failure → fallback message
- Rate limiting → expose via response headers

**Verification:**
- [ ] `pnpm lint && pnpm test` passes
- [ ] OpenAI Realtime voice session works end-to-end
- [ ] Switching providers doesn't break existing Gemini flow
- [ ] Tool calling functions via data channel
- [ ] Settings persist across page reload

---

### Phase 5: Live Camera + Screen Share (M, ~1 session)

**Description:** Add camera (face) and screen share support to live voice sessions. Both route through the WebRTC peer connection so the AI has full multimodal visibility. Camera works with both Gemini Live API and OpenAI Realtime. Screen share already works on Gemini — add it to OpenAI path.

**Files to modify:**
- `services/openaiRealtimeService.ts` — add camera + screen share track management
- `services/liveAssistantService.ts` — add camera to Gemini path (screen share already exists)
- `contexts/LiveAssistantContext.tsx` — expose camera toggle
- `components/*.tsx` — camera button + PIP preview

**Camera flow:**
```
getUserMedia({ video: true, facingMode: 'user' })
  → LocalVideoTrack
  → RTCPeerConnection.addTrack()
  → LLM receives video frames
```

**Screen share flow:**
```
getDisplayMedia()
  → LocalVideoTrack  
  → RTCPeerConnection.addTrack()
  → LLM receives screen frames
```

**Both simultaneously:**
```
Two RTCRtpSenders on the same PeerConnection
  → LLM receives two video tracks
  → Model can reference both: "I can see you AND your screen"
```

**Camera PIP preview:**
```tsx
{cameraActive && (
  <div className="fixed bottom-20 right-4 w-48 h-36 rounded-lg overflow-hidden border-2 border-primary shadow-xl z-50">
    <video ref={previewRef} autoPlay playsInline muted className="w-full h-full object-cover" />
  </div>
)}
```

**Test:**
- Manual: Camera toggle, preview visible, AI describes what it sees
- Manual: Screen share + camera simultaneously
- Manual: Permission denied → graceful handling
- Manual: No camera hardware → tooltip

**Edge cases:**
- Permission denied → one-time notification, don't retry
- No camera hardware → detect via `enumerateDevices()`, disable button
- Multiple cameras → `facingMode: 'user'` default, allow switch
- Tab hidden → pause camera track to save resources
- Screen share source selection canceled → `NotAllowedError` → silent no-op
- Both tracks active → two senders, LLM sees both
- Bandwidth with two video tracks → limit resolution (720p camera, 1080p screen)

**Verification:**
- [ ] `pnpm lint && pnpm test` passes
- [ ] Camera feed visible in PIP preview
- [ ] AI can describe what's on camera
- [ ] AI can read screen share content
- [ ] Privacy: camera ALWAYS off by default, explicit enable needed
- [ ] Works with both Gemini and OpenAI backends (where supported)

---

## Final Dependency Graph

```
Phase 1: Weather ─────────────── ✅ Done
Phase 2: Noise Cancellation ──── ✅ Done (ran parallel with P1)
Phase 3: VAD + Turn Management ─ Depends on P2 (clean audio → better VAD)
Phase 4: OpenAI Realtime ─────── Depends on P3 (VAD/turn mgmt consumed)
Phase 5: Camera + Screen Share ─ Depends on P4 (uses WebRTC tracks)
```

Phases 1 and 2 can run in parallel. Phase 3 needs Phase 2's clean audio for accurate VAD (otherwise background noise triggers false VAD events). Phase 4 consumes the TurnManager from Phase 3. Phase 5 extends Phase 4's WebRTC connection with video tracks.

## Full Task List (Ordered Easiest → Hardest)

| # | Task | Size | Files | Depends On |
|---|------|------|-------|------------|
| # | Task | Size | Files | Depends On |
|---|------|------|-------|------------|
| 1 | Add weather tool | ✅ XS | 1 | None |
| 2 | RNNoise WASM noise cancellation | ✅ M | 5 (2 src, 1 test, 1 d.ts, 1 cfg) | None |
| 3 | Silero VAD + turn state machine | M | 4 | Task 2 |
| 4 | OpenAI Realtime voice backend | M | 5-6 | Task 3 |
| 5 | Camera + screen share | M | 4 | Task 4 |

## Test Strategy

| Task | Unit Tests | Integration | Manual |
|------|-----------|-------------|--------|
| 1: Weather | Mock fetch, verify tool | — | "Weather in Tokyo?" |
| 2: Noise Cancellation | ✅ 10 tests (construction, registration, VAD, lifecycle) | — | Speak with fan noise — clean audio |
| 3: VAD + Turn | State transitions, timeouts, interruption | VAD with test audio file | Speak/stop/interrupt — correct transitions |
| 4: OpenAI Realtime | — | Server token endpoint | Speak → AI responds via OpenAI |
| 5: Camera + Screen | Permission states | — | AI sees camera + screen |

## Edge Cases Summary

| Feature | Edge Case | Handling |
|---------|-----------|----------|
| Weather | City not found | Pass wttr.in error text as-is |
| Weather | Network failure | Catch + descriptive message |
| Noise Cancellation | WASM fail | Fallback to raw mic audio |
| Noise Cancellation | Autoplay policy | Require user gesture before AudioContext |
| Noise Cancellation | Old browser | Feature detect + fallback |
| VAD | Very short speech | `minSpeechFrames` threshold |
| VAD | False positives | Calibrate with RNNoise + threshold tuning |
| VAD | Tab hidden | Pause VAD, resume on visible |
| Turn | Barge-in (user interrupts AI) | Interruption detection → cancel response |
| Turn | Silence timeout too short | Configurable per-provider |
| Turn | Silence timeout too long | Default 800ms, adjust based on latency |
| OpenAI | No API key | Hide option / show config prompt |
| OpenAI | Token expired | Server regenerates, client reconnects |
| OpenAI | Model unavailable | Descriptive error, suggest alternative |
| Camera | Permission denied | One-time toast, don't retry |
| Camera | No hardware | `enumerateDevices` → disable button |
| Camera | Tab hidden | Pause track, resume on visible |
| Screen share | User cancels dialog | `NotAllowedError` → silent no-op |
| Both tracks | Bandwidth | Cap resolution (720p camera, 1080p screen) |

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| RNNoise WASM quality insufficient for heavy noise | Low | Medium | Test with real noisy environments. Adjust thresholds. Fallback to raw audio always available. |
| VAD latency too high (>500ms) | Low | High | Silero VAD runs in AudioWorklet off main thread. Predicted latency <100ms per frame. Test to confirm. |
| OpenAI Realtime API breaks or changes | Medium | Medium | Pin SDK version. Gemini Live API remains as fallback default. Abstraction layer for provider switching. |
| WASM + ONNX model files large (600KB+) | Medium | Low | Loaded once, cached by browser. Lazy-loaded on first voice session, not on app start. |
| AudioWorklet not supported | Low | Medium | Feature detection. Fall back to raw AudioContext + no noise cancellation. |
| Both video tracks saturate upload bandwidth | Low | Medium | Cap resolutions. Implement bandwidth estimation if needed. |

## Key Architectural Insight

This plan **replicates LiveKit's functionality without LiveKit**. Where Friday requires:
- A LiveKit server (Cloud or self-hosted)
- A LiveKit agent worker (Node.js or Python)
- WebRTC routing through LiveKit's infrastructure

Kollektiv does it with:
- **RNNoise WASM** in an AudioWorkletNode (noise cancellation)
- **Silero VAD** via ONNX WASM in an AudioWorklet (voice activity detection)
- A **pure JS state machine** (turn management)
- **Direct WebRTC** to each LLM provider's API (OpenAI Realtime, Google Gemini Live)

This is architecturally superior for a local-first application — less infrastructure, lower latency, better privacy, and no vendor lock-in.
