
// PromptsPage.tsx - Core component for prompt management
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { audioService } from '../services/audioService';
import { useSettings } from '../contexts/SettingsContext';
import { enhancePromptStream, buildMidjourneyParams, generateWithImagen, generateWithNanoBanana, generateWithVeo, cleanLLMResponse, dissectPrompt, generateConstructorPreset } from '../services/llmService';
import { loadPromptCategories, addSavedPrompt, loadSavedPrompts } from '../utils/promptStorage';
import { loadArtStyles } from '../utils/artstyleStorage';
import { loadArtists } from '../utils/artistStorage';
import { fileToBase64 } from '../utils/fileUtils';
import { motion, AnimatePresence } from 'framer-motion';
import { TerminalText, PanelLine, ScanLine, panelVariants, pageHeaderVariants, pageBodyVariants, pageFooterVariants, reverseTextVariants, sectionWipeVariants, contentVariants } from './AnimatedPanels';
import { refinerPresetService, type RefinerPreset } from '../services/refinerPresetService';

import { useBusy } from '../contexts/BusyContext';
import type { AppError, SavedPrompt, PromptCategory, EnhancementResult, PromptModifiers, CheatsheetCategory, Idea } from '../types';
import {
    FILM_TYPES,
    GENERAL_ASPECT_RATIOS,
    PROMPT_DETAIL_LEVELS,
    CAMERA_ANGLES,
    CAMERA_PROXIMITY,
    LIGHTING_OPTIONS,
    COMPOSITION_OPTIONS,
    CAMERA_TYPES,
    CAMERA_MODELS_BY_TYPE,
    ALL_PROFESSIONAL_CAMERA_MODELS,
    CAMERA_SETTINGS,
    CAMERA_EFFECTS,
    SPECIALTY_LENS_EFFECTS,
    LENS_TYPES,
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
    AUDIO_MOODS,
    FACIAL_EXPRESSIONS,
    HAIR_STYLES,
    EYE_COLORS,
    SKIN_TEXTURES,
    CLOTHING_STYLES
} from '../constants/modifiers';
import { TARGET_IMAGE_AI_MODELS, TARGET_VIDEO_AI_MODELS, TARGET_AUDIO_AI_MODELS } from '../constants/models';

import PromptEditorModal from './PromptEditorModal';
import PromptCrafter from './PromptCrafter';
import { MediaAnalyzer } from './MediaAnalyzer';
import { PromptAnalyzer } from './PromptAnalyzer';
import BlobLoader from './BlobLoader';
import AutocompleteSelect from './AutocompleteSelect';
import { SparklesIcon, UploadIcon, Cog6ToothIcon, CloseIcon, DownloadIcon } from './icons';
import ConfirmationModal from './ConfirmationModal';
import JSONBreakdownModal from './JSONBreakdownModal';

// --- Types ---
type MediaMode = 'image' | 'video' | 'audio';
type RefineSubTab = 'basic' | 'styling' | 'photography' | 'motion' | 'audio' | 'platform';

interface PromptsPageProps {
    initialState?: { prompt?: string, artStyle?: string, artist?: string, view?: 'enhancer' | 'composer' | 'create', id?: string } | null;
    forcedView?: 'refine' | 'composer' | 'analyzer' | 'prompt_analyzer';
    onStateHandled: () => void;
    showGlobalFeedback: (message: string, isError?: boolean) => void;
    onClipIdea: (idea: Idea) => void;
    isExiting?: boolean;
}

