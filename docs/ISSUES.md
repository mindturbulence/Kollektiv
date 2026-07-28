# Kollektiv — Issues & Changelog

All issues resolved as of **2026-07-25**. This file now serves as:
1. Tracker for remaining open manual tests (with step-by-step procedures)
2. Changelog of all resolved issues (compact)
3. Reference to [architecture handbook](handbook/README.md) for design docs

---

## Critical Historical Notes

These decisions are permanent — do not re-litigate without the user asking first.

- **ISSUE-22 — send_gmail/delete_gmail confirmation gate: ⛔ REVERTED (user decision, 2026-07-24).** The user considers Google OAuth consent sufficient permission and does not want per-action confirmation prompts. The `confirmSensitiveAction` helper and all call sites were removed. **Do not re-add without explicit user request.**
- **ISSUE-6 — Old `OBSIDIAN_API_KEY` is exposed in git history.** The key was rotated. The old `OBSIDIAN_API_KEY` path was fully retired in favor of `OBSIDIAN_VAULT_PATH` (direct vault folder access via `kollektivMcp.ts`). **Re-verified 2026-07-27: `OBSIDIAN_API_KEY` appears in zero `.ts`/`.tsx`/`.json` files — docs only.** The app does not read it. Nothing to rotate, nothing to test; the stale "rotate the key" manual test was deleted. Setting `OBSIDIAN_VAULT_PATH` is the whole configuration.

---

## Open Manual Tests

These items are **code-fixed** but need manual verification. Run with `pnpm build && pnpm preview` or `pnpm dev` in a real browser (Chrome recommended).

### Closed 2026-07-27 — the four "quick win" tests, all verified

None of these need external accounts (ISSUE-9/12 used the local `GEMINI_API_KEY`). Kept here with
their evidence rather than folded into the changelog, since the procedures are what a future pass
would repeat.

**ISSUE-9 — Research chat flow** ✅ **PASS 2026-07-27 (live Gemini)**
Driven against the production build (`vite preview`, Gemini 3 Flash, real API key) with the OPFS
picker stub: created a project, uploaded a markdown source containing a fact no model could know
("the reactor sustains exactly 4,412 kelvin during phase-three ignition"), asked for it in the
middle-column chat. Reply: **`4,412 [1].`** with a rendered citation footer
(`Sources — [1] Kollektiv Research Source, Reactor Notes`). Real answer, no placeholder, and the
content proves it came from the uploaded source. That incidentally satisfies **ISSUE-11**
(source-aware answers with citations) on the same run — left open there only because ISSUE-11's
own checklist wasn't walked step-by-step.

**ISSUE-10 — Findings dedup** ✅ **VERIFIED 2026-07-27 (automated)**
Closed by `services/researchVaultService.test.ts` (5 tests) rather than a browser walk: the
save/append path is deterministic logic that takes its file manager as a parameter, so an
in-memory fake exercises the real `researchVault.findings` implementation directly. Three
consecutive `save()` calls leave exactly one copy of the final text; `append()` still preserves
prior content with a `---` separator; a `save()` after appends collapses the file to just the
saved text. `LocalFileSystemManager.saveFile` uses `createWritable()` (truncating by default),
which is what makes the overwrite real at the storage layer.

**ISSUE-12 — Assistant append_findings** ✅ **PASS 2026-07-27 (live Gemini)**
Same session as ISSUE-9. Asked mid-conversation: *"Note down that the key finding is that ignition
temperature is confirmed."* The Findings panel updated without a UI save click, and reading OPFS
directly confirmed `research-projects/reactor-study/findings.md` = `"The key finding is that
ignition temperature is confirmed."` — so the tool really wrote the file, the
`research:findingsAppended` event fired, and the panel re-read it.

⚠️ **Model-behaviour caveat, not a code defect:** on an earlier attempt with the same prompt the
assistant answered *"OK. I've noted that…"* conversationally and the Findings panel stayed empty
for the full 2-minute poll — Gemini apparently answered without invoking the tool. The tool path
itself is proven correct (this run, plus `researchVaultService.test.ts`). If it recurs often,
the fix is a stronger `append_findings` description or an explicit nudge in `buildSystemIdentity`,
not a change to the vault code.

**ISSUE-21 — e2e headed smoke test** ✅ **PASS 2026-07-27** — `npx playwright test e2e/smoke.spec.ts
--headed` → **2 passed, exit 0**. Getting there required fixing two real app defects (ISSUE-45,
below) plus two stale assumptions in the test itself:

