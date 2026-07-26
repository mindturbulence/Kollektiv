> **Superseded.** The Notes and Web tabs described below were later merged into one "Assistant
> Notes" tab, and web results now auto-save to the panel instead of requiring an explicit
> `send_to_web_panel` call. See `docs/handbook/docs/01_AI_ENGINE/AI_ENGINE.md` (Web tools section)
> and `docs/handbook/docs/00_FOUNDATION/ARCHITECTURE_CONSTITUTION.md` (Global overlay panels) for
> current behavior. Kept here for history on why the original 4-tab, markdown-only Web tab design
> was chosen.

# Plan: All‑Purpose Panel (Clip + Notes + Web + Files)

**Goal**: Merge the existing Clipping Panel, Notes Panel, Files Panel and WebViewer Panel into a single unified panel with four tabs (Clips, Notes, Files, Web). The **Web tab displays web search/scrape/fetch results as formatted Markdown** — **no URL bar, no iframe, no embedded browser**. The assistant's `web_search`, `fetch_url`, `scrape_url`, `scrape_url_playwright` tools are the default; Google (Gemini) is only a last‑resort fallback.

---

## Detailed Task Breakdown

### 1. Repository & Branch Setup
- [ ] `git checkout -b feature/all-purpose-panel`
- [ ] Verify `pnpm install` passes; run `pnpm lint` and `pnpm test` as baseline.

---

### 2. Type & State Extensions (`components/ClippingPanel.tsx`)
- [ ] Extend `PanelTab` union: `'clips' | 'notes' | 'files' | 'web'`.
- [ ] Add **Web tab state**:
  ```ts
  const [webResults, setWebResults] = useState<WebResult[]>([]);
  const [webLoading, setWebLoading] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);
  ```
  where `WebResult = { title: string; url: string; markdown: string; source: 'search' | 'fetch' | 'scrape' | 'playwright'; timestamp: number; }`.
- [ ] Add **event subscription** for `webSearchResults` (emitted by assistant tools) to populate `webResults`.

---

### 3. Header — Add Web Tab Button
- [ ] Insert a **Globe icon button** between "Notes" and "Files" tabs.
- [ ] Tab label: `Web [{webResults.length}]`.
- [ ] Active state styling consistent with existing tabs (`bg-primary/20 text-primary`).

---

### 4. Web Tab Renderer (no iframe, no address bar)
Create a **`WebTabContent`** component (inside `ClippingPanel.tsx` or extracted to `components/WebTabContent.tsx`):

**UI Structure**
```
┌─────────────────────────────────────────────┐
│  [Web]  Results: 3   [Clear]                │  ← toolbar
├─────────────────────────────────────────────┤
│  ▼ Result 1 — search  2m ago                │  ← collapsible card
│  ────────────────────────────────────────  │
│  # Title from page                          │
│                                             │
│  **Source:** https://example.com/article    │
│  **Engine:** duckduckgo                     │
│                                             │
│  Extracted markdown content…                │
│  (rendered via `prose prose-sm` styles)     │
├─────────────────────────────────────────────┤
│  ▼ Result 2 — scrape  5m ago                │
│  …                                           │
└─────────────────────────────────────────────┘
```

**Features**
- [ ] **Collapsible cards** (default open) — each result shows title, source URL, engine/tool, timestamp.
- [ ] **Markdown rendering** — use existing `prose` Tailwind typography (`prose-invert` for dark mode).
- [ ] **Copy button** per result (copies markdown to clipboard).
- [ ] **Save as Note** button → emits `clipIdea` with the markdown.
- [ ] **Save to Vault** button → writes `assistant/web-<timestamp>.md` via `fileSystemManager`.
- [ ] **Clear all** button in toolbar → `setWebResults([])`.
- [ ] **Loading skeleton** while `webLoading` true.
- [ ] **Error banner** if `webError` set.

---

### 5. Assistant Tool Contract Updates (`services/assistantTools.ts`)

| Tool | Change |
|------|--------|
| `web_search` | **Primary** search tool. Keep existing implementation (DuckDuckGo + Brave + Exa). **Add JSDoc comment**: `"DEFAULT web search. Falls back to Google (Gemini) ONLY when free engines return zero results."` |
| `fetch_url` | Keep — returns readable text (~8k chars). Used for quick reads. |
| `scrape_url` | Keep — returns full article markdown via readability (≤50k). |
| `scrape_url_playwright` | Keep — JS-heavy pages. |
| `open_web_page` | **Deprecate / repurpose**: instead of opening an iframe, **emit `webSearchResults`** with a single `fetch_url` result so the Web tab shows the content. **Remove** the `openWebPage` event bus emission. |
| *(optional)* `google_search` | Thin wrapper that calls the Gemini fallback directly. Document: `"LAST RESORT — only when web_search returns empty."` |

