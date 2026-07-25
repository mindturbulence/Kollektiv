/**
 * Capability Registry — Layer 1 of the MCP Architecture.
 *
 * A capability is a named, contract-bound operation that the system can
 * perform.  Each capability has:
 *   - a stable id, human-readable name, and description
 *   - an input/output contract (JSON Schema)
 *   - an execution strategy (local, provider-bound, assistant-tool, or MCP)
 *   - a permission set that callers must satisfy
 *
 * The registry is a singleton that modules register into at startup.
 * The 5 public capability tools (capability_search, _describe, _execute,
 * _list, _health) are backed by this module.
 */

// ─── Types ────────────────────────────────────────────────────────────────

/** How a capability is executed. */
export type ExecutionKind = 'local' | 'provider' | 'assistant-tool' | 'mcp';

export interface CapabilityExecution {
  kind: ExecutionKind;
  /** Provider id when kind = 'provider' (e.g. 'gemini', 'ollama'). */
  provider?: string;
  /** Native tool name when kind = 'assistant-tool'. */
  toolName?: string;
  /** Whether the user must confirm before execution. */
  requiresConfirmation?: boolean;
}

export interface CapabilityContract {
  id: string;
  name: string;
  description: string;
  /** JSON Schema describing accepted input. */
  input: Record<string, any>;
  /** JSON Schema describing produced output. */
  output: Record<string, any>;
  execution: CapabilityExecution;
  /** Permission strings the caller needs (e.g. 'vault:write', 'gmail:send'). */
  permissions?: string[];
  /** Other capability ids this one depends on. */
  dependsOn?: string[];
  /** Tags for search/discovery. */
  tags?: string[];
  /** Whether this capability is currently available (provider reachable, etc.). */
  healthy?: boolean;
  /** Error message when healthy is false. */
  healthMessage?: string;
}

export interface CapabilityManifest {
  version: string;
  capabilities: CapabilityContract[];
}

// ─── Registry singleton ───────────────────────────────────────────────────

const _registry = new Map<string, CapabilityContract>();

/** Max results returned by search/list to prevent runaway output. */
const MAX_RESULTS = 50;

// ─── Public API ───────────────────────────────────────────────────────────

export const capabilityRegistry = {
  /**
   * Register one or more capabilities.  Idempotent — re-registering the same
   * id overwrites the previous entry (caller controls the last-write-wins
   * order).
   */
  register(...caps: CapabilityContract[]): void {
    for (const cap of caps) {
      if (!cap.id || !cap.name) {
        console.warn('[CapabilityRegistry] skipping invalid capability (missing id or name):', cap);
        continue;
      }
      _registry.set(cap.id, cap);
    }
  },

  /** Unregister a capability by id.  Returns true if it existed. */
  unregister(id: string): boolean {
    return _registry.delete(id);
  },

  /** Look up a single capability by exact id. */
  get(id: string): CapabilityContract | undefined {
    return _registry.get(id);
  },

  /** List all registered capabilities (optionally filtered by execution kind). */
  list(kind?: ExecutionKind): CapabilityContract[] {
    const all = Array.from(_registry.values());
    if (!kind) return all;
    return all.filter(c => c.execution.kind === kind);
  },

  /**
   * Search capabilities by keyword against id, name, description, and tags.
   * Case-insensitive substring match.
   */
  search(query: string): CapabilityContract[] {
    const q = query.toLowerCase();
    const results: CapabilityContract[] = [];
    for (const cap of _registry.values()) {
      if (results.length >= MAX_RESULTS) break;
      if (
        cap.id.toLowerCase().includes(q) ||
        cap.name.toLowerCase().includes(q) ||
        cap.description.toLowerCase().includes(q) ||
        (cap.tags && cap.tags.some(t => t.toLowerCase().includes(q)))
      ) {
        results.push(cap);
      }
    }
    return results;
  },

  /** Return a compact manifest for serialisation / export. */
  exportManifest(): CapabilityManifest {
    return {
      version: '1.0.0',
      capabilities: Array.from(_registry.values()),
    };
  },

  /** Count of registered capabilities. */
  get size(): number {
    return _registry.size;
  },

  /** Mark a capability as healthy or unhealthy with an optional message. */
  setHealth(id: string, healthy: boolean, message?: string): void {
    const cap = _registry.get(id);
    if (cap) {
      cap.healthy = healthy;
      cap.healthMessage = message;
    } else {
      console.warn(`[CapabilityRegistry] setHealth: unknown capability "${id}"`);
    }
  },
};
