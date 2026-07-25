# AI Worker Rules

## Purpose

This document defines engineering standards, coding rules, review criteria, and testing expectations for the Kollektiv repository. Every rule here is grounded in the actual toolchain (`tsconfig.json`, `eslint.config.js`, `package.json`) or an established pattern in the tree — not generic advice.

The gate is `pnpm lint` (`tsc --noEmit`). If it doesn't pass, the change isn't done.

## 1. Language and Compiler

TypeScript 5.4, `strict: true`, ESM (`"type": "module"`). The tsconfig enforces these — treat a failure as a bug, not a nuisance:

- **`noUnusedLocals` / `noUnusedParameters`** — dead imports and unused params fail the build. Prefix a deliberately-unused param with `_` (e.g. `_auth`).
- **`noFallthroughCasesInSwitch`** — every `case` breaks or returns.
- **`isolatedModules` + `moduleDetection: force`** — use `import type { … }` for type-only imports.
- **`allowImportingTsExtensions`** — bundler-mode resolution; relative imports omit extensions.
- Path alias `@/*` maps to repo root. Prefer it for cross-tree imports; match the surrounding file.

**No dead statements.** When you remove logic, remove the whole block including its comment — don't leave a labelled empty statement behind.

**`any` is a smell, not a ban.** Tolerated only for the browser-global escape hatch pattern (`(window as any).__X`). Anywhere else, type it.

## 2. React

React 19, function components + hooks throughout. Class components **only** for error boundaries.

- **Hooks rules are linted** (`react-hooks/exhaustive-deps: warn`). Treat warnings as things to fix or justify, not ignore.
- **Stable callbacks.** Functions used inside `useEffect` deps or passed to children should be `useCallback`-wrapped. Don't wrap trivial inline handlers.
- **Effects clean up.** Any `addEventListener`, `setInterval`, `setTimeout`, or GSAP tween started in an effect returns a teardown.
- **`key` on lists and on remounts.** Use deliberate `key` values to control remount behavior; comment non-obvious keys.

## 3. Styling

Tailwind 3 + DaisyUI 4 utility classes. No CSS-in-JS, no styled-components.

- **Buttons use the `form-btn` class.** Don't hand-roll button styling when `form-btn` (± a modifier) covers it.
- **Inputs use `form-input`.** Same reasoning.
- **Theme-aware.** Don't hardcode colours that break a theme; use DaisyUI tokens (`text-primary`, `bg-base-200`, `text-error`, `border-success/30`, …).
- **Reduced motion.** GSAP/Framer animations must degrade for `prefers-reduced-motion`. New animation adds an explicit check.

## 4. State, Settings and Storage

- **Single settings object.** All app config lives in `LLMSettings`, persisted to `localStorage` under `kollektivSettingsV4`. Add a new setting by: (a) a field on `LLMSettings` in `types.ts`, (b) a default in `defaultLLMSettings`, (c) a hydration line in `loadLLMSettings` (`parsed.x ?? default`).
- **Persistence is opt-in per field.** `SetupPage.handleSettingsChange` only calls `updateSettings` for fields in an allow-list. A new setting that must survive reload must be added to that list.
- **Prefer top-level fields** for values read outside their feature. Domain-shared primitives go top-level, not nested under a feature section.

## 5. Auth and Tokens

- **Never trust a bare `isConnected` boolean for OAuth.** Use `utils/googleAuth.ts` `isGoogleAuthValid()` — do not re-derive expiry inline.
- **Build identity objects through the factory.** Construct a `GoogleIdentityConnection` via `buildGoogleIdentity()`, not by hand.
- **Client ID ≠ API key.** An OAuth `client_id` and a developer API key are different credentials and are **not** interchangeable.
- **Secrets never land in the repo.** No API keys, client secrets, or tokens in source, `package.json` scripts, or committed HTML.

## 6. Server (`server.ts`)

There is no REST backend — `server.ts` is a dev host + proxy + native-tool bridge only.

- **`/proxy-remote` must be constrained.** New proxy routes follow an allowlist derived from configured provider URLs. Don't add an open forwarder.
- **A route that redirects to a static asset must ship that asset.** Verify against a clean `pnpm build` (`dist/`), not just local dev.
- **No `app.get('*')`.** Express 5 + path-to-regexp 8 reject it; use `app.use()` fallback.

## 7. Constants and Duplication

- **De-hardcode drift-prone strings.** Model names, default URLs, and similar go in `constants/`, imported by both client and server — not copy-pasted string literals.
- **Extract logic used in two places once.** If the same shape appears in two hunks, factor it.

## 8. Comments

Comments explain *why* / constraints the code can't show. Match the surrounding file's density. No commented-out code, no `;`-terminated comment stubs, no "TODO later" without a corresponding ISSUES.md entry.

## 9. Coding Rules (Summary)

- Keep changes narrow and aligned with the current architectural layer.
- Prefer existing abstractions over adding new parallel helpers.
- Preserve the distinction between UI logic, service logic, and persistence logic.
- Make provider and storage decisions explicit rather than hidden in one-off code paths.

## 10. Review Checklist

Before finishing work, confirm that:

- the change respects the existing settings and persistence patterns
- provider capability checks still match the intended feature behavior
- the change does not introduce unused imports, broken hooks, or missing cleanup logic
- user-facing error states remain clear and actionable

## 11. Testing

- **Unit:** Vitest (`pnpm test`). Cover high-risk *pure* logic first (string helpers, migration/defaults, serialization). New pure, non-trivial logic ships with a test.
- **E2E:** Playwright (`pnpm test:e2e`). One smoke test (boot with OPFS-stubbed picker → dashboard) is the canary refactors rely on.
- New logic should be testable, and regressions should be caught at the smallest useful level.

## 12. What the Tooling Already Enforces (Don't Nitpick in Review)

Formatting, unused locals/params, switch fallthrough, hook-dep warnings. Review attention goes to correctness, the rules above, and the spec — not to things `tsc`/ESLint already flag.
