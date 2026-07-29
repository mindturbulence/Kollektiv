import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import AssistantSection from './AssistantSection';
import type { LLMSettings } from '../../types';

// Mock AutocompleteSelect since it relies on external dependencies (ASSISTANT_VOICES, etc.)
vi.mock('../AutocompleteSelect', () => ({
    default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
        <input
            data-testid="mock-autocomplete"
            value={value}
            onChange={(e) => onChange(e.target.value)}
        />
    ),
}));

// Mock AssistantToolsSection since we only test the Persona tab
vi.mock('./AssistantToolsSection', () => ({
    default: () => <div data-testid="mock-tools-section" />,
}));

beforeEach(() => cleanup());

const baseSettings = {
    activeLLM: 'gemini',
    voiceSilenceTimeoutMs: 800,
} as LLMSettings;

// activeSubTab is destructured in the props interface but unused in the component body
const activeSubTab = 'persona';

/** Helper: find one checkbox inside a specific SettingRow by its label text. */
function checkboxInRow(labelText: string): HTMLInputElement {
    const heading = screen.getByText(labelText);
    // SettingRow renders its label as an <h4> inside a <div class="p-6 ...">
    const row = heading.closest('.p-6') as HTMLElement;
    return within(row).getByRole('checkbox') as HTMLInputElement;
}

/** Helper: find the status text (ENABLED/DISABLED) inside a specific SettingRow. */
function statusTextInRow(labelText: string): string | null {
    const heading = screen.getByText(labelText);
    const row = heading.closest('.p-6') as HTMLElement;
    const status = within(row).queryByText(/ENABLED|DISABLED/);
    return status?.textContent ?? null;
}

// ─── Gallery Auto-Tagging ───────────────────────────────────────────

