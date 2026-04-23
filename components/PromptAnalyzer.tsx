import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useBusy } from '../contexts/BusyContext';
import { dissectPrompt, reconstructPrompt, cleanLLMResponse } from '../services/llmService';
import { audioService } from '../services/audioService';
import useLocalStorage from '../utils/useLocalStorage';
import LoadingSpinner from './LoadingSpinner';
import { 
    CloseIcon, 
    PlusIcon,
    SparklesIcon,
    ArchiveIcon
} from './icons';
import AutocompleteSelect, { AutocompleteOption } from './AutocompleteSelect';
import * as MODIFIERS from '../constants/modifiers';
import type { SavedPrompt } from '../types';
import PromptLibraryModal from './PromptLibraryModal';

interface PromptAnalyzerProps {
    libraryItems: SavedPrompt[];
    onSaveSuggestion: (suggestion: string, title?: string) => void;
    onClip: (text: string, title?: string, lens?: string, source?: string) => void;
    onMapToRefiner: (prompt: string, modifiers: any, constantModifier?: string) => void;
    onSwitchView: (view: 'composer' | 'refine' | 'analyzer' | 'prompt_analyzer') => void;
    header: React.ReactNode;
    showGlobalFeedback: (message: string, isError?: boolean) => void;
}

interface DissectedSegment {
    id: string;
    key: string; // The specific modifier key or 'prompt' or 'constant'
    value: string;
}

// --- Dynamic Textarea Helper ---
const AutoTextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [props.value]);

    return (
        <textarea
            {...props}
            ref={textareaRef}
            className={`w-full overflow-hidden transition-all duration-200 outline-none ${props.className || ''}`}
        />
    );
};

