# Phase 1 — Gallery Auto-Tagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suggest descriptive tags for gallery images from their pixel content and prompt text, writing to the existing `GalleryItem.tags` field only after the user explicitly accepts them.

**Architecture:** A pure text layer (parse, normalize) with no I/O, sitting under a provider-dispatched vision call that follows the existing `abstractImage` pattern in `services/llmService.ts:486-491`. Orchestration loads the image blob from the vault, converts to raw base64, calls the provider, then parses and normalizes. The UI never writes tags without an explicit accept.

**Tech Stack:** TypeScript (strict), React 19, Vitest + jsdom, `@testing-library/react`.

## Global Constraints

- `pnpm lint` (`tsc --noEmit`) must pass clean. The compiler **is** the lint gate.
- `pnpm test` must stay green.
- New settings follow the 4-step recipe in `AI_WORKER_RULES.md:43-44`: (a) field on `LLMSettings` in `types.ts`, (b) default in `defaultLLMSettings`, (c) hydration line in `loadLLMSettings`, (d) **add to the `SetupPage.handleSettingsChange` allow-list** or it will not survive a reload.
- Conventional Commits: `type(scope): summary`. Work on `development`, never commit to `main`.
- Styling stays within Tailwind + DaisyUI. Reuse existing class strings from the file you are editing.
- Test assertions use `toBeTruthy()`, **not** `toBeInTheDocument()`. `vite.config.ts:178` sets `setupFiles: []`, so `@testing-library/jest-dom` matchers are **not** registered. Match the house style in `components/ErrorDisplay.test.tsx`.
- `ProviderUnsupportedError` must propagate untouched. Never catch it to substitute a different provider.
- Suggestions are never written automatically. Every write is user-initiated.

## Verified Codebase Facts

Confirmed by reading the code on 2026-07-28. An implementer can rely on these without re-checking.

| Fact | Location |
|---|---|
| `GalleryItem.tags?: string[]` already exists — **no schema migration needed** | `types.ts:384` |
| `updateItemInGallery(id, updates: Partial<Omit<GalleryItem,'id'\|'createdAt'>>): Promise<void>` | `utils/galleryStorage.ts:230` |
| `getActiveFileManager(): FileSystemManagerInstance` | `utils/fileUtils.ts:1426` |
| `.getFileAsBlob(filePath: string): Promise<Blob \| null>` | `utils/fileUtils.ts:15` (interface) |
| `fileToBase64(file, getRawData)` — `true` strips the `data:...;base64,` prefix via `result.split(',')[1]` | `utils/fileUtils.ts:1432-1442` |
| Provider dispatch pattern to copy | `services/llmService.ts:486-491` |
| `requireProvider(feature, settings, supported)` throws `ProviderUnsupportedError` | `services/llmService.ts:29-33` |
| Gemini vision call shape | `services/geminiService.ts:414-431` |
| Ollama vision call shape (`/api/chat`, `images: [base64]`) | `services/ollamaService.ts:578-600` |
| Gemini helpers: `getGeminiClient`, `DEFAULT_MODEL`, `getMappedModel` | `services/geminiService.ts:7,22,25` |
| Settings allow-list is an **inline array literal** | `components/SetupPage.tsx:436` |
| Tags render block in item detail, gated on `tags.length > 0` | `components/ItemDetailView.tsx:666-676` |

## File Structure

| File | Responsibility |
|---|---|
| `services/autoTagService.ts` (create) | Pure parse + normalize, plus orchestration. No provider knowledge. |
| `services/autoTagService.test.ts` (create) | Unit tests for all of the above. |
| `services/geminiService.ts` (modify) | `suggestTagsRawGemini` — returns raw model text. |
| `services/ollamaService.ts` (modify) | `suggestTagsRawOllama` — returns raw model text. |
| `services/llmService.ts` (modify) | `suggestTagsRaw` dispatcher with `requireProvider`. |
| `types.ts` (modify) | `autoTagEnabled` field. |
| `utils/settingsStorage.ts` (modify) | Default + hydration. |
| `components/SetupPage.tsx` (modify) | Allow-list entry. |
| `components/settings/AssistantSection.tsx` (modify) | Toggle UI. |
| `components/ItemDetailView.tsx` (modify) | Suggest / accept / reject affordance. |
| `docs/handbook/.../ARCHITECTURE_CONSTITUTION.md` (modify) | Correct the false Phase 2 claim. |
| `docs/ISSUES.md` (modify) | Log the correction. |

**Design note — why providers return raw text.** `abstractImageGemini` and `abstractImageOllama` each parse their own output, duplicating the split logic. This plan keeps providers dumb (raw `string` out) so parsing lives in one tested place. This is a deliberate, documented deviation from the neighbouring pattern.

---

## Task 1: Parse raw model output into candidate tags

**Files:**
- Create: `services/autoTagService.ts`
- Test: `services/autoTagService.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseTagResponse(text: string): string[]`

- [ ] **Step 1: Write the failing test**

