import React, { useState, useEffect, useRef } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { AVAILABLE_LLM_MODELS } from '../constants';
import { ChevronDownIcon } from './icons';
import { motion, AnimatePresence } from 'framer-motion';

const LlmStatusSwitcher: React.FC = () => {
    const { settings, updateSettings, availableOllamaModels, availableOllamaCloudModels } = useSettings();
    const [isGeminiKeySet, setIsGeminiKeySet] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        setIsGeminiKeySet(!!process.env.GEMINI_API_KEY);
    }, []);

    const clearIdleTimer = () => {
        if (idleTimeoutRef.current) {
            clearTimeout(idleTimeoutRef.current);
            idleTimeoutRef.current = null;
        }
    };

    const startIdleTimer = () => {
        clearIdleTimer();
        idleTimeoutRef.current = setTimeout(() => {
            setIsOpen(false);
        }, 8000);
    };

    const resetTimeout = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            setIsOpen(false);
        }, 5000);
    };

    useEffect(() => {
        if (isOpen) {
            resetTimeout();
            startIdleTimer();
        }
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            clearIdleTimer();
        };
    }, [isOpen]);

    // Click outside to close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const handleProviderAndModelSelect = (provider: 'gemini' | 'ollama' | 'ollama_cloud', modelId?: string) => {
        if (provider === 'gemini' && modelId) {
            updateSettings({ ...settings, activeLLM: 'gemini', llmModel: modelId });
        } else if (provider === 'ollama' && modelId) {
            updateSettings({ ...settings, activeLLM: 'ollama', ollamaModel: modelId });
        } else if (provider === 'ollama_cloud' && modelId) {
            updateSettings({ ...settings, activeLLM: 'ollama_cloud', ollamaCloudModel: modelId });
        }
        clearIdleTimer();
        setIsOpen(false);
    };

    const handleToggle = () => {
        if (isOpen) {
            clearIdleTimer();
            setIsOpen(false);
        } else {
            setIsOpen(true);
        }
    };

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
        <div ref={containerRef} className="relative w-full z-[730] pointer-events-auto" onMouseMove={resetTimeout}>
            <button
                onClick={handleToggle}
                title={tooltipText}
                className="w-full flex items-center justify-between py-0 px-1 rounded-none bg-transparent hover:bg-base-200/20 transition-all relative z-10 outline-none border-none cursor-pointer pointer-events-auto"
            >
                <div className="flex items-center min-w-0 relative z-10 mt-2 px-1">
                    <div className="shine-container">
                        <span className="font-mono font-black truncate uppercase text-[11px] tracking-[0.4em] shine-text">
                            {displayText}
                        </span>
                    </div>
                </div>
                <ChevronDownIcon className={`w-2.5 h-2.5 text-base-content/20 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''} relative z-10`} />
            </button>

            <AnimatePresence mode="wait">
                {isOpen && (
                    <motion.div
                        key="llm-selector-panel"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 30 }}
                        transition={{
                            duration: 0.35,
                            ease: [0.22, 1, 0.36, 1]
                        }}
                        className="fixed bottom-4 left-4 md:bottom-10 md:left-10 w-[calc(100%-2rem)] md:w-[360px] bg-base-100/60 backdrop-blur-3xl border border-base-content/10 shadow-2xl z-[2000] max-h-[50vh] overflow-y-auto"
                    >
                        <ul className="menu p-1 flex flex-col flex-nowrap">
                            {/* Google Gemini Section */}
                            <li className="menu-title px-3 pt-3 pb-2 text-[9px] uppercase tracking-[0.3em] opacity-70 font-black text-primary border-b border-base-300/10 mb-1"><span>Google Gemini</span></li>
                            {AVAILABLE_LLM_MODELS.map(model => (
                                <li key={model.id} className="w-full">
                                    <button
                                        onClick={() => handleProviderAndModelSelect('gemini', model.id)}
                                        className={`rounded-none text-[11px] font-bold font-nunito py-3.5 w-full text-left px-4 ${settings.llmModel === model.id && settings.activeLLM === 'gemini' ? 'text-primary bg-primary/10' : 'text-base-content/80 hover:text-base-content hover:bg-base-200/50'}`}
                                    >
                                        {model.name}
                                    </button>
                                </li>
                            ))}

                            <li className="divider my-1 h-px bg-base-300/50"></li>

                            {/* Ollama Model Section - Grouped Local and Cloud */}
                            <li className="menu-title px-3 pt-3 pb-2 text-[9px] uppercase tracking-[0.3em] opacity-70 font-black text-primary border-b border-base-300/10 mb-1">
                                <span>Ollama Model</span>
                            </li>

                            {/* Local Models */}
                            {availableOllamaModels.length > 0 ? (
                                availableOllamaModels.map(model => (
                                    <li key={`local-${model}`} className="w-full">
                                        <button
                                            onClick={() => handleProviderAndModelSelect('ollama', model)}
                                            className={`rounded-none text-[11px] font-bold font-nunito py-3.5 w-full text-left px-4 ${settings.ollamaModel === model && settings.activeLLM === 'ollama' ? 'text-primary bg-primary/10' : 'text-base-content/80 hover:text-base-content hover:bg-base-200/50'}`}
                                        >
                                            {model}
                                        </button>
                                    </li>
                                ))
                            ) : null}

                            {/* Cloud Models */}
                            {availableOllamaCloudModels.length > 0 ? (
                                availableOllamaCloudModels.map(model => (
                                    <li key={`cloud-${model}`} className="w-full">
                                        <button
                                            onClick={() => handleProviderAndModelSelect('ollama_cloud', model)}
                                            className={`rounded-none text-[11px] font-bold font-nunito py-3.5 w-full text-left px-4 ${settings.ollamaCloudModel === model && settings.activeLLM === 'ollama_cloud' ? 'text-primary bg-primary/10' : 'text-base-content/80 hover:text-base-content hover:bg-base-200/50'}`}
                                        >
                                            {model}
                                        </button>
                                    </li>
                                ))
                            ) : null}

                            {availableOllamaModels.length === 0 && availableOllamaCloudModels.length === 0 && (
                                <li className="disabled w-full"><span className="text-[9px] italic opacity-50 py-5 block text-center">No Ollama models detected</span></li>
                            )}
                        </ul>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default LlmStatusSwitcher;