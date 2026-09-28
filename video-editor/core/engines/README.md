# core/engines (v2)

Standalone pixel/time engines — nothing imports these yet. All functions are
pure: they take plain data in, mutate/return it, and own no state.

- `speed.ts` — `sourceTimeAt(params, localTime)` maps a clip's timeline-local
  time to source time (constant speed, reverse, freeze frames, speed
  ramps). `timelineDurationFor(sourceDuration, speed, keyframes?)` is its
  inverse for duration. `SpeedParams` is a small params type, not `Clip`.
- `color-grading.ts` — `applyColorGrading(imageData, grading)` runs
  lift/gamma/gain wheels, then curves, then HSL bands over an `ImageData`.
- `chroma-key.ts` — `applyChromaKey(imageData, settings)` keys against
  `settings.keyColor`, writing alpha and suppressing spill, in place.

## How playback/render should call these later

Model each as an `Effect` (`core/types.ts`) on a `Clip`, keyed by `type`:

- `{ type: 'colorGrade', params: { wheels, curves, hsl } as ColorGrading, enabled }`
- `{ type: 'chromaKey', params: settings as ChromaKeySettings, enabled }`

`Effect.params` is `Record<string, number | string | boolean>`, so the
render module reading these effects should store the nested `ColorGrading`/
`ChromaKeySettings` shape as a single JSON-serializable value under one key
(e.g. `params.value`), not spread across the flat record — the flat record
is fine for scalar effects (brightness, blur) but wheels/curves/HSL are
nested objects. Speed lives on `Clip.speed` already; `speed.ts` is for the
render/playback module resolving that into a source time per frame, not an
`Effect`.
