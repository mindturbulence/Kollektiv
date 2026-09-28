// ─── Kollektiv Video Editor — Color panel ────────────────────────────────────
// Edits the clip's 'colorGrade' and 'chromaKey' effects (see core/effect-params
// for the codec). Sliders follow Inspector's Slider pattern (drag = one undo
// step); the colorGrade effect is created lazily on first edit and removed
// once every section (wheels/curves/hsl) is back to neutral.

import React, { useState } from 'react';
import type { Clip, Effect } from '../../core/types';
import { COLOR_GRADE, CHROMA_KEY, encodeColorGrading, decodeColorGrading, encodeChromaKey, decodeChromaKey } from '../../core/effect-params';
import {
  DEFAULT_COLOR_WHEELS, DEFAULT_CURVES, DEFAULT_HSL,
  type ColorGrading, type CurvePoint,
} from '../../core/engines/color-grading';
import { isNeutralColorGrading } from '../../core/engines/color-grading-defaults';
import { DEFAULT_CHROMA_KEY_SETTINGS, type ChromaKeySettings, type RGB } from '../../core/engines/chroma-key';
import CurveEditor from './CurveEditor';

export interface ColorPanelProps {
  clip: Clip;
  onCommit: (effects: Effect[]) => void;
}

// ponytail: local copy of Inspector's Slider — importing it would create an
// Inspector <-> ColorPanel import cycle once the coordinator mounts this
// panel inside Inspector.tsx.
interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (value: number) => void;
  format?: (value: number) => string;
}

