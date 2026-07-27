/**
 * Tests for mcp-config.json — config integrity, schema validation,
 * tool uniqueness, file existence, and category grouping.
 *
 * Lives in its own file (separate from kollektivMcp.test.ts) because
 * that file mocks node:fs entirely, which would break readFileSync calls.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ─── Shared parsing helpers ──────────────────────────────────────────────
// These reduce duplication across the schema <-> validator sync tests.

const SCHEMA_PATH = resolve(ROOT, 'mcp-config.schema.json');
const VALIDATOR_PATH = resolve(ROOT, 'scripts/validate-mcp-config.ts');

/** Parse mcp-config.schema.json and traverse a dotted property path. */
function schemaPath(...keys: string[]): unknown {
  const raw = readFileSync(SCHEMA_PATH, 'utf-8');
  const schema = JSON.parse(raw);
  let val: unknown = schema;
  for (const key of keys) {
    if (val && typeof val === 'object') {
      val = (val as Record<string, unknown>)[key];
    } else {
      throw new Error(`Cannot traverse "${key}" — parent is not an object`);
    }
  }
  return val;
}

/** Extract a string array literal from a `const <name> = new Set([...])` in the validator TS source. */
function validatorSetArray(constName: string): string[] {
  const source = readFileSync(VALIDATOR_PATH, 'utf-8');
  const pattern = new RegExp(
    `${constName}\\s*=\\s*new\\s+Set\\(\\[([\\s\\S]*?)\\]\\)`,
  );
  const match = source.match(pattern);
  if (!match) throw new Error(`Could not parse "${constName}" from validator script`);
  const items: string[] = [];
  for (const line of match[1].split(',')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const q = trimmed.match(/^"([^"]+)"$/);
    if (q) items.push(q[1]);
  }
  return items;
}

/** Extract field names that the validator checks as required errors via `Missing '<field>'` in errors.push(). */
function validatorRequiredFields(): string[] {
  const source = readFileSync(VALIDATOR_PATH, 'utf-8');
  const fields = new Set<string>();
  const re = /errors\.push[^)]*?Missing\s+'(\w+)'/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    fields.add(match[1]);
  }
  return [...fields].sort();
}

/** Spawn the validator script and capture exit code + output. */
function runValidator(): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', 'scripts/validate-mcp-config.ts'], {
      cwd: ROOT,
      shell: true,
      timeout: 30_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? -1 }));
    child.on('error', reject);
  });
}

/**
 * Assert two string arrays contain the same elements (order-independent).
 * Checks set equality first, then sorted-array diff for readable failure output.
 */
function assertMatchingSets(actual: string[], expected: string[]): void {
  expect(new Set(actual)).toEqual(new Set(expected));
  expect(actual.length).toBe(new Set(actual).size);
  expect(expected.length).toBe(new Set(expected).size);
  expect([...actual].sort()).toEqual([...expected].sort());
}

// ─── Main describe blocks ────────────────────────────────────────────────

