import { describe, it, expect, beforeEach } from 'vitest';
import { checkConfirmation, noteUserUtterance, noteAssistantOutput, resetConfirmationGate, CONFIRM_TTL_MS } from './confirmationGate';

describe('confirmationGate', () => {
    beforeEach(() => resetConfirmationGate());

    it('asks on the first call', () => {
        noteUserUtterance();
        expect(checkConfirmation('delete_gallery_item', { id: 'a' })).toBe('ask');
    });

    it('confirms after the assistant asked and the user answered', () => {
        noteUserUtterance();
        checkConfirmation('delete_gallery_item', { id: 'a' });
        noteAssistantOutput();
        noteUserUtterance();
        expect(checkConfirmation('delete_gallery_item', { id: 'a' })).toBe('confirmed');
    });

    it('does not let the model confirm itself by retrying', () => {
        noteUserUtterance();
        checkConfirmation('delete_gallery_item', { id: 'a' });
        expect(checkConfirmation('delete_gallery_item', { id: 'a' })).toBe('ask');
    });

    it('ignores a lagging fragment of the original request that arrives before the assistant spoke', () => {
        noteUserUtterance();
        checkConfirmation('delete_gallery_item', { id: 'a' });
        noteUserUtterance(); // tail of the original utterance
        expect(checkConfirmation('delete_gallery_item', { id: 'a' })).toBe('ask');
    });

    it('requires a user answer after the assistant spoke', () => {
        noteUserUtterance();
        checkConfirmation('delete_gallery_item', { id: 'a' });
        noteAssistantOutput();
        expect(checkConfirmation('delete_gallery_item', { id: 'a' })).toBe('ask');
    });

    it('asks again when the arguments differ, regardless of key order', () => {
        noteUserUtterance();
        checkConfirmation('toggle_mcp_server', { preset: 'brave', enabled: true });
        noteAssistantOutput();
        noteUserUtterance();
        expect(checkConfirmation('toggle_mcp_server', { preset: 'brave', enabled: false })).toBe('ask');
        noteAssistantOutput();
        noteUserUtterance();
        expect(checkConfirmation('toggle_mcp_server', { enabled: false, preset: 'brave' })).toBe('confirmed');
    });

    it('expires after the TTL', () => {
        noteUserUtterance();
        const t0 = 1_000_000;
        checkConfirmation('delete_gallery_item', { id: 'a' }, t0);
        noteAssistantOutput();
        noteUserUtterance();
        expect(checkConfirmation('delete_gallery_item', { id: 'a' }, t0 + CONFIRM_TTL_MS + 1)).toBe('ask');
    });

    it('is single-use', () => {
        noteUserUtterance();
        checkConfirmation('delete_gallery_item', { id: 'a' });
        noteAssistantOutput();
        noteUserUtterance();
        expect(checkConfirmation('delete_gallery_item', { id: 'a' })).toBe('confirmed');
        expect(checkConfirmation('delete_gallery_item', { id: 'a' })).toBe('ask');
    });
});
