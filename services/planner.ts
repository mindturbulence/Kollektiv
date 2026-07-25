/**
 * Planner — Layer 3 of the MCP Architecture.
 *
 * Takes a classified RouterIntent (Layer 2) and produces an ordered Plan
 * that the Execution Engine (Layer 4) can run.
 *
 * Plans are deliberately lightweight — a typical job is 2-5 steps:
 *   context assembly → provider/tool call → response cleanup → persistence
 *
 * The planner favours a small decision tree over a full agent scheduler.
 * See docs/handbook/docs/01_AI_ENGINE/PLANNER.md for the design rationale.
 */

import type { RouterIntent } from './intentRouter';

// ─── Types ────────────────────────────────────────────────────────────────

export type PlanStepKind =
  | 'context_assembly'
  | 'capability_dispatch'
  | 'provider_call'
  | 'assistant_tool'
  | 'mcp_call'
  | 'response_cleanup'
  | 'persistence'
  | 'user_confirmation'
  | 'fallback';

export interface PlanStep {
  kind: PlanStepKind;
  description: string;
  /** The capability id this step executes, if applicable. */
  capabilityId?: string;
  /** Parameters to pass to the executor. */
  params?: Record<string, any>;
  /** Whether this step is optional (errors are logged but don't fail the plan). */
  optional?: boolean;
  /** If set, execution continues here only when the primary step fails. */
  fallbackTo?: PlanStep;
}

export interface Plan {
  /** Unique plan id for tracing. */
  id: string;
  /** The intent that produced this plan. */
  intent: RouterIntent;
  /** Ordered steps. */
  steps: PlanStep[];
  /** Expected output description. */
  expectedOutput: string;
  /** Whether the user must confirm before the plan starts. */
  requiresConfirmation: boolean;
  /** Whether any step may persist data. */
  persistsData: boolean;
}

// ─── Planner ──────────────────────────────────────────────────────────────

let _planIdCounter = 0;

/**
 * Produce a Plan from a classified intent.
 *
 * The decision tree mirrors the architecture doc:
 *   - prompt transformation   → refinement path
 *   - in-app action           → assistant tool loop
 *   - visual analysis         → multimodal analysis path
 *   - purely informational    → local assistant, keep answer concise
 */
export function plan(intent: RouterIntent): Plan {
  const id = `plan_${++_planIdCounter}_${Date.now()}`;

  switch (intent.category) {
    case 'prompt_refinement':
      return buildRefinementPlan(id, intent);
    case 'media_generation':
      return buildMediaGenerationPlan(id, intent);
    case 'analysis':
      return buildAnalysisPlan(id, intent);
    case 'retrieval':
      return buildRetrievalPlan(id, intent);
    case 'navigation':
      return buildNavigationPlan(id, intent);
    case 'settings_change':
      return buildSettingsPlan(id, intent);
    case 'vault_operation':
      return buildVaultPlan(id, intent);
    case 'web_action':
      return buildWebActionPlan(id, intent);
    case 'assistant_action':
      return buildAssistantActionPlan(id, intent);
    default:
      return buildFallbackPlan(id, intent);
  }
}

// ─── Plan builders per category ───────────────────────────────────────────

function buildRefinementPlan(id: string, intent: RouterIntent): Plan {
  const steps: PlanStep[] = [
    {
      kind: 'context_assembly',
      description: 'Gather current prompt, modifiers, and workspace context',
    },
    {
      kind: 'capability_dispatch',
      description: 'Run the refinement capability',
      capabilityId: intent.capabilityId || 'refine_prompt',
      params: { input: intent.rawInput },
    },
    {
      kind: 'response_cleanup',
      description: 'Strip reasoning tags and format the response',
      optional: true,
    },
  ];

  return {
    id,
    intent,
    steps,
    expectedOutput: 'Refined or rewritten prompt text ready for the user',
    requiresConfirmation: false,
    persistsData: false,
  };
}

function buildMediaGenerationPlan(id: string, intent: RouterIntent): Plan {
  const steps: PlanStep[] = [
    {
      kind: 'context_assembly',
      description: 'Build generation context — prompt, style, negative prompt',
      params: { entities: intent.entities },
    },
    {
      kind: 'provider_call',
      description: 'Call the generation provider (Gemini / Imagen / Veo)',
      params: { provider: 'gemini', entities: intent.entities },
    },
    {
      kind: 'persistence',
      description: 'Save generated result and metadata to the vault',
      optional: true,
    },
  ];

  return {
    id,
    intent,
    steps,
    expectedOutput: 'Generated image or video with metadata',
    requiresConfirmation: true,
    persistsData: true,
  };
}

