import { describe, it, expect, vi, beforeEach } from 'vitest';

const writeNoteMock = vi.fn(async (_path: string, _content: string) => {});
const isObsidianConnectedMock = vi.fn(() => true);
vi.mock('../../utils/obsidianStorage', () => ({
  writeNote: (path: string, content: string) => writeNoteMock(path, content),
  isObsidianConnected: () => isObsidianConnectedMock(),
  getNote: vi.fn(async () => null),
}));

vi.mock('../knowledgeLifecycle', () => ({
  knowledgeLifecycle: {
    determineStage: () => 'projects',
    generatePath: (_stage: string, _kind: string, id: string) => `knowledge/projects/${id}.md`,
  },
}));

const savePresetMock = vi.fn(async (_preset: unknown) => {});
vi.mock('../refinerPresetService', () => ({
  refinerPresetService: { savePreset: (preset: unknown) => savePresetMock(preset) },
}));

import { extractStoryAssetsTool } from './storyAssetExtractor';

const SCRIPT = `
INT. KITCHEN - DAY

JANE enters, looking tired.

JANE
I need coffee.

JANE
Seriously, right now.

INT. LIVING ROOM - NIGHT

BOB is watching TV.

BOB
Did you sleep at all?

BOB
You look rough.

MONTAGE

JANE
One more line to keep count low.
`;

describe('extractStoryAssetsTool', () => {
  beforeEach(() => {
    writeNoteMock.mockClear();
    savePresetMock.mockClear();
    isObsidianConnectedMock.mockReturnValue(true);
  });

  it('extracts characters that clear the occurrence gate and cross-links them to locations', async () => {
    const result = await extractStoryAssetsTool.execute({ text: SCRIPT }, {} as any);

    expect(result).toContain('JANE');
    expect(result).toContain('BOB');
    expect(result).toContain('KITCHEN');
    expect(result).toContain('LIVING ROOM');

    // 2 characters + 2 locations = 4 notes, 4 presets
    expect(writeNoteMock).toHaveBeenCalledTimes(4);
    expect(savePresetMock).toHaveBeenCalledTimes(4);

    const janeNote = writeNoteMock.mock.calls.find((c) => c[0].includes('character_jane'))![1] as string;
    expect(janeNote).toContain('[[KITCHEN]]');

    const kitchenNote = writeNoteMock.mock.calls.find((c) => c[0].includes('location_kitchen'))![1] as string;
    expect(kitchenNote).toContain('[[JANE]]');
  });

  it('rejects a single-occurrence slug (MONTAGE) as a low-confidence candidate instead of writing a note for it', async () => {
    const result = await extractStoryAssetsTool.execute({ text: SCRIPT }, {} as any);
    expect(writeNoteMock.mock.calls.some((c) => c[0].includes('montage'))).toBe(false);
    // MONTAGE is filtered by the slug list before it even reaches the occurrence gate.
    expect(result).not.toContain('MONTAGE');
  });

  it('returns a message and writes nothing for non-Fountain plain text', async () => {
    const result = await extractStoryAssetsTool.execute({ text: 'Just some ordinary prose, not a script.' }, {} as any);
    expect(result).toContain('No Fountain-formatted content detected');
    expect(writeNoteMock).not.toHaveBeenCalled();
    expect(savePresetMock).not.toHaveBeenCalled();
  });

  it('errors when neither text nor vaultPath is provided', async () => {
    const result = await extractStoryAssetsTool.execute({}, {} as any);
    expect(result).toContain('Error');
  });
});
