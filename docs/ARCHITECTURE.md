# Kollektiv — Technical Architecture & Reference

> **Kollektiv** — *Neural Utility Suite & Creative Asset Vault*. A local-first, single-page web application for prompt engineers and generative-media artists. It combines multi-provider LLM prompt refinement, a local file-backed media vault, an AI assistant (chat + live voice + browser control), and a suite of image/video utilities.

This document describes the codebase as it exists on the `main` branch. It is grounded in the actual source — file paths and behaviours cited here were verified against the tree, not assumed. Where something is a known-broken or fragile area, it is flagged explicitly.

---

## 1. At a glance

| Property | Value |
|---|---|
| App name | `kollektiv` (package.json `private`, version `0.0.0`) |
| Size | ~44k lines across ~181 `.ts`/`.tsx` files |
| Package manager | **pnpm 11.5.3** (declared via `packageManager`) |
| Module system | ESM (`"type": "module"`) |
| Repo | `github.com/mindturbulence/Kollektiv` |
| Deploy target | GitHub Pages (`gh-pages -d dist`), homepage `mindturbulence.github.io/Kollektiv` |
| Author | mndtrblnc / MindTurbulence |

There is **no conventional REST backend**. The one server (`server.ts`) exists to (a) run Vite in middleware mode during dev and (b) act as a CORS/mixed-content proxy plus a bridge to local native tooling (Ollama, llama.cpp, Chrome DevTools Protocol, Topaz Gigapixel). All application state lives in the browser and in a user-chosen local folder.

---

## 2. Tech stack

### Core
- **React 19.1** (`react`, `react-dom`) — function components + hooks throughout. Class components used only for error boundaries.
- **TypeScript 5.4** — strict typing; the lint gate is `tsc --noEmit`.
- **Vite 5.2** (`@vitejs/plugin-react`) — dev server (middleware mode inside Express) and production bundler.
- **Express 5.2** + **tsx 4.21** — `server.ts` is run directly via `npx tsx server.ts`.

### UI / styling / motion
- **Tailwind CSS 3.4** + **DaisyUI 4.12** — utility styling and the theme system (see §11). `@tailwindcss/typography` for markdown.
- **GSAP 3.12** — imperative timeline animation (boot sequence, page-frame scan lines, loader).
- **Framer Motion / `motion` 12.38** — declarative page-transition variants (`AnimatePresence`).
- **Web fonts** loaded from CDNs in `index.html` (Google Fonts, Fontshare, onlinewebfonts): Nunito, Inter, Montserrat, Plus Jakarta Sans, JetBrains Mono, Space Grotesk, Playfair Display, Monoton, Microgramma, Satoshi, SF Mono.

### AI / generative
- **`@google/genai` 1.12** — Gemini text, vision, image (Imagen / "Nano Banana"), video (Veo), and the **Gemini Live API** (real-time voice).
- Multi-provider LLM layer over **Ollama** (local + cloud), **OpenRouter**, **llama.cpp**, and **Anthropic** (see §8).
- **`@apify/actors-mcp-server`** + custom MCP client — Model Context Protocol tool integration.
- **Tensor Art** OpenAPI client (`services/tensorartService.ts`) — remote image generation.

### Media / files
- **`idb` 8** — thin IndexedDB wrapper (stores File System Access handles).
- **File System Access API** — the local vault (native browser API, no library).
- **`@ffmpeg/ffmpeg` + `@ffmpeg/util` 0.12** (WASM) — client-side video frame extraction / joining.
- **`pdfjs-dist` 5**, **`mammoth` 1** — PDF and DOCX text extraction for chat attachments.
- **`jszip` 3**, **`hash-wasm` 4**, **`@dsnp/parquetjs`**, **`uuid` 9**, `piexif.js` (vendored) — archive, hashing, columnar data, IDs, EXIF.
- **`react-markdown` + `remark-gfm`**, **`react-syntax-highlighter`** — chat/markdown rendering.

