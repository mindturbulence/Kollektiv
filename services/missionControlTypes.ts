/**
 * Mission Control API payload types (Kollektiv-native recreation).
 *
 * Shapes confirmed from the MC API route files (app/api/*) on 2026-07-31:
 * - auth/me + auth/login: CurrentUser
 * - status?action=dashboard: SystemStatus + DbStats
 * - claude/sessions: ClaudeSessionsResponse (sessions + stats)
 * - events: SSE frames `{ type, data, timestamp }`
 * - agents: AgentsResponse (agents + taskStats)
 * - tasks: TasksResponse
 *
 * Fields are defensive (optional where the upstream mapper may omit them) so the
 * native UI degrades gracefully instead of crashing on a missing column.
 */

export interface McCurrentUser {
  id: number;
  username: string;
  display_name: string | null;
  role: string;
  provider?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  workspace_id?: number;
  tenant_id?: number;
}

export interface McMeResponse {
  user: McCurrentUser;
}

export interface McSystemMemory {
  total: number;
  used: number;
  available: number;
}

export interface McSystemDisk {
  total: string;
  used: string;
  available: string;
  usage: string;
}

export interface McSystemStatus {
  timestamp: number;
  uptime: number;
  memory: McSystemMemory;
  disk: McSystemDisk;
  sessions: { total: number; active: number };
  processes: Array<{ pid: string; command: string }>;
}

export interface McDbStats {
  tasks: { total: number; byStatus: Record<string, number> };
  agents: { total: number; byStatus: Record<string, number> };
  audit: { day: number; week: number; loginFailures: number };
  activities: { day: number };
  notifications: { unread: number };
  pipelines: { active: number; recentDay: number };
  backup: { name: string; size: number; age_hours: number } | null;
  dbSizeBytes: number;
  webhookCount: number;
}

export interface McDashboardData extends McSystemStatus {
  db: McDbStats | null;
}

export interface McClaudeStats {
  total_sessions: number;
  active_sessions: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_estimated_cost: number;
  unique_projects: number;
}

export interface McClaudeSession {
  id: number;
  session_id: string;
  project_slug: string;
  project_path?: string | null;
  model?: string | null;
  git_branch?: string | null;
  user_messages: number;
  assistant_messages: number;
  tool_uses: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
  first_message_at?: string | null;
  last_message_at?: string | null;
  last_user_prompt?: string | null;
  is_active: number;
  scanned_at: number;
  created_at: number;
  updated_at: number;
}

export interface McClaudeSessionsResponse {
  sessions: McClaudeSession[];
  total: number;
  stats: McClaudeStats;
}

/** A merged gateway + local session row (GET /api/sessions). */
export interface McSession {
  sessionId?: string;
  id?: string;
  agent?: string;
  key?: string;
  active?: boolean;
  updatedAt?: number;
  startTime?: number;
  lastActivity?: number;
  kind?: string;
  model?: string;
  lastUserPrompt?: string;
  workspace_id?: number;
  [k: string]: unknown;
}

export interface McSessionsResponse {
  sessions: McSession[];
}

export interface McAgentTaskStats {
  total: number;
  assigned: number;
  in_progress: number;
  quality_review: number;
  done: number;
  completed: number;
}

export interface McAgent {
  id: number;
  name: string;
  role: string;
  session_key?: string | null;
  soul_content?: string | null;
  status: 'offline' | 'idle' | 'busy' | 'error' | string;
  last_seen?: number | null;
  last_activity?: string | null;
  created_at: number;
  updated_at: number;
  config?: string | null;
  hidden?: number;
  runtime_type?: string | null;
  taskStats?: McAgentTaskStats;
  [k: string]: unknown;
}

export interface McAgentsResponse {
  agents: McAgent[];
  total: number;
  page: number;
  limit: number;
}

export interface McTask {
  id: number;
  title: string;
  description?: string | null;
  status: 'inbox' | 'assigned' | 'in_progress' | 'review' | 'quality_review' | 'done' | string;
  priority: 'low' | 'medium' | 'high' | 'urgent' | string;
  assigned_to?: string | null;
  created_by?: string;
  created_at: number;
  updated_at: number;
  due_date?: number | null;
  estimated_hours?: number | null;
  actual_hours?: number | null;
  tags?: string | null;
  metadata?: string | null;
  ticket_id?: string;
  project_id?: number;
  [k: string]: unknown;
}

export interface McTasksResponse {
  tasks: McTask[];
  total: number;
  page: number;
  limit: number;
}

/** An SSE frame from GET /api/events. */
export interface McActivityEvent {
  type: string;
  data: Record<string, unknown> | null;
  timestamp: number;
}

export interface McLogLike {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug' | string;
  source: string;
  message: string;
  [k: string]: unknown;
}

