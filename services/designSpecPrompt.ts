import type { RGBColor } from '../utils/paletteExtract';

/**
 * System prompt for generateDesignSpec. Single source of truth in code; the plan
 * (docs/plans/2026-10-05-web-design-library.md § Extraction prompt) explains it. Only the last
 * line ({images}) is added here, to tell the model which screenshot to measure on.
 */
export const DESIGN_SPEC_PROMPT = `You are a senior product designer reverse-engineering a website design system from screenshots.
Output ONLY a DESIGN.md document: YAML front matter, then markdown body. No preamble, no code fences.

Front matter keys (all required; use your best estimate, never omit):
name: <short evocative name>
colors: { background, surface, text, muted, accent, accent-contrast, border }
  # assign roles to these measured colours: {palette}; invent a hex only if none fits. Token values must be valid CSS:
  # no comments or "(est.)" inside values; note estimated tokens in ## Colors / ## Typography instead.
  # palette is given as "surfaces: ...; accents: ..."
  # quote every value that contains a hex colour ("#fafafa", "1px solid #e5e3ee"): unquoted, YAML reads # as a comment.
typography:
  # fontFamily is a CSS font stack starting with a Google Fonts family, e.g. "Figtree, system-ui, sans-serif";
  # describe the original's font class in ## Typography. The screenshot is {imgWidth}px wide and shows a
  # {viewportWidth}px viewport: report px at viewport scale (x{scale}).
  display: { fontFamily, size, weight, lineHeight, letterSpacing }
  heading: { ... }  body: { ... }  label: { ... }       # px, unitless lineHeight, em tracking
rounded: { sm, md, lg }                                 # px
spacing: [4, 8, ...]                                    # the scale actually used
components: { button-primary: {bg, text, rounded, padding}, card: {...}, input: {...}, nav: {...} }

Body headings, exactly these, in this order:
## Overview          — 3-5 mood adjectives, brand character, the page's one job
## Colors            — role of each token; light/dark notes
## Typography        — pairing rationale; name real fonts or closest free alternative (Google Fonts)
## Layout            — grid, max width, gutters, whitespace rhythm, alignment habits
## Elevation & Depth — shadows/borders/layers
## Shapes            — radius language, dividers, image crops
## Components        — each visible component + hover/focus/active states (infer if not visible)
## Do's and Don'ts   — 5+ each, specific to THIS design
## References        — one line per screenshot: what it shows
## Page Composition  — numbered sections top→bottom; per section: grid, alignment, content, imagery
## Motion            — likely 1-2 motion moments with duration/easing; "none" if static
## Dials             — variance N/10, motion N/10, density N/10
## Signature         — the single most distinctive element to preserve, and how to build it with CSS/SVG (no images)

Rules: describe the system, not the brand — no logos, product names or copy from the screenshots.
Mark guesses with "(est.)" in the body only, never in front matter. Fonts you cannot identify: describe the class (e.g. geometric grotesk).
Screenshots, in order: {images}`;

const hex = (c: RGBColor): string => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** "surfaces: #fafafa, #111111; accents: #635bff" — "none" for an empty group. */
export const formatPalette = ({ surfaces, accents }: { surfaces: RGBColor[]; accents: RGBColor[] }): string =>
  `surfaces: ${surfaces.map(hex).join(', ') || 'none'}; accents: ${accents.map(hex).join(', ') || 'none'}`;

export interface DesignSpecPromptVars {
  palette: { surfaces: RGBColor[]; accents: RGBColor[] };
  /** Width of the first (measured) screenshot as the model sees it. */
  imgWidth: number;
  viewportWidth: number;
  /** One description per image sent, in order. */
  images: string[];
}

export function buildDesignSpecPrompt({ palette, imgWidth, viewportWidth, images }: DesignSpecPromptVars): string {
  const scale = String(Number((viewportWidth / imgWidth).toFixed(2)));
  const legend = images.map((d, i) => `${i + 1}) ${d}`).join('; ');
  const vars: Record<string, string> = {
    palette: formatPalette(palette),
    imgWidth: String(imgWidth),
    viewportWidth: String(viewportWidth),
    scale,
    images: legend,
  };
  return DESIGN_SPEC_PROMPT.replace(/\{(palette|imgWidth|viewportWidth|scale|images)\}/g, (_, k: string) => vars[k]);
}

/** User turn sent with the screenshots (Ollama needs non-empty message content). */
export const DESIGN_SPEC_USER_TEXT = 'Write the DESIGN.md for these screenshots.';
