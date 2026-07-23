# Research Panel — Implementation Plan (revised)

## Overview

Evolve the existing chat panel into a dual-mode panel: **Chat** (existing behavior, unchanged) and **Research** (NotebookLM-style project-based research with pinned sources, citations, and findings).

**Architecture approach**: Event-driven (Design 2 from interface analysis). A `ResearchContext` + `useResearchProject` hook owns all state and I/O; UI components are pure presenters that consume the context. Cross-cutting communication uses `appEventBus`.

---

## 1. Project Storage — seam & depth

### 1.1 Location

Research projects live as a subdirectory inside the **already-selected app data directory** (the same directory the user chose during setup). No new path configuration, no new settings field. The seam is `fileSystemManager` — the same singleton that handles all other file I/O (local File System Access or Google Drive).

```
<app-data-dir>/
└── research-projects/
    └── <project-slug>/
        ├── sources/
        │   ├── example-note.md
        │   ├── web-capture-2024-01-01.md
        │   └── ...
        ├── chat.json
        └── findings.md
```

The `research-projects/` directory is created automatically on first use. No setup required.

### 1.2 File Formats

**`chat.json`** — conversation history for the project:
```json
{
  "title": "Q3 Market Analysis",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-15T12:00:00.000Z",
  "messages": [
    {
      "role": "user" | "assistant" | "system",
      "content": "message text with markdown",
      "timestamp": "2024-01-15T12:00:00.000Z",
      "citations": [
        { "index": 1, "fileName": "quarterly-notes.md", "title": "Quarterly Notes" },
        { "index": 2, "fileName": "competitor-analysis.md", "title": "Competitor Analysis" }
      ]
    }
  ],
  "sourceFiles": [
    { "path": "sources/quarterly-notes.md", "title": "Quarterly Notes", "addedAt": "..." },
    { "path": "sources/competitor-analysis.md", "title": "Competitor Analysis", "addedAt": "..." }
  ]
}
```

The `citations` field is optional (user messages have none). Citations are stored as structured data, not parsed from the LLM's output text. The LLM still writes `[1]` inline, but the citation metadata is stored separately so re-rendering is deterministic.

### Key shared types

```typescript
type SourceInput =
  | { kind: 'url'; value: string }
  | { kind: 'vault-file'; vaultPath: string }
  | { kind: 'upload'; file: File; fileName: string };

interface SourceContext {
  title: string;
  content: string; // May contain truncation suffix if >4KB; do NOT parse this suffix
}

interface Citation {
  index: number;
  fileName: string;
  title: string;
}
```

**`findings.md`** — plain markdown, editable. The assistant appends to it via `append_findings` tool, the user edits it manually in the Findings panel.

**`projects-index.json`** — lightweight index for fast listing (saved at `research-projects/projects-index.json`):
```json
[
  {
    "slug": "q3-market-analysis",
    "title": "Q3 Market Analysis",
    "createdAt": "...",
    "updatedAt": "...",
    "sourceCount": 3,
    "messageCount": 24
  }
]
```

### 1.3 Module: `researchVault` (9 methods, 3 groups)

File: `services/researchVaultService.ts`

#### Error contract

All methods throw `ResearchVaultError` on failure. Callers never need to guess error shapes.

```typescript
class ResearchVaultError extends Error {
  constructor(
    public code: 'INIT_FAILED' | 'NOT_FOUND' | 'ALREADY_EXISTS' | 'IO_ERROR' | 'FETCH_FAILED',
    message: string
  ) { super(message); }
}
```

| Code | When thrown |
|------|-------------|
| `INIT_FAILED` | `fileSystemManager` not initialized |
| `NOT_FOUND` | Project or source file doesn't exist |
| `ALREADY_EXISTS` | Project slug or source file already exists and overwrite not allowed |
| `IO_ERROR` | Filesystem read/write failure (permissions, quota) |
| `FETCH_FAILED` | URL source fetch returned non-2xx or network error |

#### Interface

