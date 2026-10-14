// Side inspector: the editable fields of the selected node. Text inputs are debounced so typing is not
// one undo step per keystroke: a field commits after IDLE_MS of silence, on blur, and on unmount.
// The page renders <Inspector key={node.id}>, so a pending edit always flushes into the node it was typed in.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TARGET_VIDEO_AI_MODELS } from '../../constants/models';
import { parseShotScript, replaceBeat, serializeShotScript } from '../../utils/shotScript';
import type { AudioMode, GraphNode, NodeDataPatch, NodeRunState, PresetKind } from '../core/types';
import { KIND_LABEL, StatusBadge } from './nodes';
import { openClipsInVideoEditor } from './openClips';
import type { ClipRef } from '../core/types';

const IDLE_MS = 400;
const FIELD = 'nodrag nopan nowheel w-full rounded-none border border-base-content/25 bg-base-100 px-2 py-1 text-xs text-base-content focus:border-primary focus:outline-none';

interface DebouncedFieldProps {
  value: string;
  onCommit: (value: string) => void;
  rows?: number;
  type?: string;
  min?: number;
  label: string;
  className?: string;
}

export function DebouncedField({ value, onCommit, rows, type, min, label, className }: DebouncedFieldProps) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = useRef(false);
  const latest = useRef({ draft: value, onCommit });

  useEffect(() => {
    latest.current.onCommit = onCommit;
  });

  // Follow outside changes (undo, a finished run) unless the user has an unsent edit.
  useEffect(() => {
    if (!dirty.current) {
      latest.current.draft = value;
      setDraft(value);
    }
  }, [value]);

  const flush = useCallback(() => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
    if (dirty.current) {
      dirty.current = false;
      latest.current.onCommit(latest.current.draft);
    }
  }, []);

  useEffect(() => flush, [flush]);

  const change = (v: string) => {
    dirty.current = true;
    latest.current.draft = v;
    setDraft(v);
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = setTimeout(flush, IDLE_MS);
  };

  const common = { value: draft, 'aria-label': label, onBlur: flush, className: `${FIELD} ${className ?? ''}` };
  return rows
    ? <textarea {...common} rows={rows} onChange={e => change(e.target.value)} />
    : <input {...common} type={type ?? 'text'} min={min} onChange={e => change(e.target.value)} />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-wider text-base-content/60">{label}</span>
      {children}
    </label>
  );
}

const PRESET_KINDS: PresetKind[] = ['character', 'world', 'style'];
const AUDIO_MODES: AudioMode[] = ['off', 'auto', 'direct'];

export interface InspectorProps {
  node: GraphNode;
  run: NodeRunState;
  running: boolean;
  onUpdate: (patch: NodeDataPatch) => void;
  onRun: () => void;
  /** Rewrites one beat of the selected shot; rejects with a readable message on failure. */
  onRefineBeat?: (index: number, instruction: string) => Promise<void>;
}

