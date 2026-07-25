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
- docs/: product architecture, plan documents, and implementation notes

## Development and Engineering Standards

The engineering contract for this repository is explicit:

- TypeScript is used in strict mode and the lint gate is the compiler pass.
- Unused locals, unused parameters, and switch fallthrough are treated as real defects.
- React hooks and effects should be written with stable dependencies and cleanup logic.
- Styling should remain within the established Tailwind + DaisyUI system rather than introducing ad-hoc CSS.
- New settings must be added through the shared settings object and persistence flow so they survive reloads correctly.
- Secrets and long-lived credentials must never be committed to source control.

## Contribution Workflow

Contributors should follow the established development flow:

1. Install dependencies with pnpm.
2. Run the project locally with the development server.
3. Keep changes scoped to a single logical improvement.
4. Validate with the relevant lint, test, and build commands.
5. Verify persistence and asset handling when a change affects settings or stored files.
6. Track work in the repository issue file and write commits in the existing conventional style.

The definition of done requires more than code correctness. A change is considered complete when it passes the project quality gate, preserves persistence behavior where relevant, and leaves no scratch or temporary files behind.

## Roadmap Direction

The roadmap focuses on four levels of maturity:

### Phase 0 — Foundation Hardening

Resolve existing structural defects, security issues, and test gaps before adding new surface area.

- [-] Fix the production server branch (`app.get('*')` → `app.use()` fallback)
- [x] Split App.tsx (~1,200 lines → 5 extracted hooks)
- [x] Raise the test floor (llmService tests added, E2E smoke test added)
- [x] Security trims: proxy allowlist, confirmation gates, browser kill switch
- [x] De-hardcode drift-prone strings into constants
- [~] settingsStorage.test.ts not yet created — the planned migration tests are missing

### Phase 1 — First-Run Experience and Resilience

Make onboarding and error handling understandable for non-expert users.

- [ ] Onboarding rework: explainer screen, demo mode (OPFS), graceful non-Chromium messaging
- [ ] Error UX pass: standardized toast/panel pattern with actionable suggestions
- [ ] Settings resilience: versioned migration + per-section fallback instead of all-or-nothing reset
- [ ] Vault integrity visibility: surface repair report in Settings

### Phase 2 — Feature Enrichment

Strengthen the generate-refine-ingest loop, make model profiles data-driven, and improve gallery intelligence.

- [ ] Close the generate loop: refine → generate → auto-ingest → compare → re-refine
- [ ] Extract model registry to data: versioned JSON replacing ~50 hardcoded profiles in llmService
- [ ] Gallery intelligence: duplicate detection, prompt-similarity search, batch tagging
- [ ] Assistant memory that compounds: auto-inject learned preferences into refiner context
- [ ] Prompt lineage as a first-class view in the library UI

### Phase 3 — UI Polish and Accessibility

Bring consistency, motion discipline, and comfort to the interface.

- [ ] Consistency audit: spacing, button variants, empty states, loading states across all pages
- [ ] Motion discipline: honor `prefers-reduced-motion`, boot sequence skip affordance
- [ ] Command palette (Ctrl+K): navigation + actions over the existing event bus
- [ ] Performance pass on gallery: virtualize at 1k+ items, verify object-URL lifecycle
- [ ] Keyboard and accessibility basics: focus states, escape-to-close, alt text
- [ ] Font loading hygiene: self-host actual subset used instead of third-party CDNs

### Definition of "Ready to Think About Money"

All boxes below true:

1. A stranger on a fresh machine reaches a working dashboard in under 3 minutes without help.
2. `pnpm lint && pnpm test` green in CI, plus one E2E smoke test.
3. No assistant tool can perform a destructive external action without explicit confirmation.
4. The generate→ingest→compare loop works end-to-end with at least one provider.
5. Model registry lives in data, updated at least once for a newly released model.
6. Consistency audit done; every page has empty/loading/error states.

## Feature Modules

Each `ActiveTab` maps to a top-level React component:

| Tab | Component | What it does |
|---|---|---|
| `dashboard` | `Dashboard` | Landing HUD, gallery montage, idea clipping. |
| `assistant` | `AssistantPage` | Full-screen AI assistant (chat + live voice). |
| `discovery` | `DiscoveryPage` | Browse GitHub/HuggingFace prompt collections. |
| `prompts` / `crafter` / `refiner` / `prompt_analyzer` / `media_analyzer` | `PromptsPage` (with `forcedView`) | Prompt workbench: builder, wildcard Crafter, Refiner (modifier-driven), analyzer, image abstractor. |
| `prompt` | `SavedPrompts` | Nested, searchable prompt library with lineage/version graph. |
| `gallery` | `ImageGallery` | Masonry media vault with categories, metadata, NSFW flag. |
| `composer` | `ComposerPage` | Grid/contact-sheet builder with matting + typography. |
| `image_compare` | `ImageCompare` | Synchronized side-by-side viewers. |
| `color_palette_extractor` | `ColorPaletteExtractor` | Extract palette + AI mood/color naming. |
| `resizer` | `ImageResizer` | Image resizing + Topaz upscale via server. |
| `video_to_frames` | `VideoToFrames` | Frame extraction from video uploads. |
| `lora_editor` | `loraEditor/LoraEditorPage` | LoRA metadata/tag editor sub-app. |
| `settings` | `SetupPage` | Settings shell over `components/settings/*` sections. |

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

## Known Issues and Gotchas

- **Production server branch is broken.** `server.ts`'s `NODE_ENV=production` path uses `app.get('*')`, which Express 5 + path-to-regexp 8 reject. Use `vite preview` on `dist/` instead.
- **Single dev instance only.** A second dev server collides on Vite's HMR websocket port. For automated verification, use `vite build` + `vite preview --port 4173`.
- **Service worker is disabled by design.** `sw.js` exists, but `index.html` actively unregisters all service workers on every boot. Don't rely on offline caching.
- **Boot requires a real directory handle.** The File System Access folder picker gates the whole app. In a headless browser, stub it with OPFS: `window.showDirectoryPicker = async () => navigator.storage.getDirectory()`.
- **Headless Chrome quirks:** defaults to `prefers-reduced-motion: reduce`, throttles rAF, and triggers idle standby fast. Animate with state polling instead of racing screenshots.
- **`activeTab` persists** across reloads via `useLocalStorage`, so the app restores the last page.

## Cross-document Map

Use the architecture handbook in this order:

1. Start with [VISION.md](VISION.md) for the product intent.
2. Read [ARCHITECTURE_CONSTITUTION.md](ARCHITECTURE_CONSTITUTION.md) for the governing structure.
3. Follow [AI_ENGINE.md](../01_AI_ENGINE/AI_ENGINE.md) and [PLANNER.md](../01_AI_ENGINE/PLANNER.md) for execution flow.
4. Review [CAPABILITY_SPEC.md](../02_CAPABILITY_PLATFORM/CAPABILITY_SPEC.md) and [PROVIDER_ROUTER.md](../07_PROVIDERS/PROVIDER_ROUTER.md) for capability and provider behavior.
5. Consult [MEMORY_SYSTEM.md](../04_MEMORY/MEMORY_SYSTEM.md), [MCP_SPEC.md](../05_MCP/MCP_SPEC.md), and [VOICE_PIPELINE.md](../06_VOICE/VOICE_PIPELINE.md) for support layers.
6. Use [DIRECTORY_STRUCTURE.md](../08_IMPLEMENTATION/DIRECTORY_STRUCTURE.md) and [AI_WORKER_RULES.md](../09_AI_WORKER/AI_WORKER_RULES.md) when implementing or reviewing changes.

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
