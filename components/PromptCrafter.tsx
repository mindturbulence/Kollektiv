import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { audioService } from '../services/audioService';
import { TerminalText, PanelLine, ScanLine, panelVariants, sectionWipeVariants, contentVariants } from './AnimatedPanels';
import JSZip from 'jszip';
import { crafterService } from '../services/crafterService';
import type { WildcardFile, CrafterData } from '../types';
import LoadingSpinner from './LoadingSpinner';
import { SparklesIcon } from './icons';
import { fileSystemManager } from '../utils/fileUtils';
import { useSettings } from '../contexts/SettingsContext';
import { useBusy } from '../contexts/BusyContext';
import { translateToEnglish, reconstructFromIntent } from '../services/llmService';
import ConfirmationModal from './ConfirmationModal';
import WildcardTree from './WildcardTree';
import SavedResultItem from './SavedResultItem';
import AutocompleteSelect from './AutocompleteSelect';

interface PromptCrafterProps {
    onSaveToLibrary: (generatedText: string, baseText: string) => void;
    onClip?: (prompt: string) => void;
    onSendToEnhancer: (prompt: string) => void;
    onSavePresetSuccess?: (prompt: string, modifiers: any, constantModifier?: string) => void;
    onSendToRefine?: (prompt: string) => void;
    promptToInsert: { content: string, id: string } | null;
    header: React.ReactNode;
    isNavigating?: boolean;
}

