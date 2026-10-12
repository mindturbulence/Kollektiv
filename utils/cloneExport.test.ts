import { describe, it, expect } from 'vitest';
import {
  slugify,
  exportContent,
  templateDocs,
  compileAgentsMd,
  parseDocs,
  buildStarterFiles,
  type CloneDocContext,
  type ProjectDocs,
} from './cloneExport';
import type { RecipeBrief } from '../types';

const emptyBrief: RecipeBrief = { project: '', pages: '', job: '', audience: '', stack: '', constraints: '' };
const fullBrief: RecipeBrief = { project: 'Acme Analytics', pages: 'landing page', job: 'generate leads', audience: 'B2B buyers', stack: 'Next.js + Tailwind', constraints: 'no accounts' };

const minCtx: CloneDocContext = {
  title: 'Linear',
  sourceUrl: 'https://linear.app',
  brief: emptyBrief,
  permission: false,
  hasMobile: false,
  sections: { overview: '', pageComposition: '', siteMap: '', techStack: '', responsive: '', motion: '' },
  outline: [],
  assetCount: 0,
  routes: [],
  tech: [],
};

const fullCtx: CloneDocContext = {
  title: 'Linear',
  sourceUrl: 'https://linear.app',
  brief: fullBrief,
  permission: true,
  hasMobile: true,
  sections: { overview: 'Clean dark UI.', pageComposition: 'Hero, Features, Pricing.', siteMap: '- / Home\n- /pricing', techStack: 'Next.js, React.', responsive: 'Nav collapses.', motion: 'Fade in.' },
  outline: [{ index: 0, tag: 'section', heading: 'Hero' }, { index: 1, tag: 'section', heading: 'Pricing' }],
  assetCount: 5,
  routes: ['/pricing'],
  tech: ['Next.js'],
};

// --- slugify ---

describe('slugify', () => {
  it('converts a title to a lowercase hyphen slug', () => {
    expect(slugify('Linear — Plan & Build')).toBe('linear-plan-build');
  });

  it('truncates at 40 chars', () => {
    const long = 'a'.repeat(60);
    expect(slugify(long).length).toBeLessThanOrEqual(40);
  });

  it('returns the fallback for a blank/symbol-only title', () => {
    expect(slugify('')).toBe('cloned-site');
    expect(slugify('---')).toBe('cloned-site');
  });
});

// --- exportContent ---

const sampleContent = JSON.stringify({
  sections: [{ section: 0, heading: 'Hero', blocks: [{ tag: 'h1', text: 'Ship faster' }] }],
});

describe('exportContent', () => {
  it('returns the JSON unchanged when permission is true', () => {
    expect(exportContent(sampleContent, true)).toBe(sampleContent);
  });

  it('strips text to word/char counts when permission is false', () => {
    const out = JSON.parse(exportContent(sampleContent, false));
    const block = out.sections[0].blocks[0];
    expect(block.text).toBeUndefined();
    expect(block.words).toBe(2);   // "Ship faster" = 2 words
    expect(block.chars).toBe(11);  // "Ship faster" = 11 chars
    expect(out.note).toMatch(/original/i);
  });

  it('throws on invalid JSON', () => {
    expect(() => exportContent('not json', false)).toThrow();
  });
});

// --- templateDocs ---

describe('templateDocs', () => {
  it('produces all four documents for a minimal context', () => {
    const docs = templateDocs(minCtx);
    expect(Object.keys(docs)).toEqual(expect.arrayContaining(['PRD.md', 'BRD.md', 'TASKS.md', 'ISSUES.md']));
    expect(docs['PRD.md']).toContain('linear.app');
    expect(docs['TASKS.md']).toContain('- [ ]');
    expect(docs['ISSUES.md']).toContain('ISSUE-1');
  });

  it('reflects permission, routes and sections in a full context', () => {
    const docs = templateDocs(fullCtx);
    // Permission ticked: copy line says "confirmed permission"
    expect(docs['ISSUES.md']).toContain('confirmed permission');
    // Named project in PRD
    expect(docs['PRD.md']).toContain('Acme Analytics');
    // Routes appear as lines in PRD.md
    expect(docs['PRD.md']).toContain('- `/pricing`');
    // Routes produce a route task in TASKS.md (count, not path)
    expect(docs['TASKS.md']).toMatch(/Routes.*1 routes/);
    // Outline sections become individual tasks
    expect(docs['TASKS.md']).toContain('"Hero"');
    expect(docs['TASKS.md']).toContain('"Pricing"');
    // Without permission the copy note says "no permission"
    const noPermDocs = templateDocs({ ...fullCtx, permission: false });
    expect(noPermDocs['ISSUES.md']).toContain('No permission');
  });
});