const PropertyCard: React.FC<{
    label: string;
    value: string;
    onClear: () => void;
    onClick: () => void;
    active: boolean;
}> = ({ label, value, onClear, onClick, active }) => (
    <div
        onClick={onClick}
        className={`group relative p-4 transition-all duration-300 cursor-pointer select-none flex flex-col justify-center min-h-[5rem] last:border-b-0 border-b border-base-content/5 ${active ? 'bg-primary/5' : 'hover:bg-base-content/5'}`}
    >
        <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className={`text-xs font-black uppercase tracking-[0.2em] ${active ? 'text-primary' : 'text-base-content/30'}`}>{label}</span>
            {value && (
                <button
                    onClick={(e) => { e.stopPropagation(); onClear(); }}
                    className={`btn btn-ghost btn-xs btn-square h-5 w-5 min-h-0 opacity-0 group-hover:opacity-100 transition-opacity ${active ? 'text-primary' : 'text-base-content/20 hover:text-error'}`}
                >
                    <CloseIcon className="w-4 h-4" />
                </button>
            )}
        </div>
        <span className={`text-base font-bold font-nunito leading-tight break-words first-letter:uppercase tracking-tight ${active ? 'text-primary' : 'text-base-content'}`}>
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
        <div className="aspect-square bg-transparent relative group overflow-hidden w-full h-full">
            {url ? (
                <>
                    <img src={url} className="w-full h-full object-cover" alt={`Ref ${index}`} />
                    <button onClick={onRemove} className="btn btn-xs btn-square btn-error absolute top-1 right-1 opacity-0 group-hover:opacity-100">✕</button>
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

const DEFAULT_MODIFIERS: PromptModifiers = {
    aspectRatio: "", videoInputType: "t2v", artStyle: "", artist: "", photographyStyle: "",
    aestheticLook: "", digitalAesthetic: "", cameraType: "", cameraModel: "", cameraAngle: "", cameraProximity: "",
    cameraSettings: "", cameraEffect: "", specialtyLens: "", lensType: "", filmType: "", filmStock: "",
    lighting: "", composition: "", motion: "", cameraMovement: "", zImageStyle: "", facialExpression: "",
    hairStyle: "", eyeColor: "", skinTexture: "", clothing: "",
    audioType: "", voiceGender: "", voiceTone: "", audioEnvironment: "", audioMood: "", audioDuration: "10",
    mjAspectRatio: "", mjChaos: "0", mjStylize: "100", mjVersion: MIDJOURNEY_VERSIONS[0],
    mjNiji: "", mjStyle: "", mjTile: false, mjWeird: "0", mjNo: "", mjQuality: "",
    mjSeed: "", mjStop: "", mjRepeat: ""
};

const PromptsPage: React.FC<PromptsPageProps> = ({
    initialState,
    forcedView,
    onStateHandled,
    showGlobalFeedback,
    onClipIdea,
    isExiting = false,
}) => {
    const { settings } = useSettings();
    const { setIsBusy } = useBusy();
    const [activeView, setActiveView] = useState<'refine' | 'composer' | 'analyzer' | 'prompt_analyzer'>(forcedView || 'composer');

    useEffect(() => {
        if (forcedView) {
            setActiveView(forcedView);
        }
    }, [forcedView]);
    const [isLocalExiting, setIsLocalExiting] = useState(false);

    const handleSwitchView = (newView: 'refine' | 'composer' | 'analyzer' | 'prompt_analyzer') => {
        if (newView === activeView) return;
        audioService.playClick();
        setIsLocalExiting(true);
        setTimeout(() => {
            setActiveView(newView);
            setIsLocalExiting(false);
        }, 800);
    };



    // --- Refiner State ---
    const [mediaMode, setMediaMode] = useState<MediaMode>('image');
    const [refineText, setRefineText] = useState<string>('');
    const [constantModifier, setConstantModifier] = useState<string>('');
    const [promptLength, setPromptLength] = useState<string>(PROMPT_DETAIL_LEVELS.MEDIUM);
    const [targetAIModel, setTargetAIModel] = useState<string>(TARGET_IMAGE_AI_MODELS[0]);
    const [referenceImages, setReferenceImages] = useState<(string | null)[]>([null, null, null, null]);

    const [modifiers, setModifiers] = useState<PromptModifiers>(DEFAULT_MODIFIERS);

    // --- Preset Management State ---
    const [presets, setPresets] = useState<RefinerPreset[]>([]);
    const [selectedPreset, setSelectedPreset] = useState<RefinerPreset | null>(null);
    const [isSavePresetModalOpen, setIsSavePresetModalOpen] = useState(false);
    const [newPresetName, setNewPresetName] = useState('');
    const [isSavingPreset, setIsSavingPreset] = useState(false);
    const [presetToDelete, setPresetToDelete] = useState<RefinerPreset | null>(null);
    const [isDeletePresetModalOpen, setIsDeletePresetModalOpen] = useState(false);

    const [artStyles, setArtStyles] = useState<CheatsheetCategory[]>([]);
    const [artists, setArtists] = useState<CheatsheetCategory[]>([]);
    const [isLoadingRefine, setIsLoadingRefine] = useState(false);
    const [errorRefine, setErrorRefine] = useState<AppError | null>(null);
    const [resultsRefine, setResultsRefine] = useState<EnhancementResult | null>(null);
    const [directMediaResult, setDirectMediaResult] = useState<{ url: string, type: 'image' | 'video', target: string, prompt: string } | null>(null);
    const [activeRefineSubTab, setActiveRefineSubTab] = useState<RefineSubTab>('basic');
    const refineScrollerRef = useRef<HTMLDivElement>(null);
    const neuralOutputScrollerRef = useRef<HTMLDivElement>(null);
    const activeConstructionScrollerRef = useRef<HTMLDivElement>(null);
    const [, setLoadingMsg] = useState<string>('');

    const [composerPromptToInsert, setComposerPromptToInsert] = useState<{ content: string, id: string } | null>(null);
    const [isSaveSuggestionModalOpen, setIsSaveSuggestionModalOpen] = useState(false);
    const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);
    const [jsonCopied, setJsonCopied] = useState(false);
    const [suggestionToSave, setSuggestionToSave] = useState<Partial<SavedPrompt> | null>(null);
    const [promptCategories, setPromptCategories] = useState<PromptCategory[]>([]);
    const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);

    useEffect(() => {
        const loadInitialData = async () => {
            const cats = await loadPromptCategories();
            setPromptCategories(cats);
            const prompts = await loadSavedPrompts();
            setSavedPrompts(prompts);
        };
        loadInitialData();
    }, []);
    const isGoogleProduct = useMemo(() => {
        const target = targetAIModel.toLowerCase();
        return target.includes('imagen') || target.includes('nano banana') || target.includes('veo');
    }, [targetAIModel]);

    const isMidjourney = useMemo(() => targetAIModel.toLowerCase().includes('midjourney'), [targetAIModel]);
    const isZImage = useMemo(() => targetAIModel === 'Z-Image', [targetAIModel]);

    // Tabs visibility logic
    const tabs = useMemo(() => {
        const list: { id: RefineSubTab, label: string }[] = [{ id: 'basic', label: 'BASIC' }];

        if (mediaMode !== 'audio') {
            list.push({ id: 'styling', label: 'STYLING' });
            list.push({ id: 'photography', label: 'PHOTO' });
        }

        if (mediaMode === 'video') {
            list.push({ id: 'motion', label: 'MOTION' });
        }

        if (mediaMode === 'audio') {
            list.push({ id: 'audio', label: 'AUDIO' });
        }

        if (isMidjourney || isGoogleProduct) {
            let platformLabel = 'PLATFORM';
            const target = targetAIModel.toLowerCase();
            if (target.includes('midjourney')) platformLabel = 'MIDJOURNEY';
            else if (target.includes('imagen')) platformLabel = 'IMAGEN';
            else if (target.includes('veo')) platformLabel = 'VEO';
            else if (target.includes('nano banana')) platformLabel = 'BANANA';

            list.push({ id: 'platform', label: platformLabel });
        }

        return list;
    }, [mediaMode, isMidjourney, isGoogleProduct, targetAIModel]);

    // Load Presets
    const loadPresets = useCallback(async () => {
        try {
            const loaded = await refinerPresetService.loadPresets();
            setPresets(loaded);
        } catch (e) {
            console.error("Failed to load presets", e);
        }
    }, []);

    useEffect(() => {
        loadPresets();
    }, [loadPresets]);

    // Fix selection bug: Reset model default ONLY when media mode actually changes
    useEffect(() => {
        if (mediaMode === 'image') {
            setTargetAIModel(TARGET_IMAGE_AI_MODELS[0]);
        } else if (mediaMode === 'video') {
            setTargetAIModel(TARGET_VIDEO_AI_MODELS[0]);
        } else if (mediaMode === 'audio') {
            setTargetAIModel(TARGET_AUDIO_AI_MODELS[0]);
        }
    }, [mediaMode]);

    // Handle active tab fallback if it disappears from visibility
    useEffect(() => {
        if (!tabs.some(t => t.id === activeRefineSubTab)) {
            setActiveRefineSubTab('basic');
        }
    }, [tabs, activeRefineSubTab]);

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
        setIsBusy(true);
        setIsLoadingRefine(true);
        setErrorRefine(null);
        setResultsRefine(null);
        setDirectMediaResult(null);
        let fullText = '';

        try {
            const activeRefImages = referenceImages.filter((img): img is string => img !== null);
            const catalog = buildModifierCatalog();
            const stream = enhancePromptStream(refineText, constantModifier, promptLength, targetAIModel, modifiers, settings, activeRefImages, catalog);
            for await (const chunk of stream) fullText += chunk;

            let refinedPrompt = fullText;
            let breakdown: any = null;

            if (fullText.includes('---PROMPT_BREAKDOWN---')) {
                const parts = fullText.split('---PROMPT_BREAKDOWN---');
                refinedPrompt = parts[0].trim();
                const jsonStr = parts[1].trim();
                try {
                    // Clean up any potential markdown code blocks around the JSON
                    breakdown = JSON.parse(jsonStr.replace(/```json\n?|\n?```/g, '').trim());
                } catch (e) {
                    console.error('Failed to parse breakdown:', e);
                }
            }

            const cleanedText = cleanLLMResponse(refinedPrompt);
            const mjParams = isMidjourney ? buildMidjourneyParams(modifiers) : '';
            const prompt = isMidjourney ? `${cleanedText} ${mjParams}`.trim() : cleanedText;

            setResultsRefine({
                suggestions: [prompt],
                breakdown
            });
        } catch (err: any) {
            setErrorRefine({ message: err.message });
        } finally {
            setIsLoadingRefine(false);
            setIsBusy(false);
        }
    }, [refineText, constantModifier, promptLength, targetAIModel, modifiers, settings, isMidjourney, referenceImages, mediaMode]);

    const handleDirectGenerate = async () => {
        setIsBusy(true);
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
            setIsBusy(false);
        }
    };

    const handleResetRefiner = () => {
        setRefineText('');
        setConstantModifier('');
        setReferenceImages([null, null, null, null]);
        setModifiers({
            aspectRatio: "", videoInputType: "t2v", artStyle: "", artist: "", photographyStyle: "",
            aestheticLook: "", digitalAesthetic: "", cameraType: "", cameraModel: "", cameraAngle: "", cameraProximity: "",
            cameraSettings: "", cameraEffect: "", specialtyLens: "", lensType: "", filmType: "", filmStock: "",
            lighting: "", composition: "", motion: "", cameraMovement: "", zImageStyle: "", facialExpression: "",
            audioType: "", voiceGender: "", voiceTone: "", audioEnvironment: "", audioMood: "", audioDuration: "10",
            mjAspectRatio: "", mjChaos: "0", mjStylize: "100", mjVersion: MIDJOURNEY_VERSIONS[0],
            mjNiji: "", mjStyle: "", mjTile: false, mjWeird: "0", mjNo: "", mjQuality: "",
            mjSeed: "", mjStop: "", mjRepeat: ""
        });
        setResultsRefine(null);
        setDirectMediaResult(null);
        setErrorRefine(null);
        setSelectedPreset(null);
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

    const buildModifierCatalog = useCallback(() => {
        const catalog: string[] = [];

        if (artStyles.length > 0) catalog.push(`artStyle: ${artStyles.flatMap(c => c.items.map(i => i.name)).join(', ')}`);
        if (artists.length > 0) catalog.push(`artist: ${artists.flatMap(c => c.items.map(i => i.name)).join(', ')}`);

        catalog.push(`photographyStyle: ${PHOTOGRAPHY_STYLES.join(', ')}`);
        catalog.push(`aestheticLook: ${AESTHETIC_LOOKS.map(l => l.name).join(', ')}`);
        catalog.push(`digitalAesthetic: ${DIGITAL_AESTHETICS.map(a => a.name).join(', ')}`);
        catalog.push(`aspectRatio: ${GENERAL_ASPECT_RATIOS.join(', ')}`);
        catalog.push(`cameraType: ${CAMERA_TYPES.join(', ')}`);
        catalog.push(`cameraAngle: ${CAMERA_ANGLES.join(', ')}`);
        catalog.push(`cameraProximity: ${CAMERA_PROXIMITY.join(', ')}`);
        catalog.push(`cameraSettings: ${CAMERA_SETTINGS.join(', ')}`);
        catalog.push(`cameraEffect: ${CAMERA_EFFECTS.join(', ')}`);
        catalog.push(`specialtyLens: ${SPECIALTY_LENS_EFFECTS.map(l => l.name).join(', ')}`);
        catalog.push(`lensType: ${LENS_TYPES.join(', ')}`);
        catalog.push(`filmType: ${FILM_TYPES.join(', ')}`);
        catalog.push(`filmStock: ${ANALOG_FILM_STOCKS.join(', ')}`);
        catalog.push(`lighting: ${LIGHTING_OPTIONS.join(', ')}`);
        catalog.push(`composition: ${COMPOSITION_OPTIONS.join(', ')}`);
        catalog.push(`facialExpression: ${FACIAL_EXPRESSIONS.join(', ')}`);
        catalog.push(`hairStyle: ${HAIR_STYLES.join(', ')}`);
        catalog.push(`eyeColor: ${EYE_COLORS.join(', ')}`);
        catalog.push(`skinTexture: ${SKIN_TEXTURES.join(', ')}`);
        catalog.push(`clothing: ${CLOTHING_STYLES.join(', ')}`);
        catalog.push(`motion: ${MOTION_OPTIONS.map(o => o.name).join(', ')}`);
        catalog.push(`cameraMovement: ${CAMERA_MOVEMENT_OPTIONS.map(o => o.name).join(', ')}`);
        catalog.push(`mjVersion: ${MIDJOURNEY_VERSIONS.join(', ')}`);
        catalog.push(`mjNiji: ${MIDJOURNEY_NIJI_VERSIONS.join(', ')}`);
        catalog.push(`mjAspectRatio: ${MIDJOURNEY_ASPECT_RATIOS.join(', ')}`);
        catalog.push(`zImageStyle: ${Z_IMAGE_STYLES.join(', ')}`);

        return catalog.join('\\n');
    }, [artStyles, artists]);

    const handleCopySuggestionText = useCallback((suggestionText: string) => {
        if (typeof window !== 'undefined' && (window as any).navigator?.clipboard) {
            (window as any).navigator.clipboard.writeText(suggestionText)
                .then(() => {
                    showGlobalFeedback('Token copied to buffer.');
                })
                .catch((err: any) => {
                    console.error('Failed to copy text: ', err);
                });
        }
    }, [showGlobalFeedback]);

    const jsonData = useMemo(() => {
        if (!resultsRefine) return null;
        const baseBreakdown = resultsRefine.breakdown || {
            subject: "Analyzed Subject",
            environment: "Analytical interpretation",
            lighting: "Detected context",
            composition: "Inferred framing"
        };

        return {
            ...baseBreakdown,
            targetAI: targetAIModel,
            exportedAt: new Date().toISOString(),
            generator: "Kollektiv Toolbox"
        };
    }, [resultsRefine, targetAIModel]);

    const handleCopyJson = useCallback(() => {
        if (!jsonData) return;
        if (typeof window !== 'undefined' && (window as any).navigator?.clipboard) {
            (window as any).navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2))
                .then(() => {
                    setJsonCopied(true);
                    setTimeout(() => setJsonCopied(false), 2000);
                    showGlobalFeedback('JSON copied.');
                })
                .catch((err: any) => {
                    console.error('Failed to copy JSON: ', err);
                });
        }
    }, [jsonData, showGlobalFeedback]);

    const handleDownloadJson = useCallback(() => {
        if (!jsonData) return;
        const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `breakdown_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showGlobalFeedback('Breakdown exported.');
    }, [jsonData, showGlobalFeedback]);

    const handleSaveAsPreset = async (suggestionText: string) => {
        showGlobalFeedback('Analyzing for Constructor...');
        setIsBusy(true);
        try {
            const catalog = buildModifierCatalog();
            const { prompt, modifiers, constantModifier } = await dissectPrompt(suggestionText, settings, catalog, targetAIModel);
            const flatComponents: Record<string, string> = { prompt, ...modifiers };
            if (constantModifier) flatComponents.constantModifier = constantModifier;

            const result = await generateConstructorPreset(flatComponents, settings, catalog);

            // Set as active in Refiner
            setModifiers({ ...DEFAULT_MODIFIERS, ...result.modifiers });
            setRefineText(result.prompt);
            if (result.constantModifier) {
                setConstantModifier(result.constantModifier);
            }

            // Open save modal
            setNewPresetName(`Constructor: ${suggestionText.substring(0, 20)}...`);
            setIsSavePresetModalOpen(true);

            showGlobalFeedback('Mapped to Refiner.');
        } catch (e) {
            console.error('Save as Preset failed:', e);
            showGlobalFeedback('Analysis failed.', true);
        } finally {
            setIsBusy(false);
        }
    };

    const handleClipSuggestion = useCallback((suggestionText: string, title?: string, lens: string = 'Refined Formula', source: string = 'Refiner') => {
        onClipIdea({
            id: `clipped-${Date.now()}`,
            lens,
            title: title || `Refined Token`,
            prompt: suggestionText,
            source
        });
    }, [onClipIdea]);

    const handlePasteRefineText = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                setRefineText(prev => prev ? `${prev} ${text}` : text);
            }
        } catch (err) {
            showGlobalFeedback('Clipboard access denied.', true);
        }
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
            facialExpression: { label: 'Facial Expression', tab: 'styling' },
            hairStyle: { label: 'Hair Style', tab: 'styling' },
            eyeColor: { label: 'Eye Color', tab: 'styling' },
            skinTexture: { label: 'Skin Texture', tab: 'styling' },
            clothing: { label: 'Clothing', tab: 'styling' },
            zImageStyle: { label: 'Z-Image', tab: 'styling' },
            aspectRatio: { label: 'Aspect Ratio', tab: 'photography' },
            cameraType: { label: 'Camera Body', tab: 'photography' },
            cameraModel: { label: 'Camera Model', tab: 'photography' },
            lensType: { label: 'Lens Type', tab: 'photography' },
            specialtyLens: { label: 'Specialty Optics', tab: 'photography' },
            filmStock: { label: 'Film Stock', tab: 'photography' },
            filmType: { label: 'Medium Format', tab: 'photography' },
            cameraAngle: { label: 'Angle', tab: 'photography' },
            cameraProximity: { label: 'Distance', tab: 'photography' },
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
            creativity: { label: 'Creativity', tab: 'basic' },
        };

        Object.entries(modifiers).forEach(([key, val]) => {
            if (val && defs[key]) {
                if (key === 'mjStylize' && val === '100') return;
                if (key === 'mjChaos' && val === '0') return;
                if (key === 'mjWeird' && val === '0') return;
                if (key === 'mjVersion' && val === MIDJOURNEY_VERSIONS[0]) return;
                if (key === 'audioDuration' && val === '10') return;
                if (key === 'creativity' && val === 70) return;

                const tab = defs[key].tab;
                if (mediaMode === 'audio' && ['styling', 'photography', 'motion', 'platform'].includes(tab)) return;
                if (mediaMode !== 'audio' && tab === 'audio') return;

                list.push({ label: defs[key].label, value: String(val), tab: defs[key].tab, key });
            }
        });

        return list;
    }, [modifiers, refineText, constantModifier, mediaMode]);

    const renderRefineSubContent = () => {
        switch (activeRefineSubTab) {
            case 'basic':
                return (
                    <div className="flex flex-col h-full space-y-6 overflow-hidden">
                        <div className="form-control flex-grow flex flex-col min-h-[120px]">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-[10px] font-normal text-[12px] font-sf-mono uppercase tracking-widest text-base-content/40">Prompt Idea</label>
                                <div className="flex gap-2">
                                    <button onClick={handlePasteRefineText} className="form-btn h-6 px-2 opacity-20 hover:opacity-100 uppercase tracking-widest">Paste</button>
                                    <button onClick={() => setRefineText('')} className="form-btn h-6 px-2 opacity-20 hover:opacity-100 uppercase tracking-widest">Clear</button>
                                </div>
                            </div>
                            <textarea value={refineText} onChange={(e) => setRefineText((e.currentTarget as any).value)} className="form-textarea w-full flex-grow resize-none font-medium leading-relaxed bg-transparent" placeholder="Enter core concept..."></textarea>
                        </div>
                        <div className="form-control">
                            <label className="text-[10px] font-normal text-[12px] font-sf-mono uppercase tracking-widest text-base-content/40 mb-2">Constant Modifiers</label>
                            <input type="text" value={constantModifier} onChange={(e) => setConstantModifier((e.currentTarget as any).value)} className="form-input w-full" placeholder="Tokens the AI must include..." />
                        </div>
                        <div className="form-control">
                            <label className="text-[10px] font-normal text-[12px] font-sf-mono uppercase tracking-widest text-base-content/40 mb-2">Media Output</label>
                            <div className="form-tab-group">
                                <button onClick={() => { audioService.playClick(); setMediaMode('image'); }} className={`form-tab-item ${mediaMode === 'image' ? 'active' : ''}`}>IMAGE</button>
                                <button onClick={() => { audioService.playClick(); setMediaMode('video'); }} className={`form-tab-item ${mediaMode === 'video' ? 'active' : ''}`}>VIDEO</button>
                                <button onClick={() => { audioService.playClick(); setMediaMode('audio'); }} className={`form-tab-item ${mediaMode === 'audio' ? 'active' : ''}`}>AUDIO</button>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="form-control">
                                <label className="text-[10px] font-normal text-[12px] font-sf-mono uppercase tracking-widest text-base-content/40 mb-2">Neural Engine</label>
                                <select value={targetAIModel} onChange={(e) => setTargetAIModel((e.currentTarget as any).value)} className="form-select w-full">
                                    {(mediaMode === 'image' ? TARGET_IMAGE_AI_MODELS : mediaMode === 'video' ? TARGET_VIDEO_AI_MODELS : TARGET_AUDIO_AI_MODELS).map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                            <div className="form-control">
                                <label className="text-[10px] font-normal text-[12px] font-sf-mono uppercase tracking-widest text-base-content/40 mb-2">Complexity</label>
                                <select value={promptLength} onChange={(e) => setPromptLength((e.currentTarget as any).value)} className="form-select w-full">
                                    {Object.entries(PROMPT_DETAIL_LEVELS).map(([k, v]) => <option key={k} value={v}>{v}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="form-control">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-[10px] font-normal text-[12px] font-sf-mono uppercase tracking-widest text-base-content/40">Refiner Creativity / Uniqueness</label>
                                <span className="text-[10px] font-mono font-bold text-primary">{modifiers.creativity ?? 70}%</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={modifiers.creativity ?? 70}
                                onChange={e => setModifiers({ ...modifiers, creativity: parseInt(e.target.value) })}
                                className="range range-xs range-primary"
                            />
                            <div className="flex justify-between px-1 mt-1">
                                <span className="text-[8px] font-black opacity-20 uppercase">Accurate</span>
                                <span className="text-[8px] font-black opacity-20 uppercase">Creative</span>
                            </div>
                        </div>
                    </div>
                );
            case 'styling':
                return (
                    <div className="flex flex-col gap-6">
                        <div className="grid grid-cols-1 gap-4">
                            <div className="form-control">
                                <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Visual Discipline</label>
                                <AutocompleteSelect value={modifiers.artStyle || ''} onChange={(v) => setModifiers({ ...modifiers, artStyle: v })} options={artStyles.flatMap(c => c.items.map(i => ({ label: i.name.toUpperCase(), value: i.name })))} placeholder="Discipline..." />
                            </div>
                            <div className="form-control">
                                <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Styling Trends</label>
                                <AutocompleteSelect value={modifiers.artist || ''} onChange={(v) => setModifiers({ ...modifiers, artist: v })} options={artists.flatMap(c => c.items.map(i => ({ label: i.name.toUpperCase(), value: i.name })))} placeholder="Creator influence..." />
                            </div>
                        </div>

                        {isZImage && (
                            <div className="form-control">
                                <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Z-Image Variant</label>
                                <select value={modifiers.zImageStyle} onChange={e => setModifiers({ ...modifiers, zImageStyle: e.target.value })} className="form-select w-full">
                                    <option value="">NONE</option>
                                    {Z_IMAGE_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                        )}

                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Aesthetics Look</label>
                            <AutocompleteSelect
                                value={modifiers.aestheticLook || ''}
                                onChange={(v) => setModifiers({ ...modifiers, aestheticLook: v })}
                                options={AESTHETIC_LOOKS.map(l => ({ label: l.name.toUpperCase(), value: l.name, description: l.description }))}
                                placeholder="Look..."
                            />
                        </div>
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Digital Trend</label>
                            <AutocompleteSelect
                                value={modifiers.digitalAesthetic || ''}
                                onChange={(v) => setModifiers({ ...modifiers, digitalAesthetic: v })}
                                options={DIGITAL_AESTHETICS.map(t => ({ label: t.name.toUpperCase(), value: t.name, description: t.description }))}
                                placeholder="Trend..."
                            />
                        </div>

                        <div className="pt-4">
                            <label className="text-[10px] font-black uppercase text-primary tracking-[0.3em] mb-4 block">Persona</label>
                            <div className="grid grid-cols-1 gap-4">
                                <div className="form-control">
                                    <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Facial Expressions</label>
                                    <AutocompleteSelect
                                        value={modifiers.facialExpression || ''}
                                        onChange={(v) => setModifiers({ ...modifiers, facialExpression: v })}
                                        options={FACIAL_EXPRESSIONS.map(e => ({ label: e.toUpperCase(), value: e }))}
                                        placeholder="Expression..."
                                    />
                                </div>
                                <div className="form-control">
                                    <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Hair Styles</label>
                                    <AutocompleteSelect
                                        value={modifiers.hairStyle || ''}
                                        onChange={(v) => setModifiers({ ...modifiers, hairStyle: v })}
                                        options={HAIR_STYLES.map(h => ({ label: h.toUpperCase(), value: h }))}
                                        placeholder="Hair..."
                                    />
                                </div>
                                <div className="grid grid-cols-1 gap-4">
                                    <div className="form-control">
                                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Eye Color</label>
                                        <AutocompleteSelect
                                            value={modifiers.eyeColor || ''}
                                            onChange={(v) => setModifiers({ ...modifiers, eyeColor: v })}
                                            options={EYE_COLORS.map(e => ({ label: e.toUpperCase(), value: e }))}
                                            placeholder="Eyes..."
                                        />
                                    </div>
                                    <div className="form-control">
                                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Skin Texture</label>
                                        <AutocompleteSelect
                                            value={modifiers.skinTexture || ''}
                                            onChange={(v) => setModifiers({ ...modifiers, skinTexture: v })}
                                            options={SKIN_TEXTURES.map(s => ({ label: s.toUpperCase(), value: s }))}
                                            placeholder="Skin..."
                                        />
                                    </div>
                                </div>
                                <div className="form-control">
                                    <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Clothing & Outfit</label>
                                    <AutocompleteSelect
                                        value={modifiers.clothing || ''}
                                        onChange={(v) => setModifiers({ ...modifiers, clothing: v })}
                                        options={CLOTHING_STYLES.map(c => ({ label: c.toUpperCase(), value: c }))}
                                        placeholder="Outfit..."
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                );
            case 'photography':
                const modelOptions = (modifiers.cameraType && CAMERA_MODELS_BY_TYPE[modifiers.cameraType]
                    ? CAMERA_MODELS_BY_TYPE[modifiers.cameraType]
                    : ALL_PROFESSIONAL_CAMERA_MODELS).map(m => ({ label: m.toUpperCase(), value: m }));

                return (
                    <div className="space-y-6 animate-fade-in">
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Photo Genre</label>
                            <AutocompleteSelect value={modifiers.photographyStyle || ''} onChange={(v) => setModifiers({ ...modifiers, photographyStyle: v })} options={PHOTOGRAPHY_STYLES.map(s => ({ label: s.toUpperCase(), value: s }))} placeholder="Genre..." />
                        </div>

                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Camera Body Type</label>
                            <select
                                value={modifiers.cameraType || ''}
                                onChange={(e) => setModifiers({ ...modifiers, cameraType: (e.currentTarget as any).value, cameraModel: "" })}
                                className="form-select w-full"
                            >
                                <option value="">SELECT TYPE...</option>
                                {CAMERA_TYPES.map(type => <option key={type} value={type}>{type.toUpperCase()}</option>)}
                            </select>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            <div className="form-control">
                                <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Professional Camera Model</label>
                                <AutocompleteSelect
                                    value={modifiers.cameraModel || ''}
                                    onChange={(v) => setModifiers({ ...modifiers, cameraModel: v })}
                                    options={modelOptions}
                                    placeholder="Search models..."
                                />
                            </div>
                            <div className="form-control">
                                <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Film Stock</label>
                                <AutocompleteSelect value={modifiers.filmStock || ''} onChange={(v) => setModifiers({ ...modifiers, filmStock: v })} options={ANALOG_FILM_STOCKS.map(s => ({ label: s.toUpperCase(), value: s }))} placeholder="Stock..." />
                            </div>
                        </div>

                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Specialty Optics</label>
                            <AutocompleteSelect value={modifiers.specialtyLens || ''} onChange={(v) => setModifiers({ ...modifiers, specialtyLens: v })} options={SPECIALTY_LENS_EFFECTS.map(l => ({ label: l.name.toUpperCase(), value: l.name, description: l.description }))} placeholder="Informative Vintage/Unique optics..." />
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            <div className="form-control">
                                <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Lens Type</label>
                                <AutocompleteSelect value={modifiers.lensType || ''} onChange={(v) => setModifiers({ ...modifiers, lensType: v })} options={LENS_TYPES.map(l => ({ label: l.toUpperCase(), value: l }))} placeholder="Glass..." />
                            </div>
                            <div className="form-control">
                                <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Shot Angle</label>
                                <AutocompleteSelect value={modifiers.cameraAngle || ''} onChange={(v) => setModifiers({ ...modifiers, cameraAngle: v })} options={CAMERA_ANGLES.map(a => ({ label: a.toUpperCase(), value: a }))} placeholder="Angle..." />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            <div className="form-control">
                                <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Shot Proximity</label>
                                <AutocompleteSelect value={modifiers.cameraProximity || ''} onChange={(v) => setModifiers({ ...modifiers, cameraProximity: v })} options={CAMERA_PROXIMITY.map(p => ({ label: p.toUpperCase(), value: p }))} placeholder="Distance..." />
                            </div>
                            <div className="form-control">
                                <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Technical Settings</label>
                                <AutocompleteSelect value={modifiers.cameraSettings || ''} onChange={(v) => setModifiers({ ...modifiers, cameraSettings: v })} options={CAMERA_SETTINGS.map(s => ({ label: s.toUpperCase(), value: s }))} placeholder="Technical..." />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            <div className="form-control">
                                <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Camera Distortion</label>
                                <AutocompleteSelect value={modifiers.cameraEffect || ''} onChange={(v) => setModifiers({ ...modifiers, cameraEffect: v })} options={CAMERA_EFFECTS.map(s => ({ label: s.toUpperCase(), value: s }))} placeholder="Aberration..." />
                            </div>
                            <div className="form-control">
                                <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Lighting Rig</label>
                                <AutocompleteSelect value={modifiers.lighting || ''} onChange={(v) => setModifiers({ ...modifiers, lighting: v })} options={LIGHTING_OPTIONS.map(l => ({ label: l.toUpperCase(), value: l }))} placeholder="Lighting..." />
                            </div>
                        </div>

                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Composition Layout</label>
                            <AutocompleteSelect value={modifiers.composition || ''} onChange={(v) => setModifiers({ ...modifiers, composition: v })} options={COMPOSITION_OPTIONS.map(c => ({ label: c.toUpperCase(), value: c }))} placeholder="Layout..." />
                        </div>
                    </div>
                );
            case 'motion':
                return (
                    <div className="space-y-6 animate-fade-in">
                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest block">Generation Method</label>
                        <div className="form-tab-group">
                            <button onClick={() => { audioService.playClick(); setModifiers({ ...modifiers, videoInputType: 't2v' }); }} className={`form-tab-item ${modifiers.videoInputType === 't2v' ? 'active' : ''}`}>TEXT-2-VID</button>
                            <button onClick={() => { audioService.playClick(); setModifiers({ ...modifiers, videoInputType: 'i2v' }); }} className={`form-tab-item ${modifiers.videoInputType === 'i2v' ? 'active' : ''}`}>IMG-2-VID</button>
                        </div>
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Motion</label>
                            <AutocompleteSelect
                                value={modifiers.motion || ''}
                                onChange={(v) => setModifiers({ ...modifiers, motion: v })}
                                options={MOTION_OPTIONS.map(m => ({ label: m.name.toUpperCase(), value: m.name, description: m.description }))}
                                placeholder="Motion..."
                            />
                        </div>
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Pathing</label>
                            <AutocompleteSelect
                                value={modifiers.cameraMovement || ''}
                                onChange={(v) => setModifiers({ ...modifiers, cameraMovement: v })}
                                options={CAMERA_MOVEMENT_OPTIONS.map(m => ({ label: m.name.toUpperCase(), value: m.name, description: m.description }))}
                                placeholder="Pathing..."
                            />
                        </div>
                    </div>
                );
            case 'audio':
                return (
                    <div className="grid grid-cols-1 gap-6 animate-fade-in">
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Audio Category</label>
                            <AutocompleteSelect value={modifiers.audioType || ''} onChange={(v) => setModifiers({ ...modifiers, audioType: v })} options={AUDIO_TYPES.map(t => ({ label: t.toUpperCase(), value: t }))} placeholder="Type..." />
                        </div>
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Voice Profile</label>
                            <AutocompleteSelect value={modifiers.voiceGender || ''} onChange={(v) => setModifiers({ ...modifiers, voiceGender: v })} options={VOICE_GENDERS.map(g => ({ label: g.toUpperCase(), value: g }))} placeholder="Gender..." />
                        </div>
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Voice Tone</label>
                            <AutocompleteSelect value={modifiers.voiceTone || ''} onChange={(v) => setModifiers({ ...modifiers, voiceTone: v })} options={VOICE_TONES.map(t => ({ label: t.toUpperCase(), value: t }))} placeholder="Tone..." />
                        </div>
                        <div className="form-control">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-[10px] font-normal text-[12px] font-sf-mono uppercase tracking-widest">Targeted Duration</label>
                                <span className="text-[10px] font-mono font-bold text-primary">{modifiers.audioDuration}s</span>
                            </div>
                            <input
                                type="range"
                                min="1"
                                max="120"
                                value={modifiers.audioDuration}
                                onChange={e => setModifiers({ ...modifiers, audioDuration: e.target.value })}
                                className="range range-xs range-primary"
                            />
                        </div>
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Acoustic Environment</label>
                            <AutocompleteSelect value={modifiers.audioEnvironment || ''} onChange={(v) => setModifiers({ ...modifiers, audioEnvironment: v })} options={AUDIO_ENVIRONMENTS.map(e => ({ label: e.toUpperCase(), value: e }))} placeholder="Environment..." />
                        </div>
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Audio Mood</label>
                            <AutocompleteSelect value={modifiers.audioMood || ''} onChange={(v) => setModifiers({ ...modifiers, audioMood: v })} options={AUDIO_MOODS.map(m => ({ label: m.toUpperCase(), value: m }))} placeholder="Mood..." />
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
                                        <select value={modifiers.mjVersion} onChange={e => setModifiers({ ...modifiers, mjVersion: e.target.value, mjNiji: "" })} className="form-select w-full">
                                            {MIDJOURNEY_VERSIONS.map(v => <option key={v} value={v}>V {v}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-control">
                                        <label className="text-[10px] font-black uppercase text-base-content/40 mb-2">Niji (Anime)</label>
                                        <select value={modifiers.mjNiji} onChange={e => setModifiers({ ...modifiers, mjNiji: e.target.value as any, mjVersion: "" })} className="form-select w-full">
                                            <option value="">OFF</option>
                                            {MIDJOURNEY_NIJI_VERSIONS.map(v => <option key={v} value={v}>Niji {v}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-control">
                                    <label className="text-[10px] font-black uppercase text-base-content/40 mb-2">Aspect Ratio (--ar)</label>
                                    <select value={modifiers.mjAspectRatio} onChange={e => setModifiers({ ...modifiers, mjAspectRatio: e.target.value })} className="form-select w-full">
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
                                        <input type="range" min="0" max="1000" value={modifiers.mjStylize} onChange={e => setModifiers({ ...modifiers, mjStylize: e.target.value })} className="range range-xs range-primary" />
                                    </div>
                                    <div className="form-control">
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest">Chaos (--c)</label>
                                            <span className="text-[10px] font-mono font-bold text-primary">{modifiers.mjChaos}</span>
                                        </div>
                                        <input type="range" min="0" max="100" value={modifiers.mjChaos} onChange={e => setModifiers({ ...modifiers, mjChaos: e.target.value })} className="range range-xs range-primary" />
                                    </div>
                                    <div className="form-control">
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest">Weird (--weird)</label>
                                            <span className="text-[10px] font-mono font-bold text-primary">{modifiers.mjWeird}</span>
                                        </div>
                                        <input type="range" min="0" max="3000" value={modifiers.mjWeird} onChange={e => setModifiers({ ...modifiers, mjWeird: e.target.value })} className="range range-xs range-primary" />
                                    </div>
                                </div>
                                <div className="form-control">
                                    <label className="text-[10px] font-black uppercase text-base-content/40 mb-2">Negative Constraints (--no)</label>
                                    <input type="text" value={modifiers.mjNo} onChange={e => setModifiers({ ...modifiers, mjNo: e.target.value })} className="form-input w-full" placeholder="objects to exclude..." />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <label className="label cursor-pointer justify-start gap-4">
                                        <span className="text-[10px] font-black uppercase text-base-content/40">Seamless (--tile)</span>
                                        <input type="checkbox" checked={modifiers.mjTile} onChange={e => setModifiers({ ...modifiers, mjTile: e.target.checked })} className="checkbox checkbox-primary rounded-none checkbox-xs" />
                                    </label>
                                    <div className="form-control">
                                        <select value={modifiers.mjStyle} onChange={e => setModifiers({ ...modifiers, mjStyle: e.target.value as any })} className="form-select w-full">
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
                                <Cog6ToothIcon className="w-12 h-12 mx-auto mb-4" />
                                <p className="text-[10px] font-normal text-[12px] font-sf-mono uppercase tracking-widest text-center">No platform extensions available</p>
                            </div>
                        )}
                    </div>
                );
            default: return null;
        }
    };

    const handleClearModifier = (key: string) => {
        if (key === 'refineText') setRefineText('');
        else if (key === 'constantModifier') setConstantModifier('');
        else setModifiers(m => ({ ...m, [key]: "" }));
    };

    const handleModifierClick = (tab: RefineSubTab) => {
        setActiveRefineSubTab(tab);
    };

    // --- Preset Handlers ---
    const handleSavePresetClick = () => {
        setNewPresetName('');
        setIsSavePresetModalOpen(true);
    };

    const handleConfirmSavePreset = async () => {
        if (!newPresetName.trim()) return;
        setIsSavingPreset(true);
        try {
            const preset: RefinerPreset = {
                name: newPresetName.trim(),
                modifiers: { ...modifiers },
                targetAIModel,
                mediaMode,
                promptLength,
                constantModifier
            };
            await refinerPresetService.savePreset(preset);
            await loadPresets();
            setIsSavePresetModalOpen(false);
            showGlobalFeedback('Preset saved to registry.');
        } catch (e) {
            showGlobalFeedback('Failed to save preset.', true);
        } finally {
            setIsSavingPreset(false);
        }
    };

    const handleUsePreset = useCallback((presetToUse: RefinerPreset | null = selectedPreset) => {
        if (presetToUse) {
            setModifiers({ ...DEFAULT_MODIFIERS, ...presetToUse.modifiers });
            setTargetAIModel(presetToUse.targetAIModel);
            setMediaMode(presetToUse.mediaMode);
            setPromptLength(presetToUse.promptLength);
            if (presetToUse.constantModifier !== undefined) {
                setConstantModifier(presetToUse.constantModifier);
            }
            if (presetToUse.refineText !== undefined) {
                setRefineText(presetToUse.refineText);
            }
            showGlobalFeedback(`Preset "${presetToUse.name}" applied.`);
        }
    }, [selectedPreset, showGlobalFeedback]);

    const handleDeletePresetClick = () => {
        if (selectedPreset) {
            setPresetToDelete(selectedPreset);
            setIsDeletePresetModalOpen(true);
        }
    };

    const handleConfirmDeletePreset = async () => {
        if (presetToDelete) {
            try {
                await refinerPresetService.deletePreset(presetToDelete.name);
                await loadPresets();
                setSelectedPreset(null);
                showGlobalFeedback('Preset purged.');
            } catch (e) {
                showGlobalFeedback('Deletion failed.', true);
            }
        }
        setIsDeletePresetModalOpen(false);
        setPresetToDelete(null);
    };

    return (
        <div className="flex flex-col h-full bg-transparent overflow-hidden p-0">
            <div className={`flex-grow overflow-hidden relative min-h-0`}>
                {activeView === 'composer' && (
                    <PromptCrafter
                        isNavigating={isExiting}
                        onSaveToLibrary={(gen) => handleSaveSuggestion(gen)}
                        onClip={(gen) => handleClipSuggestion(gen, 'Crafted Prompt', 'Crafter Formula', 'Crafter')}
                        onSendToEnhancer={handleSendToRefine}
                        onSavePresetSuccess={(prompt, mods, constantMod) => {
                            setRefineText(prompt);
                            setModifiers({ ...DEFAULT_MODIFIERS, ...mods });
                            if (constantMod) setConstantModifier(constantMod);
                            showGlobalFeedback('Mapped to Refiner.');
                        }}
                        onSendToRefine={handleSendToRefine}
                        promptToInsert={composerPromptToInsert}
                        header={null}
                    />
                )}

                {activeView === 'refine' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 overflow-hidden h-full gap-4 min-h-0">
                        {/* Left Sidebar: Controls & Tabs */}
                        <motion.aside
                            variants={panelVariants}
                            initial="hidden"
                            animate={isExiting ? "exit" : "visible"}
                            exit="exit"
                            className="lg:col-span-3 h-full min-h-0 flex flex-col relative p-[3px] corner-frame overflow-visible"
                        >
                            <PanelLine position="top" delay={0.4} />
                            <PanelLine position="bottom" delay={0.5} />
                            <PanelLine position="left" delay={0.6} />
                            <PanelLine position="right" delay={0.7} />
                            <ScanLine delay={3.5} />
                            <div className="flex flex-col h-full w-full overflow-visible relative z-10 bg-base-100/40 backdrop-blur-xl panel-transparent">
                                <motion.header
                                    variants={pageHeaderVariants}
                                    initial="hidden"
                                    animate="visible"
                                    exit="exit"
                                    className="h-16 flex items-stretch flex-shrink-0 bg-base-100/80 backdrop-blur-md p-2 gap-1.5 panel-header overflow-visible relative z-[800]"
                                >
                                    {tabs.map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => {
                                                audioService.playClick();
                                                setActiveRefineSubTab(tab.id);
                                            }}
                                            onMouseEnter={() => audioService.playHover()}
                                            className={`btn btn-sm h-full rounded-none flex-1 font-normal text-[12px] tracking-widest uppercase px-1 truncate btn-snake font-display shadow-none drop-shadow-none ${activeRefineSubTab === tab.id ? 'btn-ghost text-primary no-glow' : 'btn-ghost text-base-content/40 hover:text-primary hover:no-glow'}`}
                                        >
                                            <span /><span /><span /><span />
                                            {tab.label}
                                        </button>
                                    ))}
                                </motion.header>
                                <motion.div
                                    variants={pageBodyVariants}
                                    initial="hidden"
                                    animate="visible"
                                    exit="exit"
                                    ref={refineScrollerRef}
                                    className="flex-grow p-6 overflow-y-auto bg-transparent modifiers-tabs-container"
                                >
                                    {renderRefineSubContent()}
                                </motion.div>
                                <motion.footer
                                    variants={pageFooterVariants}
                                    initial="hidden"
                                    animate="visible"
                                    exit="exit"
                                    className="h-14 flex items-stretch flex-shrink-0 bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 panel-footer"
                                >
                                    <button
                                        onClick={() => {
                                            audioService.playClick();
                                            handleResetRefiner();
                                        }}
                                        className="btn btn-sm btn-ghost h-full rounded-none flex-1 font-rajdhani tracking-wider text-error/40 hover:text-error border-1 btn-snake"
                                    >
                                        <span /><span /><span /><span />
                                        RESET
                                    </button>
                                    <button
                                        onClick={() => {
                                            audioService.playClick();
                                            handleEnhance();
                                        }}
                                        disabled={isLoadingRefine || !refineText.trim()}
                                        className="btn btn-sm btn-ghost h-full rounded-none flex-1 tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake"
                                    >
                                        <span /><span /><span /><span />
                                        {isLoadingRefine ? '...' : 'IMPROVE'}
                                    </button>
                                    {isGoogleProduct && (
                                        <button
                                            onClick={() => {
                                                audioService.playClick();
                                                handleDirectGenerate();
                                            }}
                                            disabled={isLoadingRefine || !refineText.trim()}
                                            className="btn btn-sm btn-ghost h-full rounded-none flex-1 tracking-wider text-primary border-0 disabled:opacity-30 disabled:cursor-not-allowed btn-snake"
                                        >
                                            <span /><span /><span /><span />
                                            {isLoadingRefine ? '...' : 'RENDER'}
                                        </button>
                                    )}
                                </motion.footer>
                            </div>
                            {/* Manual Corner Accents */}
                            <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                            <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                            <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                            <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
                        </motion.aside>

                        {/* Center: Main Neural Output */}
                        <motion.main
                            variants={panelVariants}
                            initial="hidden"
                            animate={isExiting ? "exit" : "visible"}
                            exit="exit"
                            className="lg:col-span-6 h-full min-h-0 flex flex-col relative p-[3px] corner-frame overflow-visible"
                        >
                            <PanelLine position="top" delay={0.4} />
                            <PanelLine position="bottom" delay={0.5} />
                            <PanelLine position="left" delay={0.6} />
                            <PanelLine position="right" delay={0.7} />
                            <ScanLine delay={3.5} />
                            <div className="flex flex-col h-full w-full overflow-visible relative z-10 bg-base-100/40 backdrop-blur-xl panel-transparent">
                                <motion.header
                                    variants={pageHeaderVariants}
                                    initial="hidden"
                                    animate="visible"
                                    exit="exit"
                                    className="p-6 h-16 flex justify-between items-center bg-base-100/80 backdrop-blur-md panel-header overflow-visible relative z-[800]"
                                >
                                    <motion.div variants={reverseTextVariants}>
                                        <TerminalText text={`REFINED PROMPT : ${targetAIModel}`} delay={2.6} className="text-xs font-sf-mono uppercase text-primary" />
                                    </motion.div>
                                </motion.header>
                                <motion.div
                                    variants={pageBodyVariants}
                                    initial="hidden"
                                    animate="visible"
                                    exit="exit"
                                    ref={neuralOutputScrollerRef}
                                    className="flex-grow overflow-y-auto flex flex-col items-stretch justify-center"
                                >
                                    {isLoadingRefine ? (
                                        <div className="flex-grow flex flex-col items-center justify-center text-center space-y-6">
                                            <BlobLoader />
                                        </div>
                                    ) : errorRefine ? (
                                        <div className="p-8 w-full text-center">
                                            <div className="alert alert-error rounded-none border-2 justify-center">
                                                <span className="font-black uppercase text-[10px] tracking-widest">{errorRefine.message}</span>
                                            </div>
                                        </div>
                                    ) : resultsRefine ? (
                                        <div className="p-5 md:p-5 lg:p-5 w-full animate-fade-in group">
                                            <div className="flex flex-col">
                                                <p className="text-base font-medium leading-relaxed text-base-content italic selection:bg-primary/20">
                                                    "{resultsRefine.suggestions[0]}"
                                                </p>
                                            </div>
                                        </div>
                                    ) : directMediaResult ? (
                                        <div className="p-8 w-full max-w-4xl space-y-4 animate-fade-in">
                                            <div className="relative group bg-black aspect-video flex items-center justify-center overflow-hidden corner-frame p-[1px]">
                                                <div className="bg-black w-full h-full flex items-center justify-center relative z-10">
                                                    {directMediaResult.type === 'video' ? (
                                                        <video src={directMediaResult.url} controls autoPlay loop className="w-full h-full object-contain" />
                                                    ) : (
                                                        <img src={directMediaResult.url} alt="Generated result" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                                                    )}
                                                </div>
                                                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                                    <a href={directMediaResult.url} download={`kollektiv_${directMediaResult.target.replace(/\s+/g, '_')}_${Date.now()}.${directMediaResult.type === 'video' ? 'mp4' : 'jpg'}`} className="btn btn-sm btn-primary rounded-none tracking-widest shadow-2xl btn-snake-primary">
                                                        <span /><span /><span /><span />
                                                        <DownloadIcon className="w-4 h-4 mr-2" /> EXPORT
                                                    </a>
                                                </div>

                                                <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-primary/40 z-30 pointer-events-none" />
                                                <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-primary/40 z-30 pointer-events-none" />
                                                <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-primary/40 z-30 pointer-events-none" />
                                                <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-primary/40 z-30 pointer-events-none" />
                                            </div>
                                            <div className="flex justify-between items-center px-2">
                                                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-primary/40">{directMediaResult.target} Render Output</span>
                                                <button onClick={() => setDirectMediaResult(null)} className="uppercase tracking-widest text-base-content/20 hover:text-primary transition-colors">Terminate Visual</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex-grow flex flex-col items-center justify-center text-center py-32 opacity-10">
                                            <span className="p-8"><SparklesIcon className="w-14 h-14" /></span>
                                            <p className="font-rajdhani text-[12px] font-sf-mono uppercase tracking-widest">Awaiting sequence initiation</p>
                                        </div>
                                    )}
                                </motion.div>

                                {resultsRefine && !isLoadingRefine && (
                                    <motion.footer
                                        variants={pageFooterVariants}
                                        initial="hidden"
                                        animate="visible"
                                        exit="exit"
                                        className="h-14 flex items-stretch bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 panel-footer selection:bg-transparent"
                                    >
                                        <div className="flex-[4] flex items-stretch gap-1.5">
                                            <button
                                                onClick={() => {
                                                    audioService.playClick();
                                                    setIsJsonModalOpen(true);
                                                }}
                                                className="btn btn-sm btn-ghost h-full flex-1 rounded-none tracking-wider uppercase btn-snake"
                                            >
                                                <span /><span /><span /><span />
                                                SHOW JSON
                                            </button>
                                            <button
                                                onClick={() => {
                                                    audioService.playClick();
                                                    handleSaveSuggestion(resultsRefine.suggestions[0]);
                                                }}
                                                className="btn btn-sm btn-ghost h-full flex-1 rounded-none tracking-wider uppercase btn-snake"
                                            >
                                                <span /><span /><span /><span />
                                                SAVE
                                            </button>
                                        </div>

                                        <div className="flex-[6] flex items-stretch gap-1.5 justify-end">
                                            <button
                                                onClick={() => {
                                                    audioService.playClick();
                                                    handleSendToRefine(resultsRefine.suggestions[0]);
                                                }}
                                                className="btn btn-sm btn-ghost h-full flex-1 rounded-none tracking-wider uppercase btn-snake"
                                            >
                                                <span /><span /><span /><span />
                                                REFINE
                                            </button>
                                            <button
                                                onClick={() => {
                                                    audioService.playClick();
                                                    handleClipSuggestion(resultsRefine.suggestions[0]);
                                                }}
                                                className="btn btn-sm btn-ghost h-full flex-1 rounded-none tracking-wider uppercase btn-snake"
                                            >
                                                <span /><span /><span /><span />
                                                CLIP
                                            </button>
                                            <button
                                                onClick={() => {
                                                    audioService.playClick();
                                                    handleCopySuggestionText(resultsRefine.suggestions[0]);
                                                }}
                                                className="btn btn-sm btn-ghost h-full flex-1 rounded-none tracking-wider uppercase btn-snake"
                                            >
                                                <span /><span /><span /><span />
                                                COPY
                                            </button>
                                        </div>
                                    </motion.footer>
                                )}
                            </div>
                            {/* Manual Corner Accents */}
                            <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                            <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                            <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                            <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
                        </motion.main>

                        {/* Right Sidebar: Refiner Preset */}
                        <motion.aside
                            variants={panelVariants}
                            initial="hidden"
                            animate={isLocalExiting || isExiting ? "exit" : "visible"}
                            exit="exit"
                            className="lg:col-span-3 h-full min-h-0 flex flex-col relative p-[3px] corner-frame overflow-visible hidden lg:flex origin-top-left"
                        >
                            <div className="flex flex-col h-full w-full overflow-visible relative bg-base-100/40 backdrop-blur-xl panel-transparent">
                                <motion.header
                                    variants={sectionWipeVariants}
                                    custom={1.6}
                                    initial="hidden"
                                    animate="visible"
                                    exit="exit"
                                    className="h-16 flex items-stretch relative z-[800] bg-base-100/80 p-1.5 gap-1.5 panel-header overflow-visible"
                                >
                                    <div className="flex-grow h-full relative overflow-visible">
                                        <div className="flex flex-col gap-3 h-full justify-center overflow-visible">
                                            <div className="flex gap-4 items-center">
                                                <div className="flex-1 px-0 text-sm h-full flex items-center border-0 overflow-visible">
                                                    <AutocompleteSelect
                                                        placeholder="SELECT PRESET..."
                                                        value={selectedPreset?.name || ''}
                                                        onChange={(val) => {
                                                            const preset = presets.find(p => p.name === val);
                                                            if (preset) {
                                                                setSelectedPreset(preset);
                                                                handleUsePreset(preset);
                                                            } else if (val === '') {
                                                                setSelectedPreset(null);
                                                                setRefineText('');
                                                                setModifiers({ ...DEFAULT_MODIFIERS });
                                                            }
                                                        }}
                                                        options={presets.map(p => ({ label: p.name.toUpperCase(), value: p.name }))}
                                                    />
                                                </div>
                                                <div className="flex gap-4 shrink-0">
                                                    {/* <button
                                                        onClick={() => {
                                                            audioService.playClick();
                                                            setSelectedPreset(null);
                                                            setRefineText('');
                                                            setModifiers({ ...DEFAULT_MODIFIERS });
                                                        }}
                                                        className="tracking-widest text-base-content/40 hover:-content transition-all"
                                                    >
                                                        CLEAR
                                                    </button> */}
                                                    <button
                                                        className="tracking-widest text-error/40 hover:text-error transition-all mr-2 ms-2"
                                                        onClick={() => {
                                                            audioService.playClick();
                                                            handleDeletePresetClick();
                                                        }}
                                                    >
                                                        DELETE
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </motion.header>

                                <motion.div
                                    variants={contentVariants}
                                    custom={2.8}
                                    initial="hidden"
                                    animate="visible"
                                    ref={activeConstructionScrollerRef}
                                    className="flex-grow p-0 overflow-y-auto relative"
                                >
                                    {activeConstructionItems.length > 0 ? (
                                        <div className="flex flex-col">
                                            {activeConstructionItems.map((item) => (
                                                <PropertyCard
                                                    key={item.key}
                                                    label={item.label}
                                                    value={item.value}
                                                    onClear={() => handleClearModifier(item.key)}
                                                    onClick={() => handleModifierClick(item.tab)}
                                                    active={activeRefineSubTab === item.tab}
                                                />
                                            ))}
                                        </div>
                                    ) : null}
                                </motion.div>

                                <motion.footer
                                    variants={contentVariants}
                                    custom={3.0}
                                    initial="hidden"
                                    animate="visible"
                                    className="h-14 flex items-stretch flex-shrink-0 bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 panel-footer"
                                >
                                    <button
                                        onClick={() => {
                                            audioService.playClick();
                                            handleSavePresetClick();
                                        }}
                                        disabled={activeConstructionItems.length === 0}
                                        className="btn btn-sm btn-ghost h-full rounded-none flex-1 tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake"
                                    >
                                        <span /><span /><span /><span />
                                        SAVE AS PRESET
                                    </button>
                                </motion.footer>
                            </div>
                            {/* Manual Corner Accents */}
                            <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                            <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                            <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                            <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
                        </motion.aside>
                    </div>
                )}

                <AnimatePresence mode="wait">
                    {activeView === 'analyzer' && (
                        <MediaAnalyzer
                            onSaveSuggestion={handleSaveSuggestion}
                            onSaveAsPreset={handleSaveAsPreset}
                            onRefine={handleSendToRefine}
                            onClip={handleClipSuggestion}
                            header={null}
                            isNavigating={isLocalExiting || isExiting}
                        />
                    )}

                    {activeView === 'prompt_analyzer' && (
                        <PromptAnalyzer
                            header={null}
                            libraryItems={savedPrompts}
                            onSaveSuggestion={handleSaveSuggestion}
                            onClip={(text) => handleClipSuggestion(text)}
                            onSwitchView={(view) => handleSwitchView(view)}
                            onMapToRefiner={(prompt, mods, constantMod) => {
                                setRefineText(prompt);
                                setModifiers({ ...DEFAULT_MODIFIERS, ...mods });
                                if (constantMod) setConstantModifier(constantMod);
                                handleSwitchView('refine');
                            }}
                            showGlobalFeedback={showGlobalFeedback}
                            isNavigating={isLocalExiting || isExiting}
                        />
                    )}
                </AnimatePresence>
            </div>

            {/* Save Preset Modal */}
            {isSavePresetModalOpen && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-xl z-[1000] flex items-center justify-center p-4 animate-fade-in" onClick={() => setIsSavePresetModalOpen(false)}>
                    <div className="flex flex-col bg-transparent w-full max-w-lg mx-auto relative p-[3px] corner-frame overflow-visible" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-base-100/40 backdrop-blur-xl rounded-none w-full flex flex-col overflow-hidden relative z-10">
                            <header className="px-8 py-4 panel-header bg-transparent relative flex-shrink-0 flex items-center justify-between">
                                <div className="flex flex-col">
                                    <h3 className="text-xl font-black tracking-tighter text-base-content leading-none uppercase">SAVE PRESET<span className="text-primary">.</span></h3>
                                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/30 mt-1.5">Asset Indexing Interface</p>
                                </div>
                                <button onClick={() => setIsSavePresetModalOpen(false)} className="p-2 text-error/30 hover:text-error transition-all hover:scale-110">
                                    <CloseIcon className="w-5 h-5" />
                                </button>
                            </header>

                            <div className="p-10 space-y-8">
                                <div className="form-control">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-2">Preset Designation</label>
                                    <input
                                        type="text"
                                        value={newPresetName}
                                        onChange={(e) => setNewPresetName((e.currentTarget as any).value)}
                                        placeholder="ENTER PRESET NAME..."
                                        className="form-input w-full"
                                        autoFocus
                                        onKeyDown={(e) => e.key === 'Enter' && handleConfirmSavePreset()}
                                    />
                                </div>
                            </div>
                            <footer className="h-14 flex items-stretch bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 overflow-hidden flex-shrink-0 panel-footer">
                                <button onClick={() => setIsSavePresetModalOpen(false)} className="btn btn-sm btn-ghost h-full flex-1 rounded-none tracking-wider uppercase btn-snake no-glow active:no-glow">
                                    <span /><span /><span /><span />
                                    CANCEL
                                </button>
                                <button onClick={handleConfirmSavePreset} disabled={isSavingPreset || !newPresetName.trim()} className="btn btn-sm btn-primary h-full flex-[1.5] rounded-none tracking-wider uppercase btn-snake-primary no-glow active:no-glow">
                                    <span /><span /><span /><span />
                                    {isSavingPreset ? "SAVING..." : "COMMIT PRESET"}
                                </button>
                            </footer>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Preset Confirmation */}
            <ConfirmationModal
                isOpen={isDeletePresetModalOpen}
                onClose={() => setIsDeletePresetModalOpen(false)}
                onConfirm={handleConfirmDeletePreset}
                title={`PURGE PRESET`}
                message={`Permanently remove preset "${presetToDelete?.name}"?`}
            />

            <PromptEditorModal
                isOpen={isSaveSuggestionModalOpen}
                onClose={() => setIsSaveSuggestionModalOpen(false)}
                onSave={handleConfirmSaveSuggestion}
                categories={promptCategories}
                editingPrompt={suggestionToSave}
            />

            <JSONBreakdownModal
                isOpen={isJsonModalOpen}
                onClose={() => setIsJsonModalOpen(false)}
                jsonData={jsonData}
                onDownload={handleDownloadJson}
                onCopy={handleCopyJson}
                jsonCopied={jsonCopied}
            />
        </div>
    );
};

export default PromptsPage;
