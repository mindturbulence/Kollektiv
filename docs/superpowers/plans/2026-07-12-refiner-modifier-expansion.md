# Refiner Modifier Expansion & Custom Options Persistence

**Date:** 2026-07-12
**Branch:** Dev-Assist
**Status:** Planned

## Context (verified)

- All Refiner dropdown options are hardcoded arrays in `constants/modifiers.ts` (~25 lists, ~450 entries total). Target AI model lists live in `constants/models.ts`.
- `components/RefinerModifierControls.tsx` renders the dropdowns per sub-tab (basic / styling / photography / motion / audio / platform) using `AutocompleteSelect`, which only commits values that exist in its options list (no free-text commit).
- Two lists are already disk-backed: artists and art styles load from `artists_cheatsheet.json` / `artstyles_cheatsheet.json` via `loadManifestSafe` + `fileSystemManager` (File System Access API writing to the user-selected data vault; `local_storage/` is the dev default). `refiner_presets_manifest.json` shows the write pattern (`services/refinerPresetService.ts`).
- `RefinerPage.buildModifierCatalog()` (RefinerPage.tsx:287) concatenates **every** list into the ENHANCER system prompt so the LLM can map refined-prompt values back to category keys in the JSON breakdown.
- `services/llmService.ts` `getModelSyntax()` gives per-model prompt rules; unknown models fall to media-aware defaults (added 2026-07-12).
- Known gaps found during exploration:
  - `CAMERA_MODELS_BY_TYPE` has **no entries** for `Action Camera`, `Drone / Aerial Camera`, `Smartphone Camera` (the type dropdown offers them; the model dropdown falls back to all pro bodies).
  - `MIDJOURNEY_VERSIONS` lacks `"7"` even though `TARGET_IMAGE_AI_MODELS` contains `Midjourney v7` — the platform tab can't emit `--v 7`.
  - `HiDream (Excellence)` sits in `TARGET_VIDEO_AI_MODELS`; HiDream-I1 is primarily a text-to-image family. Decide: move to image list or rename to `HiDream Video`.
  - `HAIR_STYLES` contains `' Bob Cut'` (leading space).

## Goals

1. Massively widen every modifier list with current (2025–2026) entries.
2. Refresh the target AI model lists (image/video/audio) and keep `getModelSyntax` + `getAudioMode` in sync.
3. Add missing modifier categories (music genre, instrumentation, vocal style, production era, time-of-day, weather, color grade).
4. Let users add their own entries to any list, persisted in the existing data-vault manifest system ("local storage" folder), following the `refiner_presets_manifest.json` pattern.
5. Keep the LLM modifier catalog token cost under control.

## Design decisions

**Defaults in code, user additions on disk.** Built-in lists stay in `constants/modifiers.ts` (they version with the app; no seeding/migration). ONE new manifest, `modifier_options_manifest.json`, stores only user deltas:

```json
{
  "version": 1,
  "custom": {
    "lighting": ["My Neon Rig"],
    "musicGenre": ["Balkan Brass Trap"],
    "aestheticLook": [{ "name": "My Look", "description": "..." }]
  }
}
```

Plain categories store strings; descriptive categories (`aestheticLook`, `digitalAesthetic`, `specialtyLens`, `motion`, `cameraMovement`) store `{name, description}`. Merge = builtin + custom, deduped case-insensitively; custom entries win on description conflicts.

**Category registry as single source of truth.** New `constants/modifierRegistry.ts`: an array of `{ key, label, kind: 'plain' | 'descriptive', media: 'all' | 'image' | 'video' | 'audio', options }`. `buildModifierCatalog`, the options service validation, and the merge layer iterate the registry instead of 25 hand-maintained lines. The dropdown UI stays hand-written (layout is bespoke per tab) but reads merged lists.

**Catalog filtered by media mode.** With ~3× larger lists plus new categories, an unfiltered catalog would balloon the ENHANCER system prompt to several thousand tokens per call. `buildModifierCatalog(mediaMode)` includes only registry entries whose `media` matches (`all` + the active mode). Audio mode drops all camera/photography lists; image mode drops motion/audio lists. This keeps the prompt near current size even after expansion.

**Storage safety.** Reuse `loadManifestSafe` + `ManifestWriteBlockedError` (writes blocked when the manifest exists but is unreadable). Service no-ops to empty custom lists when no data directory is selected — same behavior as `refinerPresetService`.

---

## Phase 1 — Expand built-in data (pure constants, zero behavior risk)

### 1a. `constants/modifiers.ts` expansions (approx. targets)

