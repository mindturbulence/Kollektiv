
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { loadPromptCategories, addSavedPrompt } from '../utils/promptStorage';
import { enhancePromptStream, buildMidjourneyParams, generateWithImagen, generateWithNanoBanana, generateWithVeo, cleanLLMResponse } from '../services/llmService';
import { loadArtStyles } from '../utils/artstyleStorage';
import { loadArtists } from '../utils/artistStorage';
import { fileToBase64 } from '../utils/fileUtils';

import type { AppError, SavedPrompt, PromptCategory, EnhancementResult, PromptModifiers, CheatsheetCategory, Idea } from '../types';
import { 
    PROMPT_DETAIL_LEVELS, 
    TARGET_IMAGE_AI_MODELS, 
    TARGET_VIDEO_AI_MODELS,
    MIDJOURNEY_VERSIONS,
    MIDJOURNEY_ASPECT_RATIOS,
    Z_IMAGE_STYLES,
    COMPOSITION_OPTIONS,
    CAMERA_ANGLES,
    CAMERA_PROXIMITY,
    CAMERA_SETTINGS,
    CAMERA_EFFECTS,
    FILM_TYPES,
    LIGHTING_OPTIONS,
    CAMERA_TYPES,
    CAMERA_MOVEMENT_OPTIONS,
    MOTION_OPTIONS,
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
import { SparklesIcon, PhotoIcon, CloseIcon, UploadIcon, DownloadIcon } from './icons';

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
  const [imageReferences, setImageReferences] = useState<(string | null)[]>(Array(4).fill(null));
  
  const [artStyles, setArtStyles] = useState<CheatsheetCategory[]>([]);
  const [artists, setArtists] = useState<CheatsheetCategory[]>([]);
  const [isLoadingRefine, setIsLoadingRefine] = useState(false);
  const [errorRefine, setErrorRefine] = useState<AppError | null>(null);
  
  const [resultsRefine, setResultsRefine] = useState<EnhancementResult | null>(null);
  const [directMediaResult, setDirectMediaResult] = useState<{ url: string, type: 'image' | 'video', target: string, prompt: string } | null>(null);
  
  const [activeRefineSubTab, setActiveRefineSubTab] = useState<'prompt' | 'modifiers' | 'midjourney' | 'reference'>('prompt');
  const [loadingMsg, setLoadingMsg] = useState<string>('');

  // --- State for "Composer" View ---
  const [composerPromptToInsert, setComposerPromptToInsert] = useState<{ content: string, id: string } | null>(null);

  // --- State for Modals (Shared) ---
  const [isSaveSuggestionModalOpen, setIsSaveSuggestionModalOpen] = useState(false);
  const [suggestionToSave, setSuggestionToSave] = useState<Partial<SavedPrompt> | null>(null);
  const [promptCategories, setPromptCategories] = useState<PromptCategory[]>([]);
  
  const refFileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Helpers
  const isGoogleImageProduct = useMemo(() => {
    const target = targetAIModel.toLowerCase();
    return target.includes('imagen') || target.includes('nano banana');
  }, [targetAIModel]);

  const isGoogleProduct = useMemo(() => {
      const target = targetAIModel.toLowerCase();
      return isGoogleImageProduct || target.includes('veo');
  }, [isGoogleImageProduct, targetAIModel]);

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
    setDirectMediaResult(null);
    let fullText = '';
    
    try {
      const stream = enhancePromptStream(refineText, constantModifier, promptLength, targetAIModel, modifiers, settings);
      
      for await (const chunk of stream) {
          fullText += chunk;
      }

      const cleanedText = cleanLLMResponse(fullText);
      const midjourneyParams = targetAIModel.toLowerCase().includes('midjourney') 
            ? buildMidjourneyParams(modifiers)
            : '';
      
      const suggestions = cleanedText.split('\n')
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

  const handleDirectGenerate = async () => {
    setIsLoadingRefine(true);
    setErrorRefine(null);
    setResultsRefine(null);
    setDirectMediaResult(null);
    setLoadingMsg('Connecting to Google AI...');

    try {
        const target = targetAIModel.toLowerCase();
        let resultUrl = '';
        const combinedPrompt = [refineText, constantModifier].filter(Boolean).join('. ');

        if (target.includes('imagen')) {
            setLoadingMsg('Imaging your prompt...');
            resultUrl = await generateWithImagen(combinedPrompt);
        } else if (target.includes('nano banana')) {
            setLoadingMsg('Simulating snapshot...');
            const validRefs = imageReferences.filter((r): r is string => r !== null);
            resultUrl = await generateWithNanoBanana(combinedPrompt, validRefs);
        } else if (target.includes('veo')) {
            resultUrl = await generateWithVeo(combinedPrompt, (msg) => setLoadingMsg(msg));
        } else {
            throw new Error("Direct generation not supported for this model.");
        }

        setDirectMediaResult({
            url: resultUrl,
            type: target.includes('veo') ? 'video' : 'image',
            target: targetAIModel,
            prompt: combinedPrompt
        });
    } catch (err: any) {
        console.error("Direct generation failed:", err);
        setErrorRefine({ message: err.message || "An unexpected error occurred during direct generation." });
    } finally {
        setIsLoadingRefine(false);
    }
  };

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
  const isZImageSelected = targetAIModel === 'Z-Image';
  const isVideoSelected = aiTargetType === 'video';
  
  useEffect(() => {
    if (!isMidjourneySelected && activeRefineSubTab === 'midjourney') {
      setActiveRefineSubTab('prompt');
    }
    if (!isGoogleImageProduct && activeRefineSubTab === 'reference') {
      setActiveRefineSubTab('prompt');
    }
  }, [isMidjourneySelected, isGoogleImageProduct, activeRefineSubTab]);

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
    setDirectMediaResult(null);
    setErrorRefine(null);
    showGlobalFeedback('Sent to Refiner!');
  };

  const handleRefImageChange = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
      const file = (e.currentTarget as any).files?.[0];
      if (!file) return;
      try {
          const base64 = await fileToBase64(file);
          setImageReferences(prev => {
              const next = [...prev];
              next[index] = base64;
              return next;
          });
      } catch (err) {
          console.error("Failed to load reference image", err);
      }
      if (e.currentTarget) e.currentTarget.value = '';
  };

  const removeRefImage = (index: number) => {
      setImageReferences(prev => {
          const next = [...prev];
          next[index] = null;
          return next;
      });
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
                    {isGoogleImageProduct && (
                        <a onClick={() => setActiveRefineSubTab('reference')} className={`tab flex-1 ${activeRefineSubTab === 'reference' ? 'tab-active' : ''}`}>Reference</a>
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
                            {isZImageSelected && (
                                <div className="form-control col-span-full">
                                    <label className="label py-1"><span className="label-text text-primary font-bold">Z-Image Style</span></label>
                                    <AutocompleteSelect
                                        value={modifiers.zImageStyle || ''}
                                        onChange={(newValue) => setModifiers({...modifiers, zImageStyle: newValue})}
                                        options={Z_IMAGE_STYLES}
                                        placeholder="Select Z-Image Style..."
                                    />
                                </div>
                            )}
                            {isVideoSelected && (
                                <>
                                    <div className="form-control">
                                        <label className="label py-1"><span className="label-text text-primary font-bold">Camera Movement</span></label>
                                        <AutocompleteSelect
                                            value={modifiers.cameraMovement || ''}
                                            onChange={(newValue) => setModifiers({...modifiers, cameraMovement: newValue})}
                                            options={CAMERA_MOVEMENT_OPTIONS}
                                            placeholder="Select movement..."
                                        />
                                    </div>
                                    <div className="form-control">
                                        <label className="label py-1"><span className="label-text text-primary font-bold">Motion / Action</span></label>
                                        <AutocompleteSelect
                                            value={modifiers.motion || ''}
                                            onChange={(newValue) => setModifiers({...modifiers, motion: newValue})}
                                            options={MOTION_OPTIONS}
                                            placeholder="Select motion..."
                                        />
                                    </div>
                                </>
                            )}
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
                                <label className="label py-1"><span className="label-text font-semibold">Camera Angle</span></label>
                                <AutocompleteSelect
                                    value={modifiers.cameraAngle || ''}
                                    onChange={(newValue) => setModifiers({...modifiers, cameraAngle: newValue})}
                                    options={CAMERA_ANGLES}
                                    placeholder="Search Camera Angles..."
                                />
                            </div>
                            <div className="form-control">
                                <label className="label py-1"><span className="label-text font-semibold">Camera Proximity</span></label>
                                <AutocompleteSelect
                                    value={modifiers.cameraProximity || ''}
                                    onChange={(newValue) => setModifiers({...modifiers, cameraProximity: newValue})}
                                    options={CAMERA_PROXIMITY}
                                    placeholder="Search Proximity..."
                                />
                            </div>
                            <div className="form-control">
                                <label className="label py-1"><span className="label-text font-semibold">Camera Settings</span></label>
                                <AutocompleteSelect
                                    value={modifiers.cameraSettings || ''}
                                    onChange={(newValue) => setModifiers({...modifiers, cameraSettings: newValue})}
                                    options={CAMERA_SETTINGS}
                                    placeholder="Search Settings..."
                                />
                            </div>
                            <div className="form-control">
                                <label className="label py-1"><span className="label-text font-semibold">Camera Effect</span></label>
                                <AutocompleteSelect
                                    value={modifiers.cameraEffect || ''}
                                    onChange={(newValue) => setModifiers({...modifiers, cameraEffect: newValue})}
                                    options={CAMERA_EFFECTS}
                                    placeholder="Search Effects..."
                                />
                            </div>
                            <div className="form-control">
                                <label className="label py-1"><span className="label-text font-semibold">Film Aesthetic</span></label>
                                <AutocompleteSelect
                                    value={modifiers.filmType || ''}
                                    onChange={(newValue) => setModifiers({...modifiers, filmType: newValue})}
                                    options={FILM_TYPES}
                                    placeholder="Search Film Types..."
                                />
                            </div>
                            <div className="form-control">
                                <label className="label py-1"><span className="label-text font-semibold">Film Stock</span></label>
                                <AutocompleteSelect
                                    value={modifiers.filmStock || ''}
                                    onChange={(newValue) => setModifiers({...modifiers, filmStock: newValue})}
                                    options={ANALOG_FILM_STOCKS}
                                    placeholder="Search Film Stocks..."
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
                                    setModifiers(newModifiers);
                                }} options={CAMERA_TYPES} placeholder="Search Camera Types..."/>
                            </div>
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
                 {activeRefineSubTab === 'reference' && isGoogleImageProduct && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            {imageReferences.map((ref, idx) => (
                                <div key={idx} className="relative aspect-square bg-base-200 rounded-lg border-2 border-dashed border-base-content/20 flex flex-col items-center justify-center overflow-hidden group hover:border-primary/50 transition-colors">
                                    {ref ? (
                                        <>
                                            <img src={ref} className="w-full h-full object-cover" alt={`Reference ${idx + 1}`} />
                                            <button onClick={() => removeRefImage(idx)} className="btn btn-xs btn-circle btn-error absolute top-1 right-1 opacity-0 group-hover:opacity-100 shadow-md">
                                                <CloseIcon className="w-3 h-3"/>
                                            </button>
                                        </>
                                    ) : (
                                        <button 
                                            onClick={() => refFileInputRefs.current[idx]?.click()}
                                            className="w-full h-full flex flex-col items-center justify-center text-base-content/40 hover:text-primary transition-colors"
                                        >
                                            <UploadIcon className="w-8 h-8 mb-1"/>
                                            <span className="text-[10px] font-bold uppercase">Slot {idx + 1}</span>
                                        </button>
                                    )}
                                    <input 
                                        type="file" 
                                        accept="image/*" 
                                        className="hidden" 
                                        ref={(el) => { refFileInputRefs.current[idx] = el; }}
                                        onChange={(e) => handleRefImageChange(idx, e)}
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="bg-info/10 p-3 rounded-md text-xs text-info flex gap-2">
                             <SparklesIcon className="w-4 h-4 flex-shrink-0"/>
                             <p>Add image references to guide the visual composition. Currently supported by <b>Nano Banana</b>.</p>
                        </div>
                    </div>
                 )}
            </div>
            <div className="p-4 border-t border-base-300 flex-shrink-0 flex flex-col gap-2">
                <div className="flex gap-2">
                    <button onClick={handleEnhance} disabled={isLoadingRefine || !refineText.trim()} className={`btn btn-sm ${isGoogleProduct ? 'btn-ghost flex-1' : 'btn-primary w-full'}`}>
                        {isLoadingRefine && !loadingMsg ? 'Working...' : 'Refine Prompt'}
                    </button>
                    {isGoogleProduct && (
                        <button onClick={handleDirectGenerate} disabled={isLoadingRefine || !refineText.trim()} className="btn btn-sm btn-primary flex-1">
                            {isLoadingRefine && loadingMsg ? 'Crafting...' : 'Generate'}
                        </button>
                    )}
                </div>
            </div>
        </div>
        {/* Right Column: Results */}
        <div className="lg:col-span-2 bg-base-100 rounded-lg shadow-lg flex flex-col min-h-0">
            <div className="p-4 border-b border-base-300"><h2 className="text-xl font-bold text-primary">Results</h2></div>
            <div className="flex-grow p-4 overflow-y-auto">
                {isLoadingRefine ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                        <LoadingSpinner />
                        {loadingMsg && (
                            <div className="space-y-1">
                                <p className="font-bold text-sm uppercase tracking-widest text-primary animate-pulse">{loadingMsg}</p>
                                <p className="text-xs text-base-content/50 italic px-4">Direct Google AI generation in progress...</p>
                            </div>
                        )}
                    </div>
                ) : errorRefine ? <div className="alert alert-error"><span>Error: {errorRefine.message}</span></div> :
                 directMediaResult ? (
                    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
                        <div className="relative group bg-black rounded-2xl overflow-hidden shadow-2xl border border-base-300">
                             {directMediaResult.type === 'video' ? (
                                <video src={directMediaResult.url} controls autoPlay loop className="w-full h-auto aspect-video sm:aspect-square object-contain" />
                            ) : (
                                <img src={directMediaResult.url} alt="Direct result" className="w-full h-auto aspect-square object-contain" />
                            )}
                            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                <a href={directMediaResult.url} download={`kollektiv_direct_${directMediaResult.target.replace(/\s+/g, '_')}_${Date.now()}.${directMediaResult.type === 'video' ? 'mp4' : 'jpg'}`} className="btn btn-sm btn-primary shadow-lg">
                                    <DownloadIcon className="w-4 h-4 mr-1"/> Download
                                </a>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 px-2">
                             <div className="flex justify-between items-center">
                                <span className="badge badge-primary font-black uppercase tracking-tighter text-[10px] h-6">{directMediaResult.target} Direct Output</span>
                                <button onClick={() => setDirectMediaResult(null)} className="btn btn-link btn-xs no-underline text-base-content/40 hover:text-primary">Clear Result</button>
                             </div>
                             <div className="bg-base-200 p-4 rounded-xl text-sm italic text-base-content/80 border border-base-300">
                                "{directMediaResult.prompt}"
                             </div>
                        </div>
                    </div>
                 ) : resultsRefine ? <div className="space-y-4 animate-fade-in">{resultsRefine.suggestions.map((suggestion, index) => ( 
                    <SuggestionItem 
                        key={index} 
                        suggestionText={suggestion} 
                        targetAI={targetAIModel}
                        onSave={handleSaveSuggestion}
                        onClip={handleClipSuggestion}
                        onRefine={handleSendToRefine}
                    />
                ))}</div> : (
                    <div className="text-center p-12 flex flex-col items-center justify-center h-full text-base-content/30">
                        <SparklesIcon className="w-20 h-20 mx-auto" />
                        <p className="mt-4 text-base font-medium">Your creative sparks will appear here.</p>
                        <p className="text-sm">Refine your idea or Generate directly with Google models.</p>
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