Create `services/autoTagService.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseTagResponse } from './autoTagService';

describe('parseTagResponse', () => {
  it('splits a comma-separated line', () => {
    expect(parseTagResponse('sunset, landscape, cinematic')).toEqual(['sunset', 'landscape', 'cinematic']);
  });

  it('splits newline-separated output', () => {
    expect(parseTagResponse('sunset\nlandscape\ncinematic')).toEqual(['sunset', 'landscape', 'cinematic']);
  });

  it('strips list numbering', () => {
    expect(parseTagResponse('1. sunset\n2) landscape')).toEqual(['sunset', 'landscape']);
  });

  it('strips bullet markers', () => {
    expect(parseTagResponse('- sunset\n* landscape\n• cinematic')).toEqual(['sunset', 'landscape', 'cinematic']);
  });

  it('strips surrounding quotes', () => {
    expect(parseTagResponse('"sunset", \'landscape\'')).toEqual(['sunset', 'landscape']);
  });

  it('drops a preamble line ending in a colon', () => {
    expect(parseTagResponse('Here are the tags:\nsunset, landscape')).toEqual(['sunset', 'landscape']);
  });

  it('drops entries longer than three words', () => {
    expect(parseTagResponse('sunset, this is a long descriptive sentence, landscape')).toEqual(['sunset', 'landscape']);
  });

  it('returns an empty array for empty input', () => {
    expect(parseTagResponse('')).toEqual([]);
    expect(parseTagResponse('   \n  ')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run services/autoTagService.test.ts`
Expected: FAIL — `Failed to resolve import "./autoTagService"`.

- [ ] **Step 3: Write the minimal implementation**

Create `services/autoTagService.ts`:

```ts
/**
 * Auto-tagging — suggests descriptive tags for gallery images.
 *
 * Providers return raw text; all parsing and normalization happens here so
 * the logic is tested in one place rather than duplicated per provider.
 */

/** Tags longer than this are almost always prose the model leaked in. */
const MAX_TAG_WORDS = 3;

/** Turn raw model output into candidate tag strings. Defensive: models
 *  ignore format instructions often enough that this cannot assume one shape. */
export function parseTagResponse(text: string): string[] {
  if (!text) return [];
  return text
    .split(/[,\n]/)
    .map(s => s.trim())
    .map(s => s.replace(/^[-*•]\s*/, ''))
    .map(s => s.replace(/^\d+[.)]\s*/, ''))
    .map(s => s.replace(/^["'`]+|["'`]+$/g, ''))
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => !s.endsWith(':'))
    .filter(s => s.split(/\s+/).length <= MAX_TAG_WORDS);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run services/autoTagService.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add services/autoTagService.ts services/autoTagService.test.ts
git commit -m "feat(auto-tag): parse raw model output into candidate tags"
```

---

## Task 2: Normalize and deduplicate candidates

**Files:**
- Modify: `services/autoTagService.ts`
- Test: `services/autoTagService.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `normalizeTags(candidates: string[], existing?: string[]): string[]`

- [ ] **Step 1: Write the failing test**

Append to `services/autoTagService.test.ts`:

```ts
import { normalizeTags } from './autoTagService';

describe('normalizeTags', () => {
  it('lowercases and trims', () => {
    expect(normalizeTags(['  Sunset ', 'LANDSCAPE'])).toEqual(['sunset', 'landscape']);
  });

  it('collapses internal whitespace', () => {
    expect(normalizeTags(['golden   hour'])).toEqual(['golden hour']);
  });

  it('deduplicates within the candidate list', () => {
    expect(normalizeTags(['sunset', 'Sunset', 'SUNSET'])).toEqual(['sunset']);
  });

  it('excludes tags already on the item, case-insensitively', () => {
    expect(normalizeTags(['sunset', 'landscape'], ['SUNSET'])).toEqual(['landscape']);
  });

  it('caps the result at twelve suggestions', () => {
    const many = Array.from({ length: 30 }, (_, i) => `tag${i}`);
    expect(normalizeTags(many)).toHaveLength(12);
  });

  it('returns an empty array when every candidate is already present', () => {
    expect(normalizeTags(['sunset'], ['sunset'])).toEqual([]);
  });

  it('handles an empty candidate list', () => {
    expect(normalizeTags([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run services/autoTagService.test.ts`
Expected: FAIL — `normalizeTags is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Append to `services/autoTagService.ts`:

```ts
/** Upper bound on suggestions shown at once. Keeps the accept/reject UI
 *  scannable and caps the damage from a model that ignores instructions. */
const MAX_SUGGESTIONS = 12;

