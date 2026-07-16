import { describe, it, expect } from 'vitest';
import { deriveMode } from './assistantMode';

const base = { status: 'live' as const, speaking: false, lastActivityAt: 0, lastUserCaptionAt: 0, now: 100_000 };

describe('deriveMode', () => {
    it('shows connecting while the session is connecting', () => {
        expect(deriveMode({ ...base, status: 'connecting' })).toBe('connecting');
    });

    it('speaking wins over recent tool activity', () => {
        expect(deriveMode({ ...base, speaking: true, lastActivityAt: base.now - 100 })).toBe('responding');
    });

    it('recent tool activity shows processing', () => {
        expect(deriveMode({ ...base, lastActivityAt: base.now - 2_000 })).toBe('processing');
    });

    it('stale tool activity does not show processing', () => {
        expect(deriveMode({ ...base, lastActivityAt: base.now - 5_000 })).toBe('command');
    });

    it('recent user caption shows listening', () => {
        expect(deriveMode({ ...base, lastUserCaptionAt: base.now - 500 })).toBe('listening');
    });

    it('quiet live session shows the command prompt', () => {
        expect(deriveMode(base)).toBe('command');
    });
});
