# Kollektiv Enrichment Plan — High Value Features

**Date:** 2026-07-23 (v2 — merged & reviewed)
**Branch:** `phase1-weather-tool` (in-progress uncommitted changes exist)
**Status:** Reviewed — ready for implementation

---

## Overview

This plan addresses the highest-value gaps identified in the BRAHMA_SUMMARY.md comparison analysis and the deep-dive critique of Kollektiv's browser control architecture. All features enrich Kollektiv without architectural mismatch.

| Priority | Feature | Value | Effort | Risk | Depends On |
|---|---|---|---|---|---|
| **F-1** | Command Palette (Ctrl+K) | 9/10 | Low | Low | None |
| **F-2** | Browser Control Refinement | 9/10 | Medium | Medium | None (sub-phases are sequential within) |
| **F-3** | Dashboard Widgets | 8/10 | Low | Low | None |
| **F-4** | WebViewer Save Page | 5/10 | Very Low | Low | None |

> **Naming convention:** `F-X` = top-level Feature priority. `Phase X` = sub-phase within a feature (e.g., Browser Control has Phase 1-5). `F-2 Phase 3` = vision loop.

| Excluded | Rationale |
|---|---|
| Workspace Modes | Wrong audience for Kollektiv's prompt-engineer persona |
| Chrome Extension | Would require a full rewrite; CDP already covers browser control |
| Right-click Context Actions | Better served by the command palette |

---

## Architecture Context

### Infrastructure already in place

| Component | Location | Purpose |
|---|---|---|
| Event bus | `utils/eventBus.ts` | Pub/sub for cross-component messaging: `navigate`, `openWebPage`, `clipIdea`, `assistantFeedback` |
| Navigation | `components/App.tsx` | `handleNavigate()` via `useTransitionDirector` (Context Shift) — 17 `ActiveTab` pages |
| Panel system | `App.tsx` + GSAP | Slide-out panels: `ClippingPanel`, `MediaPanel`, `ActivityPanel`, `WebViewerPanel`, `LLMChatPanel` |
| Assistant tools | `services/assistantTools.ts` | 55+ tools in `ASSISTANT_TOOLS` array with `{ name, description, parameters, execute }` |
| MCP integration | `services/mcpService.ts` | MCP tools merged into assistant tool set via `mcpAssistantTools` |
| In-app browser control | `services/browserControlService.ts` | Synthetic DOM events for Kollektiv's own SPA pages (`data-ai-id` targeting) |
| External browser (CDP) | `services/externalBrowserService.ts` + `server.ts` | Chrome DevTools Protocol bridge to a separate Chrome instance |
| Screen sharing | `services/liveAssistantService.ts` | `getDisplayMedia()` → 1fps JPEG → Gemini Live API (vision pipeline exists but disconnected from control) |
| CDP server-side | `server.ts` (lines ~639-920) | `cdpSend()`, `Page.enable`, `Runtime.enable`, `Input.enable`, `Input.dispatchMouseEvent` — all working |
| Vault stats | `loadGalleryItems()`, `loadNotes()`, `loadMemoryEntries()` | Data sources for dashboard widgets |
| Session logging | `utils/sessionLogger.ts` | `readRecentSessionSummaries()` for activity feed |

### Known gaps (codebase) addressed by this plan

1. **Two disjoint browser control backends** — `browserControlService` (synthetic events) vs `externalBrowserService` (CDP). Every tool in `assistantTools.ts` has `if (externalBrowserService.connected) ... else ...` branching.
2. **No `Page.captureScreenshot`** — CDP bridge enables `Page.enable` but never captures a frame. The assistant acts blind.
3. **Vision pipeline disconnected from control** — `liveAssistantService.ts` streams screens to Gemini Live at 1fps, but NEVER sends a post-action frame. The AI sees once, acts blind, never verifies.
4. **Manual Chrome launch** — User must run `chrome --remote-debugging-port=9222` themselves.
5. **Single-target WebSocket** — One tab, one session, no multi-tab management.
6. **Synthetic events untrusted** — `dispatchEvent(PointerEvent)` has `isTrusted=false`, breaking clipboard, fullscreen, file inputs.
7. **No element grounding in CDP** — Assistant clicks blind coordinates, cannot say "click the Submit button."

---

## Feature 1: Command Palette (Ctrl+K) — P0

### Goal
A global **Ctrl+K** command palette providing:
1. **Page navigation** — jump to any of the 17 app pages
2. **Panel toggles** — open/close Media Panel, Clipping Panel, Web Viewer, Chat, Activity
3. **Assistant actions** — quick tool invocations (refine, search gallery, save note)
4. **Settings shortcuts** — jump to specific settings sections
5. **Theme switching** — quick theme change without navigating to Settings

### Files
- **Create:** `components/CommandPalette.tsx` — palette component
- **Create:** `constants/commandRegistry.ts` — command registry (categories, labels, keywords, shortcuts, execute fns)
- **Create:** `utils/commandPalette.test.ts` — fuzzy matching + registry unit tests
- **Modify:** `components/App.tsx` — mount palette + global keydown listener
- **Modify:** `components/Header.tsx` — add Ctrl+K hint
- **No changes needed:** `appEventBus`, `types.ts`, `assistantTools.ts`

### Design