| List | Now | Target | Example additions |
|---|---|---|---|
| `LIGHTING_OPTIONS` | 14 | ~50 | Rembrandt, split, butterfly, clamshell, practicals-only, candlelight, moonlight, harsh direct flash, gobo patterns, caustics, north-window, tenebrism, UV/blacklight, sodium vapor, tungsten practicals, ring light, light through blinds, dappled forest light, underwater god rays, bioluminescent glow, overcast diffusion, mixed color temperature |
| `COMPOSITION_OPTIONS` | 9 | ~25 | Negative space, radial, triangular, dynamic symmetry, layered depth, foreground framing, isolation, pattern interruption, figure-to-ground, dead center minimal, off-center tension, spiral |
| `CAMERA_ANGLES` | 16 | ~22 | Aerial oblique, drone top-down 45°, mirror reflection angle, through-object POV, security-camera corner |
| `CAMERA_PROXIMITY` | 17 | ~20 | Detail shot, two-shot, crowd scale, aerial establishing |
| `CAMERA_SETTINGS` | 25 | ~35 | f/0.95 razor DOF, focus stacking, ND long exposure, intentional camera movement (ICM), zone focusing, push processing, halation bloom |
| `CAMERA_EFFECTS` | 23 | ~32 | Prism fractal, freelensing, lens whacking, anamorphic squeeze artifacts, CCD sensor bloom, datamosh smear, scanline CRT |
| `LENS_TYPES` | 8 | ~22 | 24mm environmental, 35mm documentary, 85mm f/1.2 portrait, 135mm compression, 600mm super-telephoto, probe lens, pinhole, MP-E ultra-macro, cine prime set, vintage uncoated glass, mirror/catadioptric donut bokeh |
| `FILM_TYPES` | 26 | ~34 | Kodak Vision3 motion picture, wet plate collodion, tintype, large format 8x10, half-frame, redscale, lomochrome purple |
| `ANALOG_FILM_STOCKS` | 13 | ~26 | Portra 800, Ektachrome E100, Pro 400H, Vision3 500T, Vision3 250D, Aerochrome IR, Fomapan 100, Kentmere 400, Delta 3200, Acros II, Ultramax 400, Phoenix 200 |
| `PHOTOGRAPHY_STYLES` | 12 | ~32 | Astro, underwater, sports action, concert, editorial, product, real estate, urbex, drone/aerial, photojournalism, fine art, boudoir, night street, seascape long exposure, birding, scientific/micro |
| `DIGITAL_AESTHETICS` | 32 | ~52 | Mob Wife, Tomato Girl, Office Siren, Eclectic Grandpa, Coastal Grandmother, Solarpunk, Fairycore, Gothcore, Kidcore, Blokecore, Acubi, Nostalgiacore, Corporate Memphis, Neo-Brutalist Web, Cyber Fairy Grunge, Whimsigoth, Coquette Academia, Brat Green |
| `AESTHETIC_LOOKS` | 42 | ~60 | Oppenheimer, Blade Runner 2049 (distinct), Poor Things, Saltburn, Severance, Andor, The Bear, Past Lives, Everything Everywhere, Furiosa, Fallout, Wednesday, Dune Part Two, The Batman, Sinners, K-drama soft look |
| `FACIAL_EXPRESSIONS` | 20 | ~28 | Awestruck, smug, gritted teeth, tearful smile, thousand-yard stare, mid-laugh candid, eyes closed serene |
| `HAIR_STYLES` | 20 | ~34 | Wolf cut, mullet, shag, butterfly cut, curtain bangs, box braids, space buns, finger waves, French bob, jellyfish cut, taper fade, twists, bantu knots (also fix `' Bob Cut'` leading space) |
| `EYE_COLORS` | 11 | ~14 | Sectoral heterochromia, red albino, black sclera (fantasy) |
| `SKIN_TEXTURES` | 28 | ~34 | Melasma, dermal piercings, henna patterns, metallic body paint, cracked porcelain (stylized) |
| `REALISM_OPTIONS` | 18 | ~24 | Smartphone snapshot realism, editorial retouch, medium-format digital clarity, film scan realism |
| `CLOTHING_STYLES` | 15 | ~30 | Y2K revival, gorpcore shell layers, dark academia knitwear, quiet luxury tailoring, K-fashion street, cyber-goth, western/cowboycore, regencycore, balletcore, utility workwear, festival wear, haute couture gown |
| `VIDEO_EFFECTS` | 16 | ~26 | Speed ramp, crash zoom punch-in, match-cut morph, seamless loop, datamosh, projector flicker, day-for-night grade, split diopter |
| `MOTION_OPTIONS` | 21 | ~30 | Parkour flow, cloth simulation billow, hair in wind, particle disintegration, growth time-lapse, ferrofluid morph, murmuration swarm |
| `CAMERA_MOVEMENT_OPTIONS` | 44 | ~52 | Robot-arm hyperspeed (Bolt cam), cable cam flythrough, gimbal low-mode run, periscope probe move, roll-locked FPV dive, step-printed handheld |
| `AUDIO_TYPES` | 8 | ~16 | ASMR, audiobook, meditation/sleep, jingle/sonic logo, trailer sound design, game SFX, loopable ambience, radio drama |
| `VOICE_GENDERS` | 5 | ~8 | Teen, deep androgynous, synthetic/AI neutral |
| `VOICE_TONES` | 10 | ~20 | Warm narrator, hushed documentary, hype announcer, deadpan, soothing ASMR, gravelly noir, corporate explainer, storyteller grandparent |
| `AUDIO_ENVIRONMENTS` | 10 | ~18 | Concert arena, parking garage, padded booth, cave system, open ocean, night forest, spaceship interior hum, vinyl room tone |
| `AUDIO_MOODS` | 8 | ~18 | Triumphant, ominous drone, bittersweet, nostalgic, playful whimsy, meditative, urgent breaking-news, romantic |
| `Z_IMAGE_STYLES` | 14 | ~18 | Editorial flash, CCTV still, risograph print, gouache illustration |
| `MIDJOURNEY_VERSIONS` | 6 | 7 | Add `"7"` at the head |