const PromptCrafter = ({ onSaveToLibrary, onClip, onSendToEnhancer, onSendToRefine, promptToInsert, header, isNavigating = false }: PromptCrafterProps) => {
    const { settings } = useSettings();
    const { setIsBusy } = useBusy();
    const [crafterData, setCrafterData] = useState<CrafterData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [promptText, setPromptText] = useState('');
    const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
    const [savedResults, setSavedResults] = useState<string[]>([]);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const lastInsertedId = useRef<string | null>(null);
    const [aiAction, setAiAction] = useState<string | null>(null);
    const [translated, setTranslated] = useState(false);
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
            const saved = await crafterService.loadSavedResults();
            setSavedResults(saved);
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
        setClipped(false);
        setTranslated(false);
    };

    const handleTranslate = async () => {
        if (!generatedPrompt) return;
        setAiAction('Translating to English...');
        setIsBusy(true);
        setError(null);
        try {
            const translatedText = await translateToEnglish(generatedPrompt, settings);
            setGeneratedPrompt(translatedText);
            setTranslated(true);
        } catch (e) {
            console.error("Translation failure:", e);
            setError(e instanceof Error ? e.message : 'Translation relay failed.');
        } finally {
            setAiAction(null);
            setIsBusy(false);
        }
    };

    const handleReconstruct = async () => {
        if (!generatedPrompt) return;
        setAiAction('Rewriting prompt...');
        setIsBusy(true);
        setError(null);
        try {
            // Stronger rewrite by passing it through the reconstruction logic which cleans up and optimizes visual prose
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

    const handleSaveResult = () => {
        if (generatedPrompt && !savedResults.includes(generatedPrompt)) {
            const newResults = [generatedPrompt, ...savedResults];
            setSavedResults(newResults);
            crafterService.saveSavedResults(newResults);
        }
    };

    const handleDeleteSavedResult = (index: number) => {
        const newResults = savedResults.filter((_, i) => i !== index);
        setSavedResults(newResults);
        crafterService.saveSavedResults(newResults);
    };

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
        <div className="grid grid-cols-1 lg:grid-cols-12 overflow-hidden h-full gap-4 min-h-0">
            <motion.aside
                variants={panelVariants}
                initial="hidden"
                animate={isNavigating ? "exit" : "visible"}
                exit="exit"
                className="lg:col-span-3 h-full min-h-0 flex flex-col relative p-[3px] corner-frame overflow-visible"
            >
                <PanelLine position="top" delay={0.4} />
                <PanelLine position="bottom" delay={0.5} />
                <PanelLine position="left" delay={0.6} />
                <PanelLine position="right" delay={0.7} />
                <ScanLine delay={3.5} />
                <div className="flex flex-col h-full w-full overflow-visible min-h-0 relative z-10 bg-base-100/40 backdrop-blur-xl">
                    {header}
                    <motion.header
                        variants={sectionWipeVariants}
                        custom={1.2}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="p-6 h-16 flex items-center bg-base-100/10 backdrop-blur-md flex-shrink-0 panel-header"
                    >
                        <TerminalText text="WILDCARDS" delay={2.0} className="text-xs font-sf-mono uppercase text-primary" />
                    </motion.header>
                    <motion.div
                        variants={contentVariants}
                        custom={2.2}
                        initial="hidden"
                        animate="visible"
                        ref={wildcardScrollerRef}
                        className="flex-grow p-6 overflow-y-auto"
                    >
                        <WildcardTree categories={crafterData?.wildcardCategories || []} onWildcardClick={handleWildcardClick} />
                    </motion.div>
                    <motion.footer
                        variants={contentVariants}
                        custom={2.4}
                        initial="hidden"
                        animate="visible"
                        className="h-14 flex items-stretch bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 flex-shrink-0 panel-footer"
                    >
                        <button
                            onClick={() => {
                                audioService.playClick();
                                loadData();
                            }}
                            disabled={isImporting}
                            className="btn btn-sm btn-ghost h-full rounded-none flex-1 text-[10px] tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake"
                        >
                            <span /><span /><span /><span />
                            {isImporting ? '...' : 'REFRESH'}
                        </button>
                        <button
                            onClick={() => {
                                audioService.playClick();
                                handleImportClick();
                            }}
                            disabled={isImporting}
                            className="btn btn-sm btn-ghost h-full rounded-none flex-1 text-[10px] tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake"
                        >
                            <span /><span /><span /><span />
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
                    </motion.footer>
                </div>
                {/* Manual Corner Accents - Reduced contrast to match app style */}
                <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
            </motion.aside>
            <motion.main
                variants={panelVariants}
                initial="hidden"
                animate={isNavigating ? "exit" : "visible"}
                exit="exit"
                className="lg:col-span-6 h-full min-h-0 flex flex-col relative p-[3px] corner-frame overflow-visible"
            >
                <PanelLine position="top" delay={0.4} />
                <PanelLine position="bottom" delay={0.5} />
                <PanelLine position="left" delay={0.6} />
                <PanelLine position="right" delay={0.7} />
                <ScanLine delay={3.5} />
                <div className="flex flex-col h-full w-full overflow-visible min-h-0 relative z-10 bg-base-100/40 backdrop-blur-xl">
                    <motion.header
                        variants={sectionWipeVariants}
                        custom={1.4}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="h-16 flex-shrink-0 flex items-stretch bg-base-100/10 p-1.5 gap-1.5 panel-header relative z-[800] overflow-visible"
                    >
                        <div className="flex-grow h-full relative overflow-visible">
                            <div className="flex gap-4 items-center h-full justify-center overflow-visible">
                                <div className="flex-1 px-0 text-sm h-full flex items-center overflow-visible">
                                    <AutocompleteSelect
                                        placeholder="SELECT TEMPLATE..."
                                        value={selectedTemplate?.name || ''}
                                        onChange={(val) => {
                                            const template = filteredTemplates.find(t => t.name === val);
                                            if (template) {
                                                setSelectedTemplate(template);
                                                setTemplateSearchText(template.name);
                                                handleUseTemplate(template);
                                            } else if (val === '') {
                                                setSelectedTemplate(null);
                                                setTemplateSearchText('');
                                                setPromptText('');
                                            }
                                        }}
                                        options={filteredTemplates.map(t => ({ label: t.name.toUpperCase(), value: t.name }))}
                                    />
                                </div>
                                <div className="flex gap-4 shrink-0">
                                    <button
                                        onClick={() => {
                                            audioService.playClick();
                                            setTemplateSearchText('');
                                            setSelectedTemplate(null);
                                            setPromptText('');
                                        }}
                                        onMouseEnter={() => audioService.playHover()}
                                        className="font-sf-mono text-[9px] tracking-widest text-base-content/40 hover:text-base-content transition-all"
                                    >
                                        CLEAR
                                    </button>
                                    <button
                                        className="font-sf-mono text-[9px] tracking-widest text-error/40 hover:text-error transition-all mr-2"
                                        onClick={() => {
                                            audioService.playClick();
                                            handleDeleteTemplateClick();
                                        }}
                                        onMouseEnter={() => audioService.playHover()}
                                        disabled={!selectedTemplate}
                                    >
                                        DELETE
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.header>

                    <div className="flex-grow flex flex-col min-h-0 overflow-visible relative z-10">
                        <motion.div
                            variants={sectionWipeVariants}
                            custom={1.6}
                            initial="hidden"
                            animate="visible"
                            className="h-[40%] min-h-[200px] p-6 flex flex-col overflow-hidden panel-header"
                        >
                            <textarea
                                ref={textareaRef}
                                value={promptText}
                                onChange={(e) => setPromptText((e.currentTarget as any).value)}
                                placeholder="Define your vision... Inject creative possibilities with __wildcards__."
                                className="w-full h-full resize-none font-medium leading-relaxed bg-transparent focus:outline-none p-0 text-[15px] font-nunito"
                            ></textarea>
                        </motion.div>

                        {/* Middle Action Bar - Library Style */}
                        <motion.div
                            variants={contentVariants}
                            custom={2.4}
                            initial="hidden"
                            animate="visible"
                            className="h-14 flex items-stretch flex-shrink-0 bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 panel-y-accent"
                        >
                            <button
                                onClick={() => {
                                    audioService.playClick();
                                    setPromptText('');
                                }}
                                onMouseEnter={() => audioService.playHover()}
                                className="btn btn-sm btn-ghost h-full rounded-none flex-1 text-[10px] tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake"
                            >
                                <span /><span /><span /><span />
                                CLEAR
                            </button>
                            <button
                                onClick={() => {
                                    audioService.playClick();
                                    handleSaveTemplateClick();
                                }}
                                onMouseEnter={() => audioService.playHover()}
                                className="btn btn-sm btn-ghost h-full rounded-none flex-1 text-[10px] tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake"
                            >
                                <span /><span /><span /><span />
                                SAVE TEMPLATE
                            </button>
                            <button
                                onClick={() => {
                                    audioService.playClick();
                                    handleGenerate();
                                }}
                                onMouseEnter={() => audioService.playHover()}
                                className="btn btn-sm btn-ghost h-full rounded-none flex-1 text-[10px] tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake"
                            >
                                <span /><span /><span /><span />
                                GENERATE
                            </button>
                        </motion.div>

                        <motion.div
                            variants={contentVariants}
                            custom={2.6}
                            initial="hidden"
                            animate="visible"
                            ref={mainScrollerRef}
                            className="flex-1 min-h-0 overflow-y-auto relative"
                        >
                            {aiAction && (
                                <div className="absolute inset-0 bg-base-100/20 backdrop-blur-sm flex flex-col items-center justify-center z-10 animate-fade-in">
                                    <LoadingSpinner />
                                    <p className="text-[10px] font-normal text-[12px] font-sf-mono uppercase tracking-widest text-primary animate-pulse mt-4">{aiAction}</p>
                                </div>
                            )}
                            {generatedPrompt ? (
                                <div className="p-6 h-full animate-fade-in flex flex-col">
                                    <div className="text-base font-normal font-nunito leading-relaxed italic text-base-content/80 flex-grow">
                                        "{generatedPrompt}"
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center opacity-10">
                                    <SparklesIcon className="w-16 h-16 mx-auto mb-4" />
                                    <p className="text-xl text-[12px] font-sf-mono uppercase tracking-widest">Awaiting generated prompt</p>
                                </div>
                            )}
                        </motion.div>
                    </div>

                    {/* Bottom Action Bar - Library Style */}
                    <motion.div
                        variants={contentVariants}
                        custom={2.8}
                        initial="hidden"
                        animate="visible"
                        className="h-14 flex items-stretch flex-shrink-0 bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 panel-footer"
                    >
                        <button
                            onClick={() => {
                                audioService.playClick();
                                handleTranslate();
                            }}
                            disabled={!generatedPrompt || !!aiAction}
                            className="btn btn-sm btn-ghost h-full rounded-none flex-1 text-[10px] tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake"
                        >
                            <span /><span /><span /><span />
                            {translated ? 'RE-TRANSLATE' : 'TRANSLATE'}
                        </button>
                        <button
                            onClick={() => {
                                audioService.playClick();
                                handleReconstruct();
                            }}
                            disabled={!generatedPrompt || !!aiAction}
                            className="btn btn-sm btn-ghost h-full rounded-none flex-1 text-[10px] tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake"
                        >
                            <span /><span /><span /><span />
                            REWRITE
                        </button>
                        <button
                            onClick={() => {
                                audioService.playClick();
                                onSendToEnhancer(generatedPrompt!);
                            }}
                            disabled={!generatedPrompt || !!aiAction}
                            className="btn btn-sm btn-ghost h-full rounded-none flex-1 text-[10px] tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake"
                        >
                            <span /><span /><span /><span />
                            IMPROVE
                        </button>
                        <button
                            onClick={() => {
                                audioService.playClick();
                                handleClip();
                            }}
                            disabled={!generatedPrompt}
                            className="btn btn-sm btn-ghost h-full rounded-none flex-1 text-[10px] tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake"
                        >
                            <span /><span /><span /><span />
                            {clipped ? 'OK' : 'CLIP'}
                        </button>
                        <button
                            onClick={() => {
                                audioService.playClick();
                                handleSaveResult();
                            }}
                            disabled={!generatedPrompt || savedResults.includes(generatedPrompt)}
                            className="btn btn-sm btn-ghost h-full rounded-none flex-1 text-[10px] tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake"
                        >
                            <span /><span /><span /><span />
                            {savedResults.includes(generatedPrompt!) ? 'SAVED' : 'SAVE RESULT'}
                        </button>
                    </motion.div>
                </div>
                {/* Manual Corner Accents */}
                <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
            </motion.main>

            <motion.aside
                variants={panelVariants}
                initial="hidden"
                animate={isNavigating ? "exit" : "visible"}
                exit="exit"
                className="lg:col-span-3 h-full min-h-0 flex flex-col relative p-[3px] corner-frame overflow-visible hidden lg:flex"
            >
                <PanelLine position="top" delay={0.4} />
                <PanelLine position="bottom" delay={0.5} />
                <PanelLine position="left" delay={0.6} />
                <PanelLine position="right" delay={0.7} />
                <ScanLine delay={3.5} />
                <div className="flex flex-col h-full w-full overflow-hidden min-h-0 relative z-10 bg-base-100/40 backdrop-blur-xl">
                    <motion.header
                        variants={sectionWipeVariants}
                        custom={1.6}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="px-6 py-4 flex-shrink-0 bg-base-100/10 h-16 flex items-center panel-header"
                    >
                        <TerminalText text="CRAFTED RESULTS" delay={2.8} className="text-xs font-sf-mono uppercase text-primary" />
                    </motion.header>
                    <motion.div
                        variants={contentVariants}
                        custom={2.8}
                        initial="hidden"
                        animate="visible"
                        className="flex-grow overflow-y-auto p-1.5 space-y-1.5 custom-scrollbar"
                    >
                        {savedResults.length > 0 ? (
                            savedResults.map((res, idx) => (
                                <SavedResultItem
                                    key={`${idx}-${res.substring(0, 10)}`}
                                    text={res}
                                    onCopy={(txt) => {
                                        if (navigator.clipboard) navigator.clipboard.writeText(txt);
                                    }}
                                    onSaveToLibrary={(txt) => onSaveToLibrary(txt, promptText)}
                                    onDelete={() => handleDeleteSavedResult(idx)}
                                    onRefine={onSendToRefine}
                                />
                            ))
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center opacity-10">
                                <SparklesIcon className="w-12 h-12 mb-4" />
                                <p className="text-[10px] text-[12px] font-sf-mono uppercase tracking-widest leading-relaxed">Generated prompts mapped to session index will appear here</p>
                            </div>
                        )}
                    </motion.div>
                </div>
                {/* Manual Corner Accents */}
                <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
            </motion.aside>

            {isSaveModalOpen && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-xl z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setIsSaveModalOpen(false)}>
                    <div className="w-full max-w-lg relative p-[3px] corner-frame overflow-visible shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="bg-base-100/40 backdrop-blur-xl rounded-none w-full overflow-hidden relative z-10">
                            <header className="px-8 py-6 panel-header">
                                <h3 className="text-2xl font-black tracking-tighter text-base-content leading-none uppercase">SAVE TEMPLATE<span className="text-primary">.</span></h3>
                                <p className="text-[10px] font-normal text-[12px] font-sf-mono uppercase tracking-widest text-base-content/30 mt-1.5">Preset Registration</p>
                            </header>
                            <div className="p-8">
                                <div className="form-control">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Template Identity</label>
                                    <input
                                        type="text"
                                        value={templateName}
                                        onChange={(e) => setTemplateName((e.currentTarget as any).value)}
                                        placeholder="ENTER NAME..."
                                        className="form-input w-full"
                                        autoFocus
                                        onKeyDown={e => e.key === 'Enter' && handleConfirmSaveTemplate()}
                                    />
                                </div>
                            </div>
                            <footer className="h-14 flex items-stretch bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 overflow-hidden flex-shrink-0 panel-footer">
                                <button onClick={() => setIsSaveModalOpen(false)} className="btn btn-sm btn-ghost h-full flex-1 rounded-none font-normal text-[13px] tracking-wider border border-base-content/5 btn-snake no-glow active:no-glow">
                                    <span /><span /><span /><span />
                                    CANCEL
                                </button>
                                <button onClick={handleConfirmSaveTemplate} disabled={isSavingTemplate || !templateName.trim()} className="btn btn-sm btn-primary h-full flex-1 rounded-none font-normal text-[13px] tracking-wider border border-base-content/5 btn-snake-primary no-glow active:no-glow">
                                    <span /><span /><span /><span />
                                    {isSavingTemplate ? "SAVING..." : "COMMIT"}
                                </button>
                            </footer>
                        </div>
                        {/* Manual Corner Accents */}
                        <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                        <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                        <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                        <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
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