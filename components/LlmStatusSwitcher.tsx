
import React, { useState, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { AVAILABLE_LLM_MODELS } from '../constants';
import { ChevronDownIcon } from './icons';

const LlmStatusSwitcher: React.FC = () => {
    const { settings, updateSettings } = useSettings();
    const [isGeminiKeySet, setIsGeminiKeySet] = useState(false);
    
    useEffect(() => {
        const envKey = (typeof process !== 'undefined' && process.env) ? process.env.API_KEY : undefined;
        setIsGeminiKeySet(!!settings.apiKeyOverride || !!envKey);
    }, [settings.apiKeyOverride]);

    const handleProviderAndModelSelect = (provider: 'gemini' | 'ollama', modelId?: string) => {
        if (provider === 'gemini' && modelId) {
            updateSettings({ ...settings, activeLLM: 'gemini', llmModel: modelId });
        } else if (provider === 'ollama') {
            updateSettings({ ...settings, activeLLM: 'ollama' });
        }
        // Lose focus to close dropdown
        if (typeof (window as any).document !== 'undefined' && (window as any).document.activeElement) {
            ((window as any).document.activeElement as any).blur();
        }
    };

    const selectedGeminiModel = AVAILABLE_LLM_MODELS.find(m => m.id === settings.llmModel);
    const geminiModelShortName = selectedGeminiModel ? selectedGeminiModel.name.split('(')[0].trim() : 'Unknown';

    let displayText = '';
    let statusColor = 'bg-error';
    let tooltipText = '';

    if (settings.activeLLM === 'ollama') {
        displayText = `Ollama: ${settings.ollamaModel}`;
        statusColor = 'bg-success';
        tooltipText = `Using Ollama. Click to switch AI provider.`;
    } else { // Gemini
        displayText = `Gemini ${geminiModelShortName}`;
        if (isGeminiKeySet) {
            statusColor = 'bg-success';
            tooltipText = `Using Gemini. Click to switch AI provider or model.`;
        } else {
            statusColor = 'bg-error';
            tooltipText = "Gemini API key not set. Features will fail. Click to switch provider.";
        }
    }

    return (
        <div className="dropdown dropdown-bottom w-full">
            <div tabIndex={0} role="button" title={tooltipText} className="w-full flex items-center justify-between p-2 text-sm rounded-md bg-base-200/50 hover:bg-base-200 transition-colors" aria-haspopup="listbox">
                <div className="flex items-center min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full mr-2 flex-shrink-0 ${statusColor} ${statusColor === 'bg-success' && settings.activeLLM === 'gemini' ? 'motion-safe:animate-pulse' : ''}`}></span>
                    <span className="font-semibold text-base-content truncate">{displayText}</span>
                </div>
                <ChevronDownIcon className={`w-4 h-4 text-base-content/70 flex-shrink-0`} />
            </div>

            <ul tabIndex={0} className="dropdown-content menu p-1 shadow bg-base-200 rounded-box w-full mt-2 z-[1]">
                <li className="menu-title px-2 pt-1 pb-2 text-xs"><span>Gemini</span></li>
                {AVAILABLE_LLM_MODELS.map(model => (
                    <li key={model.id}>
                        <a onClick={() => handleProviderAndModelSelect('gemini', model.id)} className={settings.llmModel === model.id && settings.activeLLM === 'gemini' ? 'active' : ''}>
                            {model.name}
                        </a>
                    </li>
                ))}
                <li className="divider my-1 h-px bg-base-300/50"></li>
                <li className="menu-title px-2 pt-1 pb-2 text-xs"><span>Ollama</span></li>
                <li>
                    <a onClick={() => handleProviderAndModelSelect('ollama')} className={settings.activeLLM === 'ollama' ? 'active' : ''}>
                        Use Ollama ({settings.ollamaModel})
                    </a>
                </li>
                <li className="text-xs text-center p-2 text-base-content/60">
                    Configure in Settings
                </li>
            </ul>
        </div>
    );
};

export default LlmStatusSwitcher;
