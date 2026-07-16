// RefinerPage.tsx - Extracted Refiner view from PromptsPage
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { PanelLine, ScanLine, TerminalText, pageVariants, pageHeaderVariants, pageBodyVariants, pageFooterVariants, reverseTextVariants, sectionWipeVariants } from './AnimatedPanels';
import { RefinerModifierControls, RefineSubTab } from './RefinerModifierControls';
import { PropertyCard } from './RefinerSlots';
import BlobLoader from './BlobLoader';
import AutocompleteSelect from './AutocompleteSelect';
import { SparklesIcon, CloseIcon, DownloadIcon } from './icons';
import ConfirmationModal from './ConfirmationModal';
import CodeSnippetModal from './CodeSnippetModal';
import JSONBreakdownModal from './JSONBreakdownModal';
import { audioService } from '../services/audioService';
import { refinerPresetService, type RefinerPreset } from '../services/refinerPresetService';
import { modifierOptionsService } from '../services/modifierOptionsService';
import { enhancePromptStream, cleanLLMResponse, buildMidjourneyParams, dissectPrompt, generateConstructorPreset, generateWithImagen, generateWithNanoBanana, generateWithVeo } from '../services/llmService';
import { computeWordDiff, calculateSemanticMetrics } from '../utils/diffUtils';
import { loadArtStyles } from '../utils/artstyleStorage';
import {
    PROMPT_DETAIL_LEVELS, MIDJOURNEY_VERSIONS
} from '../constants/modifiers';
import { MODIFIER_CATEGORIES } from '../constants/modifierRegistry';
import { TARGET_IMAGE_AI_MODELS, TARGET_VIDEO_AI_MODELS, TARGET_AUDIO_AI_MODELS } from '../constants/models';
import type { LLMSettings } from '../types';

type MediaMode = 'image' | 'video' | 'audio';

export interface RefinerPageProps {
    isExiting?: boolean;
    showGlobalFeedback: (message: string, isError?: boolean) => void;
    setIsBusy: (busy: boolean) => void;
    settings: LLMSettings;
    initialPrompt?: string;
    initialArtStyle?: string;
    initialArtist?: string;
    onSaveSuggestion: (text: string, title?: string) => void;
    onClipSuggestion: (text: string, title?: string, lens?: string, source?: string) => void;
    onSendToBuilder?: (state: any) => void;
}

type AppError = { message: string };
type EnhancementResult = { suggestions: string[]; breakdown?: any };

const DEFAULT_MODIFIERS = {
    aspectRatio: "", videoInputType: "t2v", artStyle: "", artist: "", photographyStyle: "",
    aestheticLook: "", digitalAesthetic: "", cameraType: "", cameraModel: "", cameraAngle: "", cameraProximity: "",
    cameraSettings: "", cameraEffect: "", specialtyLens: "", lensType: "", filmType: "", filmStock: "",
    lighting: "", composition: "", motion: "", cameraMovement: "", zImageStyle: "", facialExpression: "",
    hairStyle: "", eyeColor: "", skinTexture: "", realism: "", clothing: "",
    audioType: "", voiceGender: "", voiceTone: "", audioEnvironment: "", audioMood: "", audioDuration: "10",
    mjAspectRatio: "", mjChaos: "0", mjStylize: "100", mjVersion: MIDJOURNEY_VERSIONS[0],
    mjNiji: "", mjStyle: "", mjTile: false, mjWeird: "0", mjNo: "", mjQuality: "",
    mjSeed: "", mjStop: "", mjRepeat: ""
};