export interface McActivity {
  id: number;
  type: string;
  entity_type?: string;
  entity_id?: number;
  actor?: string;
  description?: string;
  data?: string | null;
  created_at: number;
  [k: string]: unknown;
}

export interface McAuditEntry {
  id: number;
  action: string;
  actor: string;
  actor_id?: number | null;
  target_type?: string | null;
  target_id?: number | null;
  detail?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: number;
}

export interface McTokenUsage {
  id?: number;
  agent?: string;
  session_key?: string;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  estimated_cost?: number;
  created_at?: number;
  date?: string;
  [k: string]: unknown;
}

export interface McApproval {
  id: number;
  requester?: string;
  action?: string;
  status?: string;
  reason?: string | null;
  created_at?: number;
  expires_at?: number;
  [k: string]: unknown;
}

/** A gateway row (GET /api/gateways — tokens redacted server-side). */
export interface McGateway {
  id: number;
  name: string;
  host: string;
  port: number;
  token: string;
  token_set?: boolean;
  is_primary?: number;
  status?: string;
  last_seen?: number | null;
  latency?: number | null;
  sessions_count?: number;
  agents_count?: number;
  created_at?: number;
  updated_at?: number;
  [k: string]: unknown;
}

export interface McGatewaysResponse {
  gateways: McGateway[];
}

/** An alert rule row (GET /api/alerts). */
export interface McAlertRule {
  id: number;
  name: string;
  description?: string | null;
  enabled?: number | boolean;
  entity_type?: string;
  condition_field?: string;
  condition_operator?: string;
  condition_value?: string;
  action_type?: string;
  cooldown_minutes?: number;
  last_triggered_at?: number | null;
  trigger_count?: number;
  created_at?: number;
  updated_at?: number;
  [k: string]: unknown;
}

export interface McAlertsResponse {
  rules?: McAlertRule[];
}

/** A cron job row (GET /api/cron?action=list). */
export interface McCronJob {
  id: string;
  name: string;
  schedule: string;
  command: string;
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
  lastStatus?: 'success' | 'error' | 'running' | string;
  lastError?: string;
  agentId?: string;
  [k: string]: unknown;
}

export interface McCronJobsResponse {
  jobs: McCronJob[];
}

/** A memory file-tree node (GET /api/memory?action=tree). */
export interface McMemoryFile {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: number;
  children?: McMemoryFile[];
}

export interface McMemoryTreeResponse {
  tree: McMemoryFile[];
}

/** A memory FTS search result (POST /api/memory/search). */
export interface McMemorySearchResult {
  path: string;
  title: string;
  snippet: string;
  rank: number;
}

export interface McMemorySearchResponse {
  query: string;
  results: McMemorySearchResult[];
  total: number;
  indexedFiles: number;
  indexedAt: string | null;
}

/** A webhook row as GET /api/webhooks returns it (events parsed, secret masked). */
export interface McWebhook {
  id: number;
  name?: string;
  url?: string;
  events?: string | string[];
  enabled?: number | boolean;
  secret?: string | null;
  created_at?: number;
  total_deliveries?: number;
  successful_deliveries?: number;
  failed_deliveries?: number;
  consecutive_failures?: number;
  circuit_open?: boolean;
  [k: string]: unknown;
}

export interface McWebhooksResponse {
  webhooks: McWebhook[];
}

/** A user row (GET /api/auth/users). */
export interface McUserRow {
  id: number;
  username: string;
  display_name?: string | null;
  role?: string;
  email?: string | null;
  provider?: string | null;
  avatar_url?: string | null;
  is_approved?: number;
  workspace_id?: number;
  tenant_id?: number;
  [k: string]: unknown;
}

export interface McUsersResponse {
  users: McUserRow[];
}

/** A settings row (GET /api/settings). */
export interface McSettingRow {
  key: string;
  value: string;
  description?: string;
  category: string;
  updated_by?: string | null;
  updated_at?: number | null;
  is_default?: boolean;
}

export interface McSettingsResponse {
  settings: McSettingRow[];
  grouped: Record<string, McSettingRow[]>;
}

/** Gateway config response (GET /api/gateway-config). */
export interface McGatewayConfigResponse {
  path?: string;
  config?: Record<string, unknown>;
  raw_size?: number;
  hash?: string;
  [k: string]: unknown;
}

export interface McSchedulerJob {
  id: number;
  name?: string;
  schedule?: string;
  command?: string;
  enabled?: number;
  last_run?: number | null;
  next_run?: number | null;
  [k: string]: unknown;
}

export interface McGithubStats {
  repositories?: number;
  open_prs?: number;
  synced_at?: number;
  [k: string]: unknown;
}