```typescript
export const researchVault = {
  projects: {
    list(): Promise<ProjectSummary[]>,
    open(slug: string): Promise<ResearchProject>,
    create(title: string): Promise<string>,
    save(slug: string, data: ResearchProject): Promise<void>,
    delete(slug: string): Promise<void>,
  },
  sources: {
    add(slug: string, input: SourceInput): Promise<void>,
    remove(slug: string, fileName: string): Promise<void>,
    readContent(slug: string, fileName: string): Promise<string>,
  },
  findings: {
    load(slug: string): Promise<string>,
    append(slug: string, text: string): Promise<void>,
  },
};
```

**Depth analysis**: 9 methods across 3 groups. Each group hides path construction, index updates, and error handling behind a narrow parameter set. The `sources.add` method alone hides 3 different acquisition strategies (vault copy, URL capture, file upload).

**Dependency**: Accepts `fileSystemManager` as a dependency (already a module-level singleton — tests mock through the `IFileSystemManager` interface).

---

## 2. State Layer — `ResearchContext` + `useResearchProject` hook

### 2.1 ResearchContext

File: `contexts/ResearchContext.tsx`

Provides shared state to all research sub-components without prop drilling through `LLMChatPanel.tsx`.

```typescript
interface ResearchContextValue {
  // Mode
  mode: 'chat' | 'research';
  setMode: (m: 'chat' | 'research') => void;

  // Active project
  projectSlug: string | null;
  project: ResearchProject | null;
  isProjectLoading: boolean;
  openProject: (slug: string) => Promise<void>;
  closeProject: () => void;

  // Sources
  sources: SourceFile[];
  addSource: (input: SourceInput) => Promise<{ ok: true } | { ok: false; error: string }>;
  removeSource: (fileName: string) => Promise<void>;
  isAddingSource: boolean; // true while addSource is in-flight

  // Messages
  messages: ChatMessage[];
  sendMessage: (text: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  isProcessing: boolean;

  // Findings
  findings: string;
  saveFindings: (text: string) => Promise<void>;

  // Errors — components show these how they want
  error: string | null;
  clearError: () => void;
}

const ResearchContext = createContext<ResearchContextValue | null>(null);
export const useResearch = () => useContext(ResearchContext)!;
```

**Depth**: 18 values/methods — but the context is never passed manually. Components just call `useResearch()` and get only what they need. The context implementation delegates to the hook below.

### 2.2 `useResearchProject` hook

File: `hooks/useResearchProject.ts`

Owns ALL async I/O, auto-save, and state transitions. Components never call `researchVault` directly.