describe('AssistantSection — Gallery Auto-Tagging', () => {
    it('renders the toggle as DISABLED when autoTagEnabled is false', () => {
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={{ activeLLM: 'gemini', autoTagEnabled: false } as LLMSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        const checkbox = checkboxInRow('Gallery Auto-Tagging');
        expect(checkbox.checked).toBe(false);
        expect(statusTextInRow('Gallery Auto-Tagging')).toBe('DISABLED');
    });

    it('renders the toggle as ENABLED when autoTagEnabled is true', () => {
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={{ activeLLM: 'gemini', autoTagEnabled: true } as LLMSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        const checkbox = checkboxInRow('Gallery Auto-Tagging');
        expect(checkbox.checked).toBe(true);
        expect(statusTextInRow('Gallery Auto-Tagging')).toBe('ENABLED');
    });

    it('calls handleSettingsChange when toggled', () => {
        const handleSettingsChange = vi.fn();
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={{ activeLLM: 'gemini', autoTagEnabled: false } as LLMSettings}
                handleSettingsChange={handleSettingsChange}
            />
        );
        fireEvent.click(checkboxInRow('Gallery Auto-Tagging'));
        expect(handleSettingsChange).toHaveBeenCalledWith('autoTagEnabled', true);
    });

    it('shows the SettingRow label', () => {
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={{ activeLLM: 'gemini' } as LLMSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        expect(screen.getByText('Gallery Auto-Tagging')).toBeTruthy();
    });
});

// ─── Provider Fallback ───────────────────────────────────────────────

describe('AssistantSection — Provider Fallback', () => {
    it('renders the main toggle as DISABLED when providerFallbackEnabled is false', () => {
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={{ activeLLM: 'gemini', providerFallbackEnabled: false } as LLMSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        expect(statusTextInRow('Provider Fallback')).toBe('DISABLED');
    });

    it('renders the main toggle as ENABLED when providerFallbackEnabled is true', () => {
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={{ activeLLM: 'gemini', providerFallbackEnabled: true } as LLMSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        expect(statusTextInRow('Provider Fallback')).toBe('ENABLED');
    });

    it('shows the PRIVACY NOTICE when fallback is enabled', () => {
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={{ activeLLM: 'gemini', providerFallbackEnabled: true } as LLMSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        expect(screen.getByText('PRIVACY NOTICE')).toBeTruthy();
    });

    it('hides the PRIVACY NOTICE when fallback is disabled', () => {
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={{ activeLLM: 'gemini', providerFallbackEnabled: false } as LLMSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        expect(screen.queryByText('PRIVACY NOTICE')).toBeNull();
    });

    it('renders all five provider buttons when enabled', () => {
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={{ activeLLM: 'gemini', providerFallbackEnabled: true } as LLMSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        for (const provider of ['ollama', 'gemini', 'anthropic', 'llamacpp', 'openrouter']) {
            const btn = screen.getByRole('button', { name: provider }) as HTMLButtonElement;
            expect(btn).toBeTruthy();
            expect(btn.disabled).toBe(false);
        }
    });

    it('disables provider buttons when fallback is disabled', () => {
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={{ activeLLM: 'gemini', providerFallbackEnabled: false } as LLMSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        for (const provider of ['ollama', 'gemini', 'anthropic', 'llamacpp', 'openrouter']) {
            const btn = screen.getByRole('button', { name: provider }) as HTMLButtonElement;
            expect(btn.disabled).toBe(true);
        }
    });

    it('toggles a provider into the chain when clicked', () => {
        const handleSettingsChange = vi.fn();
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={{
                    activeLLM: 'gemini',
                    providerFallbackEnabled: true,
                    providerFallbackChain: [] as string[],
                } as LLMSettings}
                handleSettingsChange={handleSettingsChange}
            />
        );
        fireEvent.click(screen.getByRole('button', { name: 'gemini' }));
        expect(handleSettingsChange).toHaveBeenCalledWith('providerFallbackChain', ['gemini']);
    });

    it('removes a provider from the chain when clicked again', () => {
        const handleSettingsChange = vi.fn();
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={{
                    activeLLM: 'gemini',
                    providerFallbackEnabled: true,
                    providerFallbackChain: ['gemini', 'ollama'] as string[],
                } as LLMSettings}
                handleSettingsChange={handleSettingsChange}
            />
        );
        fireEvent.click(screen.getByRole('button', { name: 'gemini' }));
        expect(handleSettingsChange).toHaveBeenCalledWith('providerFallbackChain', ['ollama']);
    });

    it('shows the chain order text when providers are selected', () => {
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={{
                    activeLLM: 'gemini',
                    providerFallbackEnabled: true,
                    providerFallbackChain: ['ollama', 'gemini'] as string[],
                } as LLMSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        expect(screen.getByText(/Chain order/)).toBeTruthy();
        expect(screen.getByText(/ollama.*gemini/)).toBeTruthy();
    });

    it('shows empty chain message when no providers are selected', () => {
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={{
                    activeLLM: 'gemini',
                    providerFallbackEnabled: true,
                    providerFallbackChain: [] as string[],
                } as LLMSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        expect(screen.getByText(/no fallback will occur/)).toBeTruthy();
    });
});

// ─── Voice Engine Selector ───────────────────────────────────────────

describe('AssistantSection — Voice Engine selector', () => {
    it('renders all three voice engine options', () => {
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={{ activeLLM: 'gemini' } as LLMSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        expect(screen.getByText('Gemini Live')).toBeTruthy();
        expect(screen.getByText('OpenAI Realtime')).toBeTruthy();
        expect(screen.getByText('ElevenLabs')).toBeTruthy();
    });

    it('highlights Gemini Live by default when voiceProvider is unset', () => {
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={{ activeLLM: 'gemini' } as LLMSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        // ProviderTab with isActive=true gets the 'tab-item-active' class
        const geminiTab = screen.getByText('Gemini Live');
        // The active tab has a specific parent div with class containing 'tab-item-active'
        expect(geminiTab.closest('.tab-item-active') || geminiTab.closest('[class*="tab-item-active"]')).toBeTruthy();
    });

    it('highlights the configured voice provider', () => {
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={{ activeLLM: 'gemini', voiceProvider: 'openai_realtime' } as LLMSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        expect(screen.getByText('OpenAI Realtime').closest('.tab-item-active')).toBeTruthy();
        expect(screen.getByText('Gemini Live').closest('.tab-item-active')).toBeFalsy();
        expect(screen.getByText('ElevenLabs').closest('.tab-item-active')).toBeFalsy();
    });

    it('calls handleSettingsChange when a voice engine is clicked', () => {
        const handleSettingsChange = vi.fn();
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={{ activeLLM: 'gemini' } as LLMSettings}
                handleSettingsChange={handleSettingsChange}
            />
        );
        fireEvent.click(screen.getByText('OpenAI Realtime'));
        expect(handleSettingsChange).toHaveBeenCalledWith('voiceProvider', 'openai_realtime');
    });

    it('calls handleSettingsChange when ElevenLabs is clicked', () => {
        const handleSettingsChange = vi.fn();
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={{ activeLLM: 'gemini' } as LLMSettings}
                handleSettingsChange={handleSettingsChange}
            />
        );
        fireEvent.click(screen.getByText('ElevenLabs'));
        expect(handleSettingsChange).toHaveBeenCalledWith('voiceProvider', 'elevenlabs');
    });
});

// ─── Voice Silence Timeout ───────────────────────────────────────────

describe('AssistantSection — voice silence timeout control', () => {
    it('renders the current value on the slider', () => {
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={baseSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        const slider = screen.getByLabelText(/silence.*timeout/i) as HTMLInputElement;
        expect(slider).toBeTruthy();
        expect(slider.value).toBe('800');
    });

    it('renders the current value as formatted text next to the slider', () => {
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={baseSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        expect(screen.getByText('800ms')).toBeTruthy();
    });

    it('calls handleSettingsChange with the new value on slider change', () => {
        const handleSettingsChange = vi.fn();
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={baseSettings}
                handleSettingsChange={handleSettingsChange}
            />
        );
        const slider = screen.getByLabelText(/silence.*timeout/i);
        fireEvent.change(slider, { target: { value: '500' } });
        expect(handleSettingsChange).toHaveBeenCalledWith('voiceSilenceTimeoutMs', 500);
    });

    it('falls back to 800 when the setting is unset', () => {
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={{ activeLLM: 'gemini' } as LLMSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        const slider = screen.getByLabelText(/silence.*timeout/i) as HTMLInputElement;
        expect(slider.value).toBe('800');
        expect(screen.getByText('800ms')).toBeTruthy();
    });

    it('displays a non-default value when one is configured', () => {
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={{ ...baseSettings, voiceSilenceTimeoutMs: 500 } as LLMSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        const slider = screen.getByLabelText(/silence.*timeout/i) as HTMLInputElement;
        expect(slider.value).toBe('500');
        expect(screen.getByText('500ms')).toBeTruthy();
    });

    it('has the correct range attributes (min=300, max=2000, step=100)', () => {
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={baseSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        const slider = screen.getByLabelText(/silence.*timeout/i) as HTMLInputElement;
        expect(slider.min).toBe('300');
        expect(slider.max).toBe('2000');
        expect(slider.step).toBe('100');
    });
});

// ─── Tab Switching: Persona ↔ Tools ──────────────────────────────────

describe('AssistantSection — tab switching (Persona / Tools)', () => {
    it('renders both tab buttons', () => {
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={baseSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        expect(screen.getByText('Persona')).toBeTruthy();
        expect(screen.getByText('Tools')).toBeTruthy();
    });

    it('shows Persona content by default', () => {
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={baseSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        // Persona content includes the Assistant Persona heading
        expect(screen.getByText('Assistant Persona')).toBeTruthy();
        // Tools content should NOT be present
        expect(screen.queryByTestId('mock-tools-section')).toBeNull();
    });

    it('switches to Tools tab and shows AssistantToolsSection', () => {
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={baseSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        fireEvent.click(screen.getByText('Tools'));
        // The mocked AssistantToolsSection should render
        expect(screen.getByTestId('mock-tools-section')).toBeTruthy();
        // Persona content should be hidden
        expect(screen.queryByText('Assistant Persona')).toBeNull();
    });

    it('switches back to Persona tab after switching to Tools', () => {
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={baseSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        fireEvent.click(screen.getByText('Tools'));
        expect(screen.getByTestId('mock-tools-section')).toBeTruthy();

        fireEvent.click(screen.getByText('Persona'));
        expect(screen.getByText('Assistant Persona')).toBeTruthy();
        expect(screen.queryByTestId('mock-tools-section')).toBeNull();
    });

    it('highlights the active tab button with primary styling', () => {
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={baseSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        // Persona is active by default
        const personaBtn = screen.getByText('Persona');
        const toolsBtn = screen.getByText('Tools');
        expect(personaBtn.className).toContain('bg-primary/20');
        expect(personaBtn.className).toContain('text-primary');
        expect(toolsBtn.className).toContain('opacity-50');

        // Switch to Tools
        fireEvent.click(toolsBtn);
        expect(toolsBtn.className).toContain('bg-primary/20');
        expect(toolsBtn.className).toContain('text-primary');
        expect(personaBtn.className).toContain('opacity-50');
    });

    it('preserves tab state across re-render (internal useState)', () => {
        // React's rerender() does NOT unmount/remount the component — it
        // re-renders the same instance.  useState state is preserved, so
        // the tab stays on 'tools' after rerendering with the same props.
        const { rerender } = render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={baseSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        fireEvent.click(screen.getByText('Tools'));
        expect(screen.getByTestId('mock-tools-section')).toBeTruthy();

        rerender(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={baseSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        // State preserved — still showing Tools
        expect(screen.getByTestId('mock-tools-section')).toBeTruthy();
        expect(screen.queryByText('Assistant Persona')).toBeNull();
    });

    it('Persona tab still renders known controls alongside switch buttons', () => {
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={{ activeLLM: 'gemini', autoTagEnabled: true } as LLMSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        expect(screen.getByText('Gallery Auto-Tagging')).toBeTruthy();
        expect(screen.getByText('ENABLED')).toBeTruthy();
    });

    it('Tools tab renders mocked AssistantToolsSection', () => {
        render(
            <AssistantSection
                activeSubTab={activeSubTab}
                settings={baseSettings}
                handleSettingsChange={vi.fn()}
            />
        );
        fireEvent.click(screen.getByText('Tools'));
        expect(screen.getByTestId('mock-tools-section')).toBeTruthy();
    });
});