describe('mcp-config.json', () => {
  let config: any;

  beforeAll(() => {
    const configPath = resolve(ROOT, 'mcp-config.json');
    expect(existsSync(configPath), 'mcp-config.json must exist').toBe(true);
    const raw = readFileSync(configPath, 'utf-8');
    config = JSON.parse(raw);
  });

  it('has version 1.0.0', () => {
    expect(config.version).toBe('1.0.0');
  });

  it('contains at least 90 tools', () => {
    expect(Array.isArray(config.tools)).toBe(true);
    expect(config.tools.length).toBeGreaterThanOrEqual(90);
  });

  it('every tool has required fields', () => {
    for (const tool of config.tools) {
      expect(tool.name).toBeDefined();
      expect(typeof tool.name).toBe('string');
      expect(tool.description).toBeDefined();
      expect(typeof tool.description).toBe('string');
      expect(tool.executionKind).toBeDefined();
      expect(['browser-context', 'server-context', 'hybrid']).toContain(tool.executionKind);
      expect(tool.filePath).toBeDefined();
      expect(tool.sourceModule).toBeDefined();
      expect(tool.category).toBeDefined();
      expect(tool.parameters).toBeDefined();
      expect(tool.parameters.type).toBe('object');
    }
  });

  it('all tool names are unique', () => {
    const names = config.tools.map((t: any) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('all tool names match [a-z][a-z0-9_]*', () => {
    const pattern = /^[a-z][a-z0-9_]*$/;
    for (const tool of config.tools) {
      expect(tool.name).toMatch(pattern);
    }
  });

  it('filePaths point to existing files', () => {
    for (const tool of config.tools) {
      const fullPath = resolve(ROOT, tool.filePath);
      expect(existsSync(fullPath), `File not found: ${tool.filePath} (tool: ${tool.name})`).toBe(true);
    }
  });

  it('includes well-known tools', () => {
    const names = config.tools.map((t: any) => t.name);
    expect(names).toContain('navigate');
    expect(names).toContain('web_search');
    expect(names).toContain('generate_image');
    expect(names).toContain('browser_complete_task');
    expect(names).toContain('read_gmail');
    expect(names).toContain('obsidian_search_notes');
    expect(names).toContain('github_get_repo');
  });
});

describe('MCP native tool schemas', () => {
  let config: any;

  beforeAll(() => {
    const raw = readFileSync(resolve(ROOT, 'mcp-config.json'), 'utf-8');
    config = JSON.parse(raw);
  });

  it('parameterless tool has empty properties', () => {
    const stopMedia = config.tools.find((t: any) => t.name === 'stop_media');
    expect(stopMedia).toBeDefined();
    expect(stopMedia.parameters.properties).toEqual({});
  });

  it('tool with params has property definitions', () => {
    const navigate = config.tools.find((t: any) => t.name === 'navigate');
    expect(navigate).toBeDefined();
    expect(navigate.parameters.properties.page).toBeDefined();
    expect(navigate.parameters.required).toContain('page');
  });

  it('tools with permissions are correctly declared', () => {
    const browserClick = config.tools.find((t: any) => t.name === 'browser_click');
    expect(browserClick).toBeDefined();
    expect(Array.isArray(browserClick.permissions)).toBe(true);
    expect(browserClick.permissions.length).toBeGreaterThan(0);
    expect(browserClick.permissions).toContain('screen:share');
  });
});

describe('MCP permissions', () => {
  let config: any;

  beforeAll(() => {
    const raw = readFileSync(resolve(ROOT, 'mcp-config.json'), 'utf-8');
    config = JSON.parse(raw);
  });

  it('all permission values are arrays of non-empty strings', () => {
    const toolsWithPerms = config.tools.filter((t: any) => t.permissions !== undefined);
    expect(toolsWithPerms.length).toBeGreaterThan(0);
    for (const tool of toolsWithPerms) {
      expect(Array.isArray(tool.permissions),
        `"${tool.name}": permissions must be an array`
      ).toBe(true);
      expect(tool.permissions.length,
        `"${tool.name}": permissions array must not be empty`
      ).toBeGreaterThan(0);
      for (const perm of tool.permissions) {
        expect(typeof perm,
          `"${tool.name}": permission must be a string, got ${typeof perm}`
        ).toBe('string');
        expect(perm.length,
          `"${tool.name}": permission string must not be empty`
        ).toBeGreaterThan(0);
      }
    }
  });

  it('all permission values use namespaced format (namespace:action)', () => {
    const permPattern = /^[a-z]+:[a-z_]+$/;
    const toolsWithPerms = config.tools.filter((t: any) => t.permissions !== undefined);
    for (const tool of toolsWithPerms) {
      for (const perm of tool.permissions) {
        expect(perm).toMatch(permPattern);
      }
    }
  });

  it('collects all unique permission values for reference', () => {
    const allPerms = new Set<string>();
    for (const tool of config.tools) {
      if (Array.isArray(tool.permissions)) {
        for (const p of tool.permissions) {
          allPerms.add(p);
        }
      }
    }
    const sorted = [...allPerms].sort();
    expect(sorted.length).toBeGreaterThanOrEqual(5);
    // Log for documentation in test output
    console.log('[permissions] unique values:', sorted.join(', '));

    // Verify known permission categories are present
    expect(sorted).toContain('screen:share');
    expect(sorted).toContain('control:grant');
    expect(sorted).toContain('cdp:connected');
    expect(sorted).toContain('google:auth');
    expect(sorted).toContain('spotify:auth');
    expect(sorted).toContain('vault:read');
    expect(sorted).toContain('vault:write');
  });

  it('browser automation tools (screen:share group) declare screen+control permissions', () => {
    const toolsWithScreen = config.tools.filter(
      (t: any) => Array.isArray(t.permissions) && t.permissions.includes('screen:share'),
    );
    // All tools requiring screen:share should also require control:grant
    for (const tool of toolsWithScreen) {
      expect(tool.permissions).toContain('control:grant');
    }
  });

  it('browser_complete_task also declares gemini:vision', () => {
    const tool = config.tools.find((t: any) => t.name === 'browser_complete_task');
    expect(tool).toBeDefined();
    expect(tool.permissions).toBeDefined();
    expect(tool.permissions).toContain('screen:share');
    expect(tool.permissions).toContain('control:grant');
    expect(tool.permissions).toContain('gemini:vision');
  });

  it('CDP-connected tools only require cdp:connected', () => {
    const cdpTools = config.tools.filter(
      (t: any) => Array.isArray(t.permissions) && t.permissions.includes('cdp:connected'),
    );
    expect(cdpTools.length).toBeGreaterThan(0);
    for (const tool of cdpTools) {
      // CDP-only tools should only have cdp:connected (no screen:share etc.)
      expect(tool.permissions).toEqual(['cdp:connected']);
    }
  });

  it('gmail tools require google:auth (and send_gmail also gmail:send)', () => {
    const gmailTools = config.tools.filter((t: any) => t.category === 'gmail');
    for (const tool of gmailTools) {
      expect(tool.permissions).toBeDefined();
      expect(tool.permissions).toContain('google:auth');
      if (tool.name === 'send_gmail') {
        expect(tool.permissions).toContain('gmail:send');
      } else {
        expect(tool.permissions).not.toContain('gmail:send');
      }
    }
  });

  it('spotify tools with permissions all require spotify:auth', () => {
    const spotifyTools = config.tools.filter(
      (t: any) => t.category === 'spotify' && t.permissions !== undefined,
    );
    expect(spotifyTools.length).toBeGreaterThan(0);
    for (const tool of spotifyTools) {
      expect(tool.permissions).toEqual(['spotify:auth']);
    }
  });

  it('at least one spotify tool has permissions declared', () => {
    const spotifyWithPerms = config.tools.filter(
      (t: any) => t.category === 'spotify' && t.permissions !== undefined,
    );
    const spotifyTotal = config.tools.filter((t: any) => t.category === 'spotify').length;
    console.log(`[spotify] ${spotifyWithPerms.length}/${spotifyTotal} tools have permissions`);
    expect(spotifyWithPerms.length).toBeGreaterThanOrEqual(2);
  });

  it('obsidian vault tools declare vault:read or vault:write', () => {
    const vaultTools = config.tools.filter((t: any) => t.category === 'obsidian');
    for (const tool of vaultTools) {
      expect(tool.permissions).toBeDefined();
      for (const perm of tool.permissions) {
        expect(perm.startsWith('vault:')).toBe(true);
      }
    }
  });
});

describe('MCP tool categories', () => {
  let config: any;

  beforeAll(() => {
    const raw = readFileSync(resolve(ROOT, 'mcp-config.json'), 'utf-8');
    config = JSON.parse(raw);
  });

  it('contains tools from all major source modules', () => {
    const sourceModules = new Set(config.tools.map((t: any) => t.sourceModule));
    expect(sourceModules.has('ASSISTANT_TOOLS')).toBe(true);
    expect(sourceModules.has('browserTools')).toBe(true);
    expect(sourceModules.has('obsidianTools')).toBe(true);
    expect(sourceModules.has('gmailTools')).toBe(true);
    expect(sourceModules.has('spotifyTools')).toBe(true);
    expect(sourceModules.has('githubTools')).toBe(true);
  });

  it('has sufficient browser tools', () => {
    const browserTools = config.tools.filter((t: any) => t.category === 'browser');
    expect(browserTools.length).toBeGreaterThanOrEqual(21);
  });

  it('has 3 gmail tools', () => {
    const gmail = config.tools.filter((t: any) => t.category === 'gmail');
    expect(gmail.length).toBe(3);
  });
});

describe('schema <-> validator sync', () => {
  it('category enum in schema matches VALID_CATEGORIES in validator', () => {
    const fromSchema = schemaPath('definitions', 'ToolDefinition', 'properties', 'category', 'enum') as string[];
    const fromValidator = validatorSetArray('VALID_CATEGORIES');
    assertMatchingSets(fromSchema, fromValidator);
  });

  it('schema category list has no duplicates', () => {
    const cats = schemaPath('definitions', 'ToolDefinition', 'properties', 'category', 'enum') as string[];
    expect(cats.length).toBe(new Set(cats).size);
  });

  it('validator category list has no duplicates', () => {
    const cats = validatorSetArray('VALID_CATEGORIES');
    expect(cats.length).toBe(new Set(cats).size);
  });

  it('executionKind enum in schema matches VALID_EXECUTION_KINDS in validator', () => {
    const fromSchema = schemaPath('definitions', 'ToolDefinition', 'properties', 'executionKind', 'enum') as string[];
    const fromValidator = validatorSetArray('VALID_EXECUTION_KINDS');
    assertMatchingSets(fromSchema, fromValidator);
  });

  it('schema executionKind list has no duplicates', () => {
    const kinds = schemaPath('definitions', 'ToolDefinition', 'properties', 'executionKind', 'enum') as string[];
    expect(kinds.length).toBe(new Set(kinds).size);
  });

  it('validator executionKind list has no duplicates', () => {
    const kinds = validatorSetArray('VALID_EXECUTION_KINDS');
    expect(kinds.length).toBe(new Set(kinds).size);
  });

  it('ToolDefinition required fields in schema match validator error checks', () => {
    const schemaRequired = schemaPath('definitions', 'ToolDefinition', 'required') as string[];
    const validatorRequired = validatorRequiredFields();
    assertMatchingSets(schemaRequired, validatorRequired);
  });

  it('validator tool count matches config and exits 0', async () => {
    const { stdout, stderr, exitCode } = await runValidator();

    // 1. Exit code must be 0 (validator passed)
    expect(exitCode).toBe(0);

    // 2. Tool count must match the parsed config
    const match = stdout.match(/\[validate-mcp-config\] (\d+) tools/);
    expect(match, 'Could not parse tool count from validator output').toBeTruthy();
    const validatorCount = parseInt(match![1], 10);
    const config = JSON.parse(readFileSync(resolve(ROOT, 'mcp-config.json'), 'utf-8'));
    expect(validatorCount).toBe(config.tools.length);

    // 3. Log any warnings from stderr for visibility
    if (stderr.trim()) {
      console.log('[validator] stderr output (warnings):', stderr);
    }
  }, 30_000);
});
