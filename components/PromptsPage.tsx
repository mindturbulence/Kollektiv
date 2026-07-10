// PromptsPage.tsx - View router for prompt management
import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { pageVariants } from './AnimatedPanels';
import PromptEditorModal from './PromptEditorModal';
import PromptCrafter from './PromptCrafter';
import { MediaAnalyzer } from './MediaAnalyzer';
import { PromptAnalyzer } from './PromptAnalyzer';
import { ActiveTab, Idea, SavedPrompt, PromptCategory } from '../types';
import { audioService } from '../services/audioService';
import { loadPromptCategories, loadSavedPrompts } from '../utils/promptStorage';
import { useSettings } from '../contexts/SettingsContext';
import { useBusy } from '../contexts/BusyContext';
import RefinerPage from './RefinerPage';

interface PromptsPageProps {
    initialState?: { prompt?: string; artStyle?: string; artist?: string; view?: 'enhancer' | 'composer' | 'create'; id?: string } | null;
    forcedView?: 'refine' | 'composer' | 'analyzer' | 'prompt_analyzer';
    onNavigate?: (tab: ActiveTab) => void;
    onStateHandled: () => void;
    showGlobalFeedback: (message: string, isError?: boolean) => void;
    onClipIdea: (idea: Idea) => void;
    isExiting?: boolean;
    onSendToBuilder?: (state: any) => void;
}

