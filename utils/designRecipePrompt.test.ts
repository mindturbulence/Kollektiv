import { describe, it, expect } from 'vitest';
import { compileRecipePrompt, renderBriefMd } from './designRecipePrompt';
import type { RecipeBrief } from '../types';

const full: RecipeBrief = {
  project: 'Acme',
  pages: 'landing page',
  job: 'convert visitors',
  audience: 'founders',
  content: 'Ship faster',
  stack: 'Next.js + Tailwind',
  constraints: 'no JS carousels',
};
const minimal: RecipeBrief = { project: 'Acme', pages: 'landing page' };

describe('compileRecipePrompt', () => {
  it('adapt and reproduce differ in intro, avoid line and verify wording', () => {
    const a = compileRecipePrompt(full, 'adapt');
    const r = compileRecipePrompt(full, 'reproduce');
    expect(a).toContain('Use OUR brand, copy and imagery');
    expect(a).toContain('Also avoid, unless DESIGN.md or the refs show it');
    expect(a).toContain('not content.');
    expect(a).not.toContain('Compare everything.');
    expect(r).toContain('Reproduce the screenshots as closely as possible');
    expect(r).toContain('Compare everything.');
    expect(r).not.toContain('Also avoid');
    expect(r).not.toContain('Use OUR brand');
  });

  it('puts the unzip line first only when zip is set', () => {
    expect(compileRecipePrompt(full, 'adapt', { zip: true }).split('\n')[0]).toBe('First unzip design.zip into the repo root.');
    expect(compileRecipePrompt(full, 'adapt').split('\n')[0]).toMatch(/^Build /);
    expect(compileRecipePrompt(full, 'adapt', { zip: false })).not.toContain('unzip');
  });

  it('uses the stack, falling back when empty or whitespace', () => {
    expect(compileRecipePrompt(full, 'adapt')).toContain('(Next.js + Tailwind)');
    expect(compileRecipePrompt(minimal, 'adapt')).toContain('(match the existing stack)');
    expect(compileRecipePrompt({ ...minimal, stack: '   ' }, 'adapt')).toContain('(match the existing stack)');
  });

  it('always carries project, pages, dial anchors and browser fallback', () => {
    const p = compileRecipePrompt(minimal, 'reproduce');
    expect(p).toContain('Build landing page for Acme in this repo');
    expect(p).toContain('Dials: variance 1 = strict grid');
    expect(p).toContain('Only if no browser runs, check the code section by section');
    expect(p).toContain('BRIEF.md decides which sections exist');
    expect(p).toContain('Load the DESIGN.md fonts');
    expect(p).not.toMatch(/undefined|\{|\}/);
  });
});

describe('renderBriefMd', () => {
  it('includes all fields under More when filled', () => {
    const md = renderBriefMd(full);
    expect(md).toContain('**Project:** Acme');
    expect(md).toContain('**Pages / sections:** landing page');
    expect(md).toContain('## More');
    for (const v of ['convert visitors', 'founders', 'Ship faster', 'Next.js + Tailwind', 'no JS carousels']) {
      expect(md).toContain(v);
    }
  });

  it('empty brief leaves no More heading or dangling labels', () => {
    const md = renderBriefMd(minimal);
    expect(md).toContain('**Project:** Acme');
    expect(md).toContain('**Pages / sections:** landing page');
    expect(md).not.toContain('More');
    expect(md).not.toMatch(/^- /m);
  });

  it('treats whitespace-only fields as empty and keeps only filled ones', () => {
    const md = renderBriefMd({ ...minimal, job: '  \n ', audience: 'devs', content: '\t' });
    expect(md).toContain('- **Audience:** devs');
    expect(md).not.toContain('Job of the page');
    expect(md).not.toContain('Content / copy');
    expect(md.match(/^- /gm)).toHaveLength(1);
  });
});