/** Canonicalize candidates and drop anything the item already carries. */
export function normalizeTags(candidates: string[], existing: string[] = []): string[] {
  const existingSet = new Set(existing.map(t => t.trim().toLowerCase().replace(/\s+/g, ' ')));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of candidates) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!tag || existingSet.has(tag) || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run services/autoTagService.test.ts`
Expected: PASS — 15 tests total.

- [ ] **Step 5: Commit**

```bash
git add services/autoTagService.ts services/autoTagService.test.ts
git commit -m "feat(auto-tag): normalize and deduplicate tag candidates"
```

---

## Task 3: Gemini tag-suggestion provider call

**Files:**
- Modify: `services/geminiService.ts` (add after `abstractImageGemini`, which ends at line 431)

**Interfaces:**
- Consumes: `getGeminiClient`, `DEFAULT_MODEL`, `getMappedModel`, `handleGeminiError` (all already in this file).
- Produces: `suggestTagsRawGemini(base64ImageData: string, promptText: string, settings: LLMSettings): Promise<string>`

**Note:** returns **raw text**, not parsed. Parsing belongs to `autoTagService`.

- [ ] **Step 1: Add the implementation**

Insert after `abstractImageGemini` in `services/geminiService.ts`:

```ts
const TAG_SYSTEM_INSTRUCTION = "Role: Visual Cataloguer. Task: list concise descriptive tags for this image covering subject, style, medium, lighting, mood, and dominant colour. Each tag is one to three words, lowercase. Output a single comma-separated line. No preamble, no numbering, no explanation.";

/** Returns raw model text — parsing lives in services/autoTagService.ts. */
export const suggestTagsRawGemini = async (base64ImageData: string, promptText: string, settings: LLMSettings): Promise<string> => {
    try {
        const ai = getGeminiClient(settings);
        const parts: any[] = [{ inlineData: { mimeType: 'image/jpeg', data: base64ImageData } }];
        if (promptText.trim()) {
            parts.push({ text: `This image was generated from the prompt: ${promptText.trim()}` });
        }
        const response = await ai.models.generateContent({
            model: getMappedModel(DEFAULT_MODEL),
            contents: parts,
            config: {
                systemInstruction: TAG_SYSTEM_INSTRUCTION,
                maxOutputTokens: 300,
                thinkingConfig: { thinkingBudget: 0 }
            }
        });
        return response.text || '';
    } catch (err) { throw handleGeminiError(err, 'analysis'); }
};
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm lint`
Expected: clean. If `LLMSettings` is unimported in your edit region, it is already imported at the top of this file — do not re-import.

- [ ] **Step 3: Commit**

```bash
git add services/geminiService.ts
git commit -m "feat(auto-tag): add Gemini tag-suggestion call"
```

---

## Task 4: Ollama tag-suggestion provider call

**Files:**
- Modify: `services/ollamaService.ts` (add after `abstractImageOllama`, which ends at line 600)

**Interfaces:**
- Consumes: `getOllamaConfig`, `BASE_CONFIG`, `handleGeminiError` (all already used in this file at lines 580-599).
- Produces: `suggestTagsRawOllama(base64ImageData: string, promptText: string, settings: LLMSettings): Promise<string>`

- [ ] **Step 1: Add the implementation**

Insert after `abstractImageOllama` in `services/ollamaService.ts`:

```ts
/** Returns raw model text — parsing lives in services/autoTagService.ts.
 *  Requires a vision-capable Ollama model (llava, llama3.2-vision, etc.). */
export const suggestTagsRawOllama = async (base64ImageData: string, promptText: string, settings: LLMSettings): Promise<string> => {
    try {
        const config = getOllamaConfig(settings);
        const instruction = "List concise descriptive tags for this image covering subject, style, medium, lighting, mood, and dominant colour. Each tag is one to three words, lowercase. Output a single comma-separated line. No preamble, no numbering, no explanation."
            + (promptText.trim() ? `\n\nThis image was generated from the prompt: ${promptText.trim()}` : '');
        const apiResponse = await fetch(`${config.baseUrl}/api/chat`, {
            method: 'POST',
            headers: config.headers,
            body: JSON.stringify({
                model: config.model,
                messages: [{ role: 'user', content: instruction, images: [base64ImageData] }],
                stream: false,
                ...BASE_CONFIG,
            }),
        });
        const data = await apiResponse.json();
        return data.message?.content || '';
    } catch (err) { throw handleGeminiError(err, 'analysis'); }
};
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add services/ollamaService.ts
git commit -m "feat(auto-tag): add Ollama tag-suggestion call"
```

---

## Task 5: Provider dispatcher

**Files:**
- Modify: `services/llmService.ts` — import additions at lines 3-4, function added after `abstractImage` (ends line 491)

**Interfaces:**
- Consumes: `suggestTagsRawGemini` (Task 3), `suggestTagsRawOllama` (Task 4), `requireProvider` (`llmService.ts:29`).
- Produces: `suggestTagsRaw(base64ImageData: string, promptText: string, settings: LLMSettings): Promise<string>`

- [ ] **Step 1: Write the failing test**

Create `services/autoTagDispatch.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMSettings } from '../types';

vi.mock('./geminiService', () => ({
  suggestTagsRawGemini: vi.fn(async () => 'gemini-output'),
}));
vi.mock('./ollamaService', () => ({
  suggestTagsRawOllama: vi.fn(async () => 'ollama-output'),
}));

const makeSettings = (activeLLM: LLMSettings['activeLLM']): LLMSettings =>
  ({ activeLLM } as LLMSettings);

