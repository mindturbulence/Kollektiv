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

## ISSUE-1 — Spotify callback page is not committed (Spotify auth broken in clean builds) · HIGH · ✅ FIXED (`6afb40a`)

`server.ts` `/auth/spotify/callback` redirects to the static `/spotify-callback.html`,
and the whole client-side PKCE flow depends on that page writing tokens to
`localStorage`. But `public/spotify-callback.html` is **untracked**
(`git cat-file -e HEAD:public/spotify-callback.html` → not in HEAD). A fresh
clone, CI, or `gh-pages -d dist` deploy 404s the callback → Spotify connect
fails for everyone but the original author.

- [x] Review `public/spotify-callback.html` for correctness (PKCE exchange, the
      `localStorage` keys `spotify_access_token` / `spotify_refresh_token` /
      `spotify_expires_at` / `spotify_just_connected`, and `window.close()`).
      Verified: matches the spec exactly, no secrets embedded.
- [x] Confirm no secrets are embedded in the HTML (client-side PKCE needs none).
- [x] Commit the file.
- [ ] Verify `pnpm run build` copies it into `dist/` (it's under `public/`, so Vite
      should — confirm, don't assume).
- [ ] Manual: fresh clone → `pnpm install && pnpm build && pnpm preview` → complete
      a Spotify connect end to end.

**Acceptance:** Spotify connect works from a clean checkout with no author-local files.

---

## ISSUE-2 — Google API key used as a fallback OAuth client_id in silent refresh · MEDIUM · ✅ FIXED (`6afb40a`)

`SetupPage.tsx:248` (the `googleTokenRefreshRequested` effect) resolves the GSI
client id as
`settings.youtube?.customClientId || settings.googleApiKey || process.env.YOUTUBE_CLIENT_ID`.
`googleApiKey` is a developer API key (`AIza…`), **not** a valid OAuth `client_id`.
If a user set the API key but left Client ID blank, GSI is initialised with a
garbage client_id and silent refresh fails quietly — defeating the "silent refresh
to Gmail tools" goal of `82f3897`. The three other GSI call sites (lines 237, 296,
312) correctly omit `googleApiKey`.

- [x] Remove `|| settings.googleApiKey` from the client-id resolution at `SetupPage.tsx:248`.
- [x] Remove `settings.googleApiKey` from that effect's dependency array (line ~262)
      if it's no longer referenced.
- [x] `pnpm run lint` clean afterwards.
- [ ] Manual: with an expired Google token, confirm a Gmail tool triggers a
      successful silent refresh (no full re-consent) when a GSI session is available.

**Acceptance:** silent refresh uses only a real OAuth client_id; behaviour matches the other GSI sites.

---

## ISSUE-3 — Leftover dead code and scratch artifacts from the MCP-UI removal · LOW · ✅ FIXED

The MCP-UI removal left residue that compiles but shouldn't be in the tree.

- [x] Delete the orphaned comment + bare `;` statements at `components/LLMChatPanel.tsx:119–123` (`6afb40a`).
- [x] Delete scratch files from the working tree: `components/LLMChatPanel.tsx.bak`,
      `.bak2`, `.bak3`; `fix_unused_imports.py`; `remove_all_mcp_from_chatpanel.py`;
      `remove_mcp_ui.py`, `_final.py`, `_v4.py`, `_v5.py`, `_v6.py`;
      `remove_remaining_mcp_button.py`; `remove_slash_button.py` (`6afb40a`).
- [x] Add `*.bak` and the throwaway root `*.py` scripts to `.gitignore`.
- [ ] Grep for any other orphaned `mcp`/`MCP` references in `LLMChatPanel.tsx` and
      confirm none are dead.
- [x] `pnpm run lint` clean.

**Acceptance:** no dead statements, no scratch files, `.gitignore` prevents recurrence.

---

## ISSUE-4 — GoogleIdentity construction not centralized in SetupPage · LOW · ✅ FIXED (`6afb40a`)

`731302b` introduced `buildGoogleIdentity()` and `Welcome.tsx` adopted it, but
`SetupPage.handleAuthResponse` (~line 190) still hand-builds the
`GoogleIdentityConnection` inline. Divergent from the centralization intent; risks
`expiresAt` drift if the two paths diverge.

- [x] Replace the inline object in `SetupPage.handleAuthResponse` (google branch)
      with `buildGoogleIdentity({ access_token, expires_in }, { email, name, picture })`.
- [x] Confirm `expiresAt` is still populated identically.
- [x] `pnpm run lint` clean.

**Acceptance:** all `GoogleIdentityConnection` construction routes through `buildGoogleIdentity`.

---

## ISSUE-5 — Hardcoded Anthropic model default string · LOW · ✅ FIXED (`6afb40a`)

