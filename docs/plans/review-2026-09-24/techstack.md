# Kollektiv: tech stack and architecture review (2026-09-24)

This review was read-only; no source file was edited. Evidence came from `vite build` (EXIT=0), `tsc --noEmit`, `vitest run` and `eslint -f json`. A second build into the scratchpad (`vite.analyze.config.mts`) recorded per-module rendered sizes to `module-sizes.json`. Scratchpad scripts `lazy.cjs` and `cycles.cjs` then walked the static import graph.

The task asked for three skills (tech-stack-evaluator, performance-optimization, dependency-auditor), but no Skill tool was available in this session. Their checklists were applied by hand instead.

Labels: **VERIFIED** means I observed it with a tool this session. **SUSPECTED** means it is inferred and not reproduced.

Size units: "rendered" is Rollup's post-tree-shake, pre-minify size. The measured ratio from rendered to minified is about 0.53 (entry chunk: 7,763 KB rendered, 4,132 KB minified). Any minified figure derived from a rendered one is marked "~est".

---

## 1. Top 12 issues, ranked by risk and effort

| # | Sev | Issue | Where | Status | Fix |
|---|---|---|---|---|---|
| 1 | **Critical** | **Any website the user visits can drive their real browser.** CORS reflects any origin with credentials, and the CDP routes have no auth, origin check or Host check. `GET /api/cdp/content` and `GET /api/cdp/screenshot` are readable cross-origin, and the POST routes (`navigate`, `type`, `click`, `upload`, `launch`) pass preflight because every origin is allowed. `authRateLimiter` skips 127.0.0.1, which is exactly where browser-originated attacks come from. | `src/middleware/security.ts:92-95` (`origin: true, credentials: true`); `server.ts:558-1056` (CDP routes); `server.ts:80-85` | VERIFIED (config and routes read; exploit not run: port 7500 off-limits) | Allow only the app's own origin (`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`) and reject any other `Origin`. Add a Host-header allowlist so DNS rebinding can't bypass the CORS fix. Ideally also require a per-process random token (printed at boot, stored in sessionStorage) on `/api/cdp/*`, `/api/openai/token` and `/mcp`. |
| 2 | **Critical** | **A real Gemini API key and a YouTube OAuth client ID are in public git history.** | an early commit that added `.env` (Gemini key and YouTube client ID; since deleted from the tree, still in history — commit id withheld until the key is rotated) | VERIFIED (values masked in my output) | Rotate the Gemini key now. Deleting the file doesn't remove it from history. Optionally purge with `git filter-repo`, which is a user-approved destructive step. The `innertube.ts:8` key is YouTube's public web key, so it's informational only. |
| 3 | **High** | **The GitHub Pages deploy is broken, in two ways.** (a) `base: '/'` makes the build emit `/assets/index-*.js`, which resolves to `mindturbulence.github.io/assets/…` and returns 404 under `/Kollektiv/`. (b) The live site currently serves the **unbuilt source** `index.html` (`<script src="/index.tsx">`), so Pages is serving the repo root, not `gh-pages`. The last `gh-pages` deploy is from 2026-07-09. Worker and asset URLs are hard-coded to the root (`/ffmpeg/`, `/magick.wasm`, `/sfx/*`, `/background-*.jpg`, `/boot-diagnostics.js`), so changing `base` alone won't fix it. | `vite.config.ts:13`; `workers/ffmpegWorker.ts:32`; `workers/convertWorker.ts:29`; `services/audioService.ts:32-41`; `utils/settingsStorage.ts:70`; `index.html` | VERIFIED (curl: page 200, assets 404, source index served) | Decide first whether Pages should exist at all: most features need `server.ts` (`/api/*`, `/proxy-remote`, MCP, CDP), which a static site can't provide. If it stays: set `base: process.env.GITHUB_PAGES ? '/Kollektiv/' : '/'`, build URLs from `import.meta.env.BASE_URL` (it has 0 uses today), and point Pages at `gh-pages`. If it goes: delete `deploy.yml`, `gh-pages`, the `deploy`/`predeploy` scripts and `homepage`. |
| 4 | **High** | **Every visitor downloads the voice and assistant stack.** The entry chunk is 4,132 KB min / 1,185 KB gzip. Most of the weight comes from always-mounted shell components, not pages: refractor (935 KB rendered, all Prism languages, via `MessageBubble` in the global chat panel), livekit-client (812 KB) plus @elevenlabs/client (104 KB), onnxruntime-web (401 KB) plus vad-web (44 KB), and @google/genai (663 KB). | `components/MessageBubble.tsx:4` (`Prism` full build); `contexts/LiveAssistantContext.tsx` via `services/elevenLabsService.ts`, `voiceActivityService.ts`, `liveAssistantService.ts`, `geminiService.ts` | VERIFIED (module-sizes) | (a) Switch to `PrismLight` and register about 6 languages; this removes most of refractor's 935 KB for low effort. The 4 loraEditor panels import the same way. (b) Load the ElevenLabs, VAD and live-assistant services with `await import()` on first use of voice. Together (a) and (b) save ~1.2 MB minified (~est). |
| 5 | **High** | **No lint gate runs in any pipeline.** `pnpm lint` is only `tsc --noEmit`, and eslint.config.js is never run by CI, husky or any script. A real run finds **572 errors and 78 warnings in 164 files**. Among them, 134 `no-floating-promises` and 128 `no-misused-promises` are real bug classes (unhandled rejections, async handlers passed where void is expected), not style noise. | `package.json` (scripts `lint`); `.husky/pre-push` (runs `pnpm lint && pnpm test`); `.github/workflows/ci.yml` | VERIFIED | Add `"lint:eslint": "eslint ."` and run it in CI with a baseline (`--max-warnings` at today's count, or suppressions via `eslint-suppressions.json` in ESLint 10), then ratchet down. Fix the two promise rules first. |
| 6 | **High** | **CI never runs on the branch where work happens.** `ci.yml` triggers on pushes to `main, dev, local-dev`, but the working branch is `development`. `test:e2e` is also not in CI. | `.github/workflows/ci.yml:4-6` | VERIFIED | Add `development` to the branch list, or use `branches: ['**']`. Add a Playwright job, since `playwright.config.ts` already builds and previews on its own. |
| 7 | **Medium** | **Navigating to all 18 pages loads them all eagerly.** Lazy-loading the pages would defer **1,588 KB rendered (~0.85 MB min ~est) across 161 files**, but **no npm package** leaves the entry, because the shell already imports all of them (issue 4). By non-shell code reachable from each page (these overlap): PromptsPage 364 KB, SetupPage 268, ImageEditorPage 220, ImageGallery 201, LocalGenerationStudio 138. | `components/App.tsx:27-46` | VERIFIED | Use `React.lazy` for every page except Dashboard. **Coordinate this with the transition director:** start the page's `import()` inside `run()` before `await overlay.cover()` (a route-to-loader map in `routeFx.ts`), otherwise the Suspense fallback flashes after `reveal()`. Do issue 4 first; it saves more. |
| 8 | **Medium** | **An IndexedDB open failure is cached for good.** `getDb()` stores `_dbPromise` and never resets it on rejection, so one failure (quota, private mode, a `blocked` upgrade from another tab) makes every later call fail until reload. There are no `blocked`, `blocking` or `terminated` handlers. There is no `navigator.storage.persist()` call anywhere, so the browser may evict IndexedDB, which holds the vault directory handle, notes, memories and chats. | `utils/db.ts:83-120` | VERIFIED (code); eviction is SUSPECTED (browser-dependent) | Use `.catch(e => { _dbPromise = null; throw e; })`, add `blocking() { db.close(); }`, and call `navigator.storage.persist()` once after onboarding. |
| 9 | **Medium** | **`schemaVersion` is written but never read.** `stampSchemaVersion` sets version 2 on writes, but no reader branches on it, so there is no migration path. The `safeToSave` guard in `loadManifestSafe` is good and prevents empty-overwrite data loss. | `utils/manifestStore.ts:7-16` | VERIFIED (grep: no reader) | Before the next manifest shape change, add `migrate(parsed)` in `loadManifestSafe`, keyed on `parsed.schemaVersion ?? 1`. Until then it's harmless. |
| 10 | **Medium** | **API keys sit in plaintext localStorage** (Gemini, OpenRouter, Anthropic, TensorArt, Ollama Cloud, Google), and production CSP is **Report-Only**. Any XSS or malicious extension can read every key. | `utils/settingsStorage.ts:12-80,138-141`; `src/middleware/security.ts:34` | VERIFIED | For a local-first app this is an accepted risk, but switch production CSP to enforced once ISSUE-30 is clean. It becomes High if issue 1 stays open, because the server-side keys exposed via `/api/openai/token` are also reachable cross-origin. |
| 11 | **Low-Med** | **The event bus is untyped.** `appEventBus` uses `string` names and `any` payloads (26 lines). Six events are emitted with no listener anywhere: `cycleTheme` (the "Next Theme" command in the palette is a **user-visible no-op**), `openObsidianNote`, and `research:projectOpened/Closed/sourceAdded/sourceRemoved`. Unsubscribe hygiene is fine: every `.on()` result is returned or used (0 bare `.on(` statements). | `utils/eventBus.ts`; `constants/commandRegistry.ts:58`; `utils/obsidianStorage.ts:640`; `hooks/useResearchProject.ts:109-160` | VERIFIED | Add a single `AppEvents` map type (`{ navigate: ActiveTab; notesChanged: Note[]; … }`) and make `on<K extends keyof AppEvents>` generic; tsc then flags dead and misspelled events. Wire or delete `cycleTheme` and the 5 orphan emits. |
| 12 | **Low** | **Repo hygiene and dependency placement.** `helmet` is an unused dependency (security.ts sets headers by hand), `@types/*` are in `dependencies`, `@types/helmet` and `@types/express-rate-limit` are deprecated stubs, `vfile` is not imported directly, `constants.ts` and `constants/` exist side by side, and there is one self-import. Two small static import cycles: `utils/fileUtils.ts:6` and `utils/settingsStorage.ts:4` import each other, as do `services/llmService.ts:8` and `services/providerFallback.ts:12,42`. | see tables below; `utils/memoryStorage.ts:274` (`await import('./memoryStorage')`) | VERIFIED | Cleanup in one PR (table in section 3). Remove the self-import in memoryStorage and call `loadMemories` directly; it's the anti-pattern CLAUDE.md names. |

**The "set state then navigate" bug class is already fixed.** App.tsx:149-161 now clears one-shot payloads when their tab is *left* (tracked with `prevTabRef`), not whenever `activeTab !== owner`. The other paths that set state and then navigate are:

- `handleSendToPromptsPage` (`hooks/useAppShell.ts:108-124`): safe. Nothing clears `promptsPageState` before PromptsPage mounts, and navigating between prompt-workspace tabs commits immediately without the overlay (`'context-switch'`).
- `openInEditor` and `openInConverter` (`hooks/useAppEventBus.ts:61-95`): covered by the fix.

**Remaining director edge cases (SUSPECTED, low severity):**

1. If navigation is retargeted while the overlay is covering (e.g. Gallery EDIT, then a nav click before the cover completes), the editor payload stays set because `image_editor` was never the previous tab. A later plain navigation to the editor then reopens that stale image.
2. `run()` has no try/finally. The overlay promises only fail to resolve if their timeline is killed, and today that happens only on unmount (`TransitionOverlay.tsx:68-72`). `abort()` (line 218) has no callers and is dead code.
3. Navigating back to the origin tab while the overlay is covering is ignored (`useTransitionDirector.ts:107`), so the original target wins.
4. GSAP runs on requestAnimationFrame, so assistant-triggered navigation in a background tab stalls at cover until the tab is focused again.

## 2. Bundle (production build, Vite 5.4.21, 2,387 modules, 26 s)

| Chunk | Min | Gzip | What's in it |
|---|---|---|---|
| `index-*.js` (entry) | **4,132 KB** | **1,185 KB** | Rendered 7,763 KB: components 1,439, refractor 935, livekit 812, @google/genai 663, react-dom 532, services 510, onnxruntime-web 401, motion-dom+framer-motion 383, utils 278, gsap 230, image-editor 220, settings UI 170, micromark/mdast (react-markdown) ~300, @elevenlabs 104, constants 97, jszip 95 |
| `pdf.worker.min-*.mjs` | 1,232 KB | n/a | pdfjs worker (lazy) |
| `documentParser-*.js` | 856 KB | 236 KB | pdfjs 787 + mammoth stack (bluebird 176, xmldom 152, dingbat 135, mammoth 127); correctly lazy |
| `index-*.css` | 281 KB | 41 KB | Tailwind + DaisyUI with 43 themes |
| `index.esm-*.js` | 217 KB | 79 KB | hash-wasm (lazy, LoRA hashing) |
| `convertWorker-*.js` | 195 KB | n/a | magick-wasm glue |
| 13 small chunks | < 14 KB each | | StormBackground, knowledgeService, visionLoop, … |
| Static copies | 14.8 MB magick.wasm, 32.2 MB ffmpeg-core.wasm, 4.1 MB VAD onnx, 126 KB rnnoise | | dist is 58 MB in total |

**Build warnings:** one warning that a chunk exceeds 500 KB, plus **27 "dynamically imported … but also statically imported" warnings**. Those `await import()` calls (db, fileUtils, settingsStorage, eventBus, llmService, the provider services, obsidianStorage, …) split nothing and just add async noise. Either make them static or remove the static importers. No server package leaks into the client: `express` and `playwright` appear in the entry only as tool-description strings.

**Other front-end costs:** `index.html` loads 5 external font stylesheets (Google Fonts with 9 families, onlinewebfonts ×3, fontshare) plus GSI, all render-blocking. That is at odds with "local-first, zero external requests" (see the `vite.config.ts` ffmpeg comment). The fix is to self-host the 2-3 families actually used.

## 3. Dependencies

| Package | Verdict | Reason |
|---|---|---|
| express, multer, cors, express-rate-limit, dotenv, jsdom, playwright-core, @playwright/mcp, @modelcontextprotocol/sdk, @bitbonsai/mcpvault, rss-parser, defuddle | **Keep in `dependencies`** | `pnpm dev`/`start` run `server.ts` through tsx at runtime. VERIFIED that none reach the client bundle. |
| helmet | **Remove** | 0 imports; `security.ts` sets headers by hand (its comment says "via helmet"). |
| @types/helmet, @types/express-rate-limit | **Remove** | Deprecated stubs; express-rate-limit (VERIFIED via the `deprecated` field) and helmet 8 ship their own types. |
| @types/uuid, @types/react-syntax-highlighter | **Move to devDependencies** | Type-only. |
| vfile | **Remove** (and drop it from `optimizeDeps.include`) | 0 direct imports; it's a transitive dependency of react-markdown. |
| uuid | **Remove (optional)** | 8 files use `v4()`, and `crypto.randomUUID` is already used in 28 places. **Caveat:** `randomUUID` only exists in secure contexts; over plain http on a LAN IP (`HOST=0.0.0.0`) it is undefined. Keep uuid if LAN access over http matters. |
| react-syntax-highlighter | **Keep, change import** | Switch to `PrismLight` with registered languages (issue 4). |
| gsap + motion | **Keep both for now** | 23 files use gsap and 44 use motion, about 610 KB rendered together. They serve different roles (gsap for imperative timelines in the director and loader, motion for declarative presence). Consolidating isn't worth the churn until the voice stack and syntax highlighter are split out. |
| @elevenlabs/client, @ricky0123/vad-web, @google/genai | **Keep, lazy-load** | Pulled in by the shell; load them with `await import()` on first use. |
| @ffmpeg/core 0.12.10 (pinned) | **Keep** | Intentional pin for the static copy of the ESM build; the comment in `vite.config.ts` explains why. |
| simple-rnnoise-wasm | **Keep** | Loaded with a dynamic import (`services/noiseCancellation.ts:47`) plus a static-copied wasm. |
| vite 5 / tailwind 3 / daisyui 4 / @types/node 20 | **Plan the upgrade** | SUSPECTED to be one major version behind (`pnpm outdated` timed out on the registry). Upgrade after issues 3 and 4 so the bundle diffs are measurable. |

## 4. Test and lint status (real numbers)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **PASS**, exit 0. Image-editor files are being edited in parallel, so a later error in `ImageEditorPage.tsx`/`NewDocumentModal.tsx` may be transient. |
| `pnpm test` (vitest) | **121 files and 1,416 tests passed, 0 failed** in 98 s. The noisy log is a signal, though: "indexedDB is not defined" (×20+), "readFileSync is not a function" and "Failed to parse URL /sfx/…" mean persistence paths pass because the errors are swallowed, not because they're exercised. `fake-indexeddb` would make those tests real. |
| ESLint (not in any gate) | **572 errors and 78 warnings in 164 of 523 files.** Top rules: no-unnecessary-type-assertion 137, no-floating-promises 134, no-misused-promises 128, no-unused-vars 66 (warning), unbound-method 65, require-await 42, 3 parse errors. |
| husky | `pre-commit` runs `pnpm validate-config`; `pre-push` runs `pnpm lint && pnpm test`. There's no ESLint and no lint-staged. |
| CI | `ci.yml` runs lint (tsc), validate-config, test and build, but **not on `development`** and with no e2e. |
| e2e (Playwright) | 6 specs, 22 tests: settings (12), converter (3 + 1 AV verify), smoke (2), avatar-relay (2), image-editor (2, new). **Features with zero e2e:** Assistant/LLM chat, Prompts (Crafter/Refiner/Analyzer), Gallery/Vault connect, Composer, Dashboard, Local Generation Studio (Comfy/A1111), LoRA editor, Batch Runner, Discovery, Assets Manager, all MCP/CDP server routes, and the page-transition payload handoff (the bug class above). |

## 5. Architecture: keep, change or kill

**Keep**
- **The `manifestStore.loadManifestSafe` / `safeToSave` guard.** This is the right defence against empty-manifest overwrites.
- **image-editor boundaries.** It only imports `components/icons`, `utils/settingsStorage`, `utils/galleryStorage` (via `GalleryBridge`) and `contexts/BusyContext`, and it has its own IDB database (AutosaveService). That's clean enough; don't add an abstraction layer.
- **Workers for ffmpeg, magick, adjust and pdf, with local static-copied wasm.** Correct, local-first.
- **The static import graph.** Only 2 two-file cycles across 381 modules. That's healthy; fix the two and add `madge --circular` to CI later if they recur.
- **The `/proxy-remote` allowlist** (`isAllowedProxyTarget`, `server.ts:196`). Good. Also check that `vite preview` (used by e2e) doesn't expose the vite.config `/proxy-remote` router, which has **no** allowlist, on all interfaces (`host: true`). That is SUSPECTED, since preview inherits `server.proxy` unless `preview.proxy` is set.

**Change**
- **App.tsx** (695 lines) is a mid-size shell, not a god component. It has already been split into hooks (`useAppShell`, `useBootSequence`, `usePageTransitions`, `useAppEventBus`). The remaining waste is the 18 eager page imports and the `renderPage` switch that repeats `PromptsPage` props 5 times. Lazy pages (issue 7) plus a route table in `routeFx.ts` fix both.
- **Typed event bus** (issue 11). This is about 20 lines of type map with no runtime change.
- **The 27 dynamic-plus-static import pairs.** Pick one import style per module; today's mix hides the real chunk graph.
- **The server security model** (issue 1). This is the single most important change.

**Kill**
- **The GitHub Pages deploy**, unless a static demo mode is actually wanted (issue 3). It has been silently broken since at least July, and its architecture doesn't fit a server-dependent app.
- **Dead code:** `TransitionOverlay.abort()` has no callers, the pass-through middleware in `server.ts:80-82` does nothing, and there are 6 orphan events.
- **Root clutter (only what's cheap):**
  - `constants.ts` is a 5-line re-export barrel beside `constants/`. Replace it with `constants/index.ts`, which leaves import paths unchanged.
  - `probe-import.mjs`, `test-results/`, `.tmp-verify/` and `.topaz-tmp/` are already gitignored, so they're local-only and harmless.
  - `metadata.json`, `serve.json` and `loading_animation.json` are tracked. Check them for references and delete the orphans.
  - `src/` holding only middleware and schemas for the server is misleading. Moving it to `server/` together with `routes/` and `server.ts` would clarify the client/server split, but only do that when the server is next touched; it doesn't pay for itself as a standalone move.
