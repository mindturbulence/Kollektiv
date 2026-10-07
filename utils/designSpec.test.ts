import { describe, it, expect } from 'vitest';
import { DESIGN_HEADINGS, parseDesignSpec, sanitizeTokenValues, serializeDesignSpec, specOverview } from './designSpec';

const FRONT = `---
name: Quiet Ledger
colors:
  background: "#fafafa"
  accent: "#ff4400"
typography:
  display:
    fontFamily: Inter
    size: 64
    weight: 700
rounded: { sm: 2, md: 4, lg: 8 }
spacing: [4, 8, 16]
components:
  button-primary:
    bg: "#ff4400"
    text: "#fff"
    rounded: 4
    padding: 12px 20px
---

`;

const body = (headings: readonly string[]) =>
  headings.map(h => `## ${h}\n\nText for ${h}.\n\n`).join('');

const FULL = FRONT + body(DESIGN_HEADINGS);

describe('parseDesignSpec', () => {
  it('parses a full document with nothing missing', () => {
    const { spec, missing, truncated } = parseDesignSpec(FULL);
    expect(missing).toEqual([]);
    expect(truncated).toBe(false);
    expect(spec.sections.Motion).toBe('Text for Motion.');
  });

  it('round-trips nested tokens deep-equal', () => {
    const a = parseDesignSpec(FULL).spec;
    const b = parseDesignSpec(serializeDesignSpec(a)).spec;
    expect(b).toEqual(a);
    const comps = b.frontMatter.components as Record<string, Record<string, unknown>>;
    expect(comps['button-primary'].padding).toBe('12px 20px');
    const typo = b.frontMatter.typography as Record<string, Record<string, unknown>>;
    expect(typo.display.fontFamily).toBe('Inter');
  });

  it('flags a document cut off mid-Motion as truncated', () => {
    const cut = FRONT + body(DESIGN_HEADINGS.slice(0, 10)) + '## Motion\n\nHero fades in over 4';
    const { missing, truncated } = parseDesignSpec(cut);
    expect(truncated).toBe(true);
    expect(missing).toContain('heading: Dials');
    expect(missing).toContain('heading: Signature');
    expect(missing).not.toContain('heading: Motion');
  });

  it('reports absent front matter keys', () => {
    const { missing } = parseDesignSpec(FULL.replace('spacing: [4, 8, 16]\n', ''));
    expect(missing).toEqual(['front matter: spacing']);
  });

  it('throws without front matter', () => {
    expect(() => parseDesignSpec('## Overview\n\nHello')).toThrow(/front matter/);
  });

  it('throws on provider error text', () => {
    expect(() => parseDesignSpec('System: Anthropic API Key is missing. Add it in Settings.')).toThrow(/error/);
  });

  it('throws on empty input and non-mapping front matter', () => {
    expect(() => parseDesignSpec('  \n')).toThrow();
    expect(() => parseDesignSpec('---\n- a\n- b\n---\n\n## Overview\n\nx')).toThrow(/mapping/);
  });

  it('accepts a wrapping code fence', () => {
    const { missing, truncated } = parseDesignSpec('```markdown\n' + FULL + '```');
    expect(missing).toEqual([]);
    expect(truncated).toBe(false);
  });

  it('preserves extra headings and heading case differences', () => {
    const doc = FULL.replace('## Motion', '## MOTION') + '## Notes\n\nExtra.\n';
    const { spec, missing } = parseDesignSpec(doc);
    expect(missing).toEqual([]);
    expect(spec.sections.Notes).toBe('Extra.');
    expect(spec.sections.Motion).toBe('Text for Motion.');
    expect(serializeDesignSpec(spec)).toContain('## Notes\n\nExtra.');
  });
});