`utils/settingsStorage.ts:145` hydrates `anthropicModel ?? 'claude-3-7-sonnet-20250219'`
as a literal, even though `constants/llmDefaults.ts` exports `DEFAULT_ANTHROPIC_MODEL`
(already imported in `IntegrationsSection.tsx`). ROADMAP Phase 0 explicitly flags
this drift-prone string.

- [x] Import `DEFAULT_ANTHROPIC_MODEL` in `settingsStorage.ts` and use it in place of
      the literal.
- [x] Grep for other copies of the same model string; replace with the constant.
      (`DEFAULT_ANTHROPIC_MODEL` itself still holds the literal in `constants/llmDefaults.ts` —
      that's the one sanctioned copy.)
- [x] `pnpm run lint` clean.

**Acceptance:** the default Anthropic model lives in exactly one constant.

---

## ISSUE-6 — Hardcoded Obsidian API key committed in package.json scripts and server.ts · SECURITY · ✅ CODE FIXED — ⚠️ ROTATION STILL REQUIRED

`package.json` `obsidian:mcp`/`obsidian:mcp:http` scripts **and** `server.ts:1134`
(the `startObsidianMcp` child-process env, run unconditionally on every `pnpm dev`)
all embedded the same literal `OBSIDIAN_API_KEY=8597a7e3…` (64-hex) — three copies
total, one of them in the always-run dev-server path. Blast radius is local-only
(`127.0.0.1:27124`), but a committed credential is still a policy violation and the
key is now permanently in git history regardless of code fixes.

- [x] Move the key out of `package.json`: both scripts now omit `OBSIDIAN_API_KEY`
      and rely on the ambient environment.
- [x] `server.ts` `startObsidianMcp()` now reads `process.env.OBSIDIAN_API_KEY` with
      **no literal fallback**, and skips starting the bridge entirely (logs a message,
      doesn't crash the server) if it's unset.
- [x] Added `.env`/`.env.local` to `.gitignore`, plus a tracked `.env.example`
      documenting `OBSIDIAN_API_KEY`.
- [x] Add a note to CONTRIBUTING.md's secrets section pointing at the `.env.example` pattern.
- [ ] **Manual, user-only:** rotate/regenerate the key in Obsidian's Local REST API
      plugin settings — the old value is exposed in git history and code fixes alone
      don't invalidate it. Update your local `.env` with the new value afterward.

**Acceptance:** no credential literals anywhere in the tree (verified via grep); key rotated (pending user action).

---

## ISSUE-7 — React type packages pinned to v18 while runtime is v19 · LOW · ✅ FIXED

`package.json`: `react`/`react-dom` are `^19.1.1` but `@types/react` was `^18.3.3`
and `@types/react-dom` was `^18.3.0`. Type definitions lagged the runtime by a
major version, which can hide or misreport React 19 API type errors.

- [x] Bump `@types/react` (`^19.1.8`) and `@types/react-dom` (`^19.1.6`) to their v19 lines.
- [x] Run `pnpm run lint` and resolve newly-surfaced type errors:
      - `components/PageFrame.tsx` — `PageFrameProps` ref types widened from
        `React.RefObject<T>` to `React.RefObject<T | null>` (React 19's `useRef<T>(null)`
        now correctly types as nullable).
      - `components/ImageCompare.tsx` — `SplitView`'s `viewerRef` prop type widened
        the same way.
      - `server.ts:1087` — unrelated pre-existing `noUnusedParameters` violation
        (`chunk` param never read) surfaced once lint could run clean enough to reach
        it; prefixed with `_chunk`.
- [x] `pnpm run lint` clean (verified: `tsc --noEmit` exits with no output).

**Acceptance:** React runtime and type packages are on the same major version; lint clean. ✅ Verified.

---

## ISSUE-8 — `SplitView`'s `viewerRef` prop is passed but never used · LOW

Found while fixing ISSUE-7. `components/ImageCompare.tsx:389` passes `viewerRef={viewerRef}`
into `SplitView`, and `SplitView`'s prop type declares `viewerRef` — but the component
destructures only `{ imageA, imageB, transform }` (line 118) and creates its **own**
separate local ref via `useRef<HTMLDivElement>(null)` at line 121. The parent's ref is
silently discarded; whatever the caller intended to read/observe via that ref (e.g. the
parent's own `ref={viewerRef}` at line 374) is disconnected from the div `SplitView`
actually renders.

- [ ] Decide intent: either `SplitView` should accept and attach the passed-in
      `viewerRef` (drop its local one), or the prop is genuinely unused and should be
      removed from both the type and the call site.
- [ ] Apply the fix and confirm split-view drag/slider behavior (which reads
      `viewerRef.current.getBoundingClientRect()`) still works correctly.
- [ ] `pnpm run lint` clean.

**Acceptance:** exactly one `viewerRef` is in play for `SplitView`, and it's the one actually attached to the rendered DOM node.

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
