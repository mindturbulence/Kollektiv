# Kollektiv — Implementation Plan: Phase 0–3

**Derived from:** ROADMAP.md, ARCHITECTURE.md, and full codebase audit.
**Dependencies:** Each phase builds on the prior; tasks within a phase are ordered by dependency.
**Test strategy:** Every task that touches logic must have corresponding tests (Vitest, next to source). E2E smoke test added in Phase 0.

---

## Phase 0 — Stop the Bleeding

> Foundation debt, security trims, and monolith split. No user-facing changes — this is prep so later phases don't build on sand.

---

### 0.1 — Fix production server branch

**Why:** `server.ts` `NODE_ENV=production` uses Express 5 `app.get('*')` which throws with `path-to-regexp` v8. `pnpm start` doesn't work in production.

**Files:** `server.ts`

**Changes:**
- Replace `app.get('*', ...)` with `app.use(spaFallback)` using Express 5 compatible path handling
- Or switch to named wildcard: `app.get('/{*splat}', ...)`
- Add a production-only log line that confirms the SPA fallback is registered
- Verify: `NODE_ENV=production pnpm start` serves the app

**Tests:**
- Test the route registration logic in isolation (mock express app, verify fallback is called for unrecognized routes)
- Add a Vitest test file `server.test.ts` that exercises the SPA fallback

**Edge cases:**
- Paths with dots (e.g. `/api/health` should not hit the SPA fallback)
- Paths with special characters
- Express 5 specific behavior vs Express 4

---

### 0.2 — Split App.tsx monolith into extracted modules

**Why:** `App.tsx` is ~1,200 lines doing boot, idle, audio, music, navigation, layout, and event-bus wiring. This is the highest-risk file for regressions. Extract pure concerns without changing behavior.

**Files to create:**
- `hooks/useBootSequence.ts` — boot logic (`initializeApp`, `handleInitContinue`, state machine: `initializing | loading | ready | error`)
- `hooks/useAppShell.ts` — shell state (panel toggles, feedback toast, clipped ideas, notes count, files count, keyboard shortcuts)
- `hooks/usePageTransitions.ts` — transition director orchestration (`useTransitionDirector` + `pageFxKind` + navigation commit)
- `hooks/useAppTheme.ts` — `data-theme` attribute sync + font size
- `hooks/useAppEventBus.ts` — all `appEventBus.on(...)` subscriptions extracted from `AppContent`

**Files to modify:**
- `components/App.tsx` — trim to ~300 lines: import hooks, compose them, render layout

**Contract / interfaces:**

```typescript
// hooks/useBootSequence.ts
type BootPhase = 'initializing' | 'loading' | 'ready' | 'error';
interface BootState {
  phase: BootPhase;
  status: string;
  progress: number | null;
  isWelcome: boolean;
}
interface UseBootSequenceReturn {
  bootState: BootState;
  initializeApp: (customSettings?: LLMSettings) => Promise<void>;
  handleInitContinue: (withMusic: boolean) => Promise<void>;
  hasInitializedRef: React.MutableRefObject<boolean>;
}

// hooks/useAppShell.ts
interface PanelState {
  isAboutModalOpen: boolean;
  isClippingPanelOpen: boolean;
  isMediaPanelOpen: boolean;
  isWebViewerOpen: boolean;
  isActivityPanelOpen: boolean;
  isChatPanelOpen: boolean;
  isLlmPanelOpen: boolean;
  isCommandPaletteOpen: boolean;
  videoPlayerUrl: string | null;
  globalFeedback: { message: string; type: 'success' | 'error' } | null;
}
interface UseAppShellReturn extends PanelState {
  clippedIdeas: Idea[];
  notesCount: number;
  filesCount: number;
  setActiveTab: (tab: ActiveTab) => void;
  // ... all toggle/close handlers
}

// hooks/useAppEventBus.ts
interface UseAppEventBusReturn {
  // empty — side-effect only hook
}
```

**Test strategy:**
- Each hook gets a unit test file (`hooks/useBootSequence.test.ts`, etc.)
- Mock the dependencies (settings, auth, appEventBus, fileSystemManager)
- Test `App.tsx` renders without crashing after extraction (canary test)
- The existing Playwright smoke test (`e2e/smoke.spec.ts`) validates boot path

**Edge cases:**
- Double-mount from React StrictMode during dev (must not spawn concurrent init)
- Boot failure at each phase shows the correct error UI
- `isFirstRevealRef` must survive the extraction (one-time GSAP reveal animation)

