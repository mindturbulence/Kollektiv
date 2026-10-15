import { describe, it, expect, vi } from 'vitest';
import { executeAssistantTool, undoAssistantAction, type AssistantTool } from './assistantTools';
import { appEventBus } from '../utils/eventBus';
import { defaultLLMSettings } from '../utils/settingsStorage';

describe('assistant tool undo', () => {
    const ctx = { settings: defaultLLMSettings };
    const make = (execute: AssistantTool['execute'], revert = vi.fn(async () => 'reverted')): AssistantTool => ({
        name: 'test_undoable',
        description: 'test',
        parameters: { type: 'object', properties: {} },
        execute,
        prepareUndo: async () => revert,
    });

    const lastUndoId = () => {
        let id: string | undefined;
        const off = appEventBus.on('assistantToolResult', (r: { undoId?: string }) => { id = r.undoId; });
        return { get: () => id, off };
    };

    it('offers an undo that runs once and receives the tool result', async () => {
        const revert = vi.fn(async (_result: string) => 'reverted');
        const spy = lastUndoId();
        await executeAssistantTool('test_undoable', {}, ctx, [make(async () => 'made it', revert)]);
        const id = spy.get();
        spy.off();
        expect(id).toBeTruthy();

        expect(await undoAssistantAction(id!)).toBe('reverted');
        expect(revert).toHaveBeenCalledWith('made it');
        expect(await undoAssistantAction(id!)).toBe('Nothing to undo.');
    });

    it('offers no undo when the tool failed', async () => {
        const spy = lastUndoId();
        await executeAssistantTool('test_undoable', {}, ctx, [make(async () => 'Error: nope')]);
        const id = spy.get();
        spy.off();
        expect(id).toBeUndefined();
    });
});
