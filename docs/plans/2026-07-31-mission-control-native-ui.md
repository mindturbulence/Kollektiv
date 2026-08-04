# Mission Control Native UI — Implementation Plan

**Status:** Implemented 2026-07-31 (all phases 0–8). This plan stays as the reference spec; the Architecture Constitution's Phase 7 entry summarizes the result.
**Date:** 2026-07-31

## Goal

Recreate the Mission Control app (currently embedded as a same-origin iframe in the `mission_control` tab) as **native Kollektiv UI** — React 19 + daisyUI components in Kollektiv's own shell, mimicking MC's screens and information architecture. The current iframe tab (`mission_control`, "Mission") stays **100% untouched** and continues to work. A **new** tab and header menu entry — **"Mission (native)"**, placed directly after "Mission" — hosts the native recreate.

Mission Control's Next.js process (+ SQLite, auth, APIs, SSE) remains the backend. Kollektiv-native views call its JSON API through the **existing** reverse proxy (`routes/missionControlRoutes.ts`, `createMissionControlProxy()`), so all requests are same-origin and the MC session cookie flows automatically.

**Companion docs:** `docs/plans/2026-07-29-mission-control-fork-design.md` (integration model, platform constraints, rejected alternatives). Read it before starting.

## Global Constraints

- **Platform is Windows 11.** Every verification step must pass on Windows. No `brew`/`apt`/`tmux` steps. The PTY terminal viewer stays **excluded** (upstream gates it on `win32`; we mirror that gate).
- **Package manager is `pnpm`.** Never `npm install` / `yarn`.
- **Kollektiv dev server**: `:7500`; proxy mounts MC at `/mission-control/*`; **MC dev server**: `:3100` (via `pnpm dev:mc` / `pnpm dev:all`).
- **`pnpm lint` = `tsc --noEmit`** in the Kollektiv root — must stay clean.
- **TDD loop per task:** write the failing test first (red), implement the minimal slice (green). No speculative features.
- **Do not modify `mission-control/` source.** The fork stays byte-identical to what the iframe version uses. All new work is on the Kollektiv side. (If a real defect is found in MC's API, log it, don't fix upstream in this plan.)
- **Commit per task**, conventional messages. Keep the current `mission_control` tab untouched — no edits to `components/MissionControlPage.tsx`.

## Reference facts (verified 2026-07-31, read from source)

| Fact | Location |
|---|---|
| MC nav groups: **core** (Overview, Agents, Tasks, Chat, Channels, Skills, Memory), **OBSERVE** (Activity, Logs, Cost Tracker, Nodes, Approvals, Office, Monitor), **AUTOMATE** (Cron, Webhooks, Alerts, GitHub), **ADMIN** (Security, Users, Audit, Gateway→Gateways/Config, Integrations, Debug, Settings) | `mission-control/src/components/layout/nav-rail.tsx` |
| Dashboard widget catalog (16): briefing-bar, activity-timeline, fleet-status, task-pipeline, system-health, metric-cards, runtime-health, gateway-health, session-workbench, event-stream, task-flow, github-signal, security-audit, maintenance, quick-actions | `mission-control/src/components/dashboard/widgets/`, `widget-grid.tsx` |
| Dashboard data = single aggregate call `GET /api/status?action=dashboard` → `{ ...system, db: dbStats }`, plus `GET /api/sessions`, `GET /api/claude/sessions`, `GET /api/github?action=stats`, `GET /api/hermes` | `mission-control/src/components/dashboard/dashboard.tsx:59-99`, `src/app/api/status/route.ts:44-70` |
| MC API client contract: `withBasePath()`, `ApiError { code, status, payload }`, 401 → auth-expired event, `credentials: 'include'` always | `mission-control/src/lib/api-client.ts` |
| Auth: API routes call `requireRole(request, 'viewer')` reading the session cookie; `POST /api/auth/login` returns JSON + sets cookie; `GET /api/auth/me` returns the current user | `mission-control/src/app/api/auth/login/route.ts`, `src/lib/auth.ts` |
| Live stream: `GET /api/events` SSE — `data: { type, data, timestamp }` JSON frames, first frame `{ type: 'connected' }` | `mission-control/src/app/api/events/route.ts` |
| Full API inventory (routes under `src/app/api/`) | listed per-phase in the traceability tables below |
| MC theme tokens (Tailwind 4 `@theme`): `--color-background/card/foreground/muted/muted-foreground/primary/secondary/border/input/ring/destructive/success/warning/info` + `--color-surface-0..3` | `mission-control/src/app/globals.css` |
| Kollektiv tab plumbing: `ActiveTab` union `types.ts:61-82`; tab switch `components/App.tsx:358-375`; header nav groups `components/Header.tsx` (`navGroups`); title cases `components/TabTitleManager.tsx`; route glyphs `components/transitions/routeFx.ts:44` | root `types.ts`, `components/` |
| Existing proxy: `routes/missionControlRoutes.ts` (`createMissionControlProxy`, `attachMissionControlUpgrade`), mounted at root in `server.ts:178`; SSE via `accept-encoding: identity`; WS upgrades forwarded; `MISSION_CONTROL_UNREACHABLE` JSON on 502 | `routes/missionControlRoutes.ts`, `server.ts` |
| Kollektiv test stack: Vitest + @testing-library/react, tests beside source (`components/*.test.tsx`, `services/*.test.ts`) | repo convention |

