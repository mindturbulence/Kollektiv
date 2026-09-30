# Asset Manager — Context Menu, Drag & Drop, Header Toolbar Relocation

Status: **Plan — not started (2026-09-29).** Jev decisions recorded in §2.

Scope: three features for `components/AssetsManagerPage.tsx`:
1. Right-click context menus (grid cards, folder tree, empty area, roots panel).
2. Drag & drop enhancements (grid reorder, tree folder reorder, richer visual feedback).
3. Relocate the floating `SelectionToolbar` into the grid header next to DUPLICATES.

Inputs: code research on `AssetsManagerPage.tsx` (1462 lines), `AssetInspector.tsx`,
`AssetDialogs.tsx`, `TreeView.tsx`, `Header.tsx`, `icons.tsx`, `e2e/assets-manager.spec.ts`;
5 Jev decision calls (§2).

## 1. What exists today (verified in code)

- **Page shell** (`AssetsManagerPage.tsx`): left `<motion.aside>` (roots + `FolderTreeNode`
  tree), center `<motion.section>` (header, `FilterBar`, CSS-columns grid of `AssetCard`),
  optional right `<AssetInspector>` when a selection exists. Dialog state via
  `dialog: 'rename' | 'copymove' | 'duplicates' | 'vault'`.
- **`SelectionToolbar`** (lines 1395–1460): portaled to `document.body`,
  `fixed bottom-6 left-1/2 -translate-x-1/2`, shows when `selectedIds.size > 0`. Buttons:
  Export, Convert, Edit, Video Editor, Resize, Analyze, To Vault, Deselect.
- **Grid header** (lines 866–880): `UNDO` (when journal has an entry), `DUPLICATES`,
  `N IMAGES` count. This is the target for the relocated toolbar.
- **Drag & drop already present**:
  - `handleCardDragStart` (line 595): captures `draggedFileIdsRef`, sets `effectAllowed='move'`.
  - `handleFolderDrop` (line 602): drops card(s) onto a tree node → `runTransfer(..., 'move', 'keep-both')`.
  - `handleRootsDrop` (line 616): drops an OS folder onto the roots panel → `addRootFromHandle`.
  - `dragOverPath` state highlights the hovered tree node.
- **No context menu anywhere** in the codebase (grep for `context.*menu|ContextMenu` → 0 hits).
  No context-menu, Radix or floating-ui dependency in `package.json`.
- **File ops available**: `transferFiles`, `moveOne`, `resolveDir`, `resolveFile`
  (`services/assets/fileOps.ts`); `recordOp`/`undoOp` (`undoJournal.ts`); `relocate`,
  `copyMeta`, `updateMeta` (`assetLibrary.ts`). **No** folder create/delete/rename, no delete-file,
  no clipboard.
- **`FolderTreeNode`** (line 1091): recursive, expand/collapse, drag-over highlight, drop target.
  Not draggable itself (no folder→folder move).
- **`AssetCard`** (line 1151): `<button draggable>`, click/Ctrl-click/Shift-click selection,
  `onDragStart` only — no `onDragOver`/`onDrop`, so grid reorder is not possible today.
- **Keyboard**: rate (0–5), label (6–9), Ctrl+A, Escape. No clipboard shortcuts, no Shift+F10.
- **E2E** (`e2e/assets-manager.spec.ts`): 4 tests covering index/rating/tags/filters/duplicates/
  stacks/collections, batch rename + undo + move, vault save, gallery conversion. Any new menu
  or toolbar must not break these (they locate toolbar buttons via
  `[role="toolbar"][aria-label="Selection actions"]` — line 242 and 264).

## 2. Jev decisions (2026-09-29)

| # | Question | Jev pick | Prob | Conf | Note |
|---|---|---|---|---|---|
| 1 | Delete: soft (`.kollektiv-trash` + 30-day cleanup) vs hard delete w/ confirm | **Soft-delete** | 0.99 | 0.98 | |
| 2 | Grid reorder: library-index `sortOrder` vs filesystem rename prefixes | **Index sortOrder** | 0.97 | 0.93 | |
| 3 | Clipboard: `sessionStorage` only vs also `localStorage` | **Session-only** | 0.96 | 0.91 | |
| 4 | Tree folder move: background + progress vs modal-blocking | **Background** | 0.99 | 0.98 | |
| 5 | Mobile toolbar: dropdown ☰ vs horizontal scroll | **Dropdown** | 0.83 | 0.66 | weakest — still >0.6, Jev decided |

