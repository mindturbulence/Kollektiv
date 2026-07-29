import { describe, it, expect, beforeEach } from 'vitest';
import { registerBackend, getBackend, listBackends, _clearBackends } from './generationBackend';

const fake = (id: string) => ({
  id,
  label: id,
  isAvailable: async () => true,
  listModels: async () => ['m1'],
  listSamplers: async () => ['euler', 'dpmpp_2m'],
  generate: async () => ({ dataUrl: 'data:image/png;base64,AAA', backendId: id }),
});

describe('backend registry', () => {
  beforeEach(() => _clearBackends());

  it('registers and retrieves a backend', () => {
    registerBackend(fake('comfy'));
    expect(getBackend('comfy')?.label).toBe('comfy');
  });

  it('returns undefined for an unknown id', () => {
    expect(getBackend('nope')).toBeUndefined();
  });

  it('lists every registered backend', () => {
    registerBackend(fake('a1111'));
    registerBackend(fake('comfy'));
    expect(listBackends()).toHaveLength(2);
  });

  it('overwrites on duplicate id rather than duplicating', () => {
    registerBackend(fake('comfy'));
    registerBackend({ ...fake('comfy'), label: 'renamed' });
    expect(listBackends()).toHaveLength(1);
    expect(getBackend('comfy')?.label).toBe('renamed');
  });
});
