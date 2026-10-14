// ─── Kollektiv Refiner Canvas — executor ─────────────────────────────────────
// Runs a graph sequentially in topological order. Runners are injected per node kind, so this module never
// imports llmService or any other service. Policy (tier-decide): a failed node's downstream is 'blocked' and
// skipped while independent branches continue; abort stops before the next node and leaves the rest 'dirty';
// a 'done' node with nothing stale upstream is a cache hit unless the caller names it in `only`.

import { downstreamOf, upstreamOf } from './graph';
import type { Graph, GraphNode, NodeKind, NodeOutput, NodeRunState } from './types';

/** An upstream node's output as one of a runner's inputs; carries the node so runners can tell a preset from
 *  a concept and read positions. */
export interface RunInput { node: GraphNode; output: NodeOutput }
export interface RunContext { signal?: AbortSignal }
export type Runner = (node: GraphNode, inputs: RunInput[], ctx: RunContext) => Promise<NodeOutput>;
export type Runners = Partial<Record<NodeKind, Runner>>;

export interface RunOptions {
  /** Merged over defaultRunners; shot / audio / generate have no default and must be supplied. */
  runners: Runners;
  /** Run these plus their downstream (and any stale ancestor they need) instead of everything stale. */
  only?: string[];
  /** Prior run states (store.getRunStates()); missing entries count as 'idle'. */
  states?: ReadonlyMap<string, NodeRunState>;
  signal?: AbortSignal;
  onState?: (nodeId: string, state: NodeRunState) => void;
}

export class GraphCycleError extends Error {
  constructor(readonly nodeIds: string[]) {
    super(`Canvas graph has a cycle through: ${nodeIds.join(', ')}`);
    this.name = 'GraphCycleError';
  }
}

/** Kahn's algorithm; among ready nodes the earliest in `graph.nodes` goes first, so runs are deterministic. */
export function topoOrder(graph: Graph): string[] {
  const ids = new Set(graph.nodes.map(n => n.id));
  const edges = graph.edges.filter(e => ids.has(e.source) && ids.has(e.target));
  const indegree = new Map(graph.nodes.map(n => [n.id, 0]));
  for (const e of edges) indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
  const remaining = [...graph.nodes];
  const order: string[] = [];
  while (remaining.length) {
    const i = remaining.findIndex(n => indegree.get(n.id) === 0);
    if (i === -1) throw new GraphCycleError(remaining.map(n => n.id));
    const id = remaining.splice(i, 1)[0].id;
    order.push(id);
    for (const e of edges) if (e.source === id) indegree.set(e.target, (indegree.get(e.target) ?? 0) - 1);
  }
  return order;
}

/** Inputs of `nodeId` in edge order (edge ids are unique per source/target pair, so edge order is total).
 *  Sources without an output are skipped. */
export function gatherInputs(graph: Graph, nodeId: string, outputs: ReadonlyMap<string, NodeOutput>): RunInput[] {
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  return graph.edges.flatMap(e => {
    const node = e.target === nodeId ? byId.get(e.source) : undefined;
    const output = outputs.get(e.source);
    return node && output ? [{ node, output }] : [];
  });
}

/** Preset texts (character / world / style) ahead of the concept text: the shared prefix every shot gets. */
export function buildPrefix(inputs: RunInput[]): string {
  const texts = (kind: NodeKind) => inputs.filter(i => i.node.kind === kind).map(i => i.output.text ?? '');
  return [...texts('preset'), ...texts('concept')].filter(Boolean).join('\n\n');
}

export const defaultRunners: Runners = {
  concept: node => Promise.resolve({ text: node.kind === 'concept' ? node.data.text : '' }),
  preset: node => Promise.resolve({ text: node.kind === 'preset' ? node.data.text : '' }),
  assemble: (_node, inputs) => Promise.resolve({
    clips: [...inputs]
      .sort((a, b) => a.node.position.x - b.node.position.x)
      .flatMap(i => i.output.clips ?? (i.output.clip ? [i.output.clip] : [])),
  }),
  // ponytail: passes the first input through; a Result fed by several nodes would need a merge rule.
  result: (_node, inputs) => Promise.resolve(inputs[0]?.output ?? {}),
};

export async function runGraph(graph: Graph, opts: RunOptions): Promise<Map<string, NodeRunState>> {
  const order = topoOrder(graph);
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const runners: Runners = { ...defaultRunners, ...opts.runners };
  const prior = (id: string): NodeRunState => opts.states?.get(id) ?? { status: 'idle' };
  const states = new Map(order.map(id => [id, prior(id)]));
  const set = (id: string, state: NodeRunState) => {
    states.set(id, state);
    opts.onState?.(id, state);
  };
  const markDirty = (id: string) => {
    const output = prior(id).output;
    set(id, output ? { status: 'dirty', output } : { status: 'dirty' });
  };

  const notDone = order.filter(id => prior(id).status !== 'done' || !prior(id).output);
  const stale = new Set([...notDone, ...downstreamOf(graph, notDone)]);
  let toRun = stale;
  if (opts.only) {
    const picked = new Set([...opts.only.filter(id => byId.has(id)), ...downstreamOf(graph, opts.only)]);
    toRun = new Set([...picked, ...[...upstreamOf(graph, picked)].filter(id => stale.has(id))]);
    // Stale nodes this run leaves alone are reported as such rather than as a cache hit.
    for (const id of order) if (stale.has(id) && !toRun.has(id) && prior(id).status === 'done') markDirty(id);
  }

  const outputs = new Map<string, NodeOutput>();
  for (const [id, st] of states) if (st.status === 'done' && st.output) outputs.set(id, st.output);

  const pending = order.filter(id => toRun.has(id));
  for (let i = 0; i < pending.length; i++) {
    const id = pending[i];
    const node = byId.get(id);
    if (!node) continue;
    if (opts.signal?.aborted) {
      pending.slice(i).forEach(markDirty);
      break;
    }
    const failed = graph.edges.find(e => e.target === id && states.get(e.source)?.status !== 'done');
    if (failed) {
      const status = states.get(failed.source)?.status;
      set(id, { status: 'blocked', error: `Upstream node ${failed.source} ${status === 'error' ? 'failed' : `is ${status}`}` });
      outputs.delete(id);
      continue;
    }
    const runner = runners[node.kind];
    if (!runner) {
      set(id, { status: 'error', error: `No runner for '${node.kind}' nodes` });
      outputs.delete(id);
      continue;
    }
    set(id, { status: 'running' });
    try {
      const output = await runner(node, gatherInputs(graph, id, outputs), { signal: opts.signal });
      outputs.set(id, output);
      set(id, { status: 'done', output });
    } catch (err) {
      if (opts.signal?.aborted) {
        pending.slice(i).forEach(markDirty);
        break;
      }
      outputs.delete(id);
      set(id, { status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }
  return states;
}
