# LoRA Editor — Design Spec

Date: 2026-07-10

## Goal

Port `LoRA-Edit/` (a standalone vanilla-JS "LoRA Metadata Viewer" — `index.html` + `main.js` + `styles.css`) into the main Kollektiv app as a new Utilities page, with full feature parity, restyled to the app's native design system (no styling ported from the original).

## Source tool summary

Single-page tool: drop a `.safetensors` (or `.gguf`) file, parse its header metadata (kohya sd-scripts convention: `ss_*` fields JSON-stringified inside `__metadata__`), and display it across several panels — Summary, Suggested Prompt, Tag Frequency, Online Lookup (CivitAI / Arc en Ciel by file hash), Metadata (raw), Metadata Editor (edit + download/purge). A settings drawer configures which fields appear, custom computed fields (JS `eval()` expressions), and lookup sources.

## Scope decisions (user-approved)

1. **Full feature parity** — including CivitAI/Arc en Ciel online lookup and the `eval()`-based custom-fields system.
2. **Keep `eval()`** for custom fields, unchanged from the original. Expressions are user-authored, run client-side against local data — same trust model as the original tool (self-XSS at worst, not attacker-supplied).
3. **One page, internal tabs** — single "LoRA Editor" entry under Utilities. One file drop, then switch between Summary / Tag Frequency / Metadata / Editor / Online Lookup via tabs inside the page, matching the aside+main layout other utility pages (`ImageResizer.tsx`) already use.

## CSP check (verified)

No Content-Security-Policy exists anywhere in the app (`index.html`, `server.ts`, `vite.config.ts` all checked — no CSP meta tag, no CSP response headers, no `helmet`). No existing `eval()`/`new Function()` usage elsewhere in the codebase to piggyback on, but none is needed — nothing blocks `eval`, external `fetch` to CivitAI/Arc en Ciel, or remote `<img>`/`<video>` sources. Full parity requires no app-level config changes.

## Architecture

New folder `components/loraEditor/`, mirroring the existing `components/settings/` split pattern (a page-level container + focused sub-components + shared primitives):

```
components/loraEditor/
  LoraEditorPage.tsx        - top-level container: drop zone, tab bar, settings drawer toggle
  types.ts                  - ParsedMetadata, CustomFieldDef, LookupResult, LoraEditorSettings
  constants.ts               - DEFAULT_CUSTOM_FIELDS, DEFAULT_SUMMARY_FIELDS, DEFAULT_EDITOR_FIELDS,
                                DEFAULT_CUSTOM_TEMPLATE (ported verbatim from LoRA-Edit's DEFAULTS)
  lib/
    safetensors.ts           - parseHeader(file), buildDownload(file, newHeader, purge)
    hashing.ts                - sha256(file), autoV2Hash(file), autoV3Hash(file) (chunked)
    onlineLookup.ts           - getCivitAiByHash(hash), getArcEnCielByHash(hash, proxyUrl)
    customFields.ts           - evaluateCustomFields(defs, context) — eval() runner, ordered, error-swallowing
    templating.ts             - replacePlaceholders(template, data) for {{field}} substitution
    safetensors.test.ts       - header parse/rewrite round-trip on a synthetic buffer
    customFields.test.ts      - eval ordering + error-swallow behavior
  SummaryPanel.tsx            - JSON / Table / Dashboard layout toggle (Dashboard uses
                                 dangerouslySetInnerHTML on the templated HTML block)
  TagFrequencyPanel.tsx       - parses ss_tag_frequency; top-N, include/exclude filters, by-folder toggle
  SuggestedPromptPanel.tsx    - trainedWords from lookup result; reuses the same filter UI
  OnlineLookupPanel.tsx       - model/resource links, preview image/video
  MetadataPanel.tsx           - raw JSON viewer with copy-to-clipboard
  MetadataEditorPanel.tsx     - manual JSON textarea / simple field-by-field editor;
                                 Update & Download / Purge & Download
  SettingsDrawer.tsx          - General / Summary Fields / Editor Fields / Custom Fields / Online Lookup
                                 tabs, built from components/settings/primitives.tsx
                                 (SettingRow, ProviderTab, SettingsGroup)
```