export function Inspector({ node, run, running, onUpdate, onRun, onRefineBeat }: InspectorProps) {
  const runnable = node.kind === 'shot' || node.kind === 'audio' || node.kind === 'concept' || node.kind === 'preset';
  return (
    <aside className="flex h-full w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-base-content/20 bg-base-100 p-3 text-xs" aria-label="Node inspector">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold uppercase tracking-wider text-primary">{KIND_LABEL[node.kind]}</h2>
        <StatusBadge status={run.status} />
      </div>
      {run.error && <p className="border border-error/40 p-2 text-error">{run.error}</p>}

      {node.kind === 'concept' && (
        <Field label="Concept">
          <DebouncedField label="Concept text" rows={8} value={node.data.text} onCommit={text => onUpdate({ text })} />
        </Field>
      )}

      {node.kind === 'preset' && (
        <>
          <Field label="Kind">
            <select className={FIELD} value={node.data.presetKind} onChange={e => onUpdate({ presetKind: PRESET_KINDS.find(k => k === e.target.value) ?? 'character' })}>
              {PRESET_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>
          <Field label="Description">
            <DebouncedField label="Preset text" rows={6} value={node.data.text} onCommit={text => onUpdate({ text })} />
          </Field>
        </>
      )}

      {node.kind === 'shot' && (
        <ShotFields
          data={node.data}
          onUpdate={onUpdate}
          commitBeat={(index, text) => onUpdate({ text: serializeShotScript(replaceBeat(parseShotScript(node.data.text), index, text)), edited: true })}
          onRegenerate={() => { onUpdate({ edited: false }); onRun(); }}
          running={running}
          onRefineBeat={onRefineBeat}
        />
      )}

      {node.kind === 'audio' && (
        <>
          <Field label="Mode">
            <select className={FIELD} value={node.data.mode} onChange={e => onUpdate({ mode: AUDIO_MODES.find(m => m === e.target.value) ?? 'auto' })}>
              {AUDIO_MODES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Dialogue">
            <DebouncedField label="Dialogue" rows={5} value={node.data.dialogue} onCommit={dialogue => onUpdate({ dialogue })} />
          </Field>
          <Field label="Sound effects">
            <DebouncedField label="Sound effects" rows={3} value={node.data.sfx} onCommit={sfx => onUpdate({ sfx })} />
          </Field>
        </>
      )}

      {node.kind === 'generate' && (
        <Field label="Model">
          <select className={FIELD} value={node.data.model} onChange={e => onUpdate({ model: e.target.value })}>
            <option value="">Choose a model</option>
            {TARGET_VIDEO_AI_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
      )}

      {node.kind === 'assemble' && <AssembleFields clips={run.output?.clips ?? []} />}

      {node.kind === 'result' && (
        <p className="text-base-content/50">This node has no settings.</p>
      )}

      {runnable && (
        <button type="button" className="btn btn-xs btn-primary rounded-none self-start" disabled={running} onClick={onRun}>
          Run this node
        </button>
      )}
    </aside>
  );
}

function ShotFields({ data, onUpdate, commitBeat, onRegenerate, running, onRefineBeat }: {
  data: { model: string; durationSec: number; text: string; edited: boolean };
  onUpdate: (patch: NodeDataPatch) => void;
  commitBeat: (index: number, text: string) => void;
  onRegenerate: () => void;
  running: boolean;
  onRefineBeat?: (index: number, instruction: string) => Promise<void>;
}) {
  const beats = parseShotScript(data.text).beats;
  const [instruction, setInstruction] = React.useState('');
  const [busy, setBusy] = React.useState<number | null>(null);
  const [beatError, setBeatError] = React.useState('');
  const refine = (i: number) => {
    if (!onRefineBeat) return;
    setBusy(i);
    setBeatError('');
    onRefineBeat(i, instruction)
      .catch((e: unknown) => setBeatError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(null));
  };
  return (
    <>
      <Field label="Target model">
        <select className={FIELD} value={data.model} onChange={e => onUpdate({ model: e.target.value })}>
          <option value="">Choose a model</option>
          {TARGET_VIDEO_AI_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </Field>
      <Field label="Length (seconds)">
        <DebouncedField
          label="Length in seconds"
          type="number"
          min={1}
          value={String(data.durationSec)}
          onCommit={v => {
            const n = Number(v);
            if (Number.isFinite(n) && n > 0) onUpdate({ durationSec: n });
          }}
        />
      </Field>
      <Field label="Script">
        <DebouncedField label="Script" rows={8} value={data.text} onCommit={text => onUpdate({ text, edited: true })} />
      </Field>
      {data.edited && (
        <div className="flex items-center justify-between gap-2 border border-warning/40 p-2">
          <span className="text-warning">Hand-edited: Run keeps this script.</span>
          <button type="button" className="btn btn-xs btn-ghost rounded-none" disabled={running} onClick={onRegenerate}>Regenerate</button>
        </div>
      )}
      <div className="space-y-2">
        <span className="text-[10px] uppercase tracking-wider text-base-content/60">Beats ({beats.length})</span>
        {beats.length === 0 && <p className="text-base-content/50">No beats yet. Run the node or type a script.</p>}
        {beats.length > 0 && onRefineBeat && (
          <Field label="Rewrite instruction (optional)">
            <input className={FIELD} type="text" value={instruction} placeholder="e.g. make it more tense" aria-label="Rewrite instruction" onChange={e => setInstruction(e.target.value)} />
          </Field>
        )}
        {beatError && <p className="border border-error/40 p-2 text-error">{beatError}</p>}
        {beats.map((beat, i) => (
          // Keyed by index: beats have no identity, and a count change (undo, new script) should remount rows.
          <Field key={`${i}-${beats.length}`} label={beat.start !== null && beat.end !== null ? `Beat ${i + 1} · ${beat.start}-${beat.end}s` : `Beat ${i + 1}`}>
            <DebouncedField label={`Beat ${i + 1}`} rows={3} value={beat.text} onCommit={text => commitBeat(i, text)} />
            {onRefineBeat && (
              <button type="button" className="btn btn-xs btn-ghost rounded-none mt-1" disabled={busy !== null || running} onClick={() => refine(i)}>
                {busy === i ? 'Refining...' : 'Re-refine this beat'}
              </button>
            )}
          </Field>
        ))}
      </div>
    </>
  );
}

function AssembleFields({ clips }: { clips: ClipRef[] }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const open = () => {
    setBusy(true);
    setMessage('');
    openClipsInVideoEditor(clips)
      .then(n => setMessage(`Opened ${n} clip(s) in the Video Editor.`))
      .catch((e: unknown) => setMessage(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };
  return (
    <div className="space-y-2">
      <p className="text-base-content/70">{clips.length} clip(s), ordered left to right by node position.</p>
      <button type="button" className="btn btn-xs btn-primary rounded-none" disabled={busy || clips.length === 0} onClick={open}>
        Open in Video Editor
      </button>
      {message && <p className="text-base-content/70">{message}</p>}
    </div>
  );
}