## Design decisions

1. **New tab id `mission_control_native`** — `mission_control` (iframe) is untouched. Header entry: single-item group `{ id: 'mission-control-native', label: 'Mission (native)', singleId: 'mission_control_native' }` placed immediately after the existing `mission-control` group.
2. **Transport** — same-origin `fetch('/mission-control/api/...')` with `credentials: 'include'`. The proxy already handles auth-cookie passthrough and SSE. No new server work. A Kollektiv-side `services/missionControlApi.ts` mirrors MC's `api-client.ts` contract (typed `MissionControlApiError`, 401 → `UNAUTHENTICATED`).
3. **Auth UX** — native login view inside the tab (mirrors MC's login screen, daisyUI-styled). One-time `POST /mission-control/api/auth/login`; the `mc-session` cookie is stored by the browser for the shared origin; every later fetch is authorized. On any 401 the tab returns to the login view with the message preserved (no hard redirect away from the tab).
4. **Internal navigation** — the native page renders Kollektiv's global header above and an MC-style **left nav rail** below it, grouping the same 4 nav groups (core / OBSERVE / AUTOMATE / ADMIN). The active panel is local state in `MissionControlNativePage` (no URL routing; the shell tab is the route). Panel switching follows Kollektiv's existing animated-tab feel where cheap (reuse `routeFx` glyphs only where already wired for tabs).
5. **Theming** — native components use daisyUI tokens exclusively (`bg-base-100`, `text-primary`, `border-base-300`, etc.), the same theme Kollektiv's shell uses. The bridge already proved the token mapping; native UI needs no new theming code. The "mimic" is in **layout, information architecture, and behavior**, not in copying MC's CSS.
6. **Data fetching** — no react-query in Kollektiv today; keep the pattern: `services/missionControlApi.ts` (pure fetch layer) + per-panel hooks (`hooks/useMissionControl*.ts`) with local loading/error state. A shared `MissionControlContext` holds the login state + auth status + current panel.
7. **Live data** — `EventSource('/mission-control/api/events')` for the activity feed, with auto-reconnect. WebSocket-based features (chat/notifications, if any in v1) are phased last (Phase 7) and only if the proxy's WS upgrade path is exercised by real MC WS endpoints used by the recreated panels.
8. **Windows-gated items** — terminal viewer: not recreated (matches upstream's `isTerminalSupported` gating; the "Local Terminal" nav item is omitted). Super-admin provisioning, Google auth, OpenClaw update flows: render a "not available in local mode" empty state exactly as MC hides/disables them — recreated as stubs, not ported.
9. **Payload shapes** — every panel task begins with a **"confirm shape" step**: read `mission-control/src/app/api/<x>/route.ts` and record the response contract into `services/missionControlTypes.ts` before writing the mapper. This keeps the plan accurate without duplicating 100 route files here.

## File structure

**New files (Kollektiv side):**

| File | Responsibility |
|---|---|
| `services/missionControlApi.ts` | Pure fetch client: `mcFetch`, `mcLogin`, `mcLogout`, `mcGetMe`; typed errors. No React. |
| `services/missionControlApi.test.ts` | Unit tests: path building, 401/403/5xx mapping, login POST, network failure. Stubbed `fetch`. |
| `services/missionControlTypes.ts` | TS types mirroring MC API payloads (Agent, Task, ClaudeSession, TokenUsage, ActivityEvent, DashboardData, …). Grown per-panel. |
| `hooks/useMissionControlEvents.ts` | `EventSource` hook for `/api/events` with reconnect + auth-expired handling. |
| `hooks/useMissionControlEvents.test.ts` | Unit tests: parses SSE frames, reconnects on close, stops on unmount. |
| `contexts/MissionControlContext.tsx` | Provider: login state, `me`, panel state, error state. |
| `components/MissionControlNativePage.tsx` | Tab root: login gate → shell (nav rail + panel host). |
| `components/missionControl/` | All native panel/widget components (one file per nav item, see traceability tables). |

**Modified files:**

| File | Change |
|---|---|
| `types.ts` | Add `\| 'mission_control_native'` to `ActiveTab`. |
| `components/Header.tsx` | Add "Mission (native)" group after the `mission-control` group. |
| `components/App.tsx` | Add `mission_control_native` case to the tab render switch. |
| `components/TabTitleManager.tsx` | Add document-title case. |
| `components/transitions/routeFx.ts` | Add glyph case (mirror `mission_control`). |
| `docs/handbook/...` | Phase 8: README + Architecture Constitution update. |
| `e2e/mission-control-native.spec.ts` | Phase 8: Playwright E2E (new file, separate config). |

---

## Phase 0 — Foundation and plumbing

**Goal:** the "Mission (native)" tab exists in the shell, opens to a working native login view, and the API client + types are in place with tests. Nothing renders MC data yet.

### Task 0.1: Add the tab and menu entry

**Files:** `types.ts`, `components/Header.tsx`, `components/App.tsx`, `components/TabTitleManager.tsx`, `components/transitions/routeFx.ts`

**Interfaces:** produces `'mission_control_native'` as a valid `ActiveTab`; a header entry that navigates to it; a render case for it.

- [ ] **Step 1:** Add `| 'mission_control_native'` to the `ActiveTab` union in `types.ts`.
- [ ] **Step 2:** In `components/Header.tsx` `navGroups`, insert after the existing `mission-control` group:

```ts
{ id: 'mission-control-native', label: 'Mission (native)', items: [], singleId: 'mission_control_native' as ActiveTab },
```

- [ ] **Step 3:** In `components/App.tsx`, add a render case `case 'mission_control_native': return <MissionControlNativePage />;` (component imported in Phase 0 Task 0.3).
- [ ] **Step 4:** Add the document-title case to the `currentTitle` switch in `components/App.tsx` (~line 140-167; `TabTitleManager.tsx` has no per-tab switch — it just animates whatever `defaultTitle` string `App.tsx` passes it) and a route-glyph case in `routeFx.ts`, mirroring the existing `mission_control` entries.
- [ ] **Step 5 (test):** Component test for `Header` asserting a nav button labeled `Mission (native)` exists and its click calls `onNavigate('mission_control_native')` (mock `useSettings`/`audioService` as existing tests do).
- [ ] **Step 6:** `pnpm lint` clean; `pnpm test` green (new test passes).
- [ ] **Step 7 (manual):** `pnpm dev:all`, click "Mission (native)" → tab opens (shows placeholder), "Mission" still opens the iframe.
- [ ] **Commit:** `feat(mission-control-native): add Mission (native) tab and header entry`

### Task 0.2: API client and types

**Files:** `services/missionControlApi.ts`, `services/missionControlTypes.ts`, `services/missionControlApi.test.ts`

**Interfaces:** produces `mcFetch<T>(path, init?)`, `mcLogin(username, password)`, `mcLogout()`, `mcGetMe()`, `MissionControlApiError`; consumes MC's API over `/mission-control/api/*`.

- [ ] **Step 1 (red):** Write `services/missionControlApi.test.ts` with stubbed `globalThis.fetch`:

```ts
// seam: mcFetch maps status codes to typed errors
it('returns parsed JSON on 200', async () => { /* stub fetch → 200 {ok:true}; expect data */ });
it('throws UNAUTHENTICATED on 401', async () => { /* stub 401; expect error.code === 'UNAUTHENTICATED' */ });
it('throws FORBIDDEN on 403 and SERVER_ERROR on 5xx', async () => { /* … */ });
it('throws NETWORK_ERROR when fetch rejects', async () => { /* … */ });
it('mcLogin POSTs JSON to /mission-control/api/auth/login with credentials include', async () => { /* assert url, method, body, credentials */ });
```

- [ ] **Step 2 (green):** Implement:

```ts
const MC_API = '/mission-control/api';

export class MissionControlApiError extends Error {
  constructor(readonly code: 'UNAUTHENTICATED'|'FORBIDDEN'|'NOT_FOUND'|'CLIENT_ERROR'|'SERVER_ERROR'|'NETWORK_ERROR'|'PARSE_ERROR',
              readonly status: number, message: string, readonly payload?: unknown) { super(message); }
}

export async function mcFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${MC_API}${path}`, { credentials: 'include', ...init });
  } catch { throw new MissionControlApiError('NETWORK_ERROR', 0, 'Mission Control unreachable'); }
  if (res.status === 401) throw new MissionControlApiError('UNAUTHENTICATED', 401, 'Session expired');
  if (res.status === 403) throw new MissionControlApiError('FORBIDDEN', 403, 'Forbidden');
  if (res.status === 404) throw new MissionControlApiError('NOT_FOUND', 404, 'Not found');
  if (!res.ok) throw new MissionControlApiError('SERVER_ERROR', res.status, `Mission Control error ${res.status}`);
  try { return await res.json() as T; } catch { throw new MissionControlApiError('PARSE_ERROR', res.status, 'Invalid JSON response'); }
}

