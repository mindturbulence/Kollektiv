// ─── Kollektiv Image Editor — Looks panel (Quick mode) ──────────────────────
// Gallery of the built-in looks rendered on the user's own image, the active
// look's strength, before/after and a small inspector (plan §5). Lazy chunk.
// Click = replace the active look (or add one); Shift+click = stack a new look;
// browsing clicks merge into one undo step (Jev-decided, 2026-09-29).

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { getSnapshot, subscribe } from '../../core/store';
import { findLayerById } from '../../core/layers/layerTree';
import * as LayerManager from '../../core/layers/LayerManager';
import { BUILTIN_LOOKS, LOOK_CATEGORIES, type LookCategory } from '../../core/looks/builtins';
import { renderThumbnails } from '../../core/looks/thumbnails';
import { onLutsChanged } from '../../core/looks/lutRegistry';
import { setLookBypass } from '../../core/looks/compare';
import { varyRecipe } from '../../core/looks/randomize';
import { useFavourites, toggleFavourite } from './favourites';
import RawDevelop, { DEVELOP_SLIDERS } from './RawDevelop';
import { COMPONENT_DEFAULTS, HSL_BAND_HUES, type FrameStyle, type HslBand, type LookComponent, type LookComponentKind, type LookRecipe } from '../../core/looks/recipe';
import type { ImageLayer, Layer, LookLayer } from '../../core/types';

/** Only the non-look layers decide what the thumbnails look like. */
const baseLayersKey = (layers: Layer[] | undefined) => (layers ?? []).filter(l => l.type !== 'look');
const sameList = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((v, i) => v === b[i]);

const Thumb: React.FC<{ bitmap: ImageBitmap | undefined; label: string }> = ({ bitmap, label }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !bitmap) return;
    c.width = bitmap.width;
    c.height = bitmap.height;
    c.getContext('2d')?.drawImage(bitmap, 0, 0);
  }, [bitmap]);
  return bitmap
    ? <canvas ref={ref} aria-hidden className="w-full aspect-square object-cover bg-base-300" />
    : <div aria-label={`${label} preview loading`} className="w-full aspect-square bg-base-300 animate-pulse" />;
};

/** Main slider per component kind for the inspector: [field, min, max, step, label]. */
const INSPECTOR: Partial<Record<LookComponentKind, [string, number, number, number, string][]>> = {
  develop: DEVELOP_SLIDERS,
  lut: [['strength', 0, 1, 0.05, 'Grade']],
  splitTone: [['shadowSat', 0, 1, 0.05, 'Shadow tint'], ['highlightSat', 0, 1, 0.05, 'Highlight tint']],
  fade: [['amount', 0, 1, 0.05, 'Fade']],
  vignette: [['amount', -1, 1, 0.05, 'Vignette']],
  grain: [['amount', 0, 1, 0.05, 'Grain'], ['size', 0.5, 6, 0.1, 'Grain size']],
  chromaticAberration: [['amount', 0, 20, 0.5, 'Fringe']],
  lightLeak: [['amount', 0, 1, 0.05, 'Leak'], ['hue', 0, 360, 5, 'Leak colour']],
  halation: [['amount', 0, 1, 0.05, 'Halation'], ['radius', 2, 120, 1, 'Spread']],
  bloom: [['amount', 0, 1, 0.05, 'Glow'], ['radius', 2, 200, 1, 'Spread'], ['threshold', 0, 1, 0.05, 'Threshold']],
  frame: [['width', 0, 0.2, 0.005, 'Border']],
  paper: [['amount', 0, 1, 0.05, 'Paper'], ['scale', 1, 40, 0.5, 'Fibre size']],
  dust: [['amount', 0, 1, 0.05, 'Dust'], ['scratches', 0, 1, 0.25, 'Scratches']],
};
const ADDABLE: LookComponentKind[] = ['develop', 'hsl', 'splitTone', 'fade', 'vignette', 'grain', 'halation', 'bloom', 'lightLeak', 'chromaticAberration', 'paper', 'dust', 'frame'];
const KIND_LABEL: Record<LookComponentKind, string> = {
  develop: 'Develop', lut: 'Film grade', curve: 'Curve', splitTone: 'Split tone', fade: 'Fade', vignette: 'Vignette', grain: 'Grain',
  chromaticAberration: 'Lens fringe', lightLeak: 'Light leak', halation: 'Halation', bloom: 'Glow', frame: 'Frame', hsl: 'Colour mix', paper: 'Paper', dust: 'Dust & scratches',
};
const BAND_NAMES = ['Red', 'Orange', 'Yellow', 'Green', 'Aqua', 'Blue', 'Purple', 'Magenta'];

