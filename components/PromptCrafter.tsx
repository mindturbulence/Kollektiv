import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import JSZip from 'jszip';
import { crafterService } from '../services/crafterService';
import type { WildcardFile, CrafterData } from '../types';
import LoadingSpinner from './LoadingSpinner';
import { SparklesIcon, CloseIcon } from './icons';
import { fileSystemManager } from '../utils/fileUtils';
import { PromptAnatomyPanel } from './PromptAnatomyPanel';
import { useSettings } from '../contexts/SettingsContext';
import { useBusy } from '../contexts/BusyContext';
import { reconstructFromIntent, reconstructPrompt, replaceComponentInPrompt } from '../services/llmService';
import ConfirmationModal from './ConfirmationModal';
import WildcardTree from './WildcardTree';
import CustomScrollbar from './CustomScrollbar';

interface PromptCrafterProps {
  onSaveToLibrary: (generatedText: string, baseText: string) => void;
  onClip?: (prompt: string) => void;
  onSendToEnhancer: (prompt: string) => void;
  onSavePresetSuccess?: (prompt: string, modifiers: any, constantModifier?: string) => void;
  promptToInsert: { content: string, id: string } | null;
  header: React.ReactNode;
  modifierCatalog?: string;
}

const PromptCrafter = ({ onClip, onSendToEnhancer, onSavePresetSuccess, promptToInsert, header, modifierCatalog }: PromptCrafterProps) => {
    const { settings } = useSettings();
    const { setIsBusy } = useBusy();
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
    const [clipped, setClipped] = useState(false);

    const wildcardScrollerRef = useRef<HTMLDivElement>(null);
    const mainScrollerRef = useRef<HTMLDivElement>(null);
    
    // --- Template Management State ---
    const [selectedTemplate, setSelectedTemplate] = useState<WildcardFile | null>(null);
    const [templateSearchText, setTemplateSearchText] = useState('');
    const [templateToDelete, setTemplateToDelete] = useState<WildcardFile | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isSavingTemplate, setIsSavingTemplate] = useState(false);
    const [templateName, setTemplateName] = useState('');
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const importInputRef = useRef<HTMLInputElement>(null);
    
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
            setError("Crafter requires a storage folder. Please select one in Settings > General > Storage Folder.");
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
        setAnalysisTrigger(0);
        setClipped(false);
    };

    const handleAnalyze = () => {
        if (generatedPrompt) {
            setAnalysisTrigger(t => t + 1);
        }
    };
    
    const handleReconstruct = async () => {
        if (!generatedPrompt) return;
        setAiAction('Rewriting prompt...');
        setIsBusy(true);
        setError(null);
        try {
            const newPrompt = await reconstructFromIntent([generatedPrompt], settings);
            setGeneratedPrompt(newPrompt);
        } catch (e) {
            console.error("Failed to rewrite result:", e);
            setError(e instanceof Error ? e.message : 'Failed to rewrite prompt.');
        } finally {
            setAiAction(null);
            setIsBusy(false);
        }
    };

    const handleReplaceVariation = async (key: string, value: string) => {
        if (!generatedPrompt) return;
        setAiAction('Replacing component...');
        setIsBusy(true);
        setError(null);
        try {
            const newPrompt = await replaceComponentInPrompt(generatedPrompt, key, value, settings);
            setGeneratedPrompt(newPrompt);
            setAnalysisTrigger(t => t + 1);
        } catch (e) {
            console.error("Failed to replace variation:", e);
            setError(e instanceof Error ? e.message : 'An error occurred during replacement.');
        } finally {
            setAiAction(null);
            setIsBusy(false);
        }
    };

    const handleReconstructFromComponents = async (newComponents: { [key: string]: string }) => {
        setAiAction('Rebuilding from details...');
        setIsBusy(true);
        setError(null);
        try {
            const newPrompt = await reconstructPrompt(newComponents, settings);
            setGeneratedPrompt(newPrompt);
            setAnalysisTrigger(t => t + 1);
        } catch (e) {
            console.error("Failed to rebuild from components:", e);
            setError(e instanceof Error ? e.message : 'An error occurred during rebuilding.');
        } finally {
            setAiAction(null);
            setIsBusy(false);
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

    const handleClip = useCallback(() => {
        if (!generatedPrompt || !onClip) return;
        onClip(generatedPrompt);
        setClipped(true);
        setTimeout(() => setClipped(false), 2000);
    }, [generatedPrompt, onClip]);
    
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

    const handleConfirmDelete = async () => {
        if (templateToDelete) {
            await handleDeleteTemplate(templateToDelete);
            setIsDeleteModalOpen(false);
            setTemplateToDelete(null);
        }
    };

    const handleWildcardClick = (wildcardName: string) => {
        const textToInsert = `__${wildcardName}__`;
        const prefix = promptText.trim().length > 0 && !promptText.endsWith(' ') ? ' ' : '';
        const newText = `${promptText}${prefix}${textToInsert}`;
        
        setPromptText(newText);
    
        const textarea = textareaRef.current;
        if (textarea) {
            setTimeout(() => {
                (textarea as any).focus();
                (textarea as any).setSelectionRange(newText.length, newText.length);
            }, 0);
        }
    };

    const handleUseTemplate = useCallback((templateToUse: WildcardFile | null = selectedTemplate) => {
        if (templateToUse) {
            setPromptText(templateToUse.content[0] || '');
        }
    }, [selectedTemplate]);

    const handleDeleteTemplateClick = () => {
        if (selectedTemplate) {
            setTemplateToDelete(selectedTemplate);
            setIsDeleteModalOpen(true);
        }
    };

    const filteredTemplates = useMemo(() => {
        if (!templateSearchText) return crafterData?.templates || [];
        return crafterData?.templates.filter(t => t.name.toLowerCase().includes(templateSearchText.toLowerCase())) || [];
    }, [templateSearchText, crafterData?.templates]);

    const handleSelectTemplateFromDropdown = (template: WildcardFile) => {
        setSelectedTemplate(template);
        setTemplateSearchText(template.name);
        // BUG FIX: Apply template immediately on selection
        handleUseTemplate(template);
        if (typeof (window as any).document !== 'undefined' && (window as any).document.activeElement instanceof (window as any).HTMLElement) {
            ((window as any).document.activeElement as any).blur();
        }
    };
    
    const handleImportClick = () => {
        importInputRef.current?.click();
    };

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setIsImporting(true);
        setError(null);

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const lowerName = file.name.toLowerCase();

                if (lowerName.endsWith('.txt') || lowerName.endsWith('.yml') || lowerName.endsWith('.yaml')) {
                    const content = await file.text();
                    await crafterService.saveWildcardFile(file.name, content);
                } else if (lowerName.endsWith('.zip')) {
                    const zip = await JSZip.loadAsync(file);
                    const entries = Object.entries(zip.files);
                    for (const [relativePath, zipEntry] of entries) {
                        if (!zipEntry.dir) {
                            const entryLower = relativePath.toLowerCase();
                            if (entryLower.endsWith('.txt') || entryLower.endsWith('.yml') || entryLower.endsWith('.yaml')) {
                                const content = await zipEntry.async('string');
                                await crafterService.saveWildcardFile(relativePath, content);
                            }
                        }
                    }
                }
            }
            await loadData();
        } catch (err: any) {
            console.error("Import failed:", err);
            setError(`Import failed: ${err.message}`);
        } finally {
            setIsImporting(false);
            if (importInputRef.current) importInputRef.current.value = '';
        }
    };

    if (isLoading) return (
        <div className="h-full w-full flex items-center justify-center bg-transparent">
            <LoadingSpinner />
        </div>
    );
    if (error) return <div className="p-4 text-error">{error}</div>;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 overflow-hidden h-full gap-4">
            <aside className="lg:col-span-3 flex flex-col overflow-hidden bg-base-100/30 backdrop-blur-md border-r border-base-300/20 relative">
                {header}
                <header className="p-6 h-16 flex items-center bg-base-100/10 backdrop-blur-md">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Wildcards</h3>
                </header>
                <div ref={wildcardScrollerRef} className="flex-grow p-6 overflow-y-auto no-scrollbar">
                    <WildcardTree categories={crafterData?.wildcardCategories || []} onWildcardClick={handleWildcardClick} />
                </div>
                <CustomScrollbar containerRef={wildcardScrollerRef} />
                <footer className="h-14 flex items-stretch bg-base-100/10 backdrop-blur-md">
                    <button 
                        onClick={loadData} 
                        disabled={isImporting}
                        className="btn btn-ghost h-full flex-1 rounded-none border-none font-black text-[10px] tracking-widest uppercase hover:bg-base-200"
                    >
                        {isImporting ? '...' : 'REFRESH'}
                    </button>
                    <button 
                        onClick={handleImportClick} 
                        disabled={isImporting}
                        className="btn btn-ghost h-full flex-1 rounded-none border-none font-black text-[10px] tracking-widest uppercase hover:bg-base-200"
                    >
                        IMPORT
                    </button>
                    <input 
                        type="file" 
                        ref={importInputRef} 
                        onChange={handleImportFile} 
                        accept=".txt,.yml,.yaml,.zip" 
                        multiple 
                        className="hidden" 
                    />
                </footer>
            </aside>
            <main className="lg:col-span-6 flex flex-col overflow-hidden bg-base-100/30 backdrop-blur-md relative">
                {/* Template Selection Bar - h-16 to match panel headers */}
                <div className="h-16 flex-shrink-0 flex items-stretch bg-base-100/10 backdrop-blur-md">
                  <div className="dropdown flex-grow h-full">
                    <div className="relative h-full">
                        <input 
                          type="text"
                          tabIndex={0}
                          className="w-full h-full bg-transparent border-none focus:outline-none focus:ring-0 pl-6 pr-8 font-black text-[10px] uppercase tracking-widest placeholder:text-base-content/10"
                          placeholder="SELECT TEMPLATE..."
                          value={templateSearchText}
                          onChange={(e) => {
                              const val = (e.currentTarget as any).value;
                              setTemplateSearchText(val);
                              if (!val) {
                                  setSelectedTemplate(null);
                              // Fix: replaced 'selectedPreset' with 'selectedTemplate' to resolve compilation error on line 276
                              } else if (selectedTemplate && val !== selectedTemplate.name) {
                                  setSelectedTemplate(null);
                              }
                          }}
                        />
                        {templateSearchText && (
                            <button 
                                onClick={() => { setTemplateSearchText(''); setSelectedTemplate(null); }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/20 hover:text-error transition-colors"
                            >
                                <CloseIcon className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                    {filteredTemplates.length > 0 && (
                        <ul tabIndex={0} className="dropdown-content z-[100] menu p-1 bg-base-100 border border-base-300/50 rounded-none w-full max-h-60 overflow-y-auto custom-scrollbar shadow-2xl">
                            {filteredTemplates.map(t => (
                                <li key={t.name}>
                                    <a 
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            handleSelectTemplateFromDropdown(t);
                                        }} 
                                        className={`font-bold text-[10px] uppercase ${selectedTemplate?.name === t.name ? 'text-primary' : 'text-base-content/70 hover:text-base-content'}`}
                                    >
                                        {t.name}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    )}
                  </div>
                  <button 
                      className="btn btn-ghost h-full rounded-none border-none flex-1 font-black text-[10px] tracking-widest text-primary disabled:opacity-20 transition-all px-1 truncate" 
                      onClick={() => handleUseTemplate()} 
                      disabled={!selectedTemplate}
                  >
                      APPLY
                  </button>
                  <button 
                      className="btn btn-ghost h-full rounded-none border-none flex-1 font-black text-[10px] tracking-widest text-error/60 disabled:opacity-20 transition-all px-1 truncate" 
                      onClick={handleDeleteTemplateClick} 
                      disabled={!selectedTemplate}
                  >
                      DELETE
                  </button>
                </div>

                <div className="flex-grow flex flex-col min-h-0">
                    <div className="h-1/3 p-6 flex flex-col flex-shrink-0">
                        <textarea 
                            ref={textareaRef}
                            value={promptText}
                            onChange={(e) => setPromptText((e.currentTarget as any).value)}
                            placeholder="STREAM NEW CORE CONCEPT... Use __wildcard__ for selection."
                            className="w-full flex-grow resize-none font-medium leading-relaxed bg-transparent no-scrollbar focus:outline-none p-0 text-sm"
                        ></textarea>
                    </div>
                    
                    {/* Middle Action Bar - Library Style */}
                    <div className="h-14 flex items-stretch flex-shrink-0 bg-base-100/10 backdrop-blur-md">
                        <button 
                            onClick={() => setPromptText('')} 
                            className="btn btn-ghost h-full rounded-none border-none flex-1 font-black text-[10px] tracking-widest text-error/40 hover:text-error uppercase px-1 truncate bg-transparent"
                        >
                            CLEAR
                        </button>
                        <button 
                            onClick={handleSaveTemplateClick} 
                            className="btn btn-ghost h-full rounded-none border-none flex-1 font-black text-[10px] tracking-widest uppercase hover:bg-base-200 px-1 truncate bg-transparent"
                        >
                            SAVE
                        </button>
                        <button 
                            onClick={handleGenerate} 
                            className="btn btn-primary h-full rounded-none border-none flex-1 font-black text-[10px] tracking-widest uppercase shadow-none px-1 truncate"
                        >
                            GENERATE
                        </button>
                    </div>

                    <div ref={mainScrollerRef} className="flex-grow p-6 overflow-y-auto relative no-scrollbar">
                        {aiAction && (
                            <div className="absolute inset-0 bg-transparent flex flex-col items-center justify-center z-10">
                                <LoadingSpinner />
                                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary animate-pulse -mt-4">{aiAction}</p>
                            </div>
                        )}
                        {generatedPrompt ? (
                            <div className="space-y-4 animate-fade-in">
                                 <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 flex items-center gap-3">
                                        <div className="w-1.5 h-1.5 rounded-none bg-primary animate-pulse"></div> Resulting Prompt
                                    </span>
                                </div>
                                <div className="p-6 text-base font-medium leading-relaxed italic text-base-content/80">
                                    "{generatedPrompt}"
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center py-24 opacity-10">
                                <SparklesIcon className="w-16 h-16 mx-auto mb-4"/>
                                <p className="text-xl font-black uppercase tracking-widest">Awaiting generated prompt</p>
                            </div>
                        )}
                    </div>
                    <CustomScrollbar containerRef={mainScrollerRef} />
                </div>

                {/* Bottom Action Bar - Library Style */}
                <div className="h-14 flex items-stretch flex-shrink-0 bg-base-100/10 backdrop-blur-md">
                    <button 
                        onClick={handleAnalyze} 
                        disabled={!generatedPrompt || !!aiAction} 
                        className="btn btn-ghost h-full rounded-none border-none flex-1 font-black text-[10px] tracking-widest uppercase hover:bg-base-200 px-1 truncate disabled:text-base-content/20 disabled:bg-transparent disabled:opacity-100"
                    >
                        ANALYZE
                    </button>
                    <button 
                        onClick={handleReconstruct} 
                        disabled={!generatedPrompt || !!aiAction} 
                        className="btn btn-ghost h-full rounded-none border-none flex-1 font-black text-[10px] tracking-widest uppercase hover:bg-base-200 px-1 truncate disabled:text-base-content/20 disabled:bg-transparent disabled:opacity-100"
                    >
                        REWRITE
                    </button>
                    <button 
                        onClick={() => onSendToEnhancer(generatedPrompt!)} 
                        disabled={!generatedPrompt || !!aiAction} 
                        className="btn btn-ghost h-full rounded-none border-none flex-1 font-black text-[10px] tracking-widest text-primary uppercase hover:bg-primary/10 px-1 truncate disabled:text-base-content/20 disabled:bg-transparent disabled:opacity-100"
                    >
                        IMPROVE
                    </button>
                    <button 
                        onClick={handleClip} 
                        disabled={!generatedPrompt} 
                        className="btn btn-ghost h-full rounded-none border-none flex-1 font-black text-[10px] tracking-widest uppercase hover:bg-base-200 px-1 truncate disabled:text-base-content/20 disabled:bg-transparent disabled:opacity-100"
                    >
                        {clipped ? 'OK' : 'CLIP'}
                    </button>
                    <button 
                        onClick={handleCopy} 
                        disabled={!generatedPrompt} 
                        className="btn btn-ghost h-full rounded-none border-none flex-1 font-black text-[10px] tracking-widest uppercase hover:bg-base-200 px-1 truncate disabled:text-base-content/20 disabled:bg-transparent disabled:opacity-100"
                    >
                        {copied ? 'OK' : 'COPY'}
                    </button>
                </div>
            </main>
            
            <aside className="lg:col-span-3 flex flex-col min-h-0 bg-base-100/30 backdrop-blur-md border-l border-base-300/20 relative">
                <PromptAnatomyPanel 
                    promptToAnalyze={generatedPrompt}
                    onReconstructFromComponents={handleReconstructFromComponents}
                    onReplaceVariation={handleReplaceVariation}
                    onSaveSuccess={onSavePresetSuccess}
                    analysisTrigger={analysisTrigger}
                    isProcessing={!!aiAction}
                    modifierCatalog={modifierCatalog}
                />
            </aside>
            
            {isSaveModalOpen && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-xl z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setIsSaveModalOpen(false)}>
                    <div className="bg-base-100/40 w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <header className="p-8">
                            <h3 className="text-2xl font-black tracking-tighter text-base-content leading-none uppercase">SAVE TEMPLATE<span className="text-primary">.</span></h3>
                        </header>
                        <div className="p-8">
                            <input
                                type="text"
                                value={templateName}
                                onChange={(e) => setTemplateName((e.currentTarget as any).value)}
                                placeholder="ENTER NAME..."
                                className="input input-bordered rounded-none w-full font-bold tracking-tight uppercase"
                                autoFocus
                                onKeyDown={e => e.key === 'Enter' && handleConfirmSaveTemplate()}
                            />
                        </div>
                        <div className="p-4 flex justify-end gap-2">
                             <button onClick={() => setIsSaveModalOpen(false)} className="btn btn-ghost rounded-none uppercase font-black text-[10px] tracking-widest px-8">Cancel</button>
                             <button onClick={handleConfirmSaveTemplate} disabled={isSavingTemplate || !templateName.trim()} className="btn btn-primary rounded-none uppercase font-black text-[10px] tracking-widest px-8">
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
                title={`DELETE TEMPLATE`}
                message={`Permanently remove "${templateToDelete?.name}"?`}
            />
        </div>
    );
};

export default PromptCrafter;