const PromptsPage: React.FC<PromptsPageProps> = ({
    initialState,
    forcedView,
    onNavigate,
    onStateHandled,
    showGlobalFeedback,
    onClipIdea,
    isExiting = false,
    onSendToBuilder,
}) => {
    const { settings } = useSettings();
    const { setIsBusy } = useBusy();
    const [activeView, setActiveView] = useState<'refine' | 'composer' | 'analyzer' | 'prompt_analyzer'>(forcedView || 'composer');

    useEffect(() => {
        if (forcedView) setActiveView(forcedView);
    }, [forcedView]);

    const handleSwitchView = (newView: 'refine' | 'composer' | 'analyzer' | 'prompt_analyzer') => {
        if (newView === activeView) return;
        audioService.playClick();
        setActiveView(newView);
        if (onNavigate) {
            const map: Record<string, ActiveTab> = {
                composer: 'crafter', refine: 'refiner',
                analyzer: 'media_analyzer', prompt_analyzer: 'prompt_analyzer',
            };
            onNavigate(map[newView]);
        }
    };

    // Shared state across views
    const [composerPromptToInsert, setComposerPromptToInsert] = useState<{ content: string; id: string } | null>(null);
    const [promptCategories, setPromptCategories] = useState<PromptCategory[]>([]);
    const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
    const [isSaveSuggestionModalOpen, setIsSaveSuggestionModalOpen] = useState(false);
    const [suggestionToSave, setSuggestionToSave] = useState<Partial<SavedPrompt> | null>(null);

    // Pending refiner input for cross-view handoff
    const [pendingRefinerInput, setPendingRefinerInput] = useState<{ prompt?: string; artStyle?: string; artist?: string } | null>(null);

    useEffect(() => {
        const load = async () => {
            setPromptCategories(await loadPromptCategories());
            setSavedPrompts(await loadSavedPrompts());
        };
        load();
    }, []);

    useEffect(() => {
        if (!initialState) return;
        if (initialState.view === 'composer' || initialState.view === 'create') {
            setActiveView('composer');
            if (initialState.prompt) setComposerPromptToInsert({ content: initialState.prompt, id: initialState.id || `init-${Date.now()}` });
        } else if (initialState.view === 'enhancer') {
            setActiveView('refine');
        }
        onStateHandled();
    }, [initialState, onStateHandled]);

    const handleConfirmSaveSuggestion = useCallback(async (promptData: Omit<SavedPrompt, 'id' | 'createdAt'>) => {
        const { addSavedPrompt } = await import('../utils/promptStorage');
        await addSavedPrompt(promptData);
        showGlobalFeedback('Token stored.');
        setIsSaveSuggestionModalOpen(false);
        setSuggestionToSave(null);
    }, [showGlobalFeedback]);

    const handleSaveSuggestion = (text: string, title?: string) => {
        setSuggestionToSave({ text, basePrompt: 'Base Idea', targetAI: 'AI', title: title || `Token_${Date.now().toString().slice(-4)}` });
        setIsSaveSuggestionModalOpen(true);
    };

    const handleClipSuggestion = useCallback((text: string, title?: string, lens = 'Refined Formula', source = 'Refiner') => {
        onClipIdea({ id: `clipped-${Date.now()}`, lens, title: title || 'Refined Token', prompt: text, source });
    }, [onClipIdea]);

    const handleSendToRefine = (text: string) => {
        if (onSendToBuilder) {
            onSendToBuilder({ prompt: text || '', view: 'enhancer' });
            return;
        }
        setPendingRefinerInput({ prompt: text || '' });
        handleSwitchView('refine');
    };

    return (
        <motion.div
            variants={pageVariants}
            initial="hidden"
            animate={isExiting ? 'exit' : 'visible'}
            exit="exit"
            className="flex flex-col h-full bg-transparent w-full relative overflow-hidden"
        >
            <div className="flex flex-col h-full w-full overflow-hidden relative z-10 min-h-0 bg-transparent">
                <div className="flex-grow overflow-hidden relative min-h-0">
                    <AnimatePresence mode="wait">
                        {activeView === 'composer' && (
                            <PromptCrafter
                                key="composer"
                                isNavigating={isExiting}
                                onSaveToLibrary={handleSaveSuggestion}
                                onClip={(gen) => handleClipSuggestion(gen, 'Crafted Prompt', 'Crafter Formula', 'Crafter')}
                                onSendToEnhancer={handleSendToRefine}
                                onSavePresetSuccess={(prompt: string, mods: any, _constantModifier?: string) => {
                                    setPendingRefinerInput({ prompt, artStyle: mods?.artStyle, artist: mods?.artist });
                                    showGlobalFeedback('Mapped to Refiner.');
                                    handleSwitchView('refine');
                                }}
                                onSendToRefine={handleSendToRefine}
                                promptToInsert={composerPromptToInsert}
                                header={null}
                            />
                        )}

                        {activeView === 'refine' && (
                            <RefinerPage
                                key="refine"
                                isExiting={isExiting}
                                showGlobalFeedback={showGlobalFeedback}
                                setIsBusy={setIsBusy}
                                settings={settings}
                                initialPrompt={pendingRefinerInput?.prompt}
                                initialArtStyle={pendingRefinerInput?.artStyle}
                                initialArtist={pendingRefinerInput?.artist}
                                onSaveSuggestion={handleSaveSuggestion}
                                onClipSuggestion={handleClipSuggestion}
                                onSendToBuilder={onSendToBuilder}
                            />
                        )}

                        {activeView === 'analyzer' && (
                            <MediaAnalyzer
                                key="analyzer"
                                onSaveSuggestion={handleSaveSuggestion}
                                onSaveAsPreset={(text: string) => {
                                    setPendingRefinerInput({ prompt: text });
                                    showGlobalFeedback('Sent to Refiner. Use the Save as Preset button there.');
                                    handleSwitchView('refine');
                                }}
                                onRefine={handleSendToRefine}
                                onClip={handleClipSuggestion}
                                header={null}
                                isNavigating={isExiting}
                            />
                        )}

                        {activeView === 'prompt_analyzer' && (
                            <PromptAnalyzer
                                key="prompt_analyzer"
                                header={null}
                                libraryItems={savedPrompts}
                                onSaveSuggestion={handleSaveSuggestion}
                                onClip={(t: string) => handleClipSuggestion(t)}
                                onSwitchView={handleSwitchView}
                                onMapToRefiner={(prompt: string, mods: any, _constantModifier?: string) => {
                                    setPendingRefinerInput({ prompt, artStyle: mods?.artStyle, artist: mods?.artist });
                                    handleSwitchView('refine');
                                }}
                                showGlobalFeedback={showGlobalFeedback}
                                isNavigating={isExiting}
                            />
                        )}
                    </AnimatePresence>
                </div>

                <PromptEditorModal
                    isOpen={isSaveSuggestionModalOpen}
                    onClose={() => setIsSaveSuggestionModalOpen(false)}
                    onSave={handleConfirmSaveSuggestion}
                    categories={promptCategories}
                    editingPrompt={suggestionToSave}
                />
            </div>
        </motion.div>
    );
};

export default PromptsPage;
