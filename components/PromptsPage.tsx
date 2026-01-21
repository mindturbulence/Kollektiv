
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { enhancePromptStream, buildMidjourneyParams, generateWithImagen, generateWithNanoBanana, generateWithVeo, cleanLLMResponse } from '../services/llmService';
import { loadPromptCategories, addSavedPrompt } from '../utils/promptStorage';
import { loadArtStyles } from '../utils/artstyleStorage';
import { loadArtists } from '../utils/artistStorage';
import { fileToBase64 } from '../utils/fileUtils';

import type { AppError, SavedPrompt, PromptCategory, EnhancementResult, PromptModifiers, CheatsheetCategory, Idea } from '../types';
import { 
    PROMPT_DETAIL_LEVELS, 
    CAMERA_ANGLES,
    CAMERA_PROXIMITY,
    LIGHTING_OPTIONS,
    COMPOSITION_OPTIONS,
    GENERAL_ASPECT_RATIOS,
    CAMERA_TYPES,
    CAMERA_MODELS_BY_TYPE,
    ALL_PROFESSIONAL_CAMERA_MODELS,
    CAMERA_SETTINGS,
    CAMERA_EFFECTS,
    LENS_TYPES,
    FILM_TYPES,
    ANALOG_FILM_STOCKS,
    PHOTOGRAPHY_STYLES,
    DIGITAL_AESTHETICS,
    AESTHETIC_LOOKS,
    MOTION_OPTIONS,
    CAMERA_MOVEMENT_OPTIONS,
    MIDJOURNEY_VERSIONS,
    MIDJOURNEY_NIJI_VERSIONS,
    MIDJOURNEY_ASPECT_RATIOS,
    Z_IMAGE_STYLES,
    AUDIO_TYPES,
    VOICE_GENDERS,
    VOICE_TONES,
    AUDIO_ENVIRONMENTS,
    AUDIO_MOODS
} from '../constants/modifiers';
import { TARGET_IMAGE_AI_MODELS, TARGET_VIDEO_AI_MODELS, TARGET_AUDIO_AI_MODELS } from '../constants/models';

import { SuggestionItem } from './SuggestionItem';
import PromptEditorModal from './PromptEditorModal';
import PromptCrafter from './PromptCrafter';
import { ImageAbstractor } from './ImageAbstractor';
import { MetadataReader } from './MetadataReader';
import LoadingSpinner from './LoadingSpinner';
import AutocompleteSelect from './AutocompleteSelect';
import { PhotoIcon, FilmIcon, RefreshIcon, SparklesIcon, UploadIcon, CloseIcon, ChevronDownIcon, Cog6ToothIcon, ArchiveIcon } from './icons';

interface PromptsPageProps {
  initialState?: { prompt?: string, artStyle?: string, artist?: string, view?: 'enhancer' | 'composer' | 'create', id?: string } | null;
  onStateHandled: () => void;
  showGlobalFeedback: (message: string, isError?: boolean) => void;
  onClipIdea: (idea: Idea) => void;
}

type RefineSubTab = 'basic' | 'styling' | 'photography' | 'motion' | 'platform' | 'audio';
type MediaMode = 'image' | 'video' | 'audio';

const PropertyCard: React.FC<{
    label: string;
    value: string;
    onClear: () => void;
    onClick: () => void;
    active: boolean;
}> = ({ label, value, onClear, onClick, active }) => (
    <div 
        onClick={onClick}
        className={`group relative p-3 border transition-all cursor-pointer select-none flex flex-col justify-center min-h-[4.5rem] animate-fade-in ${active ? 'bg-primary border-primary' : 'bg-base-200/50 border-base-300 hover:border-primary/50'}`}
    >
        <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className={`text-[10px] font-black uppercase tracking-widest ${active ? 'text-primary-content/60' : 'text-base-content/30'}`}>{label}</span>
            {value && (
                <button 
                    onClick={(e) => { e.stopPropagation(); onClear(); }} 
                    className={`btn btn-ghost btn-xs btn-square h-5 w-5 min-h-0 ${active ? 'text-primary-content/40 hover:text-primary-content' : 'text-base-content/20 hover:text-error'}`}
                >
                    ✕
                </button>
            )}
        </div>
        <span className={`text-sm font-bold uppercase leading-tight break-words ${active ? 'text-primary-content' : 'text-base-content/80'}`}>
            {value || 'Default'}
        </span>
    </div>
);

const ReferenceSlot: React.FC<{
    url: string | null;
    onUpload: (b64: string) => void;
    onRemove: () => void;
    index: number;
}> = ({ url, onUpload, onRemove, index }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const b64 = await fileToBase64(file);
            onUpload(b64);
        }
    };
    return (
        <div className="aspect-square bg-base-300 relative group overflow-hidden border border-base-300 w-full h-full">
            {url ? (
                <>
                    <img src={url} className="w-full h-full object-cover" alt={`Ref ${index}`} />
                    <button onClick={onRemove} className="btn btn-xs btn-square btn-error absolute top-1 right-1 opacity-0 group-hover:opacity-100 shadow-xl">✕</button>
                </>
            ) : (
                <button onClick={() => inputRef.current?.click()} className="w-full h-full flex flex-col items-center justify-center gap-1 opacity-20 hover:opacity-100 hover:bg-primary/10 transition-all">
                    <UploadIcon className="w-4 h-4" />
                    <span className="text-[8px] font-black uppercase">REF {index + 1}</span>
                </button>
            )}
            <input type="file" ref={inputRef} onChange={handleFile} accept="image/*" className="hidden" />
        </div>
    );
};

