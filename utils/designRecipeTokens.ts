/**
 * Pure derivation of the card-level palette and font chips from a DESIGN.md front matter.
 * Never throws: missing, malformed or non-object tokens yield empty lists.
 */

const COLOR_PRIORITY = ['accent', 'primary', 'background', 'surface', 'text', 'muted', 'border'];
// Display then body first so the 2-font cap keeps the two most telling roles.
const FONT_ROLES = ['display', 'body', 'heading', 'label'];
const MAX_COLORS = 5;
const MAX_FONTS = 2;

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** `#rgb`/`#rgba` expand to 6 digits; alpha is dropped. Returns null for anything that is not a hex colour. */
const normaliseHex = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (!HEX.test(v)) return null;
  const digits = v.slice(1);
  if (digits.length <= 4) return `#${[...digits.slice(0, 3)].map((c) => c + c).join('')}`;
  return `#${digits.slice(0, 6)}`;
};

const colorRank = (key: string): number => {
  const i = COLOR_PRIORITY.indexOf(key.toLowerCase());
  return i < 0 ? COLOR_PRIORITY.length : i;
};

const derivePalette = (colors: unknown): string[] => {
  if (!isRecord(colors)) return [];
  const ordered = Object.entries(colors).sort(([a], [b]) => colorRank(a) - colorRank(b)); // stable: ties keep insertion order
  const palette: string[] = [];
  for (const [, value] of ordered) {
    const hex = normaliseHex(value);
    if (hex && !palette.includes(hex)) palette.push(hex);
    if (palette.length === MAX_COLORS) break;
  }
  return palette;
};

const firstFamily = (fontFamily: unknown): string | null => {
  if (typeof fontFamily !== 'string') return null;
  const family = fontFamily.split(',')[0].trim().replace(/^["']+|["']+$/g, '').trim();
  return family || null;
};

const sizePx = (size: unknown): number | null => {
  if (typeof size === 'number') return Number.isFinite(size) && size > 0 ? size : null;
  if (typeof size !== 'string') return null;
  const m = /^(\d+(?:\.\d+)?)(?:px)?$/i.exec(size.trim());
  const n = m ? Number(m[1]) : NaN;
  return n > 0 ? n : null;
};

const deriveFonts = (typography: unknown): string[] => {
  if (!isRecord(typography)) return [];
  const fonts: string[] = [];
  for (const role of FONT_ROLES) {
    const token = typography[role];
    if (!isRecord(token)) continue;
    const family = firstFamily(token.fontFamily);
    if (!family) continue;
    const size = sizePx(token.size);
    const chip = size === null ? family : `${family} / ${size}px`;
    if (!fonts.includes(chip)) fonts.push(chip);
    if (fonts.length === MAX_FONTS) break;
  }
  return fonts;
};

export function deriveRecipeTokens(frontMatter: Record<string, unknown>): { palette: string[]; fonts: string[] } {
  const fm = isRecord(frontMatter) ? frontMatter : {};
  return { palette: derivePalette(fm.colors), fonts: deriveFonts(fm.typography) };
}
