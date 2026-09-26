# Directory Structure

## Repository layout

This repository is organized around a single app root rather than a formal monorepo. The implementation lives at the repository root, with feature-oriented folders for UI, services, state, utilities, and constants.

- components/: React UI shell and feature screens. Shared primitives: `Modal.tsx`, `EmptyState.tsx`, `AnimatedPanels.tsx`; route transitions in `components/transitions/` (`useTransitionDirector.ts`, `TransitionOverlay.tsx`, `routeFx.ts`)
- hooks/: app-shell hooks extracted from `App.tsx` (`useBootSequence`, `useAppShell`, `useAppEventBus`, `usePageTransitions`, `useAppTheme`) plus feature hooks
- image-editor/: the layered image editor (core document model, tools, WebGL renderer, UI)
- services/: provider integrations, assistant orchestration, multi-engine web search (`services/webSearchEngines/`), content-reach channels (`services/reachChannels/youtube/`, `services/reachChannels/twitter/`, `services/rssService.ts`, `services/githubService.ts`, `services/exaService.ts`, `services/redditService.ts`), and non-UI logic
- contexts/: shared React state providers
- utils/: helpers, storage, event bus, parsers, and integrity logic
- constants/: defaults, model catalogs, themes, presets, and modifier data
- src/: server-side middleware and validation (`src/middleware/security.ts`, `src/middleware/validate.ts`, `src/schemas/*.ts`) — not part of the client bundle
- server.ts: the Express dev host / proxy bridge (~1,150 lines); route groups extracted to `routes/` (`reachRoutes`, `searchRoutes`, `mcpRoutes`, `localModelRoutes`, `topazRoutes`)
- e2e/: Playwright specs (run locally with `pnpm test:e2e` and in the CI `e2e` job, `.github/workflows/ci.yml`)
- public/: static assets served as-is (fonts, background images, `boot-diagnostics.js`)
- docs/: architecture notes (this handbook), issue tracker, and project documentation

## Naming

- React components use PascalCase and live in the components tree.
- Feature logic and helper modules use camelCase file names.
- Shared types and schema-like structures are centralized in types.ts and the constants modules.
- New additions should follow the existing folder shape rather than introducing a second parallel structure.

## Related

- [ARCHITECTURE_CONSTITUTION.md § Repository Structure](../00_FOUNDATION/ARCHITECTURE_CONSTITUTION.md#repository-structure) and [§ Security Hardening](../00_FOUNDATION/ARCHITECTURE_CONSTITUTION.md#security-hardening) — the fuller picture behind the `src/`/`server.ts` entries above
- [AI_WORKER_RULES.md](../09_AI_WORKER/AI_WORKER_RULES.md) — the naming/convention rules enforced on top of this layout
