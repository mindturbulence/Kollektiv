import type { RecipeBrief, RecipeMode } from '../types';

const clean = (v: string | undefined): string => (v ?? '').trim();

/** BRIEF.md: project + pages always; optional fields appear under "More" only when non-empty. */
export function renderBriefMd(brief: RecipeBrief): string {
  const more: [string, string][] = [
    ['Job of the page', clean(brief.job)],
    ['Audience', clean(brief.audience)],
    ['Content / copy', clean(brief.content)],
    ['Stack', clean(brief.stack)],
    ['Constraints', clean(brief.constraints)],
  ];
  const lines = ['# Brief', '', `**Project:** ${clean(brief.project)}`, `**Pages / sections:** ${clean(brief.pages)}`];
  const filled = more.filter(([, v]) => v);
  if (filled.length) {
    lines.push('', '## More', '');
    for (const [label, v] of filled) lines.push(`- **${label}:** ${v}`);
  }
  return lines.join('\n') + '\n';
}

/** One-shot prompt copied to the clipboard. Plain template, not replacePlaceholders (it emits HTML for missing values). */
export function compileRecipePrompt(brief: RecipeBrief, mode: RecipeMode, opts: { zip?: boolean } = {}): string {
  const adapt = mode === 'adapt';
  const stack = clean(brief.stack) || 'match the existing stack';
  const lines: string[] = [];
  if (opts.zip) lines.push('First unzip design.zip into the repo root.');
  lines.push(
    `Build ${clean(brief.pages)} for ${clean(brief.project)} in this repo (${stack}).`,
    '',
    'Read first: design/DESIGN.md (design system + page composition), design/BRIEF.md (product, audience,',
    'content), and view every image in design/refs/.',
    '',
  );
  if (adapt) {
    lines.push(
      'The screenshots define the visual system — composition, rhythm, type scale, color roles, motion.',
      'Use OUR brand, copy and imagery from BRIEF.md. Do not copy logos, text or photos from refs.',
    );
  } else {
    lines.push('Reproduce the screenshots as closely as possible; placeholder text/images where BRIEF.md has none.');
  }
  lines.push(
    '',
    'Rules:',
    '- Use the tokens in DESIGN.md front matter exactly (as CSS variables / the repo\'s theme system).',
    '- Commit to the direction in Overview + Dials. Spend boldness only on the Signature element.',
    '- BRIEF.md decides which sections exist and their order; build each from the closest Page Composition',
    '  pattern (grid, alignment, imagery) and drop reference sections the brief does not need.',
    '  Every section responsive per Layout.',
    '- Motion: only what DESIGN.md › Motion lists; respect prefers-reduced-motion.',
    '- Load the DESIGN.md fonts (a Google Fonts <link> is fine) unless the stack forbids external requests;',
    '  then use the closest system stack and say so.',
    '- WCAG AA contrast, semantic HTML, real copy from BRIEF.md (no lorem ipsum).',
    '- Avoid everything in Do\'s and Don\'ts.',
  );
  if (adapt) {
    lines.push(
      'Also avoid, unless DESIGN.md or the refs show it: generic card grids, purple gradients, emoji',
      'icons, centered-everything layouts.',
    );
  }
  lines.push(
    '- Dials: variance 1 = strict grid … 10 = broken grid; motion 1 = none … 10 = scroll-driven;',
    '  density 1 = editorial whitespace … 10 = dashboard.',
    '',
    'Verify: render the page (try a headless browser on this machine, e.g. npx playwright screenshot or',
    'chrome/msedge --headless --screenshot) at 1440px and 390px, view the images and compare against design/refs/.',
    'Only if no browser runs, check the code section by section against DESIGN.md and the refs, and say so.',
    adapt ? 'Compare composition, spacing rhythm, type scale and color roles — not content.' : 'Compare everything.',
    'List the 5 largest differences, fix them, repeat once.',
  );
  return lines.join('\n');
}