```
┌──────────────────────────────────────────────────────┐
│  🔍  [________________________________________]  ⌨K │
│                                                      │
│  ─── NAVIGATION ───                                  │
│  → Dashboard                              ⌘1        │
│  → Assistant                              ⌘2        │
│  → Gallery (Vault)                        ⌘3        │
│  → Prompt Library                         ⌘4        │
│  → Settings                               ⌘,        │
│                                                      │
│  ─── PANELS ───                                      │
│  → Toggle Media Panel                                │
│  → Toggle Clipping Panel                             │
│  → Toggle Web Viewer                                 │
│                                                      │
│  ─── ASSISTANT ACTIONS ───                           │
│  → Refine Current Prompt                             │
│  → Search Gallery                                    │
│  → Save Note                                         │
│  → Toggle Live Voice                                 │
│                                                      │
│  ─── THEMES ───                                      │
│  → Switch to Pip-Boy                                 │
│  → Switch to Abyss                                   │
└──────────────────────────────────────────────────────┘
```

### Component architecture

```tsx
interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CommandItem {
  id: string;
  label: string;
  category: CommandCategory;
  keywords: string[];
  shortcut?: string;
  icon?: string;
  execute: () => void;
  requires?: string[];
}

type CommandCategory = 'Navigation' | 'Panels' | 'Assistant Actions' | 'Themes' | 'Settings' | 'Tools';
```

### Keyboard navigation
- `Ctrl+K` / `Cmd+K` — open/close toggle
- `Escape` — close
- `ArrowUp` / `ArrowDown` — navigate results
- `Enter` / `Tab` — execute selected command
- Typing filters via **fuzzy matching** (subsequence match, scored: prefix > consecutive > scattered)
- Empty input shows all commands grouped by category

### Fuzzy matching strategy
Use a custom lightweight implementation — no external dependency:
1. Normalize both query and target (lowercase, strip diacritics)
2. Character-by-character subsequence match (VS Code quick-open style)
3. Score: exact prefix match (x1.5) > consecutive chars (x1.2) > scattered match (x1.0)
4. Boost primary label matches over keyword matches
5. If >30 results, combine with `fuse.js` (already in dependency tree? verify — omit if not)

### App.tsx integration

```tsx
// State
const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

// Global listener
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      setIsCommandPaletteOpen(prev => !prev);
    }
    if (e.key === 'Escape' && isCommandPaletteOpen) {
      setIsCommandPaletteOpen(false);
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [isCommandPaletteOpen]);

// Render
<CommandPalette 
  isOpen={isCommandPaletteOpen} 
  onClose={() => setIsCommandPaletteOpen(false)} 
/>
```

### Command Registry

```ts
// constants/commandRegistry.ts

// NAVIGATION — 16 entries (one per ActiveTab)
const NAVIGATION_COMMANDS: CommandItem[] = [
  { id: 'nav-dashboard', label: 'Dashboard', category: 'Navigation', 
    keywords: ['home', 'landing'], shortcut: '⌘1', 
    execute: () => appEventBus.emit('navigate', 'dashboard') },
  // ... dashboard, assistant, discovery, crafter, refiner, analyzer,
  //     abstractor, gallery, library, composer, compare, palette,
  //     resizer, video, lora, settings
];

// PANELS — 6 entries
const PANEL_COMMANDS: CommandItem[] = [
  { id: 'panel-media', label: 'Toggle Media Panel', category: 'Panels',
    keywords: ['music', 'youtube', 'spotify', 'player'],
    execute: () => appEventBus.emit('togglePanel', 'media') },
  // ...clipping, webviewer, chat, activity, llm
];

// ASSISTANT ACTIONS — 4+ entries
// Note: For v1 these navigate to the relevant page. Future versions 
// can chain actions within the palette.
const ASSISTANT_COMMANDS: CommandItem[] = [
  { id: 'action-refine', label: 'Refine Prompt', category: 'Assistant Actions',
    keywords: ['enhance', 'improve', 'polish prompt'],
    execute: () => appEventBus.emit('navigate', 'refiner') },
  // ...search-gallery, new-note, toggle-live-voice
];

export const ALL_COMMANDS: CommandItem[] = [
  ...NAVIGATION_COMMANDS,
  ...PANEL_COMMANDS,
  ...ASSISTANT_COMMANDS,
];
```

### Styling & Accessibility
- z-index 9999 with full-screen dimmed backdrop
- Centered card, max-w ~600px, matching cyberpunk theme
- `role="dialog"` with `aria-label="Command palette"`
- `aria-activedescendant` for selected result
- Focus trap within palette
- Framer Motion entrance: fade + slight scale

### Implementation steps
1. Create `constants/commandRegistry.ts` with full command registry
2. Create `components/CommandPalette.tsx` with fuzzy matching, keyboard nav, visual design
3. Wire in `components/App.tsx`: state + listener + mount
4. Create `utils/commandPalette.test.ts` — fuzzy matching unit tests
5. Type-check (`tsc --noEmit`) + run tests (`vitest run`)
6. (Optional) Add keyboard shortcut hints to header nav items

---

## Feature 2: Browser Control Refinement — P1

### Current Architecture (As-Is)

Kollektiv has **two separate browser control systems** with different backends, capabilities, and failure modes:

```
                    ASSISTANT TOOLS LAYER
  browser_click / browser_type / browser_scroll / ...
  Every tool has if/else branching:
    if (externalBrowserService.connected) → use CDP
    else → use synthetic DOM events

        ┌─────────────────────┐         ┌──────────────────────────┐
        │ browserControlService│         │ externalBrowserService    │
        │ (in-app SPA control) │         │ (CDP bridge client)      │
        ├─────────────────────┤         ├──────────────────────────┤
        │ Synthetic DOM events │         │ HTTP → server.ts → CDP   │
        │ event.isTrusted=false│         │ Input.dispatchMouseEvent  │
        │ data-ai-id targeting│         │ (trusted!)                │
        │ scrollableAt()      │         │ No screenshot capability  │
        │ Permission-gated    │         │ Single-target WebSocket   │
        └─────────────────────┘         └──────────┬───────────────┘
                                                    ▼
                                         ┌──────────────────────┐
                                         │   server.ts (CDP)    │
                                         ├──────────────────────┤
                                         │ Page.enable ✓        │
                                         │ Runtime.enable ✓     │
                                         │ Input.enable ✓       │
                                         │ Page.getLayoutMetrics │
                                         │ Page.captureScreenshot│
                                         │   → ✗ NOT IMPLEMENTED│
                                         │ Multi-tab: ✗         │
                                         │ Auto-launch: ✗       │
                                         └──────────────────────┘
```

The **vision pipeline** exists separately in `liveAssistantService.ts`:

```
  getDisplayMedia() → video element → canvas → JPEG base64 (1fps) → Gemini Live API
  ↓ This feed is SENT to the AI but NEVER used for control grounding
  ↓ The assistant sees pixels once, acts blind via coordinates, never verifies
```

### Critical Design Clarification

**⚠️ The CDP browser is a SEPARATE Chrome instance from the user's main browser.** The user shares their screen from Chrome A via `getDisplayMedia`, but CDP controls Chrome B (launched by the server with `--remote-debugging-port`). The vision loop captures screenshots from Chrome B, NOT Chrome A.

This means:
- **For live voice sessions:** The vision loop is most useful when the user is *already working in the CDP-connected browser* (Chrome B). The user can switch to it or the assistant can navigate it.
- **For text chat sessions:** The assistant can drive Chrome B autonomously — the user sees the results in the WebViewerPanel or via CDP's `Page.navigate`.
- **The user's main browser screen share remains a one-way video feed** — the assistant can *see* it but cannot *act* on it via CDP (it's a different browser process).
- **UX mitigation for live sessions:** When the CDP browser is active and the assistant performs actions, the user should switch to the CDP Chrome window to see results. The UI will show a clear indicator: "Assistant is controlling an external Chrome window — click here to view." A future improvement can stream the CDP browser's viewport into the WebViewerPanel for side-by-side visibility.
- **Future improvement:** Electron packaging would allow Kollektiv to control its OWN window natively (see ROADMAP), merging the two.

### Phase Breakdown

#### Phase 1 — Foundation: Unified BrowserOperator Interface (3-4 days, LOW risk)

**Goal:** One abstract interface, two implementations, zero if/else branching.

##### 1.1 Create `services/browserOperator.ts`

```typescript
export interface ScreenshotResult {
  data: string;        // Base64-encoded JPEG (no "data:image/..." prefix)
  width: number;
  height: number;
}

export interface BrowserActionResult {
  success: boolean;
  data?: string;       // Human-readable result text
  error?: string;      // Error message if !success
}

export interface BrowserOperator {
  readonly connected: boolean;
  readonly kind: 'in-app' | 'cdp' | 'disconnected';

  // Connection lifecycle
  connect(config?: any): Promise<BrowserActionResult>;
  disconnect(): Promise<void>;
  onDisconnect(cb: () => void): () => void;  // Unsubscribe fn

  // Navigation
  navigate(url: string): Promise<BrowserActionResult>;
  getUrl(): Promise<string>;      // Always async for interface consistency

  // Reading
  readContent(): Promise<ReadContentResult>;

// Separate type for readContent since it returns structured page data
interface ReadContentResult {
  success: boolean;
  title?: string;
  url?: string;
  content?: string;  // Page text, truncated to 5000 chars
  error?: string;
}
  readStructure(): Promise<BrowserActionResult>;

  // Pointing — element-based preferred, coordinate fallback
  click(opts: { id?: string; x?: number; y?: number }): Promise<BrowserActionResult>;
  doubleClick(opts: { id?: string; x?: number; y?: number }): Promise<BrowserActionResult>;
  rightClick(opts: { id?: string; x?: number; y?: number }): Promise<BrowserActionResult>;
  hover(opts: { x: number; y: number }): Promise<BrowserActionResult>;

  // Keyboard
  type(text: string): Promise<BrowserActionResult>;
  pressKey(key: string): Promise<BrowserActionResult>;

  // Scrolling
  scroll(dx: number, dy: number): Promise<BrowserActionResult>;
  scrollTo(frac: number): Promise<BrowserActionResult>;

  // Vision
  captureScreenshot(): Promise<ScreenshotResult | null>;

// ScreenshotResult.data includes the full data URL prefix: "data:image/jpeg;base64,..."
// Both InAppBrowserOperator and CdpBrowserOperator prepend the prefix internally.

  // Advanced
  selectOption(id: string, optionText: string): Promise<BrowserActionResult>;
  uploadFile?(selector: string, filePath: string): Promise<BrowserActionResult>;
  drag?(fromX: number, fromY: number, toX: number, toY: number): Promise<BrowserActionResult>;

  // Multi-tab (for CDP)
  listTabs?(): Promise<{ id: string; title: string; url: string }[]>;
  switchTab?(targetId: string): Promise<BrowserActionResult>;
  openTab?(url?: string): Promise<BrowserActionResult>;
  closeTab?(targetId: string): Promise<BrowserActionResult>;
}
```