### Tooling
- ESLint 10 + `eslint-plugin-react-hooks`, PostCSS + autoprefixer, **Vitest 3** for unit tests, `gh-pages` for deploy.

---

## 3. Repository layout

```
/
├── index.html            # HTML shell: fonts, global error interceptor, SW unregister, theme preload
├── index.tsx             # React bootstrap (providers + RootErrorBoundary)
├── index.css             # Global styles / Tailwind entry
├── server.ts             # Express dev server + proxy/bridge endpoints
├── vite.config.ts        # Vite config + dev proxies + env define
├── types.ts              # Central shared type definitions
├── constants.ts          # Barrel re-export of constants/*
├── mcp-bridge.js         # Standalone stdio↔HTTP bridge for Docker MCP servers
├── sw.js                 # Service worker (note: actively unregistered on boot — see §13)
│
├── components/           # 114 files — all React UI
│   ├── App.tsx           # Root orchestrator (boot, layout, nav, idle, audio)
│   ├── *Page.tsx         # Top-level feature screens
│   ├── settings/         # Settings sections (App, Appearance, Integrations, Mcp, Cdp, Gallery, Prompts)
│   ├── loraEditor/       # LoRA metadata editor sub-app
│   ├── transitions/      # Page-transition engine (director + overlay + route FX)
│   └── icons.tsx         # Icon set
│
├── services/             # 23 files — all non-UI logic (LLM, assistant, storage bridges, integrations)
├── contexts/             # 4 React contexts (Settings, Auth, Busy, LiveAssistant)
├── utils/                # 29 files — storage, hooks, parsers, event bus, integrity
├── constants/            # models, modifiers, modifierRegistry, presets, themes, cheatsheetData
├── public/               # background images, fonts, sfx
├── docs/                 # planning docs (docs/superpowers/plans, docs/superpowers/specs) + this file
└── scripts/              # one-off refactor scripts
```

**Path alias:** `@` → repo root (configured in `vite.config.ts`; note `tsconfig.json` should mirror this).

---

## 4. Runtime architecture & boot sequence

### Provider tree
`index.tsx` mounts:

```
React.StrictMode
└── RootErrorBoundary            (index.tsx — catches module-graph / bootstrap crashes)
    └── SettingsProvider         (contexts/SettingsContext)
        └── AuthProvider         (contexts/AuthContext — currently a stub)
            └── App              (components/App.tsx)
                └── ErrorBoundary
                    └── BusyProvider
                        └── AppContent
                            └── LiveAssistantProvider
```

There are **three** error boundaries in play: the inline pre-React interceptor in `index.html` (renders `BOOT_FAILURE` / `RESET_ALL_STORAGE` overlay for uncaught `error`/`unhandledrejection` events, filtering out cross-origin GSI/extension noise), `RootErrorBoundary` in `index.tsx`, and `ErrorBoundary` in `App.tsx` (renders `CRITICAL ERROR` with trace + emergency reset).

### `process` shim
Several libraries expect a Node-like `process.env`. Both `index.html` (inline, before any module) and `index.tsx` define `window.process = { env: {...} }`. Vite `define` also inlines `process.env.NODE_ENV`, `API_KEY`, `GEMINI_API_KEY`, `YOUTUBE_CLIENT_ID`. **The Gemini key is deliberately never inlined in production builds** — production users supply it at runtime via the Setup screen (`settings.geminiApiKey`); only dev builds read `.env`.

### Boot gates (order matters — see §13 for headless quirks)
`AppContent.initializeApp()`:
1. **STORAGE_INIT** — `fileSystemManager.initialize(settings, auth)`. If no valid directory handle / permission, renders `<Welcome>` (folder picker). This is the File System Access API gate.
2. **Loader** — `verifyAndRepairFiles()` runs manifest/integrity repair; fonts are awaited (`document.fonts.ready`, max 1s); progress drives the `InitialLoader` terminal-style UI.
3. **CONTINUE / CONTINUE WITHOUT MUSIC** — the loader waits for explicit user click (`handleInitContinue`), which unlocks the WebAudio context and optionally starts the ambient YouTube music engine.
4. **Reveal** — a GSAP "blinds" aperture animation opens onto the app shell (`useLayoutEffect`, runs once via `isFirstRevealRef`).

