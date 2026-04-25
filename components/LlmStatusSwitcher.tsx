import React, { useState, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { AVAILABLE_LLM_MODELS } from '../constants';

interface LlmStatusSwitcherProps {
    onClick: (e: React.MouseEvent) => void;
    isOpen: boolean;
}

const LlmStatusSwitcher: React.FC<LlmStatusSwitcherProps> = ({ onClick, isOpen }) => {
    const { settings } = useSettings();
    const [isGeminiKeySet, setIsGeminiKeySet] = useState(false);

    useEffect(() => {
        setIsGeminiKeySet(!!process.env.GEMINI_API_KEY);
    }, []);

    const selectedGeminiModel = AVAILABLE_LLM_MODELS.find(m => m.id === settings.llmModel);
    const geminiModelShortName = selectedGeminiModel ? selectedGeminiModel.name.split('(')[0].trim() : 'Unknown';

    let displayText = '';
    let tooltipText = '';

    if (settings.activeLLM === 'ollama') {
        displayText = settings.ollamaModel || 'Ollama';
        tooltipText = `Using Local Ollama.`;
    } else if (settings.activeLLM === 'ollama_cloud') {
        displayText = settings.ollamaCloudModel || 'Ollama Cloud';
        tooltipText = `Using Cloud Ollama endpoint.`;
    } else { // Gemini
        displayText = geminiModelShortName;
        if (isGeminiKeySet) {
            tooltipText = `Using Gemini.`;
        } else {
            tooltipText = "Gemini API key not found.";
        }
    }

    return (
        <div className="relative w-full z-[730] pointer-events-auto">
            <button
                type="button"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClick(e);
                }}
                title={tooltipText}
                className="flex items-center gap-2 group transition-all bg-transparent border-none p-0 cursor-pointer text-left"
            >
                <span className={`text-[10px] font-jardhani uppercase tracking-[0.2em] transition-colors leading-none inline-block ${isOpen ? 'text-primary' : 'text-base-content/40 group-hover:text-primary underline decoration-primary/20 underline-offset-4'}`}>
                    {displayText}
                </span>
            </button>
        </div>
    );
};

export default LlmStatusSwitcher;
