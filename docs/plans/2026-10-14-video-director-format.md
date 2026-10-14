# Refiner: "Director's Script" format for video (T2V / I2V), duration slider, audio direction

Status: plan only, nothing built. Tickets are in [TASKS.md § 10](TASKS.md).
Decisions in this plan (sizing, ordering, the dialect table) were made by me, not Jev: they are derived from this
repo's source, which CLAUDE.md says must not leave the machine without asking.

## 1. What exists today (verified by reading the code)

| Fact | Where |
|---|---|
| Video prompt rules **forbid** timestamps, "Keyframe" labels, headers, shot lists and say "one primary action, not a montage" | `services/llmService.ts:63` `VIDEO_MOTION_RULES` |
| T2V/I2V differ by one sentence each; I2V says "strip all static descriptions" | `llmService.ts:94-98`, `:153-157` |
| Per-model guidance is 1–2 sentences (`format` + `rules`) from a profile table | `constants/modelProfiles.ts:65-210` |
| `videoInputType: 't2v' \| 'i2v'` is the only video-specific modifier besides motion / camera / effect | `types.ts:342`, `RefinerModifierControls.tsx:368-396` |
| Duration exists **only for audio** (`audioDuration`, 1–120 s) and is injected only when `isAudio` | `RefinerModifierControls.tsx:418`, `llmService.ts:270` |
| Audio modifiers (voice, tone, environment, mood, genre) are injected only when `isAudio`, except voice/tone/acoustics/mood which are unconditional | `llmService.ts:261-270` |
| Reference images reach only the Gemini enhancer path | `enhancePromptStream` → `enhancePromptGeminiStream` |

So the sample format you pasted is not reachable today: the system prompt actively tells the model not to produce it.

## 2. Target output format

One format, adapted per model by a "dialect". Sections in order, omitting any that are empty:

```
HEADER      <format> <aspect> <realism> video[ based on the reference image]. Total duration N seconds.
LOCK        (I2V) Keep the exact subject/outfit/setting of the reference image: <short identity lock>.
            (T2V) full subject + wardrobe + setting description (this is where the sample's long paragraph goes).
TIMELINE    0–3s: <camera + action + beat>
            3–5s: ...                       (ranges contiguous, last one ends at N)
AUDIO       Dialogue: <Speaker>: "line"  |  Sound effects: ...  |  Ambience: ...  |  Music: ...   (only when audio on)
STYLE       Visual Style: <comma list>
CONTINUITY  Important: same subject/outfit/setting throughout; motion natural, continuous; <positive-phrased constraints>
```

T2V vs I2V:
- **I2V** — LOCK is a *short* restatement (the sample re-lists face/outfit; this measurably helps identity drift, but
  it is not from any vendor doc I could open, so treat as community practice). Timeline is kinetic only; no static re-description beyond the lock.
- **T2V** — LOCK is the full world-building paragraph; timeline beats may introduce new elements.

## 3. Per-model dialect (what actually differs)

Only differences that I could source go in the table. "Official" = fetched from the vendor this session; "3rd" = third-party guide only.

| Family | Timeline style | Audio | Negatives | Durations | Source |
|---|---|---|---|---|---|
| Veo 3.x | prose beats; **no official timestamp syntax** (`[00:00-00:02]` seen only on a reseller doc) | native; dialogue in quotes, SFX and ambience described explicitly | not in the Gemini API page — phrase positively | 4 / 6 / 8 s (8 s needed for 1080p/4k, refs, extension) | Official: ai.google.dev/gemini-api/docs/veo |
| Sora 2 | Labeled blocks: prose → `Cinematography:` (`Camera shot:`) → `Mood:` → `Actions:` bullets → `Dialogue:` → `Background Sound:`; one camera setup + one action per shot | native; separate Dialogue block, short lines (4 s ≈ 1–2 exchanges) | — | `seconds` ∈ 4, 8, 12, 16, 20; **set by API param, not prose** | Official: OpenAI cookbook sora2 guide |
| Kling 3.0 | per-shot labels, up to multi-shot (`multi_prompt`), 3–15 s | native, on by default; name the speaker per line + tone/pace/language/ambient | — | 3–15 s | 3rd (fal, imagine.art, morphic); official page not found |
| Hailuo / MiniMax | prose + bracketed camera commands after the description (`[pan]`, `[zoom]`, `[static]`) | page does not say output audio is generated | — | 4–15 s (H3) | Official: platform.minimax.io |
| Wan 2.5/2.6 | `shot_type: multi` + short shot list; keep subject wording identical across shots | native audio, optional `audio_url` | — | 2–15 s (2.6) | 3rd (Alibaba docs unreachable from here) |
| LTX-2.x | **one flowing present-tense paragraph**: shot, scene, action, character, camera, audio; quoted speech | native; unstated audio is invented | long negative prompt in API | frames = 8n+1 (121 @ 24 fps) | Official HF card + 3rd for the paragraph rule |
| Seedance 2.0 | subject/action/environment/camera; `@image1` / `@audio1` references | native | — | unverified | 3rd only |
| Runway Gen-4 / Luma / Pika / Vidu / Hunyuan / CogVideo / Mochi / PixVerse | **not researched** (Runway help page 403) | — | — | — | — |

