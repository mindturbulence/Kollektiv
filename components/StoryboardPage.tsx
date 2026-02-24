
import React, { useState, useEffect, useCallback } from 'react';
import type { Storyboard, Scene, GalleryItem } from '../types';
import { loadStoryboards, createStoryboard, updateStoryboard, deleteStoryboard } from '../utils/storyboardStorage';
import { translateStoryboardScene } from '../services/llmService';
import { useSettings } from '../contexts/SettingsContext';
import { 
    PlusIcon, ChevronLeftIcon, 
    SparklesIcon, PhotoIcon, 
    ViewGridIcon
} from './icons';
import LoadingSpinner from './LoadingSpinner';
import ConfirmationModal from './ConfirmationModal';
import GalleryPickerModal from './GalleryPickerModal';
import { TARGET_VIDEO_AI_MODELS } from '../constants/models';
import { fileSystemManager } from '../utils/fileUtils';

const SceneThumbnail: React.FC<{ url: string | null }> = ({ url }) => {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!url) return;
        let active = true;
        const load = async () => {
            if (url.startsWith('data:') || url.startsWith('http')) { setBlobUrl(url); return; }
            const blob = await fileSystemManager.getFileAsBlob(url);
            if (blob && active) setBlobUrl(URL.createObjectURL(blob));
        };
        load();
        return () => { active = false; };
    }, [url]);
    return blobUrl ? <img src={blobUrl} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full bg-base-300 flex items-center justify-center"><PhotoIcon className="w-4 h-4 opacity-20" /></div>;
};

