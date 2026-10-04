import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { appEventBus } from '../utils/eventBus';
import { useAssistantSignals } from '../utils/useAssistantSignals';
import { getPreviousTab } from '../utils/tabHistory';
import AssistantPage from './AssistantPage';

vi.mock('../utils/useAssistantSignals', () => ({ useAssistantSignals: vi.fn() }));
vi.mock('../utils/tabHistory', () => ({ getPreviousTab: vi.fn() }));
vi.mock('./VoiceOrbCanvas', () => ({ default: () => null }));
vi.mock('../contexts/SettingsContext', () => ({
    useSettings: () => ({ settings: { assistantLanguage: 'en' } }),
}));
vi.mock('../utils/assistantPip', () => ({ isPipSupported: () => false, openAssistantPip: vi.fn() }));
vi.mock('../services/audioService', () => ({ audioService: { playClick: vi.fn(), playType: vi.fn() } }));

const mockSignals = useAssistantSignals as unknown as ReturnType<typeof vi.fn>;
const mockGetPreviousTab = getPreviousTab as unknown as ReturnType<typeof vi.fn>;

function signals(status: 'idle' | 'connecting' | 'live' | 'error') {
    return { mode: 'idle', status, error: 'boom', userText: '', assistantText: '', activity: [] };
}

beforeEach(() => {
    vi.useFakeTimers();
    mockGetPreviousTab.mockReset();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('AssistantPage — return-to-previous-tab redirect', () => {
    it('navigates to the previous tab 800ms after going idle', () => {
        mockGetPreviousTab.mockReturnValue('gallery');
        mockSignals.mockReturnValue(signals('idle'));
        const emitSpy = vi.spyOn(appEventBus, 'emit');

        render(<AssistantPage />);
        act(() => { vi.advanceTimersByTime(800); });

        const navCalls = emitSpy.mock.calls.filter(c => c[0] === 'navigate');
        expect(navCalls).toEqual([['navigate', 'gallery']]);
        expect(mockGetPreviousTab).toHaveBeenCalledWith('assistant');
    });

    it('navigates to the previous tab 4000ms after an error', () => {
        mockGetPreviousTab.mockReturnValue('crafter');
        mockSignals.mockReturnValue(signals('error'));
        const emitSpy = vi.spyOn(appEventBus, 'emit');

        render(<AssistantPage />);
        act(() => { vi.advanceTimersByTime(4000); });

        const navCalls = emitSpy.mock.calls.filter(c => c[0] === 'navigate');
        expect(navCalls).toEqual([['navigate', 'crafter']]);
    });

    it('stays on the assistant page when there is no previous tab', () => {
        mockGetPreviousTab.mockReturnValue(null);
        mockSignals.mockReturnValue(signals('idle'));
        const emitSpy = vi.spyOn(appEventBus, 'emit');

        render(<AssistantPage />);
        act(() => { vi.advanceTimersByTime(800); });

        const navCalls = emitSpy.mock.calls.filter(c => c[0] === 'navigate');
        expect(navCalls).toEqual([]);
    });
});
