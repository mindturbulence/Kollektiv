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
    expect(profile.supportsTokenWeighting).toBeUndefined();
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
    expect(profile.supportsTokenWeighting).toBeUndefined();
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
