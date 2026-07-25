# Voice Pipeline

## Architecture Overview

The voice experience uses a layered pipeline rather than a monolithic feature:

1. Capture audio and produce a transcript
2. Hand the transcript to the same planning logic used for typed input
3. Route the resulting action through the assistant tool loop or the generation layer
4. Render spoken output back to the user with interruption support

## Voice Backends

Three backends are supported, selected via `LLMSettings.voiceProvider`:

| Backend | Service file | Protocol | Features |
|---------|-------------|----------|----------|
| Gemini Live | `liveAssistantService.ts` | WebSocket + WebRTC | Full duplex, tool execution, interruption, screen share, camera |
| OpenAI Realtime | `openaiRealtimeService.ts` | WebSocket | Full duplex, function calling, interruptions |
| ElevenLabs | `elevenLabsService.ts` | HTTP + WebSocket | Agent-based conversation, TTS |

All three backends are managed by `contexts/LiveAssistantContext.tsx` which provides a unified `start()`/`stop()`/`toggleLive()` interface.

## STT (Speech-to-Text)

- **Gemini Live:** Server-side STT via Gemini's Live API (WebRTC)
- **OpenAI Realtime:** Server-side STT via GPT-4o Realtime
- **ElevenLabs:** Server-side STT via ElevenLabs agent pipeline

## Noise Cancellation

**File:** `services/noiseCancellation.ts`
**WASM:** `simple-rnnoise-wasm` (RNNoise-based)

- Loaded dynamically via `await import('simple-rnnoise-wasm')`
- Registered on the mic's `AudioContext` as a custom AudioNode
- Sits between the mic source and the PCM-capture AudioWorkletNode (upstream of VAD)
- Falls back to raw mic source if WASM fails to load or register
- Wired into `liveAssistantService.ts`'s `startMic()` flow
- Disposed on `disconnect()`
- **Auto-started, no user toggle** — runs silently always-on

**Tests:** 10 unit tests in `services/noiseCancellation.test.ts`

## VAD (Voice Activity Detection)

**File:** `services/voiceActivityService.ts`

Detects when the user is speaking. Works with the noise-cancelled audio stream to reduce false triggers from background noise.

## Streaming

- Partial text flows through the UI incrementally (via `onCaption` callback)
- Gemini Live and OpenAI Realtime support native streaming
- ElevenLabs uses agent-level streaming

## TTS (Text-to-Speech)

- **Gemini Live:** Server-side TTS via Gemini API (WebRTC output)
- **OpenAI Realtime:** Server-side TTS via GPT-4o
- **ElevenLabs:** ElevenLabs TTS (high-quality voice synthesis)

## Interruptions

All three backends support interruption:
- User starts speaking → system stops current assistant speech
- Tool execution can be cancelled mid-flight
- `LiveAssistantContext` generation counter prevents stale connections

## WebSocket Reconnection

**File:** `utils/reconnectManager.ts`

Exponential backoff reconnection with configurable parameters:
- `baseDelay`: initial delay (default 1000ms)
- `maxRetries`: maximum retry attempts
- `onAttempt`/`onSuccess`/`onFailure` callbacks for UI state updates

Wired into all three voice backends:
- `liveAssistantService.ts` — Gemini Live reconnection
- `openaiRealtimeService.ts` — OpenAI Realtime reconnection  
- `elevenLabsService.ts` — ElevenLabs reconnection

## Ghost Session Prevention

**Issue:** Rapid mic on/off clicking could leave a ghost session running (ISSUE-20, fixed).

**Fix in `LiveAssistantContext.tsx`:**
- Generation counter (`sessionIdRef`) bumped on every `start()`/`stop()` call
- Each `start()` captures its own generation and no-ops handlers if superseded
- After `connect()` resolves, re-checks staleness and disconnects if a newer call happened
- Fixed pre-existing missing `voiceProvider` dependency on `start`'s `useCallback`

## Captions

`LiveCaptionOverlay` renders real-time voice captions as an overlay on non-assistant pages. Hidden during `activeTab === 'assistant'` (the full-screen Assistant page has its own caption UI).

## Audio Settings

- `voiceProvider`: Selects backend (`gemini_live` / `openai_realtime` / `elevenlabs`)
- `assistantVoice`: Voice model selection
- `assistantLanguage`: Language for voice interactions
- Assistant persona settings also affect voice behavior

## Related

- [ARCHITECTURE_CONSTITUTION.md § Security Hardening](../00_FOUNDATION/ARCHITECTURE_CONSTITUTION.md#security-hardening) — the CSP entries this pipeline depends on: `blob:` for the mic-capture `AudioWorklet`, `'wasm-unsafe-eval'` for RNNoise/VAD WASM compilation, and the `wss://generativelanguage.googleapis.com` `connect-src` entry for Gemini Live
- [AI_ENGINE.md](../01_AI_ENGINE/AI_ENGINE.md) — the assistant tool loop that voice-derived transcripts are routed through, same as typed input
