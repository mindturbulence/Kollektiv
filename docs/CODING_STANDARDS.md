# Kollektiv — Coding Standards

> How code is written in this repo. Every rule here is grounded in the actual
> toolchain (`tsconfig.json`, `eslint.config.js`, `package.json`) or an
> established pattern in the tree — not generic advice. Companion docs:
> [ARCHITECTURE.md](ARCHITECTURE.md) (the system as it is),
> [ROADMAP.md](ROADMAP.md) (where it's going),
> [../CONTRIBUTING.md](../CONTRIBUTING.md) (how to contribute).

The gate is `pnpm run lint` (`tsc --noEmit`). If it doesn't pass, the change
isn't done. Everything below either the compiler already enforces (noted) or a
reviewer checks.

---

## 1. Language & compiler

TypeScript 5.4, `strict: true`, ESM (`"type": "module"`). The tsconfig turns on
rules you must design around — the compiler enforces these, so treat a failure
as a bug, not a nuisance:

- **`noUnusedLocals` / `noUnusedParameters`** — dead imports and unused params
  fail the build. When you delete a feature, delete its imports in the same
  change. (Prefix a deliberately-unused param with `_`, e.g. `_auth`.)
- **`noFallthroughCasesInSwitch`** — every `case` breaks or returns.
- **`isolatedModules` + `moduleDetection: force`** — use `import type { … }` for
  type-only imports (see the existing `import type { LLMSettings } from '../types'`).
- **`allowImportingTsExtensions`** — bundler-mode resolution; relative imports
  omit extensions as the codebase already does.
- Path alias `@/*` maps to repo root. Prefer it for cross-tree imports; existing
  code also uses relative paths — match the surrounding file.

**No dead statements.** The compiler does *not* catch an orphaned comment
followed by a bare `;`. When you remove logic, remove the whole block including
its comment — don't leave a labelled empty statement behind (this is exactly the
residue a scripted edit leaves; see ISSUES.md).

**`any` is a smell, not a ban.** The codebase uses `(window as any).__X` for a
handful of global bridges (`__GOOGLE_TOKEN_CLIENT`, `__YOUTUBE_API_KEY`). That
pattern is tolerated for the browser-global escape hatch only. Anywhere else,
type it.

## 2. React

React 19, function components + hooks throughout. Class components **only** for
error boundaries (the one documented exception in ARCHITECTURE.md §2).

- **Hooks rules are linted** (`react-hooks/exhaustive-deps: warn`). A missing
  dependency is a warning, not an error — but treat exhaustive-deps warnings as
  things to fix or justify, not ignore. If you intentionally omit a dep, keep the
  effect small and obvious.
- **Stable callbacks.** Functions used inside `useEffect` deps or passed to
  children should be `useCallback`-wrapped (see `SetupPage.tsx` `generateCodeVerifier`).
  Don't wrap trivial inline handlers that aren't dependencies.
- **Effects clean up.** Any `addEventListener`, `setInterval`, `setTimeout`, or
  GSAP tween started in an effect returns a teardown. Existing code does this
  (`SetupPage` storage-listener + poll interval, `VideoPlayerOverlay` keydown).
- **`key` on lists and on remounts.** `VideoPlayerOverlay` uses `key={embedSrc}`
  to force the iframe to reload — deliberate; comment such non-obvious keys.

## 3. Styling

Tailwind 3 + DaisyUI 4 utility classes. No CSS-in-JS, no styled-components.

- **Buttons use the `form-btn` class.** Don't hand-roll button styling when
  `form-btn` (± a modifier like `text-error px-4`) covers it. ROADMAP Phase 3
  calls out inconsistent button variants as debt — don't add to it.
- **Inputs use `form-input`.** Same reasoning.
- **Theme-aware.** The app has multiple DaisyUI themes (see `constants/themes.ts`)
  plus a `pipboy` special case handled by reading `settings.darkTheme`. Don't
  hardcode colours that break a theme; use DaisyUI tokens (`text-primary`,
  `bg-base-200`, `text-error`, `border-success/30`, …).
- **Reduced motion.** GSAP/Framer animations must degrade for
  `prefers-reduced-motion` (ROADMAP Phase 3 flags that headless/reduced-motion
  currently bypasses animation by accident). New animation adds an explicit check.