describe('suggestTagsRaw', () => {
  beforeEach(() => vi.resetModules());

  it('routes to Gemini when Gemini is active', async () => {
    const { suggestTagsRaw } = await import('./llmService');
    await expect(suggestTagsRaw('b64', '', makeSettings('gemini'))).resolves.toBe('gemini-output');
  });

  it('routes to Ollama when Ollama is active', async () => {
    const { suggestTagsRaw } = await import('./llmService');
    await expect(suggestTagsRaw('b64', '', makeSettings('ollama'))).resolves.toBe('ollama-output');
  });

  it('throws ProviderUnsupportedError for a provider without vision', async () => {
    const { suggestTagsRaw, ProviderUnsupportedError } = await import('./llmService');
    await expect(suggestTagsRaw('b64', '', makeSettings('anthropic')))
      .rejects.toBeInstanceOf(ProviderUnsupportedError);
  });
});
```

> **If `vi.mock` of these two modules proves impractical** because `llmService.ts` imports many other symbols from them (see its lines 3-4), instead mock the whole module with `importOriginal` and override only the two functions. Do **not** delete the third test — the `ProviderUnsupportedError` case is acceptance criterion 5 and must be covered.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run services/autoTagDispatch.test.ts`
Expected: FAIL — `suggestTagsRaw is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Add `suggestTagsRawGemini` to the `./geminiService` import at `services/llmService.ts:3` and `suggestTagsRawOllama` to the `./ollamaService` import at line 4. Then insert after `abstractImage` (line 491):

```ts
/** Raw tag-suggestion text from the active provider.
 *  Vision-capable providers only — throws ProviderUnsupportedError otherwise,
 *  because silently switching would leak a prompt the user chose to keep local. */