```typescript
const useResearchProject = (fileManager: IFileSystemManager): ResearchContextValue => {
  const [mode, setMode] = useState<'chat' | 'research'>('chat');
  const [projectSlug, setProjectSlug] = useState<string | null>(null);
  const [project, setProject] = useState<ResearchProject | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sources, setSources] = useState<SourceFile[]>([]);
  const [findings, setFindings] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isProjectLoading, setIsProjectLoading] = useState(false);
  const [isAddingSource, setIsAddingSource] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // Autosave chat.json whenever messages change
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!projectSlug || messages.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      researchVault.projects.save(projectSlug, { ...project, messages, sourceFiles: sources });
    }, 2000); // debounce 2s
  }, [messages, projectSlug]);

  // Open project — reads chat.json + sources + findings
  const openProject = useCallback(async (slug: string) => {
    setIsProjectLoading(true);
    const p = await researchVault.projects.open(slug);
    const srcs = p.sourceFiles.map(f => ({ path: f.path, title: f.title }));
    const fnd = await researchVault.findings.load(slug);
    setProject(p);
    setMessages(p.messages || []);
    setSources(srcs);
    setFindings(fnd);
    setProjectSlug(slug);
    setIsProjectLoading(false);
    appEventBus.emit('research:projectOpened', { slug });
  }, []);

  // Send message — injects source context into system prompt
  const sendMessage = useCallback(async (text: string): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (!projectSlug) return { ok: false, error: 'No active project.' };
    if (!text.trim()) return { ok: false, error: 'Message is empty.' };
    if (isProcessing) return { ok: false, error: 'Already processing.' };

    setIsProcessing(true);
    setError(null);
    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);

    try {
      // Read source contents for context
      const sourceContext = await Promise.all(
        sources.map(async (s) => ({
          title: s.title,
          content: await researchVault.sources.readContent(projectSlug, s.path),
        }))
      );

      // Build system identity with sources
      const sysPrompt = buildSystemIdentity(settings, sourceContext);

      // Run assistant turn
      const augmentedMessages = [
        { role: 'system', content: sysPrompt },
        ...messages.filter(m => m.role !== 'system'),
        userMsg,
      ];

      let assistantText = '';
      for await (const event of runAssistantTurn(augmentedMessages, settings)) {
        if (event.type === 'text') assistantText += event.text;
      }

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: assistantText,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      setIsProcessing(false);
      return { ok: true };
    } catch (e) {
      const msg = e instanceof ResearchVaultError ? e.message : 'Failed to send message.';
      setError(msg);
      // Remove the optimistically-added user message on failure
      setMessages(prev => prev.filter(m => m !== userMsg));
      setIsProcessing(false);
      return { ok: false, error: msg };
    }
  }, [projectSlug, sources, messages, isProcessing, settings]);

  // ... similar for addSource (returns result, sets error on failure),
  //     removeSource, saveFindings
};

**Error handling in `sendMessage`**: Returns a result discriminated union instead of throwing. The UI can show toast/notification based on `{ ok: false, error }`. The optimistic user message is reverted on failure — the user doesn't see a phantom message.

**Error handling in `addSource`**: Same pattern — returns `{ ok: true } | { ok: false, error: string }`. Sets `isAddingSource = true` during fetch/copy.
```

**Depth**: This hook hides all of: file I/O calls, source context assembly, system prompt injection, auto-save debounce, citation formatting, and error handling. Components just call `sendMessage(text)`.

### 2.3 Event types

Added to `utils/eventBus.ts`:
```
// Research panel events — fire on success only
'research:projectOpened'     { slug: string }
'research:projectClosed'     {}
'research:sourceAdded'       { slug: string; fileName: string }
'research:sourceRemoved'     { slug: string; fileName: string }
'research:findingsAppended'  { slug: string }
```

Error events are intentionally omitted. Errors propagate through the hook's `error` state and are surfaced in the UI through the context. This avoids a second error-handling path via events that would create the Hyrum's Law risk of components depending on both event-based and state-based error handling.

These events are consumed by `assistantTools.ts` to know the active project for `append_findings` and `expand_source`.

---

## 3. UI Components — Pure presenters

All components consume `ResearchContext`. They receive zero async logic, zero file I/O. Each is independently testable.

### 3.1 Mode Toggle

In `components/LLMChatPanel.tsx` header bar:

```
[💬 Chat]  [🔬 Research]
```

Wired to `useResearch().mode` / `useResearch().setMode()`.

### 3.2 Research Layout (Three-Panel)

When `mode === 'research'`, the panel expands to full width and renders three columns:

```
┌─────────────────────────────────────────────────────────────┐
│ Header: [💬 Chat] [🔬 Research]  │  project-name  │  X     │
├──────────┬──────────────────────────────────┬───────────────┤
│ Sources  │     Conversation                 │  Findings     │
│ Panel    │     (existing chat component)    │  Panel        │
│          │                                  │               │
│ 📁 files │  messages with [1][2] citations  │  findings.md  │
│ [Add +]  │                                  │  content      │
│          │  ┌──────────────────────┐        │  (markdown)   │
│          │  │ Type a message...    │        │  [Save]       │
│          │  └──────────────────────┘        │               │
└──────────┴──────────────────────────────────┴───────────────┘
```

Width: `w-full md:w-[90vw] max-w-[1400px]` in Research mode. Chat mode keeps existing width.

### 3.3 Sources Panel (Left)

