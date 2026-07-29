import { describe, it, expect } from 'vitest';
import { resolveVoiceSilenceTimeoutMs } from './liveAssistantService';
import type { LLMSettings } from '../types';

describe('resolveVoiceSilenceTimeoutMs', () => {
    it('defaults to 800ms when the setting is unset', () => {
        expect(resolveVoiceSilenceTimeoutMs({} as LLMSettings)).toBe(800);
    });

    it('uses the configured value when set', () => {
        expect(resolveVoiceSilenceTimeoutMs({ voiceSilenceTimeoutMs: 500 } as LLMSettings)).toBe(500);
    });

    it('falls back to 800ms for an invalid (non-positive) configured value', () => {
        expect(resolveVoiceSilenceTimeoutMs({ voiceSilenceTimeoutMs: 0 } as LLMSettings)).toBe(800);
        expect(resolveVoiceSilenceTimeoutMs({ voiceSilenceTimeoutMs: -100 } as LLMSettings)).toBe(800);
    });
});
