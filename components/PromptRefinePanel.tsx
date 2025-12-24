
import React, { useState, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { refineSinglePromptStream } from '../services/llmService';
import { SparklesIcon, CheckIcon, ChevronDownIcon, BookmarkIcon } from './icons';
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
    const [refinedPrompt, setRefinedPrompt] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [clipped, setClipped] = useState(false);

    const [targetAIModel, setTargetAIModel] = useState<string>(TARGET_IMAGE_AI_MODELS[0]);

    const handleRefine = useCallback(async () => {
        if (isCollapsed) {
            setIsCollapsed(false);
        }
        setIsLoading(true);
        setError(null);
        setRefinedPrompt(''); // Start with empty for streaming
        setClipped(false);
        try {
            const stream = refineSinglePromptStream(promptText, targetAIModel, settings);
            for await (const chunk of stream) {
                setRefinedPrompt(prev => (prev || '') + chunk);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "An unknown error occurred.");
            setRefinedPrompt(null);
        } finally {
            setIsLoading(false);
        }
    }, [promptText, targetAIModel, settings, isCollapsed, setIsCollapsed]);

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
            setRefinedPrompt(null); // Clear after applying
        }
    };
    
    const handleClip = () => {
        if (clipped || !onClip || !refinedPrompt) return;
        onClip(refinedPrompt);
        setClipped(true);
        setTimeout(() => setClipped(false), 2000);
    };

    return (
        <div className="card bg-base-100 shadow-lg flex flex-col">
            <header className="card-title p-4 text-base justify-between flex-shrink-0 border-b border-base-300 items-center">
                <span>
                    Refine with AI
                </span>
                <button onClick={() => setIsCollapsed(!isCollapsed)} className="btn btn-sm btn-ghost btn-square" aria-label={isCollapsed ? "Expand panel" : "Collapse panel"}>
                    <ChevronDownIcon className={`w-5 h-5 transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`} />
                </button>
            </header>
            {!isCollapsed && (
            <>
                <main className="card-body p-4 overflow-y-auto">
                    {isLoading && !refinedPrompt ? <LoadingSpinner/> :
                     error ? <div className="alert alert-error text-sm p-2"><span>{error}</span></div> :
                     refinedPrompt !== null ? (
                        <p className="text-base text-base-content whitespace-pre-wrap">{refinedPrompt}</p>
                     ) : (
                        <div className="p-4 text-center text-sm text-base-content/70">
                            Refined prompt will appear here.
                        </div>
                     )}
                </main>
                <footer className="card-actions p-4 border-t border-base-300 items-center gap-2 justify-between">
                    <div className="form-control flex-grow">
                         <select value={targetAIModel} onChange={(e) => setTargetAIModel((e.currentTarget as any).value)} className="select select-bordered select-sm w-full">
                            <optgroup label="Image AI Models">
                                {TARGET_IMAGE_AI_MODELS.map(model => <option key={model} value={model}>{model}</option>)}
                            </optgroup>
                            <optgroup label="Video AI Models">
                                {TARGET_VIDEO_AI_MODELS.map(model => <option key={model} value={model}>{model}</option>)}
                            </optgroup>
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleApply} disabled={!refinedPrompt || isLoading} className="btn btn-sm btn-ghost" title="Apply Refinement">
                            <CheckIcon className="w-4 h-4 mr-1" /> Apply
                        </button>
                        <button onClick={handleCopy} disabled={!refinedPrompt || isLoading} className="btn btn-sm btn-ghost" title={copied ? "Copied!" : "Copy Refinement"}>
                            {copied ? <><CheckIcon className="w-4 h-4 mr-1 text-success" />Copied</> : <><CopyIcon className="w-4 h-4 mr-1" />Copy</>}
                        </button>
                        {onClip && refinedPrompt && (
                             <button onClick={handleClip} disabled={clipped} className="btn btn-sm btn-ghost" title="Clip Refinement">
                                <BookmarkIcon className="w-4 h-4 mr-1" />
                                {clipped ? 'Clipped' : 'Clip'}
                            </button>
                        )}
                        <button onClick={handleRefine} disabled={isLoading || !promptText} className="btn btn-sm btn-ghost" title="Refine">
                            <SparklesIcon className={`w-4 h-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} /> Refine
                        </button>
                    </div>
                </footer>
            </>
            )}
        </div>
    );
};

export default PromptRefinePanel;
