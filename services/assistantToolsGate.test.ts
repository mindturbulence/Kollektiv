import { describe, it, expect, beforeEach, vi } from 'vitest';
import { executeAssistantTool, type AssistantTool } from './assistantTools';
import { noteUserUtterance, noteAssistantOutput, resetConfirmationGate } from './confirmationGate';
import { defaultLLMSettings } from '../utils/settingsStorage';

describe('executeAssistantTool confirmation gate', () => {
    const execute = vi.fn(async () => 'deleted');
    const tool: AssistantTool = {
        name: 'test_destructive',
        description: 'test',
        parameters: { type: 'object', properties: {} },
        requiresConfirmation: true,
        execute,
    };
    const ctx = { settings: defaultLLMSettings };

    beforeEach(() => { resetConfirmationGate(); execute.mockClear(); });

    it('parks the first call, then runs it once the user answered', async () => {
        noteUserUtterance();
        const first = await executeAssistantTool('test_destructive', { id: '1' }, ctx, [tool]);
        expect(first).toMatch(/^CONFIRMATION_REQUIRED/);
        expect(execute).not.toHaveBeenCalled();

        noteAssistantOutput();
        noteUserUtterance();
        expect(await executeAssistantTool('test_destructive', { id: '1' }, ctx, [tool])).toBe('deleted');
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('does not gate tools without the flag', async () => {
        const plain: AssistantTool = { ...tool, name: 'test_plain', requiresConfirmation: false };
        expect(await executeAssistantTool('test_plain', {}, ctx, [plain])).toBe('deleted');
    });
});
