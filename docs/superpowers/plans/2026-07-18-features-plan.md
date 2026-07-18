# Feature Implementation Plan — Round 2

**Date:** 2026-07-18
**Branch:** `main` (in-progress uncommitted changes exist)

## Overview

Four features requested:
1. **Obsidian Second Brain** — AI assistant tools to search/read/write an Obsidian vault
2. **Web Agent View Fix** — Repair the WebViewerPanel so it reliably opens when the assistant calls `open_web_page`
3. **Media Panel** — Slide-out panel playing YouTube videos and Spotify music, openable via assistant tool + header button
4. **AI Activity Panel** — Slide-out panel showing assistant tool calls, thinking steps, and conversation transcripts

---

## Architecture Context

### Existing panel patterns
The app has four slide-out panels, all mounted in `App.tsx` (inside the `main` tag, alongside `<LiveCaptionOverlay />`):

| Panel | State | Animation | Mount Style |
|---|---|---|---|
| `ClippingPanel` | `isClippingPanelOpen` | GSAP `x: translateX` | Absolute positioned in the shell |
| `NotesPanel` | `isNotesPanelOpen` | GSAP `x: translateX` | Absolute positioned in the shell |
| `LLMChatPanel` | `isChatPanelOpen` | React state (visibility toggle) | Portal-rendered to `document.body` |
| `WebViewerPanel` | self-managed via event bus | Framer Motion `x: translateX` | Portal-rendered to `document.body` |

All panels communicate with the assistant via `appEventBus`:
- `appEventBus.on('openWebPage', { url })` — opens WebViewerPanel
- `appEventBus.on('notesChanged', notes)` — refreshes NotesPanel
- `appEventBus.on('assistantFilesChanged')` — refreshes Files tab

New panels should follow either the **ClippingPanel/NotesPanel pattern** (mounted in App.tsx, GSAP slide, state in App.tsx) or the **WebViewerPanel pattern** (portal, self-managed, event-bus driven). For panels that need a header toggle button, the App.tsx + GSAP pattern is preferable.

### Assistant tool registration
Tools live in `services/assistantTools.ts` as entries in `ASSISTANT_TOOLS: AssistantTool[]`. Each has `{ name, description, parameters, execute }`. The `WORKSPACE_CAPABILITIES` string in `services/assistantService.ts` must be kept in sync with every new tool.

### Event bus
`utils/eventBus.ts` — simple pub/sub with `on(event, cb)` returning an unsubscribe function, and `emit(event, payload)`.

---

## Feature 1: Obsidian Second Brain Integration

### Goal
Give the AI assistant tools to turn Kollektiv into a "second brain" by reading/writing/searching an Obsidian vault. Obsidian vaults are plain markdown files in a folder with an `.obsidian/` subdirectory. The app already has `fileSystemManager` (File System Access API) — we reuse it to access the vault.

### Files
- **Create:** `utils/obsidianStorage.ts` — vault access layer (list files, search, read, write, resolve [[wikilinks]])
- **Create:** `utils/obsidianStorage.test.ts` — unit tests for search/link resolution
- **Modify:** `services/assistantTools.ts` — add `obsidian_search`, `obsidian_read`, `obsidian_write`, `obsidian_list`, `obsidian_link_graph` tools
- **Modify:** `services/assistantService.ts` — update `WORKSPACE_CAPABILITIES` to mention Obsidian capabilities
- **Modify:** `components/settings/IntegrationsSection.tsx` — add Obsidian vault path config (optional, uses the existing vault folder or a dedicated path)

### Interfaces