**Implementation notes**
- Each tool (`web_search`, `fetch_url`, `scrape_url`, `scrape_url_playwright`) **after successful execution** emits:
  ```ts
  appEventBus.emit('webSearchResults', [{
    title: data.title || url,
    url,
    markdown: data.content || data.text || JSON.stringify(data),
    source: 'search' | 'fetch' | 'scrape' | 'playwright',
    timestamp: Date.now(),
  }]);
  ```
- `web_search` already returns `{ results, fetchedContent }` — map each `fetchedContent` item + each result snippet to the above shape.

---

### 6. ClippingPanel — Subscribe to `webSearchResults`
- [ ] In `useEffect` (mounted once):
  ```ts
  appEventBus.on('webSearchResults', (newResults: WebResult[]) => {
    setWebResults(prev => [...newResults, ...prev].slice(0, 50)); // keep last 50
    setWebLoading(false);
    setWebError(null);
    // Auto-switch tab if not already on Web
    if (tab !== 'web') setTab('web');
  });
  ```
- [ ] Also listen for `webSearchError` → `setWebError(msg)`.

---

### 7. Remove Legacy WebViewerPanel
- [ ] Delete `components/WebViewerPanel.tsx` (no longer used).
- [ ] Remove its import/usage from `App.tsx` / `AssistantPage.tsx`.
- [ ] Clean up any `openWebPage` event emissions in the codebase (grep for `openWebPage`).

---

### 8. Styling & Polish
- [ ] Ensure **dark/light mode** works for markdown (`prose-invert`).
- [ ] Add **scroll shadow** at bottom of results list.
- [ ] **Keyboard accessibility**: arrow keys navigate cards, `Enter` toggles collapse.
- [ ] **Responsive**: on mobile (<640px) stack toolbar buttons.

---

### 9. Tests
- [ ] **Unit**: `WebTabContent.test.tsx` — renders results, collapses/expands, copy/save buttons call correct events.
- [ ] **Integration**: `ClippingPanel.integration.test.tsx` — simulate `webSearchResults` event, verify Web tab shows results, count badge updates.
- [ ] **Tool contract**: `assistantTools.web_search.test.ts` — verifies `webSearchResults` event emitted with correct shape.
- [ ] Run full suite: `pnpm test`.

---

### 10. Lint & Type‑Check
- [ ] `pnpm lint` (tsc --noEmit + eslint) — zero errors.

---

### 11. Documentation
- [ ] Update `docs/handbook/docs/01_AI_ENGINE/AI_ENGINE.md` — note `web_search` is default; Google is fallback.
- [ ] Add a short **All‑Purpose Panel** section in `README.md` or `docs/handbook/docs/02_CAPABILITY_PLATFORM/`.
- [ ] Record ADR in `docs/handbook/docs/ADR/000X-all-purpose-panel.md`.

---

### 12. Commit Strategy (Conventional Commits)
| Commit | Scope |
|--------|-------|
| `feat(panel): add web tab type and header button` | types + header |
| `feat(panel): implement WebTabContent with markdown results` | web tab UI |
| `refactor(tools): emit webSearchResults from web_search/fetch_url/scrape_url` | tool contracts |
| `refactor(tools): deprecate open_web_page iframe behavior` | tool contract |
| `test(panel): add WebTabContent and integration tests` | tests |
| `chore: remove WebViewerPanel component` | cleanup |
| `docs: update AI_ENGINE.md and add ADR` | docs |

---

### 13. Push & PR
- [ ] `git push origin feature/all-purpose-panel`
- [ ] Open PR with description linking this plan.

---

## Acceptance Criteria (Definition of Done)
1. **Four tabs** (Clips, Notes, Files, Web) — smooth GSAP slide, badge counts update.
2. **Web tab** shows **only** markdown-rendered results from `web_search`, `fetch_url`, `scrape_url`, `scrape_url_playwright`.
3. **No URL bar, no iframe, no embedded browser**.
4. Assistant **defaults to `web_search`**; Google (Gemini) used **only when free engines return zero results** (documented in tool JSDoc).
5. Each result card: collapsible, copy markdown, save as note, save to vault.
6. All tests pass (`pnpm test`), lint clean (`pnpm lint`).
7. Documentation updated; ADR recorded.

---

**Owner**: *[Your Name]*  
**Target Sprint**: Sprint 5 (2024‑07‑26 → 2024‑08‑09)  
**Plan File**: `docs/plans/2024-07-25-all-purpose-panel.md`