export const StoryboardPage: React.FC<{ showGlobalFeedback: (m: string, e?: boolean) => void }> = ({ showGlobalFeedback }) => {
    const { settings } = useSettings();
    const [storyboards, setStoryboards] = useState<Storyboard[]>([]);
    const [activeStoryboard, setActiveStoryboard] = useState<Storyboard | null>(null);
    const [activeSceneIndex, setActiveSceneIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isTranslating, setIsTranslating] = useState(false);
    const [translatedPrompt, setTranslatedPrompt] = useState('');
    
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [stbToDelete, setStbToDelete] = useState<Storyboard | null>(null);

    const activeScene = activeStoryboard?.scenes[activeSceneIndex] || null;

    const refresh = useCallback(async () => {
        const data = await loadStoryboards();
        setStoryboards(data);
        if (activeStoryboard) {
            const updated = data.find(s => s.id === activeStoryboard.id);
            if (updated) setActiveStoryboard(updated);
        }
        setIsLoading(false);
    }, [activeStoryboard]);

    useEffect(() => { refresh(); }, []);

    const handleCreate = async () => {
        const nb = await createStoryboard("New Story", TARGET_VIDEO_AI_MODELS[0]);
        await refresh();
        setActiveStoryboard(nb);
        setActiveSceneIndex(0);
    };

    const handleAddScene = async () => {
        if (!activeStoryboard) return;
        const newScene: Scene = {
            id: `scene_${Date.now()}`,
            text: '',
            referenceImages: [],
            duration: 5,
            motion: 'Standard',
            camera: 'Eye Level',
            style: 'Cinematic',
            order: activeStoryboard.scenes.length
        };
        const updatedScenes = [...activeStoryboard.scenes, newScene];
        await updateStoryboard(activeStoryboard.id, { scenes: updatedScenes });
        await refresh();
        setActiveSceneIndex(updatedScenes.length - 1);
    };

    const handleUpdateActiveScene = async (updates: Partial<Scene>) => {
        if (!activeStoryboard || !activeScene) return;
        const newScenes = activeStoryboard.scenes.map((s, i) => i === activeSceneIndex ? { ...s, ...updates } : s);
        await updateStoryboard(activeStoryboard.id, { scenes: newScenes });
        await refresh();
    };

    const handleTranslate = async () => {
        if (!activeScene || !activeStoryboard) return;
        setIsTranslating(true);
        try {
            const result = await translateStoryboardScene(activeScene.text, activeStoryboard.targetModel, settings);
            setTranslatedPrompt(result);
            showGlobalFeedback("Translation Complete");
        } catch (e) {
            showGlobalFeedback("Translation failed", true);
        } finally {
            setIsTranslating(false);
        }
    };

    const handleImageSelect = async (items: GalleryItem[]) => {
        if (!activeScene) return;
        const urls = items.map(i => i.urls[0]);
        await handleUpdateActiveScene({ referenceImages: [...activeScene.referenceImages, ...urls] });
    };

    if (isLoading) return <div className="h-full w-full flex items-center justify-center"><LoadingSpinner /></div>;

    if (!activeStoryboard) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-12 bg-base-100">
                <div className="text-center space-y-8 max-w-lg">
                    <ViewGridIcon className="w-20 h-20 mx-auto text-primary opacity-20" />
                    <h1 className="text-4xl font-black tracking-tighter uppercase">STORYBOARD<span className="text-primary">.</span></h1>
                    <p className="text-sm font-bold uppercase tracking-widest text-base-content/40 leading-relaxed">Sequence temporal artifacts and synthesize narrative flow for high-fidelity video generation.</p>
                    <div className="space-y-4">
                        <button onClick={handleCreate} className="btn btn-primary w-full rounded-none font-black tracking-[0.2em] uppercase shadow-2xl">Create New Storyboard</button>
                        <div className="grid grid-cols-1 gap-2">
                            {storyboards.map(s => (
                                <button key={s.id} onClick={() => setActiveStoryboard(s)} className="btn btn-ghost border border-base-300 rounded-none w-full text-left justify-between group">
                                    <span className="font-black text-[10px] tracking-widest truncate">{s.title.toUpperCase()}</span>
                                    <span className="text-[8px] font-mono opacity-20">{s.scenes.length} SCENES</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full grid grid-cols-1 lg:grid-cols-12 overflow-hidden bg-base-100 animate-fade-in">
            {/* LEFT: SCENE LIST */}
            <aside className="lg:col-span-3 border-r border-base-300 flex flex-col overflow-hidden bg-base-200/10">
                <header className="h-16 px-6 border-b border-base-300 flex items-center justify-between">
                    <button onClick={() => setActiveStoryboard(null)} className="btn btn-xs btn-ghost gap-2 opacity-40 hover:opacity-100"><ChevronLeftIcon className="w-4 h-4"/> BACK</button>
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/40">Scenes</span>
                </header>
                <div className="flex-grow p-4 overflow-y-auto custom-scrollbar space-y-2">
                    {activeStoryboard.scenes.map((s, i) => (
                        <button 
                            key={s.id} 
                            onClick={() => setActiveSceneIndex(i)}
                            className={`w-full p-4 flex gap-4 items-center border transition-all duration-300 text-left group ${activeSceneIndex === i ? 'bg-primary border-primary text-primary-content shadow-xl scale-[1.02]' : 'bg-base-100 border-base-300 hover:border-primary/50'}`}
                        >
                            <div className="w-12 h-12 flex-shrink-0 border border-current/10 overflow-hidden">
                                <SceneThumbnail url={s.referenceImages[0] || null} />
                            </div>
                            <div className="min-w-0">
                                <p className={`text-[10px] font-mono font-bold uppercase tracking-widest ${activeSceneIndex === i ? 'opacity-60' : 'text-primary'}`}>SCENE {i + 1}</p>
                                <p className="text-xs font-bold truncate max-w-full italic">{s.text || 'UNTITLED_ACTION'}</p>
                            </div>
                        </button>
                    ))}
                    <button onClick={handleAddScene} className="btn btn-ghost border-2 border-dashed border-base-300 w-full py-8 h-auto rounded-none opacity-40 hover:opacity-100 transition-all flex flex-col gap-2">
                        <PlusIcon className="w-6 h-6" />
                        <span className="text-[9px] font-black tracking-widest uppercase">Append Node</span>
                    </button>
                </div>
            </aside>

            {/* CENTER: EDITOR */}
            <main className="lg:col-span-6 flex flex-col overflow-hidden border-r border-base-300">
                <header className="h-16 px-10 border-b border-base-300 flex items-center justify-between bg-base-100">
                    <input 
                        value={activeStoryboard.title} 
                        onChange={e => updateStoryboard(activeStoryboard.id, { title: e.target.value }).then(refresh)}
                        className="bg-transparent border-none focus:outline-none font-black text-xl uppercase tracking-tighter w-full"
                    />
                </header>
                
                <div className="flex-grow p-10 overflow-y-auto custom-scrollbar space-y-12">
                    {activeScene ? (
                        <>
                            <div className="space-y-4">
                                <div className="flex justify-between items-end"><span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60">Core Narrative</span><span className="text-[9px] font-mono text-base-content/20 uppercase">SCENE_ID: {activeScene.id}</span></div>
                                <textarea 
                                    value={activeScene.text}
                                    onChange={e => handleUpdateActiveScene({ text: e.target.value })}
                                    className="textarea textarea-bordered rounded-none w-full min-h-[120px] text-lg font-medium leading-relaxed bg-base-200/20 italic"
                                    placeholder="Describe the action sequence..."
                                />
                            </div>

                            <div className="space-y-6">
                                <div className="flex justify-between items-center"><span className="text-[10px] font-black uppercase tracking-[0.2em] text-base-content/30">Reference Materials</span><button onClick={() => setIsPickerOpen(true)} className="btn btn-xs btn-ghost text-[9px] font-black uppercase tracking-widest">Add From Library</button></div>
                                <div className="grid grid-cols-4 gap-px bg-base-300 border border-base-300">
                                    {activeScene.referenceImages.map((url, idx) => (
                                        <div key={idx} className="aspect-video bg-base-100 relative group overflow-hidden">
                                            <SceneThumbnail url={url} />
                                            <button onClick={() => handleUpdateActiveScene({ referenceImages: activeScene.referenceImages.filter((_, i) => i !== idx) })} className="btn btn-xs btn-square btn-error absolute top-1 right-1 opacity-0 group-hover:opacity-100 rounded-none">✕</button>
                                        </div>
                                    ))}
                                    {activeScene.referenceImages.length < 4 && (
                                        <button onClick={() => setIsPickerOpen(true)} className="aspect-video bg-base-200/50 flex items-center justify-center opacity-20 hover:opacity-100 transition-opacity"><PlusIcon className="w-6 h-6"/></button>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-8 pt-8 border-t border-base-300">
                                <div className="form-control">
                                    <label className="text-[10px] font-black uppercase text-base-content/40 mb-2">Duration (Sec)</label>
                                    <div className="flex gap-4 items-center">
                                        <input type="range" min="1" max="60" value={activeScene.duration} onChange={e => handleUpdateActiveScene({ duration: parseInt(e.target.value) })} className="range range-xs range-primary" />
                                        <span className="font-mono font-black text-sm text-primary w-8">{activeScene.duration}</span>
                                    </div>
                                </div>
                                <div className="form-control">
                                    <label className="text-[10px] font-black uppercase text-base-content/40 mb-2">Motion Energy</label>
                                    <select value={activeScene.motion} onChange={e => handleUpdateActiveScene({ motion: e.target.value })} className="select select-bordered select-sm rounded-none font-bold uppercase text-[10px]">
                                        <option>Standard</option><option>Aggressive</option><option>Slow Motion</option><option>Temporal Warp</option><option>Fluid</option>
                                    </select>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="h-full flex items-center justify-center opacity-10 uppercase font-black tracking-widest text-2xl">Awaiting Node selection</div>
                    )}
                </div>

                <footer className="h-20 bg-base-200/20 border-t border-base-300 p-6 flex items-center justify-between">
                    <div className="flex gap-6 overflow-hidden max-w-lg">
                        {activeStoryboard.scenes.map((s, i) => (
                            <div key={s.id} className={`w-12 h-8 flex-shrink-0 border ${activeSceneIndex === i ? 'border-primary ring-2 ring-primary/20' : 'border-base-300 opacity-20'} overflow-hidden`}>
                                <SceneThumbnail url={s.referenceImages[0] || null} />
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => { setStbToDelete(activeStoryboard); setIsDeleteModalOpen(true); }} className="btn btn-sm btn-ghost text-error opacity-40 hover:opacity-100 font-black text-[9px] uppercase tracking-widest">Purge Story</button>
                    </div>
                </footer>
            </main>

            {/* RIGHT: INSPECTOR */}
            <aside className="lg:col-span-3 flex flex-col overflow-hidden">
                <header className="h-16 px-6 border-b border-base-300 flex items-center justify-between bg-base-200/10">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Neural Translaton</span>
                </header>
                <div className="flex-grow p-6 space-y-8 overflow-y-auto custom-scrollbar">
                    <div className="form-control">
                        <label className="text-[10px] font-black uppercase text-base-content/40 mb-2">Target Engine</label>
                        <select 
                            value={activeStoryboard.targetModel} 
                            onChange={e => updateStoryboard(activeStoryboard.id, { targetModel: e.target.value }).then(refresh)}
                            className="select select-bordered select-sm rounded-none font-bold uppercase text-[10px] tracking-widest w-full"
                        >
                            {TARGET_VIDEO_AI_MODELS.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                        </select>
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center"><span className="text-[10px] font-black uppercase tracking-widest text-primary/40">Engine Optimized Prompt</span><button onClick={handleTranslate} disabled={isTranslating || !activeScene} className="btn btn-xs btn-ghost gap-1">{isTranslating ? <LoadingSpinner size={12}/> : <SparklesIcon className="w-3.5 h-3.5"/>} Translate</button></div>
                        <div className="p-4 bg-base-200/50 border border-base-300 text-xs font-mono leading-relaxed text-base-content/60 min-h-[200px] break-words">
                            {isTranslating ? 'Synthesizing syntactic dialect...' : translatedPrompt || 'Translation queue empty.'}
                        </div>
                    </div>

                    <p className="text-[9px] font-bold text-base-content/30 uppercase leading-relaxed">This translator adapts your narrative intent to the specific visual physics and semantic weight expected by the {activeStoryboard.targetModel} architecture.</p>
                </div>
                <footer className="h-14 border-t border-base-300 bg-base-100 flex items-stretch">
                    <button 
                        onClick={() => { navigator.clipboard.writeText(translatedPrompt); showGlobalFeedback("Token Copied"); }} 
                        disabled={!translatedPrompt} 
                        className="btn btn-ghost flex-1 rounded-none border-none border-r border-base-300 font-black text-[9px] tracking-widest uppercase"
                    >Copy Token</button>
                    <button className="btn btn-primary flex-1 rounded-none border-none font-black text-[9px] tracking-widest uppercase">Export PDF</button>
                </footer>
            </aside>

            <GalleryPickerModal 
                isOpen={isPickerOpen} 
                onClose={() => setIsPickerOpen(false)} 
                onSelect={handleImageSelect} 
                typeFilter="image" 
                selectionMode="multiple" 
                title="Select Visual Reference" 
            />

            <ConfirmationModal 
                isOpen={isDeleteModalOpen} 
                onClose={() => setIsDeleteModalOpen(false)} 
                onConfirm={async () => { if(stbToDelete) { await deleteStoryboard(stbToDelete.id); refresh(); setActiveStoryboard(null); } setIsDeleteModalOpen(false); }} 
                title="PURGE STORYBOARD" 
                message={`Permanently erase archival record for "${stbToDelete?.title}"?`} 
            />
        </div>
    );
};