Consequences the table forces:
1. A single hard-coded timestamp template would be **wrong for Sora (labeled blocks), LTX (one paragraph) and Veo (no documented syntax)**. Hence dialects, not one template.
2. Sora's duration is an API argument, so for Sora the slider must also *display the value to set in the API call* — writing "10 seconds" in prose does nothing.
3. Many official pages say to phrase constraints positively; the sample's "No flickering, no extra fingers, no watermark" tail is a negative list. Default: emit it as positive continuity wording; emit a literal negative list only for dialects that have a negative-prompt field (LTX, Wan, SD-family).

## 4. Design

**Data model** — extend `ModelProfile` (modelProfiles.ts) with an optional `video?: VideoDialect`:
`{ timeline: 'timestamps' | 'labeled-blocks' | 'prose', audio: 'native' | 'none' | 'separate', negatives: 'inline-positive' | 'field', durations: number[] | {min,max}, maxBeats }`.
Models without a dialect keep today's behaviour via `lookupModelProfile` fallback.

**Modifiers** (`types.ts` `PromptModifiers`): `videoDuration?: string`, `videoAudio?: 'off' | 'auto' | 'direct'`,
`videoDialogue?: string` (free text: speaker lines / narration), `videoSfx?: string`.
Slider: lives in the Motion tab under the T2V/I2V switch; range and step come from the target model's dialect
(Veo 4/6/8 → three snap points; Kling 3–15 → continuous). Unknown model → 3–15.

**Deterministic beats** — a small pure function `buildTimelineSkeleton(duration, maxBeats)` returns contiguous ranges
(`0–3s, 3–5s, …`). The LLM fills them; code never trusts the LLM to do the arithmetic. A post-check validates that
the ranges are contiguous and end at N (one unit test). Dialects with `timeline: 'prose'` get the beat count as a
hint, not the labels.

**Audio** — when `videoAudio !== 'off'` and dialect.audio is `native`: existing audio modifiers (voice, tone,
acoustics, mood, genre) are injected for video too, plus dialogue/SFX fields, formatted per dialect (quotes for Veo,
`Dialogue:` block for Sora, named-speaker lines for Kling, inline in the paragraph for LTX). When dialect.audio is `none`: the
audio block is dropped and the UI says the model is silent.

**Audio-only models** (the "conversation, actions, dialogue, narration" part) — new `audioType` values
"Dialogue scene" / "Narration" with a speaker-labelled script format `Speaker (delivery): "line"` + `[action/SFX]`
lines, adapted to each audio model's tag system (profiles at `modelProfiles.ts:347-490` already cover ElevenLabs v3
tags, Fish, music tag models). **Not yet researched per model** — ticket T-research first.

