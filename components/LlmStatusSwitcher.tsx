
import React, { useState, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { AVAILABLE_LLM_MODELS } from '../constants';
import { ChevronDownIcon } from './icons';

const LlmStatusSwitcher: React.FC = () => {
    const { settings, updateSettings, availableOllamaModels, availableOllamaCloudModels, loadingModels } = useSettings();
    const [isGeminiKeySet, setIsGeminiKeySet] = useState(false);
    
    useEffect(() => {
        setIsGeminiKeySet(!!process.env.API_KEY);
    }, []);

    const handleProviderAndModelSelect = (provider: 'gemini' | 'ollama' | 'ollama_cloud', modelId?: string) => {
        if (provider === 'gemini' && modelId) {
            updateSettings({ ...settings, activeLLM: 'gemini', llmModel: modelId });
        } else if (provider === 'ollama' && modelId) {
            updateSettings({ ...settings, activeLLM: 'ollama', ollamaModel: modelId });
        } else if (provider === 'ollama_cloud' && modelId) {
            updateSettings({ ...settings, activeLLM: 'ollama_cloud', ollamaCloudModel: modelId });
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
        statusColor = availableOllamaModels.length > 0 ? 'bg-success' : 'bg-warning';
        tooltipText = `Using Local Ollama.`;
    } else if (settings.activeLLM === 'ollama_cloud') {
        displayText = `Cloud: ${settings.ollamaCloudModel}`;
        statusColor = availableOllamaCloudModels.length > 0 ? 'bg-success' : 'bg-warning';
        tooltipText = `Using Cloud Ollama endpoint.`;
    } else { // Gemini
        displayText = `Gemini ${geminiModelShortName}`;
        if (isGeminiKeySet) {
            statusColor = 'bg-success';
            tooltipText = `Using Gemini.`;
        } else {
            statusColor = 'bg-error';
            tooltipText = "Gemini API key not found.";
        }
    }

    return (
        <div className="dropdown dropdown-bottom w-full group">
            <div tabIndex={0} role="button" title={tooltipText} className="w-full flex items-center justify-between p-2 text-sm rounded-md bg-base-200/50 hover:bg-base-200 transition-colors border border-transparent group-hover:border-primary/20" aria-haspopup="listbox">
                <div className="flex items-center min-w-0">
                    <span className={`w-2 h-2 rounded-full mr-2.5 flex-shrink-0 ${statusColor} ${statusColor === 'bg-success' ? 'motion-safe:animate-pulse' : ''}`}></span>
                    <span className="font-bold text-base-content truncate uppercase text-[10px] tracking-widest">{displayText}</span>
                </div>
                <ChevronDownIcon className={`w-4 h-4 text-base-content/40 flex-shrink-0 transition-transform group-focus-within:rotate-180`} />
            </div>

            <ul tabIndex={0} className="dropdown-content menu p-1 shadow-2xl bg-base-200 rounded-none w-full min-w-[240px] mt-2 z-[100] border border-base-300 max-h-[70vh] overflow-y-auto custom-scrollbar flex flex-col flex-nowrap">
                {/* Google Gemini Section */}
                <li className="menu-title px-2 pt-2 pb-1 text-[8px] uppercase tracking-[0.3em] opacity-40"><span>Google Gemini</span></li>
                {AVAILABLE_LLM_MODELS.map(model => (
                    <li key={model.id} className="w-full">
                        <a 
                            onClick={() => handleProviderAndModelSelect('gemini', model.id)} 
                            className={`rounded-none text-[10px] font-black uppercase tracking-tight py-2.5 w-full block ${settings.llmModel === model.id && settings.activeLLM === 'gemini' ? 'bg-primary/10 text-primary active' : ''}`}
                        >
                            {model.name}
                        </a>
                    </li>
                ))}
                
                <li className="divider my-0 h-px bg-base-300/50"></li>
                
                {/* Local Ollama Section */}
                <li className="menu-title px-2 pt-2 pb-1 text-[8px] uppercase tracking-[0.3em] opacity-40 flex justify-between items-center">
                    <span>Local Ollama</span>
                    {loadingModels && <span className="loading loading-spinner loading-xs scale-75 opacity-40"></span>}
                </li>
                {availableOllamaModels.length > 0 ? (
                    availableOllamaModels.map(model => (
                        <li key={`local-${model}`} className="w-full">
                            <a 
                                onClick={() => handleProviderAndModelSelect('ollama', model)} 
                                className={`rounded-none text-[10px] font-black uppercase tracking-tight py-2.5 w-full block ${settings.ollamaModel === model && settings.activeLLM === 'ollama' ? 'bg-primary/10 text-primary active' : ''}`}
                            >
                                {model}
                            </a>
                        </li>
                    ))
                ) : (
                    <li className="disabled w-full"><span className="text-[9px] italic opacity-30 py-3 block text-center">No local models detected</span></li>
                )}

                <li className="divider my-0 h-px bg-base-300/50"></li>
                
                {/* Cloud Ollama Section */}
                <li className="menu-title px-2 pt-2 pb-1 text-[8px] uppercase tracking-[0.3em] opacity-40"><span>Remote Cloud</span></li>
                {availableOllamaCloudModels.length > 0 ? (
                    availableOllamaCloudModels.map(model => (
                        <li key={`cloud-${model}`} className="w-full">
                            <a 
                                onClick={() => handleProviderAndModelSelect('ollama_cloud', model)} 
                                className={`rounded-none text-[10px] font-black uppercase tracking-tight py-2.5 w-full block ${settings.ollamaCloudModel === model && settings.activeLLM === 'ollama_cloud' ? 'bg-primary/10 text-primary active' : ''}`}
                            >
                                {model}
                            </a>
                        </li>
                    ))
                ) : (
                    <li className="disabled w-full"><span className="text-[9px] italic opacity-30 py-3 block text-center">No cloud models detected</span></li>
                )}

                {loadingModels && (
                     <li className="px-2 py-2 flex items-center justify-center border-t border-base-300/30">
                        <span className="text-[8px] font-black uppercase tracking-widest opacity-20 animate-pulse">Syncing Registry...</span>
                    </li>
                )}
            </ul>
        </div>
    );
};

export default LlmStatusSwitcher;
