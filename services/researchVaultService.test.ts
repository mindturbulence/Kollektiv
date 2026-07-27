import { describe, it, expect, beforeEach } from 'vitest';
import { researchVault } from './researchVaultService';
import type { IFileSystemManager } from '../utils/fileUtils';

// In-memory stand-in for the vault. Mirrors the two semantics the findings
// code depends on: readFile returns null for a missing file, and saveFile
// truncates (LocalFileSystemManager uses createWritable(), which defaults to
// keepExistingData: false).
const makeFakeFm = () => {
  const files = new Map<string, string>();
  return {
    files,
    fm: {
      readFile: async (path: string) => files.get(path) ?? null,
      saveFile: async (path: string, content: Blob) => {
        files.set(path, await content.text());
        return path;
      },
    } as unknown as IFileSystemManager,
  };
};

const SLUG = 'my-project';
const PATH = `research-projects/${SLUG}/findings.md`;

describe('researchVault.findings', () => {
  let files: Map<string, string>;
  let fm: IFileSystemManager;

  beforeEach(() => {
    ({ files, fm } = makeFakeFm());
  });

  it('load returns empty string when findings.md does not exist', async () => {
    expect(await researchVault.findings.load(SLUG, fm)).toBe('');
  });

  // ISSUE-10: "Save Findings" used to append, so three saves left three copies
  // of the text in the file.
  it('save overwrites rather than appends across repeated saves', async () => {
    await researchVault.findings.save(SLUG, 'first draft', fm);
    await researchVault.findings.save(SLUG, 'second draft', fm);
    await researchVault.findings.save(SLUG, 'final text', fm);

    const stored = files.get(PATH);
    expect(stored).toBe('final text');
    expect(stored!.split('final text').length - 1).toBe(1);
    expect(stored).not.toContain('first draft');
    expect(await researchVault.findings.load(SLUG, fm)).toBe('final text');
  });

  // ISSUE-12: the assistant's append_findings tool has to add to findings.md
  // without wiping what the user already wrote.
  it('append keeps existing content and separates entries with a rule', async () => {
    await researchVault.findings.save(SLUG, 'user notes', fm);
    await researchVault.findings.append(SLUG, 'assistant finding', fm);

    expect(files.get(PATH)).toBe('user notes\n\n---\n\nassistant finding');
  });

  it('append into an empty file writes the text alone, with no leading rule', async () => {
    await researchVault.findings.append(SLUG, 'first finding', fm);
    expect(files.get(PATH)).toBe('first finding');
  });

  it('save after append collapses the file back to exactly the saved text', async () => {
    await researchVault.findings.append(SLUG, 'a', fm);
    await researchVault.findings.append(SLUG, 'b', fm);
    await researchVault.findings.save(SLUG, 'edited everything', fm);

    expect(files.get(PATH)).toBe('edited everything');
  });
});