##### 1.2 Refactor `browserControlService.ts` → `InAppBrowserOperator`

**Keep:**
- `data-ai-id` click targeting via `clickElement()` — Kollektiv's unique advantage
- `selectOption()` for native `<select>` elements
- `nativeSetter` patching for React-controlled inputs
- `scrollableAt()` for SPA overflow containers
- Overlay-skipping logic

**Remove/Extract:**
- `captureToViewport()` → move to shared utility
- `setCaptureSize()` → move to caller
- `assertPermission()` → keep but centralize

**Add:**
- `captureScreenshot()` — reuse existing `canvas.toDataURL` logic (already proven in `startVideoFrameLoop`)
- `BrowserOperator` interface implementation

##### 1.3 Refactor `externalBrowserService.ts` → `CdpBrowserOperator`

**Keep:**
- `Input.dispatchMouseEvent` — already correct (trusted events)
- All existing CDP HTTP calls

**Add:**
- `captureScreenshot()` — calls new `/api/cdp/screenshot` endpoint
- `onDisconnect()` — WebSocket close event listener
- Multi-tab methods: `listTabs()`, `switchTab()`, `openTab()`, `closeTab()`
- `selectOption()` via `Runtime.evaluate`

##### 1.4 Create `services/browserOperatorResolver.ts`

```typescript
class BrowserOperatorResolver {
  private inApp: InAppBrowserOperator;
  private cdp: CdpBrowserOperator;
  private _active: BrowserOperator | null = null;
  private _fallbackWarned = false;

  get active(): BrowserOperator {
    if (this._active) return this._active;
    return this.inApp;  // Default
  }

  async switchToCdp(target: { targetId: string; wsUrl: string }): Promise<boolean> {
    const result = await this.cdp.connect(target);
    if (result.success) {
      this._active = this.cdp;
      this._fallbackWarned = false;
      return true;
    }
    return false;
  }

  switchToInApp(): void {
    this._active = this.inApp;
    this._fallbackWarned = false;
  }

  /** Assistant tools call this — no more if/else.
   *  Returns the operator WITH a warning if fallback occurred. */
  getOperator(): { operator: BrowserOperator; warning?: string } {
    if (this._active) return { operator: this._active };
    // Auto-fallback to in-app but warn once
    if (!this._fallbackWarned) {
      this._fallbackWarned = true;
      return { 
        operator: this.inApp,
        warning: 'CDP not connected — falling back to in-app browser control. ' +
                 'Actions will affect Kollektiv, not external pages.'
      };
    }
    return { operator: this.inApp };
  }
}

export const browserOperator = new BrowserOperatorResolver();
```

**This eliminates every `if (externalBrowserService.connected)` branch in `assistantTools.ts`.** Tools call `browserOperator.getOperator().operator.click(...)`.

##### 1.5 Gradual migration of assistant tools

The ~18 browser tools in `assistantTools.ts` share a common pattern:
```typescript
// BEFORE
execute: async ({ nx, ny }) => {
    if (externalBrowserService.connected) 
        return externalBrowserService.click(nx, ny);
    return browserControlService.click(nx, ny);
}

// AFTER
execute: async ({ nx, ny }) => {
    const { operator, warning } = browserOperator.getOperator();
    const result = await operator.click({ x: nx, y: ny });
    return warning ? `${result.data}\n${warning}` : result.data;
}
```

**Rollback strategy:** Migrate one tool at a time, test each, commit. Tag with `[browser-refactor]` in commit messages so individual tools can be reverted independently.

#### Phase 2 — Chrome Auto-Launch (2 days, LOW risk)

**Goal:** Zero-config CDP. The server starts Chrome when the user requests browser control.

##### 2.1 Add launch logic to `server.ts`

```typescript
import { spawn, execSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';

let chromeProcess: ChildProcess | null = null;

const CHROME_PATHS: Record<string, string[]> = {
  win32: [
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ],
};

async function findChrome(): Promise<string | null> {
  const platform = process.platform;
  const paths = CHROME_PATHS[platform] || [];
  for (const p of paths) {
    try { 
      await fs.promises.access(p); 
      return p;
    } catch {}
  }
  // Fallback: which/where
  try {
    const cmd = platform === 'win32' ? 'where' : 'which';
    const out = execSync(`${cmd} chrome`, { encoding: 'utf8', timeout: 3000 }).trim();
    return out.split('\n')[0] || null;
  } catch { return null; }
}

async function isPortAvailable(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    return !res.ok; // If it responds, port is taken
  } catch { return true; } // If it fails, port is free
}

async function launchChrome(port = 9222): Promise<{ success: boolean; port: number; error?: string }> {
  const chromePath = await findChrome();
  if (!chromePath) return { success: false, port, error: 'Chrome not found.' };

  // Try ports 9222-9232
  let actualPort = port;
  for (let i = 0; i < 10; i++) {
    if (await isPortAvailable(actualPort)) break;
    actualPort = port + i + 1;
  }

  const userDataDir = path.join(os.tmpdir(), 'kollektiv-chrome-profile');
  await fs.promises.mkdir(userDataDir, { recursive: true });

  chromeProcess = spawn(chromePath, [
    `--remote-debugging-port=${actualPort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
  ], { stdio: 'ignore', detached: true });
  chromeProcess.unref(); // Don't prevent Node from exiting

  // Wait for CDP (15s timeout)
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch(`http://127.0.0.1:${actualPort}/json/version`);
      if (res.ok) return { success: true, port: actualPort };
    } catch {}
  }

  return { success: false, port: actualPort, error: 'Chrome started but CDP unreachable.' };
}