**Rewrite `VIDEO_MOTION_RULES`** — replace the blanket "no timestamps / no shot lists" with dialect-conditional
rules. The old rule exists because "Keyframe 2s" labels leaked into prompts; the new rule must say which labels are
allowed (only the dialect's), which preserves the original fix.

## 5. Risks (pressure-test)

- **Longer, structured prompts can hurt on some models** (Runway guidance is "short and direct"; Veo 3.1 clips of 4 s cannot hold a 5-beat timeline). Mitigation: `maxBeats` from duration (≈ one beat per 2–3 s), Short/Medium/Long selector still wins.
- **I2V identity lock needs the image described.** Reference images only reach the Gemini enhancer. On Ollama / llama.cpp / Anthropic the model cannot see the image, so the lock must come from the user's text. Verify before promising it.
- **Third-party sources.** Kling, Wan, Seedance rows are not vendor-verified. Mark them `verified: false` in the profile and re-check when the official pages are reachable.
- **Model churn.** Profile `updatedAt` is 2026-07-25; Sora 2 is listed as "sunset Sep 2026" in `constants/models.ts` — decide whether to keep its dialect.
- **Audio prompts can't be validated offline.** Everything here is verified by unit tests on the *prompt builder*, not by generating videos. Final check is a manual run on at least Veo, Sora and Kling.

## 6. Verdict

Workable with changes, high confidence on the format and the dialect approach, medium on per-vendor details (see table).
The sharpest tradeoff is using one template for all models: cheaper, but demonstrably wrong for at least three families.

## 7. Council review (2026-10-14)

Four reviewers (prompt-engineer, architect-reviewer, ux-researcher, qa-expert) read this plan and the code; tier-decide
ran the next-step decision (OpenRouter 402 → Claude fallback, so confidence is self-reported).

| Voice | Verdict | Confidence |
|---|---|---|
| prompt-engineer | workable-with-changes | ~0.7 |
| architect-reviewer | workable-with-changes | ~0.75 |
| ux-researcher | workable-with-changes | ~0.8 on placement |
| qa-expert | workable-with-changes | ~0.75 |
| tier-decide | "code now, ship dialects only for verified models" 0.63; single template acceptable: 0.15 | — |

Where they agreed and what changed in the plan:
1. **Timestamps are a dialect, not the default** (prompt-engineer). Section 2's template stays the *maximal* form; prose-with-beats is the default; a 4 s clip is one or two beats, so header/style are overhead there.
2. **I2V lock must not be invented** (prompt-engineer, architect). Existing rule `llmService.ts:95` strips static detail to avoid contradicting the pixels. Lock comes only from user text or a Gemini caption; otherwise "same subject as the reference image". Feasibility check moved early (V4).
3. **Code renders the skeleton, LLM fills beat text** (prompt-engineer, qa). Seven sections + conditional rules is too heavy for 7–8B local models and would reproduce the label leak the old rule fixed. Add a label-stripping post-check.
4. **Schema is over-built** (architect). Flat optional fields on `ModelProfile`, reuse `supportsNegativePrompt`, `maxBeats` lives in the V1 helper, only verified rows filled. A separate lookup table would add a second matcher beside `lookupModelProfile`.
5. **Hidden consumer sites** (architect): chip map, default-skip and tab filter in `RefinerPage.tsx`, three spots in `PromptAnalyzer.tsx`, unconditional audio injection at `llmService.ts:261-270`. Saved presets are backward-safe (optional fields).
6. **UI** (ux): audio lives in the Motion tab because the Audio tab is hidden for video (`RefinerPage.tsx:153-154`) and is mostly music-model controls; snap buttons for discrete durations; Sora shows the API value with a copy button; Native / Silent / Unknown badge; default 6 s, not 10; AUTO injects nothing.
7. **Verification** (qa): V7-equivalent can only be tested structurally; ship with a validator, recorded fixtures and a byte-for-byte legacy fallback. The "no Keyframe labels" fix has no regression test today, so this PR adds one.
8. **Ordering** (all): code first for the four verified rows, research in parallel, smoke clip before building audio.

Unresolved disagreement: ux wants a separate audio block, prompt-engineer wants dialogue next to the beat that speaks.
Resolution in V9: dialogue attached to its beat, ambience/music as one trailing line.

## 8. Build log (2026-10-14)

V1–V5 built. V4 result (read from `enhancePromptStream`, llmService.ts): reference images reach only `enhancePromptGeminiStream`;
the Ollama, llama.cpp and Anthropic paths get text only. So the I2V lock is written from the user's own wording, with
"same subject as the reference image" as the fallback, exactly as the council advised.
Deviation: Kling and Seedance were given the timestamp dialect from community sources (flagged in `modelProfiles.ts`),
because the owner's requested format is timestamped and no verified dialect produces it. Wan was not given a dialect:
its profile patterns (`wan video`) do not match the model names in `constants/models.ts` (`WAN 2.7`, `WAN 2.5`).
Known gaps: `cleanLLMResponse` strips leading `- ` bullets, so Sora's `Actions:` bullets arrive as plain lines.
Pre-existing: `llmService.ts:261-270` injects voice/tone/acoustics/mood for video when stale audio-mode values exist.

## 9. Research pass and dialect decisions (2026-10-14, later)

Four tier-sonnet agents (two researchers on video vendors, one on audio formats, one implementer for small gaps) ran in parallel.
tier-decide (OpenRouter 402 → Claude fallback) ruled on three contested calls:
Kling 3.0 keeps `timestamps` (0.60; vendor documents numbered "shot N," and 3–15 s, native audio, not timestamps);
Wan 2.7 gets `timestamps` (0.80; vendor documents `Shot 1 [0–3 seconds]`, 2–15 s); Runway/Luma/Pika dialect confidence was 0.45,
below the 0.6 threshold, so the call was made here: Luma `paragraph` (vendor: ~100 words, positive only, 5/10 s, no audio), Runway `paragraph`
(snippet only, flagged), Pika/Vidu/PixVerse unchanged.
Fixed on the way: bullets under `Actions:` survive `cleanLLMResponse`; Wan 2.x resolves to its own profile; Veo 2 is silent;
stale voice/tone/acoustics/mood no longer leak into non-audio prompts; **`udio` matched MMAudio, AudioLDM and AudioBox, so those
sound-effects models were classified as music — now a word-boundary match**.
Audio-only: Dialogue / Narration audio types now produce per-family script rules (tagged speech, speaker-id, one-voice-per-request).