### 1b. `CAMERA_MODELS_BY_TYPE` — add the three missing types

- `Action Camera`: GoPro Hero 13 Black, DJI Osmo Action 5 Pro, Insta360 X4, Insta360 Ace Pro 2
- `Drone / Aerial Camera`: DJI Mavic 4 Pro, DJI Air 3S, DJI Mini 4 Pro, DJI Inspire 3, Freefly Alta X
- `Smartphone Camera`: iPhone 17 Pro Max, Samsung Galaxy S25 Ultra, Google Pixel 10 Pro, Xiaomi 15 Ultra
- Also refresh existing types: Sony A9 III, Nikon Z6 III, Canon EOS R1, Canon EOS R5 Mark II, Fujifilm X100VI, Fujifilm GFX100RF, Leica Q3, Pentax 17 (film)

### 1c. `constants/models.ts` — refresh target model lists

- **Image add:** Nano Banana Pro (Gemini), Seedream 4.0, Qwen-Image, Recraft V3, Lumina-Image 2.0. (Decide HiDream placement here.)
- **Video add:** Sora 2, Veo 3.1, Kling 2.5 Turbo, Wan 2.5, Seedance 1.0 Pro, Hailuo 02, LTX-2, Mochi 1 (Genmo), PixVerse V5.
- **Audio add:** Suno v5, ElevenLabs Music, Lyria 2 (Google), MiniMax Speech-02, Kokoro TTS, Qwen3-TTS, Fish Audio S1, ACE-Step (Music).
- **`getModelSyntax` sync (llmService.ts):** new branches for `seedream`, `qwen-image`, `nano banana`, `recraft`, `lumina`, `seedance`, `mochi`, `pixverse`, `lyria`, `kokoro`, `minimax speech`, `fish audio`, `ace-step`. Existing substring matches already cover Sora 2 / Veo 3.1 / Kling 2.5 / Wan 2.5 / Hailuo 02 / LTX-2 / Suno v5.
- **`getAudioMode` sync:** ensure `kokoro`, `fish audio`, `minimax speech` route to `speech`; `lyria`, `ace-step` fall through to `music` (default, no change needed) — verify with the existing node one-liner check.

**Verify:** `npx tsc --noEmit`; run the app, flip through all Refiner sub-tabs and each media mode; confirm `--v 7` emits from the platform tab.

---

## Phase 2 — New modifier categories

### 2a. New lists in `constants/modifiers.ts`

- `MUSIC_GENRES` (~60): synthwave, phonk, hyperpop, drum & bass, lo-fi hip hop, afrobeats, amapiano, city pop, shoegaze, post-rock, neo-soul, UK drill, reggaeton, cumbia, bossa nova, metalcore, djent, dark ambient, epic trailer orchestral, chiptune, jersey club, breakcore, gospel, bluegrass…
- `INSTRUMENTATION` (~40): analog synth pads, 808 sub-bass, live brass section, string quartet, nylon guitar, upright bass, modular sequences, taiko drums, hang drum, mellotron, theremin, gamelan…
- `VOCAL_STYLES` (~25): breathy female pop, gritty blues baritone, stacked choir harmonies, rapid rap flow, falsetto hook, operatic soprano, whisper-sung, vocoder/talkbox, autotuned melodic, spoken word, throat singing…
- `MUSIC_PRODUCTION_ERAS` (~20): 60s Motown mono, 70s analog funk, 80s gated-reverb synth-pop, 90s boom bap, Y2K maximalist pop, 2010s EDM festival, modern trap hi-fi, lo-fi cassette, audiophile binaural…
- `TIME_OF_DAY` (~12): pre-dawn blue, sunrise, harsh noon, golden hour, dusk, blue hour, neon night, overcast midday, midnight moonlit…
- `WEATHER_OPTIONS` (~16): light drizzle, downpour, fog bank, snowfall, blizzard, heat haze, sandstorm, lightning storm, rainbow after rain, morning mist, hail…
- `COLOR_GRADES` (~20): teal & orange blockbuster, bleach bypass, day-for-night, Kodak 2383 print emulation, pastel wash, high-key commercial, desaturated Nordic, sepia archive, cross-processed, infrared false color…

