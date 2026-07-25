# Architecture Constitution

## Purpose

This document consolidates the repository's technical architecture, engineering standards, contribution workflow, and roadmap into a single reference for the Kollektiv architecture documentation set. It is intended to describe the system as it exists today, the engineering rules that govern change, and the structured direction for future work.

## System Overview

Kollektiv is a local-first, browser-based creative workbench for prompt engineers, visual artists, and AI researchers. The application combines prompt refinement, media vault management, AI-assisted chat and voice workflows, and a suite of generative-media utilities into a single-page experience. The product is designed around data sovereignty: the primary working state lives in the browser and in a user-selected local folder rather than in a centralized backend.

The architecture is intentionally hybrid:

- A React + TypeScript front end provides the interactive shell.
- A thin Express-based server acts as a development host, proxy bridge, and local-tool gateway.
- A browser-based storage layer uses the File System Access API, IndexedDB, and optional Google Drive integration.
- An LLM abstraction layer supports multiple providers while keeping the product experience consistent.

## Architectural Principles

1. Local-first by default
   - The experience should work without a remote service dependency for core vault and prompt workflows.
   - User data remains under user control and is persisted locally when possible.

2. Browser-centric execution
   - The application should rely on client-side state and browser APIs where they add resilience and privacy.
   - Server-side components are treated as bridges and proxies, not as the primary source of truth.

3. Strict engineering quality
   - TypeScript strict mode and lint gates are treated as mandatory quality controls.
   - New logic should be testable, explicit, and easy to reason about.

4. Progressive capability delivery
   - The product should evolve through incremental, shippable phases rather than monolithic rewrites.
   - The roadmap prioritizes stability, trust, and product polish before monetization.

## Core Architectural Layers

### 1. Presentation Layer

The presentation layer is implemented in the React application under the components tree. The top-level shell in the app orchestrates navigation, page transitions, ambient UI state, global feedback, and assistant integrations. The feature surfaces are separated into focused page components such as the prompt workbench, gallery, composer, image comparison, and settings experience.

Key responsibilities:

- route and tab state management
- page transitions and ambient shell behaviors
- feature-page composition
- global feedback and messaging

### 2. State and Storage Layer

State is distributed across React context, local storage-backed UI state, event-driven messaging, and the persistent vault. The storage strategy is built around a local-first model with optional Google Drive support.

Core storage components:

- IndexedDB for browser-stored handles and lightweight persistence
- File System Access API for direct local file handling
- Sidecar JSON metadata for media and prompt assets
- Settings persistence through a versioned settings object

This keeps the app resilient to reloads while preserving user-controlled data placement.

### 3. AI and Provider Layer

The LLM abstraction layer is the central integration point for prompt refinement, assistant behavior, and media generation. Provider-specific implementations are unified behind a common service interface, so the app can switch between Gemini, Ollama, OpenRouter, llama.cpp, and Anthropic without rewriting feature logic.

The provider layer covers:

- model-aware prompt formatting
- streaming response handling
- attachment preprocessing for documents and images
- provider-specific capability checks
- media generation pass-throughs for image, video, and audio workflows

### 4. Server and Bridge Layer

The Express server is not a traditional application backend. Its role is to provide development hosting, proxy services, shared local-tool access, and browser-safe routes for tools that require a local bridge. The server handles remote provider access, mixed-content compatibility, local MCP connections, browser control endpoints, and optional native-tool integration such as Topaz Gigapixel.

### 5. Vault and Media Layer

The vault is the repository of user work. It stores prompts, media artifacts, metadata, and generated outputs in a local-first structure that can be inspected and repaired. The vault layer includes integrity checks, manifest repair logic, sidecar metadata, and gallery-oriented browsing features.

## Repository Structure

The repository is organized around a small number of high-value areas:

- components/: UI shell, feature pages, and reusable interface modules
- services/: provider integrations, assistant orchestration, storage bridges, and non-UI logic
- contexts/: shared state providers for settings, assistant status, global busy state, and auth placeholder state
- utils/: storage helpers, integrity logic, parsers, event bus utilities, and shared data operations
- constants/: model catalogs, defaults, presets, themes, and modifier definitions
- src/: server-side middleware and request validation — `src/middleware/security.ts` (CSP, CORS, rate limiting), `src/middleware/validate.ts`, `src/schemas/*.ts` (Zod schemas). See [Security Hardening](#security-hardening) below.
- server.ts: the Express dev host / proxy bridge. Still one file (~1,500 lines), not yet split into `src/routes/*` + `src/services/*` — see [Security Hardening](#security-hardening).
- public/: static assets served as-is (fonts, background images, `boot-diagnostics.js`)
- docs/: product architecture (this handbook), issue tracker, and implementation notes

## Development and Engineering Standards

The engineering contract for this repository is explicit:

- TypeScript is used in strict mode and the lint gate is the compiler pass.
- Unused locals, unused parameters, and switch fallthrough are treated as real defects.
- React hooks and effects should be written with stable dependencies and cleanup logic.
- Styling should remain within the established Tailwind + DaisyUI system rather than introducing ad-hoc CSS.
- New settings must be added through the shared settings object and persistence flow so they survive reloads correctly.
- Secrets and long-lived credentials must never be committed to source control.

## Contribution Workflow

### Prerequisites

- **Node.js 20+** (`@types/node` is pinned to 20).
- **pnpm 11.5.3** — this is the declared package manager (`packageManager` field). Use it, not npm/yarn, so the lockfile stays consistent.
- A **Chromium browser** for running the app — it depends on the File System Access API and other Chromium-only web APIs.

### Development flow

1. Clone and install:
   ```bash
   git clone https://github.com/mindturbulence/Kollektiv.git
   cd Kollektiv
   pnpm install
   ```

2. Create a `.env` file in the root (copy `.env.example`):
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

3. Start the dev server:
   ```bash
   pnpm dev
   ```

   <!-- dev:https was removed (dev-with-ngrok.js deleted in 2026-07-25 cleanup) -->

### Everyday scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server (`npx tsx server.ts`) |
| `pnpm lint` | **`tsc --noEmit`** — the type gate; must pass |
| `pnpm test` | Vitest unit tests (`vitest run`) |
| `pnpm test:e2e` | Playwright E2E tests |
| `pnpm build` | Production bundle (`vite build`) |
| `pnpm preview` | Serve the built bundle |
| `pnpm deploy` | Builds then `gh-pages -d dist` |

### Branching & commits

- Branch off `main`. Don't commit directly to `main`.
- **Conventional Commits.** Use `type(scope): summary` format, e.g. `fix(google-auth): …`, `feat(footer): …`, `refactor(settings): …`. Common types: `feat`, `fix`, `refactor`, `chore`, `test`, `docs`.
- Reference an issue when one exists: `Fixes ISSUE-N` (see [ISSUES.md](../../../ISSUES.md)).
- Keep commits scoped to one logical change. A feature removal and its import cleanup belong in the **same** commit.

### Definition of done

A change is done when **all** of these hold:

1. **`pnpm lint` passes** (`tsc --noEmit`, clean).
2. **You ran it.** Tests for logic you touched (`pnpm test`), or the app for UI/flows.
3. **No scratch files staged.** No `*.bak`, no throwaway scripts, no editor cruft.
4. **Persistence verified** — if you added/changed a setting, confirm it survives a reload (the field must be in the `handleSettingsChange` allow-list; see [AI_WORKER_RULES.md](../09_AI_WORKER/AI_WORKER_RULES.md) §4).
5. **Clean-build safe** — if your change references a static asset or new file, confirm it's committed and appears in `dist/` after `pnpm build`.

### Housekeeping

- Delete any `components/*.bak*` copies before committing.
- Delete throwaway migration scripts once their edit is committed.
- Ensure `.gitignore` covers `*.bak` and local-only scripts.

### Filing work

Track tasks in [ISSUES.md](../../../ISSUES.md) using the checkbox format. Give each issue an ID (`ISSUE-N`), severity, and acceptance criteria. This markdown file *is* the issue tracker — there is no external one.

## Roadmap Direction

The roadmap focuses on four levels of maturity:

### Phase 0 — Foundation Hardening ✅

Resolved existing structural defects, security issues, and test gaps.

- [x] Fix the production server branch (`app.get('*')` → `app.use()` fallback) — fixed 2026-07-18, commit `9f26ee3`
- [x] Split App.tsx (~1,200 lines → 5 extracted hooks)
- [x] Raise the test floor (llmService tests, E2E smoke test, settingsStorage tests)
- [x] Security trims: proxy allowlist, confirmation gates, browser kill switch
- [x] De-hardcode drift-prone strings into constants
- [x] settingsStorage.test.ts — 16 tests added

### Phase 1 — First-Run Experience and Resilience ✅

Onboarding and error handling are now standardized.

- [x] Onboarding rework: multi-step wizard (`OnboardingFlow`), demo mode (OPFS `DemoFileSystemManager`), non-Chromium indicator (`DemoModeIndicator`)
- [x] Error UX pass: `ErrorDisplay` component + `AppError` class hierarchy (25 utility tests + 12 component tests)
- [x] Settings resilience: shadow-backup dual-write pattern (`saveLLMSettings` → shadow → primary fallback)
- [x] Vault integrity visibility: `IntegrityReportModal` + `runIntegrityScan()` with localStorage persistence

### Phase 2 — Feature Enrichment ✅

Generate loop, model registry, knowledge graph, and gallery intelligence implemented.

- [x] Generate loop: `useGenerateLoop` state machine + `GeneratePanel` + `CompareQuickAction` + `generate_and_ingest` tool
- [x] Model registry: `constants/modelProfiles.json` — versioned JSON replacing ~50 hardcoded profiles
- [x] Gallery intelligence: auto-tagging, similarity clustering, visual search, usage analytics
- [x] Assistant knowledge graph: entity graph connecting prompts, images, styles, notes, memories with `query_tool`
- [x] Assistant memory: context-aware `memoryPromptBlock()` injected into every assistant request

### Phase 3 — Polish & Performance ✅

WebSocket resilience, chunked loading, and WASM-accelerated search.

- [x] WebSocket reconnection: `reconnectManager.ts` with exponential backoff — wired into all 3 voice backends
- [x] Chunked chat loading: paginated `loadChatMessages()` with offset/pageSize + "Load more" in UI
- [x] WASM-accelerated search: `vaultSearch.ts` BM25 index with IDB persistence, auto-rebuild on vault mutations, integrated into Command Palette

### Additional completed work

- **MCP Architecture (ISSUE-28):** 8-layer architecture — capability registry, intent router, planner, execution engine, service layer, provider router, 5 capability tools, 22 built-in capabilities
- **Knowledge & Obsidian (ISSUE-29):** 5 phases — knowledge manager API, 3-tier memory, relationship graph (52 tests), context-aware injection (17 tests), knowledge lifecycle with folder projection (59 tests)
- **MCP Infrastructure (2026-07-25):** Redundant Playwright child process removed, MCP server always starts, .env loading, CORS session-id fix, preset URL sync, consolidated to single Built-In tab with 61 tools
- **CSP hardening (2026-07-25):** `src/middleware/security.ts` now branches on `NODE_ENV` — see the [Security Hardening](#security-hardening) section above for the full policy and status.

### Definition of "Ready to Think About Money"

1. A stranger on a fresh machine reaches a working dashboard in under 3 minutes without help.
2. `pnpm lint` clean, `pnpm test` green (630 tests), E2E smoke test passes.
3. No assistant tool can perform a destructive external action without explicit confirmation. **(Note: ISSUE-22 revert means send_gmail/delete_gmail have no confirmation gate — user decision)**
4. The generate→ingest→compare loop works end-to-end with at least one provider. ✅
5. Model registry lives in data (`modelProfiles.json`). ✅
6. Consistency audit and UI polish remain as ongoing work (Phase 3 original scope).

## Feature Modules

Each `ActiveTab` maps to a top-level React component:

| Tab | Component | What it does |
|---|---|---|
| Tab | Component | What it does |
|---|---|---|
| `dashboard` | `Dashboard` | Landing HUD, gallery montage, idea clipping. Ambient video background, music player, idle overlay. |
| `assistant` | `AssistantPage` | Full-screen AI assistant (chat + live voice). Widgets: QuickActions, VaultStats, LiveAssistantMini, RecentActivity, IntegrationHealth. |
| `discovery` | `DiscoveryPage` | Browse GitHub/HuggingFace prompt collections. |
| `prompts` / `crafter` / `refiner` / `prompt_analyzer` / `media_analyzer` | `PromptsPage` (with `forcedView`) | Prompt workbench: builder, wildcard Crafter, Refiner (modifier-driven), analyzer, image abstractor. Supports 5 views via `forcedView` prop. |
| `prompt` | `SavedPrompts` | Nested, searchable prompt library with lineage/version graph, tree view, and edit/duplicate/delete. |
| `gallery` | `ImageGallery` | Masonry media vault with categories, metadata, NSFW flag, pinning, gallery stats. |
| `settings` | `SetupPage` | Settings shell with 5 main categories (App, Appearance, Integrations, Prompts, Gallery) and sub-tabs. |
| `composer` | `ComposerPage` | Grid/contact-sheet builder with matting + typography, preset aspect ratios. |
| `image_compare` | `ImageCompare` | Synchronized side-by-side viewers with linked pan/zoom, SplitView slider, and compare/swap layout. |
| `color_palette_extractor` | `ColorPaletteExtractor` | Extract color palette from image + AI mood/color naming. |
| `resizer` | `ImageResizer` | Image resizing + Topaz Gigapixel upscale via server bridge. |
| `video_to_frames` | `VideoToFrames` | Frame extraction from video uploads with frame rate and resolution controls. |
| `lora_editor` | `loraEditor/LoraEditorPage` | LoRA metadata/tag editor sub-app with safetensors parsing, hashing, online lookup, tag frequency analysis, and metadata editing. |

### Global overlay panels

| Panel | Component | Toggle source |
|---|---|---|
| Command Palette | `CommandPalette` | Ctrl+K / ⌘K. 30+ commands across Navigation, Panels, Assistant Actions, Themes. Fuzzy search with scoring. |
| Clipping Panel | `ClippingPanel` | Paperclip icon in header. Ideas, notes, files tabs. |
| Media Panel | `MediaPanel` | YouTube/Spotify player panel. |
| Web Viewer | `WebViewerPanel` | In-app browser for opening URLs. |
| Chat Panel | `LLMChatPanel` | Assistant chat (text + research mode with 3-panel layout). |
| LLM Status | `LlmStatusPanel` | Active provider, model, token usage. |
| Activity Panel | `ActivityPanel` | Live tool-call transcript, status. |
| Video Player | `VideoPlayerOverlay` | YouTube video overlay player. |
| About Modal | `AboutModal` | App info. |
| Feedback Toast | `FeedbackToast` | Global success/error messages. |
| Page Frame | `PageFrame` | Scan-line overlay, corner accents, side markers. |
| Screen Control | `ScreenControlOverlay` | Screen-share + browser control permission UI. |
| Live Caption | `LiveCaptionOverlay` | Real-time voice caption overlay (hidden during Assistant page). |
| Idle Overlay | `IdleOverlay` | Matrix/gallery screensaver. |
| Transition Overlay | `transitions/TransitionOverlay` | Page transition aperture effect. |

## Server and Bridge Endpoints

The Express server (run via `npx tsx server.ts`, default `127.0.0.1:7500`) acts as a development host, proxy bridge, and local-tool gateway — not a traditional backend.

| Route | Purpose |
|---|---|
| `ALL /google-api/*` | Proxies to `https://www.googleapis.com` (Drive, OAuth userinfo). Rewrites `Location` headers back to local origin. |
| `ALL /ollama-local/*` | Proxies to local Ollama (`127.0.0.1:11434`), with `localhost` and IPv6 fallbacks. Streams response. |
| `ALL /llamacpp-local/*` | Same pattern for llama.cpp (`127.0.0.1:8080`). |
| `ALL /proxy-remote/*` | Generic remote proxy; target from `x-target-url` header, validated against provider allowlist. |
| `POST /api/anthropic/chat` | Anthropic Messages API proxy (api_key + subscription modes). Streams SSE. |
| `POST /api/mcp/proxy` | MCP JSON-RPC proxy (Streamable-HTTP compatible). |
| `GET /api/health` | `{status:"ok"}`. |
| `GET /api/topaz-status` / `POST /api/topaz-upscale` | Topaz Gigapixel CLI bridge (multer upload, temp files cleaned up). |
| `/api/cdp/*` | Chrome DevTools Protocol bridge for assistant browser control (connect, click, type, navigate, etc.). |

## Security Hardening

Introduced from a five-axis code review of commit `ca389c8` (`src/middleware/security.ts`, `src/schemas/*.ts`, `src/middleware/validate.ts`). This section is the single source of truth for that work — the original planning doc and a later CSP-specific draft have both been folded in here and deleted.

### Content-Security-Policy

`securityHeaders` (in `src/middleware/security.ts`) branches on `NODE_ENV`:

**Dev** — permissive by design, unchanged by this hardening pass:
```
default-src * data: blob:; script-src * 'unsafe-inline' https: blob: 'unsafe-eval'; style-src * 'unsafe-inline' https:; img-src * data: blob: https:; font-src * data:; connect-src * https: wss: http://localhost:* http://127.0.0.1:*; frame-src *
```

**Prod** — scoped per-host policy, shipped as `Content-Security-Policy-Report-Only` (logs violations, blocks nothing) until the manual walk-through in ISSUE-30 is clean:
```
default-src 'self'; script-src 'self' blob: 'wasm-unsafe-eval' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://db.onlinewebfonts.com https://api.fontshare.com; font-src 'self' data: https://fonts.gstatic.com https://cdn.fontshare.com https://db.onlinewebfonts.com; img-src 'self' data: blob: https:; connect-src 'self' https://openrouter.ai https://generativelanguage.googleapis.com https://www.googleapis.com https://wttr.in https://accounts.spotify.com https://api.spotify.com wss://generativelanguage.googleapis.com http://localhost:* http://127.0.0.1:*; frame-src https://accounts.google.com;
```

Why each non-obvious entry is there:
- `blob:` in `script-src` — the live-assistant mic-capture `AudioWorklet` loads via `URL.createObjectURL()` in `services/liveAssistantService.ts`.
- `'wasm-unsafe-eval'` — RNNoise (`simple-rnnoise-wasm`) and the ONNX-based VAD (`@ricky0123/vad-web`) compile WASM at runtime; both are core voice-pipeline features, not experimental extras. Scoped to WASM compilation only, unlike `'unsafe-eval'` (which dev still carries, and which also permits arbitrary `eval()`).
- Fonts split across three hosts — `fonts.gstatic.com` (Google Fonts), `cdn.fontshare.com` (actual font binaries — a *different* subdomain than the `api.fontshare.com` CSS endpoint), `db.onlinewebfonts.com`.
- `connect-src` stays broad because this app calls many hosts directly from the browser (OpenRouter, Gemini incl. the Live API's WebSocket, YouTube/Google APIs, wttr.in, Spotify) and proxies to **user-configured local model servers** (Ollama, llama.cpp) at arbitrary ports — hence `http://localhost:*`/`http://127.0.0.1:*` stay despite being plaintext schemes.
- The two former inline `<script>` blocks in `index.html` (boot-error overlay, reload diagnostic) were extracted to `public/boot-diagnostics.js` so prod's `script-src` doesn't need `'unsafe-inline'`.
- A CSP hash (`sha256-...`) is not a substitute for `'unsafe-eval'`/`'wasm-unsafe-eval'` — hashes allowlist specific inline script/style content; they don't grant the `eval()`/WASM-compile permission itself.

Verified via a real `npm run build` + `NODE_ENV=production` server run + browser load: zero CSP violations on initial page load, zero inline `<script>` tags in the built `dist/index.html`. **Not yet verified:** voice assistant (needs a live mic + user gesture), Spotify/YouTube tool calls (need real OAuth/API keys), local Ollama/llama.cpp (need a running server), and the full Google Sign-In popup/redirect flow. Tracked as **ISSUE-30**; switching to enforced `Content-Security-Policy` is a one-line header-name change in `security.ts` once those checks are clean.

### Rest of the review pass — actual status

The rest of the original plan covered headers/CORS, input validation, rate limiting, a `server.ts` refactor, logging hygiene, and a pre-commit hook. Verified against the current code:

| Area | Status |
|---|---|
| Security headers (`helmet`, CSP) + CORS | ✅ Done — `src/middleware/security.ts` |
| Zod input validation | ⚠️ Partial — `src/schemas/anthropic.ts` and `topaz.ts` are wired via `validate()` into their routes in `server.ts`; `mcp.ts` and `proxy.ts` schemas exist as files but aren't wired into `/api/mcp/proxy` or the `/proxy-remote`, `/ollama-local`, `/llamacpp-local` routes |
| Auth-endpoint rate limiting | ⚠️ Partial — `authRateLimiter` applies to `/api/openai/token` and `/api/anthropic/chat`; `/api/topaz-upscale` has validation but no rate limit |
| Global rate limiting | ❌ Disabled — `globalRateLimiter` exists in `security.ts` but is commented out in `server.ts` ("disable global rate limiting" commit) |
| `server.ts` refactor into `src/routes/*` + `src/services/*` | ❌ Not done — `server.ts` is still one file (~1,500 lines) |
| Pre-commit hook (husky: lint + test + audit) | ❌ Not done — no `.husky/` directory in the repo |
| Logging redaction (strip `Authorization`/`Cookie` from logs) | Not verified in this pass |

Phase 0 in the roadmap above is marked ✅ complete, but its "Security trims" line refers to a narrower set of items (proxy allowlist, confirmation gates, browser kill switch) that did ship — it was never meant to cover the full table above. If the remaining items are picked back up, they need their own `ISSUE-N` entries in [ISSUES.md](../../../ISSUES.md).

## Known Issues and Gotchas

- **Production CSP is Report-Only, not enforced.** See [Security Hardening](#security-hardening) above — it logs violations but blocks nothing yet. Don't treat it as a working XSS defense until ISSUE-30's checks are done.
- **Single dev instance only.** A second dev server collides on Vite's HMR websocket port. For automated verification, use `vite build` + `vite preview --port 4173`.
- **Service worker is disabled by design.** `sw.js` exists, but `index.html` actively unregisters all service workers on every boot. Don't rely on offline caching.
- **Boot requires a real directory handle.** The File System Access folder picker gates the whole app. In a headless browser, stub it with OPFS: `window.showDirectoryPicker = async () => navigator.storage.getDirectory()`.
- **Headless Chrome quirks:** defaults to `prefers-reduced-motion: reduce`, throttles rAF, and triggers idle standby fast. Animate with state polling instead of racing screenshots.
- **`activeTab` persists** across reloads via `useLocalStorage`, so the app restores the last page.

## Cross-document Map

Use the architecture handbook in this order:

1. Start with [VISION.md](VISION.md) and [DESIGN_PRINCIPLES.md](DESIGN_PRINCIPLES.md) for product intent and engineering philosophy.
2. Read [ARCHITECTURE_CONSTITUTION.md](ARCHITECTURE_CONSTITUTION.md) (this file) for the governing structure, including [Security Hardening](#security-hardening) for the current CSP/server-hardening state.
3. Follow [AI_ENGINE.md](../01_AI_ENGINE/AI_ENGINE.md) and [PLANNER.md](../01_AI_ENGINE/PLANNER.md) for execution flow.
4. Review [CAPABILITY_SPEC.md](../02_CAPABILITY_PLATFORM/CAPABILITY_SPEC.md), [CREATE_CAPABILITY.md](../10_EXAMPLES/CREATE_CAPABILITY.md), and [PROVIDER_ROUTER.md](../07_PROVIDERS/PROVIDER_ROUTER.md) for capability and provider behavior.
5. Consult [KNOWLEDGE_ENGINE.md](../03_KNOWLEDGE_ENGINE/KNOWLEDGE_ENGINE.md), [OBSIDIAN.md](../03_KNOWLEDGE_ENGINE/OBSIDIAN.md), [MEMORY_SYSTEM.md](../04_MEMORY/MEMORY_SYSTEM.md), [MCP_SPEC.md](../05_MCP/MCP_SPEC.md), and [VOICE_PIPELINE.md](../06_VOICE/VOICE_PIPELINE.md) for support layers. Note: KNOWLEDGE_ENGINE.md and MEMORY_SYSTEM.md cover overlapping ground (the 3-tier memory model) from different angles — read both, they cross-reference each other.
6. Use [DIRECTORY_STRUCTURE.md](../08_IMPLEMENTATION/DIRECTORY_STRUCTURE.md) and [AI_WORKER_RULES.md](../09_AI_WORKER/AI_WORKER_RULES.md) when implementing or reviewing changes.
7. See [contracts/interfaces.md](../../contracts/interfaces.md) for implementation-facing data shapes and [diagrams/README.md](../../diagrams/README.md) for the diagram inventory.

## Decision Record

- The product remains browser-first and local-first rather than adopting a conventional multi-service backend model.
- The application uses a shared settings object and explicit persistence rules to keep configuration manageable.
- The server is treated as a bridge and proxy layer rather than a primary application runtime.
- The roadmap prioritizes robustness, onboarding quality, and trust before monetization-oriented feature work.

## Core Schema Summary

The architecture is organized around the following conceptual schema:

- UserContext: the active session, active prompt, current task, and selected modality
- AssetRecord: a gallery item, prompt artifact, or generated output with metadata and storage location
- CapabilityContract: a named action with input, output, and provider requirements
- ProviderConnection: an engine-specific connection object with credential state and readiness information
- MemoryEntry: persistent or semi-persistent information that can influence future behavior
- KnowledgeNode: a conceptual relationship between prompts, notes, assets, and outcomes

This schema is reflected in the app's separation of UI, services, storage, and assistant behaviors.
