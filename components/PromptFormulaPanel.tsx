import React, { useState, useCallback, useRef } from 'react';
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
    const scrollerRef = useRef<HTMLDivElement>(null);

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
        <div className="flex flex-col bg-base-100/80 backdrop-blur-xl overflow-hidden border border-base-300/20">
            <header className="p-6 flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-base-content/40">
                    Prompt Template
                </span>
                <div className="flex items-center gap-1">
                    <button onClick={handleGenerate} disabled={isLoading || !promptText} className="form-btn h-8 w-8" aria-label="Generate template">
                        <RefreshIcon className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={() => setIsCollapsed(!isCollapsed)} className="form-btn h-8 w-8" aria-label={isCollapsed ? "Expand panel" : "Collapse panel"}>
                        <ChevronDownIcon className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`} />
                    </button>
                </div>
            </header>
            {!isCollapsed && (
            <div className="animate-fade-in flex flex-col overflow-hidden max-h-[300px] bg-base-100/30 backdrop-blur-md border border-base-content/5 relative">
                <div ref={scrollerRef} className="flex-grow p-6 overflow-y-auto">
                    {isLoading ? <div className="py-6"><LoadingSpinner/></div> :
                     error ? <div className="alert alert-error rounded-none text-xs"><span>{error}</span></div> :
                     formula ? (
                        <p className="text-sm font-mono whitespace-pre-wrap text-base-content/70 p-4">{formula}</p>
                     ) : (
                        <div className="py-12 text-center text-[10px] font-black uppercase tracking-[0.2em] text-base-content/20">
                            Ready to extract template.
                        </div>
                     )}
                </div>
                <footer className="p-4 flex justify-end gap-2">
                    <button onClick={() => setIsSaveModalOpen(true)} disabled={!formula || isLoading} className="form-btn h-8 px-4" title="Save as Template">
                        <BookmarkIcon className="w-3.5 h-3.5 mr-1.5" /> Save Template
                    </button>
                    <button onClick={handleCopy} disabled={!formula || isLoading} className="form-btn h-8 px-4" title={copied ? "Copied!" : "Copy Formula"}>
                        {copied ? <><CheckIcon className="w-3.5 h-3.5 mr-1.5 text-success" />Copied</> : <><CopyIcon className="w-3.5 h-3.5 mr-1.5" />Copy Template</>}
                    </button>
                </footer>
            </div>
            )}
        </div>

        {isSaveModalOpen && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-xl z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setIsSaveModalOpen(false)}>
                <div className="bg-base-100/40 w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <header className="p-8">
                        <h3 className="text-4xl font-black tracking-tighter text-base-content leading-none">SAVE TEMPLATE<span className="text-primary">.</span></h3>
                    </header>
                    <div className="p-8">
                        <input
                            type="text"
                            value={templateName}
                            onChange={(e) => setTemplateName((e.currentTarget as any).value)}
                            placeholder="TEMPLATE NAME..."
                            className="form-input w-full"
                            autoFocus
                        />
                    </div>
                    <div className="p-4 flex justify-end gap-2">
                             <button onClick={() => setIsSaveModalOpen(false)} className="form-btn h-10 px-8">Cancel</button>
                             <button onClick={handleSaveTemplate} disabled={isSaving || !templateName.trim()} className="form-btn form-btn-primary h-10 px-8">
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