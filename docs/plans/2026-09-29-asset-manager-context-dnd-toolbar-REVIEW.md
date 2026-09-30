# Review: Asset Manager — Context Menu, DnD, Toolbar Relocation

> Reviewing: [`2026-09-29-asset-manager-context-dnd-toolbar.md`](./2026-09-29-asset-manager-context-dnd-toolbar.md)
> Reviewed: 2026-09-29

## Verdict: **Solid plan — execute with amendments below**

The plan is well-researched, code-verified, and the Jev decisions are sensible. The phase breakdown is independently mergeable, which is the right approach for a 1462-line file. Below are the pressure-test findings.

---

## 1. Main Concern

**The plan proposes 4 new service files + 1 new component + major modifications to a 1462-line file, but doesn't address extracting `AssetsManagerPage.tsx` first.** This file is already at the edge of maintainability. Adding `ctxMenu` state, clipboard shortcuts, `onDragOver`/`onDrop` on cards, inline toolbar, and touch long-press logic will push it past 1700 lines. The plan should explicitly note whether Phase 1 begins with extracting `FolderTreeNode`, `AssetCard`, `RootRow`, and `SelectionToolbar` into `components/assets/` — or whether it accepts the debt.

**Recommendation**: Accept it for now — extraction is a refactor, not a feature. Each phase touches narrow sections. But add a Phase 0 or post-Phase 6 cleanup task: extract inner components.

---

## 2. Issues Found (by severity)

### Critical

| # | Issue | Detail |
|---|---|---|
| C1 | **`TRASH_FOLDER_NAME` and `MAX_SCAN_DEPTH` already exist in `types.ts`** | `listFolderFiles` does NOT skip `.kollektiv-trash` — only `scanDirectoryTree` does. If you browse the root folder, trash files appear in the grid. Fix during Phase 2. |
| C2 | **`AssetMeta` has no `sortOrder` field** | Plan §4.1 adds `sortOrder?: number` — changes the vault manifest schema. This is additive-only and safe, but the plan should be explicit that no `stampSchemaVersion` bump is needed. |

### Required

| # | Issue | Detail |
|---|---|---|
| R1 | **Cross-root clipboard validation** | The paste operation must verify the source root is still connected and writable when pasting after switching roots. |
| R2 | **`folderOps.ts` OPFS vs File System Access** | Plan wording says "OPFS" but the asset manager uses File System Access API handles (user-picked dirs). The actual API calls (`getDirectoryHandle`, `removeEntry`) are the same — the wording is just misleading. |
| R3 | **Grid reorder auto-switch has no undo** | The sort-key change toast should have a "revert" action restoring the previous sort key — not the undo journal. |

### Advisories

| # | Issue | Detail |
|---|---|---|
| A1 | **Custom drag preview canvas** | Canvas-based `setDragImage` must be attached to the DOM during `dragstart` in some browsers. Test in Firefox. |
| A2 | **Touch long-press threshold** | 500ms is borderline; consider 300ms with a 10px movement threshold to cancel. |
| A3 | **`ContextMenu` z-index `z-[9999]`** | Use a semantic z-index layer (e.g. `z-context-menu`) rather than a raw magic number. |

---

## 3. Weakest Assumption

**"Folder delete will just work via `removeEntry`."** Non-empty folder deletion requires `removeEntry({ recursive: true })`, which varies in error semantics across Chrome versions. `deleteFolder` must either refuse non-empty folders or show a confirmation stating "This folder contains N files".

---

## 4. Strongest Counterargument

The plan is **well-phased and independently shippable**. Phase 1 alone adds significant value — right-click context menu is the #1 missing UX affordance for a file manager. The Jev decisions are defensible. The e2e strategy (preserving `role="toolbar" aria-label="Selection actions"`) is exactly right.

---

## 5. What to Verify

- [ ] `listFolderFiles` does NOT filter `.kollektiv-trash` — add filter before Phase 2.
- [ ] `removeEntry({ recursive: true })` browser support for folder delete.
- [ ] `stampSchemaVersion` in `assetLibrary.ts` — confirm `sortOrder` is additive, no bump needed.
- [ ] `AnimatePresence` wrapper at lines 986–1001 — verify it wraps the SelectionToolbar portal (plan §5.3).

---

## 6. Execution Order Adjustment

One amendment: **swap Phase 3 and Phase 4**. Tree folder move (Phase 4) is more immediately useful and reuses existing `runTransfer` + journal patterns. Grid reorder (Phase 3) depends on the `sortOrder` schema change which should bake longer.

**Recommended order: 1 → 2 → 4 → 3 → 5 → 6.**

---

## 7. Final Recommendation

**Proceed.** Fix C1 (`listFolderFiles` trash exclusion) during Phase 2, annotate C2 (`sortOrder` schema note) during Phase 3, use a semantic z-index class instead of `z-[9999]`. Start with Phase 1.