function buildAnalysisPlan(id: string, intent: RouterIntent): Plan {
  const steps: PlanStep[] = [
    {
      kind: 'context_assembly',
      description: 'Locate the target prompt, image, or data to analyse',
      params: { entities: intent.entities },
    },
    {
      kind: 'capability_dispatch',
      description: 'Run the analysis capability',
      capabilityId: intent.capabilityId || 'analyze_prompt',
      params: { input: intent.rawInput },
    },
    {
      kind: 'response_cleanup',
      description: 'Structure the analysis into readable output',
      optional: true,
    },
  ];

  return {
    id,
    intent,
    steps,
    expectedOutput: 'Structured analysis with findings and recommendations',
    requiresConfirmation: false,
    persistsData: false,
  };
}

function buildRetrievalPlan(id: string, intent: RouterIntent): Plan {
  const steps: PlanStep[] = [
    {
      kind: 'context_assembly',
      description: 'Search vault and local storage for matching content',
    },
    {
      kind: 'capability_dispatch',
      description: 'Execute search against local data sources',
      capabilityId: intent.capabilityId || 'search_memories',
      params: { query: intent.rawInput },
      fallbackTo: {
        kind: 'provider_call',
        description: 'Fall back to LLM for contextual retrieval',
        capabilityId: 'search_memories',
        params: { query: intent.rawInput },
      },
    },
  ];

  return {
    id,
    intent,
    steps,
    expectedOutput: 'Relevant search results from workspace memory',
    requiresConfirmation: false,
    persistsData: false,
  };
}

function buildNavigationPlan(id: string, intent: RouterIntent): Plan {
  return {
    id,
    intent,
    steps: [
      {
        kind: 'assistant_tool',
        description: 'Navigate to the requested page',
        capabilityId: 'navigate',
        params: { page: intent.entities?.page || intent.rawInput },
      },
    ],
    expectedOutput: 'User is taken to the target page',
    requiresConfirmation: false,
    persistsData: false,
  };
}

function buildSettingsPlan(id: string, intent: RouterIntent): Plan {
  return {
    id,
    intent,
    steps: [
      {
        kind: 'user_confirmation',
        description: 'Confirm settings change with the user',
      },
      {
        kind: 'assistant_tool',
        description: 'Apply the requested settings change',
        capabilityId: 'update_settings',
      },
    ],
    expectedOutput: 'Setting is updated and confirmed',
    requiresConfirmation: true,
    persistsData: true,
  };
}

function buildVaultPlan(id: string, intent: RouterIntent): Plan {
  return {
    id,
    intent,
    steps: [
      {
        kind: 'capability_dispatch',
        description: 'Write or save to the vault',
        capabilityId: intent.capabilityId || 'save_file',
        params: { input: intent.rawInput },
      },
    ],
    expectedOutput: 'Content is saved to the vault',
    requiresConfirmation: true,
    persistsData: true,
  };
}

function buildWebActionPlan(id: string, intent: RouterIntent): Plan {
  return {
    id,
    intent,
    steps: [
      {
        kind: 'assistant_tool',
        description: 'Execute the web action (search / browse / fetch)',
        capabilityId: intent.capabilityId || 'web_search',
      },
    ],
    expectedOutput: 'Result from the web action',
    requiresConfirmation: false,
    persistsData: false,
  };
}

function buildAssistantActionPlan(id: string, intent: RouterIntent): Plan {
  return {
    id,
    intent,
    steps: [
      {
        kind: 'assistant_tool',
        description: 'Execute the assistant action (remember / note / clip)',
        capabilityId: 'remember',
      },
    ],
    expectedOutput: 'Assistant performs the requested action',
    requiresConfirmation: false,
    persistsData: true,
  };
}

function buildFallbackPlan(id: string, intent: RouterIntent): Plan {
  return {
    id,
    intent,
    steps: [
      {
        kind: 'provider_call',
        description: 'Route to the active LLM for general response',
        params: { input: intent.rawInput },
      },
    ],
    expectedOutput: 'General assistant response',
    requiresConfirmation: false,
    persistsData: false,
  };
}