```ts
// utils/obsidianStorage.ts
export interface ObsidianNote {
    path: string;       // relative path within vault (e.g. "Projects/Idea.md")
    title: string;      // extracted from # heading or filename
    content: string;    // full markdown content
    links: string[];    // [[wikilink]] targets found in this note
    backlinks: string[]; // notes that link TO this note (computed on search)
    updatedAt: number;  // last modified timestamp
}

export function isObsidianVault(dirHandle: FileSystemDirectoryHandle): Promise<boolean>
// Checks for `.obsidian/` subdirectory

export function setVaultHandle(handle: FileSystemDirectoryHandle): void
// Store the vault directory handle (separate from the main vault if different)

export function getVaultHandle(): FileSystemDirectoryHandle | null

export async function* listNotes(prefix?: string): AsyncGenerator<ObsidianNote>
// Walk the vault dir recursively, yield markdown files with parsed metadata

export async function searchNotes(query: string): Promise<ObsidianNote[]>
// Full-text search of all markdown files (simple includes match for v1)

export async function readNote(path: string): Promise<ObsidianNote | null>
// Read a specific markdown file by its relative path

export async function writeNote(path: string, content: string): Promise<void>
// Create or overwrite a markdown file in the vault

export async function resolveLinks(note: ObsidianNote, allNotes: ObsidianNote[]): string[]
// Resolve [[wikilinks]] to actual note paths — returns display text

export async function buildLinkGraph(): Promise<Record<string, string[]>>
// Returns { filepath: [linked_filepaths] } for the whole vault
```

### Assistant tools to add

```ts
{
    name: 'obsidian_search',
    description: 'Search all markdown notes in your Obsidian vault by query text. Returns a JSON list of matching notes with paths and titles.',
    execute: async ({ query }) => {
        // searchNotes(query) → return JSON list
    }
}
{
    name: 'obsidian_read',
    description: 'Read the full content of an Obsidian note by its file path (obtained from obsidian_search or obsidian_list).',
    execute: async ({ path }) => {
        // readNote(path) → return content
    }
}
{
    name: 'obsidian_write',
    description: 'Create a new note or overwrite an existing one in your Obsidian vault. Provide the file path (e.g. "Projects/idea.md") and markdown content.',
    execute: async ({ path, content }) => {
        // writeNote(path, content) → success message
    }
}
{
    name: 'obsidian_list',
    description: 'List all markdown notes in your Obsidian vault, optionally filtered by a folder prefix.',
    execute: async ({ prefix }) => {
        // listNotes(prefix) → return JSON list of {path, title}
    }
}
{
    name: 'obsidian_link_graph',
    description: 'Show the [[wikilink]] connection graph for the vault or a specific note. Returns which notes link to each other.',
    execute: async ({ path }) => {
        // buildLinkGraph() or resolveLinks → return JSON
    }
}
```

### Setup flow
1. In Settings > Integrations > Obsidian: a "Connect Obsidian Vault" button opens the folder picker
2. The app checks for `.obsidian/` to confirm it's a vault
3. The handle is stored in IndexedDB (via `idb`, same as the main vault handle)
4. The assistant tools work with the stored handle

### Implementation steps
- [ ] Step 1: Create `utils/obsidianStorage.ts` with vault detection, listing, search, read, write
- [ ] Step 2: Create `utils/obsidianStorage.test.ts` (unit tests for search, link parsing)
- [ ] Step 3: Add the 5 assistant tools to `services/assistantTools.ts`
- [ ] Step 4: Update `WORKSPACE_CAPABILITIES` in `services/assistantService.ts`
- [ ] Step 5: Add Obsidian settings section in `components/settings/IntegrationsSection.tsx`
- [ ] Step 6: Type-check, test, and commit

---

## Feature 2: Web Agent View Fix

### Goal
Fix the `WebViewerPanel` so it reliably opens and shows content when the assistant calls `open_web_page`. Currently the panel is self-managed (portal to `document.body`) and listens for `appEventBus.on('openWebPage')`.

### Issues (identified from code review)
1. The panel is portal-rendered to `document.body`, not managed by App.tsx state — potential z-index and stacking issues
2. No "close on navigate away" behavior — if the user changes tabs, the panel stays visible
3. No manual toggle button — user can't re-open it without the assistant
4. The reader mode text extraction can be fragile for JS-heavy SPAs

### Fix plan
1. Add a header toggle button for the WebViewerPanel (like NotesPanel has)
2. Add state `isWebViewerOpen` to App.tsx
3. Move the panel to be mounted in App.tsx alongside other panels (not portal)
4. Auto-close on tab navigation
5. Improve the reader mode fallback for SPA pages

### Files
- **Modify:** `components/WebViewerPanel.tsx` — accept props `{ isOpen, onClose, url? }`, remove portal and self-management
- **Modify:** `components/App.tsx` — add `isWebViewerOpen` state, mount WebViewerPanel, add close-on-navigate
- **Modify:** `components/Header.tsx` — add web viewer toggle button
- **Modify:** `components/icons.tsx` — add `BrowserIcon` if not existing