const Slider: React.FC<SliderProps> = ({ label, value, min, max, step, onCommit, format }) => {
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

function decodeGrading(clip: Clip): ColorGrading {
  const effect = clip.effects.find(e => e.type === COLOR_GRADE);
  return effect ? decodeColorGrading(effect.params) : {};
}

function decodeChroma(clip: Clip): { settings: ChromaKeySettings; enabled: boolean } {
  const effect = clip.effects.find(e => e.type === CHROMA_KEY);
  return effect
    ? { settings: decodeChromaKey(effect.params), enabled: effect.enabled }
    : { settings: DEFAULT_CHROMA_KEY_SETTINGS, enabled: false };
}

/** New effects array with colorGrade upserted, or removed once fully neutral. */
export function nextEffectsForGrading(clip: Clip, grading: ColorGrading): Effect[] {
  const existing = clip.effects.find(e => e.type === COLOR_GRADE);
  if (isNeutralColorGrading(grading)) {
    return existing ? clip.effects.filter(e => e.id !== existing.id) : clip.effects;
  }
  const params = encodeColorGrading(grading);
  if (existing && existing.params.value === params.value) return clip.effects;
  return existing
    ? clip.effects.map(e => (e.id === existing.id ? { ...e, params } : e))
    : [...clip.effects, { id: crypto.randomUUID(), type: COLOR_GRADE, params, enabled: true }];
}

/** New effects array with chromaKey upserted (settings and/or enabled patched). */
export function nextEffectsForChroma(clip: Clip, patch: { settings?: ChromaKeySettings; enabled?: boolean }): Effect[] {
  const existing = clip.effects.find(e => e.type === CHROMA_KEY);
  const current = decodeChroma(clip);
  const settings = patch.settings ?? current.settings;
  const enabled = patch.enabled ?? current.enabled;
  const params = encodeChromaKey(settings);
  return existing
    ? clip.effects.map(e => (e.id === existing.id ? { ...e, params, enabled } : e))
    : [...clip.effects, { id: crypto.randomUUID(), type: CHROMA_KEY, params, enabled }];
}

const rgbToHex = (rgb: RGB) =>
  `#${[rgb.r, rgb.g, rgb.b].map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
const hexToRgb = (hex: string): RGB | null => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 } : null;
};

const Section: React.FC<{ title: string; onReset?: () => void; children: React.ReactNode }> = ({ title, onReset, children }) => (
  <section className="px-3 py-2.5 border-b border-base-content/5 space-y-2">
    <div className="flex items-center">
      <h3 className="text-2xs font-mono uppercase tracking-widest text-base-content/60 flex-1">{title}</h3>
      {onReset && (
        <button type="button" className="text-2xs font-mono text-base-content/60 hover:text-primary" onClick={onReset}>
          Reset
        </button>
      )}
    </div>
    {children}
  </section>
);

const RANGES = [
  { key: 'shadows', label: 'Shadows', masterKey: 'shadowsLift', masterLabel: 'Lift', min: -0.5, max: 0.5, step: 0.01, masterMin: -0.5, masterMax: 0.5 },
  { key: 'midtones', label: 'Midtones', masterKey: 'midtonesGamma', masterLabel: 'Gamma', min: -0.5, max: 0.5, step: 0.01, masterMin: 0.2, masterMax: 3 },
  { key: 'highlights', label: 'Highlights', masterKey: 'highlightsGain', masterLabel: 'Gain', min: -0.5, max: 0.5, step: 0.01, masterMin: 0, masterMax: 2 },
] as const;

const CHANNELS = ['r', 'g', 'b'] as const;
const CURVE_TABS = [
  { key: 'rgb', label: 'RGB' },
  { key: 'red', label: 'R' },
  { key: 'green', label: 'G' },
  { key: 'blue', label: 'B' },
] as const;
const HSL_FIELDS = [
  { key: 'hue', label: 'Hue', min: -180, max: 180, step: 1, format: (v: number) => `${Math.round(v)}°` },
  { key: 'saturation', label: 'Sat', min: -1, max: 1, step: 0.01, format: (v: number) => `${Math.round(v * 100)}%` },
  { key: 'luminance', label: 'Lum', min: -1, max: 1, step: 0.01, format: (v: number) => `${Math.round(v * 100)}%` },
] as const;

const ColorPanel: React.FC<ColorPanelProps> = ({ clip, onCommit }) => {
  const [curveTab, setCurveTab] = useState<(typeof CURVE_TABS)[number]['key']>('rgb');
  const [hslOpen, setHslOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const [colorPickerDraft, setColorPickerDraft] = useState<string | null>(null);

  const grading = decodeGrading(clip);
  const chroma = decodeChroma(clip);
  const hasChromaEffect = clip.effects.some(e => e.type === CHROMA_KEY);

  const commitGrading = (next: ColorGrading) => {
    const nextEffects = nextEffectsForGrading(clip, next);
    if (nextEffects !== clip.effects) onCommit(nextEffects);
  };
  const commitChroma = (patch: { settings?: ChromaKeySettings; enabled?: boolean }) => onCommit(nextEffectsForChroma(clip, patch));

  const wheels = grading.wheels ?? DEFAULT_COLOR_WHEELS;
  const curves = grading.curves ?? DEFAULT_CURVES;
  const hsl = grading.hsl ?? DEFAULT_HSL;

  return (
    // ponytail: no own scroll/flex sizing here — the coordinator mounts this
    // inside Inspector's scroll container, which already owns that layout.
    <div role="region" aria-label="Color">
      <Section title="Wheels" onReset={() => commitGrading({ ...grading, wheels: DEFAULT_COLOR_WHEELS })}>
        {RANGES.map(range => (
          <div key={range.key} className="space-y-1 pb-1">
            <p className="text-2xs text-base-content/70">{range.label}</p>
            {CHANNELS.map(channel => (
              <Slider key={channel} label={channel.toUpperCase()} value={wheels[range.key][channel]}
                min={range.min} max={range.max} step={range.step}
                onCommit={v => commitGrading({ ...grading, wheels: { ...wheels, [range.key]: { ...wheels[range.key], [channel]: v } } })} />
            ))}
            <Slider label={range.masterLabel} value={wheels[range.masterKey]} min={range.masterMin} max={range.masterMax} step={0.01}
              onCommit={v => commitGrading({ ...grading, wheels: { ...wheels, [range.masterKey]: v } })} />
          </div>
        ))}
      </Section>

      <Section title="Curves" onReset={() => commitGrading({ ...grading, curves: DEFAULT_CURVES })}>
        <div className="flex gap-1" role="tablist" aria-label="Curve channel">
          {CURVE_TABS.map(t => (
            <button key={t.key} type="button" role="tab" aria-selected={curveTab === t.key}
              className={`px-2 h-6 text-2xs font-mono uppercase border ${curveTab === t.key ? 'border-primary text-primary bg-primary/10' : 'border-base-content/20 text-base-content/60 hover:border-base-content/40'}`}
              onClick={() => setCurveTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <CurveEditor points={curves[curveTab]} onChange={(points: CurvePoint[]) => commitGrading({ ...grading, curves: { ...curves, [curveTab]: points } })} />
      </Section>

      <Section title="HSL" onReset={() => commitGrading({ ...grading, hsl: DEFAULT_HSL })}>
        <button type="button" className="text-2xs font-mono text-base-content/60 hover:text-primary" aria-expanded={hslOpen}
          onClick={() => setHslOpen(o => !o)}>
          {hslOpen ? 'Hide bands' : 'Show bands'}
        </button>
        {hslOpen && Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="space-y-1 pb-1">
            <p className="text-2xs text-base-content/70">{i * 45}&ndash;{(i + 1) * 45}&deg;</p>
            {HSL_FIELDS.map(f => (
              <Slider key={f.key} label={f.label} value={hsl[f.key][i]} min={f.min} max={f.max} step={f.step} format={f.format}
                onCommit={v => {
                  const arr = [...hsl[f.key]];
                  arr[i] = v;
                  commitGrading({ ...grading, hsl: { ...hsl, [f.key]: arr } });
                }} />
            ))}
          </div>
        ))}
      </Section>

      <Section title="Chroma key" onReset={hasChromaEffect ? () => commitChroma({ settings: DEFAULT_CHROMA_KEY_SETTINGS }) : undefined}>
        <label className="flex items-center gap-1.5 text-2xs font-mono text-base-content/70">
          <input type="checkbox" className="checkbox checkbox-xs checkbox-primary rounded-none" checked={chroma.enabled}
            aria-label="Enable chroma key" onChange={() => commitChroma({ enabled: !chroma.enabled })} />
          Enabled
        </label>
        <div className="flex items-center gap-1.5">
          <input type="color" aria-label="Key color" className="w-7 h-6 bg-transparent border border-base-content/20"
            value={colorPickerDraft ?? rgbToHex(chroma.settings.keyColor)}
            onChange={e => setColorPickerDraft(e.target.value)}
            onBlur={() => {
              const rgb = colorPickerDraft !== null ? hexToRgb(colorPickerDraft) : null;
              if (rgb) commitChroma({ settings: { ...chroma.settings, keyColor: rgb } });
              setColorPickerDraft(null);
            }} />
          <input type="text" aria-label="Key color hex" className="w-20 bg-base-100 border border-base-content/10 text-2xs font-mono px-1 h-6 outline-none focus:border-primary/60"
            value={hexDraft ?? rgbToHex(chroma.settings.keyColor)}
            onChange={e => setHexDraft(e.target.value)}
            onBlur={() => {
              const rgb = hexDraft !== null ? hexToRgb(hexDraft) : null;
              if (rgb) commitChroma({ settings: { ...chroma.settings, keyColor: rgb } });
              setHexDraft(null);
            }} />
        </div>
        <Slider label="Tolerance" value={chroma.settings.tolerance} min={0} max={1} step={0.01}
          onCommit={v => commitChroma({ settings: { ...chroma.settings, tolerance: v } })} />
        <Slider label="Softness" value={chroma.settings.edgeSoftness} min={0} max={1} step={0.01}
          onCommit={v => commitChroma({ settings: { ...chroma.settings, edgeSoftness: v } })} />
        <Slider label="Spill" value={chroma.settings.spillSuppression} min={0} max={1} step={0.01}
          onCommit={v => commitChroma({ settings: { ...chroma.settings, spillSuppression: v } })} />
      </Section>
    </div>
  );
};

export default ColorPanel;
