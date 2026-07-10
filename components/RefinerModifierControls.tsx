// RefinerModifierControls.tsx - Extracted modifier control panel
import React from 'react';
import { audioService } from '../services/audioService';
import type { PromptModifiers, CheatsheetCategory } from '../types';
import {
    GENERAL_ASPECT_RATIOS, PROMPT_DETAIL_LEVELS, CAMERA_ANGLES, CAMERA_PROXIMITY,
    LIGHTING_OPTIONS, COMPOSITION_OPTIONS, CAMERA_TYPES, CAMERA_MODELS_BY_TYPE,
    ALL_PROFESSIONAL_CAMERA_MODELS, CAMERA_SETTINGS, CAMERA_EFFECTS, SPECIALTY_LENS_EFFECTS,
    LENS_TYPES, ANALOG_FILM_STOCKS, PHOTOGRAPHY_STYLES, DIGITAL_AESTHETICS, AESTHETIC_LOOKS,
    MOTION_OPTIONS, CAMERA_MOVEMENT_OPTIONS, VIDEO_EFFECTS, MIDJOURNEY_VERSIONS,
    MIDJOURNEY_NIJI_VERSIONS, MIDJOURNEY_ASPECT_RATIOS, Z_IMAGE_STYLES, AUDIO_TYPES,
    VOICE_GENDERS, VOICE_TONES, AUDIO_ENVIRONMENTS, AUDIO_MOODS, FACIAL_EXPRESSIONS,
    HAIR_STYLES, EYE_COLORS, SKIN_TEXTURES, REALISM_OPTIONS, CLOTHING_STYLES
} from '../constants/modifiers';
import { TARGET_IMAGE_AI_MODELS, TARGET_VIDEO_AI_MODELS, TARGET_AUDIO_AI_MODELS } from '../constants/models';
import AutocompleteSelect from './AutocompleteSelect';
import { Cog6ToothIcon } from './icons';
import { ReferenceSlot } from './RefinerSlots';

export type RefineSubTab = 'basic' | 'styling' | 'photography' | 'motion' | 'audio' | 'platform';

interface RefinerModifierControlsProps {
    activeRefineSubTab: RefineSubTab;
    modifiers: PromptModifiers;
    refineText: string;
    constantModifier: string;
    mediaMode: 'image' | 'video' | 'audio';
    targetAIModel: string;
    promptLength: string;
    referenceImages: (string | null)[];
    isMidjourney: boolean;
    isGoogleProduct: boolean;
    artStyles: CheatsheetCategory[];
    artists: CheatsheetCategory[];
    setRefineText: (v: string) => void;
    setConstantModifier: (v: string) => void;
    setMediaMode: (m: 'image' | 'video' | 'audio') => void;
    setTargetAIModel: (m: string) => void;
    setPromptLength: (v: string) => void;
    setReferenceImages: (v: (string | null)[]) => void;
    setModifiers: (m: PromptModifiers | ((prev: PromptModifiers) => PromptModifiers)) => void;
    handlePasteRefineText: () => void;
}

