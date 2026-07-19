# Kollektiv — Issues

This file is the issue tracker (no external tracker exists). Each issue has an ID,
severity, the finding, acceptance criteria, and check-off-able tasks. Reference
issues in commits: `Fixes ISSUE-1`. Severity: **HIGH** (broken for users),
**MEDIUM** (wrong under a real condition), **LOW** (hygiene / tech debt),
**SECURITY**.

Findings come from the `HEAD~5...HEAD` code review (Google/YouTube/Spotify/MCP
work) plus toolchain checks. Related spec: [docs/specs/google-identity-and-oauth.md](docs/specs/google-identity-and-oauth.md).

Legend: `[ ]` open · `[x]` done · `[~]` in progress

---

## ISSUE-1 — Spotify callback page is not committed (Spotify auth broken in clean builds) · HIGH

`server.ts` `/auth/spotify/callback` redirects to the static `/spotify-callback.html`,
and the whole client-side PKCE flow depends on that page writing tokens to
`localStorage`. But `public/spotify-callback.html` is **untracked**
(`git cat-file -e HEAD:public/spotify-callback.html` → not in HEAD). A fresh
clone, CI, or `gh-pages -d dist` deploy 404s the callback → Spotify connect
fails for everyone but the original author.

- [ ] Review `public/spotify-callback.html` for correctness (PKCE exchange, the
      `localStorage` keys `spotify_access_token` / `spotify_refresh_token` /
      `spotify_expires_at` / `spotify_just_connected`, and `window.close()`).
- [ ] Confirm no secrets are embedded in the HTML (client-side PKCE needs none).
- [ ] Commit the file.
- [ ] Verify `pnpm run build` copies it into `dist/` (it's under `public/`, so Vite
      should — confirm, don't assume).
- [ ] Manual: fresh clone → `pnpm install && pnpm build && pnpm preview` → complete
      a Spotify connect end to end.

**Acceptance:** Spotify connect works from a clean checkout with no author-local files.

---

## ISSUE-2 — Google API key used as a fallback OAuth client_id in silent refresh · MEDIUM

`SetupPage.tsx:248` (the `googleTokenRefreshRequested` effect) resolves the GSI
client id as
`settings.youtube?.customClientId || settings.googleApiKey || process.env.YOUTUBE_CLIENT_ID`.
`googleApiKey` is a developer API key (`AIza…`), **not** a valid OAuth `client_id`.
If a user set the API key but left Client ID blank, GSI is initialised with a
garbage client_id and silent refresh fails quietly — defeating the "silent refresh
to Gmail tools" goal of `82f3897`. The three other GSI call sites (lines 237, 296,
312) correctly omit `googleApiKey`.

- [ ] Remove `|| settings.googleApiKey` from the client-id resolution at `SetupPage.tsx:248`.
- [ ] Remove `settings.googleApiKey` from that effect's dependency array (line ~262)
      if it's no longer referenced.
- [ ] `pnpm run lint` clean afterwards.
- [ ] Manual: with an expired Google token, confirm a Gmail tool triggers a
      successful silent refresh (no full re-consent) when a GSI session is available.

**Acceptance:** silent refresh uses only a real OAuth client_id; behaviour matches the other GSI sites.

---

## ISSUE-3 — Leftover dead code and scratch artifacts from the MCP-UI removal · LOW

The MCP-UI removal left residue that compiles but shouldn't be in the tree.

- [ ] Delete the orphaned comment + bare `;` statements at `components/LLMChatPanel.tsx:119–123`:
      ```tsx
      // Connect to MCP Server and retrieve capabilities (Tools, Prompts, Resources)
      ;
      // Execute an MCP Tool from client console (routes through assistant tool pipeline)
      ;
      ```
- [ ] Delete scratch files from the working tree: `components/LLMChatPanel.tsx.bak`,
      `.bak2`, `.bak3`; `fix_unused_imports.py`; `remove_all_mcp_from_chatpanel.py`;
      `remove_mcp_ui.py`, `_final.py`, `_v4.py`, `_v5.py`, `_v6.py`;
      `remove_remaining_mcp_button.py`; `remove_slash_button.py`.
