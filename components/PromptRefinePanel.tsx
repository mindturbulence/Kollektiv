import React, { useState, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useBusy } from '../contexts/BusyContext';
import { refineSinglePromptStream } from '../services/llmService';
import { SparklesIcon, CheckIcon, ChevronDownIcon, BookmarkIcon, RefreshIcon, CloseIcon } from './icons';
import { TARGET_IMAGE_AI_MODELS, TARGET_VIDEO_AI_MODELS } from '../constants';
import LoadingSpinner from './LoadingSpinner';
import CopyIcon from './CopyIcon';

interface PromptRefinePanelProps {
  promptText: string;
  onApplyRefinement: (newPrompt: string) => void;
  isCollapsed: boolean;
  setIsCollapsed: (isCollapsed: boolean) => void;
  onClip?: (refinedText: string) => void;
}

const PromptRefinePanel: React.FC<PromptRefinePanelProps> = ({ promptText, onApplyRefinement, isCollapsed, setIsCollapsed, onClip }) => {
    const { settings } = useSettings();
    const { setIsBusy } = useBusy();
    const [refinedPrompt, setRefinedPrompt] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [clipped, setClipped] = useState(false);

    const [targetAIModel, setTargetAIModel] = useState<string>(TARGET_IMAGE_AI_MODELS[0]);

    const handleRefine = useCallback(async () => {
        setIsLoading(true);
        setIsBusy(true);
        setError(null);
        setRefinedPrompt(''); 
        setClipped(false);
        try {
            const stream = refineSinglePromptStream(promptText, targetAIModel, settings);
            for await (const chunk of stream) {
                setRefinedPrompt(prev => (prev || '') + chunk);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "An error occurred.");
            setRefinedPrompt(null);
        } finally {
            setIsLoading(false);
            setIsBusy(false);
        }
    }, [promptText, targetAIModel, settings, setIsBusy]);

    const handleCopy = () => {
        if (!refinedPrompt) return;
        if (typeof window !== 'undefined' && (window as any).navigator?.clipboard) {
          (window as any).navigator.clipboard.writeText(refinedPrompt)
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000); 
            });
        }
    };
    
    const handleApply = () => {
        if(refinedPrompt) {
            onApplyRefinement(refinedPrompt);
            setRefinedPrompt(null); 
        }
    };
    
    const handleClip = () => {
        if (clipped || !onClip || !refinedPrompt) return;
        onClip(refinedPrompt);
        setClipped(true);
        setTimeout(() => setClipped(false), 2000);
    };

    if (isCollapsed) {
        return (
            <div className="bg-transparent">
                <button onClick={() => setIsCollapsed(false)} className="w-full p-4 flex items-center justify-between hover:bg-primary/5 transition-colors">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Open Refiner</span>
                    <ChevronDownIcon className="w-4 h-4" />
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-base-100/40 backdrop-blur-xl overflow-hidden">
            <header className="p-4 flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <span className="text-xs font-black uppercase tracking-[0.3em] text-primary">AI Refinement</span>
                    <div className="form-control max-w-[140px]">
                         <select value={targetAIModel} onChange={(e) => setTargetAIModel((e.currentTarget as any).value)} className="select select-ghost select-xs rounded-none font-bold w-full uppercase tracking-tighter text-[10px] h-6 min-h-0 border-none focus:outline-none">
                            <optgroup label="Image">
                                {TARGET_IMAGE_AI_MODELS.map(model => <option key={model} value={model}>{model}</option>)}
                            </optgroup>
                            <optgroup label="Video">
                                {TARGET_VIDEO_AI_MODELS.map(model => <option key={model} value={model}>{model}</option>)}
                            </optgroup>
                        </select>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={handleRefine} disabled={isLoading || !promptText} className="btn btn-xs btn-ghost btn-square" aria-label="Run AI refiner">
                        <RefreshIcon className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={() => setIsCollapsed(true)} className="btn btn-xs btn-ghost btn-square" aria-label="Collapse panel">
                        <CloseIcon className="w-4 h-4" />
                    </button>
                </div>
            </header>
            
            <main className="flex-grow p-5 lg:p-5 overflow-y-auto custom-scrollbar flex flex-col relative">
                <span className="text-[10px] font-black uppercase tracking-widest text-primary/40 mb-3 flex items-center gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span> Generated Text
                </span>
                
                {isLoading && !refinedPrompt ? <div className="flex-grow flex items-center justify-center"><LoadingSpinner size={48} /></div> :
                 error ? <div className="alert alert-error rounded-none text-xs"><span>{error}</span></div> :
                 refinedPrompt !== null ? (
                    <div className="text-sm font-medium leading-relaxed text-base-content/80 whitespace-pre-wrap flex-grow">
                        {refinedPrompt}
                    </div>
                 ) : (
                    <div className="flex-grow flex flex-col items-center justify-center text-center py-12">
                        <SparklesIcon className="w-8 h-8 text-base-content/10 mb-4" />
                        <span className="text-xs font-black uppercase tracking-[0.2em] text-base-content/20">
                            Ready to refine prompt
                        </span>
                    </div>
                 )}
            </main>
            
            <footer className="p-4 flex justify-end gap-2">
                {onClip && refinedPrompt && (
                        <button onClick={handleClip} disabled={clipped} className="btn btn-xs btn-ghost rounded-none font-black text-[10px] tracking-widest px-4">
                        <BookmarkIcon className="w-3.5 h-3.5 mr-1.5" />
                        {clipped ? 'Ok' : 'Clip'}
                    </button>
                )}
                <button onClick={handleCopy} disabled={!refinedPrompt || isLoading} className="btn btn-xs btn-ghost rounded-none font-black text-[10px] tracking-widest px-4">
                    {copied ? <><CheckIcon className="w-3.5 h-3.5 mr-1.5 text-success" />Copied</> : <><CopyIcon className="w-3.5 h-3.5 mr-1.5" />Copy Text</>}
                </button>
                <button onClick={handleApply} disabled={!refinedPrompt || isLoading} className="btn btn-xs btn-ghost rounded-none font-black text-[10px] tracking-widest px-4">
                    <CheckIcon className="w-3.5 h-3.5 mr-1.5" /> Apply Prompt
                </button>
            </footer>
        </div>
    );
};

export default PromptRefinePanel;