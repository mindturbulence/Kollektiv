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
- [x] Verify `pnpm run build` copies it into `dist/` — confirmed:
      `dist/spotify-callback.html` exists after a clean `pnpm run build`.
- [ ] **Manual, needs a live Spotify app + browser:** fresh clone → `pnpm install &&
      pnpm build && pnpm preview` → complete a Spotify connect end to end.

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
- [ ] **Manual, needs a live Google session:** with an expired Google token, confirm
      a Gmail tool triggers a successful silent refresh (no full re-consent) when a
      GSI session is available.

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
- [x] Grep for any other orphaned `mcp`/`MCP` references in `LLMChatPanel.tsx` and
      confirm none are dead. Confirmed: `grep -in "mcp" components/LLMChatPanel.tsx` → no matches.
- [x] `pnpm run lint` clean.

**Acceptance:** no dead statements, no scratch files, `.gitignore` prevents recurrence. ✅ Verified.

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
- [ ] **Manual, user-only — cannot be automated:** rotate/regenerate the key in
      Obsidian's Local REST API plugin settings — the old value is exposed in git
      history and code fixes alone don't invalidate it. Update your local `.env`
      with the new value afterward.

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

## ISSUE-8 — `SplitView`'s `viewerRef` prop is passed but never used · LOW · ✅ FIXED

Found while fixing ISSUE-7. `components/ImageCompare.tsx:389` passed `viewerRef={viewerRef}`
into `SplitView`, and `SplitView`'s prop type declared `viewerRef` — but the component
destructured only `{ imageA, imageB, transform }` and created its **own** separate local
ref via `useRef<HTMLDivElement>(null)`. The parent's ref was silently discarded.

- [x] Decided intent: the parent's `viewerRef` (`ImageCompare.tsx:374`) is attached to a
      *different* element — the outer `motion.div` used for wheel-zoom/pan handling —
      not the same node `SplitView` needs for its slider drag math. `SplitView`'s own
      local ref was already correct and sufficient for its own purpose. The prop was
      genuinely unused, not a wiring bug: removed it from both the type
      (`SplitView: React.FC<ViewProps>`, dropped the intersection) and the call site.
- [x] Confirmed split-view drag/slider behavior is unchanged: `SplitView` still reads
      its own local `viewerRef.current.getBoundingClientRect()`, untouched.
- [x] `pnpm run lint` clean.

**Acceptance:** exactly one `viewerRef` is in play for `SplitView`, and it's the one actually attached to the rendered DOM node. ✅ Verified.

---

## ISSUE-9 — Research mode's chat is unreachable: `ResearchChatArea` is built but never mounted · HIGH · ✅ FIXED

`docs/research-panel-plan.md` §3.2 specifies a three-panel research layout (Sources |
Conversation | Findings). `components/ResearchChatArea.tsx` is a fully built,
functional chat UI for research mode — calls `sendMessage`, renders citations — but
it is never imported into `components/LLMChatPanel.tsx`. The middle column actually
rendered by `ResearchPanelBody` (`LLMChatPanel.tsx:724-751`) is a static placeholder
`<div>` of copy text ("Research Project Active... ask the assistant questions") with
no input, no send button, no message list. A user who opens a research project has
no way to actually converse with the assistant about it — the entire point of
Research mode is inaccessible from the UI, even though the plumbing behind it
(`useResearchProject.sendMessage`, citation parsing) works.

- [x] Imported `ResearchChatArea` into `ResearchPanelBody` (`LLMChatPanel.tsx`),
      replacing the placeholder `<div>` in the middle column.
- [x] Confirmed `ResearchChatArea` reads `messages`/`sendMessage`/`isProcessing`/
      `error`/`clearError` from `useResearch()` — no new props needed.
- [x] Widened the panel in research mode: `researchMode` now forces the same
      full-width (`left-[42px] w-auto`) class the manual expand toggle uses, so the
      three columns have room (previously stuck at the narrow 400/480px chat width).
