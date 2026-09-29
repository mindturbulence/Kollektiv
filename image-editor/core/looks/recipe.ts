// ─── Kollektiv Image Editor — Look recipes ───────────────────────────────────
// A Look is plain, editor-independent JSON (plan §3.2): an ordered list of
// components with assets referenced by id, never pixels — so saved looks,
// sharing and the v2 gallery batch-apply can replay it headlessly. A
// LookLayer holds one recipe; its layer opacity is the look's strength.
//
// New component kinds are additive: an older build drops unknown kinds instead
// of failing, so adding one never bumps LOOK_FORMAT_VERSION.

export const LOOK_FORMAT_VERSION = 1;

export type CurvePoints = [number, number][]; // 0–1 in, 0–1 out, sorted by x

export type LookComponent =
  | { kind: 'develop'; enabled: boolean; exposure: number; contrast: number; highlights: number; shadows: number; temp: number; tint: number; saturation: number }
  | { kind: 'lut'; enabled: boolean; assetId: string; strength: number }
  | { kind: 'curve'; enabled: boolean; rgb: CurvePoints }
  | { kind: 'splitTone'; enabled: boolean; shadowHue: number; shadowSat: number; highlightHue: number; highlightSat: number; balance: number }
  | { kind: 'fade'; enabled: boolean; amount: number }
  | { kind: 'vignette'; enabled: boolean; amount: number; midpoint: number; feather: number }
  | { kind: 'grain'; enabled: boolean; amount: number; size: number; seed: number }
  | { kind: 'chromaticAberration'; enabled: boolean; amount: number }
  | { kind: 'lightLeak'; enabled: boolean; amount: number; hue: number; seed: number }
  | { kind: 'halation'; enabled: boolean; amount: number; radius: number; threshold: number }
  | { kind: 'bloom'; enabled: boolean; amount: number; radius: number; threshold: number }
  | { kind: 'frame'; enabled: boolean; style: FrameStyle; width: number; color: string }
  /** 8 hue bands (HSL_BAND_HUES), each [hue shift °, saturation, lightness]. */
  | { kind: 'hsl'; enabled: boolean; bands: HslBand[] }
  | { kind: 'paper'; enabled: boolean; amount: number; scale: number }
  | { kind: 'dust'; enabled: boolean; amount: number; scratches: number; seed: number }
  | { kind: 'texture'; enabled: boolean; assetId: string; blend: TextureBlend; amount: number };

export type HslBand = [number, number, number];
/** Band centres: red, orange, yellow, green, aqua, blue, purple, magenta. */
export const HSL_BAND_HUES = [0, 30, 60, 120, 180, 220, 270, 320] as const;

export type FrameStyle = 'thin' | 'polaroid' | 'rounded';
export const TEXTURE_BLENDS = ['overlay', 'soft-light', 'screen', 'multiply'] as const;
export type TextureBlend = typeof TEXTURE_BLENDS[number];
const FRAME_STYLES: FrameStyle[] = ['thin', 'polaroid', 'rounded'];

export type LookComponentKind = LookComponent['kind'];

export interface LookRecipe {
  formatVersion: typeof LOOK_FORMAT_VERSION;
  id: string;
  name: string;
  components: LookComponent[];
}

/** Units, all neutral at the defaults below:
 *  develop — exposure in stops (−3…3), contrast/highlights/shadows/saturation −1…1,
 *  temp/tint −1…1 (highlights < 0 also recovers RAW detail above white);
 *  lut.strength 0…1; splitTone hues 0…360, sats 0…1, balance −1…1;
 *  fade.amount 0…1 (lifted blacks); vignette.amount −1…1 (negative = darken),
 *  midpoint/feather 0…1; grain.amount 0…1, size in document px (≥ 0.5);
 *  chromaticAberration.amount = channel shift at the corners in document px (0…20);
 *  lightLeak.amount 0…1, hue 0…360, seed picks the leak's shape and position;
 *  halation/bloom.amount 0…1, radius in document px (2…200), threshold 0…1;
 *  frame.width = border as a fraction of the short side (0…0.2), color '#rrggbb';
 *  hsl bands: hue shift −30…30°, saturation −1…1, lightness −1…1;
 *  paper.amount 0…1, scale = fibre size in document px (1…40);
 *  dust.amount 0…1 (speck density), scratches 0…1, seed picks the pattern;
 *  texture = a user image (assetId `user:…`) cover-fitted to the document, blended at amount 0…1.
 *  Textures are procedural (Jev, 2026-09-29: procedural over CC0 scans, 0.97). */
