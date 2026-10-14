# Kollektiv — Remaining Tasks

Single backlog of open work, cleaned 2026-10-12: finished items and the finished feature plans (Image Editor
Looks, Asset Manager context menu / DnD / toolbar, Web Design Library, Clone a website) were removed — their
durable records live in the [handbook](../handbook/README.md); the plans themselves are in git history at
commit `1bff4895` (`docs/plans/`). Earlier plans: commit `3bc6f65`. Open items of `docs/ISSUES.md` are in § 7.

Legend: **S** small · **M** medium · **L** large. Delete an item once it is done; delete a section when empty.

---

## 1. Image Editor

- [ ] **Tiled look export** for GPUs whose `MAX_TEXTURE_SIZE` < 8192 (Jev 0.41 then 0.36 → Claude's call: wait for a real low-end GPU; the editor caps images at 8192 and desktop GPUs report 16384; needs a test hook to verify here). **M**
- [ ] **Looks v2**: Gallery batch-apply, full float document pipeline, 16-bit PNG/TIFF export, high-quality grain on export, skin-tone isolation. **L**
- [ ] **Optional: CC0 texture scans** (paper/dust/light-leak photos from ambientCG-style CC0 sources, listed in `public/looks/LICENSES.md`) if the procedural textures feel too clean. **S**

## 2. Assets Manager (Utilities → `assets_manager`)

Constraints for what is left: AI only through the server Gemini proxy (never port ImageGallery's
`geminiService.ts`); use the shared `Modal` / `AskDialog`, never `window.confirm`.

- [ ] Human review of the Foundation phase — **owner**. (Built on anyway at the owner's request, 2026-09-29.)
- [ ] Destructive-op UX review after T13–T16 (plan checkpoint) — **owner**.
- [ ] **T18 AI captions** (batch queue, resumable, no key → manual workflow unaffected). **M** — needs a live AI key to build/verify.
- [ ] **T19 Auto-tagging** (vision → keywords, dedupe merge). **M** — needs a live AI key.
- Open question: is a slideshow wanted? (Not built — only if you want it.)

## 3. App-wide

- [ ] V12 phone width (390 px) — deferred by design (desktop-first). **L**

## 4. Home

- [ ] Optional Phase 2: a week of local-only counts of Home entries by source (boot, logo, ⌘1, palette); if purposeful entries ≈ 0, logo → last-used page and Home becomes first-run only. **S**
- [ ] Decide: "Recent" = recently added (current) or recently opened/edited (needs per-item tracking)? **S**

## 5. Video Editor

- [ ] Make WebGPU the preview renderer — **waits until a GPU-only effect or transition is exposed in the UI**. Checked 2026-09-29: the UI only offers color grade, chroma key and crossfade, which the WebGPU renderer runs on the same CPU/Canvas2D paths, so switching adds readbacks and risk for no visible gain (Jev: defer 0.97). **M**

## 6. Converter (deferred ideas)

- [ ] Long-form / >60 s 1080p video: server-side ffmpeg via `server.ts` (single-thread wasm is impractical). **L**

## 7. Manual tests and external-service issues (from `docs/ISSUES.md`)

Procedures and details are in [ISSUES.md](../ISSUES.md). Deferred by the owner on 2026-09-28 (need live accounts/network). Remove an item here and in ISSUES.md once it's resolved.

- [ ] **ISSUE-1** Spotify connect end-to-end from a clean checkout (needs a Spotify Developer app).
- [ ] **ISSUE-2** Google silent refresh — re-run after the ISSUE-44 fix: Test A (forced expiry refreshes silently), Test B (revocation offers reconnect).
- [ ] **ISSUE-11** Source-aware research answers — walk the checklist (ISSUE-9's run already produced a cited answer).
- [ ] **ISSUE-30** Production CSP: verify live voice, Spotify, YouTube search, local Ollama/llama.cpp, Google Sign-In under Report-Only, then switch `security.ts` to enforcing and re-verify.
- [ ] **ISSUE-42** YouTube transcript tool fails (empty caption body / UNPLAYABLE) — re-verify from a residential network; if still failing it needs a PO-token-capable path. Reddit 403 from datacenter IPs is expected.
- [ ] **ISSUE-12 follow-up** — description strengthened 2026-09-30; if the assistant still answers "noted" without calling `append_findings`, add a nudge in `buildSystemIdentity`. (Needs live use to tell.)
- [ ] **ISSUE-47 residuals** — only `mcp_call`/`persistence`/`fallback` still throw "not implemented" (the planner never emits them — build when a plan needs one).

## 8. Web Design Library (Vault → Web Design) — owner verification

Shipped (WDL-01..17, SD-01..10, CL-1..4; handbook: [WEB_DESIGN_LIBRARY.md](../handbook/docs/12_WEB_DESIGN_LIBRARY/WEB_DESIGN_LIBRARY.md)).
Every item passed lint + unit tests only; nothing below could be tested without you.

- [ ] **Browser walk** of Vault → Web Design — mostly done 2026-10-06/07 with the built app and an OPFS-backed vault (picker stubbed). **Still open (needs you or a quiet machine):** a finished real extraction (GPU-backed vision model, or a Gemini/Anthropic/OpenRouter key; `qwen3-vl:2b` CPU-only had not finished after 10+ minutes), saving edits in the detail editor, Settings → Web Design tab and the Manage collections modal, the REAL folder picker + clipboard + ZIP download, the Import-from-site row (needs your server on 7500), other app themes (pipboy, Vanguard, arwes) inside the paper scope.
- [ ] **Real extraction calls** — "Extract from screens" with Gemini, Ollama (vision model), Anthropic and OpenRouter (explicit vision model). All provider paths are mocked. Watch: Gemini default model with `thinkingBudget: 0`; Ollama `num_ctx` 32768 on a small GPU; a text-only Ollama model silently ignoring images (`/api/show` `capabilities` pre-check fails fast; an older Ollama without that field still proceeds).
- [ ] **Real Clone run (CL-2/CL-3)** — restart the server (new `POST /api/clone-site` route), clone two public sites with a vision provider set and confirm zero "missing" badges; export the Clone ZIP and run it with Claude Code side by side against the JCodesMore template.
- [ ] **Real export** — Use recipe → pick a project folder (Chromium folder picker), overwrite flow, clipboard copy, and the ZIP fallback; then paste the prompt into Claude Code and Codex. Codex was never run (not installed here); the WDL-05 spike used Claude only.
- [ ] **Real Google Drive pull** (WDL-16): clean-folder pull with and without gallery items; confirm `prompts/*.txt` and `design-library/` come back; note the Drive-mode behaviour change (the gallery manifest is now written locally).
- [ ] **e2e run** (needs the browser harness): `footer.verify` lists `design_library`; `settings.spec.ts` checks all 6 main tabs incl. WEB DESIGN (not run).
- [ ] **Quality caveats from WDL-05** (n=1 per arm, Sonnet only): re-run `scripts/design-spike/` with Gemini/Codex when available; the recipe prompt also carries the anti-generic rules and the control did not, so part of the gain may come from those rules.
- [ ] **Decide:** hook for automatic tier routing (`.claude/hooks/tier-router.mjs` exists but is not registered; the global Jev router is ON and would suppress it); delete `scripts/design-spike/` and the empty `/tmp/s` a spike builder left in Git Bash's temp dir. Also **rotate the beatapi.io key** that was pasted into the chat, and add OpenRouter credits (the Jev route returns HTTP 402) or store the beatapi key from your own terminal so `tier-decide` can use it.
- [ ] **Security residual — decide:** `authRateLimiter` skips loopback, which is what keeps local chat usable (10 requests / 15 min otherwise); it only matters if the server sits behind a reverse proxy on a non-loopback HOST. Also: plain `fetch` re-resolves DNS after the SSRF check in `scrapeUrl` (a rebinding host can race it); `isDisallowedAddress` does no DNS lookup for names (RSS, `/proxy-remote`); 100.64/10 (Tailscale) is now refused by `/proxy-remote` and RSS.
- Known small gaps: empty `design-library/<id>/` folders remain after delete (no directory-removal API); export clears `design/refs/*` before writing (failure mid-write leaves a partial export); thumbnails all load on mount (add IntersectionObserver past a few hundred recipes); collection-delete dialog counts are a snapshot from when Manage opened; Import-from-site first capture after boot may time out once.

## 9. AI Assistant improvements

Built 2026-10-13 (push-to-talk, spoken confirmation gate, tool-result strip, reminders, page context; see
[VOICE_PIPELINE.md](../handbook/docs/06_VOICE/VOICE_PIPELINE.md) and [AI_ENGINE.md](../handbook/docs/01_AI_ENGINE/AI_ENGINE.md)).
Verified by lint + unit tests only; nothing voice-related has been run live. Ideas deliberately not built
(always-on wake word, more top-level tools) are parked in [NOTES.md](../NOTES.md).

- [ ] **Live voice walk** (needs you + a voice key): push-to-talk on each of Gemini Live / OpenAI Realtime / ElevenLabs (hold = talks, release ends the turn, alt-tab mid-hold closes the mic); then the spoken confirmation — "delete that gallery item" → the assistant asks → "yes" executes, "no" does not. **Echo test first**: without headphones the assistant's own question may be transcribed as your answer. Also confirm OpenAI Realtime really emits `conversation.item.created` with `role: 'user'` (the gate relies on it) and that ElevenLabs `onMessage` delivers both roles.
- [ ] **Selected-item context** — the assistant now knows the *page* (`get_current_page`), not the selected prompt/image. Needs each page to publish its selection to `utils/assistantContext.ts`; build only if "refine this" proves awkward in practice. **M**
- [ ] **Undo for tool results** — the Activity footer shows what ran (`assistantToolResult`) but offers no undo. **M**
- [ ] **Reminders only fire while the app is open** (in-app toast; missed ones show on next boot). True background delivery needs a service worker / Notification permission. **M** — only if wanted.

## 10. Video "Director's Script" format + duration + audio direction

Plan, sources and council findings: [2026-10-14-video-director-format.md](2026-10-14-video-director-format.md) § 7.
Revised 2026-10-14 after the council. Order is the build order (small → large); each ticket ships alone.
Built 2026-10-14: V1–V5, V7–V11 (every video model now gets the Director's Script; timestamps is the default dialect, Sora/LTX/Veo/Hailuo differ) (`utils/videoDirector.ts`, flat video fields on `ModelProfile`, `llmService.ts` dialect rules). Verified by unit tests only; no real clip generated yet (V6). Kling and Seedance run the timestamp dialect from community sources until V10. Not done from V3: `PromptAnalyzer` field maps (it extracts descriptors from existing prompts; duration is not one). Veo 2 is silent but shares the Veo profile, so V8 must special-case it.

- [ ] **V6 · Smoke generation** (needs you + a key): one model, one T2V and one I2V clip, to validate the format before building audio. **S**
- [ ] **V12 · Full manual walk**: Veo, Sora, Kling, LTX at 4/8/12 s, T2V and I2V, audio on/off; judge timing, lip-sync, silent-model handling. **M**
- [ ] **V13 · Still unverified (retry in a real browser, `/browse`)**: Runway help-centre prompting guides (403), Seedance 2.0 BytePlus guide (JS-rendered), Kling API reference pages, Vidu (expired cert), SkyReels (DNS), Pika 2.x durations, PixVerse. Pika / Vidu / PixVerse / Higgsfield / SkyReels use the default timestamp dialect with no durations or audio flag until then. **S**
- [ ] **V14 · Audio-only follow-ups**: VibeVoice `Speaker N:` label, Fish multi-speaker syntax, MiniMax prose delivery and OpenAI tts-1 `instructions` are unverified; the Dialogue/Narration rules assume them. Gemini TTS, Dia and Qwen3-TTS have no profile. `audioType` is still injected ungated in `buildContextForEnhancer`. **S**

## 11. Video production node canvas (Weave-style) — node-first

Plan, research and council debate: [2026-10-14-video-canvas.md](2026-10-14-video-canvas.md) (§ 10 records the node-first decision).
Owner decision 2026-10-14: build the node canvas directly, not a board first. Small → large; each ticket ships alone.
Built 2026-10-14: N4–N7 (canvas page, Send to canvas button; canvas page, nodes, inspector, per-beat re-refine, edited-script policy); N1–N3 (`utils/shotScript.ts`, `refiner-canvas/core/`: graph store, undo, persistence, executor; unit-tested, no UI; IndexedDB code itself untested, only the in-memory adapter). Real-clip validation (§ 10 V6 / V12) runs in parallel instead of blocking; the council advised blocking, the owner chose otherwise.

- [ ] **N8 · Generate + Result nodes**: Generate runs `generateWithVeo` where it works, output through the existing asset path (no second store); every other model shows "Copy prompt". **M**
- [ ] **N9 · Assemble node → Video Editor**: collect Result nodes in order and call `openInVideoEditor`. **M**
- [ ] **N10 · Reusable workflows**: save a graph as a template, load onto new inputs (Weave's "reuse on different inputs"); simplified run-only view later. **M**
- [ ] **N11 · Multi-shot "Storyboard" node**: concept → N shot nodes in one structured LLM call, each within the model's max length, sharing the preset prefix. Verify cross-shot consistency first. **L**
- [ ] **N12 · Hardening**: keyboard, a11y, memoised nodes, `onlyRenderVisibleElements`, 100-node performance check, touch. **M**