File: `components/ResearchSourcesPanel.tsx`

```typescript
const ResearchSourcesPanel: React.FC = () => {
  const { sources, addSource, removeSource, projectSlug } = useResearch();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<string | null>(null);

  if (!projectSlug) return null;

  return (
    <div className="w-64 flex-shrink-0 ...">
      <div className="...header...">
        <span>Sources ({sources.length})</span>
        <button onClick={() => setIsAddModalOpen(true)}>+</button>
      </div>
      {sources.length === 0 ? (
        <div className="...empty...">No sources yet.</div>
      ) : (
        sources.map(s => (
          <div key={s.path} className="...source-item...">
            <button onClick={() => setPreviewFile(s.path)}>{s.title}</button>
            <button onClick={() => removeSource(s.path)}>×</button>
          </div>
        ))
      )}
      <AddSourceModal open={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
    </div>
  );
};
```

Props: **none** — reads from context. Zero prop drilling. The component fetches sources, addSource, removeSource directly from `useResearch()`.

### 3.4 Findings Panel (Right)

File: `components/ResearchFindingsPanel.tsx`

```typescript
const ResearchFindingsPanel: React.FC = () => {
  const { findings, saveFindings } = useResearch();
  const [editText, setEditText] = useState(findings);
  const [isEditing, setIsEditing] = useState(false);

  // Sync when context changes (e.g. assistant appended)
  useEffect(() => { setEditText(findings); }, [findings]);

  const handleSave = () => {
    saveFindings(editText);
    setIsEditing(false);
  };

  return (
    <div className="w-80 flex-shrink-0 ...">
      <div className="...header...">
        <span>Findings</span>
        {isEditing
          ? <button onClick={handleSave}>Save</button>
          : <button onClick={() => setIsEditing(true)}>Edit</button>
        }
      </div>
      {isEditing ? (
        <textarea value={editText} onChange={e => setEditText(e.target.value)} />
      ) : (
        <Markdown>{findings}</Markdown>
      )}
    </div>
  );
};
```

Props: **none** — reads from context. Zero I/O.

### 3.5 Project Browser

File: `components/ResearchProjectBrowser.tsx`

```typescript
const ResearchProjectBrowser: React.FC = () => {
  const { openProject } = useResearch();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    researchVault.projects.list().then(setProjects);  // only reads index
  }, []);

  const handleCreate = async (title: string) => {
    const slug = await researchVault.projects.create(title);
    await openProject(slug);
  };

  return (
    <div className="...grid...">
      {projects.map(p => (
        <div key={p.slug} className="...project-card..." onClick={() => openProject(p.slug)}>
          <h3>{p.title}</h3>
          <p>{p.sourceCount} sources · {p.messageCount} messages</p>
        </div>
      ))}
      <button onClick={() => setIsCreating(true)}>New Project</button>
    </div>
  );
};
```

Only `openProject` comes from context. Project listing is a direct `researchVault.projects.list()` call — it's a read-only index, no context needed. This is the **one exception** to the rule.

### 3.6 Add Source Modal

File: `components/AddSourceModal.tsx`

**Still receives props** — it's a modal that opens/closes via its own state. The host component controls `open`/`onClose`.

```typescript
interface AddSourceModalProps {
  open: boolean;
  onClose: () => void;
}

const AddSourceModal: React.FC<AddSourceModalProps> = ({ open, onClose }) => {
  const { addSource } = useResearch();
  const [tab, setTab] = useState<'vault' | 'url' | 'upload'>('url');
  const [url, setUrl] = useState('');

  const handleAddUrl = async () => {
    await addSource({ kind: 'url', value: url });
    onClose();
  };

  // ... vault browse and upload tabs follow same pattern

  return <dialog open={open}>...tabs...</dialog>;
};
```

---

## 4. Setup in `LLMChatPanel.tsx`

The `ResearchContext` wraps the research panel area. The chat panel header gets the mode toggle.

