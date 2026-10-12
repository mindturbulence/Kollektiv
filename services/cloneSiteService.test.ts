import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LLMSettings } from '../types';
import { sanitizeMeasurements } from './siteMeasure';

const llm = vi.hoisted(() => ({ generateDesignSpec: vi.fn() }));
vi.mock('./llmService', () => llm);
vi.mock('../utils/designImage', () => ({
  cropTopToJpeg: vi.fn(async (_b: Blob, w: number) => ({ dataUrl: `data:image/jpeg;base64,${w === 390 ? 'TU9C' : 'VE9Q'}`, width: w, whole: false })),
  downscaleToJpeg: vi.fn(async () => 'data:image/jpeg;base64,RlVMTA=='),
}));

import { captureSite, CloneCaptureError, isNoVisionError, measuredRecipe, writeCloneSpec, type CapturedSite } from './cloneSiteService';
import { ProviderUnsupportedError } from './providerFallback';

const m = sanitizeMeasurements({
  colors: { text: [['rgb(0,0,0)', 10]], background: [['rgb(255,255,255)', 10]] },
  sections: [{ tag: 'section', y: 0, height: 600, heading: 'Hero', counts: {}, columns: 1 }],
  nav: [{ path: '/docs', label: 'Docs' }],
  tech: { next: true },
});

const site = (over: Partial<CapturedSite> = {}): CapturedSite => ({
  finalUrl: 'https://acme.example/',
  title: 'Acme — Build',
  desktop: m,
  mobile: m,
  desktopShot: new Blob(['d'], { type: 'image/jpeg' }),
  mobileShot: new Blob(['m'], { type: 'image/jpeg' }),
  capturedAt: 1000,
  ...over,
});

const MODEL_SPEC = `---
name: Acme Calm
page-type: landing
tags: [minimal, saas]
colors: { background: "#ffffff", surface: "#f5f5f5", text: "#000000", muted: "#555555", accent: "#3355ff", accent-contrast: "#ffffff", border: "#e5e5e5" }
typography: { display: { fontFamily: "Inter, sans-serif", size: 56px } }
rounded: { sm: 4px, md: 8px, lg: 16px }
spacing: [8, 16]
components: { button-primary: { bg: "#3355ff" } }
---

## Overview

Calm.

## Assets

1. Abstract gradient blob.

## References

made up by the model

## Signature

The gradient.
`;

const settings = { activeLLM: 'gemini' } as unknown as LLMSettings;

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('captureSite', () => {
  it('posts the URL and turns both screenshots into blobs', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith('data:')) return new Response(new Blob(['x'], { type: 'image/jpeg' }));
      expect(url).toBe('/api/clone-site');
      expect(JSON.parse(init?.body as string)).toEqual({ url: 'https://acme.example' });
      return new Response(JSON.stringify({
        ok: true, finalUrl: 'https://acme.example/', title: 'Acme',
        desktop: { width: 1440, height: 3000, mime: 'image/jpeg', imageBase64: 'eA==' },
        mobile: null,
        measurements: { desktop: m, mobile: null },
      }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const r = await captureSite('https://acme.example');
    expect(r).toMatchObject({ finalUrl: 'https://acme.example/', title: 'Acme', mobile: null, mobileShot: null });
    expect(r.desktopShot).toBeInstanceOf(Blob);
  });

  it('maps server error codes to readable messages, keeping server detail only where it is safe', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, code: 'rate_limited', error: 'x' }), { status: 429 })));
    await expect(captureSite('https://a.example')).rejects.toMatchObject({ code: 'rate_limited', message: expect.stringMatching(/Too many captures/) });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, code: 'capture_unavailable', error: 'Install Edge.' }), { status: 503 })));
    await expect(captureSite('https://a.example')).rejects.toMatchObject({ message: 'Install Edge.' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Cross-origin request blocked' }), { status: 403 })));
    await expect(captureSite('https://a.example')).rejects.toBeInstanceOf(CloneCaptureError);
  });

  it('reports a missing server as a network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(captureSite('https://a.example')).rejects.toMatchObject({ code: 'network' });
  });
});

describe('writeCloneSpec', () => {
  it('sends desktop top, whole desktop and mobile top with the measured digest and fenced page text', async () => {
    llm.generateDesignSpec.mockResolvedValue(MODEL_SPEC);
    const r = await writeCloneSpec(site(), settings);
    const [images, prompt] = llm.generateDesignSpec.mock.calls[0];
    expect(images.map((i: { data: string }) => i.data)).toEqual(['VE9Q', 'RlVMTA==', 'TU9C']);
    expect(prompt).toContain('MEASURED VALUES');
    expect(prompt).toContain('Detected tech: Next.js');
    expect(prompt).toMatch(/<untrusted page-text>[\s\S]*section 0 heading: "Hero"[\s\S]*<\/untrusted>$/);

    expect(r).toMatchObject({ title: 'Acme', pageType: 'landing', tags: ['minimal', 'saas'], sourceUrl: 'https://acme.example/', truncated: false, measuredOnly: false });
    expect(r.spec.frontMatter).not.toHaveProperty('page-type');
    expect(r.spec.frontMatter).not.toHaveProperty('tags');
    expect(r.spec.sections.Assets).toBe('1. Abstract gradient blob.');
    expect(r.spec.sections.References).toMatch(/^1\. Full page at 1440 px/);
    expect(r.spec.sections['Site Map']).toContain('`/docs`');
    expect(r.refs.map((x) => x.name)).toEqual(['desktop.jpg', 'mobile.jpg']);
    expect(Object.keys(r.clone.files)).toEqual(['assets.json', 'content.json', 'measurements.json']);
    expect(r.clone).toMatchObject({ capturedAt: 1000, tech: ['Next.js'] });
  });

  it('flags a cut-off answer as truncated but still returns a recipe', async () => {
    llm.generateDesignSpec.mockResolvedValue(MODEL_SPEC.replace(/## Signature[\s\S]*$/, ''));
    expect((await writeCloneSpec(site({ mobile: null, mobileShot: null }), settings)).truncated).toBe(true);
  });

  it('lets model failures through for the caller to retry or fall back', async () => {
    llm.generateDesignSpec.mockImplementation(async () => { throw new Error('network down'); });
    await expect(writeCloneSpec(site(), settings)).rejects.toThrow('network down');
  });
});

describe('fallback', () => {
  it('only treats "cannot see images" errors as a reason to build from measurements', () => {
    expect(isNoVisionError(new ProviderUnsupportedError('Design spec', 'llamacpp', ['gemini']))).toBe(true);
    expect(isNoVisionError(new Error('The Ollama model "llama3" cannot read images. Pick a vision-capable model'))).toBe(true);
    expect(isNoVisionError(new Error('Pick a vision model: set a specific vision-capable model'))).toBe(true);
    expect(isNoVisionError(new Error('HTTP 503'))).toBe(false);
  });

  it('builds a measurements-only recipe without any model call', () => {
    const r = measuredRecipe(site());
    expect(r).toMatchObject({ title: 'Acme', pageType: 'other', tags: [], measuredOnly: true, truncated: false });
    expect(r.spec.sections.Overview).toBeUndefined();
    expect(llm.generateDesignSpec).not.toHaveBeenCalled();
  });
});