// --- compileAgentsMd ---

describe('compileAgentsMd', () => {
  it('rule 7 says verbatim when permission is true', () => {
    const md = compileAgentsMd(fullCtx);
    expect(md).toContain('verbatim');
    expect(md).not.toContain('original placeholder copy');
  });

  it('rule 7 says original placeholder copy when permission is false', () => {
    const md = compileAgentsMd(minCtx);
    expect(md).toContain('original placeholder copy');
    expect(md).not.toContain('verbatim');
  });
});

// --- parseDocs ---

const markerResponse = `===== PRD.md =====
# My PRD
content here

===== BRD.md =====
# My BRD
brd content

===== TASKS.md =====
# Tasks

===== ISSUES.md =====
# Issues
`;

describe('parseDocs', () => {
  it('parses all four documents from a well-formed response', () => {
    const docs = parseDocs(markerResponse);
    expect(docs['PRD.md']).toContain('My PRD');
    expect(docs['BRD.md']).toContain('brd content');
    expect(docs['TASKS.md']).toContain('Tasks');
    expect(docs['ISSUES.md']).toContain('Issues');
  });

  it('returns only present documents when a marker is missing', () => {
    const partial = `===== PRD.md =====\n# PRD\n`;
    const docs = parseDocs(partial);
    expect(docs['PRD.md']).toBeTruthy();
    expect(docs['BRD.md']).toBeUndefined();
  });

  it('strips markdown code fences from document bodies', () => {
    const fenced = `===== PRD.md =====\n\`\`\`markdown\n# PRD\ncontent\n\`\`\`\n`;
    const docs = parseDocs(fenced);
    expect(docs['PRD.md']).not.toContain('```');
    expect(docs['PRD.md']).toContain('# PRD');
  });
});

// --- buildStarterFiles ---

describe('buildStarterFiles', () => {
  const docs: ProjectDocs = { 'PRD.md': 'prd', 'BRD.md': 'brd', 'TASKS.md': 'tasks', 'ISSUES.md': 'issues' };
  const pngBlob = new Blob(['img'], { type: 'image/png' });
  const jpgBlob = new Blob(['img'], { type: 'image/jpeg' });

  it('produces the expected file paths for all ZIP entries', () => {
    const { slug, files } = buildStarterFiles({
      context: fullCtx,
      designMd: '# DESIGN',
      assetsJson: '{"assets":[]}',
      contentJson: JSON.stringify({ sections: [] }),
      refs: [{ name: 'desktop.jpg', blob: jpgBlob }, { name: 'mobile.jpg', blob: jpgBlob }],
      docs,
    });
    const paths = files.map((f) => f.path);
    expect(paths).toContain(`${slug}/AGENTS.md`);
    expect(paths).toContain(`${slug}/CLAUDE.md`);
    expect(paths).toContain(`${slug}/GEMINI.md`);
    expect(paths).toContain(`${slug}/README.md`);
    expect(paths).toContain(`${slug}/docs/PRD.md`);
    expect(paths).toContain(`${slug}/docs/DESIGN.md`);
    expect(paths).toContain(`${slug}/design/assets.json`);
    expect(paths).toContain(`${slug}/design/content.json`);
    // Two refs at indexed paths
    expect(paths).toContain(`${slug}/design/refs/1.jpg`);
    expect(paths).toContain(`${slug}/design/refs/2.jpg`);
  });

  it('passes permission through to exportContent (strips text when false)', () => {
    const content = JSON.stringify({ sections: [{ section: 0, blocks: [{ tag: 'p', text: 'hello world' }] }] });
    const { files } = buildStarterFiles({
      context: { ...fullCtx, permission: false },
      designMd: '',
      assetsJson: '{}',
      contentJson: content,
      refs: [{ name: 'ref.png', blob: pngBlob }],
      docs,
    });
    const contentFile = files.find((f) => f.path.endsWith('content.json'));
    const parsed = JSON.parse(contentFile!.content as string);
    expect(parsed.sections[0].blocks[0].text).toBeUndefined();
    expect(parsed.sections[0].blocks[0].words).toBe(2);
  });

  it('throws on an unsupported ref image type', () => {
    const avifBlob = new Blob(['img'], { type: 'image/avif' });
    expect(() =>
      buildStarterFiles({ context: minCtx, designMd: '', assetsJson: '{}', contentJson: '{}', refs: [{ name: 'r.avif', blob: avifBlob }], docs }),
    ).toThrow(/Unsupported/);
  });
});
