import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { capabilityRegistry } from './capabilityRegistry';
import type { CapabilityContract } from './capabilityRegistry';

// ─── Helpers ──────────────────────────────────────────────────────────────

const makeCap = (overrides: Partial<CapabilityContract> = {}): CapabilityContract => ({
  id: 'test-cap',
  name: 'Test Capability',
  description: 'A test capability for unit testing.',
  input: { type: 'object', properties: {} },
  output: { type: 'string' },
  execution: { kind: 'assistant-tool', toolName: 'test_tool' },
  ...overrides,
});

/** Track which cap ids we register so afterEach can clean up. */
const _registeredIds = new Set<string>();

function reg(...caps: CapabilityContract[]): void {
  capabilityRegistry.register(...caps);
  for (const c of caps) if (c.id) _registeredIds.add(c.id);
}

// ─── Setup / teardown ─────────────────────────────────────────────────────

beforeEach(() => {
  _registeredIds.clear();
});

afterEach(() => {
  for (const id of _registeredIds) {
    capabilityRegistry.unregister(id);
  }
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe('capabilityRegistry', () => {
  describe('register', () => {
    it('registers a single capability', () => {
      reg(makeCap({ id: 'cap_1', name: 'One' }));
      expect(capabilityRegistry.get('cap_1')).toBeDefined();
      expect(capabilityRegistry.size).toBe(1);
    });

    it('registers multiple capabilities at once', () => {
      reg(
        makeCap({ id: 'cap_a', name: 'A' }),
        makeCap({ id: 'cap_b', name: 'B' }),
        makeCap({ id: 'cap_c', name: 'C' }),
      );
      expect(capabilityRegistry.size).toBe(3);
    });

    it('overwrites an existing capability on re-registration (last-write-wins)', () => {
      reg(makeCap({ id: 'overwrite', name: 'Original' }));
      reg(makeCap({ id: 'overwrite', name: 'Updated', description: 'New description' }));

      const cap = capabilityRegistry.get('overwrite');
      expect(cap).toBeDefined();
      expect(cap!.name).toBe('Updated');
      expect(cap!.description).toBe('New description');
    });

    it('skips caps missing an id with a warning', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const noId = makeCap({ id: '' as any });
      reg(noId);
      expect(capabilityRegistry.size).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(
        '[CapabilityRegistry] skipping invalid capability (missing id or name):',
        expect.any(Object),
      );
      warnSpy.mockRestore();
    });

    it('skips caps missing a name with a warning', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      reg(makeCap({ id: 'no_name', name: '' }));
      expect(capabilityRegistry.size).toBe(0);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('unregister', () => {
    it('removes a registered capability', () => {
      reg(makeCap({ id: 'to_remove' }));
      expect(capabilityRegistry.size).toBe(1);

      const result = capabilityRegistry.unregister('to_remove');
      _registeredIds.delete('to_remove');
      expect(result).toBe(true);
      expect(capabilityRegistry.size).toBe(0);
    });

    it('returns false for non-existent id', () => {
      expect(capabilityRegistry.unregister('nonexistent')).toBe(false);
    });
  });

  describe('get', () => {
    it('returns the capability for a known id', () => {
      reg(makeCap({ id: 'get_me' }));
      const cap = capabilityRegistry.get('get_me');
      expect(cap).toBeDefined();
      expect(cap!.id).toBe('get_me');
    });

    it('returns undefined for an unknown id', () => {
      expect(capabilityRegistry.get('i_dont_exist')).toBeUndefined();
    });
  });

  describe('list', () => {
    it('returns all registered capabilities when no filter is given', () => {
      reg(
        makeCap({ id: 'list_a', execution: { kind: 'assistant-tool', toolName: 'a' } }),
        makeCap({ id: 'list_b', execution: { kind: 'mcp' } }),
        makeCap({ id: 'list_c', execution: { kind: 'provider', provider: 'gemini' } }),
      );
      expect(capabilityRegistry.list()).toHaveLength(3);
    });

    it('filters by execution kind', () => {
      reg(
        makeCap({ id: 'tool_1', execution: { kind: 'assistant-tool', toolName: 't1' } }),
        makeCap({ id: 'mcp_1', execution: { kind: 'mcp' } }),
        makeCap({ id: 'prov_1', execution: { kind: 'provider', provider: 'gemini' } }),
      );

      const tools = capabilityRegistry.list('assistant-tool');
      expect(tools).toHaveLength(1);
      expect(tools[0].id).toBe('tool_1');

      expect(capabilityRegistry.list('mcp')).toHaveLength(1);
      expect(capabilityRegistry.list('local')).toHaveLength(0);
    });

    it('returns empty array when no capabilities match the filter', () => {
      reg(makeCap({ id: 'only_tool', execution: { kind: 'assistant-tool', toolName: 'x' } }));
      expect(capabilityRegistry.list('mcp')).toHaveLength(0);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      reg(
        makeCap({
          id: 'refine_prompt',
          name: 'Refine Prompt',
          description: 'Run a raw idea through the refiner engine.',
          tags: ['prompt', 'refinement'],
        }),
        makeCap({
          id: 'generate_image',
          name: 'Generate Image',
          description: 'Create an image using Imagen.',
          tags: ['generation', 'image'],
        }),
        makeCap({
          id: 'search_memories',
          name: 'Search Memories',
          description: 'Find relevant memories by keyword.',
          tags: ['memory', 'search'],
        }),
      );
    });

    it('matches by id', () => {
      const results = capabilityRegistry.search('refine_prompt');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('refine_prompt');
    });

    it('matches by name', () => {
      const results = capabilityRegistry.search('Generate');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('generate_image');
    });

    it('matches by description', () => {
      const results = capabilityRegistry.search('refiner');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('refine_prompt');
    });

    it('matches by tags', () => {
      const results = capabilityRegistry.search('memory');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('search_memories');
    });

    it('is case-insensitive', () => {
      const results = capabilityRegistry.search('REFINE');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('refine_prompt');
    });

    it('matches by id, name, description, and tags — all fields are searched', () => {
      // refine_prompt matches via id, generate_image doesn't match 'prompt',
      // search_memories doesn't match 'prompt' — only 1 result
      const results = capabilityRegistry.search('prompt');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('refine_prompt');
    });

    it('returns empty array when no capabilities match', () => {
      const results = capabilityRegistry.search('zzzz_nonexistent');
      expect(results).toHaveLength(0);
    });

    it('handles empty query (matches everything up to MAX_RESULTS)', () => {
      const results = capabilityRegistry.search('');
      expect(results.length).toBeGreaterThanOrEqual(3);
    });

    it('respects MAX_RESULTS cap (50) when many capabilities exist', () => {
      // Register 60 capabilities
      const many = Array.from({ length: 60 }, (_, i) =>
        makeCap({ id: `bulk_${i}`, name: `Bulk Cap ${i}` }),
      );
      reg(...many);

      const results = capabilityRegistry.search('');
      expect(results.length).toBeLessThanOrEqual(50);
    });
  });

  describe('exportManifest', () => {
    it('returns a manifest with version and capabilities array', () => {
      reg(
        makeCap({ id: 'exp_1', name: 'Export One' }),
        makeCap({ id: 'exp_2', name: 'Export Two' }),
      );
      const manifest = capabilityRegistry.exportManifest();
      expect(manifest).toHaveProperty('version', '1.0.0');
      expect(Array.isArray(manifest.capabilities)).toBe(true);
      expect(manifest.capabilities).toHaveLength(2);
    });
  });

  describe('size', () => {
    it('reflects the current number of registered capabilities', () => {
      expect(capabilityRegistry.size).toBe(0);
      reg(makeCap({ id: 'size_1' }));
      expect(capabilityRegistry.size).toBe(1);
      reg(makeCap({ id: 'size_2' }));
      expect(capabilityRegistry.size).toBe(2);
      capabilityRegistry.unregister('size_1');
      _registeredIds.delete('size_1');
      expect(capabilityRegistry.size).toBe(1);
    });
  });

  describe('setHealth', () => {
    it('marks a capability as healthy with a message', () => {
      reg(makeCap({ id: 'health_ok' }));
      capabilityRegistry.setHealth('health_ok', true, 'All systems operational');

      const cap = capabilityRegistry.get('health_ok');
      expect(cap!.healthy).toBe(true);
      expect(cap!.healthMessage).toBe('All systems operational');
    });

    it('marks a capability as unhealthy', () => {
      reg(makeCap({ id: 'health_down' }));
      capabilityRegistry.setHealth('health_down', false, 'Provider unreachable');

      const cap = capabilityRegistry.get('health_down');
      expect(cap!.healthy).toBe(false);
      expect(cap!.healthMessage).toBe('Provider unreachable');
    });

    it('warns when setting health for an unknown capability', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      capabilityRegistry.setHealth('i_dont_exist', false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('setHealth: unknown capability "i_dont_exist"'),
      );
      warnSpy.mockRestore();
    });
  });
});