export const COMPONENT_DEFAULTS: { [K in LookComponentKind]: Extract<LookComponent, { kind: K }> } = {
  develop:   { kind: 'develop', enabled: true, exposure: 0, contrast: 0, highlights: 0, shadows: 0, temp: 0, tint: 0, saturation: 0 },
  lut:       { kind: 'lut', enabled: true, assetId: '', strength: 1 },
  curve:     { kind: 'curve', enabled: true, rgb: [[0, 0], [1, 1]] },
  splitTone: { kind: 'splitTone', enabled: true, shadowHue: 210, shadowSat: 0, highlightHue: 40, highlightSat: 0, balance: 0 },
  fade:      { kind: 'fade', enabled: true, amount: 0 },
  vignette:  { kind: 'vignette', enabled: true, amount: 0, midpoint: 0.5, feather: 0.5 },
  grain:     { kind: 'grain', enabled: true, amount: 0, size: 1.5, seed: 1 },
  chromaticAberration: { kind: 'chromaticAberration', enabled: true, amount: 3 },
  lightLeak: { kind: 'lightLeak', enabled: true, amount: 0.5, hue: 25, seed: 1 },
  halation:  { kind: 'halation', enabled: true, amount: 0.5, radius: 24, threshold: 0.7 },
  bloom:     { kind: 'bloom', enabled: true, amount: 0.35, radius: 40, threshold: 0.6 },
  frame:     { kind: 'frame', enabled: true, style: 'thin', width: 0.04, color: '#f4f1ea' },
  hsl:       { kind: 'hsl', enabled: true, bands: HSL_BAND_HUES.map((): HslBand => [0, 0, 0]) },
  paper:     { kind: 'paper', enabled: true, amount: 0.4, scale: 6 },
  dust:      { kind: 'dust', enabled: true, amount: 0.4, scratches: 0.3, seed: 1 },
  texture:   { kind: 'texture', enabled: true, assetId: '', blend: 'overlay', amount: 0.6 },
};

export function makeRecipe(name: string, components: LookComponent[]): LookRecipe {
  return { formatVersion: LOOK_FORMAT_VERSION, id: crypto.randomUUID(), name, components };
}