All five above Jev's 0.6 threshold → **Jev decided, all five**. Total cost $0.00009, ~2.2 s.

## 3. Feature 1 — Context menu

### 3.1 New files

| File | Purpose |
|---|---|
| `components/ContextMenu.tsx` | Portal-based menu. Props: `items: MenuItem[]`, `x`, `y`, `onClose`. Keyboard: arrows, Enter, Escape, Home/End, type-ahead. Click-outside closes. Renders via `createPortal(..., document.body)`, `z-[9999]`. Re-anchors to stay in viewport (flip when near edge). Long-press (500 ms) on touch opens it. Shift+F10 / `contextmenu` key opens at focused element. |
| `services/assets/clipboard.ts` | Cut/copy/paste clipboard. Holds `{ fileIds, rootIds, mode: 'copy' \| 'cut', folderPath }`. Persisted to `sessionStorage` (Jev §2.3). API: `copy(ids)`, `cut(ids)`, `paste(dest)`, `hasContent()`, `clear()`. Cut clears on successful paste; copy does not. |
| `services/assets/folderOps.ts` | `createFolder(rootHandle, parentPath, name)`, `renameFolder(rootHandle, path, newName)`, `deleteFolder(rootHandle, path)` — all OPFS `getDirectoryHandle` operations. |
| `services/assets/trash.ts` | Soft-delete: `moveToTrash(rootHandle, entries)` → `moveOne` into `.kollektiv-trash/<timestamp>/`; `restoreFromTrash(...)`, `purgeTrash(rootHandle, olderThanDays=30)` (runs opportunistically on root load). Trash folder excluded from tree scan and `LISTED_EXT_SET` listing. |

`MenuItem` shape:

```ts
type MenuItem =
  | { kind: 'action'; label: string; icon?: ReactNode; shortcut?: string;
      disabled?: boolean; danger?: boolean; onSelect: () => void }
  | { kind: 'separator' }
  | { kind: 'submenu'; label: string; icon?: ReactNode; children: MenuItem[] };
```

### 3.2 Menu contents

**Asset card (single/multi select)** — the superset of existing toolbar + inspector actions:

| Group | Items | Handler |
|---|---|---|
| 1 | Open, Select All, Clear Selection | `setLightboxIndex` / existing |
| — | separator | |
| 2 | Rename… (Ctrl+R), Copy (Ctrl+C), Cut (Ctrl+X), Paste (Ctrl+V) | `setDialog('rename')` / clipboard |
| — | separator | |
| 3 | Copy to…, Move to…, New Folder… | `setDialog('copymove')` / `folderOps` |
| — | separator | |
| 4 | Export…, Convert…, Edit in Image Editor, Open in Video Editor, Resize…, Analyze… | existing `handle*` |
| — | separator | |
| 5 | Save to Vault…, Write Metadata to File | `setDialog('vault')` / `handleWriteMetadata` |
| — | separator | |
| 6 | **Move to Trash** (danger, confirmed) | `trash.moveToTrash` |
| — | separator | |
| 7 | Properties | focus `AssetInspector` |

Single-selection extras: Edit in Image Editor, Analyze (both already single-only).
Multi: all apply to `selectedIds`; Rename shows batch modal.

**Folder tree node:**

| Group | Items |
|---|---|
| 1 | Open, New Folder…, Paste, Paste as Copy |
| — | separator |
| 2 | Rename Folder…, Move to…, Copy Path |
| — | separator |
| 3 | Delete Folder (confirmed, `folderOps.deleteFolder`) |

**Empty grid background:**

New Folder…, Paste, Paste as Copy, Select All, Clear Selection, separator, Sort By ▸
(delegates to `setSortKey`/`setDescending`), Refresh.

**Roots panel root row:**

Reconnect, Copy Path, Remove Root (existing actions, now discoverable via menu).

### 3.3 State & wiring (modify `AssetsManagerPage.tsx`)

```ts
const [ctxMenu, setCtxMenu] = useState<{
  x: number; y: number; items: MenuItem[];
} | null>(null);
```

- `onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, items: buildCardMenu(file) }); }}`
  on `AssetCard` (right-clicking an unselected card selects it first; right-clicking a
  selected card keeps the multi-selection).