### Implementation steps
- [ ] Step 1: Convert WebViewerPanel to accept `isOpen`/`onClose` props + optional initial `url`
- [ ] Step 2: Wire state in App.tsx: `isWebViewerOpen`, `handleToggleWebViewer`, `handleCloseWebViewer`, auto-close on navigate
- [ ] Step 3: Add header button
- [ ] Step 4: Verify the `openWebPage` event bus handler still works from assistant tools
- [ ] Step 5: Type-check and commit

---

## Feature 3: Media Panel (YouTube + Spotify)

### Goal
A new `MediaPanel` component — a slide-out panel that plays YouTube videos and Spotify music in embedded players. Opens via:
- A header button (like NotesPanel, ClippingPanel)
- An assistant tool call (`play_media`)
- An event bus event (`openMediaPanel`)

### Design
- **Panel style:** Same slide-out pattern as NotesPanel/ClippingPanel (GSAP animated, positioned on the right)
- **Two tabs:**
  - **VIDEO** — Embedded YouTube iframe player (`youtube.com/embed/{videoId}`)
  - **MUSIC** — Embedded Spotify player (`open.spotify.com/embed/...`)
- **Address bar:** Input field for pasting YouTube URL or Spotify URL
- **State:** Remembers what was playing when closed; resumes on reopen
- **Responsive:** Same width as NotesPanel (`w-full md:w-[480px]`)

### Files
- **Create:** `components/MediaPanel.tsx`
- **Modify:** `components/App.tsx` — add `isMediaPanelOpen` state, mount MediaPanel
- **Modify:** `components/Header.tsx` — add media panel toggle button
- **Modify:** `components/icons.tsx` — add `MusicNoteIcon`, `VideoCameraIcon` (or reuse existing)
- **Modify:** `services/assistantTools.ts` — add `play_media` tool
- **Modify:** `services/assistantService.ts` — update `WORKSPACE_CAPABILITIES`

### Interfaces

```tsx
// components/MediaPanel.tsx
interface MediaPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

type MediaTab = 'video' | 'music';

interface MediaState {
    tab: MediaTab;
    // YouTube
    videoId: string | null;
    videoTitle: string;
    // Spotify
    spotifyUri: string | null;    // e.g. "track/3n3Ppam7vLzC2UjO3yfoU"
    spotifyType: 'track' | 'album' | 'playlist' | 'episode';
    spotifyTitle: string;
}
```

### URL parsing
```ts
// Extract YouTube video ID from various URL formats
function extractYouTubeId(url: string): string | null;
// Handles: youtube.com/watch?v=..., youtu.be/..., youtube.com/embed/..., etc.

// Extract Spotify URI from URL
function extractSpotifyUri(url: string): { type: string; id: string } | null;
// Handles: open.spotify.com/track/..., open.spotify.com/playlist/..., etc.
```

### Assistant tool
```ts
{
    name: 'play_media',
    description: 'Open a YouTube video or Spotify track/playlist in the Media Panel. Provide the full URL. The panel will play the media inline.',
    parameters: {
        url: { type: 'string', description: 'The full YouTube or Spotify URL to play.' },
    },
    execute: async ({ url }) => {
        // Parse URL → determine if YouTube or Spotify
        // Emit 'openMediaPanel' event with { url, type }
        // Return confirmation
    }
}
```

### Implementation steps
- [ ] Step 1: Create `components/MediaPanel.tsx`
  - GSAP slide-in/out (same pattern as NotesPanel)
  - YouTube tab: input + embedded player
  - Spotify tab: input + embedded player
  - URL parsing helpers
- [ ] Step 2: Add `MusicNoteIcon` and/or `VideoCameraIcon` to `components/icons.tsx`
- [ ] Step 3: Wire in `components/App.tsx`:
  - `isMediaPanelOpen` state
  - `handleToggleMediaPanel` / `handleCloseMediaPanel`
  - Mount `<MediaPanel>` alongside other panels
  - Listen for `openMediaPanel` event bus event
- [ ] Step 4: Add header button in `components/Header.tsx`
- [ ] Step 5: Add `play_media` assistant tool
- [ ] Step 6: Update `WORKSPACE_CAPABILITIES`
- [ ] Step 7: Type-check, build, and commit

