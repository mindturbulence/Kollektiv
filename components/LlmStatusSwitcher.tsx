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
    } else if (settings.activeLLM === 'openclaw') {
        displayText = settings.openclawModel || 'OpenClaw API';
        tooltipText = `Using OpenClaw Agent Core.`;
    } else { // Gemini
        displayText = geminiModelShortName;
        if (isGeminiKeySet) {
            tooltipText = `Using Gemini.`;
        } else {
            tooltipText = "Gemini API key not found.";
        }
    }

    return (
        <div className="relative w-full z-[730] pointer-events-auto flex items-center">
            <a
                href="#"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClick(e);
                }}
                title={tooltipText}
                className="inline-flex items-center group transition-all bg-transparent border-none p-0 cursor-pointer text-left"
            >
                <span className={`text-[10px] font-rajdhani uppercase tracking-[0.1em] transition-colors leading-none inline-block shine-text ${isOpen ? '' : 'group-hover:opacity-80'}`}>
                    {displayText}
                </span>
            </a>
        </div>
    );
};

export default LlmStatusSwitcher;