```tsx
// In LLMChatPanel.tsx return statement:

<ResearchProvider>
  <div className="...panel-container...">
    {/* Header */}
    <div className="...header...">
      <ModeToggle mode={mode} onChange={setMode} />
      {mode === 'research' && <ProjectBreadcrumb />}
      <CloseButton onClick={onClose} />
    </div>

    {/* Body */}
    {mode === 'chat' ? (
      /* ══ existing chat content ══ */
      <ConversationArea messages={messages} ... />
    ) : (
      /* ══ research layout ══ */
      <div className="flex flex-1 min-h-0">
        <ResearchSourcesPanel />
        <div className="flex flex-col flex-1 min-h-0">
          <ConversationArea messages={messages} ... />
          <MessageInput onSend={sendMessage} ... />
        </div>
        <ResearchFindingsPanel />
      </div>
    )}
  </div>
</ResearchProvider>
```

---

## 5. Assistant Tools — seam at `buildSystemIdentity`

### 5.1 Source Context Injection — DEEPENING an existing seam

The existing `buildSystemIdentity(settings)` function at `services/assistantService.ts:46` builds the system prompt for every LLM call. This is the **right seam** for source context injection.

**Change**: Add an optional second parameter using the named `SourceContext` type:

```typescript
export const buildSystemIdentity = (
  settings: LLMSettings,
  sourceContext?: SourceContext[]
): string => {
  let identity = /* existing persona text */;
  if (sourceContext?.length) {
    identity += `\n\n## Pinned Sources\n\n`;
    sourceContext.forEach((s, i) => {
      const truncated = s.content.length > 4000
        ? s.content.slice(0, 4000) + '\n\n[...truncated — use expand_source to read full content]'
        : s.content;
      identity += `[${i + 1}] ${s.title}\n\`\`\`\n${truncated}\n\`\`\`\n\n`;
    });
    identity += `When answering, cite sources using [1], [2], etc. Provide a citation footer at the end of your response.`;
  }
  return identity;
};
```

**Hyrum's Law note**: The `content` field may contain `[...truncated — use expand_source to read full content]` appended. No consumer should parse this suffix — new sources may truncate differently or not at all. The `expand_source` tool is the single contract for reading full content.

**Depth**: One optional parameter hides truncation logic, citation instruction formatting, and multi-source concatenation. Callers (`runGeminiTurn`, `runOllamaTurn`, etc.) each get this for free — one change propagates to all providers.

### 5.2 New Tool: `append_findings`

```typescript
{
  name: 'append_findings',
  description: 'Append key takeaways or findings to the current research project\'s findings.md file.',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Markdown text to append to findings.md' },
    },
    required: ['text'],
  },
  execute: async ({ text }) => {
    const slug = getActiveResearchProject();
    if (!slug) return 'Error: No active research project.';
    await researchVault.findings.append(slug, text);
    appEventBus.emit('research:findingsAppended', { slug });
    return 'Appended to findings.';
  }
}
```

### 5.3 New Tool: `expand_source`

```typescript
{
  name: 'expand_source',
  description: 'Read the full content of a source file that was truncated in the system prompt.',
  parameters: {
    type: 'object',
    properties: {
      fileName: { type: 'string', description: 'The source filename as listed in the citations.' },
    },
    required: ['fileName'],
  },
  execute: async ({ fileName }) => {
    const slug = getActiveResearchProject();
    if (!slug) return 'Error: No active research project.';
    return await researchVault.sources.readContent(slug, fileName);
  }
}
```

### 5.4 Active project tracker

File: `services/researchVaultService.ts` (or a small helper)

```typescript
let activeProjectSlug: string | null = null;

export const setActiveProject = (slug: string | null) => { activeProjectSlug = slug; };
export const getActiveResearchProject = () => activeProjectSlug;