- `bootToAppShell` clicked the storage gate and then expected the boot loader, but ISSUE-24.1
  turned that screen into a 3-step wizard (storage → PROVISION → finish splash). The helper now
  walks all three. The provider step's CONTINUE button shares an accessible name with the
  loader's, so the helper waits on the PROVISION heading to tell them apart.
- The second test drove `WebViewerPanel`, which the All-Purpose Panel work deleted — the header
  has no "Web Browser" button any more. Retargeted at the panel that replaced it: header
  "Clipboard" → `ClippingPanel` → "Close panel" button visible.

### External-service tests (need live accounts)

**ISSUE-1 — Spotify connect E2E**
Prerequisites: A Spotify Developer app with Client ID, running on a URL the Spotify redirect_uri allows.

- [ ] 1. Start the app from a **clean checkout** (`git clone`, `pnpm install`)
- [ ] 2. Navigate to Settings > Integrations > Spotify
- [ ] 3. Enter your Spotify Client ID and click Connect
- [ ] 4. Complete the Spotify OAuth consent screen in the popup
- [ ] 5. After the popup closes, confirm the Spotify status shows "Connected"
- [ ] 6. Use a Spotify tool or feature to confirm the token works
- [ ] **Pass if:** Spotify connects end-to-end from a clean checkout

**ISSUE-2 — Google silent refresh** ❌ **FAILED 2026-07-27 (revoke path) — root cause found, see ISSUE-44**
Prerequisites: A Google OAuth Client ID configured, Gmail API enabled.

The old step 2 ("wait for the token to expire **or manually revoke it**") conflated two different
things. Revocation is not expiry: `prompt: ''` silent refresh cannot survive a revoked grant by
design — Google requires fresh consent. The two cases need separate tests.

*Test A — genuine expiry (the actual silent-refresh path):*
- [ ] 1. Connect a Google account with Gmail scope
- [ ] 2. In DevTools, edit the stored settings blob in `localStorage` and set
      `googleIdentity.expiresAt` to a past timestamp (e.g. `1`). Do **not** revoke at Google.
- [ ] 3. Trigger a Gmail assistant tool (`read_gmail`, `send_gmail`, …)
- [ ] 4. Confirm the tool succeeds **without** a full Google re-consent popup
- [ ] **Pass if:** `trySilentRefreshWithWait` → GSI → poll returns a fresh token within ~5s

*Test B — revocation (recovery, not silent refresh):*
- [ ] 1. Connect a Google account, then revoke Kollektiv's access at myaccount.google.com
- [ ] 2. Trigger a Gmail assistant tool — it should report a 401 / session-expired error
- [ ] 3. Open Settings > Integrations > Google Cloud
- [ ] 4. Confirm the panel shows **AUTHENTICATE WITH GOOGLE** (not the ACTIVE profile card)
- [ ] 5. Click it, complete consent, confirm Gmail tools work again
- [ ] **Pass if:** The app detects the dead token itself and offers reconnect without the user
      first having to click "Revoke Access" manually

**ISSUE-11 — Source-aware answers**
Prerequisites: A research project with at least one source file added and readable.

- [ ] 1. Add a source file to a research project (e.g., a markdown note with specific content)
- [ ] 2. Open the research chat
- [ ] 3. Ask a question about the source's content: *"What does the source say about X?"*
- [ ] 4. Confirm the answer references the source content specifically
- [ ] 5. Confirm citation footers appear in the reply (e.g., `[1]`, `[2]`)
- [ ] **Pass if:** Answers demonstrably use added source content with citations

