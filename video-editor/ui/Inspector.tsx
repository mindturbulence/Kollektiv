// ─── Kollektiv Video Editor — Inspector ──────────────────────────────────────
// Right panel: properties of the first selected clip. Sliders keep a local
// draft while dragging and commit one updateClip on release, so a drag is one
// undo step instead of dozens.

import React, { useState } from 'react';
import { dispatch, getSnapshot } from '../core/store';
import type { Clip, EditAction, Effect, TextStyle, Transform } from '../core/types';
import { useEditorSelector } from './hooks/useEditorState';
import { createTextClip } from './placement';
import { DeleteIcon, TypeIcon } from '../../components/icons';

interface InspectorProps {
  onError: (message: string) => void;
}

type ClipPatch = Extract<EditAction, { type: 'updateClip' }>['patch'];

/** Canvas2D filter effects the renderer understands; `params.amount` is the filter argument. */
const EFFECT_DEFS: Record<string, { label: string; min: number; max: number; step: number; initial: number }> = {
  brightness: { label: 'Brightness', min: 0, max: 2, step: 0.01, initial: 1 },
  contrast: { label: 'Contrast', min: 0, max: 2, step: 0.01, initial: 1 },
  saturation: { label: 'Saturation', min: 0, max: 2, step: 0.01, initial: 1 },
  blur: { label: 'Blur', min: 0, max: 20, step: 0.5, initial: 4 },
};

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (value: number) => void;
  format?: (value: number) => string;
}

export const Slider: React.FC<SliderProps> = ({ label, value, min, max, step, onCommit, format }) => {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  return (
    <label className="flex items-center gap-2 text-2xs font-mono text-base-content/60">
      <span className="w-16 flex-shrink-0">{label}</span>
      <input type="range" className="range range-xs range-primary flex-1" min={min} max={max} step={step} value={shown}
        aria-label={label}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
      <span className="w-10 text-right tabular-nums">{format ? format(shown) : shown.toFixed(2)}</span>
    </label>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode; action?: React.ReactNode }> = ({ title, children, action }) => (
  <section className="px-3 py-2.5 border-b border-base-content/5 space-y-2">
    <div className="flex items-center">
      <h3 className="text-2xs font-mono uppercase tracking-widest text-base-content/60 flex-1">{title}</h3>
      {action}
    </div>
    {children}
  </section>
);

function update(clip: Clip, patch: ClipPatch): void {
  dispatch({ type: 'updateClip', clipId: clip.id, patch });
}

const TextSection: React.FC<{ clip: Clip & { text: NonNullable<Clip['text']> } }> = ({ clip }) => {
  const { content, style } = clip.text;
  const [draft, setDraft] = useState<string | null>(null);
  const [colorDraft, setColorDraft] = useState<string | null>(null);
  const setStyle = (patch: Partial<TextStyle>) => update(clip, { text: { content, style: { ...style, ...patch } } });
  const toggle = 'px-2 h-6 text-2xs font-mono border';
  const on = (active: boolean) => (active ? 'border-primary text-primary bg-primary/10' : 'border-base-content/20 text-base-content/60 hover:border-base-content/40');

  return (
    <Section title="Text">
      <textarea className="w-full bg-base-100 border border-base-content/10 text-xs p-1.5 resize-y min-h-[3.5rem] outline-none focus:border-primary/60"
        aria-label="Text content" value={draft ?? content}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null && draft !== content) update(clip, { text: { content: draft, style } });
          setDraft(null);
        }} />
      <Slider label="Size" value={style.fontSize} min={12} max={400} step={1} format={v => `${v}`} onCommit={v => setStyle({ fontSize: v })} />
      <div className="flex items-center gap-1.5">
        <input type="color" aria-label="Text color" className="w-7 h-6 bg-transparent border border-base-content/20" value={colorDraft ?? style.color}
          onChange={(e) => setColorDraft(e.target.value)}
          onBlur={() => {
            if (colorDraft !== null && colorDraft !== style.color) setStyle({ color: colorDraft });
            setColorDraft(null);
          }} />
        <button type="button" aria-pressed={style.bold} className={`${toggle} font-bold ${on(style.bold)}`} onClick={() => setStyle({ bold: !style.bold })}>B</button>
        <button type="button" aria-pressed={style.italic} className={`${toggle} italic ${on(style.italic)}`} onClick={() => setStyle({ italic: !style.italic })}>I</button>
        <div className="flex-1" />
        {(['left', 'center', 'right'] as const).map(a => (
          <button key={a} type="button" aria-pressed={style.align === a} aria-label={`Align ${a}`}
            className={`${toggle} uppercase ${on(style.align === a)}`} onClick={() => setStyle({ align: a })}>
            {a[0]}
          </button>
        ))}
      </div>
    </Section>
  );
};

