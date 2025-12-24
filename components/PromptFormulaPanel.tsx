
import React, { useState, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { crafterService } from '../services/crafterService';
import { RefreshIcon, CheckIcon, BookmarkIcon, ChevronDownIcon, CloseIcon } from './icons';
import LoadingSpinner from './LoadingSpinner';
import CopyIcon from './CopyIcon';

interface PromptFormulaPanelProps {
  promptText: string;
  showGlobalFeedback: (message: string) => void;
  isCollapsed: boolean;
  setIsCollapsed: (isCollapsed: boolean) => void;
}

const PromptFormulaPanel: React.FC<PromptFormulaPanelProps> = ({ promptText, showGlobalFeedback, isCollapsed, setIsCollapsed }) => {
    const { settings } = useSettings();
    const [formula, setFormula] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [templateName, setTemplateName] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleGenerate = useCallback(async () => {
        if (isCollapsed) {
            setIsCollapsed(false);
        }
        setIsLoading(true);
        setError(null);
        setFormula(null);
        try {
            const result = await crafterService.generateFormulaFromPrompt(promptText, settings);
            setFormula(result);
        } catch (e) {
            setError(e instanceof Error ? e.message : "An unknown error occurred.");
        } finally {
            setIsLoading(false);
        }
    }, [promptText, settings, isCollapsed, setIsCollapsed]);
    
    const handleCopy = () => {
        if (!formula) return;
        if (typeof window !== 'undefined' && (window as any).navigator?.clipboard) {
          (window as any).navigator.clipboard.writeText(formula)
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000); 
            });
        }
    };
    
    const handleSaveTemplate = async () => {
        if (!templateName.trim() || !formula) return;
        setIsSaving(true);
        try {
            await crafterService.saveTemplate(templateName, formula);
            showGlobalFeedback(`Template "${templateName}" saved!`);
            setIsSaveModalOpen(false);
            setTemplateName('');
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save template.");
        } finally {
            setIsSaving(false);
        }
    };


    return (
        <>
        <div className="card bg-base-100 shadow-lg flex flex-col">
            <header className="card-title p-4 text-base justify-between flex-shrink-0 border-b border-base-300 items-center">
                <span>
                    Prompt Formula
                </span>
                <div className="flex items-center">
                    <button onClick={handleGenerate} disabled={isLoading || !promptText} className="btn btn-sm btn-ghost btn-square" aria-label="Generate formula">
                        <RefreshIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={() => setIsCollapsed(!isCollapsed)} className="btn btn-sm btn-ghost btn-square" aria-label={isCollapsed ? "Expand panel" : "Collapse panel"}>
                        <ChevronDownIcon className={`w-5 h-5 transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`} />
                    </button>
                </div>
            </header>
            {!isCollapsed && (
            <>
                <main className="card-body p-4 overflow-y-auto">
                    {isLoading ? <LoadingSpinner/> :
                     error ? <div className="alert alert-error text-sm p-2"><span>{error}</span></div> :
                     formula ? (
                        <p className="text-sm font-mono whitespace-pre-wrap text-base-content">{formula}</p>
                     ) : (
                        <div className="p-4 text-center text-sm text-base-content/70">
                            Click the refresh icon to generate a reusable formula from this prompt.
                        </div>
                     )}
                </main>
                <footer className="card-actions p-4 border-t border-base-300 justify-end gap-2">
                    <button onClick={() => setIsSaveModalOpen(true)} disabled={!formula || isLoading} className="btn btn-sm btn-ghost" title="Save as Template">
                        <BookmarkIcon className="w-4 h-4 mr-1" /> Save
                    </button>
                    <button onClick={handleCopy} disabled={!formula || isLoading} className="btn btn-sm btn-ghost" title={copied ? "Copied!" : "Copy Formula"}>
                        {copied ? <><CheckIcon className="w-4 h-4 mr-1 text-success" />Copied</> : <><CopyIcon className="w-4 h-4 mr-1" />Copy</>}
                    </button>
                </footer>
            </>
            )}
        </div>

        {isSaveModalOpen && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setIsSaveModalOpen(false)}>
                <div className="modal-box" onClick={(e) => e.stopPropagation()}>
                    <h3 className="font-bold text-lg">Save Formula as Template</h3>
                    <div className="py-4">
                        <input
                            type="text"
                            value={templateName}
                            onChange={(e) => setTemplateName((e.currentTarget as any).value)}
                            placeholder="Enter template name"
                            className="input input-bordered w-full"
                        />
                    </div>
                    <div className="modal-action">
                         <div className="tooltip" data-tip="Cancel">
                             <button onClick={() => setIsSaveModalOpen(false)} className="btn btn-ghost btn-square"><CloseIcon className="w-5 h-5"/></button>
                         </div>
                         <div className="tooltip" data-tip="Save">
                             <button onClick={handleSaveTemplate} disabled={isSaving || !templateName.trim()} className="btn btn-ghost btn-square">
                                {isSaving ? <span className="loading loading-spinner loading-xs"></span> : <CheckIcon className="w-5 h-5"/>}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

export default PromptFormulaPanel;
