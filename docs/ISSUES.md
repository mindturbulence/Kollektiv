# Kollektiv — Issues & Changelog

All issues resolved as of **2026-07-25**. This file now serves as:
1. Tracker for remaining open manual tests (with step-by-step procedures)
2. Changelog of all resolved issues (compact)
3. Reference to [architecture handbook](handbook/README.md) for design docs

---

## Critical Historical Notes

These decisions are permanent — do not re-litigate without the user asking first.

- **ISSUE-22 — send_gmail/delete_gmail confirmation gate: ⛔ REVERTED (user decision, 2026-07-24).** The user considers Google OAuth consent sufficient permission and does not want per-action confirmation prompts. The `confirmSensitiveAction` helper and all call sites were removed. **Do not re-add without explicit user request.**
- **ISSUE-6 — Old `OBSIDIAN_API_KEY` is exposed in git history.** The key was rotated. The old `OBSIDIAN_API_KEY` path was fully retired in favor of `OBSIDIAN_VAULT_PATH` (direct vault folder access via `kollektivMcp.ts`). The rotated key is not needed by the app.

---

## Open Manual Tests

These items are **code-fixed** but need manual verification. Run with `pnpm build && pnpm preview` or `pnpm dev` in a real browser (Chrome recommended).

### Quick wins (no external accounts)

**ISSUE-9 — Research chat flow**
Prerequisites: A vault folder connected, at least one research project with sources added.

- [ ] 1. Open the app and navigate to the Assistant panel
- [ ] 2. Open an existing research project (or create one and add a source)
- [ ] 3. Type a message in the middle-column chat input and send it
- [ ] 4. Confirm you get a real assistant reply (not "placeholder" or error text)
- [ ] 5. If the source has content, confirm citations render in the reply footer
- [ ] **Pass if:** Research chat works end-to-end with no placeholder text

**ISSUE-10 — Findings dedup**
Prerequisites: A research project with at least one finding saved.

- [ ] 1. Open a research project's Findings panel
- [ ] 2. Edit the findings text, click Save
- [ ] 3. Repeat step 2 two more times (3 saves total)
- [ ] 4. Reopen the findings file (or refresh the panel)
- [ ] 5. Confirm the file contains exactly **one** copy of the final text, not three
- [ ] **Pass if:** No content duplication after multiple saves

**ISSUE-12 — Assistant append_findings**
Prerequisites: A research project active with a vault folder connected.

- [ ] 1. Open a research project
- [ ] 2. In the research chat, ask the assistant: *"Note down that the key finding is X"*
- [ ] 3. Confirm the assistant replies that it appended the finding
- [ ] 4. Open the Findings panel — confirm the new finding text appears
- [ ] **Pass if:** The assistant can append findings mid-conversation without a UI save click

**ISSUE-20 — Rapid mic toggle (ghost session)**
Prerequisites: A Gemini API key configured (or other live-voice backend).

- [ ] 1. Open the app and start a live voice session (click the mic icon)
- [ ] 2. **While the status shows "connecting"**, click the mic icon again to stop
- [ ] 3. Wait 5 seconds
- [ ] 4. Confirm the UI shows the mic as **off/idle** (no pulsing, no status indicator)
- [ ] 5. Confirm no audio is being captured (browser tab's mic indicator is off)
- [ ] 6. Try toggling on again — confirm a fresh session starts correctly
- [ ] 7. Repeat steps 1-3 three times to be sure
- [ ] **Pass if:** No ghost session lingers after rapid on/off clicking

**ISSUE-21 — e2e headed smoke test**
Prerequisites: Node.js, Playwright browsers installed (`npx playwright install chromium`).

- [ ] 1. `pnpm build && pnpm preview` (or `pnpm dev`)
- [ ] 2. In a separate terminal: `npx playwright test e2e/smoke.spec.ts --headed`
- [ ] 3. Watch the headed browser — it should:
     - Boot the app (wait for the vault folder selector or reconnect button)
     - Click to proceed through setup
     - Click the Web Viewer button in the header
     - Confirm the Close button becomes visible
- [ ] 4. Both tests should pass (exit code 0)
- [ ] **Pass if:** Both e2e tests pass without timeout or manual intervention

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

**ISSUE-2 — Google silent refresh**
Prerequisites: A Google OAuth Client ID configured, Gmail API enabled, an expired (or about-to-expire) token.

- [ ] 1. Connect a Google account with Gmail scope
- [ ] 2. Wait for the token to expire (or manually revoke it)
- [ ] 3. Trigger a Gmail assistant tool (`send_gmail`, `search_gmail`, etc.)
- [ ] 4. Confirm the tool succeeds **without** showing a full Google re-consent popup
- [ ] **Pass if:** Silent refresh works — no full re-consent for Gmail tools

**ISSUE-11 — Source-aware answers**
Prerequisites: A research project with at least one source file added and readable.

- [ ] 1. Add a source file to a research project (e.g., a markdown note with specific content)
- [ ] 2. Open the research chat
- [ ] 3. Ask a question about the source's content: *"What does the source say about X?"*
- [ ] 4. Confirm the answer references the source content specifically
- [ ] 5. Confirm citation footers appear in the reply (e.g., `[1]`, `[2]`)
- [ ] **Pass if:** Answers demonstrably use added source content with citations

**ISSUE-13 — Noise cancellation**
Prerequisites: A Gemini API key configured for live voice, a moderately noisy environment.

- [ ] 1. Start a live voice session
- [ ] 2. While speaking, introduce background noise (fan, music at low volume, etc.)
- [ ] 3. Confirm the assistant's speech-to-text is still accurate
- [ ] 4. Confirm the VAD (voice activity detection) isn't tripping on background noise
- [ ] **Pass if:** Noise cancellation is perceptibly active — cleaner VAD than without

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

### User-only

**ISSUE-6 — Rotate Obsidian API key**
- [ ] 1. Open Obsidian's Local REST API plugin settings
- [ ] 2. Generate a new API key
- [ ] 3. Update `OBSIDIAN_API_KEY` in your `.env` file
- [ ] 4. Restart the dev server
- [ ] 5. Confirm Obsidian tools still work with the new key

---

## Changelog (Resolved Issues)

### 🔒 Security

| Issue | Title | Status |
|-------|-------|--------|
| 6 | Hardcoded Obsidian API key in package.json scripts + server.ts | ✅ Key rotated, code fixed, old path retired |
| 22 | send_gmail/delete_gmail confirmation gate | ⛔ Reverted by user decision |

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
| 13 | Noise cancellation module built but never wired into voice pipeline | ✅ Fixed — wired into liveAssistantService.ts |
| 14 | MCPVault Obsidian migration never wired in | ✅ Fully fixed — kollektivMcp on port 3012 with 61 tools |
| 15 | Obsidian Second Brain has no Settings UI | ✅ Fixed — capabilities text corrected, env-var path documented |
| 17 | OpenAI/ElevenLabs credentials under "Google Cloud" tab | ✅ Fixed — moved to AI Engine > Voice Engine Credentials |
| 18 | OpenRouter provider tab had no configuration UI | ✅ Fixed — API key + model fields added |
| 19 | No settings UI for ambient background music URL | ✅ Fixed — field added to Appearance > Background |
| 20 | Rapid mic on/off leaves ghost live-assistant session | ✅ Fixed — generation counter with stale-connection cleanup |
| 21 | e2e smoke test timeout (OPFS handle persistence) | ✅ Fixed — IDB cleanup in initScript + Promise.race fallback |
| 23 | Chat panel crashes with `msg.content.includes is not a function` | ✅ Fixed — fixed listener + defensive coercion in chatStorage |

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
