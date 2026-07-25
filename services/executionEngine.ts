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
    async execute(plan: Plan): Promise<PlanResult> {
      _cancelled = false;
      const startTime = Date.now();
      const stepResults: StepResult[] = [];

      for (const step of plan.steps) {
        if (_cancelled) {
          return finish(plan, stepResults, planObservers, startTime, 'cancelled');
        }

        const result = await engine.executeStep(step, plan.intent);

        if (result.status === 'failed' && step.fallbackTo) {
          // Run fallback step
          const fallbackResult = await engine.executeStep(step.fallbackTo, plan.intent);
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
    async executeStep(step: PlanStep, intent: RouterIntent): Promise<StepResult> {
      const stepStart = Date.now();

      for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        try {
          // In production, this would dispatch to the actual capability,
          // service layer, provider router, or assistant tool loop.
          const output = await dispatchStep(step, intent);
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
// Lightweight — routes to the right executor based on step kind.
// Full capability/tool dispatch is wired in Layer 8 (infrastructure).

async function dispatchStep(step: PlanStep, _intent: RouterIntent): Promise<any> {
  switch (step.kind) {
    case 'context_assembly':
      return { context: 'workspace snapshot (stub)' };

    case 'capability_dispatch': {
      const cap = step.capabilityId ? capabilityRegistry.get(step.capabilityId) : undefined;
      if (!cap) {
        throw new Error(`Capability "${step.capabilityId}" not found`);
      }
      return { capability: cap.id, status: 'dispatched (stub)' };
    }

    case 'provider_call':
      return { provider: step.params?.provider || 'default', status: 'called (stub)' };

    case 'assistant_tool':
      return { tool: step.capabilityId, status: 'dispatched (stub)' };

    case 'mcp_call':
      return { mcpTool: step.capabilityId, status: 'dispatched (stub)' };

    case 'response_cleanup':
      return { status: 'cleaned (stub)' };

    case 'persistence':
      return { status: 'persisted (stub)' };

    case 'user_confirmation':
      return { status: 'confirmed (stub)' };

    case 'fallback':
      return { status: 'fallback executed (stub)' };

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