- Same on `FolderTreeNode` root div and on the roots-panel `RootRow`.
- Grid background: `onContextMenu` on the scroll container (`.flex-grow.overflow-y-auto`).
- Global keydown: `Shift+F10` or `ContextMenu` key → open menu at focused element's rect.
- Clipboard shortcuts in the existing `onKey` effect: Ctrl+C / Ctrl+X / Ctrl+V / Ctrl+Shift+V
  (paste as copy).
- `e2e` note: tests use `page.getByRole(...)` and `getByText` — `e.preventDefault()` on
  `contextmenu` does not affect them, but add a test for the new menu.

## 4. Feature 2 — Drag & drop enhancements

### 4.1 Grid reorder (cards → cards) — Jev §2.2: library-index sortOrder only

- Add `onDragOver` / `onDragLeave` / `onDrop` to `AssetCard`:
  - `onDragOver`: `e.preventDefault(); e.dataTransfer.dropEffect='move'`; compute
    insert-before/after from `e.clientY` vs card midpoint; set a `dropIndicator` state
    (`{ id, position: 'before' | 'after' }`).
  - `onDrop`: reorder `shownEntries` → write new order to library.
- Persisted via a new `sortOrder?: number` field on `AssetMeta` written through
  `updateMeta(ids, ...)`; new `SortKey: 'manual'` in `assetFilter.sortEntries` sorts by
  `sortOrder` then name. **Filesystem untouched.**
