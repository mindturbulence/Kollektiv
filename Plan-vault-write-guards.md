# Vault Write Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the app from ever overwriting a user's vault manifests with empty data. Today, every `*Storage.ts` module treats a failed/slow/corrupt manifest read as "empty manifest" and the next mutation saves that emptiness over the real file — a user with a large gallery can lose the entire gallery manifest from a single slow read. Fix it once in a shared helper, port all five storage modules onto it, and fix three adjacent data-loss bugs found in the same audit.

**Architecture:** `utils/fileUtils.ts` exposes a singleton `fileSystemManager`. Its `readFile` (`fileUtils.ts:611-621`) races a 5-second timeout and returns `null` on timeout **or any error** — so `null` means "absent OR unreadable", and no storage module currently disambiguates. `fileSystemManager.fileExists` (`fileUtils.ts:628`) already exists and does disambiguate (it throws on transient errors instead of returning false — read its doc comment at `fileUtils.ts:623-627`). `utils/integrity.ts:77` already exports a resilient parser `forceParseJson`. This plan builds a shared `loadManifestSafe` on top of those two existing functions and threads a `safeToSave` flag through every mutating operation.

**Tech Stack:** TypeScript, File System Access API, vitest (added in Task 6 — first test in the repo).

## Global Constraints

- **Never change the on-disk shape of any manifest.** Gallery/prompt manifests are JSON objects; the three cheatsheet manifests (`cheatsheet.json`, `artists_cheatsheet.json`, `artstyles_cheatsheet.json`) are **bare JSON arrays**. Keep `JSON.stringify(data, null, 2)` formatting.
- **No new runtime dependencies.** vitest is a devDependency only.
- `pnpm lint` (= `tsc --noEmit`) must be green after every task.
- The app has zero existing tests; do not break the `build` script.

---

### Task 1: Create the shared safe-load helper

**Files:**
- Create: `utils/manifestStore.ts`

**Produces:** `loadManifestSafe<T>(manifestName, validate, empty, fs?)` returning `{ data: T, safeToSave: boolean }`, and `ManifestWriteBlockedError`. Later tasks import both.

- [ ] **Step 1: Write the file exactly as below**

```typescript
import { fileSystemManager } from './fileUtils';
import { forceParseJson } from './integrity';

export interface ManifestLoad<T> {
    data: T;
    /**
     * false = the file may exist but could not be read or parsed.
     * Saving `data` back would overwrite real user data with an empty manifest.
     */
    safeToSave: boolean;
}

export class ManifestWriteBlockedError extends Error {
    constructor(manifestName: string) {
        super(`Refusing to overwrite ${manifestName}: it exists but could not be read. Run Settings > Neural Integrity to repair it, then retry.`);
        this.name = 'ManifestWriteBlockedError';
    }
}

/** Minimal surface of fileSystemManager needed here; injectable for tests. */
export interface ManifestFs {
    readFile(path: string): Promise<string | null>;
    fileExists(path: string): Promise<boolean>;
}

export const loadManifestSafe = async <T>(
    manifestName: string,
    validate: (parsed: any) => T | null,
    empty: () => T,
    fs: ManifestFs = fileSystemManager
): Promise<ManifestLoad<T>> => {
    let content: string | null = null;
    try {
        content = await fs.readFile(manifestName);
    } catch {
        content = null;
    }

    if (content) {
        const parsed = forceParseJson(content);
        const validated = parsed == null ? null : validate(parsed);
        if (validated !== null) return { data: validated, safeToSave: true };
        console.error(`[manifestStore] ${manifestName} present but not valid — writes blocked for this operation.`);
        return { data: empty(), safeToSave: false };
    }

    // readFile returned null: absent OR unreadable (timeout / permission). Disambiguate.
    try {
        const exists = await fs.fileExists(manifestName);
        if (!exists) return { data: empty(), safeToSave: true }; // genuinely new vault
    } catch {
        // Existence unknown — assume the file is there and protect it.
    }
    console.error(`[manifestStore] ${manifestName} unreadable but may exist — writes blocked for this operation.`);
    return { data: empty(), safeToSave: false };
};
```

- [ ] **Step 2:** `pnpm lint` → zero errors.
- [ ] **Step 3:** Commit: `git add utils/manifestStore.ts && git commit -m "feat: loadManifestSafe - distinguish absent from unreadable manifests"`

