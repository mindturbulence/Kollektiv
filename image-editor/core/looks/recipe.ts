// ─── Kollektiv Image Editor — Look recipes ───────────────────────────────────
// A Look is plain, editor-independent JSON (plan §3.2): an ordered list of
// components with assets referenced by id, never pixels — so saved looks,
// sharing and the v2 gallery batch-apply can replay it headlessly. A
// LookLayer holds one recipe; its layer opacity is the look's strength.
//
// Phase 1 components. Later phases add halation/bloom, HSL, chromatic
// aberration, light leaks, textures and frames (additive — bump nothing).

export const LOOK_FORMAT_VERSION = 1;

export type CurvePoints = [number, number][]; // 0–1 in, 0–1 out, sorted by x

export type LookComponent =
  | { kind: 'develop'; enabled: boolean; exposure: number; contrast: number; temp: number; tint: number; saturation: number }
  | { kind: 'lut'; enabled: boolean; assetId: string; strength: number }
  | { kind: 'curve'; enabled: boolean; rgb: CurvePoints }
  | { kind: 'splitTone'; enabled: boolean; shadowHue: number; shadowSat: number; highlightHue: number; highlightSat: number; balance: number }
  | { kind: 'fade'; enabled: boolean; amount: number }
  | { kind: 'vignette'; enabled: boolean; amount: number; midpoint: number; feather: number }
  | { kind: 'grain'; enabled: boolean; amount: number; size: number; seed: number };

export type LookComponentKind = LookComponent['kind'];

export interface LookRecipe {
  formatVersion: typeof LOOK_FORMAT_VERSION;
  id: string;
  name: string;
  components: LookComponent[];
}

/** Units, all neutral at the defaults below:
 *  develop — exposure in stops (−3…3), contrast/saturation −1…1, temp/tint −1…1;
 *  lut.strength 0…1; splitTone hues 0…360, sats 0…1, balance −1…1;
 *  fade.amount 0…1 (lifted blacks); vignette.amount −1…1 (negative = darken),
 *  midpoint/feather 0…1; grain.amount 0…1, size in document px (≥ 0.5). */
export const COMPONENT_DEFAULTS: { [K in LookComponentKind]: Extract<LookComponent, { kind: K }> } = {
  develop:   { kind: 'develop', enabled: true, exposure: 0, contrast: 0, temp: 0, tint: 0, saturation: 0 },
  lut:       { kind: 'lut', enabled: true, assetId: '', strength: 1 },
  curve:     { kind: 'curve', enabled: true, rgb: [[0, 0], [1, 1]] },
  splitTone: { kind: 'splitTone', enabled: true, shadowHue: 210, shadowSat: 0, highlightHue: 40, highlightSat: 0, balance: 0 },
  fade:      { kind: 'fade', enabled: true, amount: 0 },
  vignette:  { kind: 'vignette', enabled: true, amount: 0, midpoint: 0.5, feather: 0.5 },
  grain:     { kind: 'grain', enabled: true, amount: 0, size: 1.5, seed: 1 },
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