const EffectsSection: React.FC<{ clip: Clip }> = ({ clip }) => {
  const setEffects = (effects: Effect[]) => update(clip, { effects });
  const patchEffect = (id: string, patch: Partial<Effect>) =>
    setEffects(clip.effects.map(e => (e.id === id ? { ...e, ...patch } : e)));
  const available = Object.keys(EFFECT_DEFS).filter(type => !clip.effects.some(e => e.type === type));

  return (
    <Section title="Effects" action={available.length > 0 && (
      <select aria-label="Add effect" className="bg-base-100 border border-base-content/10 text-2xs font-mono text-base-content/70 h-6 px-1"
        value="" onChange={(e) => {
          const def = EFFECT_DEFS[e.target.value];
          if (!def) return;
          setEffects([...clip.effects, { id: crypto.randomUUID(), type: e.target.value, params: { amount: def.initial }, enabled: true }]);
        }}>
        <option value="">+ Add</option>
        {available.map(type => <option key={type} value={type}>{EFFECT_DEFS[type].label}</option>)}
      </select>
    )}>
      {clip.effects.length === 0 && <p className="text-2xs text-base-content/60">No effects.</p>}
      {clip.effects.map(effect => {
        const def = EFFECT_DEFS[effect.type];
        const amount = effect.params.amount;
        return (
          <div key={effect.id} className="space-y-1">
            <div className="flex items-center gap-1.5">
              <input type="checkbox" className="checkbox checkbox-xs checkbox-primary rounded-none" checked={effect.enabled}
                aria-label={`Enable ${def?.label ?? effect.type}`} onChange={() => patchEffect(effect.id, { enabled: !effect.enabled })} />
              <span className="text-2xs font-mono text-base-content/70 flex-1">{def?.label ?? effect.type}</span>
              <button type="button" className="p-0.5 text-base-content/60 hover:text-error" aria-label={`Remove ${def?.label ?? effect.type}`}
                onClick={() => setEffects(clip.effects.filter(e => e.id !== effect.id))}>
                <DeleteIcon className="w-3.5 h-3.5" />
              </button>
            </div>
            {def && typeof amount === 'number' && (
              <Slider label="Amount" value={amount} min={def.min} max={def.max} step={def.step}
                onCommit={v => patchEffect(effect.id, { params: { ...effect.params, amount: v } })} />
            )}
          </div>
        );
      })}
    </Section>
  );
};