- Show a 2 px indicator line (primary colour) at the insert point.
- Reorder only active when `sortKey === 'manual'` (or auto-switch to it on first drop —
  Claude's call: auto-switch, with the UNDO-style feedback toast "Switched to manual order").

### 4.2 Tree folder reorder (folder → folder)

- `FolderTreeNode`: add `draggable` + `onDragStart` (payload = source `path` via ref, same
  out-of-band pattern as `draggedFileIdsRef`).
- Drop target validation: not self, not a descendant of source (walk `children`), not a
  parent of source. Invalid → `dropEffect='none'`.
- On drop → `services/assets/folderMove.ts`: **background operation** (Jev §2.4):
  - `recordOp({ kind: 'transfer', ... })` journal entries per file (reuses existing undo).
  - Progress: reuse the existing `listProgress`/`ScanProgress` pattern → a progress toast
    ("Moving 47/120 files…") in the top-level feedback slot; app stays interactive.
  - Cancellable via a `cancelRef` checked in the loop; partial completion journals what moved.
  - After success: rescan tree (`scanDirectoryTree`), refresh current listing.

### 4.3 Visual polish

- **Drag preview**: custom `dragstart` image — small canvas with thumbnail + ×N badge
  (set via `e.dataTransfer.setDragImage`). Fallback to default when thumbnail unavailable.
- **Drop-target highlighting**: existing `dragOverPath` ring kept for tree; add equivalent
  `hoverCardId` ring for grid; roots panel keeps its `isDraggingRootDrop` border.
- **Invalid targets**: `dataTransfer.dropEffect='none'` + `cursor: not-allowed` class.
- **Touch**: long-press (500 ms) on a card starts a drag; before that, scroll wins.
  (`draggable` attribute set only after the long-press timer fires.)

## 5. Feature 3 — Relocate SelectionToolbar to the header

### 5.1 Target layout

Inside the existing `<motion.header>` (line 866), right group (line 868):

```
[UNDO] [DUPLICATES] │ [N SELECTED] [Export] [Convert] [Edit] [...] [Deselect] │ N IMAGES
```

- Toolbar buttons render **only when `selectedIds.size > 0`** (same condition as today).
- Extract the button set from `SelectionToolbar` into `SelectionToolbarInline`
  (same file or `components/assets/SelectionToolbarInline.tsx`).
- **Desktop (≥ xl)**: inline horizontal row of icon buttons (`form-btn h-7`), matching the
  existing `UNDO`/`DUPLICATES` button style.
- **Mobile (< xl)** (Jev §2.5): collapse to a single ☰ / ellipsis button that opens the
  same items as a dropdown (reuse `ContextMenu` component — one implementation, two uses).
- **Responsive rule**: inline on ≥1024 px (when header has room), dropdown below.
  Header may grow from `h-12` to `h-12 min-h-12` with `flex-wrap` fallback — do **not**
  increase fixed header height (breaks `.app-header` e2e visibility check line 56).

### 5.2 E2E compatibility (critical)

Existing tests locate toolbar buttons by:
```ts
page.getByRole('toolbar', { name: 'Selection actions' }).getByRole('button', { name: 'To Vault' })
```
(lines 242, 264). The relocated toolbar **must keep** `role="toolbar"` and
`aria-label="Selection actions"` so those two tests pass unchanged. The dropdown container
on mobile also carries that role/label.

### 5.3 Removal

- Delete the `SelectionToolbar` portal component (lines 1395–1460) after `SelectionToolbarInline`
  is wired and e2e passes.
- The `AnimatePresence` wrapper (lines 986–1001) wraps the inline version instead.
- Keep the `motion.div` entrance animation (slide up 20 px + fade, same as today).

## 6. Implementation phases

| Phase | Scope | Files | Est. |
|---|---|---|---|
| **1 — Context menu core** | `ContextMenu.tsx`, clipboard service, card right-click menu, keyboard (Shift+F10, Ctrl+C/X/V), e2e for menu | 3 new, 1 modified | 2 d |
| **2 — Folder ops + trash** | `folderOps.ts`, `trash.ts`, tree + background context menus (new folder, rename, delete, paste), purge-on-load | 2 new, 1 modified | 2–3 d |
| **3 — Grid reorder + DnD polish** | `sortOrder` in meta, `SortKey: 'manual'`, card `onDragOver`/`onDrop`, indicator, custom drag preview, touch long-press | 3 modified | 2–3 d |
| **4 — Tree folder move** | `folderMove.ts` background op with progress toast + cancel, tree draggable, descendant-guard | 1 new, 2 modified | 2 d |
| **5 — Toolbar relocation** | `SelectionToolbarInline`, header integration, responsive dropdown, remove portal, e2e green | 2 new/modified | 1–2 d |
| **6 — Testing & polish** | e2e additions (menu, reorder, trash, toolbar), lint, a11y pass | — | 1–2 d |

**Total ≈ 10–14 days solo.** Phase 1 alone is shippable; phases are independently mergeable.

## 7. Testing

- **Vitest** (jsdom): clipboard round-trip incl. sessionStorage persistence; `folderOps`
  name-validation; trash move/restore/purge age logic; `sortOrder` in `sortEntries`;
  context-menu keyboard navigation (arrow/Escape/type-ahead); descendant-guard for folder drag.
- **Playwright** (extend `e2e/assets-manager.spec.ts`):
  - Right-click a card → menu appears → Copy → select another folder → Paste → file present.
  - Right-click tree → New Folder → folder visible; Delete Folder → confirmed gone.
  - Drag card onto another card → order changed and survives reload (sortOrder in library).
  - Drag folder into sibling → files moved, progress toast shown, tree rescanned.
  - Select assets → toolbar buttons appear **in the header** (not floating bottom);
    existing `role="toolbar" aria-label="Selection actions"` queries still resolve;
    the two existing To Vault tests pass untouched.
  - Trash: delete file → appears under `.kollektiv-trash` → restore → back in place.
- **Lint**: `pnpm lint` (tsc) + `pnpm lint:eslint` before each phase commit.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Existing e2e toolbar queries break after relocation | Keep `role="toolbar"` + `aria-label="Selection actions"` on the inline wrapper (§5.2); run the suite before removing the portal |
| Folder move = N individual file moves, slow / partial failure | Background op + journal per file (existing undo machinery); cancellable; rescan after |
| CSS-columns grid makes drop-index maths fiddly | Indicator computed from per-card `getBoundingClientRect` midpoint, not column indices |
| Trash folder pollutes tree/listing | Exclude `.kollektiv-trash` in `scanDirectoryTree` and `listFolderFiles` filters |
| Context menu z-index vs lightbox (`z-modal`) / portaled overlays | Portal to body with `z-[9999]`; close menu on lightbox/dialog open |
| Long-press drag vs scroll conflict on touch | 500 ms threshold; cancel drag-start if `touchmove` fires first |
| `sortOrder` conflicts when files move between folders | `relocate()` already carries meta; initialise `sortOrder` on paste (`copyMeta` target order = append) |
| Header overflow on narrow screens | ≥xl inline, <xl dropdown; verify at 1024/768/375 widths |

## 9. Out of scope (v2 / backlog)

- Cross-root multi-select drag (clipboard covers this).
- Keyboard-driven folder navigation in the tree (accessibility follow-up).
- Undo for trash-purge (purge is age-based, not user-triggered).
- Rewriting grid from CSS-columns to a virtualised list (only if 10k+ reorder becomes laggy).