**ISSUE-30 — Finalize production CSP (drop Report-Only)**
Prerequisites: A real production deploy (`pnpm build && pnpm preview`, or actual hosting), Gemini/Spotify/Google OAuth credentials configured, a running local Ollama or llama.cpp instance.
Context: [handbook/docs/00_FOUNDATION/ARCHITECTURE_CONSTITUTION.md § Security Hardening](handbook/docs/00_FOUNDATION/ARCHITECTURE_CONSTITUTION.md#security-hardening) — `src/middleware/security.ts` ships the production CSP as `Content-Security-Policy-Report-Only`. It's already verified clean on initial page load, but the checks below need a live environment this pass couldn't reach.

- [ ] 1. Start a live voice session (mic + noise cancellation + VAD) against the production build — confirm no CSP violations in DevTools Console
- [ ] 2. Connect Spotify and use a Spotify tool/feature — confirm `connect-src` allows `accounts.spotify.com`/`api.spotify.com` with no violations
- [ ] 3. Trigger a YouTube search tool call — confirm `www.googleapis.com` isn't blocked
- [ ] 4. Point Settings at a running local Ollama or llama.cpp instance and fetch its model list — confirm the `http://localhost:*`/`http://127.0.0.1:*` `connect-src` entries work end-to-end (not just "nothing was listening")
- [ ] 5. Click through the full Google Sign-In popup/redirect flow — confirm `frame-src`/`script-src` allow `accounts.google.com` for the whole flow, not just the initial script load
- [ ] 6. Once all of the above are clean, change the `isProd` branch in `security.ts` from `Content-Security-Policy-Report-Only` to `Content-Security-Policy` (one-line header-name swap)
- [ ] **Pass if:** All five flows run violation-free under Report-Only, then the same flows are re-verified once switched to enforced

---

## Changelog (Resolved Issues)

### 🔒 Security

| Issue | Title | Status |
|-------|-------|--------|
| 6 | Hardcoded Obsidian API key in package.json scripts + server.ts | ✅ Key rotated, code fixed, old path retired |
| 22 | send_gmail/delete_gmail confirmation gate | ⛔ Reverted by user decision |
| 43 | `confirmSensitiveAction` regression — the reverted Gmail confirm gate was back in the code | ✅ Fixed 2026-07-27 — ISSUES.md:14 claimed "the helper and all call sites were removed", but `services/tools/gmailTools.ts` still defined it (line 35) and called it in `send_gmail` (126) and `delete_gmail` (181). **Second time this has crept back in.** Helper + both call sites deleted again; `gmailSendDeclined`/`gmailDeleteDeclined` strings removed with them. |
| 34 | Request body limit too small (413 PayloadTooLargeError) | ✅ Fixed — `express.json({ limit: '10mb' })` in server.ts |

### 🐛 Bug Fixes

| Issue | Title | Status |
|-------|-------|--------|
| 1 | Spotify callback page not committed (auth broken in clean builds) | ✅ Fixed — file committed, verified in dist/ |
| 2 | Google API key used as fallback OAuth client_id in silent refresh | ✅ Fixed — removed incorrect fallback |
| 4 | GoogleIdentity construction not centralized in SetupPage | ✅ Fixed — all routes through buildGoogleIdentity() |
| 7 | React type packages pinned to v18 while runtime is v19 | ✅ Fixed — bumped to v19, resolved type errors |
| 8 | SplitView's viewerRef prop passed but never used | ✅ Fixed — removed dead prop |
| 9 | Research mode's chat unreachable (ResearchChatArea never mounted) | ✅ Fixed — wired into LLMChatPanel |
| 10 | Research "Save Findings" appends instead of overwriting | ✅ Fixed — added findings.save() overwrite path |
| 11 | Research assistant answers never source-aware | ✅ Fixed — sourceContext threaded through all providers |
| 12 | `append_findings`/`expand_source` assistant tools never added | ✅ Fixed — both tools added, backed by researchVault paths |
| 13 | Noise cancellation module built but never wired into voice pipeline | ✅ Fixed — wired into liveAssistantService.ts. **Manually verified PASS 2026-07-27.** |
| 14 | MCPVault Obsidian migration never wired in | ✅ Fully fixed — kollektivMcp on port 3012 with 61 tools |
| 15 | Obsidian Second Brain has no Settings UI | ✅ Fixed — capabilities text corrected, env-var path documented |
| 17 | OpenAI/ElevenLabs credentials under "Google Cloud" tab | ✅ Fixed — moved to AI Engine > Voice Engine Credentials |
| 18 | OpenRouter provider tab had no configuration UI | ✅ Fixed — API key + model fields added |
| 19 | No settings UI for ambient background music URL | ✅ Fixed — field added to Appearance > Background |
| 20 | Rapid mic on/off leaves ghost live-assistant session | ✅ Fixed — generation counter with stale-connection cleanup. **Manually verified PASS 2026-07-27.** |
| 21 | e2e smoke test timeout (OPFS handle persistence) | ✅ Fixed — IDB cleanup in initScript + Promise.race fallback |
| 23 | Chat panel crashes with `msg.content.includes is not a function` | ✅ Fixed — fixed listener + defensive coercion in chatStorage |
| 35 | Chat panel broadcasts streaming text to voice-assistant subtitle (liveCaption bleed) | ✅ Fixed — removed `appEventBus.emit('liveCaption', ...)` from LLMChatPanel.tsx |
| 36 | Chat button forces navigation to dashboard before opening panel | ✅ Fixed — removed `appEventBus.emit('navigate', 'dashboard')` from handleToggleChatPanel in useAppShell.ts |
| 37 | Composer Page: NaN corruption (Width/Height/Grid Cols/Rows), uncontrolled Spacing slider, RESET/grid-shrink with no confirmation | ✅ Fixed — `parseInt(x) \|\| fallback` guards, controlled slider via inverse of `getMaxGapPerGutter`, RESET and grid-shrink now route through `ConfirmationModal` |
| 38 | Composer Page: `Layer` type conflated text/image fields (dummy color/fontFamily on image layers, `fontSize` overloaded as image-width proxy); pan/drag/zoom mouse-only | ✅ Fixed — `Layer` split into `TextLayer \| ImageLayer` discriminated union; `ItemRenderer`/`LayerRenderer` migrated to Pointer Events with pinch-to-zoom |
| 39 | Media Panel: Spotify URI/URL hijacked into a bogus YouTube ID by an unanchored regex fallback; panel never opens when the assistant triggers Spotify playback | ✅ Fixed — Spotify parser tried before YouTube, loose YouTube fallback removed (`MediaPanel.tsx` + `VideoPlayerOverlay.tsx`), `openMediaPanel` wired to `isMediaPanelOpen` in `useAppEventBus.ts`, click-outside guarded against the video overlay's backdrop |
| 44 | Revoked Google token leaves the app permanently stuck as "connected" — assistant can't reconnect | ✅ Fixed 2026-07-27 — root cause of the ISSUE-2 revoke-path failure. Revoking at Google changes nothing locally: `accessToken` is still stored and `expiresAt` is still in the future, so `isGoogleAuthValid()` kept returning `true`. Consequences: `ensureGoogleToken` (`gmailTools.ts:17`) handed back the dead token and never even entered the refresh path, and `IntegrationsSection.tsx:265` rendered the ACTIVE profile card with only "Revoke Access" — **no AUTHENTICATE button**, so the only escape was manually clicking Revoke Access first. Nothing anywhere invalidated the identity on a 401. Fixed with `markGoogleTokenInvalid()` in `utils/googleAuth.ts` (sets `expiresAt: 0`, keeps `isConnected` so genuine expiry still silently refreshes), called on 401 from all four Gmail fetches and from `fileUtils.extractGoogleError`. **Second defect found while verifying:** `isTokenExpired`/`msUntilExpiry` tested `expiresAt` for *truthiness*, so `0` fell through to the `connectedAt + 55min` heuristic and a freshly-connected identity still read as valid — the invalidation was inert. Both now use `!= null`. New `utils/googleAuth.test.ts` covers the real implementation (every other suite mocks `googleAuth` wholesale, which is why 692 passing tests missed it). |
| 45 | **Onboarding unreachable — the app never asked for a vault folder, and reaching the wizard crashed it** | ✅ Fixed 2026-07-27 — found while running ISSUE-21. Two separate defects on the same path. **(a)** `hooks/useBootSequence.ts` was extracted from App.tsx in `7e861d2`/`fc8002c`, and the extraction dropped the storage gate: the pre-extraction boot called `fileSystemManager.initialize()` and did `setShowWelcome(true)` when it returned false, but in the hook `showWelcome` was initialised to `false` and the only remaining call was `setShowWelcome(false)`. It could never become true, so `App.tsx:382`'s `if (showWelcome) return <OnboardingFlow …>` was dead — the app booted straight to the loader with **no vault connected and no route to connect one except Settings > App**, and the whole ISSUE-24.1 wizard was unreachable. Gate restored in `initializeApp` (settings/auth read through refs so boot doesn't re-run on a theme switch). **(b)** With the wizard reachable again it crashed instantly with React error #310: `OnboardingFlow` declared `React.useEffect` *inside* the `step === 'finish'` branch, so the hook count changed between renders the moment the wizard hit its last step. Moved to a top-level effect guarded on `step`. 2 regression tests in `useBootSequence.test.ts` cover the gate in both directions. |
| 40 | Media Panel: no Files tab, no way to stop/query playback from the assistant, `spotify_play` hard-required an auth token for a public embed | ✅ Fixed — Files tab (chat attachments + vault `fileSystemManager`), `stop_media`/`get_current_media` tools backed by `services/mediaPlaybackStore.ts`, auth-token check dropped from `spotify_play` |

