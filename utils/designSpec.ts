import { parse, stringify } from 'yaml';

export const DESIGN_HEADINGS = [
  'Overview',
  'Colors',
  'Typography',
  'Layout',
  'Elevation & Depth',
  'Shapes',
  'Components',
  "Do's and Don'ts",
  'References',
  'Page Composition',
  'Motion',
  'Dials',
  'Signature',
] as const;

export const REQUIRED_FRONT_MATTER = ['name', 'colors', 'typography', 'rounded', 'spacing', 'components'] as const;

export type DesignSpec = {
  frontMatter: Record<string, unknown>;
  /** Section text keyed by heading, trimmed. */
  sections: Record<string, string>;
};

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

const stripFence = (text: string): string =>
  text.replace(/^```(?:markdown|md|yaml)?[ \t]*\r?\n/i, '').replace(/\r?\n```[ \t]*$/, '');

/** Drops model preamble ("Here is the spec:", an opening fence) before the first `---` line. */
const fromFirstRule = (text: string): string => {
  const at = text.search(/^---[ \t]*$/m);
  return at > 0 ? text.slice(at) : text;
};

const HAS_HEX = /(^|\s)#[0-9a-fA-F]{3,8}\b/;
const FLOW_SCALAR = /([{[,]\s*(?:[\w-]+:\s*)?)([^,{}[\]"'\s][^,{}[\]"']*?)(\s*)(?=[,}\]])/g;
const BLOCK_LINE = /^(\s*(?:- )?[\w-]+:[ \t]+|\s*- )(.*)$/;
const TRAILING_COMMENT = /\s+#(?![0-9a-fA-F]{3,8}\b).*$/;

/**
 * Models often write `background: #fafafa` unquoted; YAML reads ` #` as a comment, so the token
 * becomes null (or "1px solid" loses its colour). Quote any plain scalar that holds a #hex.
 * Quoted values, comment lines and real trailing comments (`# brand`) are left alone.
 */
const quoteHexScalars = (yaml: string): string =>
  yaml.split('\n').map((line) => {
    const m = BLOCK_LINE.exec(line);
    if (!m) return line;
    const [, head, value] = m;
    if (/^[{[]/.test(value)) {
      return head + value.replace(FLOW_SCALAR, (all, pre: string, scalar: string, ws: string) =>
        HAS_HEX.test(scalar) ? `${pre}${JSON.stringify(scalar)}${ws}` : all);
    }
    if (/^["'|>&*!]/.test(value) || !HAS_HEX.test(value)) return line;
    const comment = TRAILING_COMMENT.exec(value);
    const scalar = (comment ? value.slice(0, comment.index) : value).trim();
    return `${head}${JSON.stringify(scalar)}${comment ? comment[0] : ''}`;
  }).join('\n');

/** A guess marker such as "(est.)", "(est)", "(est. from hero)" or "(estimated)", with its leading space. */
export const EST_MARKER = /\s*\(est(?:\.|imated?|\b)[^)]*\)/gi;

/**
 * Removes guess markers from every string in the front matter so token values stay valid CSS.
 * Returns the cleaned copy and the paths it changed (same path format as findEstimated). A value
 * that becomes a plain number ("48 (est.)") is stored as that number.
 */
export function sanitizeTokenValues(frontMatter: Record<string, unknown>): { frontMatter: Record<string, unknown>; stripped: string[] } {
  const stripped: string[] = [];
  const walk = (v: unknown, path: string): unknown => {
    if (typeof v === 'string') {
      const clean = v.replace(EST_MARKER, '').trim();
      if (clean === v) return v;
      stripped.push(path);
      return /^-?\d+(?:\.\d+)?$/.test(clean) ? Number(clean) : clean;
    }
    if (Array.isArray(v)) return v.map((x, i) => walk(x, `${path}[${i}]`));
    if (isRecord(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, path ? `${path}.${k}` : k)]));
    return v;
  };
  const cleaned = Object.fromEntries(Object.entries(frontMatter).map(([k, v]) => [k, walk(v, k)]));
  return { frontMatter: cleaned, stripped };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseDesignSpec(raw: string): { spec: DesignSpec; missing: string[]; truncated: boolean } {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Design spec is empty.');
  if (trimmed.startsWith('System:')) {
    throw new Error(`Provider returned an error instead of a spec: ${trimmed.slice(0, 200)}`);
  }

  const doc = stripFence(fromFirstRule(trimmed)).trimStart();
  const m = FRONT_MATTER_RE.exec(doc);
  if (!m) throw new Error('Design spec has no YAML front matter block.');

  let fm: unknown;
  try {
    fm = parse(quoteHexScalars(m[1]));
  } catch (e) {
    throw new Error(`Design spec front matter is not valid YAML: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!isRecord(fm)) throw new Error('Design spec front matter is not a YAML mapping.');

  const canonical = new Map<string, string>(DESIGN_HEADINGS.map(h => [h.toLowerCase(), h]));
  const sections: Record<string, string> = {};
  let current: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (current !== null) sections[current] = buf.join('\n').trim();
  };
  for (const line of doc.slice(m[0].length).split(/\r?\n/)) {
    const h = /^## +(.+?)\s*$/.exec(line);
    if (h) {
      flush();
      current = canonical.get(h[1].toLowerCase()) ?? h[1];
      buf = [];
    } else {
      buf.push(line);
    }
  }
  flush();

  const missing = [
    ...DESIGN_HEADINGS.filter(h => !(h in sections)).map(h => `heading: ${h}`),
    ...REQUIRED_FRONT_MATTER.filter(k => !(k in fm)).map(k => `front matter: ${k}`),
  ];
  // Output is cut off when the final heading never arrived.
  const truncated = !('Signature' in sections);

  return { spec: { frontMatter: fm, sections }, missing, truncated };
}

export function serializeDesignSpec(spec: DesignSpec): string {
  const known = new Set<string>(DESIGN_HEADINGS);
  const ordered = [
    ...DESIGN_HEADINGS.filter(h => h in spec.sections),
    ...Object.keys(spec.sections).filter(k => !known.has(k)),
  ];
  const body = ordered.map(h => `## ${h}\n\n${spec.sections[h]}\n\n`).join('');
  return `---\n${stringify(spec.frontMatter)}---\n\n${body}`;
}

export function specOverview(spec: DesignSpec): string {
  return (spec.sections.Overview ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
}