### Global app-shell responsibilities (`App.tsx` / `AppContent`)
- **Navigation** — `activeTab` (`ActiveTab` union in `types.ts`) persisted via `useLocalStorage('activeTab')`. `renderContent()` is a switch over the tab. Several tabs (`crafter`/`refiner`/`prompt_analyzer`/`media_analyzer`) all render `PromptsPage` with a `forcedView` prop.
- **Page transitions** — `useTransitionDirector` (see §11) intercepts navigation, plays the "Context Shift" overlay + SFX, then commits the tab.
- **Idle system** — configurable idle timeout (`settings.idleTimeoutMinutes`, `isIdleEnabled`) shows `IdleOverlay` (matrix or gallery). Suppressed on the `assistant` tab. Any input resets the timer and resumes audio.
- **Ambient background** — video / image / color behind everything, grayscaled and dimmed.
- **Ambient music** — a hidden `youtube-nocookie` iframe (`videoId` extracted from `settings.musicYoutubeUrl`) plus `audioService` SFX.
- **Global feedback** — `FeedbackToast` driven by `showGlobalFeedback`.
- **Cross-component messaging** — `appEventBus` subscriptions (`navigate`, `sendToPromptsPage`, `assistantFeedback`, `clipIdea`, `notesChanged`, `assistantFilesChanged`).

---

## 5. Backend server (`server.ts`)

Runs on **`127.0.0.1:7500`** by default (`PORT` env override; `HOST` defaults to loopback and is only `0.0.0.0` when explicitly set). Started with `npx tsx server.ts` (both `dev` and `start` scripts).

In dev it mounts Vite as middleware (`appType: "spa"`). In production it serves `dist/` statically.

### Proxy & bridge endpoints

| Route | Purpose |
|---|---|
| `ALL /google-api/*` | Proxies to `https://www.googleapis.com` (Drive, OAuth userinfo). Runs **before** `express.json()` so it can stream raw bodies; rewrites redirect `Location` headers back to the local origin. |
| `ALL /ollama-local/*` | Proxies to local Ollama (`127.0.0.1:11434`), with `localhost` and IPv6 `[::1]` fallbacks. Streams the response. |
| `ALL /llamacpp-local/*` | Same pattern for llama.cpp (`127.0.0.1:8080`). |
| `ALL /proxy-remote/*` | Generic remote proxy; target comes from the `x-target-url` header (validated as http/https). Handles mixed-content/CORS for remote Ollama/OpenRouter-style endpoints, with friendly DNS/ECONNREFUSED/timeout error messages. |
| `POST /api/anthropic/chat` | Anthropic Messages API proxy. Supports **api_key** mode (`api.anthropic.com`) and **subscription** mode (a user-supplied base URL, e.g. a local Claude proxy). Reshapes messages (system → top-level, base64 images → `image` blocks) and streams SSE back. |
| `POST /api/mcp/proxy` | MCP JSON-RPC proxy (Streamable-HTTP compatible). Parses SSE bodies, captures `mcp-session-id`, and falls back to a REST-style call if JSON-RPC fails. |
| `GET /api/health` | `{status:"ok"}`. |

### CDP browser-control bridge
A set of `/api/cdp/*` endpoints let the assistant drive a **real Chrome instance started with `--remote-debugging-port=9222`**. The server holds a single WebSocket to a chosen target tab and exposes: `connect`, `status`, `targets`, `select`, `disconnect`, `click`/`double_click`/`right_click`/`hover`, `type`, `press_key` (with a virtual-key map + modifier bitmask), `scroll`/`scroll_to`, `navigate`, `content`, `structure`. Coordinates from the assistant's capture space are mapped to the live viewport via `Page.getLayoutMetrics`.