- [ ] Add `*.bak` and the throwaway root `*.py` scripts to `.gitignore`.
- [ ] Grep for any other orphaned `mcp`/`MCP` references in `LLMChatPanel.tsx` and
      confirm none are dead.
- [ ] `pnpm run lint` clean.

**Acceptance:** no dead statements, no scratch files, `.gitignore` prevents recurrence.

---

## ISSUE-4 — GoogleIdentity construction not centralized in SetupPage · LOW

`731302b` introduced `buildGoogleIdentity()` and `Welcome.tsx` adopted it, but
`SetupPage.handleAuthResponse` (~line 190) still hand-builds the
`GoogleIdentityConnection` inline. Divergent from the centralization intent; risks
`expiresAt` drift if the two paths diverge.

- [ ] Replace the inline object in `SetupPage.handleAuthResponse` (google branch)
      with `buildGoogleIdentity({ access_token, expires_in }, { email, name, picture })`.
- [ ] Confirm `expiresAt` is still populated identically.
- [ ] `pnpm run lint` clean.

**Acceptance:** all `GoogleIdentityConnection` construction routes through `buildGoogleIdentity`.

---

## ISSUE-5 — Hardcoded Anthropic model default string · LOW

`utils/settingsStorage.ts:145` hydrates `anthropicModel ?? 'claude-3-7-sonnet-20250219'`
as a literal, even though `constants/llmDefaults.ts` exports `DEFAULT_ANTHROPIC_MODEL`
(already imported in `IntegrationsSection.tsx`). ROADMAP Phase 0 explicitly flags
this drift-prone string.

- [ ] Import `DEFAULT_ANTHROPIC_MODEL` in `settingsStorage.ts` and use it in place of
      the literal.
- [ ] Grep for other copies of the same model string; replace with the constant.
- [ ] `pnpm run lint` clean.

**Acceptance:** the default Anthropic model lives in exactly one constant.

---

## ISSUE-6 — Hardcoded Obsidian API key committed in package.json scripts · SECURITY

`package.json` `obsidian:mcp` and `obsidian:mcp:http` scripts embed a literal
`OBSIDIAN_API_KEY=…` (64-hex). It targets `127.0.0.1:27124` so blast radius is
local-only, but a committed credential is still a policy violation and should not
be in version control.

- [ ] Move the key out of `package.json` into an untracked `.env` (or the shell
      environment) and reference `$OBSIDIAN_API_KEY` from the scripts.
- [ ] Ensure `.env` is gitignored.
- [ ] Rotate/regenerate the Obsidian Local REST API key (it's exposed in git history).
- [ ] Add a note to CONTRIBUTING.md's secrets section pointing at the `.env` pattern.

**Acceptance:** no credential literals in `package.json`; key rotated.

---

## ISSUE-7 — React type packages pinned to v18 while runtime is v19 · LOW

`package.json`: `react`/`react-dom` are `^19.1.1` but `@types/react` is `^18.3.3`
and `@types/react-dom` is `^18.3.0`. Type definitions lag the runtime by a major
version, which can hide or misreport React 19 API type errors.

- [ ] Bump `@types/react` and `@types/react-dom` to their v19 lines.
- [ ] Run `pnpm run lint` and resolve any newly-surfaced type errors.

**Acceptance:** React runtime and type packages are on the same major version; lint clean.

---

## Notes / non-issues (verified, no action)

- Video overlay **does** handle Escape-to-close (`VideoPlayerOverlay.tsx:110`) and
  has `aria-label` on the close button — no a11y gap there.
- Footer integration indicators are presentational (non-interactive) — no keyboard
  a11y concern.
- The Spotify token `setInterval(tryConnect, 2000)` in `SetupPage` is cleared on
  unmount — acceptable, not a leak.
- `appControlService.help()` / command-menu expansion and the `WebViewerPanel`
  `isExpanded` toggle are unrequested-but-benign additions from the reviewed work.
