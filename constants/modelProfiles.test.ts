import { describe, it, expect } from 'vitest';
import { lookupModelProfile, serializeModifierToken } from './modelProfiles';

describe('lookupModelProfile', () => {
  it('returns a full ModelProfile object', () => {
    const profile = lookupModelProfile('sdxl');
    expect(profile).toHaveProperty('name');
    expect(profile).toHaveProperty('format');
    expect(profile).toHaveProperty('rules');
    expect(profile).toHaveProperty('mediaType');
  });

  it('returns weighting fields for SDXL', () => {
    const profile = lookupModelProfile('stable diffusion');
    expect(profile.supportsTokenWeighting).toBe(true);
    expect(profile.weightSyntax).toBe('(token:weight)');
    expect(profile.minWeight).toBe(0.1);
    expect(profile.maxWeight).toBe(2.0);
    expect(profile.weightStep).toBe(0.05);
  });

  it('returns weighting fields for Pony', () => {
    const profile = lookupModelProfile('PONY Diffusion XL (v6)');
    expect(profile.supportsTokenWeighting).toBe(true);
    expect(profile.weightSyntax).toBe('(token:weight)');
  });

  it('returns weighting fields for Illustrious', () => {
    const profile = lookupModelProfile('Illustrious XL');
    expect(profile.supportsTokenWeighting).toBe(true);
  });

  it('returns weighting fields for A1111 / Forge', () => {
    const profile = lookupModelProfile('a1111');
    expect(profile.supportsTokenWeighting).toBe(true);
    expect(profile.weightSyntax).toBe('(token:weight)');
  });

  it('does not set weighting for Flux', () => {
    const profile = lookupModelProfile('flux');
    expect(profile.supportsTokenWeighting).toBeUndefined();
  });

  it('does not set weighting for Imagen', () => {
    const profile = lookupModelProfile('imagen');
    expect(profile.supportsTokenWeighting).toBeUndefined();
  });

  it('does not set weighting for unknown model', () => {
    const profile = lookupModelProfile('some-unknown-model');
    expect(profile.supportsTokenWeighting).toBe(false);
  });

  it('does not set weighting for DALL-E', () => {
    const profile = lookupModelProfile('GPT-4o Image (DALL-E 3)');
    expect(profile.supportsTokenWeighting).toBeUndefined();
  });

  it('does not set weighting for Midjourney', () => {
    const profile = lookupModelProfile('midjourney');
    expect(profile.supportsTokenWeighting).toBeUndefined();
  });

  it('returns fallback generic profile for unrecognized model', () => {
    const profile = lookupModelProfile('nonexistent-model-xyz');
    expect(profile.name).toBe('Generic Image');
    expect(profile.supportsTokenWeighting).toBe(false);
  });
});

describe('serializeModifierToken', () => {
  it('wraps token with weight for SDXL', () => {
    const result = serializeModifierToken('cinematic', 1.3, 'sdxl');
    expect(result).toBe('(cinematic:1.30)');
  });

  it('returns plain token for Flux (no weighting)', () => {
    const result = serializeModifierToken('cinematic', 1.3, 'flux');
    expect(result).toBe('cinematic');
  });

  it('returns plain token for unknown model', () => {
    const result = serializeModifierToken('cinematic', 1.3, 'some-unknown-model');
    expect(result).toBe('cinematic');
  });

  it('returns plain token at weight 1.0', () => {
    const result = serializeModifierToken('cinematic', 1.0, 'sdxl');
    expect(result).toBe('cinematic');
  });

  it('returns plain token at weight 1.0 for Flux', () => {
    const result = serializeModifierToken('cinematic', 1.0, 'flux');
    expect(result).toBe('cinematic');
  });

  it('wraps token with decimal precision for SD model', () => {
    const result = serializeModifierToken('highly detailed', 1.5, 'stable diffusion');
    expect(result).toBe('(highly detailed:1.50)');
  });

  it('wraps token for Pony model', () => {
    const result = serializeModifierToken('score_9', 1.2, 'pony');
    expect(result).toBe('(score_9:1.20)');
  });

  it('wraps token for A1111 model', () => {
    const result = serializeModifierToken('masterpiece', 1.5, 'a1111');
    expect(result).toBe('(masterpiece:1.50)');
  });
});