---

### 0.3 — Raise the test floor

**Why:** Tests exist for storage utils and assistant protocol, but high-risk pure logic in `llmService.ts` and `settingsStorage.ts` has none. One Playwright smoke test needed.

**Files to create:**
- `services/llmService.test.ts` (extend existing with tests for `cleanLLMResponse`, `stripReasoningTags`, `buildContextForEnhancer`, `buildMidjourneyParams`)
- `services/llmService.test.ts` fixtures: sample LLM responses with reasoning tags, modifier objects, etc.
- `utils/settingsStorage.test.ts` (migration paths, default merging, legacy provider cleanup)
- `e2e/smoke.spec.ts` (improve existing — the file exists but may be minimal)

**Test cases for `llmService.test.ts`:**
```typescript
describe('cleanLLMResponse', () => {
  it('removes code fences', () => { /* ```json ... ``` → trimmed */ });
  it('removes list markers at start', () => { /* "1. Here is..." → "Here is..." */ });
  it('removes boilerplate openers', () => { /* "Sure, here is..." → "..." */ });
  it('handles empty input', () => { expect(cleanLLMResponse('')).toBe(''); });
});
describe('stripReasoningTags', () => {
  it('removes <think>...</think> across chunks', async () => { /* async generator test */ });
  it('handles nested tags', async () => { /* ... */ });
  it('handles no tags (passthrough)', async () => { /* ... */ });
});
describe('buildContextForEnhancer', () => {
  it('builds architectural constraints block', () => { /* ... */ });
  it('handles empty modifiers', () => { /* returns "" */ });
});
describe('buildMidjourneyParams', () => {
  it('builds --ar/--c/--s flags', () => { /* ... */ });
});
```

**Test cases for `settingsStorage.test.ts`:**
```typescript
describe('loadLLMSettings', () => {
  it('deep merges partial saved state with defaults', () => { /* ... */ });
  it('migrates legacy hermes provider to gemini', () => { /* ... */ });
  it('migrates old mcpServerUrl/mcpEnabled to mcpServers array', () => { /* ... */ });
  it('falls back to defaults on corrupted JSON', () => { /* ... */ });
  it('preserves nested token usage objects on merge', () => { /* ... */ });
});
```

**E2E smoke test (`e2e/smoke.spec.ts`):**
```typescript
test('boot with OPFS stub renders dashboard', async ({ page }) => {
  // Stub File System Access picker (can't show real dialog in CI)
  // Navigate → Welcome screen → skip folder → dashboard visible
  // Assert header, footer, no error boundary
});
```

---

### 0.4 — Security trims: Gmail confirmation + proxy allowlist + browser kill switch

**Why:** `send_gmail`/`delete_gmail` can perform destructive external actions without confirmation. `/proxy-remote` forwards auth headers to any URL. Browser control lacks a visible kill switch.

**Files to modify:**
- `services/assistantTools.ts`
- `server.ts`
- `components/ScreenControlOverlay.tsx`

**Changes:**

**0.4a — Gmail tool confirmation gate:**

Add a `requireConfirmation` field to `AssistantTool` interface:

```typescript
export interface AssistantTool {
  name: string;
  description: string;
  parameters: { ... };
  confirmation?: 'always' | 'per_action' | 'never'; // default: 'never'
  execute: (args: Record<string, any>, ctx: ToolContext) => Promise<string> | string;
}
```

Modify `executeAssistantTool` to:
1. Before executing `send_gmail` or `delete_gmail`, check `confirmation`
2. If `'always'` or `'per_action'`, emit `assistantFeedback` asking the user to confirm via a new `appEventBus` event (`'requireToolConfirmation'`)
3. The `ConfirmationModal` (or a new `ToolConfirmationModal`) listens for this event and shows the tool name + arguments
4. User confirms → event replies back → `executeAssistantTool` proceeds

Set:
- `send_gmail` → `confirmation: 'always'`
- `delete_gmail` → `confirmation: 'always'`
- `read_gmail` → `confirmation: 'per_action'` (first read in a session needs confirmation)

**0.4b — Proxy allowlist:**

Add to `server.ts`:
```typescript
const PROXY_ALLOWLIST = new Set([
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'openrouter.ai',
  // + any URL from settings.mcpServers that starts with http
  // + any URL from settings.ollamaBaseUrl, settings.llamacppBaseUrl
]);
```

Before forwarding `/proxy-remote`, parse `x-target-url` and validate it's either:
- In the static allowlist, OR
- One of the user's configured provider URLs (read from settings via a query param or header)