const PromptsPage: React.FC<PromptsPageProps> = ({ 
    initialState,
    onStateHandled,
    showGlobalFeedback,
    onClipIdea,
}) => {
  const { settings } = useSettings();
  const [activeView, setActiveView] = useState<'refine' | 'composer' | 'abstract' | 'reader'>('composer');

  // --- Refiner State ---
  const [mediaMode, setMediaMode] = useState<MediaMode>('image');
  const [refineText, setRefineText] = useState<string>('');
  const [constantModifier, setConstantModifier] = useState<string>('');
  const [promptLength, setPromptLength] = useState<string>(PROMPT_DETAIL_LEVELS.MEDIUM);
  const [targetAIModel, setTargetAIModel] = useState<string>(TARGET_IMAGE_AI_MODELS[0]);
  const [referenceImages, setReferenceImages] = useState<(string | null)[]>([null, null, null, null]);

  const [modifiers, setModifiers] = useState<PromptModifiers>({ 
    aspectRatio: "", videoInputType: "t2v", artStyle: "", artist: "", photographyStyle: "",
    aestheticLook: "", digitalAesthetic: "", cameraType: "", cameraModel: "", cameraAngle: "", cameraProximity: "",
    cameraSettings: "", cameraEffect: "", lensType: "", filmType: "", filmStock: "",
    lighting: "", composition: "", motion: "", cameraMovement: "", zImageStyle: "",
    audioType: "", voiceGender: "", voiceTone: "", audioEnvironment: "", audioMood: "", audioDuration: "10",
    mjAspectRatio: "", mjChaos: "0", mjStylize: "100", mjVersion: MIDJOURNEY_VERSIONS[0],
    mjNiji: "", mjStyle: "", mjTile: false, mjWeird: "0", mjNo: "", mjQuality: "",
    mjSeed: "", mjStop: "", mjRepeat: ""
  });
  
  const [artStyles, setArtStyles] = useState<CheatsheetCategory[]>([]);
  const [artists, setArtists] = useState<CheatsheetCategory[]>([]);
  const [isLoadingRefine, setIsLoadingRefine] = useState(false);
  const [errorRefine, setErrorRefine] = useState<AppError | null>(null);
  const [resultsRefine, setResultsRefine] = useState<EnhancementResult | null>(null);
  const [directMediaResult, setDirectMediaResult] = useState<{ url: string, type: 'image' | 'video', target: string, prompt: string } | null>(null);
  const [activeRefineSubTab, setActiveRefineSubTab] = useState<RefineSubTab>('basic');
  const [loadingMsg, setLoadingMsg] = useState<string>('');

  const [composerPromptToInsert, setComposerPromptToInsert] = useState<{ content: string, id: string } | null>(null);
  const [isSaveSuggestionModalOpen, setIsSaveSuggestionModalOpen] = useState(false);
  const [suggestionToSave, setSuggestionToSave] = useState<Partial<SavedPrompt> | null>(null);
  const [promptCategories, setPromptCategories] = useState<PromptCategory[]>([]);

  const isGoogleProduct = useMemo(() => {
      const target = targetAIModel.toLowerCase();
      return target.includes('imagen') || target.includes('nano banana') || target.includes('veo');
  }, [targetAIModel]);

  const isMidjourney = useMemo(() => targetAIModel.toLowerCase().includes('midjourney'), [targetAIModel]);
  const isZImage = useMemo(() => targetAIModel === 'Z-Image', [targetAIModel]);
  const hasPlatformSettings = useMemo(() => isGoogleProduct || isMidjourney, [isGoogleProduct, isMidjourney]);

  useEffect(() => {
      if (mediaMode === 'image') {
          setTargetAIModel(TARGET_IMAGE_AI_MODELS[0]);
          if (activeRefineSubTab === 'motion' || activeRefineSubTab === 'audio') setActiveRefineSubTab('basic');
      } else if (mediaMode === 'video') {
          setTargetAIModel(TARGET_VIDEO_AI_MODELS[0]);
          if (activeRefineSubTab === 'audio') setActiveRefineSubTab('basic');
      } else {
          setTargetAIModel(TARGET_AUDIO_AI_MODELS[0]);
          setActiveRefineSubTab('basic');
      }
  }, [mediaMode]);

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
            setErrorRefine({ message: "Reference data offline." });
        }
    };
    loadData();
  }, []);
  
  useEffect(() => {
    if (initialState) {
        if (initialState.view === 'composer' || initialState.view === 'create') {
            setActiveView('composer');
            if (initialState.prompt) setComposerPromptToInsert({ content: initialState.prompt, id: initialState.id || `init-${Date.now()}` });
        } else if (initialState.view === 'enhancer') {
            setActiveView('refine');
            if (initialState.prompt) setRefineText(initialState.prompt);
            if (initialState.artStyle) setModifiers(m => ({ ...m, artStyle: initialState.artStyle }));
            if (initialState.artist) setModifiers(m => ({ ...m, artist: initialState.artist }));
        }
        onStateHandled();
    }
  }, [initialState, onStateHandled]);

  const handleConfirmSaveSuggestion = async (promptData: Omit<SavedPrompt, 'id' | 'createdAt'>) => {
    await addSavedPrompt(promptData);
    showGlobalFeedback('Token stored.');
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
      const activeRefImages = referenceImages.filter((img): img is string => img !== null);
      const stream = enhancePromptStream(refineText, constantModifier, promptLength, targetAIModel, modifiers, settings, activeRefImages);
      for await (const chunk of stream) fullText += chunk;

      const cleanedText = cleanLLMResponse(fullText);
      const mjParams = isMidjourney ? buildMidjourneyParams(modifiers) : '';
      let suggestions = cleanedText.split('\n').filter(Boolean).map(s => {
          const base = s.trim();
          return isMidjourney ? `${base} ${mjParams}`.trim() : base;
      });

      if (mediaMode === 'audio' && (modifiers.audioType?.toLowerCase().includes('dialogue') || modifiers.audioType?.toLowerCase().includes('narration'))) {
          suggestions = suggestions.length > 0 ? [suggestions[0]] : [];
      }
        
      if (suggestions.length === 0) throw new Error("Processing failed.");
      setResultsRefine({ suggestions });
    } catch (err: any) {
      setErrorRefine({ message: err.message });
    } finally {
      setIsLoadingRefine(false);
    }
  }, [refineText, constantModifier, promptLength, targetAIModel, modifiers, settings, isMidjourney, referenceImages, mediaMode]);

  const handleDirectGenerate = async () => {
    setIsLoadingRefine(true);
    setErrorRefine(null);
    setResultsRefine(null);
    setDirectMediaResult(null);
    setLoadingMsg('Initializing Sequence...');

    try {
        const target = targetAIModel.toLowerCase();
        let resultUrl = '';
        const combinedPrompt = [refineText, constantModifier].filter(Boolean).join('. ');
        const activeRefImages = referenceImages.filter((img): img is string => img !== null);

        if (target.includes('imagen')) {
            resultUrl = await generateWithImagen(combinedPrompt, modifiers.aspectRatio);
        } else if (target.includes('nano banana')) {
            resultUrl = await generateWithNanoBanana(combinedPrompt, activeRefImages, modifiers.aspectRatio);
        } else if (target.includes('veo')) {
            resultUrl = await generateWithVeo(combinedPrompt, (msg) => setLoadingMsg(msg), modifiers.aspectRatio);
        } else {
            throw new Error("Direct rendering unsupported.");
        }

        setDirectMediaResult({
            url: resultUrl,
            type: target.includes('veo') ? 'video' : 'image',
            target: targetAIModel,
            prompt: combinedPrompt
        });
    } catch (err: any) {
        setErrorRefine({ message: err.message || "Engine failure." });
    } finally {
        setIsLoadingRefine(false);
    }
  };

  const handleResetRefiner = () => {
    setRefineText('');
    setConstantModifier('');
    setReferenceImages([null, null, null, null]);
    setModifiers({ 
        aspectRatio: "", videoInputType: "t2v", artStyle: "", artist: "", photographyStyle: "",
        aestheticLook: "", digitalAesthetic: "", cameraType: "", cameraModel: "", cameraAngle: "", cameraProximity: "",
        cameraSettings: "", cameraEffect: "", lensType: "", filmType: "", filmStock: "",
        lighting: "", composition: "", motion: "", cameraMovement: "", zImageStyle: "",
        audioType: "", voiceGender: "", voiceTone: "", audioEnvironment: "", audioMood: "", audioDuration: "10",
        mjAspectRatio: "", mjChaos: "0", mjStylize: "100", mjVersion: MIDJOURNEY_VERSIONS[0],
        mjNiji: "", mjStyle: "", mjTile: false, mjWeird: "0", mjNo: "", mjQuality: "",
        mjSeed: "", mjStop: "", mjRepeat: ""
    });
    setResultsRefine(null);
    setDirectMediaResult(null);
    setErrorRefine(null);
    showGlobalFeedback('Workspace purge.');
  };

  const handleSaveSuggestion = (suggestionText: string, title?: string) => {
    setSuggestionToSave({ 
      text: suggestionText, 
      basePrompt: refineText || "Base Idea",
      targetAI: targetAIModel,
      title: title || `Token_${Date.now().toString().slice(-4)}`
    });
    setIsSaveSuggestionModalOpen(true);
  };

  const handleClipSuggestion = (suggestionText: string, title?: string) => {
      onClipIdea({
          id: `clipped-${Date.now()}`, lens: 'Refined Formula', title: title || `Refined Token`,
          prompt: suggestionText, source: 'Refiner'
      });
  };

  const handlePasteRefineText = async () => {
    try {
        const text = await navigator.clipboard.readText();
        if (text) {
            setRefineText(prev => prev ? `${prev} ${text}` : text);
            showGlobalFeedback('Pasted from clipboard.');
        }
    } catch (err) {
        showGlobalFeedback('Clipboard access denied.', true);
    }
  };

  const renderTabsHeader = (currentView: typeof activeView) => {
    const tabs = [
        { id: 'composer', label: 'CRAFTER' },
        { id: 'refine', label: 'REFINE' },
        { id: 'abstract', label: 'ANALYZE' },
        { id: 'reader', label: 'READER' }
    ] as const;

    return (
        <div className="flex-shrink-0 bg-base-100 border-b border-base-300 sticky top-0 z-20 backdrop-blur-md bg-base-100/80 h-16">
            <div className="flex w-full h-full">
                {tabs.map((tab) => (
                    <button 
                        key={tab.id} 
                        onClick={() => setActiveView(tab.id as any)} 
                        className={`flex-1 h-full font-black uppercase text-xs tracking-widest transition-colors border-r border-base-300 last:border-r-0 ${
                            currentView === tab.id 
                                ? 'bg-primary text-primary-content' 
                                : 'hover:bg-base-200 text-base-content/40'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
        </div>
    );
  };

  const handleSendToRefine = (text: string) => {
    setRefineText(text);
    setActiveView('refine');
    setResultsRefine(null);
    setDirectMediaResult(null);
    setErrorRefine(null);
    showGlobalFeedback('Imported.');
  };

  const activeConstructionItems = useMemo(() => {
    const list: { label: string; value: string; tab: RefineSubTab; key: string }[] = [];
    
    if (refineText) list.push({ label: 'Prompt Idea', value: 'Defined', tab: 'basic', key: 'refineText' });
    if (constantModifier) list.push({ label: 'Constant Mod', value: constantModifier, tab: 'basic', key: 'constantModifier' });
    
    const defs: Record<string, { label: string; tab: RefineSubTab }> = {
        artStyle: { label: 'Discipline', tab: 'styling' },
        artist: { label: 'Styling Trends', tab: 'styling' },
        aestheticLook: { label: 'Look', tab: 'styling' },
        digitalAesthetic: { label: 'Digital Trend', tab: 'styling' },
        zImageStyle: { label: 'Z-Image', tab: 'styling' },
        aspectRatio: { label: 'Aspect Ratio', tab: 'photography' },
        cameraType: { label: 'Camera Body', tab: 'photography' },
        cameraModel: { label: 'Camera Model', tab: 'photography' },
        lensType: { label: 'Lens Type', tab: 'photography' },
        filmStock: { label: 'Film Stock', tab: 'photography' },
        filmType: { label: 'Medium Format', tab: 'photography' },
        cameraAngle: { label: 'Angle', tab: 'photography' },
        cameraProximity: { label: 'Proximity', tab: 'photography' },
        cameraSettings: { label: 'Technical', tab: 'photography' },
        cameraEffect: { label: 'Aberration', tab: 'photography' },
        lighting: { label: 'Lighting', tab: 'photography' },
        composition: { label: 'Layout', tab: 'photography' },
        photographyStyle: { label: 'Photo Style', tab: 'photography' },
        motion: { label: 'Motion', tab: 'motion' },
        cameraMovement: { label: 'Pathing', tab: 'motion' },
        audioType: { label: 'Audio Type', tab: 'audio' },
        voiceGender: { label: 'Voice Profile', tab: 'audio' },
        voiceTone: { label: 'Tone', tab: 'audio' },
        audioEnvironment: { label: 'Acoustics', tab: 'audio' },
        audioMood: { label: 'Audio Mood', tab: 'audio' },
        audioDuration: { label: 'Duration', tab: 'audio' },
        mjVersion: { label: 'MJ Version', tab: 'platform' },
        mjStylize: { label: 'MJ Stylize', tab: 'platform' },
        mjChaos: { label: 'MJ Chaos', tab: 'platform' },
        mjWeird: { label: 'MJ Weird', tab: 'platform' },
        mjNo: { label: 'MJ Exclude', tab: 'platform' },
        mjQuality: { label: 'MJ Quality', tab: 'platform' },
        mjTile: { label: 'MJ Tile', tab: 'platform' },
    };

    Object.entries(modifiers).forEach(([key, val]) => {
        if (val && defs[key]) {
            if (key === 'mjStylize' && val === '100') return;
            if (key === 'mjChaos' && val === '0') return;
            if (key === 'mjWeird' && val === '0') return;
            if (key === 'mjVersion' && val === MIDJOURNEY_VERSIONS[0]) return;
            if (key === 'audioDuration' && val === '10') return;
            
            const tab = defs[key].tab;
            if (mediaMode === 'audio' && ['styling', 'photography', 'motion', 'platform'].includes(tab)) return;
            if (mediaMode !== 'audio' && tab === 'audio') return;

            list.push({ label: defs[key].label, value: String(val), tab: defs[key].tab, key });
        }
    });

    return list;
  }, [modifiers, refineText, constantModifier, mediaMode]);

  const renderRefineSubContent = () => {
      switch(activeRefineSubTab) {
          case 'basic':
              return (
                <div className="flex flex-col h-full space-y-6 animate-fade-in overflow-hidden">
                    <div className="form-control flex-grow flex flex-col min-h-[120px]">
                        <div className="flex justify-between items-center mb-2">
                             <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40">Prompt Idea</label>
                             <div className="flex gap-2">
                                <button onClick={handlePasteRefineText} className="btn btn-ghost btn-xs opacity-20 hover:opacity-100 uppercase font-black text-[8px] tracking-widest">Paste</button>
                                <button onClick={() => setRefineText('')} className="btn btn-ghost btn-xs opacity-20 hover:opacity-100 uppercase font-black text-[8px] tracking-widest">Clear</button>
                             </div>
                        </div>
                        <textarea value={refineText} onChange={(e) => setRefineText((e.currentTarget as any).value)} className="textarea textarea-bordered rounded-none w-full flex-grow resize-none font-medium leading-relaxed bg-base-200/20" placeholder="Enter core concept..."></textarea>
                    </div>
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40 mb-2">Constant Modifiers</label>
                        <input type="text" value={constantModifier} onChange={(e) => setConstantModifier((e.currentTarget as any).value)} className="input input-bordered rounded-none input-sm font-bold" placeholder="Tokens the AI must include..." />
                    </div>
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40 mb-2">Media Output</label>
                        <div className="join w-full">
                            <button onClick={() => setMediaMode('image')} className={`join-item btn btn-xs flex-1 rounded-none font-black text-[9px] ${mediaMode === 'image' ? 'btn-primary' : 'btn-ghost border border-base-300'}`}>IMAGE</button>
                            <button onClick={() => setMediaMode('video')} className={`join-item btn btn-xs flex-1 rounded-none font-black text-[9px] ${mediaMode === 'video' ? 'btn-primary' : 'btn-ghost border border-base-300'}`}>VIDEO</button>
                            <button onClick={() => setMediaMode('audio')} className={`join-item btn btn-xs flex-1 rounded-none font-black text-[9px] ${mediaMode === 'audio' ? 'btn-primary' : 'btn-ghost border border-base-300'}`}>AUDIO</button>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40 mb-2">Neural Engine</label>
                            <select value={targetAIModel} onChange={(e) => setTargetAIModel((e.currentTarget as any).value)} className="select select-bordered select-sm rounded-none font-bold uppercase tracking-tighter w-full">
                                {(mediaMode === 'image' ? TARGET_IMAGE_AI_MODELS : mediaMode === 'video' ? TARGET_VIDEO_AI_MODELS : TARGET_AUDIO_AI_MODELS).map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40 mb-2">Complexity</label>
                            <select value={promptLength} onChange={(e) => setPromptLength((e.currentTarget as any).value)} className="select select-bordered select-sm rounded-none font-bold uppercase tracking-tighter w-full">
                                {Object.entries(PROMPT_DETAIL_LEVELS).map(([k, v]) => <option key={k} value={v}>{v}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
              );
          case 'styling':
              return (
                  <div className="flex flex-col gap-6 animate-fade-in">
                      <div className="grid grid-cols-2 gap-4">
                          <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Visual Discipline</label>
                            <AutocompleteSelect value={modifiers.artStyle || ''} onChange={(v) => setModifiers({...modifiers, artStyle: v})} options={artStyles.flatMap(c => c.items.map(i => i.name))} placeholder="Discipline..." />
                          </div>
                          <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Styling Trends</label>
                            <AutocompleteSelect value={modifiers.artist || ''} onChange={(v) => setModifiers({...modifiers, artist: v})} options={artists.flatMap(c => c.items.map(i => i.name))} placeholder="Creator influence..." />
                          </div>
                      </div>
                      
                      {isZImage && (
                          <div className="form-control">
                              <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Z-Image Variant</label>
                              <select value={modifiers.zImageStyle} onChange={e => setModifiers({...modifiers, zImageStyle: e.target.value})} className="select select-bordered select-sm rounded-none font-bold uppercase tracking-tight w-full animate-fade-in">
                                    <option value="">NONE</option>
                                    {Z_IMAGE_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                          </div>
                      )}
                      
                      <div className="form-control">
                          <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Aesthetics Look</label>
                          <AutocompleteSelect value={modifiers.aestheticLook || ''} onChange={(v) => setModifiers({...modifiers, aestheticLook: v})} options={AESTHETIC_LOOKS} placeholder="Look..." />
                      </div>
                      <div className="form-control">
                          <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Digital Trend</label>
                          <AutocompleteSelect value={modifiers.digitalAesthetic || ''} onChange={(v) => setModifiers({...modifiers, digitalAesthetic: v})} options={DIGITAL_AESTHETICS} placeholder="Trend..." />
                      </div>
                  </div>
              );
          case 'photography':
              const modelOptions = modifiers.cameraType && CAMERA_MODELS_BY_TYPE[modifiers.cameraType] 
                  ? CAMERA_MODELS_BY_TYPE[modifiers.cameraType] 
                  : ALL_PROFESSIONAL_CAMERA_MODELS;

              return (
                <div className="space-y-6 animate-fade-in">
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Photo Genre</label>
                        <AutocompleteSelect value={modifiers.photographyStyle || ''} onChange={(v) => setModifiers({...modifiers, photographyStyle: v})} options={PHOTOGRAPHY_STYLES} placeholder="Genre..." />
                    </div>

                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Camera Body Type</label>
                        <select 
                            value={modifiers.cameraType || ''} 
                            onChange={(e) => setModifiers({...modifiers, cameraType: (e.currentTarget as any).value, cameraModel: ""})} 
                            className="select select-bordered select-sm rounded-none font-bold"
                        >
                            <option value="">SELECT TYPE...</option>
                            {CAMERA_TYPES.map(type => <option key={type} value={type}>{type.toUpperCase()}</option>)}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Professional Camera Model</label>
                            <AutocompleteSelect 
                                value={modifiers.cameraModel || ''} 
                                onChange={(v) => setModifiers({...modifiers, cameraModel: v})} 
                                options={modelOptions} 
                                placeholder="Search models..." 
                            />
                        </div>
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Film Stock</label>
                            <AutocompleteSelect value={modifiers.filmStock || ''} onChange={(v) => setModifiers({...modifiers, filmStock: v})} options={ANALOG_FILM_STOCKS} placeholder="Stock..." />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Lens Type</label>
                            <AutocompleteSelect value={modifiers.lensType || ''} onChange={(v) => setModifiers({...modifiers, lensType: v})} options={LENS_TYPES} placeholder="Glass..." />
                        </div>
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Shot Angle</label>
                            <AutocompleteSelect value={modifiers.cameraAngle || ''} onChange={(v) => setModifiers({...modifiers, cameraAngle: v})} options={CAMERA_ANGLES} placeholder="Angle..." />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Shot Proximity</label>
                            <AutocompleteSelect value={modifiers.cameraProximity || ''} onChange={(v) => setModifiers({...modifiers, cameraProximity: v})} options={CAMERA_PROXIMITY} placeholder="Distance..." />
                        </div>
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Technical Settings</label>
                            <AutocompleteSelect value={modifiers.cameraSettings || ''} onChange={(v) => setModifiers({...modifiers, cameraSettings: v})} options={CAMERA_SETTINGS} placeholder="Technical..." />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Lighting Rig</label>
                            <AutocompleteSelect value={modifiers.lighting || ''} onChange={(v) => setModifiers({...modifiers, lighting: v})} options={LIGHTING_OPTIONS} placeholder="Lighting..." />
                        </div>
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Composition Layout</label>
                            <AutocompleteSelect value={modifiers.composition || ''} onChange={(v) => setModifiers({...modifiers, composition: v})} options={COMPOSITION_OPTIONS} placeholder="Layout..." />
                        </div>
                    </div>
                </div>
              );
          case 'motion':
              return (
                <div className="space-y-6 animate-fade-in">
                    <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest block">Kinetic Energy</label>
                    <div className="join w-full">
                        <button onClick={() => setModifiers({...modifiers, videoInputType: 't2v'})} className={`join-item btn btn-xs flex-1 rounded-none font-black text-[9px] ${modifiers.videoInputType === 't2v' ? 'btn-active' : ''}`}>TEXT-2-VID</button>
                        <button onClick={() => setModifiers({...modifiers, videoInputType: 'i2v'})} className={`join-item btn btn-xs flex-1 rounded-none font-black text-[9px] ${modifiers.videoInputType === 'i2v' ? 'btn-active' : ''}`}>IMG-2-VID</button>
                    </div>
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Motion Energy</label>
                        <AutocompleteSelect value={modifiers.motion || ''} onChange={(v) => setModifiers({...modifiers, motion: v})} options={MOTION_OPTIONS} placeholder="Motion..." />
                    </div>
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Camera Pathing</label>
                        <AutocompleteSelect value={modifiers.cameraMovement || ''} onChange={(v) => setModifiers({...modifiers, cameraMovement: v})} options={CAMERA_MOVEMENT_OPTIONS} placeholder="Cam-Path..." />
                    </div>
                </div>
              );
          case 'audio':
              return (
                  <div className="grid grid-cols-1 gap-6 animate-fade-in">
                       <div className="form-control">
                          <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Audio Category</label>
                          <AutocompleteSelect value={modifiers.audioType || ''} onChange={(v) => setModifiers({...modifiers, audioType: v})} options={AUDIO_TYPES} placeholder="Type..." />
                      </div>
                      <div className="form-control">
                          <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Voice Profile</label>
                          <AutocompleteSelect value={modifiers.voiceGender || ''} onChange={(v) => setModifiers({...modifiers, voiceGender: v})} options={VOICE_GENDERS} placeholder="Gender..." />
                      </div>
                      <div className="form-control">
                          <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Voice Tone</label>
                          <AutocompleteSelect value={modifiers.voiceTone || ''} onChange={(v) => setModifiers({...modifiers, voiceTone: v})} options={VOICE_TONES} placeholder="Tone..." />
                      </div>
                      <div className="form-control">
                          <div className="flex justify-between items-center mb-2">
                              <label className="text-[10px] font-black uppercase tracking-widest">Targeted Duration</label>
                              <span className="text-[10px] font-mono font-bold text-primary">{modifiers.audioDuration}s</span>
                          </div>
                          <input 
                              type="range" 
                              min="1" 
                              max="120" 
                              value={modifiers.audioDuration} 
                              onChange={e => setModifiers({...modifiers, audioDuration: e.target.value})} 
                              className="range range-xs range-primary" 
                          />
                      </div>
                      <div className="form-control">
                          <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Acoustic Environment</label>
                          <AutocompleteSelect value={modifiers.audioEnvironment || ''} onChange={(v) => setModifiers({...modifiers, audioEnvironment: v})} options={AUDIO_ENVIRONMENTS} placeholder="Environment..." />
                      </div>
                      <div className="form-control">
                          <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Audio Mood</label>
                          <AutocompleteSelect value={modifiers.audioMood || ''} onChange={(v) => setModifiers({...modifiers, audioMood: v})} options={AUDIO_MOODS} placeholder="Mood..." />
                      </div>
                  </div>
              );
          case 'platform':
              return (
                <div className="space-y-6 animate-fade-in">
                     {isMidjourney ? (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-control">
                                    <label className="text-[10px] font-black uppercase text-base-content/40 mb-2">Standard</label>
                                    <select value={modifiers.mjVersion} onChange={e => setModifiers({...modifiers, mjVersion: e.target.value, mjNiji: ""})} className="select select-bordered select-sm rounded-none font-bold w-full uppercase text-[10px] tracking-widest">
                                        {MIDJOURNEY_VERSIONS.map(v => <option key={v} value={v}>V {v}</option>)}
                                    </select>
                                </div>
                                <div className="form-control">
                                    <label className="text-[10px] font-black uppercase text-base-content/40 mb-2">Niji (Anime)</label>
                                    <select value={modifiers.mjNiji} onChange={e => setModifiers({...modifiers, mjNiji: e.target.value as any, mjVersion: ""})} className="select select-bordered select-sm rounded-none font-bold w-full uppercase text-[10px] tracking-widest">
                                        <option value="">OFF</option>
                                        {MIDJOURNEY_NIJI_VERSIONS.map(v => <option key={v} value={v}>Niji {v}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="form-control">
                                <label className="text-[10px] font-black uppercase text-base-content/40 mb-2">Aspect Ratio (--ar)</label>
                                <select value={modifiers.mjAspectRatio} onChange={e => setModifiers({...modifiers, mjAspectRatio: e.target.value})} className="select select-bordered select-sm rounded-none font-bold w-full">
                                    <option value="">Default (1:1)</option>
                                    {MIDJOURNEY_ASPECT_RATIOS.map(ar => <option key={ar} value={ar}>{ar}</option>)}
                                </select>
                            </div>
                            <div className="space-y-6">
                                <div className="form-control">
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest">Stylize (--s)</label>
                                        <span className="text-[10px] font-mono font-bold text-primary">{modifiers.mjStylize}</span>
                                    </div>
                                    <input type="range" min="0" max="1000" value={modifiers.mjStylize} onChange={e => setModifiers({...modifiers, mjStylize: e.target.value})} className="range range-xs range-primary" />
                                </div>
                                <div className="form-control">
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest">Chaos (--c)</label>
                                        <span className="text-[10px] font-mono font-bold text-primary">{modifiers.mjChaos}</span>
                                    </div>
                                    <input type="range" min="0" max="100" value={modifiers.mjChaos} onChange={e => setModifiers({...modifiers, mjChaos: e.target.value})} className="range range-xs range-primary" />
                                </div>
                                <div className="form-control">
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest">Weird (--weird)</label>
                                        <span className="text-[10px] font-mono font-bold text-primary">{modifiers.mjWeird}</span>
                                    </div>
                                    <input type="range" min="0" max="3000" value={modifiers.mjWeird} onChange={e => setModifiers({...modifiers, mjWeird: e.target.value})} className="range range-xs range-primary" />
                                </div>
                            </div>
                            <div className="form-control">
                                <label className="text-[10px] font-black uppercase text-base-content/40 mb-2">Negative Constraints (--no)</label>
                                <input type="text" value={modifiers.mjNo} onChange={e => setModifiers({...modifiers, mjNo: e.target.value})} className="input input-bordered input-sm rounded-none font-bold w-full" placeholder="objects to exclude..."/>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <label className="label cursor-pointer justify-start gap-4">
                                    <span className="text-[10px] font-black uppercase text-base-content/40">Seamless (--tile)</span>
                                    <input type="checkbox" checked={modifiers.mjTile} onChange={e => setModifiers({...modifiers, mjTile: e.target.checked})} className="checkbox checkbox-primary rounded-none checkbox-xs" />
                                </label>
                                <div className="form-control">
                                    <select value={modifiers.mjStyle} onChange={e => setModifiers({...modifiers, mjStyle: e.target.value as any})} className="select select-bordered select-xs rounded-none font-black uppercase tracking-widest">
                                        <option value="">Style: Auto</option>
                                        <option value="raw">Style: Raw</option>
                                    </select>
                                </div>
                            </div>
                        </>
                    ) : isGoogleProduct ? (
                        <>
                            <div className="space-y-4 h-full flex flex-col">
                                <label className="text-[10px] font-black uppercase text-primary/60 tracking-[0.2em] block">Reference Materials</label>
                                <div className="grid grid-cols-2 grid-rows-2 gap-2 flex-grow min-h-0">
                                    {referenceImages.map((img, idx) => (
                                        <ReferenceSlot 
                                            key={idx} 
                                            url={img} 
                                            index={idx}
                                            onUpload={(b64) => {
                                                const next = [...referenceImages];
                                                next[idx] = b64;
                                                setReferenceImages(next);
                                            }}
                                            onRemove={() => {
                                                const next = [...referenceImages];
                                                next[idx] = null;
                                                setReferenceImages(next);
                                            }}
                                        />
                                    ))}
                                </div>
                                <p className="text-[8px] font-bold text-base-content/30 uppercase leading-relaxed mt-auto">Grounding context for consistent subject or style preservation.</p>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-20 opacity-20">
                            <Cog6ToothIcon className="w-12 h-12 mx-auto mb-4"/>
                            <p className="text-[10px] font-black uppercase tracking-widest text-center">No platform extensions available</p>
                        </div>
                    )}
                </div>
              );
          default: return null;
      }
  };

  const renderRefine = () => (
    <div className="flex flex-col h-full overflow-hidden bg-base-100">
        {renderTabsHeader('refine')}

        <div className="flex-grow grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
            {/* Left Panel: Configuration */}
            <div className="lg:col-span-4 bg-base-100 flex flex-col min-h-0 border-r border-base-300">
                <div className="border-b border-base-300 bg-base-200/5 h-16 flex-shrink-0">
                     <div className="flex w-full h-full overflow-x-auto custom-scrollbar no-scrollbar">
                        <button onClick={() => setActiveRefineSubTab('basic')} className={`flex-1 h-full rounded-none font-black text-xs tracking-widest transition-colors border-r border-base-300 last:border-r-0 ${activeRefineSubTab === 'basic' ? 'bg-primary text-primary-content' : 'hover:bg-base-200 text-base-content/40'}`}>BASIC</button>
                        {mediaMode !== 'audio' && (
                            <>
                                <button onClick={() => setActiveRefineSubTab('styling')} className={`flex-1 h-full rounded-none font-black text-xs tracking-widest transition-colors border-r border-base-300 last:border-r-0 ${activeRefineSubTab === 'styling' ? 'bg-primary text-primary-content' : 'hover:bg-base-200 text-base-content/40'}`}>STYLING</button>
                                <button onClick={() => setActiveRefineSubTab('photography')} className={`flex-1 h-full rounded-none font-black text-xs tracking-widest transition-colors border-r border-base-300 last:border-r-0 ${activeRefineSubTab === 'photography' ? 'bg-primary text-primary-content' : 'hover:bg-base-200 text-base-content/40'}`}>PHOTOGRAPHY</button>
                            </>
                        )}
                        {mediaMode === 'video' && <button onClick={() => setActiveRefineSubTab('motion')} className={`flex-1 h-full rounded-none font-black text-xs tracking-widest transition-colors border-r border-base-300 last:border-r-0 ${activeRefineSubTab === 'motion' ? 'bg-primary text-primary-content' : 'hover:bg-base-200 text-base-content/40'}`}>MOTION</button>}
                        {mediaMode === 'audio' && <button onClick={() => setActiveRefineSubTab('audio')} className={`flex-1 h-full rounded-none font-black text-xs tracking-widest transition-colors border-r border-base-300 last:border-r-0 ${activeRefineSubTab === 'audio' ? 'bg-primary text-primary-content' : 'hover:bg-base-200 text-base-content/40'}`}>AUDIO</button>}
                        {hasPlatformSettings && mediaMode !== 'audio' && (
                            <button onClick={() => setActiveRefineSubTab('platform')} className={`flex-1 h-full rounded-none font-black text-xs tracking-widest transition-colors border-r border-base-300 last:border-r-0 ${activeRefineSubTab === 'platform' ? 'bg-primary text-primary-content' : 'hover:bg-base-200 text-base-content/40'}`}>{targetAIModel.toUpperCase().split(' ')[0]}</button>
                        )}
                     </div>
                </div>

                <div className="flex-grow flex flex-col overflow-hidden">
                    <div className="p-6 overflow-y-auto custom-scrollbar flex-grow flex flex-col h-full">
                         {renderRefineSubContent()}
                    </div>
                </div>

                <div className="border-t border-base-300 bg-base-200/20 flex-shrink-0 p-0 overflow-hidden">
                    <div className="flex w-full">
                        <button onClick={handleResetRefiner} className="btn flex-1 rounded-none border-r border-base-300 font-black text-[10px] tracking-widest hover:bg-base-300 transition-colors uppercase">RESET</button>
                        <button onClick={handleEnhance} disabled={isLoadingRefine || !refineText.trim()} className={`btn flex-1 rounded-none font-black text-[10px] tracking-widest transition-colors shadow-lg border-r border-base-300 last:border-r-0 ${isGoogleProduct && mediaMode !== 'audio' ? 'btn-ghost' : 'btn-primary text-primary-content'}`}>
                            {isLoadingRefine && !loadingMsg ? 'EXTRACTING...' : 'IMPROVE'}
                        </button>
                        {isGoogleProduct && mediaMode !== 'audio' && (
                            <button onClick={handleDirectGenerate} disabled={isLoadingRefine || !refineText.trim()} className="btn flex-1 btn-primary text-primary-content rounded-none font-black text-[10px] tracking-widest shadow-lg transition-colors hover:brightness-110 uppercase">
                                {isLoadingRefine && loadingMsg ? 'STREAMING...' : 'GENERATE'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Center Panel: Results */}
            <div className="lg:col-span-5 bg-base-100 flex flex-col min-h-0 overflow-hidden border-r border-base-300">
                <div className="px-6 h-16 border-b border-base-300 bg-base-200/10 flex justify-between items-center">
                    <h2 className="text-xs font-black uppercase tracking-[0.4em] text-primary flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div> Improved Results
                    </h2>
                </div>
                <div className="flex-grow overflow-y-auto floating-scrollbar bg-base-200/5 p-0">
                    {isLoadingRefine ? (
                        <div className="flex flex-col items-center justify-center py-32 text-center space-y-8">
                            <LoadingSpinner />
                            {loadingMsg && <p className="text-[11px] font-black uppercase tracking-[0.4em] text-primary animate-pulse">{loadingMsg}</p>}
                        </div>
                    ) : errorRefine ? <div className="alert alert-error rounded-none border-2 m-6"><span className="uppercase text-xs font-bold">{errorRefine.message}</span></div> :
                    directMediaResult ? (
                        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in p-10 pb-20">
                            <div className="relative group bg-black shadow-2xl border border-base-300">
                                {directMediaResult.type === 'video' ? (
                                    <video src={directMediaResult.url} controls autoPlay loop className="w-full h-auto aspect-video object-contain" />
                                ) : (
                                    <img src={directMediaResult.url} alt="Result" className="w-full h-auto aspect-square object-contain" />
                                )}
                            </div>
                            <div className="flex justify-between items-center bg-base-100 p-4 border border-base-300">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-primary/60">{directMediaResult.target} Render</span>
                                    <span className="text-[8px] font-mono text-base-content/30 mt-1 uppercase">ID: {Date.now()}</span>
                                </div>
                                <button onClick={() => setDirectMediaResult(null)} className="btn btn-xs btn-ghost uppercase tracking-widest font-black">Close Archive</button>
                            </div>
                        </div>
                    ) : resultsRefine ? (
                        <div className="flex flex-col animate-fade-in w-full pb-20">
                            {resultsRefine.suggestions.map((suggestion, index) => ( 
                                <div key={index} className="border-b border-base-300 last:border-b-0 w-full bg-base-100">
                                    <SuggestionItem 
                                        suggestionText={suggestion} 
                                        targetAI={targetAIModel}
                                        onSave={handleSaveSuggestion}
                                        onClip={handleClipSuggestion}
                                        onRefine={handleSendToRefine}
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center py-32 opacity-10">
                            {mediaMode === 'image' ? <PhotoIcon className="w-32 h-32 mb-8" /> : mediaMode === 'video' ? <FilmIcon className="w-32 h-32 mb-8" /> : <RefreshIcon className="w-32 h-32 mb-8" />}
                            <p className="text-2xl font-black uppercase tracking-[0.2em]">Awaiting Generation</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Right Panel: Active Construction */}
            <aside className="lg:col-span-3 bg-base-100 flex flex-col min-h-0 overflow-hidden">
                <header className="px-6 h-16 border-b border-base-300 bg-base-200/10 flex items-center justify-between">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Active Construction</h3>
                    <span className="badge badge-primary badge-xs rounded-none font-black text-[9px]">{activeConstructionItems.length}</span>
                </header>
                <div className="flex-grow p-4 overflow-y-auto floating-scrollbar bg-base-200/5">
                    {activeConstructionItems.length > 0 ? (
                        <div className="grid grid-cols-1 gap-2">
                            {activeConstructionItems.map((item) => (
                                <PropertyCard 
                                    key={item.key}
                                    label={item.label}
                                    value={item.value}
                                    active={activeRefineSubTab === item.tab}
                                    onClick={() => setActiveRefineSubTab(item.tab)}
                                    onClear={() => {
                                        if (item.key === 'refineText') setRefineText('');
                                        else if (item.key === 'constantModifier') setConstantModifier('');
                                        else setModifiers(prev => ({ ...prev, [item.key]: '' }));
                                    }}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center opacity-10 p-6">
                            <ArchiveIcon className="w-12 h-12 mb-4" />
                            <p className="text-xs font-black uppercase tracking-widest">No active modifiers selected</p>
                        </div>
                    )}
                </div>
            </aside>
        </div>
    </div>
  );

  return (
      <div className="h-full bg-base-100">
          {activeView === 'refine' && renderRefine()}
          {activeView === 'composer' && (
              <div className="flex flex-col h-full">
                  {renderTabsHeader('composer')}
                  <PromptCrafter 
                      onSaveToLibrary={handleSaveSuggestion}
                      onSendToEnhancer={handleSendToRefine}
                      promptToInsert={composerPromptToInsert}
                      header={null}
                  />
              </div>
          )}
          {activeView === 'abstract' && (
              <div className="flex flex-col h-full">
                  {renderTabsHeader('abstract')}
                  <ImageAbstractor 
                      onSaveSuggestion={handleSaveSuggestion}
                      header={null}
                      onRefine={handleSendToRefine}
                      onClip={handleClipSuggestion}
                  />
              </div>
          )}
          {activeView === 'reader' && (
              <div className="flex flex-col h-full">
                  {renderTabsHeader('reader')}
                  <MetadataReader 
                      onSendToRefiner={handleSendToRefine}
                      onClipIdea={handleClipSuggestion}
                      onSaveToLibrary={handleSaveSuggestion}
                      header={null}
                  />
              </div>
          )}
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