import { TARGET_AUDIO_AI_MODELS, TARGET_IMAGE_AI_MODELS, TARGET_VIDEO_AI_MODELS } from './models';

describe('media separation', () => {
  it('every image target resolves to an image profile (never a video or audio recipe)', () => {
    const bad = TARGET_IMAGE_AI_MODELS.filter(m => lookupModelProfile(m).mediaType !== 'image');
    expect(bad).toEqual([]);
  });

  it('every video target resolves to a video profile and every audio target to an audio one', () => {
    expect(TARGET_VIDEO_AI_MODELS.filter(m => lookupModelProfile(m, true).mediaType !== 'video')).toEqual([]);
    expect(TARGET_AUDIO_AI_MODELS.filter(m => lookupModelProfile(m, false, true).mediaType !== 'audio')).toEqual([]);
  });

  it('image profiles carry no motion or timeline fields', () => {
    for (const m of TARGET_IMAGE_AI_MODELS) {
      const p = lookupModelProfile(m);
      expect(p.videoTimeline, m).toBeUndefined();
      expect(p.videoDurations, m).toBeUndefined();
    }
  });

  it('HiDream image and video models land on different profiles', () => {
    expect(lookupModelProfile('HiDream-O1-Image-1.5').mediaType).toBe('image');
    expect(lookupModelProfile('HiDream (Excellence)').mediaType).toBe('video');
  });

  it('SD 3.x / 4.x use natural language, SDXL keeps weighted tags', () => {
    expect(lookupModelProfile('Stable Diffusion 3.5 Large').format).toMatch(/Natural Language/);
    // Weights stay available for SD 3.x too (they were there before the natural-language profile).
    expect(lookupModelProfile('Stable Diffusion 3.5 Large').supportsTokenWeighting).toBe(true);
    expect(lookupModelProfile('Stable Diffusion XL').supportsTokenWeighting).toBe(true);
  });

  it('image recipes are natural-language narrative formats', () => {
    for (const m of ['FLUX.2 [pro]', 'Google Imagen 4 (Nano Banana Pro)', 'GPT Image 2 (OpenAI)', 'Midjourney v7', 'Google Nano Banana 2 (Gemini 3.1 Flash)']) {
      expect(lookupModelProfile(m).format, m).toMatch(/Natural Language|Narrative|Descriptive/);
    }
  });
});