export const suggestTagsRaw = async (base64ImageData: string, promptText: string, settings: LLMSettings): Promise<string> => {
    const provider = requireProvider('Tag suggestion', settings, ['gemini', 'ollama']);
    return provider === 'ollama'
        ? suggestTagsRawOllama(base64ImageData, promptText, settings)
        : suggestTagsRawGemini(base64ImageData, promptText, settings);
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run services/autoTagDispatch.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Verify nothing else broke**

Run: `pnpm lint && pnpm test`
Expected: clean, green.

- [ ] **Step 6: Commit**

```bash
git add services/llmService.ts services/autoTagDispatch.test.ts
git commit -m "feat(auto-tag): dispatch tag suggestion by active provider"
```

---

## Task 6: `autoTagEnabled` setting

**Files:**
- Modify: `types.ts` — `LLMSettings` interface (starts line 167)
- Modify: `utils/settingsStorage.ts` — `defaultLLMSettings` (line 10) and `loadLLMSettings` (line 270)
- Modify: `components/SetupPage.tsx:436` — the allow-list array
- Test: `utils/settingsStorage.test.ts`

**Interfaces:**
- Produces: `LLMSettings.autoTagEnabled: boolean`, default `false`.

**Why the flag defaults to off:** vision calls cost money on cloud providers and are slow on local ones. Opt-in means no existing user's bill or workflow changes when this ships.

- [ ] **Step 1: Write the failing test**

Append to `utils/settingsStorage.test.ts`:

```ts
describe('autoTagEnabled', () => {
  it('defaults to false', () => {
    expect(defaultLLMSettings.autoTagEnabled).toBe(false);
  });

  it('survives a save/load round trip when enabled', () => {
    saveLLMSettings({ ...defaultLLMSettings, autoTagEnabled: true });
    expect(loadLLMSettings().autoTagEnabled).toBe(true);
  });

  it('falls back to false when absent from stored settings', () => {
    localStorage.setItem('kollektivSettingsV4', JSON.stringify({ activeLLM: 'gemini' }));
    expect(loadLLMSettings().autoTagEnabled).toBe(false);
  });
});
```

> Match the existing import block at the top of `settingsStorage.test.ts`; add `defaultLLMSettings` to it if it is not already imported.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run utils/settingsStorage.test.ts`
Expected: FAIL — `autoTagEnabled` is `undefined`.

- [ ] **Step 3: Apply all four parts of the settings recipe**

**(a)** In `types.ts`, inside `interface LLMSettings`, add near the other feature flags:

```ts
  // Gallery Auto-Tagging
  autoTagEnabled: boolean;
```

**(b)** In `utils/settingsStorage.ts`, inside `defaultLLMSettings` (line 10):

```ts
  autoTagEnabled: false,
```

**(c)** In `utils/settingsStorage.ts`, inside `loadLLMSettings` (line 270), alongside the other `parsed.x ?? default` lines:

```ts
  autoTagEnabled: parsed.autoTagEnabled ?? false,
```

**(d)** In `components/SetupPage.tsx:436`, add `'autoTagEnabled'` to the allow-list array. It becomes:

```ts
if (['youtube', 'googleIdentity', 'spotify', 'dashboardImageUrl', 'dashboardVideoUrl', 'darkTheme', 'mcpServers', 'googleApiKey', 'storageProvider', 'driveFolderId', 'driveFolderName', 'autoTagEnabled'].includes(field)) updateSettings(updated);
```

**Skipping (d) is the single most common way this task fails.** Without it the toggle appears to work and silently resets on reload.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run utils/settingsStorage.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the toggle UI**

In `components/settings/AssistantSection.tsx`, add a toggle bound to `autoTagEnabled` using `handleSettingsChange('autoTagEnabled', value)`. Copy the markup and class names from an existing boolean toggle in that same file so the styling matches. Label it **"Gallery auto-tagging"** with helper text: *"Suggest tags from image content. Uses a vision model — costs tokens on cloud providers."*

- [ ] **Step 6: Verify persistence by hand**

Run `pnpm dev`, open Settings, enable the toggle, hard-reload the page, and confirm it is still on. This is required by `AI_WORKER_RULES.md:44` and cannot be verified by the unit test alone.

- [ ] **Step 7: Commit**

```bash
git add types.ts utils/settingsStorage.ts utils/settingsStorage.test.ts components/SetupPage.tsx components/settings/AssistantSection.tsx
git commit -m "feat(auto-tag): add autoTagEnabled setting with persistence"
```

---

## Task 7: Orchestrate suggestion for a gallery item

**Files:**
- Modify: `services/autoTagService.ts`
- Test: `services/autoTagService.test.ts`

**Interfaces:**
- Consumes: `suggestTagsRaw` (Task 5), `getActiveFileManager` (`utils/fileUtils.ts:1426`), `fileToBase64` (`utils/fileUtils.ts:1432`), `parseTagResponse` + `normalizeTags` (Tasks 1-2).
- Produces: `suggestTagsForItem(item: GalleryItem, settings: LLMSettings): Promise<string[]>`

- [ ] **Step 1: Write the failing test**

Append to `services/autoTagService.test.ts`:

```ts
import { vi } from 'vitest';
import type { GalleryItem, LLMSettings } from '../types';

vi.mock('./llmService', () => ({ suggestTagsRaw: vi.fn(async () => 'sunset, landscape') }));
vi.mock('../utils/fileUtils', () => ({
  getActiveFileManager: () => ({ getFileAsBlob: vi.fn(async () => new Blob(['x'])) }),
  fileToBase64: vi.fn(async () => 'ZmFrZQ=='),
}));

const makeItem = (overrides: Partial<GalleryItem> = {}): GalleryItem => ({
  id: 'item-1',
  createdAt: 0,
  type: 'image',
  urls: ['gallery/test.png'],
  sources: ['AI Generation'],
  title: 'Test',
  ...overrides,
});

const enabled = { autoTagEnabled: true, activeLLM: 'gemini' } as LLMSettings;

describe('suggestTagsForItem', () => {
  it('returns normalized suggestions for an image', async () => {
    const { suggestTagsForItem } = await import('./autoTagService');
    await expect(suggestTagsForItem(makeItem(), enabled)).resolves.toEqual(['sunset', 'landscape']);
  });

  it('excludes tags the item already has', async () => {
    const { suggestTagsForItem } = await import('./autoTagService');
    const item = makeItem({ tags: ['Sunset'] });
    await expect(suggestTagsForItem(item, enabled)).resolves.toEqual(['landscape']);
  });

  it('rejects when the feature is disabled', async () => {
    const { suggestTagsForItem } = await import('./autoTagService');
    const off = { autoTagEnabled: false, activeLLM: 'gemini' } as LLMSettings;
    await expect(suggestTagsForItem(makeItem(), off)).rejects.toThrow(/disabled/i);
  });

  it('rejects for a video item', async () => {
    const { suggestTagsForItem } = await import('./autoTagService');
    await expect(suggestTagsForItem(makeItem({ type: 'video' }), enabled)).rejects.toThrow(/image/i);
  });

  it('rejects when the item has no file path', async () => {
    const { suggestTagsForItem } = await import('./autoTagService');
    await expect(suggestTagsForItem(makeItem({ urls: [] }), enabled)).rejects.toThrow(/no image file/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run services/autoTagService.test.ts`
Expected: FAIL — `suggestTagsForItem is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Append to `services/autoTagService.ts`:

```ts
import type { GalleryItem, LLMSettings } from '../types';
import { suggestTagsRaw } from './llmService';
import { getActiveFileManager, fileToBase64 } from '../utils/fileUtils';

/**
 * Suggest tags for one gallery image. Returns candidates only — the caller
 * decides what to accept. Never writes.
 *
 * ProviderUnsupportedError from the dispatcher propagates untouched: a
 * provider without vision is a configuration choice to surface, not a
 * transient failure to route around.
 */
export async function suggestTagsForItem(item: GalleryItem, settings: LLMSettings): Promise<string[]> {
  if (!settings.autoTagEnabled) {
    throw new Error('Auto-tagging is disabled. Enable it in Settings > Integrations > Assistant.');
  }
  if (item.type !== 'image') {
    throw new Error('Tag suggestion supports image items only.');
  }
  const path = item.urls[0];
  if (!path) {
    throw new Error('This item has no image file to analyse.');
  }
  const blob = await getActiveFileManager().getFileAsBlob(path);
  if (!blob) {
    throw new Error(`Image file not found in the vault: ${path}`);
  }
  const base64 = await fileToBase64(blob, true);
  const raw = await suggestTagsRaw(base64, item.prompt || '', settings);
  return normalizeTags(parseTagResponse(raw), item.tags || []);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run services/autoTagService.test.ts`
Expected: PASS — 20 tests total.

- [ ] **Step 5: Commit**

```bash
git add services/autoTagService.ts services/autoTagService.test.ts
git commit -m "feat(auto-tag): orchestrate tag suggestion for a gallery item"
```

---

## Task 8: Apply accepted tags

**Files:**
- Modify: `services/autoTagService.ts`
- Test: `services/autoTagService.test.ts`

**Interfaces:**
- Consumes: `updateItemInGallery` (`utils/galleryStorage.ts:230`), `normalizeTags` (Task 2).
- Produces: `applyTagsToItem(item: GalleryItem, accepted: string[]): Promise<string[]>` — returns the item's full new tag list.

**This task carries acceptance criterion 2:** rejecting every suggestion must leave `item.tags` byte-identical, which means **no write call at all**.

- [ ] **Step 1: Write the failing test**

Append to `services/autoTagService.test.ts`. Add this mock alongside the others at the top of the file:

```ts
const { updateItemInGallery } = vi.hoisted(() => ({
  updateItemInGallery: vi.fn(async () => {}),
}));
vi.mock('../utils/galleryStorage', () => ({ updateItemInGallery }));
```

> **`vi.hoisted` is required here, not stylistic.** `vi.mock` calls are hoisted above every `const` in the module. A plain `const updateItemInGallery = vi.fn()` referenced inside the factory fails at runtime with *"Cannot access 'updateItemInGallery' before initialization"*, because the factory runs before the binding is initialized. The other mocks in this file use inline factories with no outer references, so they do not need this.

Then the tests:

```ts
describe('applyTagsToItem', () => {
  beforeEach(() => updateItemInGallery.mockClear());

  it('appends accepted tags to the existing list', async () => {
    const { applyTagsToItem } = await import('./autoTagService');
    const item = makeItem({ tags: ['existing'] });
    await expect(applyTagsToItem(item, ['sunset'])).resolves.toEqual(['existing', 'sunset']);
    expect(updateItemInGallery).toHaveBeenCalledWith('item-1', { tags: ['existing', 'sunset'] });
  });

  it('writes nothing when nothing is accepted', async () => {
    const { applyTagsToItem } = await import('./autoTagService');
    const item = makeItem({ tags: ['existing'] });
    await expect(applyTagsToItem(item, [])).resolves.toEqual(['existing']);
    expect(updateItemInGallery).not.toHaveBeenCalled();
  });

  it('writes nothing when every accepted tag is already present', async () => {
    const { applyTagsToItem } = await import('./autoTagService');
    const item = makeItem({ tags: ['sunset'] });
    await expect(applyTagsToItem(item, ['Sunset'])).resolves.toEqual(['sunset']);
    expect(updateItemInGallery).not.toHaveBeenCalled();
  });

  it('works on an item with no tags yet', async () => {
    const { applyTagsToItem } = await import('./autoTagService');
    await expect(applyTagsToItem(makeItem(), ['sunset'])).resolves.toEqual(['sunset']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run services/autoTagService.test.ts`
Expected: FAIL — `applyTagsToItem is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Add the import at the top of `services/autoTagService.ts`:

```ts
import { updateItemInGallery } from '../utils/galleryStorage';
```

Then append:

```ts
/**
 * Persist the tags the user accepted. Returns the item's full new tag list.
 * Writes nothing when the accepted set adds nothing — a rejected suggestion
 * must leave the stored item untouched.
 */
export async function applyTagsToItem(item: GalleryItem, accepted: string[]): Promise<string[]> {
  const current = item.tags || [];
  const additions = normalizeTags(accepted, current);
  if (additions.length === 0) return current;
  const next = [...current, ...additions];
  await updateItemInGallery(item.id, { tags: next });
  return next;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run services/autoTagService.test.ts`
Expected: PASS — 24 tests total.

- [ ] **Step 5: Commit**

```bash
git add services/autoTagService.ts services/autoTagService.test.ts
git commit -m "feat(auto-tag): persist accepted tags without writing on reject"
```

---

## Task 9: Suggestion UI in the item detail view

**Files:**
- Modify: `components/ItemDetailView.tsx` — the tags block at lines 666-676
- Test: `components/ItemDetailView.autoTag.test.tsx` (create)

**Interfaces:**
- Consumes: `suggestTagsForItem`, `applyTagsToItem` (Tasks 7-8).
- Produces: no exported API. UI only.

**Behaviour:**
1. When `settings.autoTagEnabled` is true, render a **Suggest tags** button in the Tags row. The row currently renders only when `tags.length > 0` (line 666) — it must now also render when the feature is on and the item has no tags yet, otherwise untagged items (the ones that need this most) get no button.
2. While loading, the button shows a busy state and is disabled.
3. Suggestions render as toggleable chips, all **unselected** by default. Opt-in, not opt-out.
4. An **Apply** button calls `applyTagsToItem` with only the selected chips.
5. On error, render the error's `message` verbatim. `ProviderUnsupportedError`'s message already names the supported providers and tells the user where to switch.

- [ ] **Step 1: Write the failing test**

Create `components/ItemDetailView.autoTag.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TagSuggestionRow } from './ItemDetailView';
import type { GalleryItem, LLMSettings } from '../types';

vi.mock('../services/autoTagService', () => ({
  suggestTagsForItem: vi.fn(async () => ['sunset', 'landscape']),
  applyTagsToItem: vi.fn(async () => ['sunset']),
}));

const item: GalleryItem = {
  id: 'item-1', createdAt: 0, type: 'image',
  urls: ['gallery/test.png'], sources: [], title: 'Test',
};
const settings = { autoTagEnabled: true, activeLLM: 'gemini' } as LLMSettings;

describe('TagSuggestionRow', () => {
  it('renders the suggest button when the feature is enabled', () => {
    render(<TagSuggestionRow item={item} settings={settings} onTagsChanged={() => {}} />);
    expect(screen.getByText(/suggest tags/i)).toBeTruthy();
  });

  it('renders nothing when the feature is disabled', () => {
    const off = { ...settings, autoTagEnabled: false };
    const { container } = render(<TagSuggestionRow item={item} settings={off} onTagsChanged={() => {}} />);
    expect(container.textContent).not.toMatch(/suggest tags/i);
  });

  it('shows suggestions after clicking suggest', async () => {
    render(<TagSuggestionRow item={item} settings={settings} onTagsChanged={() => {}} />);
    fireEvent.click(screen.getByText(/suggest tags/i));
    await waitFor(() => expect(screen.getByText('sunset')).toBeTruthy());
    expect(screen.getByText('landscape')).toBeTruthy();
  });

  it('surfaces the error message when suggestion fails', async () => {
    const { suggestTagsForItem } = await import('../services/autoTagService');
    (suggestTagsForItem as any).mockRejectedValueOnce(new Error('Tag suggestion is not available with the anthropic engine'));
    render(<TagSuggestionRow item={item} settings={settings} onTagsChanged={() => {}} />);
    fireEvent.click(screen.getByText(/suggest tags/i));
    await waitFor(() => expect(screen.getByText(/not available with the anthropic engine/i)).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run components/ItemDetailView.autoTag.test.tsx`
Expected: FAIL — `TagSuggestionRow` is not exported.

- [ ] **Step 3: Implement `TagSuggestionRow`**

Add to `components/ItemDetailView.tsx` as a named export, then render it inside the Tags `InfoRow`. Match the surrounding Tailwind class strings — reuse `form-btn wildcard-tag-btn h-auto px-2 py-0.5 lowercase tracking-tight` from line 670 for the chips.

```tsx
export const TagSuggestionRow: React.FC<{
  item: GalleryItem;
  settings: LLMSettings;
  onTagsChanged: (tags: string[]) => void;
}> = ({ item, settings, onTagsChanged }) => {
  const [suggestions, setSuggestions] = React.useState<string[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!settings.autoTagEnabled) return null;

  const runSuggest = async () => {
    setBusy(true); setError(null); setSuggestions([]); setSelected(new Set());
    try {
      const { suggestTagsForItem } = await import('../services/autoTagService');
      setSuggestions(await suggestTagsForItem(item, settings));
    } catch (e: any) {
      setError(e?.message || 'Tag suggestion failed.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (tag: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(tag) ? next.delete(tag) : next.add(tag);
    return next;
  });

  const apply = async () => {
    const { applyTagsToItem } = await import('../services/autoTagService');
    onTagsChanged(await applyTagsToItem(item, [...selected]));
    setSuggestions([]); setSelected(new Set());
  };

  return (
    <div className="mt-2 space-y-2">
      <button className="form-btn h-auto px-2 py-0.5 text-xs" onClick={runSuggest} disabled={busy}>
        {busy ? 'Analysing…' : 'Suggest tags'}
      </button>
      {error && <p className="text-xs text-error/80">{error}</p>}
      {suggestions.length > 0 && (
        <>
          <div className="flex flex-wrap gap-1">
            {suggestions.map(tag => (
              <button
                key={tag}
                onClick={() => toggle(tag)}
                className={`form-btn wildcard-tag-btn h-auto px-2 py-0.5 lowercase tracking-tight transition-colors ${
                  selected.has(tag) ? 'bg-primary/20 text-primary border-primary/40' : 'bg-white/5 border-white/10'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
          <button className="form-btn h-auto px-2 py-0.5 text-xs" onClick={apply} disabled={selected.size === 0}>
            Apply {selected.size} tag{selected.size === 1 ? '' : 's'}
          </button>
        </>
      )}
    </div>
  );
};
```

Then change the Tags row guard at line 666 from `{tags.length > 0 && (` to `{(tags.length > 0 || settings.autoTagEnabled) && (` and render `<TagSuggestionRow … />` inside that `InfoRow`, below the existing chip list.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run components/ItemDetailView.autoTag.test.tsx`
Expected: PASS — 4 tests.

- [ ] **Step 5: Verify in the running app**

Run `pnpm dev`, enable the toggle, open an untagged gallery image, click **Suggest tags**, select one, apply, then hard-reload and confirm the tag persisted.

- [ ] **Step 6: Commit**

```bash
git add components/ItemDetailView.tsx components/ItemDetailView.autoTag.test.tsx
git commit -m "feat(auto-tag): add suggest/accept UI to item detail view"
```

---

## Task 10: Correct the roadmap claim

**Files:**
- Modify: `docs/handbook/docs/00_FOUNDATION/ARCHITECTURE_CONSTITUTION.md:205`
- Modify: `docs/ISSUES.md`

**Why this is a task and not a footnote:** line 205 currently marks auto-tagging, similarity clustering, and visual search as shipped in Phase 2. Verified on 2026-07-28: none of the three existed. `utils/galleryAnalytics.ts` exports only `computeGalleryStats`; greps for `autoTag`/`suggestTags`/`generateTags` and for `cosine`/`embedding`/`findSimilar`/`clusterItems` return nothing relevant. Leaving the line intact would let the next audit re-derive the same false conclusion.

- [ ] **Step 1: Correct the constitution**

Replace line 205 with:

```markdown
- [x] Gallery intelligence: auto-tagging (shipped 2026-07-28, Phase 1 of the capability expansion roadmap — `services/autoTagService.ts`)
- [ ] Gallery intelligence: similarity clustering and visual search — **claimed complete in error.** A 2026-07-28 audit found no implementation for either. Both depend on embeddings; revisit after semantic vault search lands (Phase 5). See ISSUE-46.
```

- [ ] **Step 2: Log the correction in the issue tracker**

Add to `docs/ISSUES.md` under the changelog, matching the existing entry format:

```markdown
### ISSUE-46 — Phase 2 "gallery intelligence" was partly unimplemented

**Severity:** Low (documentation accuracy)

`ARCHITECTURE_CONSTITUTION.md:205` marked auto-tagging, similarity clustering,
and visual search as shipped. A 2026-07-28 audit found no implementation for any
of the three: `utils/galleryAnalytics.ts` exported only `computeGalleryStats`,
and greps for `autoTag`/`suggestTags`/`generateTags` and
`cosine`/`embedding`/`findSimilar`/`clusterItems` returned nothing relevant.

This is the third case of this pattern, after ISSUE-31 (`relationshipGraph`
built but disconnected) and ISSUE-32 (`providerRouter` a stub marked done).

**Resolution:** auto-tagging implemented 2026-07-28. Clustering and visual
search re-opened as unshipped; both depend on embeddings and are deferred to
after Phase 5 (semantic vault search).
```

- [ ] **Step 3: Commit**

```bash
git add docs/handbook/docs/00_FOUNDATION/ARCHITECTURE_CONSTITUTION.md docs/ISSUES.md
git commit -m "docs: correct Phase 2 gallery-intelligence claim (ISSUE-46)"
```

---

## Final Verification

- [ ] **Full gate:** `pnpm lint && pnpm test` — clean and green.
- [ ] **Clean-build safe:** `pnpm build` succeeds.
- [ ] **No scratch files staged:** `git status` shows nothing stray, no `*.bak`.
- [ ] **Acceptance criteria walk-through**, from the roadmap's Phase 1 section:
  1. An untagged image produces at least one relevant suggestion within 10s on the default provider.
  2. Rejecting a suggestion leaves `item.tags` unchanged — covered by Task 8's "writes nothing" tests.
  3. Accepting persists and survives a reload — Task 9 Step 5.
  4. With `autoTagEnabled: false`, no vision call is made — verified by the network tab and Task 7's disabled test.
  5. A non-vision provider shows its own error message with no partial write — Task 5 test 3 and Task 9 test 4.
  6. `ARCHITECTURE_CONSTITUTION.md:205` no longer claims unshipped work — Task 10.
  7. `pnpm lint` clean, `pnpm test` green.

## Out of Scope

- Similarity clustering and visual search. Both need embeddings (Phase 5). Task 10 marks them open rather than shipping them.
- Tag taxonomy or hierarchy. `GalleryItem.tags` is `string[]`; keep it flat.
- Auto-tagging on ingest. Every suggestion stays user-initiated.
- Batch multi-select tagging. Ship the single-item path, learn whether batching is actually wanted, then decide.
- Canonicalizing suggestions against the vault's existing tag vocabulary (mapping a suggested `scifi` onto an already-used `sci-fi`). This needs fuzzy matching with plural and hyphen handling, which is a materially larger problem than the exact-match dedupe in Task 2, and it is much easier to tune once real suggestions exist to look at.

**Both of the above were listed in the roadmap's Phase 1 scope and are deliberately deferred here** to keep the first slice reviewable. `docs/plans/2026-07-28-capability-expansion-roadmap.md` has been amended so the two documents agree — if you are reading only one of them, they do not disagree.