const Inspector: React.FC<InspectorProps> = ({ onError }) => {
  const clip = useEditorSelector(s => (s.selectedClipIds.length ? s.project?.clips.find(c => c.id === s.selectedClipIds[0]) : undefined));
  const media = useEditorSelector(s => (clip?.mediaId ? s.project?.media.find(m => m.id === clip.mediaId) : undefined));
  const settings = useEditorSelector(s => s.project?.settings);
  const hasProject = !!settings;

  const addText = () => {
    const { project, playhead } = getSnapshot();
    if (!project) return;
    const textClip = createTextClip(project, playhead);
    if (!textClip) {
      onError('No unlocked text track to add a title to.');
      return;
    }
    dispatch({ type: 'addClip', clip: textClip });
    dispatch({ type: 'select', clipIds: [textClip.id] });
  };

  const setTransform = (key: keyof Omit<Transform, 'fit'>, value: number) => {
    if (clip) update(clip, { transform: { ...clip.transform, [key]: value } });
  };

  const isVisual = !!clip && (!!clip.text || media?.kind !== 'audio');
  const hasAudio = !!media && (media.kind === 'audio' || media.hasAudio);
  const maxFade = clip ? Math.max(0, Math.min(5, clip.duration / 2)) : 0;
  const sec = (v: number) => `${v.toFixed(1)}s`;

  return (
    <aside className="w-72 flex-shrink-0 flex flex-col bg-base-200/60 border-l border-base-content/5 min-h-0" aria-label="Inspector">
      <header className="panel-header h-9 px-3 flex items-center">
        <h2 className="text-2xs font-display uppercase tracking-widest text-base-content/70 truncate flex-1">
          {clip ? (clip.text ? 'Text clip' : media?.name ?? 'Clip') : 'Inspector'}
        </h2>
        <button type="button" className="tooltip tooltip-left p-1 text-base-content/60 hover:text-primary disabled:text-base-content/25"
          data-tip="Add text" aria-label="Add text" disabled={!hasProject} onClick={addText}>
          <TypeIcon className="w-4 h-4" />
        </button>
      </header>

      {!clip ? (
        <p className="p-4 text-xs text-base-content/60">Select a clip on the timeline to edit it, or add a text title.</p>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {clip.text && <TextSection clip={{ ...clip, text: clip.text }} />}

          {isVisual && settings && (
            <Section title="Transform">
              <Slider label="X" value={clip.transform.x} min={-settings.width} max={settings.width} step={1} format={v => `${Math.round(v)}`} onCommit={v => setTransform('x', v)} />
              <Slider label="Y" value={clip.transform.y} min={-settings.height} max={settings.height} step={1} format={v => `${Math.round(v)}`} onCommit={v => setTransform('y', v)} />
              <Slider label="Scale" value={clip.transform.scale} min={0.1} max={4} step={0.01} onCommit={v => setTransform('scale', v)} />
              <Slider label="Rotation" value={clip.transform.rotation} min={-180} max={180} step={1} format={v => `${Math.round(v)}°`} onCommit={v => setTransform('rotation', v)} />
              <Slider label="Opacity" value={clip.transform.opacity} min={0} max={1} step={0.01} format={v => `${Math.round(v * 100)}%`} onCommit={v => setTransform('opacity', v)} />
            </Section>
          )}

          {hasAudio && (
            <Section title="Audio">
              <Slider label="Volume" value={clip.volume} min={0} max={2} step={0.01} format={v => `${Math.round(v * 100)}%`} onCommit={v => update(clip, { volume: v })} />
            </Section>
          )}

          <Section title="Timing">
            <Slider label="Fade in" value={clip.fadeIn} min={0} max={maxFade} step={0.1} format={sec} onCommit={v => update(clip, { fadeIn: v })} />
            <Slider label="Fade out" value={clip.fadeOut} min={0} max={maxFade} step={0.1} format={sec} onCommit={v => update(clip, { fadeOut: v })} />
            {!clip.text && media?.kind !== 'image' && (
              // Duration is timeline length, so it scales inversely with speed.
              <Slider label="Speed" value={clip.speed} min={0.25} max={4} step={0.05} format={v => `${v.toFixed(2)}×`}
                onCommit={v => update(clip, { speed: v, duration: (clip.duration * clip.speed) / v })} />
            )}
          </Section>

          {isVisual && <EffectsSection clip={clip} />}
        </div>
      )}
    </aside>
  );
};

export default Inspector;