### 🧹 Cleanup & Tech Debt

| Issue | Title | Status |
|-------|-------|--------|
| 3 | Leftover dead code and scratch artifacts from MCP-UI removal | ✅ Fixed |
| 5 | Hardcoded Anthropic model default string | ✅ Fixed — constant extracted |
| 16 | Minor unfinished items (browser_close_tab, a11y, QuickActions, etc.) | ✅ Fixed — all 7 items implemented |
| 27 | settingsStorage.test.ts planned but never created | ✅ Fixed — 16 tests added |
| 32 | `providerRouter.ts` — built, tested, zero real callers, stub `call()` | ✅ Deleted — file, test, and PROVIDER_ROUTER.md handbook doc removed (see ARCHITECTURE_CONSTITUTION.md § Built But Not Wired for why) |
| 33 | Chunked chat loading falsely flagged as unwired | ✅ False positive — `loadRecentMessages()`/`loadMessagesBefore()` are wired into `LLMChatPanel.tsx`'s "Load older messages" button; the original audit grepped the wrong function name. Docs corrected, no code change needed. |

### 🚀 Feature Phases

| Issue | Title | Status |
|-------|-------|--------|
| 24 | Phase 1 — Robustness & First-Run Experience | ✅ Complete — onboarding, error UX, settings resilience, vault integrity |
| 24.1 | Onboarding rework: multi-step wizard, demo mode, non-Chromium messaging | ✅ Done |
| 24.2 | Error UX standardization: ErrorDisplay component + AppError hierarchy | ✅ Done |
| 24.3 | Settings resilience: shadow-backup pattern | ✅ Done |
| 24.4 | Vault integrity visibility: IntegrityReportModal | ✅ Done |
| 25 | Phase 2 — Feature Enrichment | ✅ Complete — generate loop, model registry, knowledge graph, gallery intelligence |
| 25.1 | Generate loop: state machine, panel, generate_and_ingest tool | ✅ Done |
| 25.2 | Model registry: versioned modelProfiles.ts | ✅ Done |
| 25.3 | Assistant knowledge graph: entity graph with cross-entity query | ⚠️ Was falsely marked done (2026-07-25 audit found `relationshipGraph.ts` built but unwired, no real tool). ✅ Actually done 2026-07-26 — see ISSUE-31 below. |
| 25.4 | Gallery intelligence: auto-tagging, similarity clustering, visual search | ✅ Done |
| 26 | Phase 3 — Polish & Performance | ✅ Done — all three sub-items real (26.3 just wasn't WASM) |
| 26.1 | WebSocket reconnection with exponential backoff | ✅ Done |
| 26.2 | Chunked chat loading with "Load more" | ✅ Done — `loadRecentMessages()`/`loadMessagesBefore()` wired into `LLMChatPanel.tsx`'s "↑ Load older messages" button. A 2026-07-25 audit falsely flagged this as unwired by checking the wrong function name (`loadChatMessages`, an unrelated helper); corrected 2026-07-26 (ISSUE-33, closed as false positive). |
| 26.3 | BM25 search with IDB persistence | ⚠️ Real (`utils/vaultSearch.ts`, wired into Command Palette via `obsidianStorage.searchNotes()`) but plain JS, not WASM — "WASM-accelerated" was inaccurate, corrected in the handbook |
| 28 | Aspirational MCP Architecture (8 layers) | ⚠️ 7 of 8 real — the "provider router" layer (`providerRouter.ts`) was a disconnected stub, deleted 2026-07-26 (ISSUE-32) rather than wired, since it conflicted with the app's explicit user-chooses-the-provider design |
| 29 | Knowledge & Obsidian Architecture | ✅ Complete — knowledge manager, 3-tier memory, relationship graph (now wired, ISSUE-31), context injection, lifecycle projection |
| 31 | Wire `relationshipGraph.ts` into a real assistant tool | ✅ Done 2026-07-26 — new `find_related_knowledge` tool (`services/tools/graphTools.ts`) rehydrates the graph from `memoryStorage`/`galleryStorage`/`promptStorage` tags on each call and exposes `findRelatedByTags` to the assistant. 6 new tests. |
| 41 | Free multi-engine web search: `web_search` scrapes DuckDuckGo/Brave/Exa (Bing added beyond initial scope) via `/api/web-search`, falls back to Gemini only when the free path is empty | ✅ Done — live-verified 2026-07-27: Bing returned real results; DuckDuckGo/Brave hit connection-level/429 blocks specific to this dev container's IP (known behavior of these engines against datacenter IPs, not a code defect — request/response handling itself is correct). |
| 42 | Reach channels: `rss_fetch`, `github_get_repo`/`github_search`/`github_get_file`, `exa_search`, `reddit_fetch`, `youtube_get_transcript`, `twitter_get_tweet` via `/api/reach/*` | ⚠️ 5/6 live-verified 2026-07-27 (see detail below) — the implementing session's sandbox had no network access to verify against real upstreams; this pass did, from a differently-restricted dev container. |
| 46 | Phase 1 — Gallery Auto-Tagging: `services/autoTagService.ts`, Gemini/Ollama tag-suggestion calls, `autoTagEnabled` setting, `TagSuggestionRow` accept/reject UI in `ItemDetailView` | ✅ Done 2026-07-28 — 31 new tests, `pnpm lint` clean. Docs corrected: ARCHITECTURE_CONSTITUTION.md:205 no longer falsely claims similarity clustering and visual search as shipped. See `docs/plans/2026-07-28-phase1-gallery-auto-tagging.md`. |
| 47 | Phase 4 — Inert capability platform: empty registry, stub dispatcher | ✅ Logged 2026-07-28 — `capabilityRegistry.register()` is never called by app code; `executionEngine.ts:213-249` returns stubs for all 8 step kinds. Phase 4's batch runner was built directly over working services (Option B) rather than resurrecting this platform. See `docs/plans/2026-07-28-phase4-batch-runner.md` §Correction. |

**Live verification detail (2026-07-27), one dev-container run against real upstreams:**
- ✅ **RSS** — real `hnrss.org` feed parsed correctly.
- ✅ **GitHub** — real `facebook/react` repo metadata returned.
- ✅ **Twitter/X** — real tweet (`jack`'s first tweet) returned via the syndication CDN backend, including metrics.
- ✅ **Exa** — correctly reports `EXA_API_KEY not configured` (no key in this env; error path confirmed clean, not a crash).
- ⚠️ **Reddit** — blocked (403) by Reddit itself at this container's IP; the tool's graceful-error path fired correctly. Pre-documented risk (`redditTools.ts` fragility note), not new.
- ❌ **YouTube transcript** — both backends failed against 3 different real videos: `watchPage` fetches a valid signed caption-track URL but gets back HTTP 200 with an **empty body**; `innertube` gets `playabilityStatus.status: "UNPLAYABLE"` ("The page needs to be reloaded") even after bumping `clientVersion` to a current-looking string. Both signatures match YouTube's anti-bot wall for non-browser/datacenter-IP requests (PO-token enforcement), not an obvious code bug — **needs re-verification from the actual deployment's real (non-datacenter) network** before concluding the implementation itself is broken. If it still fails there, the fix requires a PO-token-capable request path (e.g. headless-browser-backed token minting), which is a real scope increase beyond a parsing fix.

### 🔧 MCP Infrastructure Hardening (2026-07-25)

Packaged under ISSUE-14. All fixes verified end-to-end.

- **Removed redundant Playwright child process** (port 8931) — Playwright loads as sub-server inside kollektivMcp on port 3012
- **MCP server now always starts** — removed OBSIDIAN_VAULT_PATH gate, Playwright tools load unconditionally
- **.env loading** — added `import 'dotenv/config'` + dotenv dependency for server.ts
- **CORS fix** — added `Access-Control-Expose-Headers: mcp-session-id` so browser JS can read session ID cross-origin
- **Preset URL sync** — `upsertMcpPresetEntry` syncs `url: preset.defaultUrl` on every toggle
- **Ping uses effective URL** — PredefinedMcpSection uses `preset.defaultUrl` over stored `entry.url`
- **Consolidated MCP presets** — single `kollektiv-mcp` preset with Built-In tab (two-column layout: info + 61 tools)

---

## Reference

- [Architecture handbook](handbook/README.md) — design docs, specs, and implementation guide