const RefinerPage: React.FC<RefinerPageProps> = ({
    isExiting = false,
    showGlobalFeedback,
    setIsBusy,
    settings,
    initialPrompt,
    initialArtStyle,
    initialArtist,
    onSaveSuggestion,
    onClipSuggestion,
    onSendToBuilder,
}) => {
    // --- Core Refiner State ---
    const [mediaMode, setMediaMode] = useState<MediaMode>('image');
    const [refineText, setRefineText] = useState<string>('');
    const [constantModifier, setConstantModifier] = useState<string>('');
    const [promptLength, setPromptLength] = useState<string>(PROMPT_DETAIL_LEVELS.MEDIUM);
    const [targetAIModel, setTargetAIModel] = useState<string>(TARGET_IMAGE_AI_MODELS[0]);
    const [referenceImages, setReferenceImages] = useState<(string | null)[]>([null, null, null, null]);
    const [modifiers, setModifiers] = useState<any>({ ...DEFAULT_MODIFIERS });

    // --- Preset Management State ---
    const [presets, setPresets] = useState<RefinerPreset[]>([]);
    const [selectedPreset, setSelectedPreset] = useState<RefinerPreset | null>(null);
    const [isSavePresetModalOpen, setIsSavePresetModalOpen] = useState(false);
    const [newPresetName, setNewPresetName] = useState('');
    const [isSavingPreset, setIsSavingPreset] = useState(false);
    const [presetToDelete, setPresetToDelete] = useState<RefinerPreset | null>(null);
    const [isDeletePresetModalOpen, setIsDeletePresetModalOpen] = useState(false);

    // --- Data & Loading State ---
    const [artStyles, setArtStyles] = useState<any[]>([]);
    const [customOptions, setCustomOptions] = useState<Record<string, (string | { name: string; description?: string })[]>>({});
    const [isLoadingRefine, setIsLoadingRefine] = useState(false);
    const [errorRefine, setErrorRefine] = useState<AppError | null>(null);
    const [isCodeExportModalOpen, setIsCodeExportModalOpen] = useState(false);
    const [resultsRefine, setResultsRefine] = useState<EnhancementResult | null>(null);
    const [outputTab, setOutputTab] = useState<'prose' | 'diff'>('prose');
    const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);
    const [jsonCopied, setJsonCopied] = useState(false);

    // --- Direct Media State ---
    const [directMediaResult, setDirectMediaResult] = useState<{ url: string; type: 'image' | 'video'; target: string; prompt: string } | null>(null);

    const [activeRefineSubTab, setActiveRefineSubTab] = useState<RefineSubTab>('basic');
    const refineScrollerRef = useRef<HTMLDivElement>(null);
    const neuralOutputScrollerRef = useRef<HTMLDivElement>(null);
    const [, setLoadingMsg] = useState<string>('');

    // --- Derived Values ---
    const isGoogleProduct = useMemo(() => {
        const target = targetAIModel.toLowerCase();
        return target.includes('imagen') || target.includes('nano banana') || target.includes('veo');
    }, [targetAIModel]);

    const isMidjourney = useMemo(() => targetAIModel.toLowerCase().includes('midjourney'), [targetAIModel]);

    const tabs = useMemo(() => {
        const list: { id: RefineSubTab; label: string }[] = [{ id: 'basic', label: 'BASIC' }];
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

    const diffAnalysis = useMemo(() => {
        if (!resultsRefine || !resultsRefine.suggestions || !resultsRefine.suggestions[0]) return null;
        const original = refineText || '';
        const refined = resultsRefine.suggestions[0];
        const diff = computeWordDiff(original, refined);
        const metrics = calculateSemanticMetrics(original, refined, targetAIModel);
        return { diff, metrics };
    }, [resultsRefine, refineText, targetAIModel]);

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
            realism: { label: 'Realism Engine', tab: 'styling' },
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

    // --- Initial data load ---
    useEffect(() => {
        const loadData = async () => {
            try {
                const [styles, custom] = await Promise.all([
                    loadArtStyles(),
                    modifierOptionsService.loadCustomOptions(),
                ]);
                setArtStyles(styles);
                setCustomOptions(custom);
            } catch (e) {
                setErrorRefine({ message: "Reference data offline." });
            }
        };
        loadData();
    }, []);

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

    // Reset model on media mode change
    useEffect(() => {
        if (mediaMode === 'image') setTargetAIModel(TARGET_IMAGE_AI_MODELS[0]);
        else if (mediaMode === 'video') setTargetAIModel(TARGET_VIDEO_AI_MODELS[0]);
        else if (mediaMode === 'audio') setTargetAIModel(TARGET_AUDIO_AI_MODELS[0]);
    }, [mediaMode]);

    // Handle active tab fallback
    useEffect(() => {
        if (!tabs.some(t => t.id === activeRefineSubTab)) {
            setActiveRefineSubTab('basic');
        }
    }, [tabs, activeRefineSubTab]);

    // Handle initial prompt from parent
    useEffect(() => {
        if (initialPrompt) {
            setRefineText(initialPrompt);
            if (initialArtStyle) setModifiers((m: any) => ({ ...m, artStyle: initialArtStyle }));
            if (initialArtist) setModifiers((m: any) => ({ ...m, artist: initialArtist }));
        }
    }, [initialPrompt, initialArtStyle, initialArtist]);

    // --- Handlers ---

    const buildModifierCatalog = useCallback(() => {
        const catalog: string[] = [];
        if (artStyles.length > 0) catalog.push(`artStyle: ${artStyles.flatMap((c: any) => c.items.map((i: any) => i.name)).join(', ')}`);
        // Use MODIFIER_CATEGORIES from registry, filtered by media mode
        const registryCatalog = MODIFIER_CATEGORIES.filter((c: any) => c.media === 'all' || c.media === mediaMode);
        for (const cat of registryCatalog) {
            const builtin = cat.getOptions();
            const custom = customOptions?.[cat.key] || [];
            const merged = Array.from(new Set([...builtin, ...custom.map((e: any) => typeof e === 'string' ? e : e.name)]));
            if (merged.length > 0) catalog.push(`${cat.key}: ${merged.join(', ')}`);
        }
        return catalog.join('\\n');
    }, [artStyles, mediaMode, customOptions]);

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
            if (!fullText.trim()) {
                const active = settings.activeLLM || 'ollama';
                if (active === 'gemini') throw new Error("Target unreachable or returned empty sequence. Please ensure your Gemini API Key is configured and valid in Setup.");
                else if (active === 'openrouter') throw new Error("Target unreachable or returned empty sequence. Please verify your OpenRouter configuration.");
                else throw new Error("Target unreachable or returned empty sequence. Ensure Ollama is running.");
            }
            let refinedPrompt = fullText;
            let breakdown: any = null;
            if (fullText.includes('---PROMPT_BREAKDOWN---')) {
                const parts = fullText.split('---PROMPT_BREAKDOWN---');
                refinedPrompt = parts[0].trim();
                try { breakdown = JSON.parse(parts[1].trim().replace(/```json\n?|\n?```/g, '').trim()); } catch {}
            }
            const cleanedText = cleanLLMResponse(refinedPrompt);
            const mjParams = isMidjourney ? buildMidjourneyParams(modifiers) : '';
            const prompt = isMidjourney ? `${cleanedText} ${mjParams}`.trim() : cleanedText;
            setResultsRefine({ suggestions: [prompt], breakdown });
        } catch (err: any) {
            setErrorRefine({ message: err.message });
        } finally {
            setIsLoadingRefine(false);
            setIsBusy(false);
        }
    }, [refineText, constantModifier, promptLength, targetAIModel, modifiers, settings, isMidjourney, referenceImages, buildModifierCatalog, setIsBusy]);

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
            if (target.includes('imagen')) resultUrl = await generateWithImagen(combinedPrompt, modifiers.aspectRatio, settings);
            else if (target.includes('nano banana')) resultUrl = await generateWithNanoBanana(combinedPrompt, activeRefImages, modifiers.aspectRatio, settings);
            else if (target.includes('veo')) resultUrl = await generateWithVeo(combinedPrompt, (msg: string) => setLoadingMsg(msg), modifiers.aspectRatio, settings);
            else throw new Error("Direct rendering unsupported.");
            setDirectMediaResult({ url: resultUrl, type: target.includes('veo') ? 'video' : 'image', target: targetAIModel, prompt: combinedPrompt });
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
        setModifiers({ ...DEFAULT_MODIFIERS });
        setResultsRefine(null);
        setDirectMediaResult(null);
        setErrorRefine(null);
        setSelectedPreset(null);
        showGlobalFeedback('Workspace purge.');
    };

    const handleCopySuggestionText = useCallback((text: string) => {
        if (typeof window !== 'undefined' && (window as any).navigator?.clipboard) {
            (window as any).navigator.clipboard.writeText(text)
                .then(() => showGlobalFeedback('Token copied to buffer.'))
                .catch((err: any) => console.error('Failed to copy text: ', err));
        }
    }, [showGlobalFeedback]);

    const handleCopyJson = useCallback(() => {
        if (!jsonData) return;
        if (typeof window !== 'undefined' && (window as any).navigator?.clipboard) {
            (window as any).navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2))
                .then(() => { setJsonCopied(true); setTimeout(() => setJsonCopied(false), 2000); showGlobalFeedback('JSON copied.'); })
                .catch((err: any) => console.error('Failed to copy JSON: ', err));
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
            const { prompt, modifiers: m, constantModifier: cm } = await dissectPrompt(suggestionText, settings, catalog, targetAIModel);
            const flatComponents: Record<string, string> = { prompt, ...m };
            if (cm) flatComponents.constantModifier = cm;
            const result = await generateConstructorPreset(flatComponents, settings, catalog);
            setModifiers({ ...DEFAULT_MODIFIERS, ...result.modifiers });
            setRefineText(result.prompt);
            if (result.constantModifier) setConstantModifier(result.constantModifier);
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

    const handlePasteRefineText = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) setRefineText(prev => prev ? `${prev} ${text}` : text);
        } catch (err) {
            showGlobalFeedback('Clipboard access denied.', true);
        }
    };

    const handleAddCustomOption = useCallback(async (key: string, value: string) => {
        try {
            await modifierOptionsService.addCustomOption(key, value);
            const updated = await modifierOptionsService.loadCustomOptions();
            setCustomOptions(updated);
        } catch (e) {
            console.error('Failed to save custom option', e);
        }
    }, []);

    const handleSendToRefine = (text: string) => {
        if (onSendToBuilder) {
            onSendToBuilder({ prompt: text || '', view: 'enhancer' });
            return;
        }
        setRefineText(text || '');
        setResultsRefine(null);
        setDirectMediaResult(null);
        setErrorRefine(null);
    };

    const handleClearModifier = (key: string) => {
        if (key === 'refineText') setRefineText('');
        else if (key === 'constantModifier') setConstantModifier('');
        else setModifiers((m: any) => ({ ...m, [key]: "" }));
    };

    const handleModifierClick = (tab: RefineSubTab) => {
        setActiveRefineSubTab(tab);
    };

    // Preset handlers
    const handleClearConstruction = () => {
        setRefineText('');
        setConstantModifier('');
        setModifiers({ ...DEFAULT_MODIFIERS });
        setSelectedPreset(null);
        showGlobalFeedback('Construction cleared.');
    };
    const handleConfirmSavePreset = async () => {
        if (!newPresetName.trim()) return;
        setIsSavingPreset(true);
        try {
            const preset: RefinerPreset = { name: newPresetName.trim(), modifiers: { ...modifiers }, targetAIModel, mediaMode, promptLength, constantModifier };
            await refinerPresetService.savePreset(preset);
            await loadPresets();
            setIsSavePresetModalOpen(false);
            showGlobalFeedback('Preset saved to registry.');
        } catch (e) {
            showGlobalFeedback(e instanceof Error ? e.message : 'Failed to save preset.', true);
        } finally { setIsSavingPreset(false); }
    };
    const handleUsePreset = useCallback((presetToUse: RefinerPreset | null = selectedPreset) => {
        if (presetToUse) {
            setModifiers({ ...DEFAULT_MODIFIERS, ...presetToUse.modifiers });
            setTargetAIModel(presetToUse.targetAIModel);
            setMediaMode(presetToUse.mediaMode);
            setPromptLength(presetToUse.promptLength);
            if (presetToUse.constantModifier !== undefined) setConstantModifier(presetToUse.constantModifier);
            if (presetToUse.refineText !== undefined) setRefineText(presetToUse.refineText);
            showGlobalFeedback(`Preset "${presetToUse.name}" applied.`);
        }
    }, [selectedPreset, showGlobalFeedback]);
    const handleDeletePresetClick = () => {
        if (selectedPreset) { setPresetToDelete(selectedPreset); setIsDeletePresetModalOpen(true); }
    };
    const handleConfirmDeletePreset = async () => {
        if (presetToDelete) {
            try {
                await refinerPresetService.deletePreset(presetToDelete.name);
                await loadPresets();
                setSelectedPreset(null);
                showGlobalFeedback('Preset purged.');
            } catch (e) { showGlobalFeedback(e instanceof Error ? e.message : 'Deletion failed.', true); }
        }
        setIsDeletePresetModalOpen(false);
        setPresetToDelete(null);
    };

    // --- Render ---

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 overflow-hidden h-full gap-6 min-h-0">
            {/* Left Sidebar: Controls & Tabs */}
            <motion.aside
                variants={pageVariants}
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
                                onClick={() => { audioService.playClick(); setActiveRefineSubTab(tab.id); }}
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
                        <RefinerModifierControls
                            activeRefineSubTab={activeRefineSubTab}
                            modifiers={modifiers}
                            refineText={refineText}
                            constantModifier={constantModifier}
                            mediaMode={mediaMode}
                            targetAIModel={targetAIModel}
                            promptLength={promptLength}
                            referenceImages={referenceImages}
                            isMidjourney={isMidjourney}
                            isGoogleProduct={isGoogleProduct}
                            artStyles={artStyles}
                            setRefineText={setRefineText}
                            setConstantModifier={setConstantModifier}
                            setMediaMode={setMediaMode}
                            setTargetAIModel={setTargetAIModel}
                            setPromptLength={setPromptLength}
                            setReferenceImages={setReferenceImages}
                            setModifiers={setModifiers}
                            handlePasteRefineText={handlePasteRefineText}
                            customOptions={customOptions}
                            onAddCustomOption={handleAddCustomOption}
                        />
                    </motion.div>
                    <motion.footer
                        variants={pageFooterVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="h-14 flex items-stretch flex-shrink-0 bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 panel-footer"
                    >
                        <button data-ai-id="refiner-reset" onClick={() => { audioService.playClick(); handleResetRefiner(); }}
                            className="btn btn-sm btn-ghost h-full rounded-none flex-1 font-rajdhani tracking-wider text-error/40 hover:text-error border-1 btn-snake">
                            <span /><span /><span /><span />RESET
                        </button>
                        <button
                            data-ai-id="refiner-improve"
                            onClick={() => { audioService.playClick(); handleEnhance(); }}
                            disabled={isLoadingRefine || !(refineText || '').trim()}
                            className="btn btn-sm btn-ghost h-full rounded-none flex-1 tracking-wider text-primary border-1 disabled:opacity-30 disabled:cursor-not-allowed btn-snake">
                            <span /><span /><span /><span />{isLoadingRefine ? '...' : 'IMPROVE'}
                        </button>
                        <button data-ai-id="refiner-export-code" onClick={() => { audioService.playClick(); setIsCodeExportModalOpen(true); }}
                            disabled={!resultsRefine?.suggestions[0]}
                            className="btn btn-sm btn-ghost h-full rounded-none flex-1 tracking-wider text-base-content/40 hover:text-primary border-1 btn-snake">
                            <span /><span /><span /><span />EXPORT CODE
                        </button>
                        {isGoogleProduct && (
                            <button data-ai-id="refiner-render" onClick={() => { audioService.playClick(); handleDirectGenerate(); }}
                                disabled={isLoadingRefine || !(refineText || '').trim()}
                                className="btn btn-sm btn-ghost h-full rounded-none flex-1 tracking-wider text-primary border-0 disabled:opacity-30 disabled:cursor-not-allowed btn-snake">
                                <span /><span /><span /><span />{isLoadingRefine ? '...' : 'RENDER'}
                            </button>
                        )}
                    </motion.footer>
                </div>
                <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
            </motion.aside>

            {/* Center: Main Neural Output */}
            <motion.main
                variants={pageVariants}
                initial="hidden"
                animate={isExiting ? "exit" : "visible"}
                exit="exit"
                className={`lg:col-span-6 h-full min-h-0 flex flex-col relative p-[3px] corner-frame overflow-visible`}
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
                        className="p-6 h-16 flex justify-between items-center bg-base-100/80 backdrop-blur-md panel-header overflow-visible relative z-[800] gap-4"
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
                        className={`flex-grow overflow-y-auto flex flex-col "items-stretch justify-center"`}
                    >
                        <>                        

                                {isLoadingRefine ? (
                                    <div className="flex-grow flex flex-col items-center justify-center text-center space-y-6"><BlobLoader /></div>
                                ) : errorRefine ? (
                                    <div className="flex-grow flex items-center justify-center p-8 w-full h-full absolute inset-0 z-10 pointer-events-none">
                                        <div className="border border-base-content/20 bg-base-200/50 backdrop-blur-md p-8 min-w-[300px] max-w-md text-center flex flex-col items-center gap-4 relative corner-frame shadow-[0_0_30px_oklch(var(--p)/0.2)] pointer-events-auto">
                                            <span className="text-[11px] uppercase tracking-widest opacity-60 font-sf-mono text-primary">System Alert</span>
                                            <span className="font-medium uppercase text-[12px] tracking-widest leading-relaxed text-base-content">{errorRefine.message}</span>
                                        </div>
                                    </div>
                                ) : resultsRefine ? (
                                    <div className="p-5 md:p-5 lg:p-5 w-full animate-fade-in group flex flex-col h-full overflow-y-auto space-y-5">
                                        <div className="flex border-b border-base-content/10 gap-6 mb-1">
                                            <button onClick={() => { audioService.playClick(); setOutputTab('prose'); }}
                                                className={`pb-2.5 text-xs md:text-sm font-bold uppercase tracking-wider transition-all relative ${outputTab === 'prose' ? 'text-primary border-b-2 border-primary' : 'text-base-content/30 hover:text-base-content/60'}`}>✨ Refined Prompt</button>
                                            <button onClick={() => { audioService.playClick(); setOutputTab('diff'); }}
                                                className={`pb-2.5 text-xs md:text-sm font-bold uppercase tracking-wider transition-all relative ${outputTab === 'diff' ? 'text-primary border-b-2 border-primary' : 'text-base-content/30 hover:text-base-content/60'}`}>🔍 Compare Changes</button>
                                        </div>
                                        {outputTab === 'prose' ? (
                                            <div className="flex flex-col">
                                                <p className="text-base font-medium leading-relaxed text-base-content italic selection:bg-primary/20">"{resultsRefine.suggestions[0]}"</p>
                                            </div>
                                        ) : (
                                            <div className="flex-grow flex flex-col space-y-5 animate-fade-in h-full">
                                                {diffAnalysis && (
                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-base-content/5 p-4 rounded border border-base-content/5">
                                                        <div className="flex flex-col justify-between"><span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-base-content/60 leading-none mb-1.5">Original Idea Kept</span><span className="text-xl md:text-2xl font-bold font-mono text-primary leading-none mb-1">{diffAnalysis.metrics.semanticOverlap}%</span><span className="text-[9px] md:text-xs text-base-content/40 font-medium leading-none">Kept your main concept</span></div>
                                                        <div className="flex flex-col justify-between"><span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-base-content/60 leading-none mb-1.5">Added Details</span><span className="text-xl md:text-2xl font-bold font-mono text-primary leading-none mb-1">{diffAnalysis.metrics.expansionRatio}x</span><span className="text-[9px] md:text-xs text-base-content/40 font-medium leading-none">More descriptive words</span></div>
                                                        <div className="flex flex-col justify-between"><span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-base-content/60 leading-none mb.1.5">Style Quality</span><span className="text-xl md:text-2xl font-bold font-mono text-primary leading-none mb-1">{diffAnalysis.metrics.enrichmentPurity}%</span><span className="text-[9px] md:text-xs text-base-content/40 font-medium leading-none">High-quality trigger tags</span></div>
                                                        <div className="flex flex-col justify-between"><span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-base-content/60 leading-none mb-1.5">Aesthetic Upgrade</span><span className="text-xl md:text-2xl font-bold font-mono text-primary leading-none mb-1">{diffAnalysis.metrics.aestheticImprovement}%</span><span className="text-[9px] md:text-xs text-base-content/40 font-medium leading-none">Our computed rating</span></div>
                                                    </div>
                                                )}
                                                <div className="flex-grow flex flex-col space-y-3 min-h-[220px]">
                                                    <span className="text-xs font-bold uppercase tracking-wider text-base-content/50">Word-by-Word Compare View</span>
                                                    <div className="flex-grow border border-base-content/10 bg-base-200/40 p-5 rounded font-mono text-sm md:text-base leading-relaxed overflow-y-auto selection:bg-primary/20">
                                                        {diffAnalysis && diffAnalysis.diff.map((token: any, idx: number) => {
                                                            if (token.type === 'added') return <span key={idx} className="bg-emerald-500/10 text-emerald-400 font-semibold px-1 rounded border border-emerald-500/15 inline-block m-[1px] transition-colors hover:bg-emerald-500/20" title="Added visual descriptor">{token.text}</span>;
                                                            if (token.type === 'removed') return <span key={idx} className="bg-error/10 text-error/60 line-through px-1 rounded border border-error/15 inline-block m-[1px]" title="Original descriptor filtered or modified">{token.text}</span>;
                                                            return <span key={idx} className="text-base-content/80 inline-block m-[1px]">{token.text}</span>;
                                                        })}
                                                    </div>
                                                    <div className="flex gap-6 text-[10px] md:text-xs uppercase text-base-content/40 font-medium">
                                                        <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-emerald-500/20 border border-emerald-500/45 rounded inline-block" /> ✨ New creative details added</div>
                                                        <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-error/20 border border-error/45 rounded inline-block" /> ✂️ Old words cleaned up / rewritten</div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : directMediaResult ? (
                                    <div className="p-8 w-full max-w-4xl space-y-4 animate-fade-in">
                                        <div className="relative group bg-black aspect-video flex items-center justify-center overflow-hidden corner-frame p-[1px]">
                                            <div className="bg-black w-full h-full flex items-center justify-center relative z-10">
                                                {directMediaResult.type === 'video' ? (
                                                    <video src={directMediaResult.url} controls autoPlay loop className="w-full h-full object-contain" />
                                                ) : (
                                                    <img src={directMediaResult.url} alt="Generated result" className="w-full h-full object-contain" referrerPolicy="no-referrer" onError={(e) => { (e.currentTarget as HTMLImageElement).style.filter = 'grayscale(1)'; }} />
                                                )}
                                            </div>
                                            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                                <a href={directMediaResult.url} download={`kollektiv_${directMediaResult.target.replace(/\s+/g, '_')}_${Date.now()}.${directMediaResult.type === 'video' ? 'mp4' : 'jpg'}`} className="btn btn-sm btn-primary rounded-none tracking-widest shadow-2xl btn-snake-primary">
                                                    <span /><span /><span /><span /><DownloadIcon className="w-4 h-4 mr-2" /> EXPORT
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
                            </>
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
                                <button onClick={() => { audioService.playClick(); setIsJsonModalOpen(true); }} className="btn btn-sm btn-ghost h-full flex-1 rounded-none tracking-wider uppercase btn-snake">
                                    <span /><span /><span /><span />SHOW JSON
                                </button>
                                <button onClick={() => { audioService.playClick(); onSaveSuggestion(resultsRefine.suggestions[0]); }} className="btn btn-sm btn-ghost h-full flex-1 rounded-none tracking-wider uppercase btn-snake">
                                    <span /><span /><span /><span />SAVE
                                </button>
                            </div>
                            <div className="flex-[6] flex items-stretch gap-1.5 justify-end">
                                <button onClick={() => { audioService.playClick(); handleSendToRefine(resultsRefine.suggestions[0]); }} className="btn btn-sm btn-ghost h-full flex-1 rounded-none tracking-wider uppercase btn-snake">
                                    <span /><span /><span /><span />REFINE
                                </button>
                                <button onClick={() => { audioService.playClick(); onClipSuggestion(resultsRefine.suggestions[0]); }} className="btn btn-sm btn-ghost h-full flex-1 rounded-none tracking-wider uppercase btn-snake">
                                    <span /><span /><span /><span />CLIP
                                </button>
                                <button onClick={() => { audioService.playClick(); handleCopySuggestionText(resultsRefine.suggestions[0]); }} className="btn btn-sm btn-ghost h-full flex-1 rounded-none tracking-wider uppercase btn-snake">
                                    <span /><span /><span /><span />COPY
                                </button>
                            </div>
                        </motion.footer>
                    )}
                </div>
                <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
            </motion.main>

            {/* Right Sidebar: Presets */}
            <motion.aside
                variants={pageVariants}
                initial="hidden"
                animate={isExiting ? "exit" : "visible"}
                exit="exit"
                className="lg:col-span-3 h-full min-h-0 flex flex-col relative p-[3px] corner-frame overflow-visible hidden lg:flex origin-top-left"
            >
                <PanelLine position="top" delay={1.0} />
                <PanelLine position="bottom" delay={1.1} />
                <PanelLine position="left" delay={1.2} />
                <PanelLine position="right" delay={1.3} />
                <ScanLine delay={4.5} />
                <div className="flex flex-col h-full w-full overflow-visible relative bg-base-100/40 backdrop-blur-xl panel-transparent">
                    <motion.header
                        variants={sectionWipeVariants}
                        custom={1.6}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="h-16 flex items-stretch relative z-[800] bg-base-100/80 panel-header overflow-visible"
                    >
                        <div className="flex items-center gap-2 w-full h-full px-3 overflow-visible">
                            <div className="flex-1 min-w-0 overflow-visible flex items-center">
                                <AutocompleteSelect
                                    placeholder="SELECT PRESET..."
                                    value={selectedPreset?.name || ''}
                                    onChange={(v) => {
                                        const preset = presets.find(p => p.name === v) || null;
                                        setSelectedPreset(preset);
                                        if (preset) handleUsePreset(preset);
                                    }}
                                    options={presets.map(p => ({ label: p.name.toUpperCase(), value: p.name }))}
                                />
                            </div>
                            <div className="flex gap-1.5 shrink-0 items-center">
                                <button
                                    onClick={() => { audioService.playClick(); handleClearConstruction(); }}
                                    onMouseEnter={() => audioService.playHover()}
                                    className="font-sf-mono text-[9px] tracking-widest text-base-content/40 hover:text-base-content transition-all bg-base-100/5 px-2 py-1.5 hover:bg-base-100/10"
                                >
                                    CLEAR
                                </button>
                                <button
                                    onClick={() => { audioService.playClick(); handleDeletePresetClick(); }}
                                    onMouseEnter={() => audioService.playHover()}
                                    disabled={!selectedPreset}
                                    className="font-sf-mono text-[9px] tracking-widest text-error/40 hover:text-error transition-all bg-error/5 disabled:bg-transparent px-2 py-1.5 hover:bg-error/10 disabled:opacity-20"
                                >
                                    DELETE
                                </button>
                            </div>
                        </div>
                    </motion.header>
                    <motion.div
                        variants={pageBodyVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="flex-grow overflow-y-auto p-4 space-y-1"
                    >
                        <span className="text-[10px] font-black uppercase tracking-widest text-base-content/30 block mb-4">Active Construction</span>
                        {activeConstructionItems.length === 0 ? (
                            <p className="text-[11px] font-mono text-base-content/20 py-8 text-center">No modifiers active yet.</p>
                        ) : (
                            activeConstructionItems.map((item) => (
                                <PropertyCard
                                    key={item.key}
                                    label={item.label}
                                    value={item.value}
                                    active={activeRefineSubTab === item.tab}
                                    onClick={() => handleModifierClick(item.tab)}
                                    onClear={() => handleClearModifier(item.key)}
                                />
                            ))
                        )}

                    </motion.div>
                    <motion.footer
                        variants={pageFooterVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="h-14 flex items-stretch flex-shrink-0 bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 panel-footer"
                    >
                        <button onClick={() => { audioService.playClick(); handleSaveAsPreset(refineText); }}
                            disabled={!refineText.trim()}
                            className="btn btn-sm btn-ghost h-full flex-1 rounded-none tracking-wider text-primary text-xs disabled:opacity-20 btn-snake">
                            <span /><span /><span /><span />SAVE AS PRESET
                        </button>
                    </motion.footer>
                </div>
            </motion.aside>

            {/* Modals */}
            {isSavePresetModalOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                    <div className="bg-base-200/95 backdrop-blur-xl p-8 border border-primary/20 shadow-[0_0_60px_oklch(var(--p)/0.2)] max-w-md w-full mx-4 relative corner-frame">
                        <div className="flex items-center justify-between mb-6">
                            <span className="text-sm font-black uppercase tracking-widest text-primary">REGISTER PRESET</span>
                            <button onClick={() => setIsSavePresetModalOpen(false)} className="text-base-content/30 hover:text-primary"><CloseIcon className="w-5 h-5" /></button>
                        </div>
                        <div className="form-control mb-4">
                            <label className="text-[10px] font-bold text-base-content/40 uppercase tracking-widest mb-2 block">Name</label>
                            <input type="text" value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)}
                                className="form-input w-full" placeholder="e.g. Cinematic Portrait" autoFocus />
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setIsSavePresetModalOpen(false)} className="btn btn-sm btn-ghost btn-snake">CANCEL</button>
                            <button onClick={handleConfirmSavePreset} disabled={!newPresetName.trim() || isSavingPreset}
                                className="btn btn-sm btn-primary btn-snake-primary">{isSavingPreset ? 'SAVING...' : 'CONFIRM'}</button>
                        </div>
                    </div>
                </div>
            )}

            {isDeletePresetModalOpen && (
                <ConfirmationModal
                    isOpen={isDeletePresetModalOpen}
                    title="DELETE PRESET"
                    message={`Permanently delete "${presetToDelete?.name}"?`}                                    btnClassName="btn-error"
                                    onConfirm={handleConfirmDeletePreset}
                                    onClose={() => { setIsDeletePresetModalOpen(false); setPresetToDelete(null); }}
                />
            )}

            {isJsonModalOpen && jsonData && (
                <JSONBreakdownModal
                    isOpen={isJsonModalOpen}
                    jsonData={jsonData}
                    onClose={() => setIsJsonModalOpen(false)}
                    onCopy={handleCopyJson}
                    onDownload={handleDownloadJson}
                    jsonCopied={jsonCopied}
                />
            )}

            {isCodeExportModalOpen && resultsRefine?.suggestions[0] && (
                <CodeSnippetModal
                    isOpen={isCodeExportModalOpen}
                    promptText={resultsRefine?.suggestions[0] || ''}
                    onClose={() => setIsCodeExportModalOpen(false)}
                />
            )}
        </div>
    );
};

export default RefinerPage;