const clamp = (v: unknown, lo: number, hi: number, dflt: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;

/** Validates untrusted JSON (imported .klook files, autosave) into a recipe:
 *  unknown component kinds are dropped, numbers clamped to their ranges,
 *  missing fields take defaults. Returns null for a wrong format version. */
export function parseRecipe(json: unknown): LookRecipe | null {
  if (!json || typeof json !== 'object') return null;
  const r = json as Record<string, unknown>;
  if (r.formatVersion !== LOOK_FORMAT_VERSION) return null;
  const components: LookComponent[] = [];
  for (const raw of Array.isArray(r.components) ? r.components : []) {
    const c = (raw ?? {}) as Record<string, unknown>;
    const enabled = c.enabled !== false;
    switch (c.kind) {
      case 'develop': components.push({ kind: 'develop', enabled,
        exposure: clamp(c.exposure, -3, 3, 0), contrast: clamp(c.contrast, -1, 1, 0),
        highlights: clamp(c.highlights, -1, 1, 0), shadows: clamp(c.shadows, -1, 1, 0),
        temp: clamp(c.temp, -1, 1, 0), tint: clamp(c.tint, -1, 1, 0), saturation: clamp(c.saturation, -1, 1, 0) }); break;
      case 'lut': if (typeof c.assetId === 'string' && c.assetId) components.push({ kind: 'lut', enabled, assetId: c.assetId, strength: clamp(c.strength, 0, 1, 1) }); break;
      case 'curve': {
        const pts = (Array.isArray(c.rgb) ? c.rgb : [])
          .filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === 'number' && Number.isFinite(n)))
          .map(([x, y]) => [clamp(x, 0, 1, 0), clamp(y, 0, 1, 0)] as [number, number])
          .sort((a, b) => a[0] - b[0]);
        components.push({ kind: 'curve', enabled, rgb: pts.length >= 2 ? pts : [[0, 0], [1, 1]] }); break;
      }
      case 'splitTone': components.push({ kind: 'splitTone', enabled,
        shadowHue: clamp(c.shadowHue, 0, 360, 210), shadowSat: clamp(c.shadowSat, 0, 1, 0),
        highlightHue: clamp(c.highlightHue, 0, 360, 40), highlightSat: clamp(c.highlightSat, 0, 1, 0),
        balance: clamp(c.balance, -1, 1, 0) }); break;
      case 'fade': components.push({ kind: 'fade', enabled, amount: clamp(c.amount, 0, 1, 0) }); break;
      case 'vignette': components.push({ kind: 'vignette', enabled, amount: clamp(c.amount, -1, 1, 0),
        midpoint: clamp(c.midpoint, 0, 1, 0.5), feather: clamp(c.feather, 0, 1, 0.5) }); break;
      case 'grain': components.push({ kind: 'grain', enabled, amount: clamp(c.amount, 0, 1, 0),
        size: clamp(c.size, 0.5, 16, 1.5), seed: clamp(c.seed, 0, 1e6, 1) }); break;
      case 'chromaticAberration': components.push({ kind: 'chromaticAberration', enabled, amount: clamp(c.amount, 0, 20, 3) }); break;
      case 'lightLeak': components.push({ kind: 'lightLeak', enabled, amount: clamp(c.amount, 0, 1, 0.5),
        hue: clamp(c.hue, 0, 360, 25), seed: clamp(c.seed, 0, 1e6, 1) }); break;
      case 'halation': case 'bloom': components.push({ kind: c.kind, enabled, amount: clamp(c.amount, 0, 1, 0.5),
        radius: clamp(c.radius, 2, 200, c.kind === 'halation' ? 24 : 40), threshold: clamp(c.threshold, 0, 1, 0.7) }); break;
      case 'frame': components.push({ kind: 'frame', enabled,
        style: FRAME_STYLES.includes(c.style as FrameStyle) ? (c.style as FrameStyle) : 'thin',
        width: clamp(c.width, 0, 0.2, 0.04),
        color: typeof c.color === 'string' && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#f4f1ea' }); break;
      case 'hsl': {
        const raw = Array.isArray(c.bands) ? c.bands : [];
        const bands = HSL_BAND_HUES.map((_, i): HslBand => {
          const b = Array.isArray(raw[i]) ? raw[i] as unknown[] : [];
          return [clamp(b[0], -30, 30, 0), clamp(b[1], -1, 1, 0), clamp(b[2], -1, 1, 0)];
        });
        components.push({ kind: 'hsl', enabled, bands }); break;
      }
      case 'paper': components.push({ kind: 'paper', enabled, amount: clamp(c.amount, 0, 1, 0.4), scale: clamp(c.scale, 1, 40, 6) }); break;
      case 'dust': components.push({ kind: 'dust', enabled, amount: clamp(c.amount, 0, 1, 0.4),
        scratches: clamp(c.scratches, 0, 1, 0.3), seed: clamp(c.seed, 0, 1e6, 1) }); break;
      case 'texture': if (typeof c.assetId === 'string' && c.assetId) components.push({ kind: 'texture', enabled, assetId: c.assetId,
        blend: (TEXTURE_BLENDS as readonly unknown[]).includes(c.blend) ? c.blend as TextureBlend : 'overlay', amount: clamp(c.amount, 0, 1, 0.6) }); break;
      // unknown kinds (from a newer build) are skipped, not fatal
    }
  }
  return {
    formatVersion: LOOK_FORMAT_VERSION,
    id: typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID(),
    name: typeof r.name === 'string' && r.name ? r.name : 'Untitled look',
    components,
  };
}
