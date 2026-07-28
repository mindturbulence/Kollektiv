/**
 * Execution Engine — Layer 4 of the MCP Architecture.
 *
 * Takes a Plan (Layer 3) and executes its steps sequentially.
 * Handles:
 *   - step sequencing (ordered, optional, fallback)
 *   - error handling with optional step skipping
 *   - retry for transient failures
 *   - plan lifecycle events (start, step, complete, fail)
 *
 * The execution engine is intentionally synchronous in its step loop
 * — each step awaits the previous one.  Parallel step execution is a
 * future optimisation.
 */

import type { Plan, PlanStep } from './planner';
import { capabilityRegistry } from './capabilityRegistry';
import type { RouterIntent } from './intentRouter';
import type { ToolContext } from './tools/types';

// ─── Types ────────────────────────────────────────────────────────────────

export type StepStatus = 'pending' | 'running' | 'completed' | 'skipped' | 'failed';

export interface StepResult {
  step: PlanStep;
  status: StepStatus;
  duration: number; // ms
  output?: any;
  error?: string;
}

export type PlanStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface PlanResult {
  planId: string;
  status: PlanStatus;
  steps: StepResult[];
  totalDuration: number;
  error?: string;
}

/** Callback fired on each step completion. */
export type StepObserver = (result: StepResult, plan: Plan) => void;

/** Callback fired when the entire plan finishes. */
export type PlanObserver = (result: PlanResult, plan: Plan) => void;

export interface EngineOptions {
  /** Maximum retries per step for transient errors. */
  maxRetries?: number;
  /** Delay between retries in ms. */
  retryDelayMs?: number;
  /** Whether to skip optional steps on failure (default: true). */
  skipOptionalOnError?: boolean;
}

// ─── Defaults ─────────────────────────────────────────────────────────────

const DEFAULTS: Required<EngineOptions> = {
  maxRetries: 2,
  retryDelayMs: 500,
  skipOptionalOnError: true,
};

// ─── Execution Engine ─────────────────────────────────────────────────────

export function createExecutionEngine(options?: EngineOptions) {
  const opts: Required<EngineOptions> = { ...DEFAULTS, ...options };
  const stepObservers: StepObserver[] = [];
  const planObservers: PlanObserver[] = [];

  let _cancelled = false;

  const engine = {
    /** Register a per-step completion observer. */
    onStep(fn: StepObserver): void {
      stepObservers.push(fn);
    },

    /** Register a plan-level completion observer. */
    onPlanComplete(fn: PlanObserver): void {
      planObservers.push(fn);
    },

    /** Cancel the currently running plan. */
    cancel(): void {
      _cancelled = true;
    },

    /**
     * Execute a plan step by step.
     *
     * Steps flow:
     *   1. Check cancellation flag
     *   2. Run the step via `executeStep`
     *   3. On failure: if optional, skip; if fallback exists, run fallback; else fail
     *   4. Fire observers
     *   5. Continue to next step
     */
    async execute(plan: Plan, ctx: ToolContext): Promise<PlanResult> {
      _cancelled = false;
      const startTime = Date.now();
      const stepResults: StepResult[] = [];

      for (const step of plan.steps) {
        if (_cancelled) {
          return finish(plan, stepResults, planObservers, startTime, 'cancelled');
        }

        const result = await engine.executeStep(step, plan.intent, ctx);

        if (result.status === 'failed' && step.fallbackTo) {
          // Run fallback step
          const fallbackResult = await engine.executeStep(step.fallbackTo, plan.intent, ctx);
          stepResults.push(fallbackResult);

          // Fire step observers
          fireStepObservers(stepObservers, stepResults[stepResults.length - 1], plan);

          if (fallbackResult.status === 'failed') {
            if (step.optional && opts.skipOptionalOnError) {
              stepResults[stepResults.length - 1] = {
                ...fallbackResult,
                status: 'skipped',
                error: `Skipped after fallback failure: ${fallbackResult.error}`,
              };
            } else {
              return finish(plan, stepResults, planObservers, startTime, 'failed', fallbackResult.error);
            }
          }
        } else if (result.status === 'failed') {
          stepResults.push({ ...result, status: 'skipped' });

          // Fire step observers
          fireStepObservers(stepObservers, stepResults[stepResults.length - 1], plan);

          if (!(step.optional && opts.skipOptionalOnError)) {
            return finish(plan, stepResults, planObservers, startTime, 'failed', result.error);
          }
        } else {
          stepResults.push(result);

          // Fire step observers
          fireStepObservers(stepObservers, result, plan);
        }
      }

      return finish(plan, stepResults, planObservers, startTime, 'completed');
    },

    /**
     * Execute a single step with retry logic.
     */
    async executeStep(step: PlanStep, intent: RouterIntent, ctx: ToolContext): Promise<StepResult> {
      const stepStart = Date.now();

      for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        try {
          const output = await dispatchStep(step, intent, ctx);
          const duration = Date.now() - stepStart;
          return { step, status: 'completed', duration, output };
        } catch (err: any) {
          const isLastAttempt = attempt === opts.maxRetries;
          if (isLastAttempt) {
            const duration = Date.now() - stepStart;
            return {
              step,
              status: 'failed',
              duration,
              error: err instanceof Error ? err.message : String(err),
            };
          }
          // Wait before retry
          await sleep(opts.retryDelayMs);
        }
      }

      // Unreachable, but satisfies TypeScript
      return { step, status: 'failed', duration: Date.now() - stepStart, error: 'Max retries exceeded' };
    },

    /**
     * Validate a plan before execution.
     * Returns array of warnings (non-fatal) and errors (fatal).
     */
    validate(plan: Plan): { warnings: string[]; errors: string[] } {
      const warnings: string[] = [];
      const errors: string[] = [];

      if (plan.steps.length === 0) {
        errors.push('Plan has no steps');
      }

      for (const step of plan.steps) {
        if (step.capabilityId && !capabilityRegistry.get(step.capabilityId)) {
          warnings.push(`Capability "${step.capabilityId}" is not registered`);
        }
      }

      return { warnings, errors };
    },
  };

  return engine;
}