describe('current model versions (Oct 2026 refresh)', () => {
  it('lists the newer releases alongside the older names saved presets may still hold', () => {
    const has = (list: string[], names: string[]) => names.forEach(n => expect(list, n).toContain(n));
    has(TARGET_IMAGE_AI_MODELS, ['Midjourney v8.2', 'GPT Image 2.5 (OpenAI)', 'Ideogram 4.0', 'Recraft V4.1', 'Seedream 5.0 Pro', 'FLUX.2 [max]', 'Midjourney v7', 'GPT Image 2 (OpenAI)']);
    has(TARGET_VIDEO_AI_MODELS, ['Seedance 2.5 (ByteDance)', 'WAN 3.0 (Alibaba)', 'Luma Ray 3.2', 'MiniMax H3', 'LTX-2.5', 'Gemini Omni Flash (Google)', 'Seedance 2.0 (ByteDance)', 'Google Veo 3.1']);
    has(TARGET_AUDIO_AI_MODELS, ['Suno v6 (Music)', 'ElevenLabs Music v2.5', 'ElevenLabs v4 (TTS)', 'Lyria 3.5 (Google)', 'Fish Audio S2', 'Suno v5 (Music)']);
  });

  it('has no duplicate names in any list', () => {
    for (const list of [TARGET_IMAGE_AI_MODELS, TARGET_VIDEO_AI_MODELS, TARGET_AUDIO_AI_MODELS]) {
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it('new video models resolve to the right dialect and limits', () => {
    expect(lookupModelProfile('Seedance 2.5 (ByteDance)', true).videoDurationRange).toEqual([4, 30]);
    expect(lookupModelProfile('Seedance 2.0 (ByteDance)', true).videoDurationRange).toEqual([2, 15]);
    expect(lookupModelProfile('WAN 3.0 (Alibaba)', true).videoDurationRange).toEqual([2, 30]);
    expect(lookupModelProfile('WAN 2.7 (Open Weights)', true).videoDurationRange).toEqual([2, 15]);
    expect(lookupModelProfile('MiniMax H3 Max', true).videoTimeline).toBe('prose');
    expect(lookupModelProfile('Luma Ray 3.2', true).videoDurations).toEqual([5, 10]);
  });

  it('new image and audio names land on image / audio profiles', () => {
    expect(lookupModelProfile('GPT Image 2.5 (OpenAI)').name).toBe('GPT / DALL-E');
    expect(lookupModelProfile('Midjourney v8.2').name).toBe('Midjourney');
    expect(lookupModelProfile('FLUX.2 [max]').name).toBe('Flux');
    expect(lookupModelProfile('Suno v6 (Music)', false, true).mediaType).toBe('audio');
    expect(lookupModelProfile('ElevenLabs v4 (TTS)', false, true).mediaType).toBe('audio');
  });
});

describe('legacy compatibility recipes (weights, scores, negatives)', () => {
  const weighted = ['Stable Diffusion 1.5', 'Stable Diffusion XL', 'Stable Diffusion 3.5 Large', 'Stable Diffusion 4.0 Large', 'PONY Diffusion XL (v6)', 'Illustrious XL', 'NoobAI-XL'];

  it('keeps the (token:weight) syntax and slider range on every Stable Diffusion family model', () => {
    for (const m of weighted) {
      const p = lookupModelProfile(m);
      expect(p.supportsTokenWeighting, m).toBe(true);
      expect(p.weightSyntax, m).toBe('(token:weight)');
      expect(p.minWeight, m).toBe(0.1);
      expect(p.maxWeight, m).toBe(2.0);
      expect(p.supportsNegativePrompt, m).toBe(true);
      expect(serializeModifierToken('soft light', 1.3, m), m).toBe('(soft light:1.30)');
      expect(serializeModifierToken('soft light', 1.0, m), m).toBe('soft light');
    }
  });

  it('SD 1.5 gets its own keyword-tag recipe with chunk and quality-booster guidance', () => {
    const p = lookupModelProfile('Stable Diffusion 1.5');
    expect(p.name).toBe('Stable Diffusion 1.5 / 2.x');
    expect(p.rules).toMatch(/75 tokens/);
    expect(p.rules).toMatch(/masterpiece, best quality/);
    expect(lookupModelProfile('Stable Diffusion XL').name).toBe('Stable Diffusion / SDXL');
  });

  it('Pony keeps the full score string, Illustrious / NoobAI use quality tags instead', () => {
    const pony = lookupModelProfile('PONY Diffusion XL (v6)');
    expect(pony.name).toBe('Pony');
    expect(pony.rules).toContain('score_9, score_8_up, score_7_up, score_6_up, score_5_up, score_4_up');
    expect(pony.rules).toMatch(/source_anime/);
    expect(pony.rules).toMatch(/rating_safe/);
    for (const m of ['Illustrious XL', 'NoobAI-XL']) {
      const p = lookupModelProfile(m);
      expect(p.name).toBe('Illustrious / NoobAI');
      expect(p.rules).toMatch(/masterpiece, best quality/);
      expect(p.rules).toMatch(/do not use Pony's score_ tags/);
    }
  });

  it('A1111 / Forge documents emphasis, BREAK and prompt editing', () => {
    const p = lookupModelProfile('A1111 / Forge target');
    expect(p.name).toBe('A1111 / Forge');
    expect(p.rules).toMatch(/\(word:1\.5\)/);
    expect(p.rules).toMatch(/BREAK/);
    expect(p.rules).toMatch(/\[from:to:0\.5\]/);
  });

  it('older Midjourney versions keep a keyword-phrase recipe, v7+ is natural language', () => {
    for (const m of ['Midjourney v5.2', 'Midjourney v6', 'Midjourney v6.1']) {
      expect(lookupModelProfile(m).name, m).toBe('Midjourney v5-v6.1');
    }
    expect(lookupModelProfile('Midjourney v7').format).toMatch(/Natural Language/);
    expect(lookupModelProfile('Midjourney v6').rules).toMatch(/::/);
  });

  it('the restored older models are selectable again', () => {
    for (const m of ['Stable Diffusion 1.5', 'Midjourney v6', 'Midjourney v5.2', 'NoobAI-XL']) {
      expect(TARGET_IMAGE_AI_MODELS, m).toContain(m);
    }
  });
});