**Edge cases this design already handles (do not "simplify" them away):**
- `fileExists` **throws** on permission/transient errors by design (see its doc comment). The `catch` treating "unknown" as "present" is the safety net — never convert that throw into `false`.
- `forceParseJson` can return non-null garbage (a number, a string). That's why `validate` runs after it and must check shape.
- `validate` must return `null` (not an empty array/object) on shape mismatch — returning empty would flip `safeToSave` to true and re-enable the wipe.

---

### Task 2: Port galleryStorage and promptStorage (Cluster B — object manifests)

**Files:**
- Modify: `utils/galleryStorage.ts` (getManifest at `:16-35`, saveManifest at `:37-39`, all mutating exports)
- Modify: `utils/promptStorage.ts` (same skeleton at `:14-32`)

**Consumes:** `loadManifestSafe`, `ManifestWriteBlockedError` from Task 1.

- [ ] **Step 1: Rewrite `getManifest` in `utils/galleryStorage.ts`** to return `ManifestLoad<GalleryManifest>`:

```typescript
import { loadManifestSafe, ManifestWriteBlockedError, type ManifestLoad } from './manifestStore';

const getManifest = (): Promise<ManifestLoad<GalleryManifest>> =>
    loadManifestSafe<GalleryManifest>(
        MANIFEST_NAME,
        (parsed) => {
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
            return {
                galleryItems: Array.isArray(parsed.galleryItems) ? parsed.galleryItems.filter((i: any) => i && typeof i === 'object' && i.id) : [],
                categories: Array.isArray(parsed.categories) ? parsed.categories.filter((c: any) => c && typeof c === 'object' && c.id) : [],
                pinnedIds: Array.isArray(parsed.pinnedIds) ? parsed.pinnedIds : [],
            };
        },
        () => ({ galleryItems: [], categories: [], pinnedIds: [] })
    );
```

- [ ] **Step 2: Update every caller of `getManifest` inside the file.** Read-only exports (e.g. `loadGalleryItems`, `loadGalleryCategories`) destructure `.data` and behave exactly as before. **Every mutating export** (add/update/delete item, category CRUD, pin save — find them all with `grep -n "getManifest()" utils/galleryStorage.ts`) gets this pattern at the top:

```typescript
const { data: manifest, safeToSave } = await getManifest();
if (!safeToSave) throw new ManifestWriteBlockedError(MANIFEST_NAME);
```

  **Order matters:** the guard must run **before** any binary file is written (`addItemToGallery` saves media files before the manifest — a blocked manifest write after media files land on disk creates orphans). Throw first, touch disk never.

- [ ] **Step 3: Repeat both steps for `utils/promptStorage.ts`** (same skeleton; validator checks `Array.isArray(parsed.prompts)`-style fields per its manifest interface — read the file first, mirror its current field-by-field validation inside `validate`).
- [ ] **Step 4:** `pnpm lint` green.
- [ ] **Step 5:** Commit: `git commit -am "fix: gallery/prompt manifests refuse writes after unsafe reads"`

---

### Task 3: Port the three cheatsheet stores (Cluster A — bare-array manifests)

**Files:**
- Modify: `utils/cheatsheetStorage.ts` (`getManifest :8-21`, `saveCheatsheet :24-31`, `updateCategory :37-62`)
- Modify: `utils/artistStorage.ts` (same functions at `:12-25`, `:27-34`, `:40-90`, `:92-117`)
- Modify: `utils/artstyleStorage.ts` (same at `:9-22`, `:25-32`, `:38-88`, `:90-115`)

These three files are near-identical copies — apply the identical change to each.

- [ ] **Step 1: Replace `getManifest`** in each with:

```typescript
const getManifest = (): Promise<ManifestLoad<CheatsheetCategory[]>> =>
    loadManifestSafe<CheatsheetCategory[]>(
        MANIFEST_NAME,
        (parsed) => (Array.isArray(parsed) ? parsed : null),
        () => []
    );
```

- [ ] **Step 2: Fix the silent-failure save contract.** The three `save*` functions currently catch write errors and only `console.error` (e.g. `cheatsheetStorage.ts:28-30`) — the UI shows success while the disk write failed. Remove the try/catch swallow: keep the `console.error` but **rethrow** so callers stop reporting fake success.
- [ ] **Step 3: Guard the mutating functions.** `updateArtist` (`artistStorage.ts:40`) and `updateArtStyle` (`artstyleStorage.ts:38`) already skip saving when no item matched — keep that. But all three `updateCategory` functions save **unconditionally** even when the manifest loaded empty. Add both guards:

```typescript
const { data, safeToSave } = await getManifest();
if (!safeToSave) throw new ManifestWriteBlockedError(MANIFEST_NAME);
if (!data.some(cat => cat.category === categoryName)) return data; // nothing matched — don't touch disk
```

- [ ] **Step 4:** Update the read-only `load*` exports to return `.data`. `pnpm lint` green.
- [ ] **Step 5:** Commit: `git commit -am "fix: cheatsheet stores - write guards and honest save errors"`

---

### Task 4: Fix the gallery self-heal delete-resurrection race

**Files:**
- Modify: `utils/galleryStorage.ts:133-161` (`loadGalleryItems` background heal)

**The bug:** the `setTimeout` heal (`:137-156`) loads a manifest copy, spends seconds probing files, then saves that **stale full manifest** back. Any item deleted (or added) during that window is resurrected (or dropped).

- [ ] **Step 1: Rewrite the heal callback** to collect healed URLs keyed by item id, then re-load a *fresh* manifest immediately before saving and apply only the healed URLs to items that still exist:

```typescript
setTimeout(async () => {
    try {
        const bg = await getManifest();
        if (!bg.safeToSave) return; // never heal on top of an unsafe read
        const healedUrls = new Map<string, string[]>();
        for (const item of bg.data.galleryItems) {
            if (item && Array.isArray(item.urls) && await healItemUrls(item, bg.data.categories)) {
                healedUrls.set(item.id, item.urls);
            }
        }
        if (healedUrls.size === 0) return;
        // Re-read fresh so concurrent adds/deletes during the probe loop are not clobbered.
        const fresh = await getManifest();
        if (!fresh.safeToSave) return;
        let changed = false;
        for (const item of fresh.data.galleryItems) {
            const urls = healedUrls.get(item.id);
            if (urls) { item.urls = urls; changed = true; }
        }
        // ponytail: ms-scale race window remains between re-read and save; a write queue is the upgrade path.
        if (changed) {
            await saveManifest(fresh.data);
            window.dispatchEvent(new CustomEvent('gallery-manifest-healed'));
        }
    } catch (e) {
        console.error("Background loading heal error:", e);
    }
}, 100);
```

  Keep the exceptions inside the try/catch — this runs in a `setTimeout`, an escape is an unhandled rejection.
- [ ] **Step 2:** `pnpm lint` green. Commit: `git commit -am "fix: gallery self-heal no longer resurrects deleted items"`

---

### Task 5: Fix the integrity-tool shape mismatch for cheatsheet manifests

**Files:**
- Modify: `utils/integrity.ts:44-58`

**The bug:** the repair defaults for `artstyles_cheatsheet.json`, `artists_cheatsheet.json`, and `cheatsheet.json` are objects — `getDefaultContent: () => ({ categories: [], items: [] })` — but every runtime reader expects a **bare array** (`Array.isArray(parsed)` in Task 3). If the integrity tool ever creates or repairs one of these files, it writes a shape every reader rejects.

- [ ] **Step 1:** Change all three `getDefaultContent` values at `integrity.ts:47`, `:52`, `:57` to `() => ([])`. Fix integrity to match the readers — **not** the readers to match integrity (existing user files on disk are arrays; changing readers would orphan them).
- [ ] **Step 2:** `pnpm lint` green. Commit: `git commit -am "fix: integrity defaults for cheatsheet manifests match on-disk array shape"`

---

### Task 6: First automated test in the repo — lock in the guard behavior

**Files:**
- Create: `utils/manifestStore.test.ts`
- Modify: `package.json` (devDependency + script), `.github/workflows/ci.yml` (add `- run: pnpm test` after the lint step)

- [ ] **Step 1:** `pnpm add -D vitest`
- [ ] **Step 2:** Add `"test": "vitest run"` to `package.json` scripts.
- [ ] **Step 3: Write `utils/manifestStore.test.ts`** using the injectable `fs` parameter — no mocking framework needed:

```typescript
import { describe, it, expect } from 'vitest';
import { loadManifestSafe, type ManifestFs } from './manifestStore';

const validate = (p: any) => (Array.isArray(p) ? p : null);
const empty = () => [] as any[];
const fs = (readFile: ManifestFs['readFile'], fileExists: ManifestFs['fileExists']): ManifestFs => ({ readFile, fileExists });

describe('loadManifestSafe', () => {
    it('valid content -> data, safeToSave', async () => {
        const r = await loadManifestSafe('m.json', validate, empty, fs(async () => '[{"a":1}]', async () => true));
        expect(r).toEqual({ data: [{ a: 1 }], safeToSave: true });
    });
    it('absent file -> empty, safeToSave (fresh vault)', async () => {
        const r = await loadManifestSafe('m.json', validate, empty, fs(async () => null, async () => false));
        expect(r).toEqual({ data: [], safeToSave: true });
    });
    it('null read but file exists (timeout) -> writes blocked', async () => {
        const r = await loadManifestSafe('m.json', validate, empty, fs(async () => null, async () => true));
        expect(r.safeToSave).toBe(false);
    });
    it('null read and existence check throws -> writes blocked', async () => {
        const r = await loadManifestSafe('m.json', validate, empty, fs(async () => null, async () => { throw new Error('perm'); }));
        expect(r.safeToSave).toBe(false);
    });
    it('present but wrong shape -> writes blocked', async () => {
        const r = await loadManifestSafe('m.json', validate, empty, fs(async () => '{"not":"array"}', async () => true));
        expect(r.safeToSave).toBe(false);
    });
    it('unparseable garbage -> writes blocked', async () => {
        const r = await loadManifestSafe('m.json', validate, empty, fs(async () => 'x%%%', async () => true));
        expect(r.safeToSave).toBe(false);
    });
});
```

  Note: `forceParseJson` is lenient — if the garbage test unexpectedly parses, the `validate` shape check must still block it; if that test fails, the bug is in your `validate`, not the test.
- [ ] **Step 4:** `pnpm test` → all pass. `pnpm lint` green.
- [ ] **Step 5:** Add `- run: pnpm test` to `.github/workflows/ci.yml` after the `pnpm lint` line. Commit everything: `git commit -am "test: vitest + manifest write-guard coverage; run in CI"`

---

## Edge cases a weaker model would miss (recap)

1. `readFile` returning `null` means absent **or** timed-out **or** permission-denied — never treat as "empty manifest" without `fileExists`.
2. `fileExists` throws instead of returning false on transient errors — that throw is intentional; catch it and block writes.
3. `validate` returning an empty default instead of `null` silently re-enables the wipe.
4. In `addItemToGallery`, the guard must precede media-file writes, or blocked saves leave orphan binaries.
5. Cheatsheet manifests are bare arrays on disk; integrity's object defaults are the bug, not the readers.
6. The heal callback runs detached in `setTimeout` — every await must stay inside its try/catch.
7. Do not merge the three cheatsheet stores into one factory in this plan — that's a follow-up; mixing it in here doubles the review surface of a data-safety change.

## Acceptance criteria

1. `pnpm lint` and `pnpm build` green; `pnpm test` passes locally and in CI.
2. Manual, in `pnpm dev` with a test vault: normal CRUD works — add a gallery item, delete it, reload; edit a cheatsheet category background; save a prompt. All persist.
3. Wipe simulation: temporarily edit `fileSystemManager.readFile` to `return null;` when `filePath === 'kollektiv_gallery_manifest.json'` (one-line hack, then revert). Reload: gallery shows empty (expected). Try to add an item: the operation **fails with the "Refusing to overwrite" message in console** and — critically — the real manifest file on disk is **byte-identical** afterwards. Revert the hack; the gallery is fully back.
4. Delete the manifest file entirely from the vault folder: app starts fresh and the next add **succeeds** (absent ≠ unreadable).
5. Heal check: break one item's URL in the manifest by hand (rename its file), reload, wait ~2s — console logs `[Self-Heal]`, the manifest is rewritten with the fixed path, and no other item changed.

## Out of scope

- Merging the three Cluster-A stores into one generic factory (~140 duplicated lines) — worthwhile follow-up after this lands.
- Drive-provider verification/repair (integrity skips Drive today).
- `chatStorage` localStorage quota handling.
- A write queue/mutex for full read-modify-write serialization.