export async function mcLogin(username: string, password: string): Promise<void> {
  const res = await fetch(`${MC_API}/auth/login`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new MissionControlApiError('CLIENT_ERROR', res.status, 'Invalid credentials');
}

export const mcLogout = () => mcFetch('/auth/logout', { method: 'POST' });
export const mcGetMe = () => mcFetch<CurrentUser>('/auth/me');
```

- [ ] **Step 3:** Create `services/missionControlTypes.ts` with `CurrentUser`, `Agent`, `Task`, `ClaudeSession`, `TokenUsage`, `ActivityEvent`, `DashboardData` — field names from the confirm-shape step (Task 0.2 Step 4 for the ones used here).
- [ ] **Step 4 (confirm shape):** Read `mission-control/src/app/api/auth/me/route.ts` and `auth/login/route.ts`; record `CurrentUser` fields in `missionControlTypes.ts`.
- [ ] **Step 5:** `pnpm lint`; `pnpm test` — all new tests green.
- [ ] **Commit:** `feat(mission-control-native): add API client and shared types`

### Task 0.3: Native login gate

**Files:** `contexts/MissionControlContext.tsx`, `components/MissionControlNativePage.tsx`, `components/missionControl/LoginView.tsx`, `contexts/MissionControlContext.test.tsx`

**Interfaces:** produces `<MissionControlProvider>`, `<MissionControlNativePage />` (login gate → shell placeholder), `<LoginView />`; consumes `mcLogin`/`mcGetMe`.

- [ ] **Step 1 (red):** Component tests:
  - `LoginView` renders username/password fields; submit calls `onLogin(username, password)`; shows the error message on failed login.
  - `MissionControlNativePage` (mock `mcGetMe` resolved → renders the shell placeholder, not the login view; rejected → renders `LoginView`).
  - Context test: successful `mcLogin` flips `status` to `'authed'` and stores `me`.
- [ ] **Step 2 (green):** Implement the context (`status: 'unknown'|'authed'|'anonymous'`, `me`, `login()`, `logout()`), `LoginView` (daisyUI form: `card`, `input`, `btn-primary`, mirroring MC's login screen layout), and `MissionControlNativePage` (on mount `mcGetMe()`; render `LoginView` when anonymous; placeholder shell when authed).
- [ ] **Step 3:** Wire the page into the `App.tsx` case from Task 0.1 (wrap in `MissionControlProvider` at the `App` root or inside the case — pick one, document in code).
- [ ] **Step 4:** `pnpm lint`; `pnpm test` green.
- [ ] **Step 5 (manual):** `pnpm dev:all`; open "Mission (native)" → login form; log in with seeded `AUTH_USER`/`AUTH_PASS` → shell placeholder appears; reload → still authed (cookie persists).
- [ ] **Commit:** `feat(mission-control-native): add login gate and session context`

**Phase 0 exit check:** tab opens, login works, 401 path returns to login, `pnpm lint` clean, all unit/component tests green.

---

## Phase 1 — Native shell (information architecture)

**Goal:** the authed tab renders MC's shell: header strip (connection status, user) + left nav rail with the 4 nav groups + panel host that switches between panels. Panels are placeholders until their phases.

### Task 1.1: Shell layout and nav rail

**Files:** `components/missionControl/Shell.tsx`, `components/missionControl/NavRail.tsx`, `components/missionControl/PlaceholderPanel.tsx`

**Interfaces:** produces `Shell` (own state: `activePanel: string`, default `'overview'`); consumes `MissionControlContext` (`me`, `logout`).

- [ ] **Step 1 (red):** Tests:
  - `NavRail` renders the 4 groups and all nav labels from the verified MC inventory (Overview…Settings), highlights the active item, calls `onSelect(id)` on click.
  - `Shell` renders the selected panel via its registry; unknown id → `PlaceholderPanel` naming the id.
- [ ] **Step 2 (green):** Implement `NavRail` (groups core/OBSERVE/AUTOMATE/ADMIN with the exact MC labels; daisyUI: vertical `menu`, `menu-title` for group headers, active `bg-primary/10 text-primary`), `Shell` (header strip: MC status dot via `mcGetMe`/`/api/status`, logout button; nav rail + panel host), `PlaceholderPanel` ("X — coming in Phase N").
- [ ] **Step 3:** Register a `PANEL_REGISTRY: Record<string, { label, component }>` in `Shell`; Phase 2+ tasks register into it.
- [ ] **Step 4:** `pnpm lint`; `pnpm test` green.
- [ ] **Step 5 (manual):** authed tab shows the rail; clicking items swaps the placeholder; "Mission (native)" and "Mission" both work.
- [ ] **Commit:** `feat(mission-control-native): add MC-style shell and nav rail`

---

## Phase 2 — Overview (dashboard)

**Goal:** recreate MC's Overview screen: the widget grid with the core widgets, fed by `/api/status?action=dashboard`, `/api/sessions`, `/api/claude/sessions`, and the SSE event stream.

### Task 2.1: Dashboard data hook

**Files:** `hooks/useMissionControlDashboard.ts`, `hooks/useMissionControlDashboard.test.ts`, `services/missionControlTypes.ts`

**Interfaces:** produces `useDashboardData()` → `{ data: DashboardData, loading, error, refetch }`; consumes `GET /api/status?action=dashboard`.

- [ ] **Step 1 (confirm shape):** Read `mission-control/src/app/api/status/route.ts` `getDashboardData()` and `getSystemStatus()`; record `DashboardData` fields (system health, db stats, audit summary, recent activity) into `missionControlTypes.ts`.
- [ ] **Step 2 (red→green):** Hook tests with stubbed `mcFetch`: resolves data, sets loading, surfaces error, refetch. Implement.
- [ ] **Commit:** `feat(mission-control-native): dashboard data hook`

### Task 2.2: Metric cards + fleet status

**Files:** `components/missionControl/panels/OverviewPanel.tsx`, `components/missionControl/widgets/MetricCards.tsx`, `components/missionControl/widgets/FleetStatus.tsx`

**Interfaces:** consumes `useDashboardData()` + `GET /api/agents`; mimics MC's `metric-cards-widget` (agents online, sessions, tasks open, tokens) and `fleet-status-widget` (agent rows with status chips).

- [ ] **Step 1 (confirm shape):** Read `mission-control/src/components/dashboard/widgets/metric-cards-widget.tsx` + `fleet-status-widget.tsx` and the agents endpoint; record what fields each renders.
- [ ] **Step 2 (red→green):** Tests with mocked hook payloads: MetricCards renders the four numbers with daisyUI `stat`; FleetStatus renders agent rows with status-derived badge classes. Implement both.
- [ ] **Commit:** `feat(mission-control-native): overview metric cards and fleet status`

### Task 2.3: Session workbench + activity timeline + event stream

**Files:** `components/missionControl/widgets/SessionWorkbench.tsx`, `components/missionControl/widgets/ActivityTimeline.tsx`, `components/missionControl/widgets/EventStream.tsx`, `hooks/useMissionControlEvents.ts` (+ test)

**Interfaces:** consumes `GET /api/claude/sessions` (per-project grouping, tokens, cost — the fork's load-bearing feature) and `GET /api/events` SSE; mimics `session-workbench-widget`, `activity-timeline-widget`, `event-stream-widget`.

- [ ] **Step 1 (red→green):** SSE hook test (parses `data: {…}` frames via `EventSource` stub, reconnect on close, cleanup on unmount). Implement hook.
- [ ] **Step 2 (confirm shape):** Read `mission-control/src/components/dashboard/widgets/session-workbench-widget.tsx` + `claude-sessions` route; record `ClaudeSession` and the aggregate shape.
- [ ] **Step 3 (red→green):** Widget tests (mocked data + stubbed SSE): SessionWorkbench lists projects with token/cost sums; ActivityTimeline renders the recent-activity list; EventStream renders incoming events and stops on unmount. Implement.
- [ ] **Step 4 (manual):** Overview shows real sessions from `~/.claude/projects` (21 dirs on this host) and a live-updating event feed.
- [ ] **Commit:** `feat(mission-control-native): overview session, timeline, and live event widgets`

**Phase 2 exit check:** Overview mimics MC's landing screen with real data; SSE streams through the proxy.

---

## Phase 3 — Core panels

**Goal:** recreate Agents, Tasks, Chat, Channels, Skills, Memory.

### Task 3.1: Agents

**Files:** `components/missionControl/panels/AgentsPanel.tsx`, `services/missionControlTypes.ts`

**Interfaces:** consumes `GET /api/agents` (+ `POST /api/agents/register`, `POST /api/agents/[id]/heartbeat`, `POST /api/agents/[id]/wake`, `POST /api/agents/[id]/hide` where MC's panel exposes them).

- [ ] **Step 1 (confirm shape):** Read `mission-control/src/app/api/agents/route.ts` and `components/panels/agent-squad-panel-phase3.tsx`; record `Agent` fields + row actions.
- [ ] **Step 2 (red→green):** Tests: renders agent table/cards from mocked payload; status chip classes per `status`; register form posts via `mcFetch`. Implement.
- [ ] **Commit:** `feat(mission-control-native): agents panel`

### Task 3.2: Tasks

**Files:** `components/missionControl/panels/TasksPanel.tsx`

**Interfaces:** consumes `GET /api/tasks`, `GET /api/tasks/queue`, `POST /api/tasks` (create), `GET/POST /api/tasks/[id]/comments`; mimics MC's task-board-panel (columns by status, assignment, quality gates).

- [ ] **Step 1 (confirm shape):** Read `mission-control/src/app/api/tasks/route.ts` + `task-board-panel.tsx`; record `Task` fields.
- [ ] **Step 2 (red→green):** Tests: board renders columns from mocked tasks; moving a task issues the right PATCH/POST; new-task form posts. Implement.
- [ ] **Commit:** `feat(mission-control-native): tasks board panel`

### Task 3.3: Skills

**Files:** `components/missionControl/panels/SkillsPanel.tsx`

**Interfaces:** consumes `GET /api/skills`, `GET /api/skills/registry`.

- [ ] **Step 1 (confirm shape)** → **Step 2 (red→green)** → **Commit:** `feat(mission-control-native): skills panel`

### Task 3.4: Memory

**Files:** `components/missionControl/panels/MemoryPanel.tsx`

**Interfaces:** consumes `GET /api/memory`, `POST /api/memory/search`, `GET /api/memory/graph`, `GET /api/memory/context`.

- [ ] **Step 1 (confirm shape)** → **Step 2 (red→green)** → **Commit:** `feat(mission-control-native): memory browser panel`

### Task 3.5: Channels

**Files:** `components/missionControl/panels/ChannelsPanel.tsx`

**Interfaces:** consumes `GET /api/channels`.

- [ ] **Step 1 (confirm shape)** → **Step 2 (red→green)** → **Commit:** `feat(mission-control-native): channels panel`

### Task 3.6: Chat

**Files:** `components/missionControl/panels/ChatPanel.tsx`

**Interfaces:** consumes `GET /api/chat/conversations`, `GET/POST /api/chat/messages`; realtime via MC's WebSocket — **deferred to Phase 7** if the proxy WS path needs work; v1 renders history + send via REST only.

- [ ] **Step 1 (confirm shape):** Read `mission-control/src/app/api/chat/*` routes and `chat-panel.tsx`; note whether the panel is WS-dependent.
- [ ] **Step 2 (red→green):** Tests for history render + REST send. Implement (REST-first).
- [ ] **Commit:** `feat(mission-control-native): chat panel (REST)`

---

## Phase 4 — Observe panels

**Goal:** recreate Activity, Logs, Cost Tracker, Nodes, Approvals, Office, Monitor.

| Task | Panel | Endpoints (verify in route files) |
|---|---|---|
| 4.1 | Activity | `GET /api/activities`, `GET /api/events` (SSE) |
| 4.2 | Logs | `GET /api/logs` |
| 4.3 | Cost Tracker | `GET /api/tokens`, `GET /api/tokens/by-agent`, `GET /api/tokens/by-session` (verify) |
| 4.4 | Nodes | `GET /api/nodes` |
| 4.5 | Approvals | `GET/POST /api/exec-approvals` |
| 4.6 | Office | `GET /api/standup` (verify; may use `/api/mentions`) |
| 4.7 | Monitor | `GET /api/system-monitor` |

Each task follows the same TDD shape as Phase 3: **confirm shape** (read the route + the MC panel component), **red** (component test with mocked payload), **green** (implement with daisyUI, mimic MC's layout), **lint + test**, **manual spot-check**, then:

- [ ] **Commit:** `feat(mission-control-native): <panel> panel`

---

## Phase 5 — Automate panels

**Goal:** recreate Cron, Webhooks, Alerts, GitHub.

| Task | Panel | Endpoints (verify in route files) |
|---|---|---|
| 5.1 | Cron | `GET/POST/DELETE /api/scheduler` (verify; MC panel is `cron-management-panel`) |
| 5.2 | Webhooks | `GET/POST /api/webhooks`, `POST /api/webhooks/test`, deliveries |
| 5.3 | Alerts | `GET/POST /api/alerts` (verify; `alert-rules-panel`) |
| 5.4 | GitHub | `GET /api/github` (`action=stats`, repos, sync) |

Same TDD shape as Phase 4.

- [ ] **Commit per task:** `feat(mission-control-native): <panel> panel`

---

## Phase 6 — Admin panels

**Goal:** recreate Security, Users, Audit, Gateway (Gateways + Config), Integrations, Debug, Settings. Items upstream disables in local mode (Super Admin provisioning, Google auth, OpenClaw update) render a **"not available in local mode"** empty state, mirroring upstream behavior.

| Task | Panel | Endpoints (verify in route files) |
|---|---|---|
| 6.1 | Security | `GET /api/security-audit`, `GET/POST /api/security-scan` |
| 6.2 | Users | `GET /api/auth/users` |
| 6.3 | Audit | `GET /api/audit` |
| 6.4 | Gateways | `GET /api/gateways`, `GET /api/gateways/health`, `POST /api/gateways/connect`, `POST /api/gateways/control` |
| 6.5 | Gateway Config | `GET/POST /api/gateway-config` |
| 6.6 | Integrations | `GET /api/integrations` |
| 6.7 | Debug | `GET /api/debug` |
| 6.8 | Settings | `GET/POST /api/settings` |

Same TDD shape as Phase 4. Local-mode stubs are their own tests (empty state renders, no API call).

- [ ] **Commit per task:** `feat(mission-control-native): <panel> panel`

---

## Phase 7 — Live transport hardening

**Goal:** bring realtime parity with the iframe where it matters: SSE reconnect/backoff already in the hook; chat WebSocket if the REST-first chat needs it.

- [ ] **Step 1:** Review whether any recreated panel requires the proxy's WS upgrade path in practice (chat, notifications). If yes, add `e2e` coverage that a WS connection through `/mission-control` completes (see Phase 8 config).
- [ ] **Step 2 (test):** SSE hook: reconnect with capped backoff, resume after proxy 502 recovery; auth-expired (401 frame) → context flips to anonymous, login view returns.
- [ ] **Commit:** `feat(mission-control-native): realtime transport hardening`

---

## Phase 8 — Verification and documentation

### Task 8.1: E2E automation

**Files:** `playwright.mission-control-native.config.ts`, `e2e/mission-control-native.spec.ts`

**Interfaces:** produces a Playwright project booting Express :7500 (serves `dist` + proxy) and MC :3100, asserting the integrated tab.

- [ ] **Step 1:** New config: `webServer` array (root `pnpm build` + `pnpm start`, `pnpm --dir mission-control build` + `pnpm --dir mission-control start`), `baseURL: 'http://127.0.0.1:7500'`.
- [ ] **Step 2 (red):** Specs:
  1. Header shows "Mission (native)"; clicking opens the native tab (no iframe element present).
  2. With no MC session, the tab shows the login view; submitting seeded creds lands on the shell (cookie persists across reload).
  3. Overview renders metric cards and the Claude-sessions workbench with data.
  4. The event stream updates without reload (wait for a new feed item).
  5. "Mission" (iframe) still renders; switching Kollektiv theme still re-themes it.
  6. With MC stopped, Creative mode tabs remain functional and the native tab shows the typed unreachable error, not a hang.
- [ ] **Step 3 (green):** Implement/repair code until specs pass.
- [ ] **Commit:** `test(mission-control-native): end-to-end specs`

### Task 8.2: Docs and handbook

- [ ] **Step 1:** Root `README.md`: extend the Mission Control section with the native UI tab note.
- [ ] **Step 2:** `docs/handbook/docs/00_FOUNDATION/ARCHITECTURE_CONSTITUTION.md`: add a Phase 7 entry ("Mission Control Native UI") summarizing architecture, tabs, and verification numbers, and update the "Ready to Think About Money" test count.
- [ ] **Step 3:** Record this plan's status (implemented → folded like the fork plan; the design companion `2026-07-29-mission-control-fork-design.md` stays).
- [ ] **Commit:** `docs: document Mission Control native UI`

### Task 8.3: Full verification pass

- [ ] **Step 1:** `pnpm lint` (root) and `cd mission-control && pnpm typecheck` — both exit 0.
- [ ] **Step 2:** `pnpm test` (root) and `cd mission-control && pnpm test` — green, no new failures vs. fork baseline.
- [ ] **Step 3:** `pnpm validate-config` — `PASSED — 0 errors`.
- [ ] **Step 4:** Run the new E2E config; all specs pass.
- [ ] **Step 5:** Manual walkthrough of the iframe tab to confirm it is byte-for-byte unaffected.

---

## Traceability (nav item → endpoint → Kollektiv component)

| MC nav item | Endpoint(s) | Kollektiv component | Phase |
|---|---|---|---|
| Overview | `/api/status?action=dashboard`, `/api/sessions`, `/api/claude/sessions`, `/api/events` | `panels/OverviewPanel` + widgets | 2 |
| Agents | `/api/agents`, `/api/agents/register`, `/api/agents/[id]/*` | `panels/AgentsPanel` | 3.1 |
| Tasks | `/api/tasks`, `/api/tasks/queue`, `/api/tasks/[id]/*` | `panels/TasksPanel` | 3.2 |
| Skills | `/api/skills`, `/api/skills/registry` | `panels/SkillsPanel` | 3.3 |
| Memory | `/api/memory`, `/api/memory/search`, `/api/memory/graph`, `/api/memory/context` | `panels/MemoryPanel` | 3.4 |
| Channels | `/api/channels` | `panels/ChannelsPanel` | 3.5 |
| Chat | `/api/chat/*` (+ WS, Phase 7) | `panels/ChatPanel` | 3.6 |
| Activity | `/api/activities`, `/api/events` | `panels/ActivityPanel` | 4.1 |
| Logs | `/api/logs` | `panels/LogsPanel` | 4.2 |
| Cost Tracker | `/api/tokens`, `/api/tokens/by-agent` | `panels/CostTrackerPanel` | 4.3 |
| Nodes | `/api/nodes` | `panels/NodesPanel` | 4.4 |
| Approvals | `/api/exec-approvals` | `panels/ApprovalsPanel` | 4.5 |
| Office | `/api/standup` (verify) | `panels/OfficePanel` | 4.6 |
| Monitor | `/api/system-monitor` | `panels/MonitorPanel` | 4.7 |
| Cron | `/api/scheduler` (verify) | `panels/CronPanel` | 5.1 |
| Webhooks | `/api/webhooks`, `/api/webhooks/test` | `panels/WebhooksPanel` | 5.2 |
| Alerts | `/api/alerts` (verify) | `panels/AlertsPanel` | 5.3 |
| GitHub | `/api/github` | `panels/GitHubPanel` | 5.4 |
| Security | `/api/security-audit`, `/api/security-scan` | `panels/SecurityPanel` | 6.1 |
| Users | `/api/auth/users` | `panels/UsersPanel` | 6.2 |
| Audit | `/api/audit` | `panels/AuditPanel` | 6.3 |
| Gateways | `/api/gateways`, `/api/gateways/health`, `/api/gateways/connect`, `/api/gateways/control` | `panels/GatewaysPanel` | 6.4 |
| Gateway Config | `/api/gateway-config` | `panels/GatewayConfigPanel` | 6.5 |
| Integrations | `/api/integrations` | `panels/IntegrationsPanel` | 6.6 |
| Debug | `/api/debug` | `panels/DebugPanel` | 6.7 |
| Settings | `/api/settings` | `panels/SettingsPanel` | 6.8 |
| Local Terminal | (PTY, tmux — Windows) | **omitted** (mirrors upstream gating) | — |
| Super Admin / Google Auth / OpenClaw update | — | local-mode empty states | 6 |

## Risks / notes for review

- **Scope is large** (~26 recreated screens). Phases 0–2 deliver the visible core; 3–6 are repetitive apply-the-pattern work. If you want a shorter first milestone, everything through Phase 2 is a complete, shippable vertical slice.
- **Payload shapes** are confirmed per-task from route files, not guessed here — the confirm-shape step is mandatory and precedes every mapper.
- **Chat realtime** depends on MC's WebSocket path through the proxy; REST-first keeps Phase 3.6 independent of it.
- **No changes to `mission-control/`** — if a needed endpoint misbehaves, it's flagged rather than patched upstream in this plan.
- The iframe tab is regression-tested in Phase 8 (E2E spec 5 + manual walkthrough).

## Checklist — plan approval

- [x] User approved execution (`proceed to execute mission control native ui plans`).
- [x] All phases 0–8 executed. `pnpm lint` clean; `pnpm test` green (1224 tests / 103 files); `mission-control/` untouched.
