import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import {
  splitFrontMatter,
  rebuildFrontMatter,
  otherToYaml,
  parseOtherTokens,
  validateColors,
  findEstimated,
  findEmptyTokens,
  missingFrontMatter,
  sectionDrafts,
  compactSections,
} from './designSpecForm';
import { DESIGN_HEADINGS } from './designSpec';

const fm = {
  name: 'Stripe',
  colors: { background: '#fff', accent: '#635bff' },
  typography: { display: { fontFamily: 'Figtree, system-ui', size: 56, weight: 700 }, body: { size: 16 } },
  rounded: { sm: 4, md: 8 },
  spacing: [4, 8, 16],
  components: { 'button-primary': { bg: '{colors.accent}', padding: '12px 20px' } },
};

describe('designSpecForm', () => {
  it('splits colors from the rest and round-trips deep-equal with key order kept', () => {
    const split = splitFrontMatter(fm);
    expect(split.colors).toEqual([{ name: 'background', value: '#fff' }, { name: 'accent', value: '#635bff' }]);
    expect(Object.keys(split.other)).toEqual(['name', 'typography', 'rounded', 'spacing', 'components']);
    const back = rebuildFrontMatter(split);
    expect(back).toEqual(fm);
    expect(Object.keys(back)).toEqual(Object.keys(fm));
    expect(Object.keys(split.other)).toEqual(Object.keys(parse(otherToYaml(split.other))));
    expect(parse(otherToYaml(split.other))).toEqual(split.other);
  });

  it('applies colour edits on rebuild and drops unnamed rows', () => {
    const split = splitFrontMatter(fm);
    const rows = [{ name: ' accent ', value: '#000' }, { name: '', value: '' }, { name: 'muted', value: '#888' }];
    expect(rebuildFrontMatter({ ...split, colors: rows }).colors).toEqual({ accent: '#000', muted: '#888' });
  });

  it('omits an empty colors map and appends colors when it was absent', () => {
    const { colors: _c, ...noColors } = fm;
    const split = splitFrontMatter(noColors);
    expect(split.colors).toEqual([]);
    expect('colors' in rebuildFrontMatter(split)).toBe(false);
    const added = rebuildFrontMatter({ ...split, colors: [{ name: 'a', value: '#111' }] });
    expect(Object.keys(added).at(-1)).toBe('colors');
  });

  it('leaves a non-flat colors value in other and hides the form', () => {
    const odd = { name: 'x', colors: { primary: { light: '#fff', dark: '#000' } } };
    const split = splitFrontMatter(odd);
    expect(split.colors).toBeNull();
    expect(rebuildFrontMatter(split)).toEqual(odd);
    expect(parseOtherTokens(otherToYaml(split.other), false).ok).toBe(true);
  });

  it('parseOtherTokens accepts empty text and mappings, rejects bad YAML, non-mappings and a colors key', () => {
    expect(parseOtherTokens('', true)).toEqual({ ok: true, value: {} });
    expect(parseOtherTokens('name: A\nrounded:\n  sm: 4', true)).toEqual({ ok: true, value: { name: 'A', rounded: { sm: 4 } } });
    expect(parseOtherTokens('a: [1, 2', true).ok).toBe(false);
    expect(parseOtherTokens('- a\n- b', true)).toMatchObject({ ok: false, error: expect.stringMatching(/mapping/) });
    expect(parseOtherTokens('just text', true).ok).toBe(false);
    expect(parseOtherTokens('colors: {a: b}', true).ok).toBe(false);
    expect(parseOtherTokens('colors: {a: b}', false).ok).toBe(true);
  });

  it('validateColors flags duplicates and unnamed values but ignores blank rows', () => {
    expect(validateColors([{ name: 'a', value: '#1' }, { name: '', value: '' }])).toBeNull();
    expect(validateColors([{ name: 'a', value: '#1' }, { name: 'a ', value: '#2' }])).toMatch(/twice/);
    expect(validateColors([{ name: '', value: '#2' }])).toMatch(/needs a name/);
  });

  it('findEstimated reports key paths of "(est.)" values, nested and in arrays', () => {
    expect(findEstimated({ a: '#fff', colors: { x: '#000 (est.)' }, list: ['ok', 'b (est.)'] })).toEqual(['colors.x', 'list[1]']);
    expect(findEstimated(fm)).toEqual([]);
  });

  it('findEstimated matches every marker spelling the extractor strips, repeatedly (no regex lastIndex leak)', () => {
    const v = { a: '56 (est)', b: '#fff (est., warm)', c: '1px (estimated)', d: 'establish' };
    expect(findEstimated(v)).toEqual(['a', 'b', 'c']);
    expect(findEstimated(v)).toEqual(['a', 'b', 'c']);
  });

  it('findEmptyTokens reports null leaves (an unquoted #hex parses as a YAML comment)', () => {
    expect(findEmptyTokens(parse('colors:\n  background: #fafafa\n  text: "#111"\nspacing: [4, ~]'))).toEqual(['colors.background', 'spacing[1]']);
    expect(findEmptyTokens(fm)).toEqual([]);
  });

  it('missingFrontMatter lists absent required keys', () => {
    expect(missingFrontMatter({ name: 'x', colors: {} })).toEqual(['typography', 'rounded', 'spacing', 'components']);
  });

  it('sectionDrafts orders standard headings first, then extras; compactSections drops empties', () => {
    const drafts = sectionDrafts({ Zeta: 'extra', Colors: 'c', Overview: 'o' });
    expect(Object.keys(drafts)).toEqual([...DESIGN_HEADINGS, 'Zeta']);
    expect(drafts.Layout).toBe('');
    expect(compactSections({ ...drafts, Colors: '  edited \n' })).toEqual({ Overview: 'o', Colors: 'edited', Zeta: 'extra' });
  });
});
