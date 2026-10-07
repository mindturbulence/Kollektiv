import { describe, it, expect } from 'vitest';
import { buildDesignSpecPrompt, DESIGN_SPEC_PROMPT, formatPalette } from './designSpecPrompt';

const palette = { surfaces: [[250, 250, 250], [17, 17, 17]] as [number, number, number][], accents: [[99, 91, 255]] as [number, number, number][] };

describe('designSpecPrompt', () => {
  it('formats the palette as surfaces/accents groups of hex codes', () => {
    expect(formatPalette(palette)).toBe('surfaces: #fafafa, #111111; accents: #635bff');
    expect(formatPalette({ surfaces: [[0, 0, 0]], accents: [] })).toBe('surfaces: #000000; accents: none');
  });

  it('fills every placeholder and leaves none behind', () => {
    const out = buildDesignSpecPrompt({ palette, imgWidth: 1000, viewportWidth: 1440, images: ['top crop', 'full page'] });
    expect(out).toContain('assign roles to these measured colours: surfaces: #fafafa, #111111; accents: #635bff; invent a hex');
    expect(out).toContain('The screenshot is 1000px wide and shows a\n  # 1440px viewport: report px at viewport scale (x1.44).');
    expect(out).toContain('Screenshots, in order: 1) top crop; 2) full page');
    expect(out).not.toMatch(/\{[A-Za-z]+\}/);
    expect(DESIGN_SPEC_PROMPT).toMatch(/\{palette\}/);
  });

  it('reports scale 1 when the model sees the viewport at full resolution', () => {
    expect(buildDesignSpecPrompt({ palette, imgWidth: 1440, viewportWidth: 1440, images: ['x'] })).toContain('(x1)');
  });

  it('keeps the spike fixes from the plan', () => {
    expect(DESIGN_SPEC_PROMPT).toContain('Token values must be valid CSS');
    expect(DESIGN_SPEC_PROMPT).toContain('fontFamily is a CSS font stack starting with a Google Fonts family');
    expect(DESIGN_SPEC_PROMPT).toContain('how to build it with CSS/SVG (no images)');
  });
});
