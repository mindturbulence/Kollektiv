# Implementation Plan: IndexedDB Migration + Obsidian Second Brain

**Status:** Approved  
**Author:** Architecture Review  
**Date:** 2026-07  
**Estimated effort:** ~5–7 engineering days total (2–3 IDB, 3–4 Obsidian)

---

## Table of Contents

1. [Overview & Scope](#1-overview--scope)
2. [Workstream A: IndexedDB Migration](#2-workstream-a-indexeddb-migration)
   - 2.1 Schema Design
   - 2.2 Sync-Cache Pattern
   - 2.3 Dual-Write & Migration
   - 2.4 Boot Sequence
   - 2.5 Task Breakdown (A1–A8)
3. [Workstream B: Obsidian Second Brain](#3-workstream-b-obsidian-second-brain)
   - 3.1 Architecture Decision
   - 3.2 Vault Folder Management
   - 3.3 Tool Inventory
   - 3.4 Task Breakdown (B1–B8)
4. [Dependency Graph](#4-dependency-graph)
5. [Test Strategy](#5-test-strategy)
6. [Edge Cases & Safety Nets](#6-edge-cases--safety-nets)
7. [Rollout & Verification](#7-rollout--verification)

---

## 1. Overview & Scope

### What we're doing

**Workstream A** — Migrate three localStorage-backed data stores to IndexedDB:

| Store | Current localStorage key | New IndexedDB store(s) | Consumers |
|-------|------------------------|----------------------|-----------|
| Memories | `assistantMemories` | `memories` | assistantService, assistantTools, VaultStatsWidget |
| Notes | `assistantNotes` | `notes` | ClippingPanel, App (badge), assistantTools, VaultStatsWidget |
| Chat sessions | `kollektiv_chat_sessions` | `chat_sessions` + `chat_messages` | LLMChatPanel, appControlService |

**Workstream B** — Build the promised Obsidian Second Brain integration with 12 assistant tools.

### What stays unchanged

| Data | Rationale |
|------|-----------|
| `LLMSettings` / `kollektivSettingsV4` | Frequent writes, hot-reloaded via CustomEvent — IDB adds latency for no benefit |
| Gallery manifests, Prompt library, Cheatsheets, Research projects, Crafter data | Already in File System vault (JSON on disk) |
| Spotify/OAuth tokens | OAuth callback flow needs sync localStorage reads |
| UI ephemera (`activeTab`, `collapsedPanels`, clipped ideas) | `useLocalStorage` hook, no query need |
| File System Access directory handles | Already in IndexedDB `keyval` store (v1) — keep as-is |

### Dependency summary

```
Workstream A (IDB)
  ├── A1: Schema + db.ts upgrade
  ├── A2: Boot init hook
  ├── A3: memories  → IDB
  ├── A4: notes     → IDB
  ├── A5: chat      → IDB (split)
  ├── A6: UI consumers (sync cache reads)
  └── A7: Service consumers (async reads)

Workstream B (Obsidian)
  ├── B1: obsidianStorage.ts (file I/O layer)
  ├── B2: Obsidian dir handle management
  ├── B3: Settings UI (folder picker)
  ├── B4: Helper utilities (frontmatter, tags, search, wikilinks)
  ├── B5: Assistant tool registrations (Wave 1–3)
  ├── B6: WORKSPACE_CAPABILITIES update
  ├── B7: Integration settings wiring
  └── B8: Verification + graceful errors
```

Workstreams A and B are **independent** after A1 (db upgrade) is done. They can be built in parallel.

---

## 2. Workstream A: IndexedDB Migration

### 2.1 Schema Design

File: `utils/db.ts`

Upgrade from v1 (single `keyval` store) to **v2** with four new object stores.

```typescript
interface KollektivDB extends DBSchema {
  // v1 — keep for backward compatibility (directory handles)
  'keyval': {
    key: string;
    value: any;
  };

  // v2 — new stores
  'notes': {
    key: string;
    value: AssistantNote;
    indexes: {
      'by_updatedAt': number;
      'by_source': string;
      'by_createdAt': number;
    };
  };

  'memories': {
    key: string;
    value: MemoryEntry;
    indexes: {
      'by_createdAt': number;
    };
  };

  'chat_sessions': {
    key: string;
    value: ChatSessionStored;  // without messages array
    indexes: {
      'by_updatedAt': number;
    };
  };

  'chat_messages': {
    key: string;
    value: ChatMessageStored;  // with sessionId foreign key
    indexes: {
      'by_sessionId': string;
      'by_createdAt': number;
    };
  };
}
```

**Key decisions:**

- `chat_sessions` strips the `messages` array. Messages live in `chat_messages` with a `sessionId` field. This enables querying messages without loading the entire session.
- Timestamps are stored as `number` (ms since epoch) for efficient range queries.
- Each store gets a `by_createdAt` index for chronological ordering.

**Upgrade path** (in `openDB`'s `upgrade` callback):

```typescript
upgrade(db, oldVersion, newVersion, transaction) {
  // v1 → v2: add new stores
  if (oldVersion < 2) {
    db.createObjectStore('notes', { keyPath: 'id' });
    // ... create indexes
    db.createObjectStore('memories', { keyPath: 'id' });
    // ...
    db.createObjectStore('chat_sessions', { keyPath: 'id' });
    // ...
    db.createObjectStore('chat_messages', { keyPath: 'id' });
    // ...
  }
}
```

### 2.2 Sync-Cache Pattern

Every migrated storage module follows this exact pattern:

```typescript
// ── Module-level sync cache ─────────────────────────────────────
let _cache: EntityType[] = [];
let _initialized = false;

// ── Boot init — called once from App boot sequence ──────────────
export async function initXStore(): Promise<void> {
  if (_initialized) return;
  try {
    _cache = await db.getAll('store_name');
    _cache.sort(/* newest first */);
  } catch {
    _cache = [];  // IDB unavailable — empty state
  }
  _initialized = true;
}

// ── Sync read (for UI useState, event handlers) ─────────────────
export function getXSync(): EntityType[] {
  return _cache;
}

// ── Async CRUD (for assistant tools, services) ─────────────────
export async function loadX(): Promise<EntityType[]> {
  _cache = await db.getAll('store_name');
  _cache.sort(/* newest first */);
  return _cache;
}

export async function addX(item: EntityType): Promise<void> {
  try {
    await db.add('store_name', item);
  } catch (e) {
    console.error('[addX] IDB write failed, cache not updated:', e);
    throw e;  // Don't update cache if DB write failed
  }
  _cache = [item, ..._cache];
  dualWriteToLocalStorage(_cache);
  appEventBus.emit('xChanged', _cache);
}

export async function updateX(id: string, patch: Partial<EntityType>): Promise<boolean> {
  const existing = await db.get('store_name', id);
  if (!existing) return false;
  const updated = { ...existing, ...patch, updatedAt: Date.now() };
  await db.put('store_name', updated);
  _cache = _cache.map(e => e.id === id ? updated : e);
  dualWriteToLocalStorage(_cache);
  appEventBus.emit('xChanged', _cache);
  return true;
}

export async function deleteX(id: string): Promise<boolean> {
  await db.delete('store_name', id);
  _cache = _cache.filter(e => e.id !== id);
  dualWriteToLocalStorage(_cache);
  appEventBus.emit('xChanged', _cache);
  return true;
}
```

**Why this works:** The UI components already listen for `notesChanged` / subscribe to events. They just need a sync initial value. `getXSync()` provides that from the warm cache. After boot, the cache is populated by `initXStore()`.

### 2.3 Dual-Write & One-Shot Migration

**Strategy (Option C — user-approved):** Dual-write to both IDB and localStorage for one release cycle. On first boot after deploy, migrate existing localStorage data to IDB.

**Migration logic** (runs inside `initXStore()`):

> [!IMPORTANT]
> We use a **migration flag** in the `keyval` store (e.g. `'migrated_notes_v2'`) instead of checking `_cache.length > 0`. Otherwise a user who legitimately has zero records would re-import stale localStorage data on every boot.

```typescript
export async function initXStore(): Promise<void> {
  if (_initialized) return;
  
  // Check migration flag first
  let alreadyMigrated = false;
  try {
    alreadyMigrated = !!(await db.get('keyval', MIGRATION_FLAG_KEY));
  } catch { /* IDB unavailable */ }

  // Try reading from IDB
  try {
    _cache = await db.getAll('store_name');
    _cache.sort(/* newest first */);
    if (alreadyMigrated) {
      _initialized = true;
      return;  // Already migrated — IDB is source of truth
    }
  } catch {
    _cache = [];  // IDB unavailable — fall through to localStorage
  }

  // One-shot migration from localStorage
  try {
    const raw = localStorage.getItem(LOCALSTORAGE_KEY);
    if (raw) {
      const items: EntityType[] = JSON.parse(raw);
      // Write each item to IDB
      for (const item of items) {
        await db.add('store_name', item).catch(() => {}); // ignore dupes
      }
      _cache = items;
      console.log(`[migration] Moved ${items.length} items from localStorage to IDB`);
    }
    // Set migration flag regardless of whether there was data to migrate
    await db.put('keyval', true, MIGRATION_FLAG_KEY).catch(() => {});
  } catch (e) {
    console.error(`[migration] Failed to migrate ${LOCALSTORAGE_KEY}:`, e);
  }
  
  _initialized = true;
}
```

**Dual-write** in every mutation function:

```typescript
function dualWriteToLocalStorage(data: any[]): void {
  try {
    localStorage.setItem(LEGACY_LS_KEY, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable — non-fatal
  }
}
```

**Removal in a future release:** After one cycle with no rollback incidents, delete the `localStorage.setItem` calls and this document.

### 2.4 Boot Sequence

File: `components/App.tsx`

> [!WARNING]
> The boot sequence has been simplified to a **fast-path** — `initializeApp()` immediately calls `onProgress('System Ready', 1.0)` with no staged gates (no `STORAGE_INIT`, no `fileSystemManager.initialize()`). The old multi-stage boot described in ARCHITECTURE.md §4 is no longer accurate.

```
Current boot order (App.tsx L236–250):
  1. initializeApp() sets progress to 100% immediately (fast-path)
  2. InitialLoader shows CONTINUE / CONTINUE WITHOUT MUSIC buttons
  3. handleInitContinue → setIsInitialized(true) → GSAP reveal

New boot order:
  1. initializeApp() calls initIndexedDbStores() first ← NEW
  2. initializeApp() sets progress to 100%
  3. InitialLoader shows CONTINUE / CONTINUE WITHOUT MUSIC buttons
  4. handleInitContinue → setIsInitialized(true) → GSAP reveal
```

Implementation:

```typescript
// In initializeApp(), before onProgress('System Ready', 1.0):
async function initIndexedDbStores() {
  await Promise.all([
    initNotesStore(),
    initMemoriesStore(),
    initChatStore(),
  ]);
}
```

The UI components that read these stores will see:
- **Before init completes:** empty cache → components render 0 counts, empty lists
- **After init completes:** cache populated → `notesChanged` / etc. events fire → UI re-renders with real data

Since the fast-path is near-instant, the IDB init (typically <50ms) will complete before the user sees the app shell. No skeleton/loading spinners needed at the component level.

### 2.5 Task Breakdown (A1–A7)

---

#### Task A1: Upgrade `utils/db.ts` schema to v2

**File:** `utils/db.ts`

**Change:** Upgrade `KollektivDB` interface and `openDB` upgrade callback to add four new object stores with indexes.

**Acceptance criteria:**
- `openDB` with version 2 creates all 4 new stores
- Stores are empty on first creation
- Existing v1 `keyval` store is untouched (backward compatible)
- `getDb()` still works for existing `getHandle`/`setHandle` calls (unchanged API)

**Test:** `db.test.ts` — schema migration, store existence, index creation.

**Dependencies:** None.

---

#### Task A2: Create boot init hook `initIndexedDbStores()`

**File:** `components/App.tsx` + new `utils/storageInit.ts`

**Change:** Create `utils/storageInit.ts` that exports `initIndexedDbStores()` (calls all three `init*Store()` functions). Call it from `AppContent.initializeApp()` between STORAGE_INIT and Loader.

**Acceptance criteria:**
- On app boot, IDB stores are initialized before the loader finishes
- If IDB is unavailable (private browsing, Safari), stores gracefully degrade to empty state
- No UI flicker or crash

**Test:** Manual — add `console.log` checkpoints in boot sequence.

**Dependencies:** A1 (db schema), A3, A4, A5 (individual store init functions)

---

#### Task A3: Migrate `utils/memoryStorage.ts` to IndexedDB

**File:** `utils/memoryStorage.ts`

**Changes:**
1. Add `initMemoriesStore()` — async, reads IDB or migrates from localStorage, fills `_cache`
2. Add `getMemoriesSync(): MemoryEntry[]` — sync read from `_cache`
3. Convert `addMemory()` — **return type changes to `Promise<MemoryEntry | null>`** — IDB write + cache update + dual-write + event emit
4. Convert `deleteMemory()` — **return type changes to `Promise<boolean>`** — IDB delete + cache update + dual-write + event emit
5. Keep `memoryPromptBlock(): string` — **unchanged signature**. No contextual filtering in this pass (keep scope narrow). The current empty-string-when-no-memories pattern already adds zero tokens by default. Enhancement deferred to follow-up.
6. **Preserve** `getAgentMemoryBlock()` and `syncAgentMemoryToVault()` — these are unrelated to the IDB migration (in-memory cache for AGENT.md consolidation). Keep them as-is.

> [!IMPORTANT]
> `addMemory()` becoming async is a **breaking change** for callers. All callers in `assistantTools.ts` already run inside `async execute()` so they just need `await`. But verify no sync callers exist.

**Acceptance criteria:**
- Existing `addMemory` / `deleteMemory` / `loadMemories` callers work unchanged (import paths same)
- `memoryPromptBlock()` returns cached data (0 reads from localStorage/IDB)
- Dual-write writes to both IDB and localStorage `assistantMemories`
- Old localStorage data is migrated on first boot
- `getAgentMemoryBlock()` and `syncAgentMemoryToVault()` still function correctly

**Test:** `memoryStorage.test.ts` — update all tests to work with IDB-backed implementation (use fake `idb` or wrap with `unstable_mock`)

**Dependencies:** A1

---

#### Task A4: Migrate `utils/notesStorage.ts` to IndexedDB

**File:** `utils/notesStorage.ts`

**Changes:** Same pattern as A3 but for notes.

1. Add `initNotesStore()` — async init + migration
2. Add `getNotesSync(): AssistantNote[]` — sync read from `_cache`
3. Convert `addNote()` — IDB write + cache + dual-write + emit `notesChanged`
4. Convert `updateNote()` — IDB put + cache + dual-write + emit
5. Convert `deleteNote()` — IDB delete + cache + dual-write + emit
6. Keep `clearNotes()` — IDB clear + cache clear + dual-write + emit

**Acceptance criteria:**
- All existing callers unchanged
- `notesChanged` event fires correctly (UI already subscribes)
- Dual-write to localStorage `assistantNotes`
- Migration from old localStorage on first boot

**Test:** `notesStorage.test.ts` — same as A3

**Dependencies:** A1

---

#### Task A5: Migrate `utils/chatStorage.ts` to IndexedDB (split sessions + messages)

**File:** `utils/chatStorage.ts`

**Changes — most complex migration:**

1. **New types:**
```typescript
export interface ChatSessionStored {
  id: string;
  title: string;
  updatedAt: number;
  // NO messages array
}

export interface ChatMessageStored {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments_json: string; // JSON-stringified ChatMessageAttachment[]
  createdAt: number;
}
```

2. **Init:** `initChatStore()` — reads IDB or migrates from localStorage, splitting sessions from messages

3. **Sync cache:**
   - `getChatSessionsSync(): ChatSessionStored[]` — session list only, no messages
   - `getChatMessagesSync(sessionId: string): ChatMessageStored[]` — messages for one session

4. **Async CRUD:**
   - `loadChatSessions(): Promise<ChatSessionStored[]>`
   - `saveChatSession(session): Promise<void>` — writes session + all its messages
   - `deleteChatSession(id): Promise<void>` — cascading: deletes session + all its messages
   - `clearAllChatSessions(): Promise<void>` — clears both stores

5. **Dual-write:** Keep writing `kollektiv_chat_sessions` to localStorage (flattened back to nested format for backward compat)

6. **Event:** Add `appEventBus.emit('chatSessionsChanged')` — the LLMChatPanel needs to subscribe

**Acceptance criteria:**
- `saveChatSession({ id, title, messages })` splits into session + individual messages
- `getSavedChatSessions()` returns sessions (without messages by default)
- `getChatMessages(sessionId)` returns messages for a given session
- Delete cascades correctly
- Old localStorage data migrated on first boot

**Test:** `chatStorage.test.ts` — migration from old format, split/join round-trip, cascade delete.

**Dependencies:** A1

---

1. **Uncapped IDB Storage (0 Token Cost)**: Storing unlimited memories in IndexedDB costs **0 tokens** because data stays locally on disk and is never sent to the LLM until requested.
2. **Contextual Memory Recall (`memoryPromptBlock(latestUserMsg?)`) for Token Savings**:
   - Instead of dumping 50 static memories into every prompt (~1,250 tokens wasted per turn), `memoryPromptBlock()` performs **relevance filtering** against the user's active message.
   - It injects only the **Top 5 to 10 most relevant memories** (~150–250 tokens max) plus any pinned core preferences.
   - Irrelevant memories are **ignored completely** for that turn, saving 80–90% of memory token overhead on every request!
3. **Backup & Restore**: Add `exportUserDataJson()` and `importUserDataJson()` in `utils/storageInit.ts` to export/import all IDB stores (`notes`, `memories`, `chat_sessions`, `chat_messages`) as a single downloadable JSON backup file under Settings > App > Storage.

---

#### Task A6: Update UI components for sync-cache reads

This task changes every file that imports from the three migrated stores, switching from sync `loadX()` to sync `getXSync()` calls with proper boot initialization.

**Files to modify:**

| File | Change | Detail |
|------|--------|--------|
| `components/ClippingPanel.tsx` | useState init | `useState(() => loadNotes())` → `useState<AssistantNote[]>(() => getNotesSync())`. Already subscribes to `notesChanged` for updates. |
| `components/App.tsx` | notesCount | `useState(() => { try { return loadNotes().length; } catch { return 0; } })` → `useState(() => getNotesSync().length)`. Also needs to re-read when `notesChanged` fires (subscribe at line 523). |
| `components/LLMChatPanel.tsx` | sessions list | `getSavedChatSessions()` → `getChatSessionsSync()`. Subscribe to new `chatSessionsChanged` event for refresh. |
| `components/widgets/VaultStatsWidget.tsx` | async refresh | **Keep async pattern** — `loadNotes()` → `await loadNotes()`, `loadMemories()` → `await loadMemories()`. This widget uses `Promise.all` inside an async `refresh()` function, NOT `useState` init. |
| `components/App.tsx` | init | Call `initIndexedDbStores()` in boot sequence (Task A2). |

**Detailed changes per file:**

**`ClippingPanel.tsx`:**
```typescript
// Line 329: useState init
const [notes, setNotes] = useState<AssistantNote[]>(() => getNotesSync());

// Line 334: notesChanged subscription already calls setNotes with new array — works unchanged
useEffect(() => appEventBus.on('notesChanged', (n: AssistantNote[]) => setNotes(n)), []);

// All other calls (addNote, updateNote, deleteNote) stay the same — they still work
```

**`App.tsx`:**
```typescript
// Line 167: notesCount init
const [notesCount, setNotesCount] = useState(() => getNotesSync().length);

// Line 523: notesChanged listener
return appEventBus.on('notesChanged', (notes: any[]) => setNotesCount(notes.length));
```

**`LLMChatPanel.tsx`:**
```typescript
// Replace getSavedChatSessions sync calls
// Import getChatSessionsSync
const [savedSessions, setSavedSessions] = useState<ChatSessionStored[]>(() => getChatSessionsSync());

// Subscribe to chatSessionsChanged
useEffect(() => appEventBus.on('chatSessionsChanged', () => {
  setSavedSessions(getChatSessionsSync());
}), []);

// For messages, keep the async load pattern
```

**`VaultStatsWidget.tsx`:**

> [!WARNING]
> This widget does **NOT** use `useState` init — it runs an async `refresh()` via `Promise.all`. The async IDB-backed `loadNotes()` / `loadMemories()` work here directly. No sync cache needed.

```typescript
// Keep async pattern — just ensure these now return Promises (they already will after A3/A4)
const refresh = async () => {
  const [galleryItems, notes, memories] = await Promise.all([
    loadGalleryItems(),
    loadNotes(),      // now returns Promise<AssistantNote[]> from IDB
    loadMemories(),   // now returns Promise<MemoryEntry[]> from IDB
  ]);
  // ... rest unchanged
};
```

**Acceptance criteria:**
- All UI components render on first paint (no async gaps)
- Notes panel updates in real-time when assistant adds/edits/deletes notes
- Chat session list updates when sessions change
- Vault stats widget shows correct counts
- No "undefined is not iterable" errors from uninitialized caches

**Test:** Manual walkthrough of each affected panel.

**Dependencies:** A2, A3, A4, A5

---

#### Task A7: Update service consumers for async reads

**Files to modify:**

| File | Change |
|------|--------|
| `services/assistantTools.ts` | `addMemory()`, `loadMemoryEntries()`, `addNote()`, `loadNotes()`, `updateNote()`, `deleteNote()` — these execute inside `async execute()` callbacks, so they can `await` the async versions directly. No sync cache needed. |

**`assistantTools.ts`** — no structural change needed. Tool `execute` functions are already `async`. Just ensure they call the async versions:
```typescript
// For list_memories tool:
execute: async () => JSON.stringify((await loadMemoryEntries()).map(...))

// For save_note tool:
execute: async ({ title, content }) => {
  const note = await addNote(title, content, 'assistant');
  return JSON.stringify(note);
}
```

Wait — `loadMemoryEntries` is currently called as a named import alias. The tool executes it inside an `async` block. Since `addMemory` returns `MemoryEntry | null` and is synchronous, the return type doesn't change if it becomes async — the existing `?` truthiness check still works with a Promise.

**Files OK as-is** (already handle async):
- `services/assistantService.ts` — `memoryPromptBlock()` reads from sync cache, no change needed
- `services/appControlService.ts` — `getSavedChatSessions()` → needs to become `await loadChatSessions()`

**Acceptance criteria:**
- All 7 assistant tools that touch notes/memories/chat work correctly
- No "X is not a function" or "await is only valid in async function" errors

**Test:** Full integration test — run assistant tools that read/write notes, memories, chat sessions.

**Dependencies:** A3, A4, A5

---

## 3. Workstream B: Obsidian Second Brain

### 3.1 Architecture Decision

**Chosen path:** Client-side File System Access API via a new `utils/obsidianStorage.ts`.

```
Browser (React) → Assistant Tool (obsidian_get_note)
  → utils/obsidianStorage.ts function
    → Direct File System Access API (user-picked folder)
      → Reads/Writes .md files
```

**Why not the MCP server path:**
- The Express server (and its MCP server on port 3012) only runs in dev mode
- Production deploys to GitHub Pages — no server available
- File System Access API works everywhere and is already battle-tested in the codebase
- The `@bitbonsai/mcpvault` path remains as an optional enhancement for server-backed scenarios

> [!IMPORTANT]
> **Existing MCP integration:** `services/kollektivMcp.ts` already imports `@bitbonsai/mcpvault` and registers Obsidian tools via `OBSIDIAN_VAULT_PATH` env var. This code path will **coexist** with the new client-side tools for now. In a future cleanup, we should:
> 1. Remove the `obsidian_` prefix collision by namespacing MCP tools (e.g. `mcp_obsidian_*`)
> 2. Or deprecate the MCP path entirely once client-side tools are proven stable
>
> For this workstream, the new client-side `obsidian_*` tools take precedence. The MCP tools only activate when `OBSIDIAN_VAULT_PATH` is set in the server environment (dev mode only).

**Vault handle management:**

The Obsidian vault uses a **separate** directory handle from the Kollektiv vault. Both handles are stored in IndexedDB's `keyval` store (v1):

| Handle key | Purpose |
|-----------|---------|
| `app-data-dir` | Existing Kollektiv vault (gallery, prompts, etc.) |
| `obsidian-vault-dir` | **New** — Obsidian vault folder |

The user can:
- Pick their Obsidian vault as their Kollektiv vault (auto-detect `.obsidian/` → one folder for both)
- Pick separate folders (Kollektiv vault + Obsidian vault)

### 3.2 Vault folder management

```typescript
// utils/obsidianStorage.ts — module-level state
let _vaultHandle: FileSystemDirectoryHandle | null = null;
let _isInitialized = false;

// ── Initialize ──────────────────────────────────────────────

export async function initObsidianVault(): Promise<boolean> {
  if (_vaultHandle) return true;
  try {
    const handle = await getHandle<FileSystemDirectoryHandle>('obsidian-vault-dir');
    if (handle && await verifyObsidianPermission(handle)) {
      _vaultHandle = handle;
      _isInitialized = true;
      return true;
    }
  } catch { /* no handle stored */ }
  return false;
}

export async function pickObsidianVault(): Promise<boolean> {
  const handle = await window.showDirectoryPicker({
    id: 'kollektiv-obsidian-vault',
    mode: 'readwrite',
  });
  const isValid = await verifyObsidianPermission(handle);
  if (!isValid) return false;
  _vaultHandle = handle;
  await setHandle('obsidian-vault-dir', handle);
  _isInitialized = true;
  return true;
}

export function isObsidianConnected(): boolean {
  return _isInitialized && _vaultHandle !== null;
}

// ── Validation ──────────────────────────────────────────────

async function verifyObsidianPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  // Check if it's a real Obsidian vault
  try {
    const dirs: string[] = [];
    for await (const entry of handle.values()) {
      if (entry.kind === 'directory') dirs.push(entry.name);
      if (dirs.length > 10) break; // don't iterate the whole vault
    }
    if (!dirs.includes('.obsidian')) {
      console.warn('[obsidian] Folder does not contain .obsidian/ — still allowing access');
      // We still allow it — user may have a non-standard vault setup
    }
  } catch { /* can't list — allow regardless */ }

  // Verify read/write permission via File System Access API
  try {
    if ((handle as any).queryPermission) {
      const result = await (handle as any).queryPermission({ mode: 'readwrite' });
      if (result === 'granted') return true;
    }
    if ((handle as any).requestPermission) {
      const result = await (handle as any).requestPermission({ mode: 'readwrite' });
      return result === 'granted';
    }
    return true; // can't check — assume granted
  } catch {
    return true; // non-Chromium — assume access
  }
}
```

### 3.3 Tool Inventory

All 12 tools, grouped by priority wave.

**Shared types:**

```typescript
export interface ObsidianNote {
  path: string;            // relative to vault root
  title: string;           // extracted from filename or # Title
  content: string;         // full markdown content
  tags: string[];          // from frontmatter
  frontmatter: Record<string, any>;  // parsed YAML frontmatter
  updatedAt: number | null;  // file lastModified if available
}
```

#### Wave 1 (MVP) — 5 tools

These cover the 90% use case: find notes, read them, write new ones, list what's available.

| # | Tool | Signature | Implementation |
|---|------|-----------|----------------|
| 1 | `obsidian_search_notes` | `(query: string, maxResults?: number)` → JSON array of `{path, title, snippet}` | Walk `.md` files under vault root, simple case-insensitive substring match. Return path + title + first 200 chars context. |
| 2 | `obsidian_get_note` | `(path: string)` → `ObsidianNote` JSON | Read file from vault. Parse frontmatter, extract tags. Raw markdown in `content`. |
| 3 | `obsidian_write_note` | `(path: string, content: string, overwrite?: boolean)` → `{path, created}` | Check if exists (unless overwrite=true). Write full content. |
| 4 | `obsidian_list_notes` | `(prefix?: string)` → JSON array of `{path, title}` | Walk vault directory tree, filter `.md` files (optionally under prefix). |
| 5 | `obsidian_list_tags` | `()` → JSON array of `{tag, count}` | Walk all `.md` files, collect frontmatter `tags` array, count occurrences. |

#### Wave 2 (Day-after-MVP) — 2 tools

| # | Tool | Signature | Implementation |
|---|------|-----------|----------------|
| 6 | `obsidian_append_to_note` | `(path: string, content: string, heading?: string)` → `{path, appended}` | Read note. If heading provided, find `## heading` and insert after. If not, append to end. Write back. |
| 7 | `obsidian_delete_note` | `(path: string)` → `{deleted: true}` | Delete file from vault. |

#### Wave 3 (Power tools) — 5 tools

| # | Tool | Signature | Implementation |
|---|------|-----------|----------------|
| 8 | `obsidian_patch_note` | `(path: string, heading?: string, beforeLine?: number, replaceLines?: [number, number])` | Surgical text replacement in a specific section of a note. |
| 9 | `obsidian_replace_in_note` | `(path: string, pattern: string, replacement: string, isRegex?: boolean)` | Find-and-replace across entire note. |
| 10 | `obsidian_manage_frontmatter` | `(path: string, key: string, value?: string)` → `{key, oldValue, newValue}` | Parse YAML frontmatter, set/delete key. If value is undefined/empty, delete key. |
| 11 | `obsidian_manage_tags` | `(path: string, operation: 'add' \| 'remove' \| 'list', tag?: string)` | Read frontmatter `tags` array. Add/remove/list. |
| 12 | `obsidian_open_in_ui` | `(path: string)` → `{opened: true}` | Read note content and display in a UI panel (like `open_web_page` but for notes). |

### 3.4 Task Breakdown (B1–B8)

---

#### Task B1: Create `utils/obsidianStorage.ts` — file I/O layer

**File:** `utils/obsidianStorage.ts` (new, ~200 lines)

**Functions to implement:**

```typescript
// ── State management ──
export async function initObsidianVault(): Promise<boolean>;
export async function pickObsidianVault(): Promise<boolean>;
export function isObsidianConnected(): boolean;
export function disconnectObsidianVault(): Promise<void>;

// ── File operations ──
export async function getNote(path: string): Promise<ObsidianNote | null>;
export async function writeNote(path: string, content: string): Promise<void>;
export async function appendToNote(path: string, content: string, heading?: string): Promise<void>;
export async function deleteNoteByPath(path: string): Promise<void>;
export async function replaceInNote(path: string, pattern: string, replacement: string, isRegex?: boolean): Promise<boolean>;

// ── Directory operations ──
export async function listNotes(prefix?: string): Promise<string[]>; // relative paths
export async function searchNotes(query: string, maxResults?: number): Promise<{path: string; title: string; snippet: string}[]>;

// ── Frontmatter operations ──
export async function getFrontmatter(path: string): Promise<Record<string, any>>;
export async function setFrontmatterKey(path: string, key: string, value: any): Promise<void>;
export async function deleteFrontmatterKey(path: string, key: string): Promise<void>;
export async function listTags(): Promise<{tag: string; count: number}[]>;
export async function manageTags(path: string, op: 'add'|'remove'|'list', tag?: string): Promise<string[]>;

// ── Utilities ──
export function extractTitle(path: string, content: string): string;
export function parseFrontmatter(content: string): { frontmatter: Record<string, any>; body: string };
export function serializeWithFrontmatter(body: string, frontmatter: Record<string, any>): string;
export function extractWikilinks(content: string): string[]; // extracts [[Note Name]] targets
export function openNoteInPanel(path: string, content: string): void; // emits appEventBus event
```

**Key implementation details:**

**`parseFrontmatter(content)`** — simple parser (no `js-yaml` dependency needed for MVP):

```typescript
function parseFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { frontmatter: {}, body: content };
  
  const frontmatter: Record<string, any> = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const kv = line.match(/^(\w+):\s*(.*)/);
    if (kv) {
      const value = kv[2].trim();
      // Handle arrays like tags: [foo, bar]
      if (value.startsWith('[') && value.endsWith(']')) {
        frontmatter[kv[1]] = value.slice(1, -1).split(',').map(s => s.trim().replace(/['"]/g, ''));
      } else {
        frontmatter[kv[1]] = value.replace(/^['"]|['"]$/g, '');
      }
    }
  }
  return { frontmatter, body: content.slice(match[0].length) };
}
```

**`searchNotes(query)`** — simple case-insensitive substring search across all `.md` files:

```typescript
export async function searchNotes(query: string, maxResults = 20) {
  const results: {path: string; title: string; snippet: string}[] = [];
  const q = query.toLowerCase();
  for await (const notePath of walkMdFiles()) {
    const content = await readNoteContent(notePath);
    if (!content) continue;
    const lower = content.toLowerCase();
    const idx = lower.indexOf(q);
    if (idx === -1) continue;
    const snippet = content.slice(Math.max(0, idx - 100), idx + q.length + 100);
    const title = extractTitle(notePath, content);
    results.push({ path: notePath, title, snippet });
    if (results.length >= maxResults) break;
  }
  return results;
}
```

**`walkMdFiles()`** — recursive async generator that yields relative paths of all `.md` files:

```typescript
async function* walkMdFiles(dir?: FileSystemDirectoryHandle, prefix = ''): AsyncGenerator<string> {
  const handle = dir || _vaultHandle;
  if (!handle) return;
  for await (const entry of handle.values()) {
    if (entry.kind === 'file' && entry.name.endsWith('.md')) {
      yield prefix + entry.name;
    } else if (entry.kind === 'directory' && !entry.name.startsWith('.')) {
      // Skip .obsidian, .git, etc.
      const subHandle = await handle.getDirectoryHandle(entry.name);
      yield* walkMdFiles(subHandle, prefix + entry.name + '/');
    }
  }
}
```

**Acceptance criteria:**
- All functions handle missing vault handle gracefully (return null/[]/throw helpful error)
- Frontmatter parsing handles: empty, no frontmatter, tags array, single values
- `searchNotes` returns up to `maxResults` results, sorted by relevance (position in file)
- `walkMdFiles` skips hidden directories (`.` prefix)
- File operations use `fileSystemManager.readFile` / `fileSystemManager.saveFile` — wait, no. The Obsidian vault has its OWN directory handle, not the app vault handle. So we need direct File System Access API calls, not `fileSystemManager`.

Actually, let me reconsider. `fileSystemManager.saveFile(filePath, blob)` writes to the KOLKTIV vault root. For the Obsidian vault, we need to write to the OBSIDIAN vault root. These are different handles.

So `obsidianStorage.ts` needs its own file I/O, not `fileSystemManager`. Let me adjust:

```typescript
// Direct File System Access API — NOT through fileSystemManager
async function readFile(relativePath: string): Promise<string | null> {
  if (!_vaultHandle) return null;
  try {
    const parts = relativePath.split('/');
    let handle = _vaultHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      handle = await handle.getDirectoryHandle(parts[i]);
    }
    const fileHandle = await handle.getFileHandle(parts[parts.length - 1]);
    const file = await fileHandle.getFile();
    return await file.text();
  } catch {
    return null;
  }
}

async function writeFile(relativePath: string, content: string): Promise<void> {
  if (!_vaultHandle) return;
  const parts = relativePath.split('/');
  let handle = _vaultHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    handle = await handle.getDirectoryHandle(parts[i], { create: true });
  }
  const fileHandle = await handle.getFileHandle(parts[parts.length - 1], { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}
```

**Test:** `obsidianStorage.test.ts` — use a mock FileSystemDirectoryHandle for unit tests.

**Dependencies:** None (pure file I/O utility)

---

#### Task B2: Obsidian vault connection flow

**File:** `components/settings/IntegrationsSection.tsx` (modify)

**Change:** Add an "Obsidian Vault" section to the Integrations settings.

```tsx
// In IntegrationsSection.tsx — add after Spotify section:

{/* ── Obsidian Vault ── */}
<div className="...">
  <h3 className="...">Obsidian Second Brain</h3>
  <p className="...">
    Connect your Obsidian vault to let the assistant search, read, and write notes.
  </p>
  
  {isObsidianConnected() ? (
    <div className="...">
      <p>✅ Connected to vault: <strong>{vaultName}</strong></p>
      <button onClick={handleDisconnect}>Disconnect</button>
    </div>
  ) : (
    <div>
      <p>
        Your vault is a folder containing <code>.obsidian/</code> and your
        markdown notes. Pick it below, or use your Kollektiv vault folder
        if it's already an Obsidian vault.
      </p>
      <button onClick={handlePickVault}>
        Pick Obsidian Vault Folder
      </button>
      {/* Auto-detect if Kollektiv vault has .obsidian/ */}
      {kollektivVaultIsObsidian && (
        <button onClick={handleUseAppVault}>
          Use Current Vault (detected .obsidian/)
        </button>
      )}
    </div>
  )}
</div>
```

**Auto-detection logic** (in `App.tsx` boot or a hook):

After `fileSystemManager.initialize()` succeeds, check if the Kollektiv vault contains `.obsidian/`:

```typescript
async function detectObsidianVault() {
  if (!fileSystemManager.isDirectorySelected()) return;
  try {
    const hasObsidian = await fileSystemManager.fileExists('.obsidian');
    if (hasObsidian) {
      // Re-use the vault handle as both Kollektiv vault and Obsidian vault
      // This means obsidianStorage.ts uses fileSystemManager internally,
      // OR we set _vaultHandle = the same handle
      setKollektivVaultIsObsidian(true);
    }
  } catch { /* ignore */ }
}
```

Wait, but if the Kollektiv vault IS the Obsidian vault (detected via `.obsidian/`), then we should re-use the same handle. This means `obsidianStorage.ts` can either:
1. Use its own handle (always separate)
2. Optionally share the handle from `fileSystemManager` if the same folder

I'll design it so:
- `pickObsidianVault()` always uses its own handle (separate folder picker)
- `useAppVaultAsObsidian()` sets `_vaultHandle` to the same handle as `fileSystemManager` (no new picker needed)

**Acceptance criteria:**
- User can pick an Obsidian vault folder via browser folder picker
- User can use their existing Kollektiv vault if it contains `.obsidian/`
- Connection state persists across page reloads
- Disconnect clears the handle

**Test:** Manual.

**Dependencies:** B1

---

#### Task B3: Create `utils/obsidianStorage.test.ts`

**File:** `utils/obsidianStorage.test.ts` (new)

**Tests:**
1. `parseFrontmatter` — empty, no frontmatter, simple keys, tags array, quoted values
2. `serializeWithFrontmatter` — round-trip with parseFrontmatter
3. `extractTitle` — from `# Title`, from filename, fallback
4. `walkMdFiles` — mock directory handle, verify hidden dirs skipped
5. `searchNotes` — mock directory with known content, verify matching
6. `listTags` — multiple notes with same/different tags, verify counts

**Acceptance criteria:** All tests pass with `vitest run`.

**Dependencies:** B1

---

#### Task B4: Register Wave 1 assistant tools (obsidian_search_notes, obsidian_get_note, obsidian_write_note, obsidian_list_notes, obsidian_list_tags)

**File:** `services/assistantTools.ts`

**Pattern for each tool registration** (add to `ASSISTANT_TOOLS` array):

```typescript
{
  name: 'obsidian_search_notes',
  description: 'Search all markdown notes in your Obsidian vault by query text. Returns a JSON list of matching notes with paths and titles. Use when the user asks you to find a note, search for something, or look something up in their notes.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query text.' },
      maxResults: { type: 'number', description: 'Maximum results (default 20).' },
    },
    required: ['query'],
  },
  execute: async ({ query, maxResults }) => {
    if (!isObsidianConnected()) {
      return 'Error: Obsidian vault is not connected. Ask the user to connect it in Settings > Integrations > Obsidian Second Brain.';
    }
    const results = await searchNotes(String(query), maxResults ? Number(maxResults) : 20);
    if (results.length === 0) return 'No matching notes found.';
    return JSON.stringify(results);
  },
},
```

All 5 tools follow this pattern: check `isObsidianConnected()`, delegate to `obsidianStorage.ts`, return JSON or error string.

**Acceptance criteria:**
- Tools appear in the assistant's tool list (verify via Settings > Tools tab)
- Tools return helpful error when vault not connected
- Tools return correct data when vault is connected
- Descriptions match the pattern the LLM expects

**Test:** `assistantTools.test.ts` — mock obsidianStorage functions, verify tool outputs.

**Dependencies:** B1 (obsidianStorage functions), A* tasks don't block this

---

#### Task B5: Register Wave 2–3 tools (obsidian_append_to_note, obsidian_delete_note, obsidian_patch_note, obsidian_replace_in_note, obsidian_manage_frontmatter, obsidian_manage_tags, obsidian_open_in_ui)

**File:** `services/assistantTools.ts`

Same pattern as B4. Add remaining 7 tools to `ASSISTANT_TOOLS` array.

**`obsidian_open_in_ui`** is unique — it doesn't return data but emits an event to open a dedicated viewer overlay (NOT mixed into the Notes panel):

```typescript
{
  name: 'obsidian_open_in_ui',
  description: 'Display a note from your Obsidian vault in the in-app viewer panel. Use when the user asks to see, open, or view a note.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path to the note within the vault.' },
    },
    required: ['path'],
  },
  execute: async ({ path }) => {
    const note = await getNote(String(path));
    if (!note) return `Error: Note "${path}" not found.`;
    appEventBus.emit('openObsidianNote', note);
    return `Opened "${note.title}" in the viewer panel.`;
  },
},
```

**Acceptance criteria:** Same as B4 — 7 mo7 more tools verified.

**Dependencies:** B1, B4

---

#### Task B6: Update WORKSPACE_CAPABILITIES

**File:** `services/assistantService.ts`

**Change:** Replace the phantom Obsidian tool block with real tool descriptions:

```
Current (line 30):
- Obsidian Second Brain (requires OBSIDIAN_API_KEY set...)...

New:
- Obsidian Second Brain (connect vault in Settings > Integrations):
  search vault = obsidian_search_notes, read a note = obsidian_get_note,
  create/overwrite note = obsidian_write_note, list folder = obsidian_list_notes,
  list all tags = obsidian_list_tags, append to note = obsidian_append_to_note,
  surgical edit = obsidian_patch_note, find-and-replace = obsidian_replace_in_note,
  manage frontmatter = obsidian_manage_frontmatter, add/remove/list tags = obsidian_manage_tags,
  delete note = obsidian_delete_note, open in viewer = obsidian_open_in_ui
```

**Acceptance criteria:** The LLM sees accurate tool descriptions that match actual registered tool names.

**Dependencies:** B4, B5

---

#### Task B7: Wire Obsidian event to UI panel

**File:** `components/App.tsx`

**Change:** Subscribe to `openObsidianNote` event and open the ClippingPanel (or a dedicated viewer) with the note content.

```typescript
// In App.tsx's useEffect where other appEventBus subscriptions are set up:
return appEventBus.on('openObsidianNote', (note: ObsidianNote) => {
  // Add a note to the notes panel with the Obsidian note content
  addNote(note.title, note.content, 'assistant');
  // Open the Notes panel
  appEventBus.emit('togglePanel', 'notes');
});
```

Alternatively, create a lightweight note viewer that reuses existing patterns.

**Acceptance criteria:** When assistant calls `obsidian_open_in_ui`, the note content appears in the app.

**Dependencies:** B5

---

#### Task B8: Graceful error handling when vault is disconnected

**File:** `utils/obsidianStorage.ts` + `services/assistantTools.ts`

**Change:** Every `obsidian_*` tool checks connection state and returns a human-readable error. Every `obsidianStorage.ts` function checks `_vaultHandle` before operating.

Error messages in tools:
- Not connected: "Obsidian vault not connected. Go to Settings > Integrations > Obsidian Second Brain to connect your vault folder."
- File not found: "Note not found at path '{path}'. Use obsidian_list_notes or obsidian_search_notes to find the correct path."
- Permission lost: "Lost access to vault folder. The user may need to re-select it in Settings > Integrations."

**Acceptance criteria:** All error paths return helpful messages, not raw JS errors.

**Dependencies:** B4, B5

---

## 4. Dependency Graph

```
A1 (db.ts schema)
 ├── A2 (storageInit.ts boot hook)
 ├── A3 (memoryStorage → IDB)
 ├── A4 (notesStorage → IDB)
 └── A5 (chatStorage → IDB, split)
      │
 A2 ──┤
      ├── A6 (UI consumers: sync cache reads) ← needs A3, A4, A5
      └── A7 (service consumers: async reads) ← needs A3, A4, A5
      
B1 (obsidianStorage.ts)
 ├── B2 (Settings UI: vault connection)
 ├── B3 (obsidianStorage.test.ts)
 │
 B1 ──├── B4 (Wave 1 tools: search/read/write/list)
      ├── B5 (Wave 2-3 tools: append/delete/patch/etc.)
      ├── B6 (WORKSPACE_CAPABILITIES update) ← needs B4, B5
      ├── B7 (UI panel wiring) ← needs B5
      └── B8 (graceful error handling) ← needs B4, B5
```

**Parallel work possible:**
- A3 (memories) and A4 (notes) can be built in parallel (same pattern, different data)
- B1 (obsidianStorage.ts) is independent of all IDB work
- B2 (Settings UI) can start after B1 prototype

**Recommended execution order:**

```
Week 1: A1 → A3 + A4 (parallel) → A5 → A2 (wrap init)
     +   B1 → B3 (test)
Week 2: A6 + A7 (consumers) → test/fix
     +   B2 → B4 → B6 → B8  (Wave 1 MVP)
Week 3: B5 → B7 → finish
```

---

## 5. Test Strategy

### Unit tests (Vitest)

| Test file | Scope | Mock strategy |
|-----------|-------|---------------|
| `utils/db.test.ts` | Schema v2 upgrade, store existence, index creation | Use `idb` with `fakeIndexedDB` or `unstable_mock` |
| `utils/memoryStorage.test.ts` | CRUD, cache sync, dual-write, migration from localStorage | Mock `db.getAll` / `db.add` / `db.delete` |
| `utils/notesStorage.test.ts` | Same pattern as memoryStorage | Same |
| `utils/chatStorage.test.ts` | Session/message split, cascade delete, migration | Same + test round-trip |
| `utils/obsidianStorage.test.ts` | Frontmatter parsing, search, tag collection, file walking | Mock FileSystemDirectoryHandle |
| `services/assistantTools.test.ts` | Obsidian tool outputs with mock storage | Mock `obsidianStorage.ts` functions |

### Integration tests (manual)

1. **IDB migration:** Open app in Chrome, verify notes/memories/chat sessions appear. Clear localStorage, reload — data should survive from IDB. Run `localStorage.removeItem('assistantNotes')` — data still loads from IDB.
2. **Dual-write:** Add a note, check both IDB (`IndexedDB` tab in DevTools) and localStorage for the data.
3. **Obsidian connection:** Pick an Obsidian vault folder. Search notes via assistant. Write a note. Verify the `.md` file appears on disk.
4. **Graceful degradation:** Clear site data. Open app. Try obsidian tools — should show "not connected" error, not crash.

### Edge cases to test explicitly

| Edge case | Workstream | Expected behavior |
|-----------|-----------|-------------------|
| IndexedDB unavailable (private browsing) | A | Stores initialize empty, dual-write to localStorage still works |
| localStorage full | A | IDB write succeeds, localStorage dual-write silently fails — no crash |
| Migration runs twice (race condition) | A | `_initialized` flag prevents double-migration |
| Very large vault (10k+ notes) | B | `searchNotes` respects `maxResults`, `listTags` paginates in background |
| Vault folder deleted between tool calls | B | `getNote` returns null — "Vault folder no longer accessible" error |
| Note edited in Obsidian while assistant reads | B | `getNote` reads latest from disk (File System Access API returns current content) |
| `[[wikilinks]]` to non-existent note | B | Left as raw text — LLM sees the broken link |
| `.obsidian/` missing from picked folder | B | Tool still works — we warn but don't block (user may have a non-standard vault) |
| Multiple tabs open, data race | A | IndexedDB handles concurrent access per-browser. Sync cache may be stale across tabs — acceptable for MVP. |

---

## 6. Edge Cases & Safety Nets

### IndexedDB

1. **Safari 7-day eviction:** Safari deletes IndexedDB data if the site is not visited for 7 days. Mitigation: dual-write to localStorage means data survives at least the localStorage lifetime. In a future release, we can add a Service Worker keepalive.

2. **Private browsing:** Some browsers disable IndexedDB in private mode. All three stores handle this by catching the error and falling back to empty state + localStorage dual-write.

3. **Quota exceeded:** IndexedDB can throw `QuotaExceededError`. All write operations wrap in try/catch and fall back to localStorage-only.

4. **Version mismatch:** If an old version of the app opens a v2 database, the `upgrade` callback won't fire (oldVersion = 2). But if old code expects v1 stores only and ignores v2 stores, this is safe — the v1 `keyval` store still exists. If old code tries to `getAll` from a store it doesn't know about, it gets empty array. No crash.

### Obsidian

1. **Permission revoked mid-session:** The user can revoke File System Access permission at any time via the browser's site settings. `obsidianStorage.ts` wraps all reads in try/catch and re-verifies permission on each call. If permission is lost, tools return a clear error message.

2. **File path traversal:** `obsidian_write_note(path, content)` validates that `path` doesn't contain `..` segments. This prevents writing outside the vault folder.

3. **Encoding:** All files are read/written as UTF-8. Non-UTF-8 files (binary images in vault) return null from `getNote` with a console warning.

4. **Concurrent edits:** If the user edits a note in Obsidian while the assistant is reading it, the File System Access API returns the latest content. If writing, there's a brief window for conflicts — but since Obsidian and Kollektiv are separate processes, this is expected and the last write wins (same as using any two editors on the same file).

---

## 7. Rollout & Verification

### Verification checklist

Before marking each workstream complete:

**Workstream A (IDB):**
- [ ] `pnpm lint` passes (`tsc --noEmit`)
- [ ] `pnpm test` passes (all unit tests, including updated storage tests)
- [ ] App boots without errors in Chrome
- [ ] Existing notes appear in ClippingPanel
- [ ] Existing memories appear (ask assistant to list them)
- [ ] Existing chat sessions appear in LLMChatPanel
- [ ] Adding a note/memory persists after page refresh (verify in IDB DevTools tab)
- [ ] localStorage still has the data (dual-write)
- [ ] Clearing localStorage then refreshing: data still loads from IDB
- [ ] Safari private browsing: app works, data is ephemeral

**Workstream B (Obsidian):**
- [ ] Settings > Integrations shows "Obsidian Second Brain" section
- [ ] Can pick an Obsidian vault folder
- [ ] Can disconnect vault folder
- [ ] Assistant calls `obsidian_search_notes` and returns results
- [ ] Assistant calls `obsidian_get_note` and returns note content
- [ ] Assistant calls `obsidian_write_note` and file appears on disk
- [ ] Assistant calls `obsidian_list_notes` and returns file listing
- [ ] Assistant calls `obsidian_list_tags` and returns tag cloud
- [ ] Disconnecting vault: tools return "not connected" error
- [ ] WORKSPACE_CAPABILITIES in system prompt references correct tool names

### Commit order

```
1.  feat(db): upgrade IndexedDB schema to v2 with notes/memories/chat stores
2.  feat(memory): migrate memoryStorage to IndexedDB with sync cache
3.  feat(notes): migrate notesStorage to IndexedDB with sync cache
4.  feat(chat): migrate chatStorage to IndexedDB (split sessions + messages)
5.  feat(boot): add IndexedDB store initialization to boot sequence
6.  feat(ui): update components to use sync-cache reads (IDB migration)
7.  feat(obsidian): create obsidianStorage.ts with file I/O layer
8.  feat(obsidian): add vault connection UI in Integrations settings
9.  feat(obsidian): register Wave 1 assistant tools (search/read/write/list)
10. feat(obsidian): register Wave 2-3 assistant tools (all remaining)
11. feat(obsidian): update WORKSPACE_CAPABILITIES with real tool names
12. feat(obsidian): wire obsidian_open_in_ui to in-app viewer
13. chore: remove phantom obsidian references from old WORKSPACE_CAPABILITIES block
14. test: add obsidianStorage and updated storage tests
```