### Topaz Gigapixel upscale
`GET /api/topaz-status` + `POST /api/topaz-upscale` shell out (`execFile`) to a locally installed **Topaz Gigapixel AI** CLI (`gigapixel.exe`), searching default install dirs or `TOPAZ_GIGAPIXEL_PATH`. Multer handles the upload (100 MB cap); temp files in `.topaz-tmp` are cleaned up in `finally`.

### `vite.config.ts` dev proxies
Mirror the Express proxies for `/ollama-local`, `/google-api`, `/proxy-remote` (with WebSocket + 10-min timeouts and silenced `ECONNREFUSED` noise). A small custom plugin short-circuits local-target `/proxy-remote` requests when running in a cloud host. `optimizeDeps` **excludes** the FFmpeg WASM packages and force-includes `react-markdown`/`remark-gfm`/`vfile`.

### `mcp-bridge.js`
A standalone, zero-dependency Node script that spawns a stdio MCP server (default `docker mcp client connect`) and exposes it over HTTP/JSON-RPC on a local port (default 3010), so the browser front-end can reach Docker Desktop's MCP gateway. `.mcp.json` declares the `MCP_DOCKER` stdio gateway (`docker mcp gateway run --profile kollektiv`).

---

## 6. Storage layer — "The Vault"

Storage is **local-first with an optional Google Drive backend**, abstracted behind `IFileSystemManager` in `utils/fileUtils.ts`.