---

## Feature 4: AI Activity Panel (Transcript)

### Goal
A new `ActivityPanel` component that shows:
1. **AI tool calls** — real-time activity lines (what the assistant is doing: searching, clicking, noting, etc.)
2. **Transcript** — full conversation history for the current session
3. **Thinking steps** — reasoning traces (if available)

### Design
- **Panel style:** Same slide-out pattern as other panels
- **Two tabs:**
  - **ACTIVITY** — Real-time tool call activity (consumes `liveAssistantActivity` events from `useAssistantSignals`)
  - **TRANSCRIPT** — Full conversation transcript with user messages and AI responses
- **Auto-scroll:** New content auto-scrolls to bottom
- **Clear button:** Clear current session transcript

### Existing infrastructure
- `useAssistantSignals()` hook in `utils/useAssistantSignals.ts` already provides:
  - `activity: string[]` — last 4 tool-activity lines
  - `userText: string` — current user caption stream
  - `assistantText: string` — current assistant response stream
  - `mode: AssistantMode` — connecting/command/listening/processing/responding

- `appEventBus` events already flowing:
  - `'liveCaption'` — `{ who: 'user' | 'assistant'; text: string }` (incremental chunks)
  - `'liveAssistantActivity'` — `line: string` (tool call descriptions)
  - `'liveAssistantState'` — `{ status, speaking }` (session state)

- `services/chatStorage.ts` likely exists for persisting chats (verify)

### Files
- **Create:** `components/ActivityPanel.tsx`
- **Modify:** `components/App.tsx` — add state + mount
- **Modify:** `components/Header.tsx` — add toggle button  
- **Modify:** `components/icons.tsx` — add `ActivityIcon`, `TranscriptIcon` or reuse existing
- **Optional:** `services/chatStorage.ts` if transcript needs persistence

### Interfaces

```tsx
// components/ActivityPanel.tsx
interface ActivityPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

type ActivityTab = 'activity' | 'transcript';

interface TranscriptEntry {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    timestamp: number;
}
```

### Data flow
- **Activity tab:** Listen for `'liveAssistantActivity'` events → push to activity list. Also listen for mode changes from `useAssistantSignals`.
- **Transcript tab:** Listen for `'liveCaption'` events → accumulate into a transcript array. On session start (`status === 'connecting'`), clear previous transcript.

### Implementation steps
- [ ] Step 1: Create `utils/transcriptStorage.ts` — simple local array + optional localStorage persistence
- [ ] Step 2: Create `components/ActivityPanel.tsx`
  - GSAP slide-in/out
  - Activity tab with auto-scrolling list of recent tool calls + mode indicators
  - Transcript tab with message bubbles (user vs assistant)
  - Clear button
- [ ] Step 3: Wire in `components/App.tsx`
- [ ] Step 4: Add header button in `components/Header.tsx`
- [ ] Step 5: Type-check, build, and commit

---

## Execution Order

These features are independent and can be built in any order. Recommended order:

1. **Media Panel** — standalone new component, easiest to build first
2. **Web Agent View Fix** — refactor of existing component, good second
3. **AI Activity Panel** — consumes existing signals, third
4. **Obsidian Second Brain** — most complex (new storage layer, tools, settings UI), last

Each feature should be implemented on its own branch or as a focused set of commits.

## Dependencies
- None of these features depend on each other
- All depend on the existing panels infrastructure (GSAP, event bus, App.tsx pattern)
- The Obsidian feature depends on `fileSystemManager` (already exists)
- The Activity Panel depends on `useAssistantSignals` and `appEventBus` (already exist)

## Test Strategy
- **Obsidian:** Unit tests for `obsidianStorage.ts` (search, link parsing, vault detection)
- **Media Panel:** No automated tests (UI component) — manual verification
- **Web Agent View:** Test via E2E Playwright test (click header button → panel appears)
- **Activity Panel:** No automated tests — manual verification

## Commit Strategy
One commit per feature at minimum. Use conventional commits:
- `feat(media): add MediaPanel with YouTube and Spotify playback`
- `fix(web-viewer): convert to managed panel with reliable open/close`
- `feat(obsidian): add Obsidian vault integration and assistant tools`
- `feat(activity): add AI activity and transcript panel`