**0.4c — Visible browser kill switch:**

`ScreenControlOverlay.tsx` already exists. Verify/improve:
- Always-visible "stop control" button (not just an X on the overlay)
- Button floats persistently while browser tool is being used
- Disconnects CDP session and emits `'assistantFeedback'` to let the assistant know control ended

**Tests:**
- Unit test for confirmation gate logic in `executeAssistantTool`
- Unit test for proxy allowlist URL validation (can be tested without network)
- Playwright test: verify browser control indicator appears during CDP session

**Edge cases:**
- User has multiple tabs — confirmation must reference which tab/session
- Confirmation timeout: if user doesn't respond in 60s, tool call fails gracefully
- Proxy allowlist: IPv6 addresses, localhost variations, ports

---

### 0.5 — De-hardcode drift-prone strings

**Why:** `claude-3-7-sonnet-20250219` in `server.ts` and similar hardcoded strings are easy to forget during updates.

**Files:**
- `constants/llmDefaults.ts` (add `DEFAULT_ANTHROPIC_MODEL` export)
- `server.ts` (import from constants)

**Changes:**
- Move `claude-3-7-sonnet-20250219` to `DEFAULT_ANTHROPIC_MODEL` in `constants/llmDefaults.ts` (already exists partially — verify)
- Audit `server.ts` for any other hardcoded model strings → move to constants
- Audit `services/anthropicService.ts` for the same

**Test:**
- Test that `server.ts` imports the constant correctly (static analysis)
- Test that `anthropicService.ts` uses the constant

---

## Phase 1 — Robustness & First-Run Experience

> Making the app survivable for a stranger on a fresh machine.

---

### 1.1 — Onboarding rework

**Why:** The File System Access folder-picker gate is the #1 abandonment point. Users on Firefox/Safari hit a dead end.

**Files to create:**
- `components/OnboardingFlow.tsx` — multi-step onboarding wizard
- `components/DemoModeIndicator.tsx` — "Running in demo mode" badge
- `utils/demoMode.ts` — demo mode storage service (OPFS-based no-op store)

**Files to modify:**
- `components/Welcome.tsx` — integrate onboarding flow instead of single picker screen
- `components/App.tsx` — boot sequence: if user chooses demo mode, skip folder picker
- `utils/fileUtils.ts` — add OPFS-based `DemoFileSystemManager` implementing `IFileSystemManager`

**Contract:**

```typescript
// utils/demoMode.ts
export const isDemoMode = (): boolean => localStorage.getItem('kollektiv_demo_mode') === 'true';
export const setDemoMode = (active: boolean): void => localStorage.setItem('kollektiv_demo_mode', String(active));
export const DEMO_MANIFEST: GalleryManifest = { galleryItems: [], categories: [], pinnedIds: [] };
```

**Onboarding steps:**

1. **Welcome / "What is Kollektiv?"** — Explainer card: what the vault folder is, what gets written (JSON manifests, media files), privacy notice ("everything stays local, no telemetry")
2. **Storage choice** — Three options:
   - "Choose a folder (recommended)" → File System Access picker
   - "Try without a vault (demo mode)" → OPFS, data persists in browser but is not portable
   - "Connect Google Drive" → existing Drive auth flow
3. **Provider quick-setup** — Single screen: pick primary LLM provider, enter API key (or "skip, I'll set up later")
4. **Finish** — Navigate to dashboard

**Tests:**
- Test `isDemoMode()/setDemoMode()` round-trip
- Test demo mode skips fileSystemManager initialization in boot sequence
- Test onboarding flow renders all 4 steps
- E2E: test demo mode path (no folder picker needed)

**Edge cases:**
- User refreshes during onboarding — should resume at the same step
- Non-Chromium browser should only show "Try without a vault" and "Connect Google Drive"
- Browser doesn't support `navigator.storage.getDirectory()` at all → show clear error
- User picks a folder then revokes permission → fallback to demo mode prompt

---

### 1.2 — Error UX standardization

**Why:** Three error boundaries exist but downstream failures surface inconsistently. Need one standardized pattern.

**Files to create:**
- `components/ErrorDisplay.tsx` — reusable error display component with:
  - Error icon/type badge
  - Human-readable message
  - "What to do next" suggestion line
  - Retry button (optional)
  - Dismiss button

