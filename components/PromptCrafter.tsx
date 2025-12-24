
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { crafterService } from '../services/crafterService';
import type { WildcardFile, WildcardCategory, CrafterData } from '../types';
import LoadingSpinner from './LoadingSpinner';
import { SparklesIcon, FolderClosedIcon, DeleteIcon, RefreshIcon, BookmarkIcon, Atom2Icon, FunctionIcon, CheckIcon } from './icons';
import CopyIcon from './CopyIcon';
import { fileSystemManager } from '../utils/fileUtils';
import { PromptAnatomyPanel } from './PromptAnatomyPanel';
import { useSettings } from '../contexts/SettingsContext';
import { reconstructFromIntent, reconstructPrompt, replaceComponentInPrompt } from '../services/llmService';
import ConfirmationModal from './ConfirmationModal';
import WildcardTree from './WildcardTree';

interface PromptCrafterProps {
  onSaveToLibrary: (generatedText: string, baseText: string) => void;
  onSendToEnhancer: (prompt: string) => void;
  promptToInsert: { content: string, id: string } | null;
  header: React.ReactNode;
}

const PromptCrafter = ({ onSaveToLibrary, onSendToEnhancer, promptToInsert, header }: PromptCrafterProps) => {
    const { settings } = useSettings();
    const [crafterData, setCrafterData] = useState<CrafterData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const [promptText, setPromptText] = useState('');
    const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
    const [analysisTrigger, setAnalysisTrigger] = useState(0);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const lastInsertedId = useRef<string | null>(null);
    const [aiAction, setAiAction] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    
    // --- Template Management State ---
    const [selectedTemplate, setSelectedTemplate] = useState<WildcardFile | null>(null);
    const [templateSearchText, setTemplateSearchText] = useState('');
    const [templateToDelete, setTemplateToDelete] = useState<WildcardFile | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isSavingTemplate, setIsSavingTemplate] = useState(false);
    const [templateName, setTemplateName] = useState('');
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    
    const loadData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await crafterService.loadWildcardsAndTemplates();
            setCrafterData(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!fileSystemManager.isDirectorySelected()) {
            setError("Crafter requires a local data folder. Please select one in Settings > Application > Storage.");
            setIsLoading(false);
            return;
        }
        loadData();
    }, [loadData]);

    useEffect(() => {
        if (promptToInsert && promptToInsert.id !== lastInsertedId.current) {
            setPromptText(prev => prev ? `${prev} ${promptToInsert.content}` : promptToInsert.content);
            lastInsertedId.current = promptToInsert.id;
        }
    }, [promptToInsert]);

    const handleGenerate = () => {
        if (!promptText.trim() || !crafterData) return;
        const newPrompt = crafterService.processCrafterPrompt(promptText, crafterData.wildcardCategories);
        setGeneratedPrompt(newPrompt);
        setAnalysisTrigger(0); // Reset analysis on new generation
    };

    const handleAnalyze = () => {
        if (generatedPrompt) {
            setAnalysisTrigger(t => t + 1);
        }
    };
    
    const handleReconstruct = async () => {
        if (!generatedPrompt) return;
        setAiAction('Reconstructing with AI...');
        setError(null);
        try {
            const newPrompt = await reconstructFromIntent([generatedPrompt], settings);
            setGeneratedPrompt(newPrompt);
        } catch (e) {
            console.error("Failed to reconstruct from result:", e);
            setError(e instanceof Error ? e.message : 'An unknown error occurred during reconstruction.');
        } finally {
            setAiAction(null);
        }
    };

    const handleReplaceVariation = async (key: string, value: string) => {
        if (!generatedPrompt) return;
        setAiAction('Replacing variation...');
        setError(null);
        try {
            const newPrompt = await replaceComponentInPrompt(generatedPrompt, key, value, settings);
            setGeneratedPrompt(newPrompt);
            setAnalysisTrigger(t => t + 1); // Re-analyze after replacement
        } catch (e) {
            console.error("Failed to replace variation:", e);
            setError(e instanceof Error ? e.message : 'An unknown error occurred during replacement.');
        } finally {
            setAiAction(null);
        }
    };

    const handleReconstructFromComponents = async (newComponents: { [key: string]: string }) => {
        setAiAction('Reconstructing from components...');
        setError(null);
        try {
            const newPrompt = await reconstructPrompt(newComponents, settings);
            setGeneratedPrompt(newPrompt);
            setAnalysisTrigger(t => t + 1); // Re-analyze after reconstruction
        } catch (e) {
            console.error("Failed to reconstruct from components:", e);
            setError(e instanceof Error ? e.message : 'An unknown error occurred during reconstruction.');
        } finally {
            setAiAction(null);
        }
    };

    const handleCopy = useCallback(() => {
        if (!generatedPrompt) return;
        if (typeof window !== 'undefined' && (window as any).navigator?.clipboard) {
            (window as any).navigator.clipboard.writeText(generatedPrompt)
                .then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                })
                .catch((err: any) => {
                    console.error('Failed to copy text:', err);
                });
        }
    }, [generatedPrompt]);
    
    const handleSaveTemplateClick = () => {
        if (selectedTemplate) {
            setTemplateName(selectedTemplate.name);
        } else {
            setTemplateName('');
        }
        setIsSaveModalOpen(true);
    };

    const handleConfirmSaveTemplate = async () => {
        if (!templateName.trim()) return;
        setIsSavingTemplate(true);
        await crafterService.saveTemplate(templateName, promptText);
        await loadData();
        setIsSavingTemplate(false);
        setIsSaveModalOpen(false);
    };
    
    const handleDeleteTemplate = async (template: WildcardFile) => {
        await crafterService.deleteTemplate(template.name);
        setPromptText('');
        setSelectedTemplate(null);
        setTemplateSearchText('');
        await loadData();
    };

    const handleWildcardClick = (wildcardName: string) => {
        const textToInsert = `__${wildcardName}__`;
        const prefix = promptText.trim().length > 0 && !promptText.endsWith(' ') ? ' ' : '';
        const newText = `${promptText}${prefix}${textToInsert}`;
        
        setPromptText(newText);
    
        // After updating the state, focus the textarea and move the cursor to the end
        const textarea = textareaRef.current;
        if (textarea) {
            setTimeout(() => {
                (textarea as any).focus();
                (textarea as any).setSelectionRange(newText.length, newText.length);
            }, 0);
        }
    };

    const handleUseTemplate = () => {
        if (selectedTemplate) {
            setPromptText(selectedTemplate.content[0] || '');
        }
    };

    const handleDeleteTemplateClick = () => {
        if (selectedTemplate) {
            setTemplateToDelete(selectedTemplate);
            setIsDeleteModalOpen(true);
        }
    };

    const handleConfirmDelete = async () => {
        if (templateToDelete) {
            await handleDeleteTemplate(templateToDelete);
        }
        setIsDeleteModalOpen(false);
        setTemplateToDelete(null);
    };

    const filteredTemplates = useMemo(() => {
        if (!templateSearchText) return crafterData?.templates || [];
        return crafterData?.templates.filter(t => t.name.toLowerCase().includes(templateSearchText.toLowerCase())) || [];
    }, [templateSearchText, crafterData?.templates]);

    const handleSelectTemplateFromDropdown = (template: WildcardFile) => {
        setSelectedTemplate(template);
        setTemplateSearchText(template.name);
        if (typeof (window as any).document !== 'undefined' && (window as any).document.activeElement instanceof (window as any).HTMLElement) {
            ((window as any).document.activeElement as any).blur();
        }
    };
    
    if (isLoading) return <LoadingSpinner />;
    if (error) return <div className="p-4 text-error">{error}</div>;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-hidden h-full">
            <aside className="lg:col-span-3 bg-base-100 rounded-lg shadow-lg flex flex-col overflow-hidden min-h-0">
                {header}
                <div className="p-4 border-b border-base-300">
                    <h3 className="font-bold text-lg">Wildcards</h3>
                </div>
                <div className="flex-grow p-4 overflow-y-auto">
                    <WildcardTree categories={crafterData?.wildcardCategories || []} onWildcardClick={handleWildcardClick} />
                </div>
                <div className="flex-shrink-0 p-4 border-t border-base-300">
                    <button onClick={loadData} className="btn btn-sm btn-ghost w-full"><RefreshIcon className="w-4 h-4"/> Refresh Wildcards</button>
                </div>
            </aside>
            <main className="lg:col-span-5 bg-base-100 rounded-lg shadow-lg flex flex-col overflow-hidden min-h-0">
                <div className="p-4 border-b border-base-300 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="dropdown flex-grow">
                            <input
                                type="text"
                                tabIndex={0}
                                className="input input-bordered input-sm w-full"
                                placeholder="Search and select a template..."
                                value={templateSearchText}
                                onChange={(e) => {
                                    setTemplateSearchText((e.currentTarget as any).value);
                                    if(selectedTemplate && (e.currentTarget as any).value !== selectedTemplate.name) {
                                        setSelectedTemplate(null);
                                    }
                                }}
                            />
                            {filteredTemplates.length > 0 && (
                                <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-200 rounded-box w-full max-h-60 overflow-y-auto">
                                    {filteredTemplates.map(t => (
                                        <li key={t.name}><a onClick={() => handleSelectTemplateFromDropdown(t)}>{t.name}</a></li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <button className="btn btn-sm" onClick={handleUseTemplate} disabled={!selectedTemplate}>Use</button>
                        <button className="btn btn-sm btn-error btn-outline" onClick={handleDeleteTemplateClick} disabled={!selectedTemplate}>Delete</button>
                    </div>
                </div>

                <div className="p-4 h-56 flex-shrink-0">
                    <textarea 
                        ref={textareaRef}
                        value={promptText}
                        onChange={(e) => setPromptText((e.currentTarget as any).value)}
                        placeholder="Enter your prompt template here... Use __wildcard__ syntax."
                        className="textarea textarea-bordered w-full h-full resize-none"
                    ></textarea>
                </div>

                <div className="px-4 py-4 border-t border-base-300">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setPromptText('')} className="btn btn-sm btn-ghost flex-1">
                            Clear Prompt
                        </button>
                        <button onClick={handleSaveTemplateClick} className="btn btn-sm btn-ghost flex-1">
                            Save as Template
                        </button>
                        <button onClick={handleGenerate} className="btn btn-sm btn-ghost flex-1">
                            Generate
                        </button>
                    </div>
                </div>

                <div className="flex-grow p-4 overflow-y-auto relative border-t border-base-300">
                    {aiAction && (
                        <div className="absolute inset-0 bg-base-100/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                            <LoadingSpinner />
                            <p className="text-sm text-base-content/70 -mt-4">{aiAction}</p>
                        </div>
                    )}
                    {generatedPrompt ? (
                        <div className="space-y-2">
                             <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-semibold text-base-content/70 uppercase">Generated Result</span>
                            </div>
                            <div className="p-3 bg-base-200 rounded-lg text-base text-base-content">
                                {generatedPrompt}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center p-8 text-base-content/60 h-full flex flex-col items-center justify-center">
                            <SparklesIcon className="w-12 h-12 mx-auto mb-4"/>
                            <p className="font-semibold">Your generated prompt will appear here</p>
                            <p className="text-sm mt-1">Click <span className="kbd kbd-xs">Generate</span> to create a result.</p>
                        </div>
                    )}
                </div>
                <div className="p-4 border-t border-base-300 flex-shrink-0">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <button onClick={handleAnalyze} disabled={!generatedPrompt || !!aiAction} className="btn btn-sm btn-ghost">Analyze</button>
                        <button onClick={handleReconstruct} disabled={!generatedPrompt || !!aiAction} className="btn btn-sm btn-ghost">
                            {!!aiAction ? <span className="loading loading-spinner loading-xs"></span> : null}
                            {!!aiAction ? 'Working...' : 'Reconstruct'}
                        </button>
                        <button onClick={() => onSendToEnhancer(generatedPrompt!)} disabled={!generatedPrompt || !!aiAction} className="btn btn-sm btn-ghost">
                            Send to Refiner
                        </button>
                        <button onClick={handleCopy} disabled={!generatedPrompt || copied} className="btn btn-sm btn-ghost" title={copied ? 'Copied!' : 'Copy Result'}>
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                </div>
            </main>
            
            <aside className="lg:col-span-4 flex flex-col min-h-0">
                <PromptAnatomyPanel 
                    promptToAnalyze={generatedPrompt}
                    onReconstructFromComponents={handleReconstructFromComponents}
                    onReplaceVariation={handleReplaceVariation}
                    analysisTrigger={analysisTrigger}
                    isProcessing={!!aiAction}
                />
            </aside>

            {isSaveModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setIsSaveModalOpen(false)}>
                    <div className="modal-box" onClick={(e) => e.stopPropagation()}>
                        <h3 className="font-bold text-lg">Save Template</h3>
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
                             <button onClick={() => setIsSaveModalOpen(false)} className="btn btn-sm btn-ghost">Cancel</button>
                             <button onClick={handleConfirmSaveTemplate} disabled={isSavingTemplate || !templateName.trim()} className="btn btn-sm btn-primary">
                                {isSavingTemplate ? "Saving..." : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
             <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                title={`Delete Template "${templateToDelete?.name}"`}
                message="Are you sure you want to permanently delete this template? This action cannot be undone."
            />
        </div>
    );
};

export default PromptCrafter;