const Inspector: React.FC<{ look: LookLayer }> = ({ look }) => {
  const before = useRef<LookRecipe | null>(null);
  const [band, setBand] = useState(0);
  const begin = () => { if (!before.current) before.current = look.recipe; };
  const commit = () => { if (before.current) { LayerManager.commitLookRecipe(look.id, before.current); before.current = null; } };
  const update = (index: number, patch: Partial<LookComponent>) => {
    begin();
    const components = look.recipe.components.map((c, i) => (i === index ? ({ ...c, ...patch } as LookComponent) : c));
    LayerManager.setLookRecipeLive(look.id, { ...look.recipe, components });
  };
  const add = (kind: LookComponentKind) =>
    LayerManager.setLookRecipe(look.id, { ...look.recipe, components: [...look.recipe.components, { ...COMPONENT_DEFAULTS[kind] }] });
  const present = new Set(look.recipe.components.map(c => c.kind));

  return (
    <div className="flex flex-col gap-3">
      {look.recipe.components.map((c, i) => (
        <div key={`${c.kind}-${i}`} className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 text-xs font-mono text-base-content/80">
            <input type="checkbox" className="checkbox checkbox-xs" checked={c.enabled}
              onChange={e => { update(i, { enabled: e.target.checked }); commit(); }} />
            {KIND_LABEL[c.kind]}
          </label>
          {c.enabled && c.kind === 'hsl' && (
            <div className="flex flex-col gap-1.5 pl-6">
              <div className="flex gap-1" role="radiogroup" aria-label="Colour band">
                {HSL_BAND_HUES.map((h, b) => (
                  <button key={h} type="button" role="radio" aria-checked={band === b} aria-label={BAND_NAMES[b]} title={BAND_NAMES[b]}
                    className={`w-5 h-5 rounded-full ${band === b ? 'ring-2 ring-primary ring-offset-1 ring-offset-base-200' : ''}`}
                    style={{ background: `hsl(${h} 80% 55%)` }} onClick={() => setBand(b)} />
                ))}
              </div>
              {(['Hue', 'Saturation', 'Lightness'] as const).map((label, k) => (
                <label key={label} className="flex items-center gap-2 text-xs font-mono text-base-content/60">
                  <span className="w-24 shrink-0">{BAND_NAMES[band]} {label.toLowerCase()}</span>
                  <input type="range" className="range range-xs range-primary flex-1"
                    min={k === 0 ? -30 : -1} max={k === 0 ? 30 : 1} step={k === 0 ? 1 : 0.05}
                    value={c.bands[band][k]}
                    onChange={e => {
                      const bands = c.bands.map((bv, bi) => (bi === band ? bv.map((v, vi) => (vi === k ? Number(e.target.value) : v)) : bv)) as HslBand[];
                      update(i, { bands });
                    }}
                    onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
                </label>
              ))}
            </div>
          )}
          {c.enabled && c.kind === 'frame' && (
            <label className="flex items-center gap-2 pl-6 text-xs font-mono text-base-content/60">
              <span className="w-24 shrink-0">Style</span>
              <select className="select select-xs select-bordered rounded-none flex-1 text-xs" value={c.style}
                onChange={e => { update(i, { style: e.target.value as FrameStyle }); commit(); }}>
                <option value="thin">Thin border</option>
                <option value="polaroid">Instant print</option>
                <option value="rounded">Rounded matte</option>
              </select>
              <input type="color" aria-label="Frame colour" className="w-7 h-6 bg-transparent" value={c.color}
                onChange={e => update(i, { color: e.target.value })} onBlur={commit} />
            </label>
          )}
          {c.enabled && (INSPECTOR[c.kind] ?? []).map(([field, min, max, step, label]) => (
            <label key={field} className="flex items-center gap-2 pl-6 text-xs font-mono text-base-content/60">
              <span className="w-24 shrink-0">{label}</span>
              <input type="range" className="range range-xs range-primary flex-1" min={min} max={max} step={step}
                value={(c as unknown as Record<string, number>)[field]}
                onChange={e => update(i, { [field]: Number(e.target.value) } as Partial<LookComponent>)}
                onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
            </label>
          ))}
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5">
        {ADDABLE.filter(k => !present.has(k)).map(k => (
          <button key={k} type="button" className="h-6 px-2 text-xs font-mono normal-case tracking-normal font-normal border border-base-content/15 hover:border-primary hover:text-primary"
            onClick={() => add(k)}>
            + {KIND_LABEL[k]}
          </button>
        ))}
      </div>
    </div>
  );
};

const LooksPanel: React.FC = () => {
  const document = useSyncExternalStore(subscribe, () => getSnapshot().document);
  const activeLayerId = useSyncExternalStore(subscribe, () => getSnapshot().activeLayerId);
  const [category, setCategory] = useState<LookCategory | 'all' | 'favourites'>('all');
  const favourites = useFavourites();
  const randomSeed = useRef(1);
  const [thumbs, setThumbs] = useState<(ImageBitmap | undefined)[]>([]);
  const [gpuOk, setGpuOk] = useState(true);
  const [showInspector, setShowInspector] = useState(false);
  const [lutTick, setLutTick] = useState(0);
  const strengthBefore = useRef<number | null>(null);

  const recipes = useMemo(() => BUILTIN_LOOKS.map(l => l.build()), []);
  const rendered = useRef<{ base: Layer[]; lutTick: number } | null>(null);

  useEffect(() => onLutsChanged(() => setLutTick(t => t + 1)), []);

  // Re-render the gallery when the image under the looks changes (debounced) or
  // a LUT arrives — not when only a look layer changes (browsing clicks).
  useEffect(() => {
    const doc = document;
    if (!doc) return;
    const base = baseLayersKey(doc.layers);
    const last = rendered.current;
    if (last && last.lutTick === lutTick && sameList(base, last.base)) return;
    let cancelled = false;
    const next: (ImageBitmap | undefined)[] = [];
    const timer = setTimeout(() => {
      void renderThumbnails(doc, recipes, (i, bmp) => {
        if (cancelled) { bmp.close(); return; }
        next[i] = bmp;
        setThumbs([...next]);
      }).then(ok => {
        if (cancelled) return;
        setGpuOk(ok);
        rendered.current = { base, lutTick }; // only a finished run counts as rendered
      });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [document, lutTick, recipes]);

  // Close replaced thumbnail bitmaps.
  const prevThumbs = useRef<(ImageBitmap | undefined)[]>([]);
  useEffect(() => {
    prevThumbs.current.forEach(b => { if (b && !thumbs.includes(b)) b.close(); });
    prevThumbs.current = thumbs;
  }, [thumbs]);
  useEffect(() => () => prevThumbs.current.forEach(b => b?.close()), []);

  // Hold "\" for before/after.
  useEffect(() => {
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
    const down = (e: KeyboardEvent) => { if (e.key === '\\' && !isField(e.target)) setLookBypass(true); };
    const up = (e: KeyboardEvent) => { if (e.key === '\\') setLookBypass(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); setLookBypass(false); };
  }, []);

  if (!document) return <p className="px-3 py-4 text-xs font-mono text-base-content/60">Open an image to try looks on it.</p>;
  if (!gpuOk) return <p className="px-3 py-4 text-xs font-mono text-error">Looks need WebGL2, which this browser doesn't provide.</p>;

  const active = activeLayerId ? findLayerById(document.layers, activeLayerId) : undefined;
  const activeLook = active?.type === 'look' ? active : null;
  // The RAW to develop: the active layer if it is one, else the first in the stack.
  const isRaw = (l: Layer | undefined): l is ImageLayer & { raw: NonNullable<ImageLayer['raw']> } => l?.type === 'image' && !!l.raw;
  const rawLayer = isRaw(active) ? active : document.layers.find(isRaw);
  const visible = BUILTIN_LOOKS.map((l, i) => ({ l, i })).filter(({ l }) =>
    category === 'all' || (category === 'favourites' ? favourites.has(l.key) : l.category === category));

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {rawLayer && <RawDevelop key={rawLayer.id} layer={rawLayer} />}
      <div className="flex flex-wrap gap-1 px-2 py-2 border-b border-base-content/5" role="tablist" aria-label="Look categories">
        {[{ id: 'all' as const, label: 'All' }, { id: 'favourites' as const, label: '★ Favourites' }, ...LOOK_CATEGORIES].map(c => (
          <button key={c.id} type="button" role="tab" aria-selected={category === c.id}
            className={`h-6 px-2 text-xs font-mono normal-case tracking-normal font-normal border ${category === c.id ? 'border-primary text-primary bg-primary/10' : 'border-base-content/15 text-base-content/70 hover:text-base-content'}`}
            onClick={() => setCategory(c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-2">
        {category === 'favourites' && visible.length === 0 && (
          <p className="text-xs font-mono text-base-content/60 p-2">Star a look (☆ on its preview) to keep it here.</p>
        )}
        <div className="grid grid-cols-2 gap-2" role="listbox" aria-label="Looks">
          {visible.map(({ l, i }) => {
            const selected = activeLook?.recipe.name === l.name;
            const fav = favourites.has(l.key);
            return (
              <div key={l.key} className="relative">
                <button type="button" role="option" aria-selected={selected}
                  title={`${l.name} — click to apply, Shift+click to stack as a new look`}
                  className={`w-full flex flex-col gap-1 p-1 text-left normal-case tracking-normal font-normal border ${selected ? 'border-primary' : 'border-transparent hover:border-base-content/30'}`}
                  onClick={e => LayerManager.applyLook(l.build(), e.shiftKey)}>
                  <Thumb bitmap={thumbs[i]} label={l.name} />
                  <span className="text-xs truncate">{l.name}</span>
                </button>
                <button type="button" aria-pressed={fav} aria-label={fav ? `Unfavourite ${l.name}` : `Favourite ${l.name}`}
                  className={`absolute top-2 right-2 w-6 h-6 flex items-center justify-center bg-black/45 text-sm normal-case tracking-normal font-normal ${fav ? 'text-primary' : 'text-white/70 hover:text-white'}`}
                  onClick={() => toggleFavourite(l.key)}>
                  {fav ? '★' : '☆'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {activeLook && (
        // Capped so an open inspector never squeezes the gallery; scrolls on its own.
        <div className="flex flex-col gap-2 p-3 border-t border-base-content/5 max-h-[45%] overflow-y-auto shrink-0">
          <span className="text-sm truncate">{activeLook.recipe.name}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" className="h-6 px-2 text-xs font-mono normal-case tracking-normal font-normal border border-base-content/15 hover:border-primary hover:text-primary"
              onPointerDown={() => setLookBypass(true)} onPointerUp={() => setLookBypass(false)} onPointerLeave={() => setLookBypass(false)}
              title="Hold to see the image without its looks (or hold \)">
              Compare
            </button>
            <button type="button" className="h-6 px-2 text-xs font-mono normal-case tracking-normal font-normal border border-base-content/15 hover:border-primary hover:text-primary"
              title="A seeded variation of this look (grain, fade, tints, leaks)"
              onClick={() => { randomSeed.current += 1; LayerManager.setLookRecipe(activeLook.id, varyRecipe(activeLook.recipe, Date.now() + randomSeed.current)); }}>
              Randomize
            </button>
            <button type="button" className="h-6 px-2 text-xs font-mono normal-case tracking-normal font-normal border border-base-content/15 hover:border-error hover:text-error"
              onClick={() => LayerManager.removeLayer(activeLook.id)}>
              Remove
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs font-mono text-base-content/70">
            Strength
            <input type="range" aria-label="Look strength" className="range range-xs range-primary flex-1" min={0} max={100}
              value={activeLook.opacity}
              onPointerDown={() => { strengthBefore.current = activeLook.opacity; }}
              onKeyDown={() => { if (strengthBefore.current === null) strengthBefore.current = activeLook.opacity; }}
              onChange={e => LayerManager.setLayerOpacityLive(activeLook.id, Number(e.target.value))}
              onPointerUp={() => { if (strengthBefore.current !== null) { LayerManager.commitLayerOpacity(activeLook.id, strengthBefore.current); strengthBefore.current = null; } }}
              onBlur={() => { if (strengthBefore.current !== null) { LayerManager.commitLayerOpacity(activeLook.id, strengthBefore.current); strengthBefore.current = null; } }} />
            <span className="w-10 text-right">{activeLook.opacity}%</span>
          </label>
          <button type="button" aria-expanded={showInspector}
            className="self-start text-xs font-mono normal-case tracking-normal font-normal text-base-content/70 hover:text-primary"
            onClick={() => setShowInspector(v => !v)}>
            {showInspector ? '▾ Adjust look' : '▸ Adjust look'}
          </button>
          {showInspector && <Inspector look={activeLook} />}
        </div>
      )}
    </div>
  );
};

export default LooksPanel;