// ─── Step dispatcher ──────────────────────────────────────────────────────
//
// Real dispatch for capability_dispatch/assistant_tool (both call
// executeAssistantTool — see below) and for the one fully-generic
// provider_call shape (a plain text prompt, routed to the active LLM).
// Dynamic imports of ./assistantTools and ./llmService avoid a circular
// top-level import: assistantTools.ts imports this module already.
//
// Everything else (mcp_call, persistence, user_confirmation, fallback, and
// a provider_call with no plain-text input — e.g. media generation, which
// needs aspect ratio and gallery ingestion this layer doesn't have) throws
// an honest "not implemented" error rather than fabricating a success. A
// step marked `optional` is skipped gracefully by the engine on any thrown
// error, so this never blocks a plan that doesn't depend on it.

/** Runs a real assistant tool by name and turns its own error-string
 *  convention into a thrown error, so a failed tool call fails the step
 *  instead of reporting a false "completed". */
async function runAssistantTool(toolName: string, params: Record<string, any> | undefined, ctx: ToolContext): Promise<any> {
  const { executeAssistantTool } = await import('./assistantTools');
  const result = await executeAssistantTool(toolName, params ?? {}, ctx);
  if (result.startsWith('Error:') || result.startsWith('Error executing')) {
    throw new Error(result);
  }
  return { tool: toolName, result };
}

async function dispatchStep(step: PlanStep, intent: RouterIntent, ctx: ToolContext): Promise<any> {
  switch (step.kind) {
    case 'context_assembly':
      // No side effects to perform — just bundle what the plan already has.
      return { entities: intent.entities ?? {}, rawInput: intent.rawInput, params: step.params ?? {} };

    case 'capability_dispatch': {
      // Must resolve through the registry — an unregistered id is a real
      // "not found", not licence to treat the raw string as a tool name.
      const cap = step.capabilityId ? capabilityRegistry.get(step.capabilityId) : undefined;
      if (!cap) {
        throw new Error(`Capability "${step.capabilityId}" not found`);
      }
      if (cap.execution.kind !== 'assistant-tool' || !cap.execution.toolName) {
        throw new Error(`Capability "${cap.id}" has execution kind "${cap.execution.kind}", which this layer does not dispatch yet.`);
      }
      return runAssistantTool(cap.execution.toolName, step.params, ctx);
    }

    case 'assistant_tool': {
      // Here capabilityId IS the tool name directly — the planner writes
      // real tool names (e.g. 'navigate', 'remember') for this step kind.
      if (!step.capabilityId) {
        throw new Error('assistant_tool step has no capabilityId (tool name) to execute.');
      }
      return runAssistantTool(step.capabilityId, step.params, ctx);
    }

    case 'provider_call': {
      const input = step.params?.input;
      if (typeof input !== 'string' || !input.trim()) {
        throw new Error(
          `provider_call step has no plain-text "input" to route to the LLM — this pathway does not yet ` +
          `support "${step.description}". Use the dedicated UI for this action.`,
        );
      }
      const { streamChat } = await import('./llmService');
      let text = '';
      for await (const chunk of streamChat([{ role: 'user', content: input }], ctx.settings)) {
        text += chunk;
      }
      return { response: text };
    }

    case 'response_cleanup': {
      const text = step.params?.text;
      if (typeof text !== 'string') return { cleaned: null };
      const { cleanLLMResponse } = await import('./llmService');
      return { cleaned: cleanLLMResponse(text) };
    }

    case 'mcp_call':
      throw new Error('mcp_call dispatch is not implemented at this layer.');

    case 'persistence':
      throw new Error('persistence dispatch is not implemented at this layer.');

    case 'user_confirmation':
      throw new Error('user_confirmation dispatch is not implemented at this layer — no confirmation UI is wired here.');

    case 'fallback':
      throw new Error('fallback dispatch is not implemented at this layer.');

    default:
      throw new Error(`Unknown step kind: ${(step as any).kind}`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function fireStepObservers(observers: StepObserver[], result: StepResult, plan: Plan): void {
  for (const fn of observers) {
    try { fn(result, plan); } catch { /* observer errors are non-fatal */ }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function finish(
  plan: Plan,
  stepResults: StepResult[],
  observers: PlanObserver[],
  startTime: number,
  status: PlanStatus,
  error?: string,
): PlanResult {
  const result: PlanResult = {
    planId: plan.id,
    status,
    steps: stepResults,
    totalDuration: Date.now() - startTime,
    error,
  };

  // Fire plan observers
  for (const fn of observers) {
    try {
      fn(result, plan);
    } catch { /* observer errors are non-fatal */ }
  }

  return result;
}