// Portable cleanup
function killChrome(): void {
  if (chromeProcess) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${chromeProcess.pid} /T /F`, { timeout: 3000 });
      } else {
        chromeProcess.kill('SIGTERM');
      }
    } catch {}
    chromeProcess = null;
  }
}

// Register cleanup on all exit paths
const exitHandlers = ['exit', 'SIGINT', 'SIGTERM', 'uncaughtException'];
for (const ev of exitHandlers) {
  process.on(ev, () => { killChrome(); });
}
```

##### 2.2 New endpoints

```
POST /api/cdp/launch → { port?: number } → { success, port, error? }
GET  /api/cdp/status  → { connected, chromeAvailable, chromePid?, port?, targetId?, targetTitle? }
```

##### 2.3 UI integration

In the live assistant header area (next to the screen share button), add a "Launch Browser" button. Visible only when CDP is not connected. Calling `/api/cdp/launch` then auto-connects to the first available tab.

#### Phase 3 — Vision Loop (4-5 days, MEDIUM risk)

**Goal:** The assistant sees → decides → acts → verifies.

##### 3.1 Add `Page.captureScreenshot` to CDP bridge (`server.ts`)

```typescript
// Existing cdpSend() already handles CDP communication.
// Add screenshot-specific method:

async function cdpCaptureScreenshot(): Promise<{ data: string; width: number; height: number } | null> {
  const result = await cdpSend('Page.captureScreenshot', {
    format: 'jpeg',
    quality: 70,
    fromSurface: true,
    captureBeyondViewport: false,
  });
  if (!result?.data) return null;
  
  const metrics = await cdpSend('Page.getLayoutMetrics');
  const { width, height } = metrics?.layoutViewport || { width: 0, height: 0 };
  
  return { data: result.data, width, height };
  // ⚠️ result.data is raw base64 (no "data:image/jpeg;base64," prefix)
  // Callers must prepend the prefix before sending to Gemini
}
```

New endpoint:
```
GET /api/cdp/screenshot → { success: true, data: "base64...", width: 1920, height: 1080 }
```

##### 3.2 Add `captureScreenshot()` to both operator implementations

- **InAppBrowserOperator:** Uses existing `canvas.toDataURL('image/jpeg', 0.7)` — synchronous, low latency.
- **CdpBrowserOperator:** Fetches `/api/cdp/screenshot` — async, network round-trip (~50-200ms). Must handle connection errors gracefully (return `null`, don't throw).

##### 3.3 Build the vision loop

**⚠️ Critical design note:** The vision loop must be gated to avoid creating an autonomous infinite loop. The assistant should NOT act on verification frames autonomously — it should only REPORT what it sees. The user (or a higher-level plan) decides the next action.

```typescript
// services/visionLoop.ts

type VisionAction = 
  | { type: 'click'; x: number; y: number; id?: string }
  | { type: 'type'; text: string }
  | { type: 'scroll'; dy: number }
  | { type: 'navigate'; url: string }
  | { type: 'done'; summary: string };

interface VisionLoopConfig {
  operator: BrowserOperator;
  llmProvider: 'gemini-live' | 'gemini-chat';
  onActivity: (text: string) => void;
  onScreenshot: (data: string) => void;
  onStateChange: (state: 'running' | 'waiting' | 'done' | 'error') => void;
}

class VisionLoop {
  private config: VisionLoopConfig;
  private running = false;
  private activeGoal: string | null = null;

  /** Start a goal-driven loop */
  async start(goal: string): Promise<void> {
    this.activeGoal = goal;
    this.running = true;
    this.config.onStateChange('running');
    
    while (this.running) {
      const done = await this.step();
      if (done) break;
      await this.waitForPageStable();
    }
    
    this.running = false;
    this.activeGoal = null;
  }

  stop(): void {
    this.running = false;
    this.config.onStateChange('done');
  }

  private async step(): Promise<boolean> {
    // 1. Capture current state
    const screenshot = await this.config.operator.captureScreenshot();
    if (!screenshot) {
      this.config.onStateChange('error');
      return true; // Exit on failure
    }
    this.config.onScreenshot(screenshot.data);

    // 2. Ask LLM what to do next
    const action = await this.queryLLM(screenshot.data);
    if (!action || action.type === 'done') return true;

    // 3. Execute
    const result = await this.executeAction(action);
    this.config.onActivity(result);

    return false; // Continue loop
  }

  private async queryLLM(screenshotBase64: string): Promise<VisionAction | null> {
    // Mode 1: Gemini Live API (existing live session)
    //   → Send frame as realtime input + wait for model's tool call response
    //   → The model returns browser_click/type/scroll as function calls
    //   → Extract coordinates/text from the function call args
    //
    // Mode 2: Gemini Chat API (text assistant, non-live)
    //   → Use geminiService to send screenshot + prompt
    //   → Parse structured JSON response
    //
    // ⚠️ System prompt MUST include: "Do not act autonomously. 
    // Report what you see. Only produce action commands when the user
    // explicitly asked you to complete a task."
  }

  private async executeAction(action: VisionAction): Promise<string> {
    const op = this.config.operator;
    switch (action.type) {
      case 'click':
        const r = action.id 
          ? await op.click({ id: action.id })
          : await op.click({ x: action.x, y: action.y });
        return r.data || '';
      case 'type':
        const t = await op.type(action.text);
        return t.data || '';
      case 'scroll':
        const s = await op.scroll(0, action.dy);
        return s.data || '';
      case 'navigate':
        const n = await op.navigate(action.url);
        return n.data || '';
      default:
        return '';
    }
  }

  private async waitForPageStable(): Promise<void> {
    // Strategy 1 (CDP): Listen for Page.lifecycleEvent with 'networkAlmostIdle'
    // Strategy 2 (fallback): Fixed 800ms timeout
    // Strategy 3 (in-app): requestAnimationFrame × 3 with no layout changes
    if (this.config.operator.kind === 'cdp') {
      await new Promise(r => setTimeout(r, 800)); // v1: simple
      // v2: use Page.lifecycleEvent
    } else {
      await new Promise(r => setTimeout(r, 800));
    }
  }
}
```

##### 3.4 Connect to the live assistant

The existing `LiveAssistant.handleMessage()` processes incoming messages from Gemini Live. When the assistant calls a `browser_*` tool, we inject a post-action screenshot:

```typescript
// In LiveAssistant.handleMessage(), inside the tool call handler:

// After executing the tool
const result = await executeAssistantTool(fc.name, fc.args || {}, ...);

// NEW: For browser tools, schedule a verification frame
if (fc.name.startsWith('browser_')) {
  this.scheduleVerificationFrame();
}

// Send tool response FIRST
responses.push({ id: fc.id, name: fc.name, response: { result } });

// ---

/** Schedule a verification screenshot after a browser action.
 *  Sends it as a new realtime input frame AFTER the tool response
 *  has been consumed, so the AI sees the result without interrupting
 *  its own audio response. */
private scheduleVerificationFrame(): void {
  // Wait for the AI to finish processing the tool response, then capture
  setTimeout(async () => {
    // Gate: only capture if still in a live session and not speaking
    if (this.closedByUs || this.playing.size > 0) return;
    
    const screenshot = await this.captureVerificationFrame();
    if (!screenshot) return;
    
    try {
      this.session?.sendRealtimeInput({ 
        video: { data: screenshot.data, mimeType: 'image/jpeg' } 
      });
    } catch {}
  }, 1200); // Wait 1.2s for AI to process tool result + start speaking
}

private async captureVerificationFrame(): Promise<{ data: string } | null> {
  // Use the active operator (CDP or in-app)
  const { operator } = browserOperator.getOperator();
  const result = await operator.captureScreenshot();
  if (!result) return null;
  return { data: result.data };
}
```

**Correct sequencing:** Tool response first → AI processes it → verification frame arrives AFTER → AI sees the result. This avoids the race condition where the frame interrupts the audio response.

##### 3.5 Text assistant integration (non-live)

> ⚠️ **Vision loop requires Gemini.** The vision loop sends screenshots to a multimodal LLM for analysis. Only Gemini supports this among Kollektiv's providers. If the user's active LLM is Ollama/Anthropic/llama.cpp/OpenRouter, the `browser_complete_task` tool will return an error: "Vision loop requires Gemini API key — switch your active provider to Gemini in Settings."

The `queryLLM()` method in the vision loop uses `geminiService` (`src/services/geminiService.ts`) to send the screenshot + goal prompt to Gemini Vision and parse the structured action response.

For the text chat assistant (`services/assistantService.ts`), the vision loop works differently:
- The assistant can initiate a loop via a new tool like `browser_complete_task(goal: string)`
- This creates a short-lived `VisionLoop` instance that runs autonomously
- Results stream back as tool events to the chat
- The user can interrupt with "stop"

```typescript
// New assistant tool (assistantTools.ts):
{
  name: 'browser_complete_task',
  description: 'Complete a multi-step browser task autonomously. The assistant will look at the screen, click buttons, type text, and navigate pages until the task is done. Provide a clear goal.',
  parameters: {
    type: 'object',
    properties: {
      goal: { type: 'string', description: 'What to accomplish, e.g. "Search for cats on Google Images"' },
    },
    required: ['goal'],
  },
  execute: async ({ goal }, ctx) => {
    // Start VisionLoop in background
    // Stream results back as assistantFeedback events
    // Return when done or error
  },
}
```

#### Phase 4 — Multi-Tab & Session Management (2-3 days, MEDIUM risk)

**Goal:** The assistant works across multiple tabs without reconnecting.

##### 4.1 Add tab pooling to CDP bridge (`server.ts`)

```typescript
interface CdpSession {
  targetId: string;
  title: string;
  url: string;
  wsUrl: string;
  connected: boolean;
}

const sessions = new Map<string, CdpSession>();
let activeSessionId: string | null = null;

async function listTabs(port: number): Promise<{ id: string; title: string; url: string }[]> {
  const list: any[] = await cdpGet(`http://127.0.0.1:${port}/json/list`);
  return list.filter(t => t.type === 'page').map(t => ({ 
    id: t.id, title: t.title, url: t.url 
  }));
}

async function switchToTab(targetId: string): Promise<boolean> {
  if (sessions.has(targetId) && sessions.get(targetId)!.connected) {
    activeSessionId = targetId;
    return true;
  }
  // ... connect fresh
}
```

##### 4.2 New endpoints

```
GET  /api/cdp/tabs          → List all tabs
POST /api/cdp/tabs/switch   → { targetId } — switch active tab
POST /api/cdp/tabs/new      → Open new tab (optional url)
POST /api/cdp/tabs/close    → { targetId } — close a tab
```

#### Phase 5 — Advanced Actions (1 day, LOW risk)

**Goal:** Full CDP action set: drag, file upload, complex gestures.

```typescript
// Drag & drop with interpolation steps
async function cdpDrag(fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
  await cdpSend('Input.dispatchMouseEvent', { 
    type: 'mousePressed', x: fromX, y: fromY, button: 'left' 
  });
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await cdpSend('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(fromX + (toX - fromX) * t),
      y: Math.round(fromY + (toY - fromY) * t),
      button: 'left',
    });
  }
  await cdpSend('Input.dispatchMouseEvent', { 
    type: 'mouseReleased', x: toX, y: toY, button: 'left' 
  });
}