### IndexedDB (`utils/db.ts`)
A single database `kollektiv-db`, one object store `keyval`. Used to persist **File System Access API directory handles** (which can't go in localStorage) via `getHandle`/`setHandle`/`clearAllHandles`.

### Local backend (`LocalFileSystemManager`)
Wraps the File System Access API. On boot it re-hydrates the stored directory handle and re-verifies permission (`verifyPermission`, interactive on demand). Provides `saveFile`/`readFile`/`getFileAsBlob`/`deleteFile`/`listDirectoryContents` (async generator) plus size calculation. Media metadata is stored as JSON sidecars alongside binaries in the chosen folder.

### Google Drive backend
`DriveDirectoryHandle` / `DriveFileHandle` mimic the native handle interface but read/write via the `/google-api` proxy with a bearer token (`settings.googleIdentity.accessToken`). A `pathCache` maps virtual paths → Drive file IDs. The manager supports **bidirectional migration**: `migrateLocalToDrive` (with convert-to-JPG + duplicate resolution callbacks) and `syncDriveToLocal`.

### Settings & other persisted state
- **`utils/settingsStorage.ts`** — the entire `LLMSettings` object under localStorage key **`kollektivSettingsV4`**. `defaultLLMSettings` is the source of truth for defaults. `resetAllSettings()` clears settings + IDB handles (used by emergency reset).
- Per-domain localStorage/JSON stores in `utils/`: `promptStorage`, `galleryStorage`, `notesStorage`, `memoryStorage`, `chatStorage`, `cheatsheetStorage`, `artistStorage`, `artstyleStorage`, `manifestStore`. Several have Vitest unit tests (`*.test.ts`).
- **`utils/integrity.ts`** — `verifyAndRepairFiles()` reconstructs manifests and repairs the DB on boot.
- **`useLocalStorage`** hook — generic reactive localStorage state (used for `activeTab`, `collapsedPanels`, settings sub-tabs, clipped ideas, etc.).

---

## 7. State management

No Redux/Zustand. State is layered:

1. **React Context** (`contexts/`):
   - `SettingsContext` — the settings object + `updateSettings`, plus fetched model lists (Ollama local/cloud, OpenRouter, llama.cpp) refreshed reactively. Also listens for `token-usage-updated` / `settings-updated` window events to re-read from storage.
   - `LiveAssistantContext` — live voice session status (`idle|connecting|live|error`), speaking/sharing/control flags.
   - `BusyContext` — global busy/loading signalling.
   - `AuthContext` — **stub** (`{}`), a placeholder for future auth so imports resolve. Google identity currently lives inside `LLMSettings.googleIdentity`.
2. **`appEventBus`** (`utils/eventBus.ts`) — a ~25-line pub/sub singleton for decoupled cross-tree messaging (navigation, clipping, feedback, file-change notifications). `on()` returns an unsubscribe fn.
3. **localStorage** via `useLocalStorage` — persisted UI state.
4. **`window` CustomEvents** — token usage / settings-updated notifications bridge non-React code back into `SettingsContext`.

---

## 8. LLM abstraction layer

The heart of the prompt engine is **`services/llmService.ts`**, a provider-agnostic façade. Per-provider implementations live in `geminiService.ts`, `ollamaService.ts`, `openrouterService.ts`, `llamacppService.ts`, `anthropicService.ts`.

### Providers
`LLMSettings.activeLLM` ∈ `gemini | ollama | ollama_cloud | openrouter | llamacpp | anthropic`. `getActiveProvider()` collapses `ollama_cloud`→`ollama`. `requireProvider(feature, settings, supported[])` throws a `ProviderUnsupportedError` (with a "switch engine in Settings" message) when a feature isn't available on the active provider — feature availability is deliberately non-uniform (e.g. image abstraction is Gemini/Ollama only; chat supports all five).

### What the layer does
- **Model-aware system prompts.** `getModelSyntax(model, isVideo, isAudio)` returns a `{format, rules}` profile tuned per target architecture — dozens of profiles for video (LTX, Veo, Kling, Runway, Luma, Sora, Wan, Pika, Hailuo/MiniMax, Vidu, CogVideo, Higgsfield, Seedance, …), image (Flux, Imagen, Midjourney, SDXL, Pony/Illustrious, DALL·E, Ideogram, Seedream, Qwen-Image, Nano Banana, Recraft, Lumina, …), and audio (ElevenLabs, Bark, Suno/Udio, Stable Audio, AudioLDM, Lyria, Mureka, MiniMax, …). Audio is further split into `speech|music|sfx` modes.
- **Persona system** (`AI_ROLES`): `ENHANCER`, `REFINER`, `DECONSTRUCTOR`, each composing a role, the model syntax, a media-specific protocol (T2V/I2V/image/audio), the shared `IMAGE_GENERATION_WORKFLOW`, motion/audio structure rules, and an optional user "master role" prompt. The ENHANCER also emits a `---PROMPT_BREAKDOWN---` JSON anatomy constrained to a modifier catalog.
- **Streaming.** All chat/enhance/refine paths are `AsyncGenerator<string>`. `stripReasoningTags()` removes `<think>`/`<thought>` spans across chunk boundaries; `cleanLLMResponse()` strips code fences, list markers, and boilerplate openers ("here", "sure", …).
- **Attachment preprocessing** (`streamChat`): text/JSON/CSV inline directly; PDFs → `documentParser.extractTextFromPdf`; DOCX → `extractTextFromDocx`; images kept as attachments for vision models. The `masterRolePrompt` is prepended as/merged into the system message.
- **Modifier → context.** `buildContextForEnhancer(modifiers)` turns the huge `PromptModifiers` object (art style, camera body/lens/film stock, lighting, composition, motion, audio, etc.) into an `[Architectural Constraints]` block. `buildMidjourneyParams()` renders MJ `--ar/--c/--s/...` flags separately.
- **Generative media passthroughs** re-exported from `geminiService`: `generateWithImagen`, `generateWithNanoBanana`, `generateWithVeo`.
- **Connection testing** — `testOllamaConnection()` with protocol-mismatch / cloud-local diagnostics.

Model catalogs (`constants/models.ts`): `TARGET_IMAGE_AI_MODELS`, `TARGET_VIDEO_AI_MODELS`, `TARGET_AUDIO_AI_MODELS` (sorted, "Default" first). `isVideo`/`isAudio` classification keys off membership in these lists.

---

## 9. Feature modules (pages)

Each `ActiveTab` maps to a top-level component (see `renderContent()` in `App.tsx`):

| Tab | Component | What it does |
|---|---|---|
| `dashboard` | `Dashboard` | Landing HUD, gallery montage, idea clipping. |
| `assistant` | `AssistantPage` | Full-screen AI assistant (chat + live voice). |
| `discovery` | `DiscoveryPage` | Browse GitHub/HuggingFace prompt collections (`discoveryService`). |
| `prompts` / `crafter` / `refiner` / `prompt_analyzer` / `media_analyzer` | `PromptsPage` (with `forcedView`) | The prompt workbench: builder, wildcard **Crafter**, **Refiner** (modifier-driven), analyzer, media/image abstractor. |
| `prompt` | `SavedPrompts` | Nested, searchable prompt library with lineage/version graph. |
| `gallery` | `ImageGallery` | Masonry media vault with categories, metadata, NSFW flag, YouTube publish tracking. |
| `composer` | `ComposerPage` | Grid/contact-sheet builder with matting + typography. |
| `image_compare` | `ImageCompare` | Synchronized side-by-side viewers. |
| `color_palette_extractor` | `ColorPaletteExtractor` | Extract palette + AI mood/color naming. |
| `resizer` | `ImageResizer` | Image resizing (+ Topaz upscale via server). |
| `video_to_frames` | `VideoToFrames` | FFmpeg.wasm frame extraction. |
| `lora_editor` | `loraEditor/LoraEditorPage` | LoRA metadata/tag editor sub-app (own `types.ts`, `constants.ts`, `lib/`). |
| `settings` | `SetupPage` | Settings shell over `components/settings/*` sections. |

`PromptModifiers`, `SavedPrompt` (+ `PromptVersionNode` lineage), `GalleryItem`, `CrafterData`/`WildcardCategory`, `CheatsheetCategory` are all defined in `types.ts`.

---

## 10. AI Assistant system

The assistant is the most complex subsystem, spanning chat, tool-calling, live voice, browser control, and MCP.

### Text assistant (`services/assistantService.ts` + `assistantTools.ts`)
- An agentic loop (`MAX_TOOL_ROUNDS = 8`) that streams `AssistantEvent`s: `text`, `tool_start`, `tool_result`, `turn_end`. Provider is whatever `assistantProvider` / `activeLLM` selects.
- **55 built-in tools** (`ASSISTANT_TOOLS` in `assistantTools.ts`), each with a JSON-Schema-style definition converted per-provider. Categories:
  - **App control / navigation:** `navigate`, `update_settings`.
  - **Prompt library & engine:** `search_prompts`, `save_prompt`, `refine_prompt`, `translate_prompt`, `rewrite_prompt`, `analyze_prompt`, `send_to_refiner`, `save_refiner_preset`, `send_to_crafter`, `send_to_prompt_analyzer`, `list_wildcards`, `generate_crafter_prompt`.
  - **Discovery / cheatsheets:** `list_discovery_collections`, `search_discovery_prompts`, `search_cheatsheets`.
  - **Gallery / media:** `search_gallery`, `get_gallery_item`, `save_to_gallery`, `delete_gallery_item`, `abstract_image`, `generate_image`.
  - **Ideas / notes / memory:** `clip_idea`, `save_note`, `list_notes`, `update_note`, `delete_note`, `remember`, `list_memories`, `forget`.
  - **Web:** `web_search`, `fetch_url`, `open_web_page`, `save_file`.
  - **In-app browser control:** `browser_click_element`, `browser_select_option`, `browser_click`, `browser_double_click`, `browser_right_click`, `browser_hover`, `browser_type`, `browser_press_key`, `browser_scroll`, `browser_scroll_to`, `browser_get_url`, `browser_read_page`, `browser_read_structure`, `browser_navigate` (via `browserControlService` / `externalBrowserService` → CDP bridge).
  - **Gmail:** `read_gmail`, `send_gmail`, `delete_gmail` (uses `gmail.modify` scope through the Google identity token / `/google-api` proxy).
  - **Tensor Art:** `tensorart_list_models`, `tensorart_generate`.
- Tools receive a `ToolContext` carrying `settings` and the current turn's image `attachments`.

### Live voice (`services/liveAssistantService.ts`)
- Uses the **Gemini Live API** — model constant `gemini-3.1-flash-live-preview` (verified against the Live API docs; the file warns to re-check that page if the model 404s on `bidiGenerateContent`).
- Audio rates: **16 kHz mic input**, **24 kHz speaker output** (Live API requirements).
- Live voice **always runs on Gemini**, independent of the text `assistantProvider` (documented in `types.ts`). Persona is configurable: `assistantName`, `assistantVoice`, `assistantLanguage`, `assistantPersonality`.
- Screen sharing + browser control can be enabled during a live session (`LiveAssistantContext.sharing/controlEnabled`), surfaced via `LiveCaptionOverlay` and `ScreenControlOverlay`.

### MCP integration (`services/mcpService.ts`, `mcpAssistantTools.ts`)
- `mcpService` manages MCP sessions (`sessionStates` map), lists `MCPTool`/`MCPPrompt`/`MCPResource`, and routes calls through `POST /api/mcp/proxy`. User servers are configured via `LLMSettings.mcpServers` (`McpServerConfig[]`) in the Integrations/MCP settings sections. Tools discovered from MCP servers are merged into the assistant's tool set via `mcpAssistantTools`.

### `assistantProtocol.ts` (+ tests)
Encapsulates the per-provider tool-calling protocol (schema conversion, tool-call parsing). Covered by `assistantProtocol.test.ts`.

---

## 11. UI / UX system

### Theme system
DaisyUI-driven. `tailwind.config.js` defines a large `daisyui.themes` array. Custom high-concept themes (verified in config): **Kollektiv** (default, lime/violet dark), **Stellar**, **pipboy**, **abyss**, **Arc**, **sanrita**, **orange**, **starfield**, **Vanguard**, **Hiigara**, **MindTurbulence**, **synthwave**, **arwes**, plus overridden versions of the standard DaisyUI themes. The README markets these as MindTurbulence / Pip-Boy / Abyss / Explorer.

Theming details:
- `settings.activeThemeMode` is `'dark'`; `darkTheme` / `lightTheme` name the active DaisyUI theme; `fontSize` scales the root font.
- `index.html` **preloads the theme before React** (reads `kollektivSettingsV4` from localStorage, sets `data-theme`, applies `is-light-theme` heuristic, updates the `theme-color` meta) to avoid a flash of unstyled content.
- Font families (`tailwind.config.js`): sans → Nunito/Inter/Plus Jakarta; mono → JetBrains Mono.

### Page-transition engine (`components/transitions/`)
A bespoke "Context Shift" OS-style transition:
- `useTransitionDirector` — intercepts `navigate`, sequences the overlay animation + SFX, then `commit(tab, kind)` sets the tab and FX kind.
- `TransitionOverlay` — the imperative overlay (ref handle).
- `routeFx.ts` — `FxKind` per-route effect selection.
- Combined with Framer Motion `shellVariants` (`AnimatedPanels.tsx`) in an `AnimatePresence mode="wait"`. Note the crafter/refiner/analyzer group shares one motion key (`prompts_group`) so switching between them doesn't re-mount.

### Audio (`services/audioService.ts`)
A WebAudio synth engine (no audio files for SFX) producing sharp digital transients — `playClick`, `playTransition`, `playModalClose`, `playAppStart`, `startAmbient`/`stopAmbient`, `enable`/`disable`/`toggle`/`resume`. The context is unlocked on first user gesture (browser autoplay policy).

### Decorative shell
`PageFrame` draws an animated bordered frame with corner accents, side markers, and a periodic "scan line" snake animation (GSAP, 60s cycle). `CustomCursor`, `ChromaticText`, grid textures, and CRT scanline overlays reinforce the cyberpunk aesthetic.

---

## 12. Build, run, deploy

| Script | Command | Notes |
|---|---|---|
| `dev` / `start` | `npx tsx server.ts` | Express + Vite middleware on `127.0.0.1:7500`. |
| `build` | `vite build` | Outputs `dist/`. |
| `preview` | `vite preview` | Serves the built `dist/`. |
| `lint` | `tsc --noEmit` | Type-check gate (there is no ESLint script wired here despite the config). |
| `test` | `vitest run` | Unit tests for protocol/storage utils (`*.test.ts`). |
| `predeploy` / `deploy` | `pnpm run build` → `gh-pages -d dist` | Publishes to GitHub Pages. |

**Environment** (`.env`, dev only): `GEMINI_API_KEY`, optional `YOUTUBE_CLIENT_ID`; server-side optional `ANTHROPIC_API_KEY`, `TOPAZ_GIGAPIXEL_PATH`, `PORT`, `HOST`.

**Prerequisites:** Node LTS, pnpm ≥ 11, a Gemini key for neural features; Ollama/llama.cpp optional for local inference; Chrome with `--remote-debugging-port=9222` for external browser control; Docker Desktop for the MCP gateway.

---

## 13. Known issues & gotchas

These are verified constraints, not speculation:

- **Production server branch is broken.** `server.ts`'s `NODE_ENV=production` path uses `app.get('*')`, which Express 5 + path-to-regexp 8 reject. Production serving via `server.ts` currently throws; use `vite preview` on `dist/` instead.
- **Single dev instance only.** A second dev server collides on Vite's HMR websocket port, causing an endless "server connection lost" reload loop. For agent/automated verification, `vite build` + `vite preview --port 4173`.
- **Service worker is disabled by design.** `sw.js` exists, but `index.html` actively unregisters all service workers and clears all caches on every boot (then reloads once) to prevent stale-cache white screens. Don't rely on offline caching.
- **Boot requires a real directory handle.** The File System Access folder picker gates the whole app. In a driven/headless browser, stub it with OPFS: `window.showDirectoryPicker = async () => navigator.storage.getDirectory()`.
- **Headless Chrome quirks:** defaults to `prefers-reduced-motion: reduce` (animation paths bypass), throttles rAF (animations run slow — poll state instead of racing screenshots), and triggers the idle standby fast (spontaneous `navigate` events on wake are usually idle, not a bug).
- **`activeTab` persists** across reloads (`useLocalStorage`), so the app restores the last page.
- The Anthropic proxy's default model fallback (`claude-3-7-sonnet-20250219`) is a hardcoded string in `server.ts`; override via `settings.anthropicModel`.

---

## 14. Conventions

- **UI vs logic split:** anything with side effects or external I/O lives in `services/` or `utils/`; `components/` is presentation + local state. `contexts/` holds cross-cutting state.
- **Types are centralized** in `types.ts` (app-wide) with sub-app-local types in feature dirs (`loraEditor/types.ts`).
- **Constants are barrel-exported** through `constants.ts`.
- **LLM features go through `llmService`**, never directly to a provider service from UI — this preserves the provider-agnostic contract and the `ProviderUnsupportedError` UX.
- **Cross-tree events use `appEventBus`**; avoid prop-drilling for global signals.
- **Streaming everywhere** for LLM output (`AsyncGenerator<string>`), with reasoning-tag stripping applied centrally.
- **No test framework ceremony:** Vitest unit tests are colocated (`*.test.ts`) and cover pure logic (protocol, storage serialization); there is no E2E harness — verification is `tsc --noEmit` plus a manual walk of the app.

---

*Generated from a source-grounded read of the `main` branch. When code and this doc disagree, the code wins — update this file.*
