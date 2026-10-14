# Note: voice activation of the AI assistant (future feature)

Status: idea, not planned. Captured 2026-10-13 from a code read (nothing was run).

## Current state

- A live voice session can only be **started manually**: Ctrl+Space global hotkey
  (`contexts/LiveAssistantContext.tsx`, needs a voice API key), or clicking the
  live bar / floating avatar.
- Once live: full-duplex speech with interruption (Gemini Live, OpenAI Realtime,
  ElevenLabs), RNNoise noise cancellation, VAD. See
  `docs/handbook/docs/06_VOICE/VOICE_PIPELINE.md`.
- No wake word, no always-listening mode, no `SpeechRecognition` use. The mic is
  opened only inside `start()` via `getUserMedia` in the two realtime services.

## Options

| Option | Effort | Notes |
|--------|--------|-------|
| Push-to-talk (hold a key) | Small | Best value; no always-on mic |
| Wake word via local WASM detector (openWakeWord / Porcupine) | Medium | Reuses the existing AudioWorklet + WASM plumbing; hands off to `start()` |
| `webkitSpeechRecognition` phrase listen | Small | Chromium-only, often streams audio to Google; clashes with local-first |

## Risks to weigh before building

- Persistent browser mic indicator and CPU/battery cost.
- False triggers from the app's own audio (Spotify/YouTube playback).
- CSP and permission review.
- A browser tab only listens while open; "from anywhere" needs a desktop shell.

---

# Parked assistant ideas (decided against for now, 2026-10-13)

## Always-on wake word ("Hey Kollektiv")

Not building now. Push-to-talk (TASKS.md § 9) covers most of the value without a
permanently open mic. Revisit only if push-to-talk proves insufficient, and then
see the options and risks in the voice-activation note above.

## More assistant tools

Not building now. `services/assistantTools.ts` already registers about 50 tools;
tool-selection accuracy tends to degrade as the list grows. New capabilities should
go through the existing `capability_search` / `capability_execute` platform rather
than as new top-level tools. Revisit when a concrete user need has no capability
that fits.