**Files to modify:**
- `utils/errorHandler.ts` — extend with `AppError` class hierarchy:
  ```typescript
  export class AppError extends Error {
    constructor(
      message: string,
      public readonly code: ErrorCode,
      public readonly suggestion?: string,
      public readonly recoverable: boolean = true
    ) { super(message); this.name = 'AppError'; }
  }
  export type ErrorCode = 
    | 'PROVIDER_OFFLINE' | 'API_KEY_INVALID' | 'QUOTA_EXCEEDED'
    | 'STORAGE_UNAVAILABLE' | 'NETWORK_ERROR' | 'PERMISSION_DENIED'
    | 'UNKNOWN';
  export const getErrorCode = (e: unknown): ErrorCode => { /* heuristic */ };
  export const getSuggestion = (code: ErrorCode): string => { /* contextual help */ };
  ```
- `components/FeedbackToast.tsx` — add error code badge and suggestion support
- All LLM services (`geminiService.ts`, `ollamaService.ts`, etc.) — wrap errors in `AppError`
- `components/settings/*` — use standardized error display

**Tests:**
- Test `getErrorCode` heuristics for all known error patterns
- Test `AppError` construction and suggestion mapping
- Test error display renders correctly for each error code

**Edge cases:**
- Non-English error messages from providers (match on error structure, not string content)
- Network timeout vs DNS failure vs connection refused (different suggestions)
- Rate limiting (suggest waiting, not retrying immediately)

---

### 1.3 — Settings resilience with versioned migration

**Why:** `kollektivSettingsV4` is one big JSON blob. A single malformed write can brick settings. Add per-section fallback.

**Files to modify:**
- `utils/settingsStorage.ts`

**Changes:**

```typescript
interface SettingsSchema {
  version: number; // current: 5
  sections: {
    llm?: Partial<LLMSettings>;
    theme?: Partial<Pick<LLMSettings, 'activeThemeMode' | 'lightTheme' | 'darkTheme' | 'fontSize'>>;
    audio?: Partial<Pick<LLMSettings, 'musicYoutubeUrl' | 'musicEnabled' | 'idleScreenType' | 'isIdleEnabled' | 'idleTimeoutMinutes'>>;
    dashboard?: Partial<Pick<LLMSettings, 'dashboardVideoUrl' | 'isDashboardVideoEnabled' | 'dashboardBackgroundType' | 'dashboardImageUrl'>>;
    storage?: Partial<LLMSettings['googleIdentity'] & { storageProvider: string; driveFolderId: string }>;
  };
}
```

- `saveLLMSettings` serializes sections individually with version tag
- `loadLLMSettings` reads sections, validates each, falls back section-by-section, not all-or-nothing
- Migration from v4 → v5: read old flat object, split into sections
- Add `repairSettings()` that validates every section independently

**Tests:**
- Test v4 → v5 migration preserves all data
- Test corrupted section v5 falls back to defaults for that section only
- Test repair settings fixes one bad section without touching others

**Edge cases:**
- `localStorage` full (quota exceeded) — catch and surface suggestion
- Settings written by newer version read by older version — ignore unknown sections
- Concurrent writes from two tabs — last write wins (acceptable)

---

### 1.4 — Vault integrity visibility

**Why:** `verifyAndRepairFiles()` runs silently at boot. Users don't know if repair happened.

**Files to create:**
- `components/IntegrityReportModal.tsx` — shows files scanned, repaired, orphaned

**Files to modify:**
- `utils/integrity.ts` — return detailed report object from `verifyAndRepairFiles()`
  ```typescript
  export interface IntegrityReport {
    scanned: number;
    repaired: number;
    orphaned: number;
    errors: string[];
    durationMs: number;
  }
  ```
- `components/settings/AppSection.tsx` — add "Vault Integrity" section with:
  - Last scan timestamp
  - Report summary (scanned/repaired/orphaned)
  - "Run scan" button
  - Link to full report modal

**Tests:**
- Test `verifyAndRepairFiles` returns correct `IntegrityReport` structure
- Test modal renders report data

---

## Phase 2 — Feature Enrichment

> The moat: generate→ingest→compare loop, gallery intelligence, memory compounding.

---

### 2.1 — Close the generate loop

**Why:** Kollektiv is a great *before* and *after* tool but doesn't own the middle. Refine → generate → auto-ingest → compare → re-refine is the biggest product upgrade.

**Files to create:**
- `hooks/useGenerateLoop.ts` — state machine for the generate loop
- `components/GeneratePanel.tsx` — panel with: refine output preview, generate button, generation progress, auto-ingest toggle
- `components/CompareQuickAction.tsx` — one-click "compare with previous" button