// Subscribe in App.tsx or the hook:
appEventBus.on('research:projectOpened', ({ slug }) => setActiveProject(slug));
appEventBus.on('research:projectClosed', () => setActiveProject(null));
```

### 5.5 Citation Rendering — structured data, not regex

Citations are stored as structured data in the `citations` field of `ChatMessage`, not parsed from markdown text.

#### How citations are populated

1. The LLM is instructed in `buildSystemIdentity` to cite sources using `[1]`, `[2]` in its response text and to end with a citation footer:
```
When answering, cite sources using [1], [2], etc. Provide a citation footer at the end of your response.
```
2. After receiving the LLM response, the renderer parses the citation footer from the markdown: check if the content contains `\n---\n`, and if so, parse the lines after `---` to build the `citations` array.
3. The message is then stored with both `content` (markdown without footer) and `citations` (structured array).

#### Rendering

In `LLMChatPanel.tsx`, after markdown rendering:
1. If `message.citations` exists, render them as a separate block below the markdown
2. Each `[N]` is a `<button>` that opens the source in a preview pane
3. The inline `[1]` references in the markdown text remain as plain text — the citation block provides the clickable links

#### Why structured data over regex

- **Deterministic**: Same message always renders the same way, regardless of content changes
- **No fragile parsing**: No regex on HTML output, no assumptions about LLM formatting
- **Hyrum's Law safe**: Changes to LLM citation format don't break the renderer — only the footer parser needs updating
- **Surfaced to `ResearchSourcesPanel`**: The citations array maps to the sources panel for highlighting referenced sources

---

## 6. Files to Create

| File | Purpose |
|------|---------|
| `services/researchVaultService.ts` | `researchVault` module — projects, sources, findings operations |
| `hooks/useResearchProject.ts` | State hook — all async I/O, auto-save, sendMessage wiring |
| `contexts/ResearchContext.tsx` | React context providing hook values to all sub-components |
| `components/ResearchSourcesPanel.tsx` | Sources list panel (left) — pure presenter |
| `components/ResearchFindingsPanel.tsx` | Findings editor panel (right) — pure presenter |
| `components/AddSourceModal.tsx` | Modal for adding sources (URL, upload, vault) |
| `components/ResearchProjectBrowser.tsx` | Project list/creation view |

## 7. Files to Modify

| File | Changes |
|------|---------|
| `components/LLMChatPanel.tsx` | Wrap in `ResearchProvider`, add mode toggle, three-panel layout, citation footer rendering |
| `services/assistantService.ts` | Add optional `sourceContext` parameter to `buildSystemIdentity`; thread through all provider functions |
| `services/assistantTools.ts` | Add `append_findings` and `expand_source` tools; import `getActiveResearchProject` |
| `types.ts` | Add `ResearchProject`, `SourceFile`, `SourceInput`, `ProjectSummary` types |
| `utils/eventBus.ts` | Add research event types (`research:projectOpened`, `research:projectClosed`, `research:sourceAdded`, `research:sourceRemoved`, `research:findingsAppended`) |

**No changes to**: `settings/config.tsx`, `IntegrationsSection.tsx` — the research vault uses the existing app data directory.

---

## 8. Implementation Order

### Phase 1 — Foundation
1. Add types to `types.ts` (`ResearchProject`, `SourceFile`, `SourceInput`, `ProjectSummary`, `SourceContext`, `Citation`, `ResearchVaultError`)
2. Create `services/researchVaultService.ts` with the `researchVault` module (3 groups, 9 methods + error contract with `ResearchVaultError`)
3. Add events to `utils/eventBus.ts` (`research:projectOpened`, `research:projectClosed`, `research:sourceAdded`, `research:sourceRemoved`, `research:findingsAppended`)
4. Create `hooks/useResearchProject.ts` — the main state hook (owns all I/O, error handling, auto-save)
5. Create `contexts/ResearchContext.tsx` — wraps the hook in React context

### Phase 2 — Research UI in Chat Panel
6. Add Chat/Research mode toggle to `LLMChatPanel.tsx`
7. Create `ResearchProjectBrowser.tsx` with project list + create
8. Implement research-mode layout (three-panel structure) in `LLMChatPanel.tsx`, wrapping with `ResearchProvider`
9. Wire project loading: `useResearch().openProject()` → populates sources + chat + findings

### Phase 3 — Sources
10. Create `ResearchSourcesPanel.tsx` — consumes `useResearch().sources`
11. Create `AddSourceModal.tsx` (vault browse + URL capture + file upload)
12. Wire URL capture through existing `/api/proxy-page` endpoint
13. Wire `sources.add` → `useResearch().addSource()` → `researchVault.sources.add()`

### Phase 4 — Citations & Findings
14. Add `sourceContext` parameter to `buildSystemIdentity` in `assistantService.ts`; thread through all provider functions
15. Wire `useResearch().sendMessage()` to read sources, build context, call `runAssistantTurn`
16. Implement citation footer rendering in `LLMChatPanel.tsx` message display
17. Create `ResearchFindingsPanel.tsx` — consumes `useResearch().findings`
18. Add `append_findings` and `expand_source` tools to `assistantTools.ts`
19. Wire `getActiveResearchProject()` through event bus subscription

### Phase 5 — Polish
20. Auto-save `chat.json` debounced on message changes
21. Handle edge cases: project deletion, source removal, empty states
22. Test end-to-end: create project → add sources → ask questions → see citations → save findings

---

## 9. Data Flow Summary

```
User clicks "Add Source" (URL)
  → AddSourceModal calls addSource({ kind: 'url', value })
  → useResearchProject.addSource()
    → fetches URL via /api/proxy-page
    → researchVault.sources.add(slug, input) saves markdown to sources/
    → updates sources state
    → emits 'research:sourceAdded'
  → ResearchSourcesPanel re-renders (reads from context)