export const PromptAnalyzer: React.FC<PromptAnalyzerProps> = ({
    libraryItems = [],
    onSaveSuggestion,
    onClip,
    onMapToRefiner,
    header,
    showGlobalFeedback
}) => {
    const { settings } = useSettings();
    const { setIsBusy } = useBusy();
    const [promptInput, setPromptInput] = useLocalStorage('analyzer_promptInput', '');
    const [subjectPrompt, setSubjectPrompt] = useLocalStorage('analyzer_subjectPrompt', '');
    const [modifierSegments, setModifierSegments] = useLocalStorage<DissectedSegment[]>('analyzer_modifierSegments', []);
    const [customParameters, setCustomParameters] = useState<{ label: string, value: string }[]>([]);
    const [constantModifier, setConstantModifier] = useLocalStorage('analyzer_constantModifier', '');

    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isRewriting, setIsRewriting] = useState(false);
    const [showAddDropdown, setShowAddDropdown] = useState(false);

    const [reconstructedPrompt, setReconstructedPrompt] = useLocalStorage('analyzer_reconstructedPrompt', '');
    const [showLibraryModal, setShowLibraryModal] = useState(false);
    const [modifiedPrompt, setModifiedPrompt] = useState('');
    const [naturalLanguage, setNaturalLanguage] = useState('');
    const [sourceTab, setSourceTab] = useState<'original' | 'natural'>('original');

    // --- Filters ---
    const availableModifierKeys = useMemo(() => [
        'artStyle', 'artist', 'photographyStyle', 'aestheticLook', 'digitalAesthetic', 'aspectRatio',
        'cameraType', 'cameraModel', 'cameraAngle', 'cameraProximity', 'cameraSettings', 'cameraEffect',
        'specialtyLens', 'lensType', 'filmType', 'filmStock', 'lighting', 'composition',
        'facialExpression', 'hairStyle', 'eyeColor', 'skinTexture', 'clothing',
        'motion', 'cameraMovement', 'mjVersion', 'mjNiji', 'mjAspectRatio', 'zImageStyle'
    ], []);



    // --- Labels & Options Mapping ---
    const getModifierLabel = (key: string) => {
        const labels: Record<string, string> = {
            artStyle: 'Art Style',
            artist: 'Artist',
            photographyStyle: 'Photography Style',
            aestheticLook: 'Cinematic Look',
            digitalAesthetic: 'Digital Aesthetic',
            aspectRatio: 'Aspect Ratio',
            cameraType: 'Camera Body',
            cameraModel: 'Camera Model',
            cameraAngle: 'Camera Angle',
            cameraProximity: 'Framing',
            cameraSettings: 'Camera Settings',
            cameraEffect: 'Camera Effect',
            specialtyLens: 'Specialty Optics',
            lensType: 'Lens Type',
            filmType: 'Film Type',
            filmStock: 'Film Stock',
            lighting: 'Lighting',
            composition: 'Composition',
            facialExpression: 'Facial Expression',
            hairStyle: 'Hair Style',
            eyeColor: 'Eye Color',
            skinTexture: 'Skin Texture',
            clothing: 'Clothing',
            motion: 'Motion',
            cameraMovement: 'Movement',
            mjVersion: 'Midjourney Version',
            mjNiji: 'Niji Version',
            mjAspectRatio: 'MJ Aspect Ratio',
            zImageStyle: 'Z-Image Style'
        };
        if (labels[key]) return labels[key];
        // Humanize dynamic keys (e.g., camelCase to Title Case)
        return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
    };



    const getModifierOptions = (key: string): AutocompleteOption[] => {
        const optMaps: Record<string, any[]> = {
            artStyle: [],
            artist: [],
            photographyStyle: MODIFIERS.PHOTOGRAPHY_STYLES,
            aestheticLook: MODIFIERS.AESTHETIC_LOOKS,
            digitalAesthetic: MODIFIERS.DIGITAL_AESTHETICS,
            aspectRatio: MODIFIERS.GENERAL_ASPECT_RATIOS,
            cameraType: MODIFIERS.CAMERA_TYPES,
            cameraModel: MODIFIERS.ALL_PROFESSIONAL_CAMERA_MODELS,
            cameraAngle: MODIFIERS.CAMERA_ANGLES,
            cameraProximity: MODIFIERS.CAMERA_PROXIMITY,
            cameraSettings: MODIFIERS.CAMERA_SETTINGS,
            cameraEffect: MODIFIERS.CAMERA_EFFECTS,
            specialtyLens: MODIFIERS.SPECIALTY_LENS_EFFECTS,
            lensType: MODIFIERS.LENS_TYPES,
            filmType: MODIFIERS.FILM_TYPES,
            filmStock: MODIFIERS.ANALOG_FILM_STOCKS,
            lighting: MODIFIERS.LIGHTING_OPTIONS,
            composition: MODIFIERS.COMPOSITION_OPTIONS,
            facialExpression: MODIFIERS.FACIAL_EXPRESSIONS,
            hairStyle: MODIFIERS.HAIR_STYLES,
            eyeColor: MODIFIERS.EYE_COLORS,
            skinTexture: MODIFIERS.SKIN_TEXTURES,
            clothing: MODIFIERS.CLOTHING_STYLES,
            motion: MODIFIERS.MOTION_OPTIONS,
            cameraMovement: MODIFIERS.CAMERA_MOVEMENT_OPTIONS,
            mjVersion: MODIFIERS.MIDJOURNEY_VERSIONS,
            mjNiji: MODIFIERS.MIDJOURNEY_NIJI_VERSIONS,
            mjAspectRatio: MODIFIERS.MIDJOURNEY_ASPECT_RATIOS,
            zImageStyle: MODIFIERS.Z_IMAGE_STYLES,
            // Fallback heuristics for custom keys
            environment: MODIFIERS.AUDIO_ENVIRONMENTS,
            mood: MODIFIERS.AUDIO_MOODS,
            texture: MODIFIERS.SKIN_TEXTURES,
            perspective: MODIFIERS.CAMERA_ANGLES
        };

        let rawOpts = optMaps[key] || [];

        // If still empty, try fuzzy matching key name
        if (rawOpts.length === 0) {
            const lowerKey = key.toLowerCase();
            if (lowerKey.includes('light')) rawOpts = MODIFIERS.LIGHTING_OPTIONS;
            else if (lowerKey.includes('camera') || lowerKey.includes('shot')) rawOpts = MODIFIERS.CAMERA_ANGLES;
            else if (lowerKey.includes('style')) rawOpts = MODIFIERS.PHOTOGRAPHY_STYLES;
            else if (lowerKey.includes('mood') || lowerKey.includes('tone')) rawOpts = MODIFIERS.AUDIO_MOODS;
        }

        return rawOpts.map(o => typeof o === 'string' ? { label: o, value: o } : { label: o.name, value: o.name, description: o.description });
    };

    // --- Modifier Catalog for Smart Mapping ---
    const modifierCatalog = useMemo(() => {
        const catalog: string[] = [];
        Object.entries(MODIFIERS).forEach(([key, value]) => {
            if (key === 'MIDJOURNEY_VERSIONS' || key === 'PROMPT_DETAIL_LEVELS') return;
            if (Array.isArray(value)) {
                const values = value.map(v => typeof v === 'string' ? v : (v as any).name).slice(0, 50).join(', ');
                catalog.push(`${key}: ${values}`);
            }
        });
        return catalog.join('\n');
    }, []);

    // --- Dissection Logic ---
    const handleDissect = async (input?: string) => {
        const source = input || promptInput;
        console.log('handleDissect called, source:', source);
        if (!source.trim()) {
            console.log('source is empty, returning');
            return;
        }

        setIsAnalyzing(true);
        setIsBusy(true);
        audioService.playClick();

        try {
            console.log('calling dissectPrompt with:', source);
            const result = await dissectPrompt(source, settings, modifierCatalog);
            console.log('dissectPrompt result:', result);

            if (!result) {
                console.error('No result from dissectPrompt');
                showGlobalFeedback('Analysis returned no result.', true);
                return;
            }

            const newSegments: DissectedSegment[] = [];
            const potentialCustomParams: { label: string, value: string }[] = [];

            console.log('LLM modifiers returned:', result.modifiers);
            console.log('LLM categorizedParameters returned:', result.categorizedParameters);

            Object.entries(result.modifiers).forEach(([key, value]) => {
                const valStr = String(value).trim();
                const isGhost = valStr === '' ||
                    valStr.toLowerCase() === 'none' ||
                    valStr.toLowerCase() === 'n/a' ||
                    valStr.toLowerCase() === 'null' ||
                    valStr.toLowerCase() === 'standard' ||
                    valStr.toLowerCase() === 'default' ||
                    valStr.toLowerCase() === 'undefined' ||
                    valStr.toLowerCase() === '[none]' ||
                    valStr.toLowerCase() === 'not specified';

                if (isGhost) return;

                // Check if this key is "matched" in our system
                if (availableModifierKeys.includes(key)) {
                    console.log('Adding matched modifier:', key, '=', valStr);
                    newSegments.push({
                        id: Math.random().toString(36).substr(2, 9),
                        key,
                        value: valStr
                    });
                } else {
                    console.log('Unmatched modifier found, moving to suggested params:', key);
                    potentialCustomParams.push({ label: key, value: valStr });
                }
            });

            // Remove suggested parameter values from the core prompt
            const allCategorized = [...(result.categorizedParameters || []), ...potentialCustomParams];
            const suggestedValues = allCategorized.map(p => p.value.toLowerCase()).filter(Boolean);
            let cleanedPrompt = result.prompt?.trim() || source;
            suggestedValues.forEach(suggested => {
                if (suggested && cleanedPrompt.toLowerCase().includes(suggested)) {
                    cleanedPrompt = cleanedPrompt.replace(new RegExp(suggested, 'gi'), '').replace(/,\s*,/g, ',').replace(/^,|,$/g, '').trim();
                }
            });

            // Filter suggested parameters - only keep ones with meaningful values
            const validParams: { label: string, value: string }[] = [];
            const seenKeys = new Set<string>();
            const seenValues = new Set<string>();
            
            // Add existing modifier values to seenValues to avoid duplicates
            newSegments.forEach(s => {
                if (s.value.trim()) seenValues.add(s.value.trim().toLowerCase());
            });
            
            // Add subject prompt keywords roughly to avoid echoing the core prompt
            cleanedPrompt.split(',').forEach(p => {
                const val = p.trim().toLowerCase();
                if (val) seenValues.add(val);
            });

            allCategorized.forEach(p => {
                const val = (p.value || '').trim().toLowerCase();
                const label = (p.label || '').trim().toLowerCase();
                
                // Skip invalid values
                if (!val || val === 'none' || val === 'n/a' || val === 'null' || 
                    val === 'undefined' || val === 'not specified' || val === 'default' || 
                    val === 'standard' || val === '[none]') {
                    return;
                }
                
                // Check if we already have this key from modifiers
                const existingModifier = newSegments.find(s => s.key.toLowerCase() === label);
                if (existingModifier && existingModifier.value.trim()) {
                    return;
                }

                // Remove duplicate of Modifiers and Suggested Parameters (when have the same value)
                // Normalize values for better deduplication
                const normalizedVal = val.replace(/--ar\s+/g, '').replace(/--chaos\s+/g, '').trim();
                const isDuplicateValue = Array.from(seenValues).some(v => 
                    v === normalizedVal || 
                    v.includes(normalizedVal) || 
                    normalizedVal.includes(v)
                );

                if (isDuplicateValue) {
                    return;
                }
                
                // Check if we already added this suggested param key
                if (seenKeys.has(label)) {
                    return;
                }
                
                seenKeys.add(label);
                seenValues.add(val);
                validParams.push({ label: p.label, value: p.value });
            });
            
            const finalConstant = result.constantModifier || '';

            // For modifiers with empty values, try to fill from suggested params
            newSegments.forEach((seg, idx) => {
                if (!seg.value.trim()) {
                    const match = validParams.find(p => p.label.toLowerCase() === seg.key.toLowerCase());
                    if (match) {
                        newSegments[idx].value = match.value;
                    }
                }
            });

            console.log('Setting state - subjectPrompt:', cleanedPrompt, 'newSegments:', newSegments, 'validParams:', validParams);
            setNaturalLanguage(result.naturalLanguage || '');
            setSubjectPrompt(cleanedPrompt);
            setConstantModifier(finalConstant);
            setModifierSegments(newSegments);
            setCustomParameters(validParams);
            setReconstructedPrompt(source);
            setPromptInput('');
            console.log('State set complete. modifierSegments count:', newSegments.length);
        } catch (err) {
            console.error('Analysis error:', err);
            showGlobalFeedback('Analysis sequence failed.', true);
        } finally {
            setIsAnalyzing(false);
            setIsBusy(false);
        }
    };

    // --- Mapping Logic ---
    const handleMapToRefiner = async () => {
        if (!modifiedPrompt) return;
        audioService.playClick();
        
        try {
            // Copy to clipboard as per "only copy the modified prompt"
            await navigator.clipboard.writeText(modifiedPrompt);
            showGlobalFeedback('Prompt copied & mapped to refiner.');
            
            // Pass ONLY the modified prompt string, resetting other modifiers
            // This satisfies "copy the modified prompt and paste it to prompt refiner page"
            onMapToRefiner(modifiedPrompt, {}, '');
        } catch (err) {
            console.error('Copy/Map error:', err);
            // Still try to map even if clipboard fails (some browsers might block clipboard in iframe)
            onMapToRefiner(modifiedPrompt, {}, '');
        }
    };

    // --- Segment Management ---
    const updateSegment = (id: string, value: string) => {
        setModifierSegments(prev => prev.map(s => s.id === id ? { ...s, value } : s));
    };

    const removeSegment = (id: string) => {
        setModifierSegments(prev => prev.filter(s => s.id !== id));
        audioService.playClick();
    };

    // --- Reconstruct from all parameters ---
    const reconstructFromParameters = useCallback(() => {
        const parts: string[] = [];
        
        // Add subject/core prompt
        if (subjectPrompt) {
            parts.push(subjectPrompt);
        }
        
        // Add all modifier segments with their values
        modifierSegments.forEach(seg => {
            if (seg.value && seg.value.trim()) {
                parts.push(seg.value);
            }
        });
        
        // Add custom parameter values
        customParameters.forEach(param => {
            if (param.value && param.value.trim()) {
                parts.push(`${param.value}`);
            }
        });
        
        // Add constant modifier
        if (constantModifier) {
            parts.push(constantModifier);
        }
        
        return parts.join(', ');
    }, [subjectPrompt, modifierSegments, customParameters, constantModifier]);

    const tokenCount = useMemo(() => {
        const text = reconstructedPrompt || promptInput;
        return Math.ceil(text.length / 4);
    }, [reconstructedPrompt, promptInput]);

    const handleSelectLibraryPrompt = (prompt: SavedPrompt) => {
        setPromptInput(prompt.text);
    };

    const hasBreakdown = subjectPrompt || modifierSegments.length > 0;

    return (
        <div className="flex flex-col h-full relative overflow-hidden shadow-none">
            {/* Header integration */}
            <div className="flex-shrink-0">
                {header}
            </div>

            <div className="flex-grow grid grid-cols-1 xl:grid-cols-12 gap-4 min-h-0 overflow-hidden">

                {/* Left Section: Input / Dissection */}
                <section className="xl:col-span-7 h-full min-h-0 flex flex-col relative p-[3px] corner-frame overflow-visible">
                    <div className="flex flex-col h-full w-full overflow-hidden relative z-10 bg-base-100/40 backdrop-blur-xl panel-transparent">
                        <div className="px-6 h-14 flex items-center justify-between border-b border-base-content/5 bg-base-100/20 backdrop-blur-md panel-header flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Neural Dissection</h3>
                            </div>
                        </div>

                        <div className="flex-grow overflow-y-auto custom-scrollbar relative">
                            {/* Stable Body Container */}
                            <div className="min-h-full flex flex-col">
                                {!hasBreakdown ? (
                                    <div className="flex-grow flex flex-col p-6 h-full">
                                        <textarea
                                            value={promptInput}
                                            onChange={(e) => setPromptInput(e.target.value)}
                                            placeholder="Enter complex prompt sequence to deconstruct into atomic nodes..."
                                            className="flex-grow w-full bg-base-100/10 border border-base-content/10 focus:border-primary/50 focus:outline-none p-6 font-nunito font-bold text-lg leading-relaxed resize-none transition-all placeholder:text-base-content/40 rounded-none shadow-inner"
                                        />
                                    </div>
                                ) : (
                                    <div className="p-6 space-y-8 flex-grow">
                                        {/* Core Prompt Section */}
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40 block">Subject / Core Idea</label>
                                            <AutoTextArea
                                                value={subjectPrompt}
                                                onChange={(e) => setSubjectPrompt(e.target.value)}
                                                className="bg-base-100/10 border border-base-content/10 p-4 font-nunito font-bold text-base md:text-lg leading-relaxed focus:border-primary/40 resize-none shadow-inner min-h-[4rem] rounded-none"
                                                placeholder="Core subject matter..."
                                            />
                                        </div>

                                        {/* Active Parameters */}
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-6">
                                                {modifierSegments.map(seg => (
                                                    <div key={seg.id} className="flex flex-col space-y-2 group">
                                                        <div className="flex justify-between items-center px-1">
                                                            <label className="text-[12px] font-black uppercase tracking-widest text-base-content/40">{getModifierLabel(seg.key)}</label>
                                                            <button
                                                                onClick={() => removeSegment(seg.id)}
                                                                className="opacity-0 group-hover:opacity-100 text-error transition-all p-1 hover:bg-error/10 rounded"
                                                            >
                                                                <CloseIcon className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                        <AutocompleteSelect
                                                            options={getModifierOptions(seg.key)}
                                                            value={seg.value}
                                                            onChange={(val) => updateSegment(seg.id, val)}
                                                            placeholder={`Select ${getModifierLabel(seg.key)}...`}
                                                            className="w-full h-10 rounded-none bg-base-100/5 focus:bg-base-100/10 transition-colors"
                                                        />
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="flex justify-center pt-2">
                                                <div className="relative w-full">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            setShowAddDropdown(!showAddDropdown);
                                                        }}
                                                        className="w-full h-10 border border-dashed border-base-content/10 hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-base-content/20 hover:text-primary/60 cursor-pointer rounded-none bg-base-100/5"
                                                    >
                                                        <PlusIcon className="w-4 h-4" /> ADD MODIFIERS
                                                    </button>
                                                    {showAddDropdown && (
                                                        <div 
                                                            className="absolute z-50 mt-1 w-full p-2 border border-base-content/10 bg-base-200 max-h-[15rem] overflow-y-auto custom-scrollbar rounded-none shadow-lg"
                                                            onClick={(e) => e.preventDefault()}
                                                        >
                                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1">
                                                                {availableModifierKeys.filter(k => !modifierSegments.some(s => s.key === k)).length === 0 ? (
                                                                    <div className="text-[10px] text-base-content/40 p-2 col-span-full">All modifiers added</div>
                                                                ) : (
                                                                    availableModifierKeys.filter(k => !modifierSegments.some(s => s.key === k)).map(key => (
                                                                        <button
                                                                            key={key}
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setModifierSegments((prev) => {
                                                                                    const newSegment = {
                                                                                        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
                                                                                        key,
                                                                                        value: ''
                                                                                    };
                                                                                    return [...prev, newSegment];
                                                                                });
                                                                                audioService.playClick();
                                                                                setShowAddDropdown(false);
                                                                            }}
                                                                            className="w-full text-left text-[9px] font-bold uppercase tracking-widest py-2 px-2 hover:bg-primary/20 rounded-none"
                                                                        >
                                                                            {getModifierLabel(key)}
                                                                        </button>
                                                                    ))
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Custom Parameters Section */}
                                            {customParameters.length > 0 && (
                                                <div className="pt-6 border-t border-base-content/5 mt-4 space-y-4">
                                                    <div className="flex items-center justify-between px-1">
                                                        <label className="text-[12px] font-black uppercase tracking-widest text-base-content/40">Suggested Parameters</label>
                                                        <span className="text-[12px] font-mono opacity-40 uppercase tracking-tighter">{customParameters.length}/10</span>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4">
                                                        {customParameters.slice(0, 10).map((param, index) => (
                                                            <div key={index} className="flex flex-col space-y-1">
                                                                <span className="text-[12px] font-bold uppercase tracking-widest text-primary/60">{param.label}</span>
                                                                <input
                                                                    value={param.value}
                                                                    onChange={(e) => {
                                                                        const next = [...customParameters];
                                                                        next[index].value = e.target.value;
                                                                        setCustomParameters(next);
                                                                    }}
                                                                    className="w-full h-10 px-3 rounded-none bg-base-100/10 border border-base-content/10 text-[14px] focus:border-primary/40 focus:outline-none"
                                                                    placeholder="Value..."
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <footer className="h-14 flex-shrink-0 border-t border-base-content/5 bg-base-100/20 backdrop-blur-md p-1.5 gap-1.5 flex items-stretch">
                            <div className="flex flex-1 items-stretch gap-1.5">
                                {!hasBreakdown && (
                                    <button
                                        onClick={async () => {
                                            try {
                                                const text = await (window as any).navigator.clipboard.readText();
                                                if (text) setPromptInput(text);
                                            } catch { }
                                        }}
                                        className="btn btn-sm btn-ghost h-full flex-1 rounded-none font-normal text-[11px] tracking-widest uppercase btn-snake font-display min-h-0"
                                    >
                                        <span /><span /><span /><span />
                                        PASTE
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        if (hasBreakdown) {
                                            setSubjectPrompt('');
                                            setModifierSegments([]);
                                            setCustomParameters([]);
                                            setConstantModifier('');
                                            setReconstructedPrompt('');
                                            setModifiedPrompt('');
                                            setPromptInput('');
                                            setNaturalLanguage('');
                                        } else {
                                            setPromptInput('');
                                        }
                                    }}
                                    className="btn btn-sm btn-ghost h-full flex-1 rounded-none font-normal text-[11px] tracking-widest uppercase btn-snake font-display min-h-0"
                                >
                                    <span /><span /><span /><span />
                                    {hasBreakdown ? 'RESET' : 'CLEAR'}
                                </button>
                                <button
                                    onClick={async () => {
                                        if (hasBreakdown) {
                                            const modifiedText = reconstructFromParameters();
                                            if (!modifiedText.trim()) return;
                                            
                                            setIsRewriting(true);
                                            audioService.playClick();
                                            
                                            const hasModifications = modifierSegments.length > 0 || 
                                                customParameters.some(p => p.value) || 
                                                constantModifier;
                                            
                                            if (hasModifications) {
                                                try {
                                                    const components = { prompt: modifiedText };
                                                    const result = await reconstructPrompt(components, settings);
                                                    setModifiedPrompt(cleanLLMResponse(result));
                                                } catch (err) {
                                                    console.error('Rewrite error:', err);
                                                    showGlobalFeedback('Rewrite failed.', true);
                                                    setModifiedPrompt(modifiedText);
                                                } finally {
                                                    setIsRewriting(false);
                                                }
                                            } else {
                                                setModifiedPrompt(reconstructedPrompt || promptInput);
                                                setIsRewriting(false);
                                            }
                                        } else {
                                            handleDissect();
                                        }
                                    }}
                                    disabled={isAnalyzing || isRewriting || (!hasBreakdown && !promptInput.trim())}
                                    className="btn btn-sm btn-primary h-full flex-1 rounded-none font-bold text-[11px] tracking-widest uppercase btn-snake font-display min-h-0"
                                >
                                    <span /><span /><span /><span />
                                    {isAnalyzing ? 'WAIT...' : isRewriting ? 'WRITING...' : hasBreakdown ? 'REWRITE' : 'ANALYZE'}
                                </button>
                            </div>
                        </footer>
                    </div>
                </section>

                {/* Right Section: Results / Integration */}
                <section className="xl:col-span-5 h-full min-h-0 flex flex-col relative p-[3px] corner-frame overflow-visible">
                    <div className="flex flex-col h-full w-full overflow-hidden relative z-10 bg-base-100/40 backdrop-blur-xl panel-transparent">
                        <div className="px-6 h-14 flex items-center justify-between border-b border-base-content/5 bg-base-100/20 backdrop-blur-md panel-header flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60">Live Reconstruction</h3>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] font-mono text-primary animate-pulse">{tokenCount} TOKENS</span>
                            </div>
                        </div>
                        <div className="flex-grow overflow-y-auto custom-scrollbar p-6">
                            <div className="h-full flex flex-col overflow-hidden">
                                {/* Source Tab Container */}
                                <div className="flex-1 flex flex-col min-h-0 overflow-hidden border-b border-base-content/5">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setSourceTab('original')}
                                                className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 transition-all ${
                                                    sourceTab === 'original' 
                                                    ? 'text-primary' 
                                                    : 'text-base-content/40 hover:text-base-content/60'
                                                }`}
                                            >
                                                ORIGINAL
                                            </button>
                                            {naturalLanguage && (
                                                <button
                                                    type="button"
                                                    onClick={() => setSourceTab('natural')}
                                                    className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 transition-all ${
                                                        sourceTab === 'natural' 
                                                        ? 'text-secondary' 
                                                        : 'text-base-content/40 hover:text-base-content/60'
                                                    }`}
                                                >
                                                    NATURAL
                                                </button>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => {
                                                const textToCopy = sourceTab === 'original' ? (promptInput || reconstructedPrompt) : naturalLanguage;
                                                if (textToCopy) {
                                                    navigator.clipboard.writeText(textToCopy);
                                                    showGlobalFeedback('Source prompt copied');
                                                }
                                            }}
                                            className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/40 hover:text-primary transition-colors px-3 py-1.5"
                                        >
                                            COPY
                                        </button>
                                    </div>
                                    <div className="flex-1 relative group flex flex-col p-4 bg-base-100/5 border border-base-content/5 overflow-y-auto custom-scrollbar">
                                        {isAnalyzing ? (
                                            <div className="h-full flex items-center justify-center">
                                                <LoadingSpinner size={32} />
                                            </div>
                                        ) : (promptInput || reconstructedPrompt || naturalLanguage) ? (
                                            <blockquote className="text-base md:text-lg font-nunito font-bold italic leading-relaxed tracking-tight text-base-content selection:bg-primary/20 pb-4">
                                                "{sourceTab === 'original' 
                                                    ? (promptInput || reconstructedPrompt || '...') 
                                                    : (naturalLanguage || '...')}"
                                            </blockquote>
                                        ) : (
                                            <div className="h-full flex items-center justify-center opacity-10">
                                                <ArchiveIcon className="w-12 h-12" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {/* Modified Prompt Container */}
                                <div className="flex-1 flex flex-col min-h-0 overflow-hidden pt-2">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-primary px-3 py-1.5">Result</label>
                                    </div>
                                    <div className="flex-1 relative group flex flex-col p-4 bg-base-100/10 border border-primary/20 overflow-y-auto custom-scrollbar">
                                        {isRewriting ? (
                                            <div className="h-full flex items-center justify-center">
                                                <LoadingSpinner size={32} />
                                            </div>
                                        ) : modifiedPrompt ? (
                                            <blockquote className="text-base md:text-lg font-nunito font-bold italic leading-relaxed tracking-tight text-base-content selection:bg-primary/20 pb-4">
                                                "{modifiedPrompt}"
                                            </blockquote>
                                        ) : (
                                            <div className="h-full flex items-center justify-center opacity-10">
                                                <SparklesIcon className="w-12 h-12" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <footer className="h-14 flex-shrink-0 flex items-stretch border-t border-base-content/5 bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 panel-footer">
                            <div className="flex flex-1 w-full h-full items-stretch gap-1.5">
                                <button
                                    onClick={() => {
                                        if (modifiedPrompt) {
                                            navigator.clipboard.writeText(modifiedPrompt);
                                            showGlobalFeedback('Copied to clipboard');
                                        }
                                    }}
                                    disabled={!modifiedPrompt || isRewriting}
                                    className="btn btn-sm btn-ghost h-full flex-1 rounded-none font-normal text-[11px] tracking-widest uppercase btn-snake font-display"
                                >
                                    <span /><span /><span /><span />
                                    COPY
                                </button>
                                <button
                                    onClick={() => {
                                        if (modifiedPrompt && onClip) {
                                            onClip(modifiedPrompt, 'Rewritten Prompt');
                                        }
                                    }}
                                    disabled={!modifiedPrompt || isRewriting}
                                    className="btn btn-sm btn-ghost h-full flex-1 rounded-none font-normal text-[11px] tracking-widest uppercase btn-snake font-display"
                                >
                                    <span /><span /><span /><span />
                                    CLIP
                                </button>
                                <button
                                    onClick={handleMapToRefiner}
                                    disabled={!modifiedPrompt || isRewriting}
                                    className="btn btn-sm btn-ghost h-full flex-1 rounded-none font-normal text-[11px] tracking-widest uppercase btn-snake font-display"
                                >
                                    <span /><span /><span /><span />
                                    REFINE
                                </button>
                                <button
                                    onClick={() => {
                                        if (modifiedPrompt && onSaveSuggestion) {
                                            onSaveSuggestion(modifiedPrompt, 'Rewritten Prompt');
                                            showGlobalFeedback('Saved to library');
                                        }
                                    }}
                                    disabled={!modifiedPrompt || isRewriting}
                                    className="btn btn-sm btn-ghost h-full flex-1 rounded-none font-normal text-[11px] tracking-widest uppercase btn-snake font-display"
                                >
                                    <span /><span /><span /><span />
                                    SAVE
                                </button>
                            </div>
                        </footer>

                        <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
                        <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
                        <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
                        <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
                    </div>
                </section>
            </div>

            {/* Ambient Frames */}
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
            <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

            {/* Library Modal */}
            <PromptLibraryModal
                isOpen={showLibraryModal}
                onClose={() => setShowLibraryModal(false)}
                libraryItems={libraryItems}
                onSelect={handleSelectLibraryPrompt}
            />
        </div>
    );
};
