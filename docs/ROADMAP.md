# Kollektiv — Pre-Monetization Roadmap (Future Iteration Notes)

> Working note, 2026-07-18. Premise: the app is **not monetizable yet**. Before any pricing/packaging work, the goal is to resolve structural weaknesses, enrich the feature set, and polish the UI until the app feels like a finished product to a stranger, not just to its author. Sequenced for a solo developer — each phase is shippable on its own.

Companion doc: [ARCHITECTURE.md](ARCHITECTURE.md) describes the system as it is; this file describes where it should go next.

---

## Phase 0 — Stop the bleeding (foundation debt)

Small, verified problems that undermine everything built on top. Do these first; none are glamorous, all are cheap.

- [ ] **Fix the production server branch.** `server.ts` `NODE_ENV=production` path uses `app.get('*')`, which Express 5 + path-to-regexp 8 reject. Replace with `app.use()` fallback or a named wildcard. Until then the "production" story is `vite preview` only.
- [ ] **Split `App.tsx`.** ~1,200 lines doing boot, idle, audio, music, navigation, layout, and event-bus wiring. Extract at minimum: `useIdleSystem`, `useAmbientMusic`, `useBootSequence`, and the `InitialLoader` into their own files. No behavior change — this is prep so later features don't keep landing in one file.
- [ ] **Raise the test floor.** Vitest exists and covers a few pure modules (`assistantProtocol`, storage utils). Add tests for the highest-risk pure logic that has none: `llmService` (`cleanLLMResponse`, `stripReasoningTags`, `buildContextForEnhancer`, `buildMidjourneyParams`) and `settingsStorage` migration/defaults. Add one Playwright smoke test (boot with OPFS-stubbed picker → dashboard renders) so refactors have a canary.
- [ ] **Security trims** (these matter even pre-revenue — they're trust bugs):
  - Gate `send_gmail` / `delete_gmail` assistant tools behind an explicit per-action confirmation UI, or remove them. An 8-round autonomous tool loop with delete-email capability is liability, not a feature.
  - Constrain `/proxy-remote`: it forwards requests with auth headers to any `x-target-url`. At minimum, maintain an allowlist derived from configured provider URLs in settings.
  - Put a visible "assistant is controlling browser" indicator + kill switch on the CDP path (partially exists via `ScreenControlOverlay` — verify coverage for external Chrome control).
- [ ] **De-hardcode drift-prone strings.** The Anthropic fallback model (`claude-3-7-sonnet-20250219` in `server.ts`) and similar defaults belong in one constants module shared by client and server.

## Phase 1 — Robustness & first-run experience

The app currently assumes a patient, technical user. Monetizable software survives an impatient stranger.

- [ ] **Onboarding rework.** The File System Access folder-picker gate is the #1 abandonment point. Add: a clear explainer screen (what the folder is, what gets written), a "try without a vault" demo mode using OPFS (`navigator.storage.getDirectory()` — the stub already proves this works), and graceful messaging on non-Chromium browsers instead of a dead end.
- [ ] **Error UX pass.** Three error boundaries exist but downstream failures (provider offline, key invalid, quota) surface inconsistently. Standardize on one toast/panel pattern with a "what to do next" line — the friendly messages in the server proxies are the model; bring the client up to that standard.
- [ ] **Settings resilience.** `kollektivSettingsV4` is one big object; a single malformed write can wedge boot (the RESET_ALL_STORAGE overlay is the current answer). Add versioned migration + validation on load with per-section fallback to defaults, instead of all-or-nothing reset.
- [ ] **Vault integrity visibility.** `verifyAndRepairFiles` runs silently at boot. Surface a report (files scanned/repaired/orphaned) in Settings so users trust the vault with real work.

## Phase 2 — Feature enrichment (the moat)

Ranked by how much they compound the app's existing strengths. The differentiator is the per-architecture prompt intelligence + local vault — feed those.

1. [ ] **Close the generate loop.** Refine → generate (Tensor Art / Imagen / Veo hooks already exist) → auto-ingest result into the gallery with prompt, model, and params as sidecar metadata → one-click "compare against previous attempt" in ImageCompare → re-refine. Right now Kollektiv is a great *before* and *after* tool; owning the middle is the single biggest product upgrade.
2. [ ] **Extract the model registry to data.** `getModelSyntax()` in `llmService.ts` hardcodes ~50 architecture profiles in TypeScript. Move to a versioned JSON/data module with a schema (name, match patterns, format, rules, media type, modes). Enables: updating for new model releases without code changes, user-added custom profiles, and — later — shipping profile updates as a service. This is the future monetization hook, built now as pure refactor.
3. [ ] **ComfyUI / A1111 bridge.** The pro local-generation audience lives there. A thin API client (queue prompt, poll, fetch image) that ingests into the vault would matter more to that audience than any additional cloud provider.
4. [ ] **Gallery intelligence.** `hash-wasm` is already a dependency — add duplicate detection on import. Add prompt-similarity search over the library (local embedding or plain trigram matching to stay offline-friendly), and batch tagging via the existing abstractor.
5. [ ] **Assistant memory that compounds.** `remember`/`list_memories`/`forget` tools exist; make memory automatic and useful: learned style preferences ("user prefers 35mm, natural light") injected into refiner context, with a visible/editable memory panel.
6. [ ] **Prompt lineage as a first-class view.** `PromptVersionNode` + `LineageGraph` exist — promote lineage to the library UI (tree view, diff between versions via existing `diffUtils`, "restore this branch"). Version history is a retention feature.

## Phase 3 — UI polish

The aesthetic is distinctive; the gap is consistency and comfort, not more spectacle.

- [ ] **Consistency audit.** One pass over all 17 pages for: spacing scale, button variants (`form-btn` usage varies), empty states (every list needs one), and loading states (standardize on one skeleton/spinner pattern instead of per-page improvisation).
- [ ] **Motion discipline.** Honor `prefers-reduced-motion` deliberately (currently headless/reduced-motion environments bypass animations by accident, not design). Give the boot sequence a "skip" affordance — the 2.5s logo fill is delightful once and friction daily.
- [ ] **Command palette (Ctrl+K).** Navigation + actions (save prompt, toggle panels, switch theme). Cheap to build over the existing `appEventBus`/`navigate` infrastructure, and it makes a dense app feel fast.
- [ ] **Performance pass on the gallery.** Verify masonry behavior at 1k+ items; virtualize if it degrades. Object-URL lifecycle is already managed (`useObjectUrls`) — confirm no leaks on rapid category switching.
- [ ] **Keyboard & accessibility basics.** Focus states on the custom-cursor UI, escape-to-close on all modals/panels, alt text plumbing for gallery items. Not a WCAG project — just the basics that make the app feel engineered.
- [ ] **Font loading hygiene.** `index.html` pulls fonts from three third-party CDNs including onlinewebfonts (availability + privacy risk). Self-host the actual subset used in `public/fonts` (some already exist there).

## Explicit non-goals (for this phase)

- No payments, licensing, or account system.
- No new LLM providers (six is plenty — depth over breadth).
- No mobile.
- No custom image-model training.
- Desktop packaging (Tauri/Electron) is **deferred, not rejected** — decide after Phase 1, because it changes the onboarding/security answers. If Phase 1's browser onboarding still feels fragile, that's the signal to package.

## Definition of "ready to think about money"

All boxes below true:

1. A stranger on a fresh machine reaches a working dashboard in under 3 minutes without help.
2. `pnpm lint && pnpm test` green in CI, plus one E2E smoke test.
3. No assistant tool can perform a destructive external action without explicit confirmation.
4. The generate→ingest→compare loop works end-to-end with at least one provider.
5. Model registry lives in data, updated at least once for a newly released model (proves the update path).
6. Consistency audit done; every page has empty/loading/error states.

When these hold, revisit the monetization options (model-intelligence subscription, team vault sync) — not before.
