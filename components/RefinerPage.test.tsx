import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
    dissectPrompt: vi.fn(),
    generateConstructorPreset: vi.fn(),
    loadPresets: vi.fn().mockResolvedValue([]),
    savePreset: vi.fn().mockResolvedValue(undefined),
    loadArtStyles: vi.fn().mockResolvedValue([]),
    loadCustomOptions: vi.fn().mockResolvedValue({}),
}));

vi.mock('./RefinerModifierControls', () => ({
    RefinerModifierControls: (props: any) => (
        <div>
            <button onClick={() => props.setModifiers((current: any) => ({ ...current, artStyle: 'Paper Cutout' }))}>select discipline</button>
            <button onClick={() => props.setConstantModifier('preserve the character silhouette')}>set constant modifier</button>
        </div>
    ),
}));

vi.mock('./RefinerSlots', () => ({ PropertyCard: () => null }));
vi.mock('./BlobLoader', () => ({ default: () => null }));
vi.mock('./AutocompleteSelect', () => ({ default: () => null }));
vi.mock('./ConfirmationModal', () => ({ default: () => null }));
vi.mock('./CodeSnippetModal', () => ({ default: () => null }));
vi.mock('./JSONBreakdownModal', () => ({ default: () => null }));
vi.mock('./AnimatedPanels', () => ({
    PanelLine: () => null, ScanLine: () => null, TerminalText: () => null,
    pageVariants: {}, pageHeaderVariants: {}, pageBodyVariants: {}, pageFooterVariants: {},
    reverseTextVariants: {}, sectionWipeVariants: {},
}));
vi.mock('../services/audioService', () => ({ audioService: { playClick: vi.fn(), playHover: vi.fn() } }));
vi.mock('../services/refinerPresetService', () => ({
    refinerPresetService: { loadPresets: mocks.loadPresets, savePreset: mocks.savePreset, deletePreset: vi.fn() },
}));
vi.mock('../services/modifierOptionsService', () => ({
    modifierOptionsService: { loadCustomOptions: mocks.loadCustomOptions, addCustomOption: vi.fn() },
}));
vi.mock('../utils/artstyleStorage', () => ({ loadArtStyles: mocks.loadArtStyles }));
vi.mock('../utils/settingsStorage', () => ({ saveLLMSettings: vi.fn() }));
vi.mock('../services/externalCopyRecorder', () => ({ recordExternalCopy: vi.fn().mockResolvedValue('gen_1') }));
vi.mock('../services/llmService', () => ({
    enhancePromptStream: vi.fn(), cleanLLMResponse: (value: string) => value,
    buildMidjourneyParams: () => '', dissectPrompt: mocks.dissectPrompt,
    generateConstructorPreset: mocks.generateConstructorPreset,
    generateWithImagen: vi.fn(), generateWithNanoBanana: vi.fn(), generateWithVeo: vi.fn(),
}));

import RefinerPage from './RefinerPage';

describe('RefinerPage preset saving', () => {
    beforeEach(() => vi.clearAllMocks());

    it('saves the active construction state without invoking an LLM', async () => {
        render(
            <RefinerPage
                settings={{ modifierWeights: {}, activeLLM: 'ollama' } as any}
                setIsBusy={vi.fn()}
                showGlobalFeedback={vi.fn()}
                onSaveSuggestion={vi.fn()}
                onClipSuggestion={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /select discipline/i }));
        fireEvent.click(screen.getByRole('button', { name: /set constant modifier/i }));
        fireEvent.click(screen.getByRole('button', { name: /save as preset/i }));

        expect(mocks.dissectPrompt).not.toHaveBeenCalled();
        expect(mocks.generateConstructorPreset).not.toHaveBeenCalled();

        fireEvent.change(screen.getByPlaceholderText(/cinematic portrait/i), { target: { value: 'Paper character' } });
        fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

        await waitFor(() => expect(mocks.savePreset).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Paper character',
            modifiers: expect.objectContaining({ artStyle: 'Paper Cutout' }),
            constantModifier: 'preserve the character silhouette',
        })));
        expect(mocks.savePreset.mock.calls[0][0]).not.toHaveProperty('refineText');
    });
});
