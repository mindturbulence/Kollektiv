
import React, { useState, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { AVAILABLE_LLM_MODELS } from '../constants';
import { ChevronDownIcon } from './icons';

const LlmStatusSwitcher: React.FC = () => {
    const { settings, updateSettings, availableOllamaModels, availableOllamaCloudModels, loadingModels } = useSettings();
    const [isGeminiKeySet, setIsGeminiKeySet] = useState(false);
    
    useEffect(() => {
        setIsGeminiKeySet(!!process.env.GEMINI_API_KEY);
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
    let tooltipText = '';

    if (settings.activeLLM === 'ollama') {
        displayText = settings.ollamaModel;
        tooltipText = `Using Local Ollama.`;
    } else if (settings.activeLLM === 'ollama_cloud') {
        displayText = settings.ollamaCloudModel;
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
        <div className="dropdown dropdown-top w-full group z-[730] pointer-events-auto">
            <button 
                tabIndex={0} 
                role="button" 
                title={tooltipText} 
                className="w-full flex items-center justify-between p-2 text-sm rounded-none bg-transparent hover:bg-base-200/20 transition-all relative z-10 outline-none border-none cursor-pointer pointer-events-auto" 
                aria-haspopup="listbox"
            >
                <div className="flex items-center min-w-0 relative z-10">
                    <span className="font-medium text-base-content/90 truncate uppercase text-[9px] tracking-[0.2em]">{displayText}</span>
                </div>
                <ChevronDownIcon className={`w-3.5 h-3.5 text-base-content/60 flex-shrink-0 transition-transform group-focus-within:rotate-180 relative z-10`} />
            </button>

            <ul tabIndex={0} className="dropdown-content menu p-1 shadow-2xl bg-base-100 backdrop-blur-3xl border border-base-300/50 rounded-none w-full min-w-[280px] mb-2 z-[2000] max-h-[70vh] overflow-y-auto custom-scrollbar flex flex-col flex-nowrap">
                {/* Google Gemini Section */}
                <li className="menu-title px-3 pt-3 pb-2 text-[9px] uppercase tracking-[0.3em] opacity-70 font-black text-primary border-b border-base-300/10 mb-1"><span>Google Gemini</span></li>
                {AVAILABLE_LLM_MODELS.map(model => (
                    <li key={model.id} className="w-full">
                        <button 
                            onClick={() => handleProviderAndModelSelect('gemini', model.id)} 
                            className={`rounded-none text-[11px] font-black uppercase tracking-tight py-3.5 w-full text-left px-4 ${settings.llmModel === model.id && settings.activeLLM === 'gemini' ? 'text-primary bg-primary/10' : 'text-base-content/80 hover:text-base-content hover:bg-base-200/50'}`}
                        >
                            {model.name}
                        </button>
                    </li>
                ))}
                
                <li className="divider my-1 h-px bg-base-300/50"></li>
                
                {/* Local Ollama Section */}
                <li className="menu-title px-3 pt-3 pb-2 text-[9px] uppercase tracking-[0.3em] opacity-70 font-black text-primary flex justify-between items-center border-b border-base-300/10 mb-1">
                    <span>Local Ollama</span>
                    {loadingModels && <span className="loading loading-spinner loading-xs scale-75 opacity-40"></span>}
                </li>
                {availableOllamaModels.length > 0 ? (
                    availableOllamaModels.map(model => (
                        <li key={`local-${model}`} className="w-full">
                            <button 
                                onClick={() => handleProviderAndModelSelect('ollama', model)} 
                                className={`rounded-none text-[11px] font-black uppercase tracking-tight py-3.5 w-full text-left px-4 ${settings.ollamaModel === model && settings.activeLLM === 'ollama' ? 'text-primary bg-primary/10' : 'text-base-content/80 hover:text-base-content hover:bg-base-200/50'}`}
                            >
                                {model}
                            </button>
                        </li>
                    ))
                ) : (
                    <li className="disabled w-full"><span className="text-[9px] italic opacity-50 py-5 block text-center">No local models detected</span></li>
                )}

                <li className="divider my-1 h-px bg-base-300/50"></li>
                
                {/* Cloud Ollama Section */}
                <li className="menu-title px-3 pt-3 pb-2 text-[9px] uppercase tracking-[0.3em] opacity-70 font-black text-primary border-b border-base-300/10 mb-1"><span>Remote Cloud</span></li>
                {availableOllamaCloudModels.length > 0 ? (
                    availableOllamaCloudModels.map(model => (
                        <li key={`cloud-${model}`} className="w-full">
                            <button 
                                onClick={() => handleProviderAndModelSelect('ollama_cloud', model)} 
                                className={`rounded-none text-[11px] font-black uppercase tracking-tight py-3.5 w-full text-left px-4 ${settings.ollamaCloudModel === model && settings.activeLLM === 'ollama_cloud' ? 'text-primary bg-primary/10' : 'text-base-content/80 hover:text-base-content hover:bg-base-200/50'}`}
                            >
                                {model}
                            </button>
                        </li>
                    ))
                ) : (
                    <li className="disabled w-full"><span className="text-[9px] italic opacity-50 py-5 block text-center">No cloud models detected</span></li>
                )}

                {loadingModels && (
                     <li className="px-3 py-3 flex items-center justify-center border-t border-base-300/30">
                        <span className="text-[9px] font-black uppercase tracking-widest opacity-50 animate-pulse">Syncing Registry...</span>
                    </li>
                )}
            </ul>
        </div>
    );
};

export default LlmStatusSwitcher;
