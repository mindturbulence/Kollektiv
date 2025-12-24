import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { loadPromptCategories, addSavedPrompt } from '../utils/promptStorage';
import { enhancePromptStream, buildMidjourneyParams } from '../services/llmService';
import { loadArtStyles } from '../utils/artstyleStorage';
import { loadArtists } from '../utils/artistStorage';

import type { AppError, SavedPrompt, PromptCategory, EnhancementResult, PromptModifiers, CheatsheetCategory, Idea } from '../types';
import { 
    PROMPT_DETAIL_LEVELS, 
    TARGET_IMAGE_AI_MODELS, 
    TARGET_VIDEO_AI_MODELS,
    MIDJOURNEY_VERSIONS,
    MIDJOURNEY_ASPECT_RATIOS,
    COMPOSITION_OPTIONS,
    LIGHTING_OPTIONS,
    CAMERA_TYPES,
    LENS_TYPES,
    ANALOG_FILM_STOCKS,
    PHOTOGRAPHY_STYLES,
} from '../constants';

import { SuggestionItem } from './SuggestionItem';
import PromptEditorModal from './PromptEditorModal';
import PromptCrafter from './PromptCrafter';
import { ImageAbstractor } from './ImageAbstractor';
import LoadingSpinner from './LoadingSpinner';
import AutocompleteSelect from './AutocompleteSelect';
import { SparklesIcon } from './icons';

interface PromptsPageProps {
  initialState?: { prompt?: string, artStyle?: string, artist?: string, view?: 'enhancer' | 'composer' | 'create', id?: string } | null;
  onStateHandled: () => void;
  showGlobalFeedback: (message: string) => void;
  onClipIdea: (idea: Idea) => void;
}