- [x] `tsc --noEmit` clean.
- [ ] Manual test: open a research project, send a message, confirm a real
      assistant response with citations renders (see ISSUE-11 — answers won't be
      source-aware until that's also fixed).

**Acceptance:** a user can open a research project, type a message in the middle
column, and get a real assistant reply with citations rendered — end to end, no
placeholder text anywhere in the flow. ✅ Verified via code inspection; manual send
still recommended (and citations depend on ISSUE-11).

---

## ISSUE-10 — Research "Save Findings" appends instead of overwriting, duplicating content on every save · HIGH · ✅ FIXED

`hooks/useResearchProject.ts:242-245` (`saveFindings`) calls
`researchVault.findings.append(projectSlug, text, fm)`. `services/researchVaultService.ts:243`
implements `append` by joining the new text onto the existing file with
`\n\n---\n\n`. `components/ResearchFindingsPanel.tsx`'s edit/save flow sends the
**entire current buffer** (not just new text) through this path each time the user
clicks Save — so every edit-and-save cycle appends a full duplicate copy of the
findings doc onto itself. A few edits in, the findings file balloons into repeated
copies of its own history.

- [x] Added `researchVault.findings.save(slug, text, fm)` — direct overwrite,
      no append/join.
- [x] Pointed `useResearchProject.saveFindings` at `findings.save` instead of
      `findings.append`.
- [x] Kept `findings.append` as a distinct method — still used by the
      `research:findingsAppended` event path and reserved for the future
      `append_findings` assistant tool (ISSUE-12), so UI-save and assistant-append
      stay unambiguous.
- [x] `tsc --noEmit` clean.
- [ ] Manual test: open a project with existing findings, edit, save 3 times,
      confirm the file contains one copy of the final text, not three.

**Acceptance:** repeated Save clicks in the Findings Panel never duplicate content —
the file always reflects exactly the last saved buffer. ✅ Verified via code
inspection; manual repeated-save test still recommended.

---

## ISSUE-11 — Research assistant answers are never source-aware (`buildSystemIdentity` never receives source context) · MEDIUM · ✅ FIXED

`docs/research-panel-plan.md` §5 specifies `buildSystemIdentity(settings, sourceContext?)`,
truncating/injecting added sources so the assistant can answer questions about them
and cite them. Actual signature in `services/assistantService.ts` is
`buildSystemIdentity(settings: LLMSettings): string` — no second parameter at any of
its 4 call sites, confirmed via repo-wide grep. `hooks/useResearchProject.ts`'s
`sendMessage` never reads project sources from disk before building the prompt. The
`SourceContext` type (`types.ts:55-58`) exists but nothing constructs or passes it.
Citation parsing/rendering (`useResearchProject.ts:201-219`, `ResearchChatArea.tsx:75-90`)
is real and correct, but it's parsing a footer format the model has no instructions
to produce, since it's never told about sources at all.

- [x] Extended `buildSystemIdentity(settings, sourceContext?)` to inject truncated
      (4KB) source text + citation-format instructions, per plan §5.1.
- [x] Threaded `sourceContext` through `runAssistantTurn` and all 4 provider
      functions (`runGeminiTurn`/`runFallbackTurn`/`runOllamaTurn`/`runOpenRouterTurn`)
      so every backend gets it, not just Gemini.
- [x] `useResearchProject.sendMessage` now reads each source's content via
      `researchVault.sources.readContent` and passes the assembled `SourceContext[]`
      into `runAssistantTurn`. Side effect: removed a pre-existing duplicate-identity
      bug where `sendMessage` manually injected a `buildSystemIdentity(settings)`
      system message that `runGeminiTurn` would then prepend a *second* time.
- [x] `tsc --noEmit` clean.
- [ ] Manual test: add a source to a project, ask a question about its content,
      confirm the answer references it and citations render.

**Acceptance:** research-mode answers demonstrably use added source content, and
citation footers appear when sources are relevant. ✅ Verified via code inspection;
manual source-aware-answer test still recommended.

---

## ISSUE-12 — `append_findings` and `expand_source` assistant tools were never added · MEDIUM · ✅ FIXED

`docs/research-panel-plan.md` §5.2/5.3 specify two new assistant tools so the model
itself can append findings during a conversation and expand truncated source
excerpts on demand. Repo-wide grep of `services/assistantTools.ts` (full ~60-entry
tool list) and the whole repo for `append_findings`/`expand_source` returns zero
matches for either — neither tool exists. The active-project tracker
(`setActiveProject`/`getActiveResearchProject`, `researchVaultService.ts:6-9`) is
wired correctly on the UI side (`useResearchProject.ts:112-113,130`) but nothing
ever calls `getActiveResearchProject()`, since no tool needs to know the active
project.

- [x] Added `append_findings` tool to `services/assistantTools.ts`, backed by
      `researchVault.findings.append` (ISSUE-10's overwrite `findings.save` is
      untouched — this stays the distinct append path) and emits
      `research:findingsAppended` so the Findings panel refreshes live.
- [x] Added `expand_source` tool — resolves a source by citation `index` (via the
      active project's `sourceFiles` array) or by `fileName`, returns the
      untruncated content via `researchVault.sources.readContent`.
- [x] Both tools no-op with a clear error when `getActiveResearchProject()` returns
      null, and when no vault folder is connected.
- [x] `tsc --noEmit` clean.
- [ ] Manual test: in research mode, ask the assistant to "note that down as a
      finding" and confirm it lands in `findings.md` without a UI save click.

**Acceptance:** the assistant can append findings and expand sources mid-conversation
without the user manually driving the Findings/Sources panels. ✅ Verified via code
inspection; manual in-conversation test still recommended.

---

## ISSUE-13 — Noise cancellation module is built and tested but never wired into the live voice pipeline · HIGH · ✅ FIXED

`docs/plans/2026-07-friday-advantages-plan.md` Phase 2 specifies integrating
`NoiseCancellation` into the live voice path. `services/noiseCancellation.ts`
correctly implements the documented interface, `services/noiseCancellation.test.ts`
has 10 passing tests, the WASM asset and `vite.config.ts` static-copy targets are
all present — but a repo-wide grep for `NoiseCancellation` finds it used only in its
own file and test. `services/liveAssistantService.ts` never imports or instantiates
it. Users get zero noise cancellation despite the dependency, build config, and
settings-adjacent code all suggesting the feature is live.

- [x] Wired `NoiseCancellation` into `services/liveAssistantService.ts`'s
      `startMic()`: registers on `micCtx`, creates a node from the mic source, and
      routes it between the mic source and the `pcm-capture` AudioWorkletNode
      (upstream of VAD, which reads from `micStream`/`micCtx` directly and is
      unaffected). Falls back to the raw mic source if `isSupported` is false or
      `register()`/`create()` throws.
- [x] Decided: runs silently always-on, no settings toggle or indicator added —
      matches the plan's default-on framing; `vadStatus`/`enabled` remain available
      on the instance for a future indicator if wanted.
- [x] Added `noiseCancellation.dispose()` to `disconnect()`'s cleanup.
- [x] `tsc --noEmit` clean.
- [ ] Manual test: start a live voice session with background noise present,
      confirm perceptibly cleaner audio / VAD behaves better than before wiring.

**Acceptance:** `NoiseCancellation` is actually invoked somewhere in a real user
session, not just in its own unit test. ✅ Verified via code inspection; manual
noisy-mic test still recommended. Scope note: only the Gemini Live backend
(`liveAssistantService.ts`) was wired — OpenAI Realtime and ElevenLabs backends
manage their own audio I/O and were out of scope for this plan.

---

## ISSUE-14 — MCPVault Obsidian migration was never wired in; plan's "Complete, 109/109 passing" status is false · HIGH · ⚠️ PARTIALLY FIXED (opt-in only, by design)

`docs/superpowers/plans/2026-07-20-mcpvault-integration-plan.md` header claims
"Status: Complete — implemented 2026-07-20. All 7 phases done, 109/109 tests
passing." Verified false: `grep -rn "kollektivMcp\|startKollektivMcp\|obsidianVaultMcp\|startObsidianVaultMcp"`
across the repo hits only the new modules' own files, a scratch test script, and the
plan doc itself — zero references in `server.ts`. `git log --all -S` for
`kollektivMcp`, `obsidianVaultMcp`, and `OBSIDIAN_VAULT_PATH` against `server.ts` is
empty on every branch/commit — this was never wired, at any point in history.
`server.ts:1428-1457` still spawns the old `obsidian-mcp-server` via `npx`, gated on
`OBSIDIAN_API_KEY`, exactly as before this plan existed. Two competing, unwired
replacement modules currently sit dead in the tree: `services/obsidianVaultMcp.ts`
(matches the plan's simple wrapper spec, but is **untracked in git**) and
`services/kollektivMcp.ts` (committed at `c096abd`, a more advanced multi-sub-server
MCP aggregator that supersedes the plan's design) — neither is imported anywhere.

- [x] Decided which module wins: `kollektivMcp.ts` (multi-session, multi-sub-server
      aggregator, also embeds Playwright) over `obsidianVaultMcp.ts` (untracked,
      single-session wrapper — both wrap the same `@bitbonsai/mcpvault` `createServer`,
      so no tool-set difference between the two candidates). Deleted
      `services/obsidianVaultMcp.ts`.
- [x] **Scope checkpoint (user decision, not autonomous):** verified via
      `@bitbonsai/mcpvault`'s built output that its tool names (`read_note`,
      `write_note`, `search_notes`, `get_vault_stats`, `move_file`, ...) are
      completely different from the outgoing `obsidian-mcp-server`'s `obsidian_*`
      names — `WORKSPACE_CAPABILITIES` and the assistant's `obsidian_` prefix filter
      hardcode the old names. Since `OBSIDIAN_API_KEY` is only ever set on the
      original author's machine (ISSUE-6/15), a full replacement would break the
      only currently-working Obsidian integration with no fallback. Asked the user;
      they chose **additive/opt-in**, not full replacement.
- [x] Wired `kollektivMcp.ts` into `server.ts` as a new, side-by-side opt-in path:
      gated on `OBSIDIAN_VAULT_PATH`, calls `startKollektivMcp({ vaultPath, port: 3012 })`,
      tracked via `kollektivMcpInstance` and stopped in `shutdown()`. The legacy
      `obsidianMcpProc`/`startObsidianMcp()` child-process spawn is untouched and
      still works exactly as before on `OBSIDIAN_API_KEY` — it now just also checks
      `OBSIDIAN_VAULT_PATH` isn't set first, so the two paths can't both claim port 3012.
- [x] `tsc --noEmit` clean.
- [ ] **Deferred by the scope checkpoint above, not forgotten:** rename/retire
      `OBSIDIAN_API_KEY`/`OBSIDIAN_BASE_URL`/`OBSIDIAN_VERIFY_SSL`; update
      `package.json`'s `obsidian:mcp`/`obsidian:mcp:http` scripts; rewrite
      `WORKSPACE_CAPABILITIES` and `liveAssistantService.ts:337`'s
      `name.startsWith('obsidian_')` filter for the new tool names; add an
      `obsidian-vault` preset to `constants/mcpPresets.ts` (ISSUE-15); add unit
      tests for `kollektivMcp.ts`; clean up stale `obsidian-mcp-server` references
      in `CONTRIBUTING.md`/`ISSUES.md`. None of this can land until the user has
      verified the new module against their real vault via `OBSIDIAN_VAULT_PATH`
      and decided they're ready to retire the key-based path.
- [ ] Fix or remove the plan doc's false "Complete" status header — still false;
      deferred alongside the above (a real completion should update both together).

**Acceptance (revised — full replacement deferred by user decision):** the new
module is reachable and testable via `OBSIDIAN_VAULT_PATH` without touching the
existing `OBSIDIAN_API_KEY` path; full migration (retiring the old path, matching
capability text/tool names to the new tool set) is tracked as the remaining
open items above, not silently dropped.

---

## ISSUE-15 — Obsidian Second Brain has no Settings UI, contradicting its own capabilities text · MEDIUM · ✅ FIXED

`docs/superpowers/plans/2026-07-18-features-plan.md` Feature 1 called for vault-path
configuration in `components/settings/IntegrationsSection.tsx`. That never happened
under any name — `IntegrationsSection.tsx`, `PredefinedMcpSection.tsx`, and
`McpSection.tsx` all have zero mentions of "obsidian". Instead, Obsidian access is
entirely gated by a server-side `OBSIDIAN_API_KEY` env var
(`server.ts:1424-1432`) that only the original author's machine has ever had set.
Meanwhite `services/assistantService.ts:30`'s `WORKSPACE_CAPABILITIES` text tells
the model/user the vault can be "connected in Settings > MCP" — that surface does
not exist, so the instruction is actively misleading.

- [x] Corrected `WORKSPACE_CAPABILITIES`'s wording instead of building UI: since
      ISSUE-14's full migration (the only thing that would justify a Settings UI —
      a stable, user-facing config surface) was deliberately deferred to an opt-in
      env var, adding UI now would front a feature not ready to be user-facing.
      Text now says "requires OBSIDIAN_API_KEY set in the server's environment
      before startup — there is no Settings UI for this yet" instead of pointing at
      a nonexistent "Settings > MCP" surface.
- [x] `tsc --noEmit` clean.
- [ ] Revisit once ISSUE-14's full migration lands: add real Settings UI then
      (vault path entry, following the `PredefinedMcpSection.tsx` pattern), and
      update this capabilities text again to point at it.

**Acceptance:** the capabilities text the assistant relies on accurately describes
how a user actually enables Obsidian access today. ✅ Verified — text now matches
the real (env-var-only, no-UI) mechanism.

---

## ISSUE-16 — Minor unfinished/deviated items from plan verification (grab-bag) · LOW · ✅ FIXED

Small, independent loose ends surfaced verifying `docs/plans/2026-07-23-brahma-gaps-plan.md`
and `docs/superpowers/plans/2026-07-18-features-plan.md` against current code. None
block core functionality; listed together since each is a one-off.

- [x] `browser_close_tab` assistant tool added to `services/assistantTools.ts`,
      backed by the already-existing `browserOperatorResolver.closeTab`, matching
      `browser_switch_tab`'s pattern exactly.
- [x] Command Palette (`components/CommandPalette.tsx`) accessibility: added
      `role="combobox"`/`aria-expanded`/`aria-controls`/`aria-activedescendant` to
      the input, `role="listbox"` + `id` on the results container, `role="option"`/
      `id`/`aria-selected` on each result button. Focus trap: moved `handleKeyDown`
      from the input's `onKeyDown` to the dialog's outer `onKeyDown` (event bubbling
      means it now fires regardless of which element inside has focus) — Tab was
      already fully hijacked as an alternate "execute" action with `preventDefault()`
      unconditionally, so once the handler covers the whole dialog, keyboard focus
      genuinely cannot escape it.
- [x] `components/widgets/QuickActionsWidget.tsx` — added the missing "Toggle Live"
      (`useLiveAssistantContext().toggleLive()`, confirmed `Dashboard` renders inside
      `App.tsx`'s `<LiveAssistantProvider>`) and "New Note" (emits
      `togglePanel`/`'clipping'`, the same event the header's note icon uses to open
      the Notes/Clipping panel) actions — all 6 planned actions now present.
- [x] `chromeLauncher.kill()` (`server.ts` shutdown): added a synchronous
      `killChildProcessesSync` covering `chromeLauncher`/`obsidianMcpProc`/
      `playwrightMcpProc`, registered on both `process.on('exit', ...)` (sync-only,
      catches a plain `process.exit()` elsewhere) and `process.on('uncaughtException', ...)`
      (logs, cleans up, then exits 1 instead of silently swallowing the crash).
      Idempotent with the existing `SIGINT`/`SIGTERM` `shutdown()` — harmless if both fire.
- [x] `components/ResearchSourcesPanel.tsx`: implemented click-to-preview. The
      plan's own pseudocode only sketched a bare `previewFile` state hook with no
      rendering — built a small modal that loads the source's content via
      `researchVault.sources.readContent` (same fileSystemManager pattern used in
      `LLMChatPanel.tsx`) and renders it with the same `react-markdown`/`remark-gfm`
      pairing `ResearchChatArea.tsx` already uses.
- [x] `components/AddSourceModal.tsx`'s vault-browse tab: replaced the stub with a
      real single-level directory browser using `fileSystemManager.listDirectoryContents`
      (same pattern as `ClippingPanel.tsx`'s Files tab) — folders navigate deeper,
      files call `addSource({ kind: 'vault-file', vaultPath })`. Breadcrumb path +
      "Up" button for navigation back toward vault root.
- [x] `e2e/smoke.spec.ts`: added a Web Viewer click-to-open test, factoring the
      shared boot steps into a `bootToAppShell` helper (byte-identical logic to the
      original single test, just extracted). Clicks the header's "Web Browser"
      button (accessible name from `HUDNavItem`'s `title` prop) and asserts the
      panel's real `Close web viewer` button becomes visible (`WebViewerPanel`
      toggles an actual `visibility` style, not just `aria-hidden`).
      **Found and fixed a real, unrelated build-blocker while verifying this:**
      `pnpm build` was failing repo-wide — `vite-plugin-static-copy@4.1.1` (declared
      `^4.1.1` in `package.json`) requires Vite 6/7/8 as a peer, but the project
      pins Vite `^5.2.11`. Pinned it to `^3.4.0` (confirmed peer-compatible with
      Vite 5) and reinstalled; `pnpm build` now succeeds.
      **Could not get a green e2e run, and this is NOT my test's fault:** after
      fixing the build, both my new test and the pre-existing original test fail
      identically, timing out waiting for `SELECT_VAULT_FOLDER` — confirmed by
      checking out `e2e/smoke.spec.ts` at HEAD (byte-identical to before my change)
      and running it in isolation, same failure. This is a pre-existing e2e
      environment issue (the STORAGE_INIT gate's folder-picker button never
      appears/times out in this sandbox), unrelated to this change and out of
      scope for ISSUE-16 — flagged for separate investigation.

**Acceptance:** each bullet is either implemented or explicitly deferred with a
one-line reason; no need to batch these — fine to knock out individually as time
allows. ✅ All 7 implemented and `tsc --noEmit` clean. One new finding surfaced
along the way (pre-existing e2e `SELECT_VAULT_FOLDER` timeout, unrelated to any
change here) — not tracked as a numbered issue yet since it needs its own
investigation session, but noted in the last bullet above so it isn't lost.

---

## ISSUE-17 — OpenAI/ElevenLabs voice-engine credentials filed under "Google Cloud" tab, undiscoverable · MEDIUM · ✅ FIXED

`components/settings/IntegrationsSection.tsx`'s OpenAI API Key, ElevenLabs API Key,
and ElevenLabs Agent ID fields lived inside `renderGoogleCloud()` (the `google` tab,
labeled "Google Cloud" / "Google identity, YouTube channel, and API credentials" in
`config.tsx:19`) — nothing there hints at voice engines. `AssistantSection.tsx`'s own
Voice Engine description already claimed the OpenAI key lives in "the AI Engine tab,"
contradicting where the field actually was. Net effect: a user who previously saw
ElevenLabs setup couldn't find it again, because it was never under a tab related to
voice or assistants.

- [x] Moved OpenAI/ElevenLabs API key + Agent ID fields out of `renderGoogleCloud()`
      into a new "Voice Engine Credentials" group in `renderLLM()` (the `llm` /
      "AI Engine" tab), unconditioned on `activeLLM` since voice engine is independent
      of the text-LLM provider.
- [x] Updated `AssistantSection.tsx`'s Voice Engine description to point at
      "Settings > AI Engine > Voice Engine Credentials" for both providers instead
      of only naming OpenAI's location and leaving ElevenLabs unstated.
- [x] `tsc --noEmit` clean.

**Acceptance:** OpenAI and ElevenLabs credentials live under the same tab the
Assistant section's own copy says they do. ✅ Verified.

---

## ISSUE-18 — OpenRouter provider tab had no configuration UI at all · HIGH · ✅ FIXED

`components/settings/IntegrationsSection.tsx` had a "OpenRouter" `ProviderTab` (AI
Engine tab) alongside Gemini/Anthropic/Ollama/Cloud Ollama/Llama.cpp, but only those
other five had a matching `{settings.activeLLM === '...' && (...)}` configuration
block — OpenRouter had none. Clicking it showed nothing: no API key field, no model
field. Confirmed via `services/openrouterService.ts:24`, which on missing key tells
the user "Please set it in Settings -> Integrations -> OpenRouter" — a location that
did not exist. Separately, `contexts/SettingsContext.tsx` already fetched OpenRouter's
live model list into `availableOpenRouterModels`, but `components/SetupPage.tsx`
never destructured it or built an options array, and `IntegrationsSectionProps` had
no prop to receive it — the data pipeline was complete and dead-ended before reaching
any UI.

- [x] Added `openrouterModelOptions` prop end-to-end: destructured
      `availableOpenRouterModels` in `SetupPage.tsx`, built the `{label,value}[]`
      array (mirroring `cloudModelOptions`/`llamacppModelOptions`), passed it into
      `<IntegrationsSection>`, added it to `IntegrationsSectionProps`.
- [x] Added the missing "OpenRouter Configuration" `SettingsGroup` in
      `IntegrationsSection.tsx` (API Key input + Model `AutocompleteSelect`),
      matching the sibling providers' layout.
- [x] `tsc --noEmit` clean.

**Acceptance:** selecting OpenRouter as the active LLM shows a real API key + model
field, backed by the live OpenRouter model list. ✅ Verified.

---

## ISSUE-19 — No settings UI to change the ambient background music URL · MEDIUM · ✅ FIXED

`types.ts`'s `musicYoutubeUrl` (which YouTube video plays as dashboard ambient music)
had zero references anywhere under `components/settings/` — confirmed via repo-wide
grep. Its sibling `dashboardVideoUrl` (cinematic background video) has a full field +
reset-to-default button in `AppearanceSection.tsx`'s Background subtab;
`musicYoutubeUrl` had no equivalent anywhere. The only way to change which track
plays was the assistant's `update_app_settings` tool — on/off (`musicEnabled`) is
reachable live via the dashboard footer (`App.tsx:840`, `handleMusicToggle`), but the
URL itself was not user-configurable from any UI.

- [x] Added an "Ambient Music URL" field to `AppearanceSection.tsx`'s Background
      subtab, directly below Dashboard Video URL, same input+reset-button pattern.

**Acceptance:** the ambient music track is changeable from Settings > Appearance >
Background, not just via the assistant tool. ✅ Verified.

---

## ISSUE-20 — Rapid mic on/off clicking leaves a "ghost" live-assistant session running · HIGH · ✅ FIXED

`contexts/LiveAssistantContext.tsx`'s `start()`/`stop()` control a single
`liveRef` session, but `connect()` (all three backends — `LiveAssistant`,
`OpenAIRealtimeAssistant`, `ElevenLabsAssistant`) is a multi-step async sequence
(mic permission, WS/session handshake, VAD init), while `disconnect()`
(`services/liveAssistantService.ts:718-739`) only tears down fields that exist
*at the moment it's called*. Reported repro: click the mic on, click it off again
while it's still "connecting" — `toggleLive` correctly calls `stop()`, which calls
`disconnect()` immediately, but `this.session`/`this.micStream` are still
`undefined` at that point, so cleanup no-ops on them. The original `connect()`
call keeps running in the background and finishes assigning a real session +
open mic *after* `disconnect()` already ran — nothing left references the
instance to close it again, and `disconnect()` had already set
`this.closedByUs = true`, so even a later natural `onclose` is suppressed. Net
effect: a fully live mic/audio session keeps running, invisible, while the UI
toggle shows off.

- [x] Added a generation counter (`sessionIdRef`) to `LiveAssistantContext.tsx`,
      bumped on every `start()`/`stop()` call.
- [x] Each `start()` captures its own generation and no-ops its `onStatus`/
      `onCaption`/`onToolActivity`/`onSpeaking`/`onScreenShare`/`onCamera`
      handlers if superseded by a newer call before they fire.
- [x] After `await live.connect(...)` resolves, re-check staleness — if a newer
      `start()`/`stop()` happened meanwhile, call `disconnect()` again. By this
      point the session/mic fields are actually populated, so the second call
      genuinely tears them down instead of no-op'ing like the first.
- [x] Fixed a pre-existing missing `voiceProvider` dependency on `start`'s
      `useCallback` (it read `voiceProvider` but didn't list it).
- [x] `tsc --noEmit` clean.

**Acceptance:** rapid mic-toggle clicking (on, then off before "connecting"
finishes) never leaves an active session/mic running once the UI shows idle —
worst case is the connect() duration's worth of delay before cleanup, not
indefinite. ✅ Verified via code inspection; manual repro (rapid click on/off,
confirm mic indicator + assistant audio both actually stop) still recommended.

---

## ISSUE-21 — `e2e/smoke.spec.ts` times out waiting for `SELECT_VAULT_FOLDER`; pre-existing, not caused by any fix in this file · HIGH

Discovered while adding Web Viewer coverage for ISSUE-16. Both the new test and
the original single test (confirmed by checking out `e2e/smoke.spec.ts` at HEAD —
byte-identical to before this session's edit — and running it alone) time out
identically at `page.getByRole('button', { name: 'SELECT_VAULT_FOLDER' }).click(...)`
after `pnpm build && pnpm preview` (this run also needed the `vite-plugin-static-copy`
downgrade in ISSUE-16 to build at all — that part is fixed). The final DOM snapshot
at timeout shows the loader already at 100% with the `CONTINUE`/`CONTINUE WITHOUT
MUSIC` buttons rendered — i.e. the STORAGE_INIT gate (`SELECT_VAULT_FOLDER`) appears
to have already been passed by the time the assertion fires, suggesting either a
timing race in the Welcome screen's directory-picker flow, or the OPFS directory
handle persisting across what should be a fresh Playwright browser context (a known
Chromium OPFS quirk in some versions — the storage bucket isn't always partitioned
per-context the way cookies/localStorage are). Not root-caused — needs a dedicated
debugging session with `--headed` to actually observe the Welcome screen's behavior
frame-by-frame, since headless run only yields the final snapshot.

- [ ] Reproduce with `npx playwright test e2e/smoke.spec.ts --headed --workers=1`
      and observe whether `SELECT_VAULT_FOLDER` renders at all, renders and
      vanishes, or the OPFS stub in `bootToAppShell`'s `addInitScript` is resolving
      to an already-populated directory handle.
- [ ] If it's OPFS state leaking across contexts: check whether Playwright's
      Chromium revision in use partitions OPFS per `BrowserContext`, and whether a
      `storageState`-equivalent reset (e.g. clearing `navigator.storage` via CDP
      between tests) is needed.
- [ ] If it's a genuine timing race in `Welcome.tsx`'s directory-selection flow:
      trace `handleSelectDirectory` end to end for a path that could auto-advance
      without the button click completing.
- [ ] Once root-caused, confirm both `e2e/smoke.spec.ts` tests (the original boot
      test and ISSUE-16's new Web Viewer test) pass green.

**Acceptance:** `npx playwright test e2e/smoke.spec.ts` passes both tests without
manual intervention.

---

## ISSUE-22 — `send_gmail`/`delete_gmail` assistant tools had no confirmation gate · SECURITY · ✅ FIXED

Found during a codebase cleanup pass while independently re-verifying
`docs/superpowers/plans/2026-07-18-phase0-foundation-hardening.md` (its own
Task 5, never implemented despite the other 9/10 tasks being done).
`send_gmail` and `delete_gmail` in `services/assistantTools.ts` executed
immediately inside the autonomous tool loop (up to 8 rounds) with no user
confirmation — the assistant could send or permanently delete email on the
user's behalf with zero human-in-the-loop check.

- [x] Added `confirmSensitiveAction(summary): boolean` module-private helper —
      blocking, synchronous `window.confirm`, deliberately native (unmissable,
      impossible for the tool loop to bypass, matches the existing `confirm()`
      convention already used for the emergency reset in `App.tsx`).
- [x] Gated `send_gmail`: prompts with recipient + subject before sending;
      declining returns `'User declined: the email was NOT sent...'` so the
      model sees the refusal and doesn't retry.
- [x] Gated `delete_gmail`: prompts with trash-vs-permanent-delete distinction
      + message id before acting; declining returns a matching
      `'User declined:...'` message.
- [x] `tsc --noEmit` clean; `npx vitest run` — 174/174 tests pass (including
      `services/assistantTools.test.ts`, 8/8).
- [ ] **Manual, needs a live Google session:** ask the assistant to send a test
      email — confirm a native dialog blocks the send, and clicking Cancel
      produces the decline message with no network call made.

**Acceptance:** neither tool can send/delete anything without a synchronous,
unbypassable user confirmation. ✅ Verified via code inspection + full test
suite; manual live-session repro still recommended.

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
