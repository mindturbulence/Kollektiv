// Custom xyflow node components. Nodes show a collapsed summary only; text and beats are edited in the
// side Inspector. All colours come from daisyUI tokens so the app theme wins.

import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { NodeKind, NodeRunStatus } from '../core/types';
import { shotSummary, type CanvasFlowNode } from './flow';
import { getPreview } from './media';
import { canGenerate } from './runners';

export const STATUS_BADGE: Record<NodeRunStatus, string> = {
  idle: 'badge-ghost',
  dirty: 'badge-warning',
  running: 'badge-info animate-pulse',
  done: 'badge-success',
  error: 'badge-error',
  blocked: 'badge-neutral',
};

export const KIND_LABEL: Record<NodeKind, string> = {
  concept: 'Concept',
  preset: 'Preset',
  shot: 'Shot',
  audio: 'Audio',
  generate: 'Generate',
  result: 'Result',
  assemble: 'Assemble',
};

export function StatusBadge({ status }: { status: NodeRunStatus }) {
  return <span className={`badge badge-xs rounded-none uppercase ${STATUS_BADGE[status]}`} data-status={status}>{status}</span>;
}

const clamp = 'line-clamp-3 whitespace-pre-wrap break-words';

interface ShellProps {
  props: NodeProps<CanvasFlowNode>;
  title: string;
  hasInput: boolean;
  hasOutput?: boolean;
  children?: React.ReactNode;
}

function NodeShell({ props, title, hasInput, hasOutput = true, children }: ShellProps) {
  const { status, error } = props.data;
  return (
    <div
      className={`w-52 border bg-base-100 text-base-content text-xs shadow-sm ${props.selected ? 'border-primary' : 'border-base-content/25'}`}
      data-testid={`canvas-node-${props.data.graphNode.kind}`}
    >
      {hasInput && <Handle type="target" position={Position.Left} className="!bg-primary" />}
      <div className="flex items-center justify-between gap-2 border-b border-base-content/15 px-2 py-1">
        <span className="font-semibold uppercase tracking-wider text-primary">{title}</span>
        <StatusBadge status={status} />
      </div>
      <div className="space-y-1 px-2 py-1.5 text-base-content/80">{children}</div>
      {error && <div className="border-t border-error/40 px-2 py-1 text-error line-clamp-2" title={error}>{error}</div>}
      {hasOutput && <Handle type="source" position={Position.Right} className="!bg-primary" />}
    </div>
  );
}

const empty = <span className="italic text-base-content/40">Empty</span>;

const ConceptNode = React.memo(function ConceptNode(props: NodeProps<CanvasFlowNode>) {
  const g = props.data.graphNode;
  if (g.kind !== 'concept') return null;
  return (
    <NodeShell props={props} title="Concept" hasInput={false}>
      <p className={clamp}>{g.data.text || empty}</p>
    </NodeShell>
  );
});

const PresetNode = React.memo(function PresetNode(props: NodeProps<CanvasFlowNode>) {
  const g = props.data.graphNode;
  if (g.kind !== 'preset') return null;
  return (
    <NodeShell props={props} title={`Preset · ${g.data.presetKind}`} hasInput={false}>
      <p className={clamp}>{g.data.text || empty}</p>
    </NodeShell>
  );
});

const ShotNode = React.memo(function ShotNode(props: NodeProps<CanvasFlowNode>) {
  const g = props.data.graphNode;
  if (g.kind !== 'shot') return null;
  const { firstLine, beats } = shotSummary(g.data.text);
  return (
    <NodeShell props={props} title="Shot" hasInput>
      <div className="flex justify-between gap-2">
        <span className="truncate" title={g.data.model}>{g.data.model || <span className="italic text-warning">No model</span>}</span>
        <span className="shrink-0">{g.data.durationSec}s</span>
      </div>
      <p className="truncate">{firstLine || empty}</p>
      <p className="text-base-content/50">{beats} {beats === 1 ? 'beat' : 'beats'}</p>
    </NodeShell>
  );
});

const AudioNode = React.memo(function AudioNode(props: NodeProps<CanvasFlowNode>) {
  const g = props.data.graphNode;
  if (g.kind !== 'audio') return null;
  return (
    <NodeShell props={props} title={`Audio · ${g.data.mode}`} hasInput={false}>
      {g.data.mode === 'off' ? <p className="text-base-content/50">Silent</p> : <p className={clamp}>{g.data.dialogue || g.data.sfx || empty}</p>}
    </NodeShell>
  );
});

// Generate / Result / Assemble get real behaviour in later tickets (N8, N9); until then they only need to
// render so a loaded graph never crashes.
function placeholder(kind: 'generate' | 'result' | 'assemble', hasOutput: boolean) {
  return React.memo(function PlaceholderNode(props: NodeProps<CanvasFlowNode>) {
    return (
      <NodeShell props={props} title={KIND_LABEL[kind]} hasInput hasOutput={hasOutput}>
        <p className="text-base-content/50">Not available yet</p>
      </NodeShell>
    );
  });
}

const GenerateNode = React.memo(function GenerateNode(props: NodeProps<CanvasFlowNode>) {
  const g = props.data.graphNode;
  if (g.kind !== 'generate') return null;
  return (
    <NodeShell props={props} title="Generate" hasInput>
      <p className={clamp}>{g.data.model || 'Choose a model in the inspector'}</p>
      {g.data.model && !canGenerate(g.data.model) && <p className="text-base-content/50">Prompt only: copy it from Result.</p>}
    </NodeShell>
  );
});

const ResultNode = React.memo(function ResultNode(props: NodeProps<CanvasFlowNode>) {
  const out = props.data.output;
  const preview = out?.clip ? getPreview(out.clip.assetKey) : undefined;
  return (
    <NodeShell props={props} title="Result" hasInput hasOutput={false}>
      {preview && <video className="nodrag w-full" src={preview} controls muted />}
      {out?.clip && !preview && <p className="text-base-content/70">Saved to Gallery.</p>}
      {out?.text && !out.clip && <p className={clamp}>{out.text}</p>}
      {!out && <p className="text-base-content/50">Run the graph to see the result.</p>}
      {out?.text && (
        <button type="button" className="nodrag btn btn-xs btn-ghost rounded-none"
          onClick={() => { void navigator.clipboard?.writeText(out.text ?? ''); }}>Copy prompt</button>
      )}
    </NodeShell>
  );
});

export const nodeTypes = {
  concept: ConceptNode,
  preset: PresetNode,
  shot: ShotNode,
  audio: AudioNode,
  generate: GenerateNode,
  result: ResultNode,
  assemble: placeholder('assemble', true),
} satisfies Record<NodeKind, React.ComponentType<NodeProps<CanvasFlowNode>>>;