**Dropped from the original** (native-styling / not applicable to an embedded feature):
- Display tab's theme/color/font pickers — the app has its own theme system.
- "Check for updates" — checks LoRA-Edit's own GitHub releases, meaningless embedded.

## Data flow

1. User drops/selects a `.safetensors` file (or `.gguf`, hash+lookup only, no header parse — matches original's secondary path).
2. `parseHeader()` reads the first 8 bytes (little-endian metadata length), decodes the JSON header, extracts `__metadata__`, and `JSON.parse`s each string value where possible (kohya convention) → `fileMetadata`.
3. `hashing.ts` computes SHA-256 (full file) and AutoV2/AutoV3 (partial/chunked) hashes.
4. If lookup is enabled in settings, fetch CivitAI (direct) and/or Arc en Ciel (via the user's configured proxy URL) by hash → `civitaiMetadata` / `arcencielMetadata`.
5. `evaluateCustomFields()` runs the ordered custom-field defs (defaults ported verbatim, user-editable) against `{fileMetadata, civitaiMetadata, arcencielMetadata, customMetadata-so-far}` → `customMetadata`.
6. Panels render from `fileMetadata` + `customMetadata` + lookup results. Summary (Dashboard layout) and Suggested Prompt use `replacePlaceholders()` templating.
7. Metadata Editor edits `fileMetadata` and can rewrite-and-download (new header, original tensor bytes preserved via `file.slice`) or purge-and-download (strip metadata entirely).

## State & persistence

- Settings (field lists, custom-field defs, template, tag/prompt filters, lookup source, proxy URL) persist via the existing `useLocalStorage` hook under a single key (`loraEditorSettings`), seeded from `constants.ts` defaults — same mechanism `collapsedPanels` already uses. No new storage service.
- Loaded file state is in-memory component state only, cleared on reset — same as `ImageResizer.tsx`. Files are not meant to survive a reload (matches original, which never persists the file itself).

## Styling

Follows `ImageResizer.tsx`'s frame pattern: `motion.aside`/`motion.main`, `corner-frame`, `PanelLine`, `ScanLine`, `form-input`/`form-select`/`form-btn`/`form-textarea` classes, `TerminalText` headers. Settings drawer reuses `SettingRow`/`ProviderTab`/`SettingsGroup` from `components/settings/primitives.tsx`. Drop zone adapts `ImageResizer`'s `DropZone` for a single file, `accept=".safetensors,.gguf"`.

## Integration points

- `types.ts` — add `'lora_editor'` to `ActiveTab`.
- `components/Header.tsx` — add `{ id: 'lora_editor' as ActiveTab, label: 'LoRA Editor' }` to `utilityItems`.
- `components/App.tsx` — import `LoraEditorPage`, add a case in `renderContent()`'s switch and in the `currentTitle` switch (e.g. `` `LORA | ${base}` ``).

## Named trade-offs / risks

- `eval()` kept for custom fields (user-approved) — self-XSS trust model, not attacker-facing.
- Summary Dashboard layout uses `dangerouslySetInnerHTML` for `{{field}}`-templated HTML — same trust model as the eval decision, called out explicitly since it's the other place user-authored strings become live markup.
- Arc en Ciel lookup requires the user's own proxy URL (CORS) — same as original. No server-side proxy is added to `server.ts`; that would be new infrastructure beyond parity scope.

## Testing

`lib/safetensors.test.ts` (vitest already configured — see `utils/manifestStore.test.ts`) covering header parse/rewrite round-trip on a synthetic minimal safetensors buffer, and `lib/customFields.test.ts` covering eval ordering and error-swallow behavior. No broader test suite.