User sends message
  → useResearchProject.sendMessage(text)
    → reads all source contents via researchVault.sources.readContent()
    → buildSystemIdentity(settings, sourceContext) with truncated sources
    → calls runAssistantTurn() with augmented system prompt
    → LLM responds with [1], [2] citations + footer
    → appends assistant message to messages state
    → debounced auto-save to chat.json

Assistant calls append_findings tool
  → reads activeProjectSlug from module-level tracker
  → researchVault.findings.append(slug, text) writes to findings.md
  → emits 'research:findingsAppended'
  → useResearchProject catches the event, reloads findings
  → ResearchFindingsPanel re-renders
```

---

## 10. Edge Cases & Decisions

### What happens when sources are too large?
Truncate each source to ~4KB. Add truncated notice. `expand_source` tool reads full content.

### What happens when no project is active in Research mode?
Show the `ResearchProjectBrowser` as the main content area.

### Source file formats supported initially
- `.md` — markdown (full support)
- `.txt` — plain text (displayed as markdown)
- `.pdf` — text extraction only (stretch goal)
- Web captures — fetched via `/api/proxy-page`, saved as markdown with URL frontmatter

### Auto-save timing
`chat.json` is saved 2 seconds after the last message change (debounced). Findings are saved on explicit "Save" click or when the assistant appends.

### Chat mode vs Research mode storage
- **Chat mode**: unchanged — localStorage via `chatStorage.ts`
- **Research mode**: `chat.json` on disk in the project folder

### Can a Chat session be converted to a Research project?
Not in v1.

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Large source files blow context window | 4KB truncation + `expand_source` tool |
| File system race conditions | Single-instance panel; debounced saves |
| `fileSystemManager` not initialized | Guard all `researchVault` methods with init check |
| PDF parsing complex | Start with text-only extraction |
| URL capture fails | Use existing proxy-page with reader mode fallback |
| Context re-renders cause lag | Memoize context value with `useMemo` |
| `useResearch().sendMessage` is complex | Extract source reading into separate helper |
| User sees silent failure on send | `sendMessage` returns `{ ok, error }` result; components display error inline or as toast |
| Components depend on `sendMessage` throwing on error | Result type returns `{ ok: false, error: string }` instead of throwing — no thrown path to depend on |
| Callers parse `content` truncation suffix | Documented as not-a-contract in `SourceContext`; `expand_source` is the contract for full content |