## 4. State, settings & storage

- **Single settings object.** All app config lives in `LLMSettings`, persisted to
  `localStorage` under `kollektivSettingsV4` via `utils/settingsStorage.ts`. Add a
  new setting by: (a) a field on `LLMSettings` in `types.ts`, (b) a default in
  `defaultLLMSettings`, (c) a hydration line in `loadLLMSettings` (`parsed.x ?? default`).
- **Persistence is opt-in per field.** `SetupPage.handleSettingsChange` only calls
  `updateSettings` for fields in an allow-list. A new setting that must survive
  reload has to be **added to that list** — this is a real footgun (a field can
  appear to save in the UI but not persist). Verify persistence manually.
- **Prefer top-level fields for values read outside their feature.** The Google
  API key was moved to a top-level `googleApiKey` precisely because nesting it
  under `youtube` made it fragile to read elsewhere. Domain-shared primitives go
  top-level.

## 5. Auth & tokens

- **Never trust a bare `isConnected` boolean for OAuth.** Access tokens expire
  (~1h). Validity = flag set **and** token present **and** not past `expiresAt`.
  Use `utils/googleAuth.ts` `isGoogleAuthValid()` — do not re-derive expiry inline
  (the old `Date.now() - connectedAt > 50*60*1000` checks are being removed;
  don't add new ones).
- **Build identity objects through the factory.** Construct a
  `GoogleIdentityConnection` via `buildGoogleIdentity()`, not by hand, so
  `expiresAt` is always captured from `expires_in`.
- **Client ID ≠ API key.** An OAuth `client_id` (`…apps.googleusercontent.com`)
  and a developer API key (`AIza…`) are different credentials and are **not**
  interchangeable. Never fall back from one to the other.
- **Secrets never land in the repo.** No API keys, client secrets, or tokens in
  source, `package.json` scripts, or committed HTML. Use env vars / settings UI.

## 6. Server (`server.ts`)

There is no REST backend — `server.ts` is a dev host + CORS/mixed-content proxy +
native-tool bridge only.

- **`/proxy-remote` must be constrained.** It forwards auth headers to an
  arbitrary `x-target-url`. New proxy routes follow an allowlist derived from
  configured provider URLs (ROADMAP Phase 0). Don't add an open forwarder.
- **A route that redirects to a static asset must ship that asset.** If a handler
  does `res.redirect('/foo.html')`, `foo.html` must be committed and land in the
  build output. Verify against a clean `pnpm run build` (`dist/`), not just local.
- **No `app.get('*')`.** Express 5 + path-to-regexp 8 reject it; use `app.use()`
  fallback (ROADMAP Phase 0).

## 7. Constants & duplication

- **De-hardcode drift-prone strings.** Model names, default URLs, and similar go
  in `constants/` (e.g. `DEFAULT_ANTHROPIC_MODEL` in `constants/llmDefaults.ts`),
  imported by both client and server — not copy-pasted string literals.
- **Extract logic used in two places once.** The Fowler smells (Duplicated Code,
  Divergent Change, Feature Envy, Primitive Obsession, …) are the review baseline.
  If the same shape appears in two hunks, factor it.

## 8. Comments

Comments explain *why* / constraints the code can't show (see the good
section-header comments in `VideoPlayerOverlay.tsx` and `googleAuth.ts`). Match
the surrounding file's density. No commented-out code, no `;`-terminated comment
stubs, no "TODO later" without a corresponding ISSUES.md entry.

## 9. Tests

- Unit: **Vitest** (`pnpm test`). E2E: **Playwright** (`pnpm test:e2e`).
- ROADMAP Phase 0 sets the priority: cover the highest-risk *pure* logic first
  (`llmService` string helpers, `settingsStorage` migration/defaults). New pure,
  non-trivial logic ships with a test. UI-glue and one-liners don't need one.
- One Playwright smoke (boot with OPFS-stubbed picker → dashboard) is the canary
  refactors rely on; don't break it.

## 10. What the tooling already enforces (don't nitpick in review)

Formatting, unused locals/params, switch fallthrough, hook-dep warnings. Review
attention goes to correctness, the rules above, and the spec — not to things
`tsc`/ESLint already flag.