**Files to modify:**
- `components/PromptsPage.tsx` — integrate GeneratePanel into the refiner view
- `services/assistantTools.ts` — add `generate_and_ingest` tool combining generate + gallery save
- `components/ImageCompare.tsx` — accept external URL params for quick comparison

**Contract:**

```typescript
// hooks/useGenerateLoop.ts
type GenerateLoopPhase = 'idle' | 'refining' | 'generating' | 'ingesting' | 'ready' | 'error';
interface GenerateLoopState {
  phase: GenerateLoopPhase;
  refinedPrompt: string | null;
  generatedUrls: string[];
  ingestedItemId: string | null;
  error: string | null;
}
interface UseGenerateLoopReturn {
  state: GenerateLoopState;
  startLoop: (rawPrompt: string, modifiers: PromptModifiers) => Promise<void>;
  compareWithPrevious: () => void;
  reset: () => void;
}
```

**The loop:**
1. User refines a prompt → preview shown in GeneratePanel
2. "Generate" button → calls active provider's generate endpoint (Tensor Art / Imagen / Veo)
3. On completion → auto-ingest result into gallery with sidecar metadata (prompt, model, params)
4. "Compare" button → opens ImageCompare with previous attempt
5. "Re-refine" → sends result back to refiner

**Tests:**
- Unit test `useGenerateLoop` state machine transitions
- Unit test `generate_and_ingest` tool logic (mock provider + gallery storage)
- Integration test: mock provider returns URL → gallery stores it → compare opens

**Edge cases:**
- Provider offline during generation → show error with "Switch provider" action
- Generation takes >30s → show progress indicator, don't block UI
- Gallery ingest fails (no vault) → save to indexedDB fallback
- User navigates away during generation → warn but don't block

---

### 2.2 — Extract model registry to data

**Why:** `getModelSyntax()` hardcodes ~50 architecture profiles in TypeScript. Moving to a versioned JSON schema enables updates without code changes.

**Files to create:**
- `constants/modelProfiles.json` — versioned JSON with schema:
  ```json
  {
    "version": 1,
    "profiles": [
      {
        "name": "Flux",
        "matchPatterns": ["flux", "pro/flux"],
        "format": "markdown",
        "rules": { "maxTokens": 4096, "supportsNegativePrompt": true },
        "mediaType": "image",
        "modes": ["txt2img", "img2img"]
      }
    ]
  }
  ```
- `constants/modelProfiles.ts` — typed loader, import from JSON, validate schema
- `constants/modelProfileSchema.ts` — Zod/type-guard schema for profiles

**Files to modify:**
- `services/llmService.ts` — replace hardcoded `getModelSyntax()` with data-driven lookup
- `constants/models.ts` — reference profiles instead of duplicating

**Tests:**
- Test all existing model names resolve correctly in the JSON registry
- Test unknown model name returns a sensible default profile
- Test JSON schema validation (rejects malformed profiles)
- Test profile overrides work (user custom profile file)

**Edge cases:**
- Missing profile → fallback to `markdown` format with conservative rules
- New model released → user drops JSON file into `public/profiles/` directory
- JSON file fails to parse → log error and use hardcoded fallback (graceful degradation)

---

### 2.3 — Gallery intelligence: duplicate detection + prompt similarity

**Why:** `hash-wasm` is already a dependency. Add perceptual dedup on import and prompt-similarity search.

**Files to modify:**
- `utils/galleryStorage.ts` — add:
  - `isDuplicate(file: Blob): Promise<GalleryItem | null>` — perceptual hash comparison
  - `importWithDedup(file: Blob, metadata): Promise<GalleryItem>` — import or return existing
  - `searchByPrompt(query: string): GalleryItem[]` — trigram/word-overlap similarity

- `components/ImageGallery.tsx` — add:
  - Duplicate badge on items that have duplicates
  - Prompt search bar (distinct from category filter)
  - "Show duplicates" filter toggle

**Files to create:**
- `utils/perceptualHash.ts` — `computeHash(imageData)` using `hash-wasm`
- `utils/promptSearch.ts` — trigram-based similarity scoring

**Tests:**
- Test perceptual hash: same image → same hash, different image → different hash
- Test `isDuplicate` with exact duplicate and resized duplicate
- Test `searchByPrompt` returns results ordered by similarity
- Test prompt search handles empty query (returns all)