export const RefinerModifierControls: React.FC<RefinerModifierControlsProps> = ({
    activeRefineSubTab, modifiers, refineText, constantModifier, mediaMode,
    targetAIModel, promptLength, referenceImages, isMidjourney, isGoogleProduct,
    artStyles, artists, setRefineText, setConstantModifier, setMediaMode,
    setTargetAIModel, setPromptLength, setReferenceImages, setModifiers,
    handlePasteRefineText
}) => {
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
                    <div className="grid grid-cols-2 gap-6">
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
                        <input type="range" min="0" max="100" value={modifiers.creativity ?? 70}
                            onChange={e => setModifiers({ ...modifiers, creativity: parseInt(e.target.value) })}
                            className="range range-xs range-primary" />
                        <div className="flex justify-between px-1 mt-2">
                            <span className="text-[10px] tracking-[0.3em] font-black opacity-20 uppercase">Accurate</span>
                            <span className="text-[10px] tracking-[0.3em] font-black opacity-20 uppercase">Creative</span>
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
                            <AutocompleteSelect value={modifiers.artStyle || ''}
                                onChange={(v) => setModifiers({ ...modifiers, artStyle: v })}
                                options={[...artStyles.flatMap(c => c.items.map(i => ({ label: i.name.toUpperCase(), value: i.name }))),
                                    ...Z_IMAGE_STYLES.map(s => ({ label: `${s.toUpperCase()} (Z-VARIANT)`, value: s }))]}
                                placeholder="Discipline..." />
                        </div>
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Styling Trends</label>
                            <AutocompleteSelect value={modifiers.artist || ''} onChange={(v) => setModifiers({ ...modifiers, artist: v })}
                                options={artists.flatMap(c => c.items.map(i => ({ label: i.name.toUpperCase(), value: i.name })))} placeholder="Creator influence..." />
                        </div>
                    </div>
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Aesthetics Look</label>
                        <AutocompleteSelect value={modifiers.aestheticLook || ''} onChange={(v) => setModifiers({ ...modifiers, aestheticLook: v })}
                            options={AESTHETIC_LOOKS.map(l => ({ label: l.name.toUpperCase(), value: l.name, description: l.description }))} placeholder="Look..." />
                    </div>
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Digital Trend</label>
                        <AutocompleteSelect value={modifiers.digitalAesthetic || ''} onChange={(v) => setModifiers({ ...modifiers, digitalAesthetic: v })}
                            options={DIGITAL_AESTHETICS.map(t => ({ label: t.name.toUpperCase(), value: t.name, description: t.description }))} placeholder="Trend..." />
                    </div>
                    <div className="pt-4">
                        <label className="text-[10px] font-black uppercase text-primary tracking-[0.3em] mb-4 block">Persona</label>
                        <div className="grid grid-cols-1 gap-4">
                            <div className="form-control">
                                <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Facial Expressions</label>
                                <AutocompleteSelect value={modifiers.facialExpression || ''} onChange={(v) => setModifiers({ ...modifiers, facialExpression: v })}
                                    options={FACIAL_EXPRESSIONS.map(e => ({ label: e.toUpperCase(), value: e }))} placeholder="Expression..." />
                            </div>
                            <div className="form-control">
                                <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Hair Styles</label>
                                <AutocompleteSelect value={modifiers.hairStyle || ''} onChange={(v) => setModifiers({ ...modifiers, hairStyle: v })}
                                    options={HAIR_STYLES.map(h => ({ label: h.toUpperCase(), value: h }))} placeholder="Hair..." />
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                                <div className="form-control">
                                    <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Eye Color</label>
                                    <AutocompleteSelect value={modifiers.eyeColor || ''} onChange={(v) => setModifiers({ ...modifiers, eyeColor: v })}
                                        options={EYE_COLORS.map(e => ({ label: e.toUpperCase(), value: e }))} placeholder="Eyes..." />
                                </div>
                                <div className="form-control">
                                    <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Skin Texture</label>
                                    <AutocompleteSelect value={modifiers.skinTexture || ''} onChange={(v) => setModifiers({ ...modifiers, skinTexture: v })}
                                        options={SKIN_TEXTURES.map(s => ({ label: s.toUpperCase(), value: s }))} placeholder="Skin..." />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                                <div className="form-control">
                                    <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Realism Options</label>
                                    <AutocompleteSelect value={modifiers.realism || ''} onChange={(v) => setModifiers({ ...modifiers, realism: v })}
                                        options={REALISM_OPTIONS.map(r => ({ label: r.toUpperCase(), value: r }))} placeholder="Realism..." />
                                </div>
                                <div className="form-control">
                                    <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Clothing & Outfit</label>
                                    <AutocompleteSelect value={modifiers.clothing || ''} onChange={(v) => setModifiers({ ...modifiers, clothing: v })}
                                        options={CLOTHING_STYLES.map(c => ({ label: c.toUpperCase(), value: c }))} placeholder="Outfit..." />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        case 'photography':
            const modelOptions = (modifiers.cameraType && CAMERA_MODELS_BY_TYPE[modifiers.cameraType]
                ? CAMERA_MODELS_BY_TYPE[modifiers.cameraType] : ALL_PROFESSIONAL_CAMERA_MODELS)
                .map(m => ({ label: m.toUpperCase(), value: m }));
            return (
                <div className="space-y-6 animate-fade-in">
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Photo Genre</label>
                        <AutocompleteSelect value={modifiers.photographyStyle || ''} onChange={(v) => setModifiers({ ...modifiers, photographyStyle: v })}
                            options={PHOTOGRAPHY_STYLES.map(s => ({ label: s.toUpperCase(), value: s }))} placeholder="Genre..." />
                    </div>
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Aspect Ratio</label>
                        <select value={modifiers.aspectRatio || ''} onChange={(e) => setModifiers({ ...modifiers, aspectRatio: e.target.value })}
                            className="form-select w-full font-mono">
                            <option value="">SELECT ASPECT RATIO...</option>
                            {GENERAL_ASPECT_RATIOS.map(ratio => <option key={ratio} value={ratio}>{ratio}</option>)}
                        </select>
                    </div>
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Camera Body Type</label>
                        <select value={modifiers.cameraType || ''} onChange={(e) => setModifiers({ ...modifiers, cameraType: (e.currentTarget as any).value, cameraModel: "" })}
                            className="form-select w-full">
                            <option value="">SELECT TYPE...</option>
                            {CAMERA_TYPES.map(type => <option key={type} value={type}>{type.toUpperCase()}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Professional Camera Model</label>
                            <AutocompleteSelect value={modifiers.cameraModel || ''} onChange={(v) => setModifiers({ ...modifiers, cameraModel: v })}
                                options={modelOptions} placeholder="Search models..." />
                        </div>
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Film Stock</label>
                            <AutocompleteSelect value={modifiers.filmStock || ''} onChange={(v) => setModifiers({ ...modifiers, filmStock: v })}
                                options={ANALOG_FILM_STOCKS.map(s => ({ label: s.toUpperCase(), value: s }))} placeholder="Stock..." />
                        </div>
                    </div>
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Specialty Optics</label>
                        <AutocompleteSelect value={modifiers.specialtyLens || ''} onChange={(v) => setModifiers({ ...modifiers, specialtyLens: v })}
                            options={SPECIALTY_LENS_EFFECTS.map(l => ({ label: l.name.toUpperCase(), value: l.name, description: l.description }))} placeholder="Informative Vintage/Unique optics..." />
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Lens Type</label>
                            <AutocompleteSelect value={modifiers.lensType || ''} onChange={(v) => setModifiers({ ...modifiers, lensType: v })}
                                options={LENS_TYPES.map(l => ({ label: l.toUpperCase(), value: l }))} placeholder="Glass..." />
                        </div>
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Shot Angle</label>
                            <AutocompleteSelect value={modifiers.cameraAngle || ''} onChange={(v) => setModifiers({ ...modifiers, cameraAngle: v })}
                                options={CAMERA_ANGLES.map(a => ({ label: a.toUpperCase(), value: a }))} placeholder="Angle..." />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Shot Proximity</label>
                            <AutocompleteSelect value={modifiers.cameraProximity || ''} onChange={(v) => setModifiers({ ...modifiers, cameraProximity: v })}
                                options={CAMERA_PROXIMITY.map(p => ({ label: p.toUpperCase(), value: p }))} placeholder="Distance..." />
                        </div>
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Technical Settings</label>
                            <AutocompleteSelect value={modifiers.cameraSettings || ''} onChange={(v) => setModifiers({ ...modifiers, cameraSettings: v })}
                                options={CAMERA_SETTINGS.map(s => ({ label: s.toUpperCase(), value: s }))} placeholder="Technical..." />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Camera Distortion</label>
                            <AutocompleteSelect value={modifiers.cameraEffect || ''} onChange={(v) => setModifiers({ ...modifiers, cameraEffect: v })}
                                options={CAMERA_EFFECTS.map(s => ({ label: s.toUpperCase(), value: s }))} placeholder="Aberration..." />
                        </div>
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Lighting Rig</label>
                            <AutocompleteSelect value={modifiers.lighting || ''} onChange={(v) => setModifiers({ ...modifiers, lighting: v })}
                                options={LIGHTING_OPTIONS.map(l => ({ label: l.toUpperCase(), value: l }))} placeholder="Lighting..." />
                        </div>
                    </div>
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Composition Layout</label>
                        <AutocompleteSelect value={modifiers.composition || ''} onChange={(v) => setModifiers({ ...modifiers, composition: v })}
                            options={COMPOSITION_OPTIONS.map(c => ({ label: c.toUpperCase(), value: c }))} placeholder="Layout..." />
                    </div>
                </div>
            );
        case 'motion':
            return (
                <div className="space-y-6 animate-fade-in">
                    <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest block">Generation Method</label>
                    <div className="form-tab-group">
                        <button onClick={() => { audioService.playClick(); setModifiers({ ...modifiers, videoInputType: 't2v' }); }}
                            className={`form-tab-item ${modifiers.videoInputType === 't2v' ? 'active' : ''}`}>TEXT-2-VID</button>
                        <button onClick={() => { audioService.playClick(); setModifiers({ ...modifiers, videoInputType: 'i2v' }); }}
                            className={`form-tab-item ${modifiers.videoInputType === 'i2v' ? 'active' : ''}`}>IMG-2-VID</button>
                    </div>
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Motion</label>
                        <AutocompleteSelect value={modifiers.motion || ''} onChange={(v) => setModifiers({ ...modifiers, motion: v })}
                            options={MOTION_OPTIONS.map(m => ({ label: m.name.toUpperCase(), value: m.name, description: m.description }))} placeholder="Motion..." />
                    </div>
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Pathing</label>
                        <AutocompleteSelect value={modifiers.cameraMovement || ''} onChange={(v) => setModifiers({ ...modifiers, cameraMovement: v })}
                            options={CAMERA_MOVEMENT_OPTIONS.map(m => ({ label: m.name.toUpperCase(), value: m.name, description: m.description }))} placeholder="Pathing..." />
                    </div>
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Video Effects</label>
                        <AutocompleteSelect value={modifiers.videoEffect || ''} onChange={(v) => setModifiers({ ...modifiers, videoEffect: v })}
                            options={VIDEO_EFFECTS.map(v => ({ label: v.toUpperCase(), value: v }))} placeholder="Effects..." />
                    </div>
                </div>
            );
        case 'audio':
            return (
                <div className="grid grid-cols-1 gap-6 animate-fade-in">
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Audio Category</label>
                        <AutocompleteSelect value={modifiers.audioType || ''} onChange={(v) => setModifiers({ ...modifiers, audioType: v })}
                            options={AUDIO_TYPES.map(t => ({ label: t.toUpperCase(), value: t }))} placeholder="Type..." />
                    </div>
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Voice Profile</label>
                        <AutocompleteSelect value={modifiers.voiceGender || ''} onChange={(v) => setModifiers({ ...modifiers, voiceGender: v })}
                            options={VOICE_GENDERS.map(g => ({ label: g.toUpperCase(), value: g }))} placeholder="Gender..." />
                    </div>
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Voice Tone</label>
                        <AutocompleteSelect value={modifiers.voiceTone || ''} onChange={(v) => setModifiers({ ...modifiers, voiceTone: v })}
                            options={VOICE_TONES.map(t => ({ label: t.toUpperCase(), value: t }))} placeholder="Tone..." />
                    </div>
                    <div className="form-control">
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-[10px] font-normal text-[12px] font-sf-mono uppercase tracking-widest">Targeted Duration</label>
                            <span className="text-[10px] font-mono font-bold text-primary">{modifiers.audioDuration}s</span>
                        </div>
                        <input type="range" min="1" max="120" value={modifiers.audioDuration}
                            onChange={e => setModifiers({ ...modifiers, audioDuration: e.target.value })}
                            className="range range-xs range-primary" />
                    </div>
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Acoustic Environment</label>
                        <AutocompleteSelect value={modifiers.audioEnvironment || ''} onChange={(v) => setModifiers({ ...modifiers, audioEnvironment: v })}
                            options={AUDIO_ENVIRONMENTS.map(e => ({ label: e.toUpperCase(), value: e }))} placeholder="Environment..." />
                    </div>
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest mb-2 block">Audio Mood</label>
                        <AutocompleteSelect value={modifiers.audioMood || ''} onChange={(v) => setModifiers({ ...modifiers, audioMood: v })}
                            options={AUDIO_MOODS.map(m => ({ label: m.toUpperCase(), value: m }))} placeholder="Mood..." />
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
                                    <select value={modifiers.mjVersion} onChange={e => setModifiers({ ...modifiers, mjVersion: e.target.value, mjNiji: "" })}
                                        className="form-select w-full">
                                        {MIDJOURNEY_VERSIONS.map(v => <option key={v} value={v}>V {v}</option>)}
                                    </select>
                                </div>
                                <div className="form-control">
                                    <label className="text-[10px] font-black uppercase text-base-content/40 mb-2">Niji (Anime)</label>
                                    <select value={modifiers.mjNiji} onChange={e => setModifiers({ ...modifiers, mjNiji: e.target.value as any, mjVersion: "" })}
                                        className="form-select w-full">
                                        <option value="">OFF</option>
                                        {MIDJOURNEY_NIJI_VERSIONS.map(v => <option key={v} value={v}>Niji {v}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="form-control">
                                <label className="text-[10px] font-black uppercase text-base-content/40 mb-2">Aspect Ratio (--ar)</label>
                                <select value={modifiers.mjAspectRatio} onChange={e => setModifiers({ ...modifiers, mjAspectRatio: e.target.value })}
                                    className="form-select w-full">
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
                                    <input type="range" min="0" max="1000" value={modifiers.mjStylize}
                                        onChange={e => setModifiers({ ...modifiers, mjStylize: e.target.value })}
                                        className="range range-xs range-primary" />
                                </div>
                                <div className="form-control">
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest">Chaos (--c)</label>
                                        <span className="text-[10px] font-mono font-bold text-primary">{modifiers.mjChaos}</span>
                                    </div>
                                    <input type="range" min="0" max="100" value={modifiers.mjChaos}
                                        onChange={e => setModifiers({ ...modifiers, mjChaos: e.target.value })}
                                        className="range range-xs range-primary" />
                                </div>
                                <div className="form-control">
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-[10px] font-black uppercase text-base-content/40 tracking-widest">Weird (--weird)</label>
                                        <span className="text-[10px] font-mono font-bold text-primary">{modifiers.mjWeird}</span>
                                    </div>
                                    <input type="range" min="0" max="3000" value={modifiers.mjWeird}
                                        onChange={e => setModifiers({ ...modifiers, mjWeird: e.target.value })}
                                        className="range range-xs range-primary" />
                                </div>
                            </div>
                            <div className="form-control">
                                <label className="text-[10px] font-black uppercase text-base-content/40 mb-2">Negative Constraints (--no)</label>
                                <input type="text" value={modifiers.mjNo} onChange={e => setModifiers({ ...modifiers, mjNo: e.target.value })}
                                    className="form-input w-full" placeholder="objects to exclude..." />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <label className="label cursor-pointer justify-start gap-4">
                                    <span className="text-[10px] font-black uppercase text-base-content/40">Seamless (--tile)</span>
                                    <input type="checkbox" checked={modifiers.mjTile} onChange={e => setModifiers({ ...modifiers, mjTile: e.target.checked })}
                                        className="checkbox checkbox-primary rounded-none checkbox-xs" />
                                </label>
                                <div className="form-control">
                                    <select value={modifiers.mjStyle} onChange={e => setModifiers({ ...modifiers, mjStyle: e.target.value as any })}
                                        className="form-select w-full">
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
                                        <ReferenceSlot key={idx} url={img} index={idx}
                                            onUpload={(b64) => { const next = [...referenceImages]; next[idx] = b64; setReferenceImages(next); }}
                                            onRemove={() => { const next = [...referenceImages]; next[idx] = null; setReferenceImages(next); }} />
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
        default:
            return null;
    }
};
