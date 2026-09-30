# Kollektiv — Open Issues

Open bugs, manual tests and permanent decisions only. Resolved issues are removed — git history
is the changelog (the full pre-2026-09-28 changelog is `docs/ISSUES.md` at commit `3bc6f65`).
Task backlog: [plans/TASKS.md](plans/TASKS.md). Next free id: **ISSUE-48**.

---

## Critical Historical Notes

These decisions are permanent — do not re-litigate without the user asking first.

- **ISSUE-22 — send_gmail/delete_gmail confirmation gate: ⛔ REVERTED (user decision, 2026-07-24).** The user considers Google OAuth consent sufficient permission and does not want per-action confirmation prompts. The `confirmSensitiveAction` helper and all call sites were removed. **Do not re-add without explicit user request.**
- **ISSUE-6 — Old `OBSIDIAN_API_KEY` is exposed in git history.** The key was rotated. The old `OBSIDIAN_API_KEY` path was fully retired in favor of `OBSIDIAN_VAULT_PATH` (direct vault folder access via `kollektivMcp.ts`). **Re-verified 2026-07-27: `OBSIDIAN_API_KEY` appears in zero `.ts`/`.tsx`/`.json` files — docs only.** The app does not read it. Nothing to rotate, nothing to test; the stale "rotate the key" manual test was deleted. Setting `OBSIDIAN_VAULT_PATH` is the whole configuration.
- **ISSUE-47 — `plan.requiresConfirmation` stays unenforced (user decision, 2026-09-28).** The
  planner flags vault writes, settings changes and generations, but `capability_execute` runs them
  without a confirmation step, consistent with ISSUE-22. **Do not add a gate without an explicit
  user request.**

---

## Open issues

**ISSUE-42 — YouTube transcript tool fails** (reach channels; the other five were live-verified 2026-07-27)
- ❌ **YouTube transcript** — both backends failed against 3 different real videos: `watchPage` fetches a valid signed caption-track URL but gets back HTTP 200 with an **empty body**; `innertube` gets `playabilityStatus.status: "UNPLAYABLE"` ("The page needs to be reloaded") even after bumping `clientVersion` to a current-looking string. Both signatures match YouTube's anti-bot wall for non-browser/datacenter-IP requests (PO-token enforcement), not an obvious code bug — **needs re-verification from the actual deployment's real (non-datacenter) network** before concluding the implementation itself is broken. If it still fails there, the fix requires a PO-token-capable request path (e.g. headless-browser-backed token minting), which is a real scope increase beyond a parsing fix.
Reddit returning 403 from datacenter IPs is expected (documented fragility in `redditTools.ts`).

**ISSUE-47 residuals — capability execution engine**
- `mcp_call` / `persistence` / `fallback` step kinds throw "not implemented" (honest failure; `optional`
  steps are skipped). The planner never emits `mcp_call` or `fallback`, and `persistence` only follows
  a `provider_call` that has no dispatch — build them when a plan actually needs one.
- Resolved 2026-09-30: step outputs already flow to later steps (`{{step1.output…}}` interpolation in
  the engine), and `user_confirmation` now completes as an explicit auto-approval (output says
  `userPrompted: false`) so settings plans run, per the unenforced-confirmation decision above.

**ISSUE-12 follow-up — `append_findings` not always called** (model behaviour, not a code defect)
The tool path is proven (`researchVaultService.test.ts`, live run 2026-07-27), but the assistant once
answered "noted" without calling it. 2026-09-30: the tool description now says nothing is saved unless
the tool is called. If it still recurs, add a nudge in `buildSystemIdentity`.

---

## Manual tests (need live accounts or a production deploy)

Run with `pnpm build && pnpm preview` or `pnpm dev` in a real browser (Chrome recommended).


**ISSUE-1 — Spotify connect E2E**
Prerequisites: A Spotify Developer app with Client ID, running on a URL the Spotify redirect_uri allows.

- [ ] 1. Start the app from a **clean checkout** (`git clone`, `pnpm install`)
- [ ] 2. Navigate to Settings > Integrations > Spotify
- [ ] 3. Enter your Spotify Client ID and click Connect
- [ ] 4. Complete the Spotify OAuth consent screen in the popup
- [ ] 5. After the popup closes, confirm the Spotify status shows "Connected"
- [ ] 6. Use a Spotify tool or feature to confirm the token works
- [ ] **Pass if:** Spotify connects end-to-end from a clean checkout

**ISSUE-2 — Google silent refresh** — failed 2026-07-27 on the revoke path; the cause (a revoked token still counted as valid) was fixed as ISSUE-44, so both tests need a re-run
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