**Edge cases:**
- Image too small to hash → skip dedup for that item
- User imports 100 images at once → batch process with progress callback
- Perceptual hash collision (extremely rare) → user can manually merge

---

### 2.4 — Assistant memory that compounds

**Why:** `remember`/`list_memories`/`forget` tools exist but memory is manual. Make it automatic.

**Files to modify:**
- `services/assistantService.ts` — after each turn, run background extraction:
  ```typescript
  const extractImplicitMemory = async (conversation: ChatMessage[]): Promise<string | null> => {
    // Use a cheap LLM call or heuristic to extract user preferences
    // "user prefers 35mm", "user likes natural light", etc.
  };
  ```
- `utils/memoryStorage.ts` — add `autoExtractEnabled` flag, `getMemoryContext` that injects relevant memories into system prompt
- `components/settings/AssistantSection.tsx` — add "Auto memory extraction" toggle

**Tests:**
- Test memory extraction heuristic on sample conversations
- Test `getMemoryContext` returns most relevant memories for a given prompt
- Test auto-extraction doesn't run when disabled

**Edge cases:**
- Conversation has no extractable preferences → return null (zero cost)
- Memory store reaches MAX → evict least recently used, not just oldest
- User explicitly says "don't remember that" → respect negative signals

---

### 2.5 — Prompt lineage as a first-class view

**Why:** `PromptVersionNode` + `LineageGraph` exist but lineage is hidden behind an icon. Promote to the library UI.

**Files to modify:**
- `components/PromptsPage.tsx` — add "Versions" tab to saved prompt detail view
- `components/LineageGraph.tsx` — existing, may need polish for inline display
- `utils/diffUtils.ts` — add `diffPrompts(a, b): Promise<string>` returning markdown diff
- `components/SavedPromptCard.tsx` — show version count badge

**Tests:**
- Test `diffPrompts` produces valid markdown diff
- Test version tree renders correctly for linear and branched histories
- Test restore-branch creates a new version at the branch point

---

## Phase 3 — UI Polish

> Consistency, motion discipline, command palette, gallery performance, basic accessibility.

---

### 3.1 — Consistency audit

**Why:** 17 pages with varying spacing, button styles, empty states, and loading states.

**Files to audit (17 targets):**
- `Dashboard.tsx`, `AssistantPage.tsx`, `DiscoveryPage.tsx`, `PromptsPage.tsx`, `SavedPrompts.tsx`, `ImageGallery.tsx`, `ComposerPage.tsx`, `ImageCompare.tsx`, `ColorPaletteExtractor.tsx`, `ImageResizer.tsx`, `VideoToFrames.tsx`, `LoraEditorPage.tsx`, `SetupPage.tsx`, `ResearchPage.tsx` (if exists), MediaPanel, ClippingPanel, WebViewerPanel

**Checklist (create as `docs/consistency-checklist.md`):**

1. **Spacing:** All pages use consistent `p-4 md:p-6` inner padding. No hardcoded margins outside the scale.
2. **Button variants:** All primary actions use `form-btn form-btn-primary`. All destructive actions use `text-error` variant. All secondary use `form-btn` alone.
3. **Empty states:** Every list view has an empty state component:
   - Gallery empty: `EmptyGallery` — "No images yet. Generate or import your first image."
   - Prompts empty: `EmptyPrompts` — "No saved prompts. Create one with the Crafter."
   - Discovery empty: `EmptyDiscovery` — "No collections loaded."
   - etc.
4. **Loading states:** Every data-fetching view uses a standard `LoadingSpinner` or skeleton on initial load, not inline "Loading..." text.
5. **Error states:** Every data-fetching view uses `ErrorDisplay` component from Phase 1.2.

**Files to create:**
- `components/EmptyState.tsx` — reusable empty state with icon, title, description, action button

**Test:** Visual regression would be ideal but impractical. Instead, each page gets a "renders without crashing" test.

---

### 3.2 — Motion discipline

**Why:** `prefers-reduced-motion` is ignored. Boot sequence has no skip affordance.

**Files to modify:**
- `components/App.tsx` — check `window.matchMedia('(prefers-reduced-motion: reduce)')` and skip GSAP entrance animations
- `components/transitions/routeFx.ts` — skip transition effects when reduced motion is preferred
- `components/InitialLoader.tsx` — add a "Skip →" button (visible after 1s) that skips the remaining animation
- `tailwind.config.js` — no change needed; `motion-safe:` and `motion-reduce:` variants available from Tailwind 3