// File upload via CDP
async function cdpSetFileInput(selector: string, filePath: string): Promise<void> {
  const { result } = await cdpSend('Runtime.evaluate', {
    expression: `document.querySelector('${CSS.escape(selector)}')`,
  });
  const objectId = result?.objectId;
  if (!objectId) throw new Error('File input not found');
  await cdpSend('DOM.setFileInputFiles', { files: [filePath], objectId });
}
```

New endpoints:
```
POST /api/cdp/drag    → { fromX, fromY, toX, toY }
POST /api/cdp/upload  → { selector, filePath }
```

### Implementation order & dependencies

```
Phase 1 (Foundation — unify backends)
  │
  ├──→ Phase 2 (Auto-launch — makes CDP usable)
  │     │
  │     └──→ Phase 3 (Vision loop — requires P1 + P2 for full effect)
  │           │
  │           └──→ Phase 4 (Multi-tab — nice-to-have after core loop)
  │                 │
  │                 └──→ Phase 5 (Advanced actions — edge case round-out)
  │
  └── No dependency on Brahma features (P0/P2/P3 can run in parallel)
```

### Security considerations

| Concern | Mitigation |
|---|---|
| CDP port (9222) exposed on localhost | Only reachable from local machine. Document: don't use on shared machines. |
| `Runtime.evaluate` = arbitrary code execution | Server-initiated only. No user-supplied scripts reach CDP. |
| `/api/cdp/` endpoints have no auth | localhost-only. Low risk. |
| Vision loop sends screenshots to Gemini API | Add warning in settings: "Screenshots of the controlled browser are sent to the AI provider." |
| Autonomous vision loop without user oversight | User must explicitly start `browser_complete_task`. Live session vision loop only sends verification frames, does not act autonomously. |

### Success criteria

- [ ] `assistantTools.ts` has zero `if (externalBrowserService.connected)` branches
- [ ] Assistant can click a button → see the result → report back
- [ ] First-time user clicks "Launch Browser" → gets a controllable Chrome without terminal commands
- [ ] Both `data-ai-id` (in-app) and CDP coordinate paths work through the same `BrowserOperator` interface
- [ ] Multi-tab: assistant can open a new tab, switch tabs, read content
- [ ] Auto-launch Chrome cleans up on server exit (Win/Mac/Linux)
- [ ] `tsc --noEmit` passes
- [ ] `vitest run` passes
- [ ] Post-action screenshot does not interrupt AI's audio response

---

## Feature 3: Dashboard Widgets — P2

### Goal
Transform the Dashboard from a decorative landing page into a productive hub.

### Files
- **Create:** `components/DashboardWidgets.tsx`
- **Create:** `components/widgets/VaultStatsWidget.tsx`
- **Create:** `components/widgets/RecentActivityWidget.tsx`
- **Create:** `components/widgets/QuickActionsWidget.tsx`
- **Create:** `components/widgets/IntegrationHealthWidget.tsx`
- **Create:** `components/widgets/LiveAssistantMiniWidget.tsx`
- **Modify:** `components/Dashboard.tsx` — integrate widgets
- **No changes needed:** `useAssistantSignals`, `loadGalleryItems`, `loadNotes`

### Widget specifications

#### 1. Vault Stats Widget
```
┌─────────────────────────────────────────┐
│  VAULT STATS                    📊      │
│  Gallery: 142 items   │  Notes: 28    │
│  Prompts: 89 items    │  Memory: 12   │
│  Files:    7 items    │  Storage: OK  │
└─────────────────────────────────────────┘
```
- **Data:** `loadGalleryItems()`, `loadNotes()`, `loadMemoryEntries()`
- **Events:** `notesChanged`, `assistantFilesChanged`
- **Clicks:** Navigate to relevant page

#### 2. Quick Actions Widget
```
┌─────────────────────────────────────────┐
│  QUICK ACTIONS                  ⚡      │
│  [New Prompt]  [Open Gallery]          │
│  [Refine Idea]  [Start Research]       │
│  [Toggle Live]  [New Note]             │
└─────────────────────────────────────────┘
```
- **Actions:** Navigate to crafter/gallery/refiner/discovery, toggle live, open clipping

#### 3. Recent Activity Widget
```
┌─────────────────────────────────────────┐
│  RECENT ACTIVITY                🕐      │
│  • Refined "Cyberpunk cityscape"...     │
│  • Saved prompt "Neon portrait"         │
│  • Clipped idea "Lighting setup"        │
│  [View All Activity →]                  │
└─────────────────────────────────────────┘
```
- **Data:** Clipped ideas (`useLocalStorage`) + session logger
- **v1 scope:** Last 5 clipped ideas

#### 4. Integration Health Widget
```
┌─────────────────────────────────────────┐
│  INTEGRATIONS                   🔌      │
│  ✅ Gemini       ✅ Vault              │
│  ✅ Google       ⚠️ Spotify (expired)  │
│  ❌ Ollama       ✅ MCP (3 servers)    │
└─────────────────────────────────────────┘
```
- **Data:** `settings` + `isGoogleAuthValid()`
- **Color coding:** Green/Yellow/Red
- **Click:** Opens Settings at relevant section

#### 5. Live Assistant Mini Widget
```
┌─────────────────────────────────────────┐
│  ASSISTANT                      🤖      │
│  Mode: Listening                         │
│  [Press Ctrl+Space to start]            │
└─────────────────────────────────────────┘
```
- **Data:** `useAssistantSignals()`
- **Click:** Navigates to full assistant page

### Layout
```
┌──────────────────┐  ┌────────────────────────┐
│ Quick Actions    │  │ Vault Stats            │
├──────────────────┤  ├────────────────────────┤
│ Recent Activity  │  │ Integrations           │
├──────────────────┤  ├────────────────────────┤
│ Assistant (mini) │  │                        │
└──────────────────┘  └────────────────────────┘
```
- 2-column grid desktop → 1-column mobile
- Widgets are glassmorphic cards: `bg-base-100/40 backdrop-blur-xl`
- Background gallery montage remains behind widgets
- All widgets handle empty/loading states

### Implementation steps
1. Create `components/DashboardWidgets.tsx` — grid container
2. Create `components/widgets/VaultStatsWidget.tsx`
3. Create `components/widgets/QuickActionsWidget.tsx`
4. Create `components/widgets/RecentActivityWidget.tsx`
5. Create `components/widgets/IntegrationHealthWidget.tsx`
6. Create `components/widgets/LiveAssistantMiniWidget.tsx`
7. Modify `components/Dashboard.tsx` — integrate widgets, reduce logo
8. Type-check + test

---

## Feature 4: WebViewer Save Page — P3

### Goal
One-click "Save Page" button in the WebViewerPanel toolbar. Two modes: save as note (opens Clipping Panel) or save to vault (creates markdown file).

### Files
- **Modify:** `components/WebViewerPanel.tsx` — add toolbar with two save buttons
- **Modify:** `components/icons.tsx` — ensure SaveIcon exists
- **No changes needed:** `fetch_url` and `save_file` exist as assistant tools

### Design
```
┌──────────────────────────────────────────────┐
│  https://example.com/article          [Go]  │
├──────────────────────────────────────────────┤
│  [📄 Save as Note]  [📁 Save to Vault]      │  ← NEW
├──────────────────────────────────────────────┤
│  Page content (iframe or reader mode)        │
└──────────────────────────────────────────────┘
```

### Save behavior
```
Save as Note → extract title + text → open Clipping Panel pre-filled
Save to Vault → extract title + text → write vault/assistant/pages/{title}.md → toast
```

### Implementation steps
1. Add two save buttons to `WebViewerPanel.tsx` toolbar
2. Implement `handleSavePage(mode)` with content extraction
3. Verify `DownloadIcon` in icons, add if missing
4. Type-check

---

## Dependencies

| Feature | Depends On | Can build independently |
|---|---|---|
| Command Palette | None | ✅ Yes |
| Browser Control P1 | None | ✅ Yes |
| Browser Control P2 | P1 | No — unified interface must exist |
| Browser Control P3 | P1 + P2 | No — auto-launch + vision loop needed |
| Browser Control P4 | P1 + P2 | No — needs screenshot+tab infra |
| Browser Control P5 | P1 | No — needs unified interface |
| Dashboard Widgets | None | ✅ Yes |
| WebViewer Save Page | None | ✅ Yes |

Brahma features (P0, P2, P3) can be built **completely independently** of browser control phases.

---

## Execution Order (Recommended)

```
Track A (UI features):          Track B (Browser control):
  P0 Command Palette              P1 Unified interface
  P2 Dashboard Widgets            P2 Auto-launch Chrome
  P3 Save Page                    P3 Vision loop
                                  P4 Multi-tab
                                  P5 Advanced actions