describe('parseDesignSpec model preamble', () => {
  it('drops prose before the first --- line', () => {
    const { spec, missing } = parseDesignSpec('Here is the DESIGN.md you asked for:\n\n' + FULL);
    expect(missing).toEqual([]);
    expect(spec.frontMatter.name).toBe('Quiet Ledger');
  });

  it('drops prose plus an opening fence, and the closing fence does not leak into Signature', () => {
    const { spec, truncated } = parseDesignSpec('Sure.\n```markdown\n' + FULL + '```');
    expect(truncated).toBe(false);
    expect(spec.sections.Signature).toBe('Text for Signature.');
  });

  it('still throws on provider error text and on prose with no front matter', () => {
    expect(() => parseDesignSpec('System: OpenRouter API Key is missing.\n---\nname: x\n---')).toThrow(/error instead of a spec/);
    expect(() => parseDesignSpec('I cannot see any screenshot.')).toThrow(/front matter/);
  });

  it('leaves a --- rule inside the body alone', () => {
    const { spec } = parseDesignSpec(FULL.replace('Text for Layout.', 'Grid.\n\n---\n\nMore.'));
    expect(spec.sections.Layout).toBe('Grid.\n\n---\n\nMore.');
  });
});

describe('parseDesignSpec unquoted hex repair', () => {
  const withFront = (yaml: string) => parseDesignSpec(`---\n${yaml}\n---\n\n${body(DESIGN_HEADINGS)}`).spec.frontMatter;

  it('quotes bare #hex values a model forgot to quote, keeping real trailing comments', () => {
    const fm = withFront([
      'colors:',
      '  background: #fafafa',
      '  accent: #5e6ad2   # brand indigo',
      '  muted: "#888888"',
      'components:',
      '  card: { bg: #fff, border: 1px solid #e5e3ee }',
      '  nav:',
      '    border: 1px solid #e5e3ee (est.)',
      'swatches:',
      '  - #000',
    ].join('\n'));
    expect(fm.colors).toEqual({ background: '#fafafa', accent: '#5e6ad2', muted: '#888888' });
    expect(fm.components).toEqual({ card: { bg: '#fff', border: '1px solid #e5e3ee' }, nav: { border: '1px solid #e5e3ee (est.)' } });
    expect(fm.swatches).toEqual(['#000']);
  });

  it('leaves values without hex and YAML comment lines alone', () => {
    expect(withFront('# a comment line\nname: Studio # not hex\nspacing: [4, 8]')).toEqual({ name: 'Studio', spacing: [4, 8] });
  });
});

describe('sanitizeTokenValues', () => {
  it('strips guess markers from nested strings and reports their paths', () => {
    const { frontMatter, stripped } = sanitizeTokenValues({
      name: 'Calm',
      colors: { accent: '#5e6ad2 (est.)', text: '#f7f8f8', border: '#e5e3ee (est., saturated indigo)' },
      typography: { display: { fontFamily: 'Figtree (est), system-ui', size: '56 (est.)', lineHeight: 1.1 } },
      components: { card: { border: '1px solid #e5e3ee (estimated)' } },
      spacing: [4, '8 (est.)'],
    });
    expect(frontMatter).toEqual({
      name: 'Calm',
      colors: { accent: '#5e6ad2', text: '#f7f8f8', border: '#e5e3ee' },
      typography: { display: { fontFamily: 'Figtree, system-ui', size: 56, lineHeight: 1.1 } },
      components: { card: { border: '1px solid #e5e3ee' } },
      spacing: [4, 8],
    });
    expect(stripped).toEqual([
      'colors.accent', 'colors.border', 'typography.display.fontFamily', 'typography.display.size',
      'components.card.border', 'spacing[1]',
    ]);
  });

  it('leaves clean values, hex codes and look-alike words untouched', () => {
    const fm = { colors: { a: '#ff4400' }, notes: 'establish (estate) rhythm', size: '56px', n: null };
    const out = sanitizeTokenValues(fm);
    expect(out.frontMatter).toEqual(fm);
    expect(out.stripped).toEqual([]);
  });

  it('keeps a unit: "56px (est.)" stays a string', () => {
    expect(sanitizeTokenValues({ s: '56px (est.)' }).frontMatter).toEqual({ s: '56px' });
  });
});

describe('specOverview', () => {
  it('single-lines and caps at 300 chars', () => {
    const { spec } = parseDesignSpec(FRONT + '## Overview\n\nline one\nline two ' + 'x'.repeat(400) + '\n');
    const o = specOverview(spec);
    expect(o.startsWith('line one line two')).toBe(true);
    expect(o).toHaveLength(300);
  });
});