**Tests:**
- Test that `prefers-reduced-motion: reduce` causes GSAP timeline to be skipped
- Test Skip button appears after 1s in InitialLoader

**Edge cases:**
- User changes reduced-motion preference while app is running — listen for `change` event on the media query
- GSAP context must be properly reverted when animations are skipped

---

### 3.3 — Command palette (Ctrl+K) — full richness

**Why:** Exists but can be richer. Navigation + actions + theme switching + settings deep-links.

**Files to modify:**
- `constants/commandRegistry.ts` — add more commands:
  - Settings deep-links: "Open Appearance Settings", "Open LLM Settings", etc.
  - Theme switching: "Switch to Kollektiv", "Switch to Pip-Boy", etc.
  - Gallery actions: "Import Image", "Toggle NSFW filter", "Export Selection"
  - Prompt actions: "New Prompt", "Import from TXT"
- `components/CommandPalette.tsx` — improvements:
  - Show keyboard shortcut hints next to each result
  - Category headers with sticky positioning
  - Empty state when no results match
  - Selected item preview if applicable

**Tests:**
- Test that all new commands execute correctly
- Test fuzzy search finds commands by keywords and partial matches

---

### 3.4 — Performance pass on the gallery

**Why:** Verify masonry at 1k+ items, check object-URL lifecycle.

**Files to modify:**
- `components/ImageGallery.tsx`

**Changes:**
1. **Virtualized masonry:** At 1k+ items, the current simple `IntersectionObserver` + `displayCount` approach can lag. Replace with `react-virtual` or `@tanstack/react-virtual` for the masonry grid.
2. **Object-URL audit:** `useObjectUrls` exists — confirm it's used everywhere gallery items render, not just some places.
3. **Category switching speed:** Profile why category tree rebuild takes time at 1k items — `treeItems` useMemo iterates all items for each category to compute count. Add a `Map<categoryId, count>` cache.
4. **Image decode timing:** Use `loading="lazy"` on all gallery images. Consider `decoding="async"`.
5. **Debounce search input:** Category search should debounce at 200ms.

**Tests:**
- Performance benchmark: measure render time for 100/500/1000 items
- Test that object-URLs are properly revoked on unmount (no leaks)
- Test virtual scroller renders correct number of items

**Edge cases:**
- Window resize triggers masonry recalculation — debounce at 100ms
- Rapid category switching — abort previous load if still in-flight
- Images fail to load — show broken-image fallback, don't break layout

---

### 3.5 — Keyboard & accessibility basics

**Why:** Focus states, escape-to-close, and alt text make the app feel engineered, not hacked together.

**Files to audit/modify:**
- `components/Header.tsx` — add focus-visible styles for nav buttons
- `components/ImageGallery.tsx` — add `alt` text to all images (use item title or filename)
- `components/FeedbackToast.tsx` — add `role="alert"` for screen readers
- `components/CommandPalette.tsx` — trap focus within palette when open
- All modals (`AboutModal`, `ConfirmationModal`, `MigrationModal`, etc.):
  - Escape key closes
  - Focus trap
  - `aria-modal="true"`, `role="dialog"`

**Files to create:**
- `hooks/useFocusTrap.ts` — reusable focus trap hook for modals/dialogs

**Tests:**
- Test each modal closes on Escape
- Test focus trap keeps focus within modal when tabbing
- Test screen reader attributes are present

---

### 3.6 — Font loading hygiene

**Why:** `index.html` pulls from three CDNs including `onlinewebfonts.com` (privacy risk + availability concern).

**Files:**
- `public/fonts/` — audit which font files already exist here
- `index.html` — self-host fonts that are already in `public/fonts/`, remove external CDN links
- For fonts not yet in `public/fonts/`:
  - Download the actual subset used (check `tailwind.config.js` for `fontFamily` declarations)
  - Add to `public/fonts/`
  - Reference via `@font-face` in `index.css`

**Test:** Visual comparison: app should look identical before and after.

---

## Dependency Graph (task ordering)