### 2b. Wiring (each new category touches all four points)

1. `types.ts` `PromptModifiers`: add `musicGenre`, `instrumentation`, `vocalStyle`, `productionEra`, `timeOfDay`, `weather`, `colorGrade`.
2. `RefinerModifierControls.tsx`: audio tab gets Genre / Instrumentation / Vocal Style / Production Era selects; photography tab gets Time of Day / Weather / Color Grade (also shown for video via the styling tab — decide placement during implementation, keep to existing layout idiom).
3. `llmService.ts` `buildContextForEnhancer`: emit lines for each (music fields only when `isAudio`).
4. Catalog: registry entries (Phase 3 registry) with `media: 'audio'` / `'all'` respectively.

**Verify:** typecheck; enhance one audio prompt (Suno target) and confirm genre/vocal lines appear in the generated context; enhance one image prompt and confirm no audio fields leak.

---

## Phase 3 — Custom options persisted to the data vault

### 3a. `constants/modifierRegistry.ts`

`MODIFIER_CATEGORIES: { key; label; kind: 'plain' | 'descriptive'; media: 'all'|'image'|'video'|'audio'; options }[]` covering every dropdown-backed category (artists/artStyles stay on their own cheatsheet manifests). Rewrite `buildModifierCatalog(mediaMode)` to iterate the registry with media filtering (token-bloat mitigation).

### 3b. `services/modifierOptionsService.ts`

Clone of `refinerPresetService` shape:
- `loadCustomOptions(): Promise<CustomOptionsMap>` — via `loadManifestSafe`, validates against registry keys, returns `{}` when no vault selected.
- `addCustomOption(key, entry)` / `removeCustomOption(key, name)` — guarded by `safeToSave`, writes `modifier_options_manifest.json`.
- `mergeOptions(builtin, custom)` — case-insensitive dedupe, custom description wins.
- Ship an empty `local_storage/modifier_options_manifest.json` template alongside the existing manifests.

### 3c. UI

- `AutocompleteSelect`: new optional prop `onAddCustom?: (typed: string) => void`. When set and the search query has no exact match, render an `ADD "<query>"` row at the top of the dropdown; selecting it commits the value and fires the callback.
- `RefinerPage`: load custom map on mount (next to artists/artStyles), build merged lists once (`useMemo` over registry + custom), pass merged lists into `RefinerModifierControls`, and pass merged lists into `buildModifierCatalog` so the LLM breakdown can map custom values back to category keys.
- Custom values already flow through presets and prompts as raw strings, so existing `refiner_presets_manifest.json` data stays compatible with zero migration.

### 3d. Test

One `modifierOptionsService.test.ts` following `manifestStore.test.ts` (injectable fs): round-trip add/load, invalid-manifest write block, merge dedupe.

**Verify:** typecheck + test; in-app: add a custom lighting entry, reload, confirm it persists, select it, run an enhance, confirm it appears in the breakdown mapping.

---

## Phase 4 (optional, later)

- Manage-my-options modal (list/delete custom entries per category; hide built-ins via a `hidden` map in the same manifest).
- Import/export of the options manifest.
- Generate the dropdown UI from the registry (larger refactor; only if tab layouts converge).

## Risks & mitigations

- **System-prompt token bloat:** mitigated by media-mode catalog filtering (Phase 3a); measure catalog size before/after with a simple char count and keep it within ~1.5× current.
- **Vault not selected:** service returns empty customs; UI add-affordance surfaces the existing "select data directory" error path, same as presets.
- **Corrupt manifest:** `loadManifestSafe` blocks writes (`ManifestWriteBlockedError`) — no user data loss.
- **Model-name drift:** every added target model must either hit a `getModelSyntax` substring or intentionally use the media-aware fallback; the Phase 1 node one-liner check enumerates all lists against both routers.