```

Both tracks can run in parallel (different files). Track B is sequential within itself.

---

## Test Strategy

| Feature | Test | Details |
|---|---|---|
| Command Palette | Unit tests | Fuzzy matching, registry integrity, category grouping |
| Dashboard Widgets | Manual + visual | Verify each widget renders real data, test navigation clicks |
| WebViewer Save Page | Manual | Save a page, verify note/vault file created |
| Browser P1 | Unit + typecheck | Operator interface, resolver logic, tool migration one-by-one |
| Browser P2 | Manual | Click "Launch Browser" → Chrome opens → CDP connects |
| Browser P3 | Manual + visual | Assistant clicks → sees result → clicks next button |
| Browser P4 | Manual | Open tab, switch tab, read content from different tabs |
| Browser P5 | Manual | Test drag, file upload on a test page |

Run `tsc --noEmit` + `vitest run` after every change.

---

## Commit Strategy

```
Track A:
  feat(command-palette): add global Ctrl+K command palette with fuzzy matching
  feat(dashboard): add functional widgets replacing decorative layout
  feat(web-viewer): add Save Page button with note and vault modes

Track B:
  refactor(browser): extract BrowserOperator interface from two backends
  feat(browser): add Chrome auto-launch with port conflict resolution
  feat(browser): add CDP screenshot capability and vision loop
  feat(browser): add multi-tab session management
  feat(browser): add drag, file upload, and advanced CDP actions
  refactor(tools): migrate browser tools to unified operator (one commit per 5 tools)
```
