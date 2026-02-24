import React, { useState, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { crafterService } from '../services/crafterService';
import { RefreshIcon, CheckIcon, BookmarkIcon, ChevronDownIcon } from './icons';
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
            setError(e instanceof Error ? e.message : "An error occurred.");
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
            showGlobalFeedback(`Template "${templateName}" saved.`);
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
        <div className="flex flex-col bg-base-100 overflow-hidden">
            <header className="p-6 border-b border-base-300 bg-base-200/10 flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-base-content/40">
                    Prompt Template
                </span>
                <div className="flex items-center gap-1">
                    <button onClick={handleGenerate} disabled={isLoading || !promptText} className="btn btn-xs btn-ghost btn-square" aria-label="Generate template">
                        <RefreshIcon className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={() => setIsCollapsed(!isCollapsed)} className="btn btn-xs btn-ghost btn-square" aria-label={isCollapsed ? "Expand panel" : "Collapse panel"}>
                        <ChevronDownIcon className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`} />
                    </button>
                </div>
            </header>
            {!isCollapsed && (
            <div className="animate-fade-in flex flex-col overflow-hidden max-h-[300px]">
                <div className="flex-grow p-6 bg-base-100 overflow-y-auto custom-scrollbar">
                    {isLoading ? <div className="py-6"><LoadingSpinner/></div> :
                     error ? <div className="alert alert-error rounded-none text-xs"><span>{error}</span></div> :
                     formula ? (
                        <p className="text-sm font-mono whitespace-pre-wrap text-base-content/70 bg-base-200/30 p-4 border border-base-300/50">{formula}</p>
                     ) : (
                        <div className="py-12 text-center text-[10px] font-black uppercase tracking-[0.2em] text-base-content/20">
                            Ready to extract template.
                        </div>
                     )}
                </div>
                <footer className="p-4 border-t border-base-300 flex justify-end gap-2 bg-base-200/5">
                    <button onClick={() => setIsSaveModalOpen(true)} disabled={!formula || isLoading} className="btn btn-xs btn-ghost rounded-none font-black text-[9px] tracking-widest px-4" title="Save as Template">
                        <BookmarkIcon className="w-3.5 h-3.5 mr-1.5" /> Save Template
                    </button>
                    <button onClick={handleCopy} disabled={!formula || isLoading} className="btn btn-xs btn-ghost rounded-none font-black text-[9px] tracking-widest px-4" title={copied ? "Copied!" : "Copy Formula"}>
                        {copied ? <><CheckIcon className="w-3.5 h-3.5 mr-1.5 text-success" />Copied</> : <><CopyIcon className="w-3.5 h-3.5 mr-1.5" />Copy Template</>}
                    </button>
                </footer>
            </div>
            )}
        </div>

        {isSaveModalOpen && (
            <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setIsSaveModalOpen(false)}>
                <div className="bg-base-100 rounded-none border border-base-300 shadow-2xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <header className="p-8 border-b border-base-300 bg-base-200/20">
                        <h3 className="text-4xl font-black tracking-tighter text-base-content leading-none">SAVE TEMPLATE<span className="text-primary">.</span></h3>
                    </header>
                    <div className="p-8">
                        <input
                            type="text"
                            value={templateName}
                            onChange={(e) => setTemplateName((e.currentTarget as any).value)}
                            placeholder="TEMPLATE NAME..."
                            className="input input-bordered rounded-none w-full font-bold tracking-tight"
                            autoFocus
                        />
                    </div>
                    <div className="p-4 border-t border-base-300 flex justify-end gap-2 bg-base-200/10">
                             <button onClick={() => setIsSaveModalOpen(false)} className="btn btn-ghost rounded-none uppercase font-black text-[10px] tracking-widest px-8">Cancel</button>
                             <button onClick={handleSaveTemplate} disabled={isSaving || !templateName.trim()} className="btn btn-primary rounded-none uppercase font-black text-[10px] tracking-widest px-8">
                                {isSaving ? 'Saving...' : 'Save'}
                            </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

export default PromptFormulaPanel;