```
Phase 0:
  0.1 (production server)
    ↓
  0.2 (App.tsx split)  ← 0.1 is prerequisite (stable server to test on)
    ↓
  0.3 (test floor)     ← parallel with 0.2, or after (tests for extracted hooks)
    ↓
  0.4 (security)       ← independent of 0.2-0.3, can be parallel
    ↓
  0.5 (de-hardcode)    ← quick, do last in Phase 0

Phase 1:
  1.1 (onboarding)     ← depends on 0.2 (cleaner App.tsx to integrate into)
    ↓
  1.2 (error UX)       ← independent, can be parallel with 1.1
    ↓
  1.3 (settings)       ← depends on 0.3 (test patterns established)
    ↓
  1.4 (integrity)      ← depends on 1.2 (ErrorDisplay component)

Phase 2:
  2.1 (generate loop)  ← depends on 1.2 (error UX for failure states)
    ↓
  2.2 (model registry) ← independent, can be parallel with 2.1
    ↓
  2.3 (gallery intel)  ← depends on 2.1 feed (generate → ingest)
    ↓
  2.4 (memory)         ← independent
    ↓
  2.5 (lineage)        ← independent

Phase 3:
  3.1 (consistency)    ← depends on 1.2 (ErrorDisplay, EmptyState)
    ↓
  3.2 (motion)         ← independent
    ↓
  3.3 (command palette)← independent (enhances existing)
    ↓
  3.4 (gallery perf)   ← depends on 3.1 (gallery already audited for empty/loading states)
    ↓
  3.5 (a11y)           ← independent, batch at end
    ↓
  3.6 (fonts)          ← independent, batch at end
```

---

## Summary of all files to create

| File | Phase | Purpose |
|---|---|---|
| `hooks/useBootSequence.ts` | 0.2 | Extract boot logic from App.tsx |
| `hooks/useAppShell.ts` | 0.2 | Extract panel/layout state from App.tsx |
| `hooks/usePageTransitions.ts` | 0.2 | Extract transition director from App.tsx |
| `hooks/useAppTheme.ts` | 0.2 | Extract theme sync from App.tsx |
| `hooks/useAppEventBus.ts` | 0.2 | Extract event subscriptions from App.tsx |
| `server.test.ts` | 0.1 | Production server route tests |
| `services/llmService.test.ts` (extend) | 0.3 | Test pure LLM functions |
| `utils/settingsStorage.test.ts` | 0.3 | Test settings migration/defaults |
| `components/OnboardingFlow.tsx` | 1.1 | Multi-step onboarding wizard |
| `components/DemoModeIndicator.tsx` | 1.1 | Demo mode badge |
| `utils/demoMode.ts` | 1.1 | Demo mode storage service |
| `components/ErrorDisplay.tsx` | 1.2 | Standardized error component |
| `components/IntegrityReportModal.tsx` | 1.4 | Vault integrity report |
| `hooks/useGenerateLoop.ts` | 2.1 | Generate loop state machine |
| `components/GeneratePanel.tsx` | 2.1 | Generate loop panel UI |
| `components/CompareQuickAction.tsx` | 2.1 | One-click compare button |
| `constants/modelProfiles.json` | 2.2 | JSON model registry |
| `constants/modelProfiles.ts` | 2.2 | Typed model profile loader |
| `constants/modelProfileSchema.ts` | 2.2 | Model profile validation |
| `utils/perceptualHash.ts` | 2.3 | Perceptual image hashing |
| `utils/promptSearch.ts` | 2.3 | Text similarity search |
| `components/EmptyState.tsx` | 3.1 | Reusable empty state |
| `hooks/useFocusTrap.ts` | 3.5 | Reusable focus trap |

## Summary of all files to modify (by phase)

**Phase 0:** `server.ts`, `components/App.tsx`, `services/assistantTools.ts`, `components/ScreenControlOverlay.tsx`, `constants/llmDefaults.ts`, `services/anthropicService.ts`

**Phase 1:** `components/Welcome.tsx`, `components/App.tsx`, `utils/fileUtils.ts`, `utils/errorHandler.ts`, `components/FeedbackToast.tsx`, `services/geminiService.ts`, `services/ollamaService.ts`, `utils/settingsStorage.ts`, `utils/integrity.ts`, `components/settings/AppSection.tsx`

**Phase 2:** `components/PromptsPage.tsx`, `services/assistantTools.ts`, `components/ImageCompare.tsx`, `services/llmService.ts`, `constants/models.ts`, `utils/galleryStorage.ts`, `components/ImageGallery.tsx`, `services/assistantService.ts`, `utils/memoryStorage.ts`, `components/settings/AssistantSection.tsx`, `components/SavedPromptCard.tsx`, `components/LineageGraph.tsx`, `utils/diffUtils.ts`

**Phase 3:** All 17 page components, `components/InitialLoader.tsx`, `constants/commandRegistry.ts`, `components/CommandPalette.tsx`, `components/Header.tsx`, `components/FeedbackToast.tsx`, all modal components, `index.html`, `index.css`