const PromptsPage: React.FC<PromptsPageProps> = ({ 
    initialState,
    onStateHandled,
    showGlobalFeedback,
    onClipIdea,
}) => {
  const { settings } = useSettings();
  
  // View State
  const [activeView, setActiveView] = useState<'refine' | 'composer' | 'abstract'>('composer');

  // --- State for "Refine" View ---
  const [refineText, setRefineText] = useState<string>('');
  const [constantModifier, setConstantModifier] = useState<string>('');
  const [promptLength, setPromptLength] = useState<string>(PROMPT_DETAIL_LEVELS.MEDIUM);
  const [aiTargetType, setAiTargetType] = useState<'image' | 'video'>('image');
  const [targetAIModel, setTargetAIModel] = useState<string>(TARGET_IMAGE_AI_MODELS[0]);
  const [modifiers, setModifiers] = useState<PromptModifiers>({});
  const [artStyles, setArtStyles] = useState<CheatsheetCategory[]>([]);
  const [artists, setArtists] = useState<CheatsheetCategory[]>([]);
  const [isLoadingRefine, setIsLoadingRefine] = useState(false);
  const [errorRefine, setErrorRefine] = useState<AppError | null>(null);
  const [resultsRefine, setResultsRefine] = useState<EnhancementResult | null>(null);
  const [activeRefineSubTab, setActiveRefineSubTab] = useState<'prompt' | 'modifiers' | 'midjourney'>('prompt');


  // --- State for "Composer" View ---
  const [composerPromptToInsert, setComposerPromptToInsert] = useState<{ content: string, id: string } | null>(null);

  // --- State for Modals (Shared) ---
  const [isSaveSuggestionModalOpen, setIsSaveSuggestionModalOpen] = useState(false);
  const [suggestionToSave, setSuggestionToSave] = useState<Partial<SavedPrompt> | null>(null);
  const [promptCategories, setPromptCategories] = useState<PromptCategory[]>([]);
  
  // Load external data for selectors
  useEffect(() => {
    const loadData = async () => {
        try {
            const [styles, artistsData, categories] = await Promise.all([
                loadArtStyles(),
                loadArtists(),
                loadPromptCategories()
            ]);
            setArtStyles(styles);
            setArtists(artistsData);
            setPromptCategories(categories);
        } catch (e) {
            console.error("Failed to load prompter data", e);
            setErrorRefine({ message: "Failed to load cheatsheet data." });
        }
    };
    loadData();
  }, []);
  
  useEffect(() => {
    if (initialState) {
        if (initialState.view === 'composer' || initialState.view === 'create') {
            setActiveView('composer');
            if (initialState.prompt) {
                setComposerPromptToInsert({ content: initialState.prompt, id: initialState.id || `init-${Date.now()}` });
            }
        } else if (initialState.view === 'enhancer') {
            setActiveView('refine');
            if (initialState.prompt) setRefineText(initialState.prompt);
            if (initialState.artStyle) setModifiers(m => ({ ...m, artStyle: initialState.artStyle }));
            if (initialState.artist) setModifiers(m => ({ ...m, artist: initialState.artist }));
        } else if (initialState.prompt) { // Fallback for prompts sent without a specified view
             setActiveView('composer');
             setComposerPromptToInsert({ content: initialState.prompt, id: `init-${Date.now()}` });
        }
        onStateHandled();
    }
  }, [initialState, onStateHandled]);

  const handleConfirmSaveSuggestion = async (promptData: Omit<SavedPrompt, 'id' | 'createdAt'>) => {
    await addSavedPrompt(promptData);
    showGlobalFeedback('Prompt saved successfully!');
    setIsSaveSuggestionModalOpen(false);
    setSuggestionToSave(null);
  };
  
  const handleEnhance = useCallback(async () => {
    setIsLoadingRefine(true);
    setErrorRefine(null);
    setResultsRefine(null);
    let fullText = '';
    
    try {
      const stream = enhancePromptStream(refineText, constantModifier, promptLength, targetAIModel, modifiers, settings);
      
      for await (const chunk of stream) {
          fullText += chunk;
      }

      const midjourneyParams = targetAIModel.toLowerCase().includes('midjourney') 
            ? buildMidjourneyParams(modifiers)
            : '';
      
      const suggestions = fullText.split('\n')
            .map(s => s.trim().replace(/^\s*\d+\.\s*/, ''))
            .filter(Boolean)
            .map(s => [s, midjourneyParams.trim()].filter(Boolean).join(' '));
        
      if (suggestions.length === 0) {
        throw new Error("The AI returned an empty response. Please try rephrasing your prompt.");
      }

      setResultsRefine({ suggestions });

    } catch (err: any) {
      setErrorRefine({ message: err.message });
    } finally {
      setIsLoadingRefine(false);
    }
  }, [refineText, constantModifier, promptLength, targetAIModel, modifiers, settings]);

  const handleSaveSuggestion = (suggestionText: string) => {
    setSuggestionToSave({ 
      text: suggestionText, 
      basePrompt: refineText,
      targetAI: targetAIModel,
      title: `${refineText.substring(0, 30)}... (Refined)`
    });
    setIsSaveSuggestionModalOpen(true);
  };

  const handleAbstractSaveSuggestion = (suggestionText: string) => {
    setSuggestionToSave({ 
        text: suggestionText, 
        basePrompt: "From Image Analysis",
        title: `Abstracted: ${suggestionText.substring(0, 30)}...` 
    });
    setIsSaveSuggestionModalOpen(true);
  };
  
  const isMidjourneySelected = targetAIModel.toLowerCase().includes('midjourney');
  
  useEffect(() => {
    if (!isMidjourneySelected && activeRefineSubTab === 'midjourney') {
      setActiveRefineSubTab('prompt');
    }
  }, [isMidjourneySelected, activeRefineSubTab]);

  const handleClipSuggestion = (suggestionText: string) => {
      const newIdea: Idea = {
          id: `clipped-${Date.now()}`,
          lens: activeView === 'refine' ? 'Refinement' : 'Abstraction',
          title: `${suggestionText.substring(0, 30)}...`,
          prompt: suggestionText,
          source: activeView === 'refine' ? 'Refiner' : 'Abstractor'
      };
      onClipIdea(newIdea);
  };

  const renderTabsHeader = (currentView: typeof activeView) => (
    <div className="p-4 border-b border-base-300 flex-shrink-0">
        <div className="tabs tabs-boxed">
            <a onClick={() => setActiveView('composer')} className={`tab ${currentView === 'composer' ? 'tab-active' : ''}`}>Composer</a>
            <a onClick={() => setActiveView('refine')} className={`tab ${currentView === 'refine' ? 'tab-active' : ''}`}>Refine</a>
            <a onClick={() => setActiveView('abstract')} className={`tab ${currentView === 'abstract' ? 'tab-active' : ''}`}>Abstract</a>
        </div>
    </div>
  );

  const handleSendToRefine = (text: string) => {
    setRefineText(text);
    setActiveView('refine');
    setResultsRefine(null);
    setErrorRefine(null);
    showGlobalFeedback('Sent to Refiner!');
  };

  const renderRefine = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 h-full">
        {/* Left Column: Form */}
        <div className="lg:col-span-1 bg-base-100 rounded-lg shadow-lg flex flex-col min-h-0">
            {renderTabsHeader('refine')}
            <div className="p-4 border-b border-base-300 flex-shrink-0">
                <div className="tabs tabs-boxed w-full">
                    <a onClick={() => setActiveRefineSubTab('prompt')} className={`tab flex-1 ${activeRefineSubTab === 'prompt' ? 'tab-active' : ''}`}>Prompt</a>
                    <a onClick={() => setActiveRefineSubTab('modifiers')} className={`tab flex-1 ${activeRefineSubTab === 'modifiers' ? 'tab-active' : ''}`}>Modifiers</a>
                    {isMidjourneySelected && (
                        <a onClick={() => setActiveRefineSubTab('midjourney')} className={`tab flex-1 ${activeRefineSubTab === 'midjourney' ? 'tab-active' : ''}`}>Midjourney</a>
                    )}
                </div>
            </div>
            <div className="p-4 space-y-3 flex-grow overflow-y-auto">
                 {activeRefineSubTab === 'prompt' && (
                    <div className="flex flex-col h-full gap-3">
                        <textarea value={refineText} onChange={(e) => setRefineText((e.currentTarget as any).value)} className="textarea textarea-bordered w-full flex-grow resize-none" placeholder="Enter your core prompt idea..."></textarea>
                        <div className="form-control"><label className="label py-1"><span className="label-text">Constant Modifier</span></label><input type="text" value={constantModifier} onChange={(e) => setConstantModifier((e.currentTarget as any).value)} className="input input-bordered input-sm w-full" placeholder="e.g., 4k, hyperdetailed, cinematic"/></div>
                        <div className="tabs tabs-boxed"><a className={`tab flex-1 ${aiTargetType === 'image' ? 'tab-active' : ''}`} onClick={() => { setAiTargetType('image'); setTargetAIModel(TARGET_IMAGE_AI_MODELS[0]); }}>Image AI</a><a className={`tab flex-1 ${aiTargetType === 'video' ? 'tab-active' : ''}`} onClick={() => { setAiTargetType('video'); setTargetAIModel(TARGET_VIDEO_AI_MODELS[0]); }}>Video AI</a></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="form-control"><label className="label py-1"><span className="label-text">Target AI Model</span></label><select value={targetAIModel} onChange={(e) => setTargetAIModel((e.currentTarget as any).value)} className="select select-bordered select-sm w-full">{(aiTargetType === 'image' ? TARGET_IMAGE_AI_MODELS : TARGET_VIDEO_AI_MODELS).map(model => <option key={model} value={model}>{model}</option>)}</select></div>
                            <div className="form-control"><label className="label py-1"><span className="label-text">Prompt Detail Level</span></label><select value={promptLength} onChange={(e) => setPromptLength((e.currentTarget as any).value)} className="select select-bordered select-sm w-full">{Object.entries(PROMPT_DETAIL_LEVELS).map(([key, value]) => (<option key={key} value={value}>{value}</option>))}</select></div>
                        </div>
                    </div>
                 )}
                 {activeRefineSubTab === 'modifiers' && (
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="form-control">
                                <label className="label py-1"><span className="label-text">Art Style</span></label>
                                <AutocompleteSelect
                                    value={modifiers.artStyle || ''}
                                    onChange={(newValue) => setModifiers({...modifiers, artStyle: newValue})}
                                    options={artStyles.flatMap(c => c.items.map(i => i.name))}
                                    placeholder="Search Art Styles..."
                                />
                            </div>
                            <div className="form-control">
                                <label className="label py-1"><span className="label-text">Artist Style</span></label>
                                <AutocompleteSelect
                                    value={modifiers.artist || ''}
                                    onChange={(newValue) => setModifiers({...modifiers, artist: newValue})}
                                    options={artists.flatMap(c => c.items.map(i => i.name))}
                                    placeholder="Search Artist Styles..."
                                />
                            </div>
                            <div className="form-control">
                                <label className="label py-1"><span className="label-text">Photography Style</span></label>
                                <AutocompleteSelect
                                    value={modifiers.photographyStyle || ''}
                                    onChange={(newValue) => setModifiers({...modifiers, photographyStyle: newValue})}
                                    options={PHOTOGRAPHY_STYLES}
                                    placeholder="Search Photo Styles..."
                                />
                            </div>
                            <div className="form-control">
                                <label className="label py-1"><span className="label-text">Composition</span></label>
                                <AutocompleteSelect
                                    value={modifiers.composition || ''}
                                    onChange={(newValue) => setModifiers({...modifiers, composition: newValue})}
                                    options={COMPOSITION_OPTIONS}
                                    placeholder="Search Compositions..."
                                />
                            </div>
                            <div className="form-control">
                                <label className="label py-1"><span className="label-text">Lighting</span></label>
                                <AutocompleteSelect value={modifiers.lighting || ''} onChange={(newValue) => setModifiers({...modifiers, lighting: newValue})} options={LIGHTING_OPTIONS} placeholder="Search Lighting..."/>
                            </div>
                            <div className="form-control">
                                <label className="label py-1"><span className="label-text">Camera Type</span></label>
                                <AutocompleteSelect value={modifiers.cameraType || ''} onChange={(newValue) => {
                                    const newModifiers: PromptModifiers = { ...modifiers, cameraType: newValue };
                                    if (newValue !== 'Analog Film') { delete newModifiers.filmStock; }
                                    setModifiers(newModifiers);
                                }} options={CAMERA_TYPES} placeholder="Search Camera Types..."/>
                            </div>
                            {modifiers.cameraType === 'Analog Film' && (
                                <div className="form-control">
                                    <label className="label py-1"><span className="label-text">Film Stock</span></label>
                                    <AutocompleteSelect value={modifiers.filmStock || ''} onChange={(newValue) => setModifiers({...modifiers, filmStock: newValue})} options={ANALOG_FILM_STOCKS} placeholder="Search Film Stocks..."/>
                                </div>
                            )}
                            <div className="form-control">
                                <label className="label py-1"><span className="label-text">Lens Type</span></label>
                                <AutocompleteSelect value={modifiers.lensType || ''} onChange={(newValue) => setModifiers({...modifiers, lensType: newValue})} options={LENS_TYPES} placeholder="Search Lens Types..."/>
                            </div>
                        </div>
                    </div>
                 )}
                 {activeRefineSubTab === 'midjourney' && isMidjourneySelected && (
                    <div className="space-y-3">
                        <div className="form-control">
                            <label className="label py-1"><span className="label-text">Negative Prompt (--no)</span></label>
                            <input type="text" value={modifiers.mjNo || ''} onChange={e => setModifiers({...modifiers, mjNo: (e.currentTarget as any).value})} className="input input-bordered input-sm w-full" placeholder="e.g. text, watermark, blurry"/>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="form-control"><label className="label py-1"><span className="label-text">Aspect Ratio (--ar)</span></label><select value={modifiers.mjAspectRatio || ''} onChange={(e) => setModifiers({...modifiers, mjAspectRatio: (e.currentTarget as any).value})} className="select select-bordered select-sm w-full"><option value="">Default</option>{MIDJOURNEY_ASPECT_RATIOS.map(i => <option key={i} value={i}>{i}</option>)}</select></div>
                            <div className="form-control"><label className="label py-1"><span className="label-text">Quality (--q)</span></label><select value={modifiers.mjQuality || '1'} onChange={(e) => setModifiers({...modifiers, mjQuality: (e.currentTarget as any).value})} className="select select-bordered select-sm w-full"><option value="1">1 (Default)</option><option value="0.5">0.5</option><option value="0.25">0.25</option></select></div>
                            <div className="form-control"><label className="label py-1"><span className="label-text">Niji Model (--niji)</span></label><select value={modifiers.mjNiji || ''} onChange={(e) => setModifiers({...modifiers, mjNiji: (e.currentTarget as any).value as '' | '4' | '5' | '6'})} className="select select-bordered select-sm w-full"><option value="">Off</option><option value="6">Niji 6</option><option value="5">Niji 5</option><option value="4">Niji 4</option></select></div>
                            <div className="form-control"><label className="label py-1"><span className="label-text">Version (--v)</span></label><select disabled={!!modifiers.mjNiji} value={modifiers.mjVersion || ''} onChange={(e) => setModifiers({...modifiers, mjVersion: (e.currentTarget as any).value})} className="select select-bordered select-sm w-full disabled:bg-base-200/50 disabled:border-base-200/50"><option value="">Default (v6)</option>{MIDJOURNEY_VERSIONS.map(i => <option key={i} value={i}>{i}</option>)}</select></div>
                            <div className="form-control"><label className="label py-1"><span className="label-text">Style (--style)</span></label><select value={modifiers.mjStyle || ''} onChange={(e) => setModifiers({...modifiers, mjStyle: (e.currentTarget as any).value as 'raw' | ''})} className="select select-bordered select-sm w-full"><option value="">Default</option><option value="raw">Raw</option></select></div>
                            <div className="form-control"><label className="label py-1"><span className="label-text">Seed (--seed)</span></label><input type="number" value={modifiers.mjSeed || ''} onChange={e => setModifiers({...modifiers, mjSeed: (e.currentTarget as any).value})} className="input input-bordered input-sm w-full" placeholder="Random"/></div>
                            <div className="form-control self-center"><label className="cursor-pointer label justify-start gap-4"><span className="label-text">Tile (--tile)</span><input type="checkbox" checked={!!modifiers.mjTile} onChange={e => setModifiers({...modifiers, mjTile: (e.currentTarget as any).checked})} className="toggle toggle-sm toggle-primary" /></label></div>
                        </div>
                        <div className="space-y-3 pt-2">
                            <div className="form-control"><label className="label py-1"><span className="label-text">Chaos (0-100): {modifiers.mjChaos || 0}</span></label><input type="range" min="0" max="100" value={modifiers.mjChaos || '0'} onChange={e => setModifiers({...modifiers, mjChaos: (e.currentTarget as any).value})} className="range range-xs range-primary" /></div>
                            <div className="form-control"><label className="label py-1"><span className="label-text">Stylize (0-1000): {modifiers.mjStylize || 100}</span></label><input type="range" min="0" max="1000" value={modifiers.mjStylize || '100'} onChange={e => setModifiers({...modifiers, mjStylize: (e.currentTarget as any).value})} className="range range-xs range-secondary" /></div>
                            <div className="form-control"><label className="label py-1"><span className="label-text">Weird (0-3000): {modifiers.mjWeird || 0}</span></label><input type="range" min="0" max="3000" value={modifiers.mjWeird || '0'} onChange={e => setModifiers({...modifiers, mjWeird: (e.currentTarget as any).value})} className="range range-xs range-info" /></div>
                            <div className="form-control"><label className="label py-1"><span className="label-text">Stop (10-100): {modifiers.mjStop || 100}</span></label><input type="range" min="10" max="100" value={modifiers.mjStop || '100'} onChange={e => setModifiers({...modifiers, mjStop: (e.currentTarget as any).value})} className="range range-xs range-accent" /></div>
                            <div className="form-control"><label className="label py-1"><span className="label-text">Repeat (1-10): {modifiers.mjRepeat || 1}</span></label><input type="range" min="1" max="10" value={modifiers.mjRepeat || '1'} onChange={e => setModifiers({...modifiers, mjRepeat: (e.currentTarget as any).value})} className="range range-xs range-warning" /></div>
                        </div>
                    </div>
                 )}
            </div>
            <div className="p-4 border-t border-base-300 flex-shrink-0">
                <button onClick={handleEnhance} disabled={isLoadingRefine || !refineText.trim()} className="btn btn-sm btn-primary w-full">
                    {isLoadingRefine ? 'Working...' : 'Refine Prompt'}
                </button>
            </div>
        </div>
        {/* Right Column: Results */}
        <div className="lg:col-span-2 bg-base-100 rounded-lg shadow-lg flex flex-col min-h-0">
            <div className="p-4 border-b border-base-300"><h2 className="text-xl font-bold text-primary">Suggestions</h2></div>
            <div className="flex-grow p-4 overflow-y-auto">
                {isLoadingRefine ? <LoadingSpinner /> :
                 errorRefine ? <div className="alert alert-error"><span>Error: {errorRefine.message}</span></div> :
                 resultsRefine ? <div className="space-y-4">{resultsRefine.suggestions.map((suggestion, index) => ( 
                    <SuggestionItem 
                        key={index} 
                        suggestionText={suggestion} 
                        onSave={handleSaveSuggestion}
                        onClip={handleClipSuggestion}
                        onRefine={handleSendToRefine}
                    />
                ))}</div> : (
                    <div className="text-center p-8">
                        <SparklesIcon className="w-16 h-16 mx-auto text-base-content/30" />
                        <p className="mt-4 text-base-content/70">Your refined prompts will appear here.</p>
                    </div>
                )}
            </div>
        </div>
    </div>
  );

  const renderComposer = () => (
    <PromptCrafter 
        onSaveToLibrary={(generatedText, baseText) => {
            setSuggestionToSave({
                text: generatedText,
                basePrompt: baseText,
                targetAI: 'Crafter',
                title: `Composed: ${baseText.substring(0, 30)}...`
            });
            setIsSaveSuggestionModalOpen(true);
        }}
        onSendToEnhancer={handleSendToRefine}
        promptToInsert={composerPromptToInsert}
        header={renderTabsHeader('composer')}
    />
  );

  const renderAbstract = () => (
      <ImageAbstractor 
        onSaveSuggestion={handleAbstractSaveSuggestion}
        header={renderTabsHeader('abstract')}
        onRefine={handleSendToRefine}
        onClip={handleClipSuggestion}
      />
  );

  return (
      <div className="h-full bg-base-200">
          {activeView === 'refine' && renderRefine()}
          {activeView === 'composer' && renderComposer()}
          {activeView === 'abstract' && renderAbstract()}
          
          <PromptEditorModal
            isOpen={isSaveSuggestionModalOpen}
            onClose={() => setIsSaveSuggestionModalOpen(false)}
            onSave={handleConfirmSaveSuggestion}
            categories={promptCategories}
            editingPrompt={suggestionToSave}
          />
      </div>
  );

};

export default PromptsPage;