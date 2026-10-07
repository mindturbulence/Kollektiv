import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMSettings } from '../types';
import { DESIGN_HEADINGS } from '../utils/designSpec';

const img = vi.hoisted(() => ({
  cropTopToJpeg: vi.fn(),
  downscaleToJpeg: vi.fn(),
  readPixels: vi.fn(),
}));
vi.mock('../utils/designImage', () => img);

const llm = vi.hoisted(() => ({ generateDesignSpec: vi.fn() }));
vi.mock('./llmService', () => llm);

import { extractDesignSpec, MAX_EXTRACT_BYTES, postProcessDesignSpec, toDesignSpecImage } from './designSpecService';

const settings = { activeLLM: 'gemini' } as LLMSettings;
const blob = () => new Blob(['x'], { type: 'image/png' });
const jpeg = (payload: string) => `data:image/jpeg;base64,${payload}`;

const FRONT = '---\nname: Calm\ncolors:\n  accent: "#635bff (est.)"\ntypography: {}\nrounded: {}\nspacing: [4]\ncomponents: {}\n---\n\n';
const body = (hs: readonly string[]) => hs.map((h) => `## ${h}\n\n${h} text\n\n`).join('');
const FULL = FRONT + body(DESIGN_HEADINGS);

describe('extractDesignSpec', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    img.cropTopToJpeg.mockResolvedValue({ dataUrl: jpeg('TOP'), width: 1440, whole: false });
    img.downscaleToJpeg.mockResolvedValue(jpeg('SMALL'));
    img.readPixels.mockResolvedValue([[255, 255, 255], [99, 91, 255]]);
    llm.generateDesignSpec.mockResolvedValue(FULL);
  });

  it('refuses more than 4 refs before encoding anything or calling a provider', async () => {
    await expect(extractDesignSpec([blob(), blob(), blob(), blob(), blob()], settings)).rejects.toThrow(/at most 4 reference images/);
    expect(img.cropTopToJpeg).not.toHaveBeenCalled();
    expect(llm.generateDesignSpec).not.toHaveBeenCalled();
  });

  it('refuses no refs', async () => {
    await expect(extractDesignSpec([], settings)).rejects.toThrow(/at least one/);
    expect(llm.generateDesignSpec).not.toHaveBeenCalled();
  });

  it('refuses an encoded payload over 8 MB before calling a provider', async () => {
    img.downscaleToJpeg.mockResolvedValue(jpeg('A'.repeat(MAX_EXTRACT_BYTES / 2)));
    await expect(extractDesignSpec([blob(), blob()], settings)).rejects.toThrow(/at most 8 MB/);
    expect(llm.generateDesignSpec).not.toHaveBeenCalled();
  });

  it('sends the full-res top crop first, then the whole page and further refs downscaled', async () => {
    const steps: string[] = [];
    const first = blob();
    const second = blob();
    const out = await extractDesignSpec([first, second], settings, (s) => steps.push(s));
    expect(img.cropTopToJpeg).toHaveBeenCalledWith(first, 1440, 1600);
    expect(img.downscaleToJpeg.mock.calls).toEqual([[first, 1600], [second, 1600]]);
    expect(img.readPixels).toHaveBeenCalledWith(first, 200);
    const [images, prompt, passed] = llm.generateDesignSpec.mock.calls[0];
    expect(images).toEqual([
      { mimeType: 'image/jpeg', data: 'TOP' },
      { mimeType: 'image/jpeg', data: 'SMALL' },
      { mimeType: 'image/jpeg', data: 'SMALL' },
    ]);
    expect(passed).toBe(settings);
    expect(prompt).toMatch(/measured colours: surfaces: #[0-9a-f]{6}, #[0-9a-f]{6}; accents: #635bff;/);
    expect(prompt).toContain('1440px wide and shows a\n  # 1440px viewport');
    expect(prompt).toContain('(x1)');
    expect(prompt).toMatch(/1\) top of the page at full resolution.*; 2\) the same page in full.*; 3\) another screen/);
    expect(steps).toEqual(['Preparing screenshots…', 'Waiting for the model…']);
    expect(out.truncated).toBe(false);
    expect(out.missing).toEqual([]);
    expect(out.stripped).toEqual(['colors.accent']);
    expect(out.spec.frontMatter.colors).toEqual({ accent: '#635bff' });
  });

  it('skips the whole-page copy when the crop already covers ref 1, and treats a narrow ref as its own viewport (scale 1, not scaled up)', async () => {
    img.cropTopToJpeg.mockResolvedValue({ dataUrl: jpeg('TOP'), width: 1000, whole: true });
    await extractDesignSpec([blob()], settings);
    expect(img.downscaleToJpeg).not.toHaveBeenCalled();
    const [images, prompt] = llm.generateDesignSpec.mock.calls[0];
    expect(images).toHaveLength(1);
    expect(prompt).toContain('1000px wide');
    expect(prompt).toContain('1000px viewport');
    expect(prompt).toContain('(x1)');
  });

  it('throws when a provider answers with error text instead of a spec', async () => {
    llm.generateDesignSpec.mockResolvedValue('System: Anthropic API Key is missing.');
    await expect(extractDesignSpec([blob()], settings)).rejects.toThrow(/not a usable DESIGN\.md.*API Key is missing/);
  });

  it('throws on empty output and on prose without front matter', async () => {
    llm.generateDesignSpec.mockResolvedValue('');
    await expect(extractDesignSpec([blob()], settings)).rejects.toThrow(/empty/);
    llm.generateDesignSpec.mockResolvedValue('I could not read the screenshots.');
    await expect(extractDesignSpec([blob()], settings)).rejects.toThrow(/front matter/);
  });

  it('lets provider errors through unchanged', async () => {
    llm.generateDesignSpec.mockRejectedValue(new Error('Design spec is not available with the anthropic engine'));
    await expect(extractDesignSpec([blob()], settings)).rejects.toThrow(/anthropic engine/);
  });

  it('passes a truncated answer through with its missing headings', async () => {
    llm.generateDesignSpec.mockResolvedValue(FRONT + body(DESIGN_HEADINGS.slice(0, 11)) + '## Dials\n\nvariance 4/10, mot');
    const out = await extractDesignSpec([blob()], settings);
    expect(out.truncated).toBe(true);
    expect(out.missing).toEqual(['heading: Signature']);
  });
});

describe('helpers', () => {
  it('toDesignSpecImage splits a data URL and keeps its own MIME type', () => {
    expect(toDesignSpecImage('data:image/webp;base64,QUJD')).toEqual({ mimeType: 'image/webp', data: 'QUJD' });
    expect(() => toDesignSpecImage('not a data url')).toThrow();
  });

  it('postProcessDesignSpec tolerates preamble text', () => {
    expect(postProcessDesignSpec('Here you go:\n' + FULL).truncated).toBe(false);
  });
});
