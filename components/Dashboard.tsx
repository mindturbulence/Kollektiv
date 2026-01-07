
import React, { useState, useEffect, useMemo } from 'react';
import { loadSavedPrompts, loadPromptCategories } from '../utils/promptStorage';
import { loadGalleryItems, loadCategories as loadGalleryCategories } from '../utils/galleryStorage';
import type { SavedPrompt, GalleryItem, ActiveTab } from '../types';
import { 
    PromptIcon, PhotoIcon, SparklesIcon, BookOpenIcon, 
    PaletteIcon, AdjustmentsVerticalIcon, BookmarkIcon,
    ChevronRightIcon, ClockIcon, FolderClosedIcon
} from './icons';
import { fileSystemManager } from '../utils/fileUtils';
import LoadingSpinner from './LoadingSpinner';
import { useSettings } from '../contexts/SettingsContext';
import CopyIcon from './CopyIcon';

interface DashboardProps {
    onNavigate: (tab: ActiveTab) => void;
}

const StatItem: React.FC<{ label: string; value: number | string }> = ({ label, value }) => (
    <div className="flex flex-col border-r border-base-300 px-6 last:border-r-0">
        <span className="text-3xl font-black tracking-tighter leading-none">{value}</span>
        <span className="text-[10px] uppercase font-bold text-base-content/40 tracking-[0.2em] mt-1">{label}</span>
    </div>
);

const ActionBlock: React.FC<{ 
    title: string; 
    desc: string; 
    icon: React.ReactNode; 
    onClick: () => void; 
    colorClass: string 
}> = ({ title, desc, icon, onClick, colorClass }) => (
    <button 
        onClick={onClick}
        className={`group relative flex flex-col justify-between p-8 text-left border border-base-300 transition-all duration-300 hover:bg-base-200 overflow-hidden h-64`}
    >
        <div className="relative z-10">
            <div className="w-10 h-10 text-base-content/40 group-hover:text-primary transition-colors mb-4">
                {icon}
            </div>
            <h3 className="text-2xl font-black tracking-tighter text-base-content leading-none group-hover:translate-x-1 transition-transform">{title}</h3>
            <p className="text-xs text-base-content/50 font-medium mt-3 max-w-[180px]">{desc}</p>
        </div>
        <div className="mt-auto flex justify-between items-center relative z-10">
            <span className="text-[10px] font-bold uppercase tracking-widest text-base-content/30 group-hover:text-primary transition-colors">Launch Module</span>
            <ChevronRightIcon className="w-4 h-4 text-base-content/20 group-hover:translate-x-1 transition-all" />
        </div>
    </button>
);

const SpecimenRow: React.FC<{ prompt: SavedPrompt; onNavigate: () => void }> = ({ prompt, onNavigate }) => {
    const [copied, setCopied] = useState(false);
    const title = prompt.title || prompt.basePrompt || 'Untitled Idea';
    
    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (typeof window !== 'undefined' && (window as any).navigator?.clipboard) {
            (window as any).navigator.clipboard.writeText(prompt.text).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            });
        }
    };

    return (
        <div 
            onClick={onNavigate}
            className="group grid grid-cols-12 gap-4 p-6 border-b border-base-300 hover:bg-base-200/50 transition-all cursor-pointer items-center"
        >
            <div className="col-span-12 md:col-span-7 flex flex-col">
                <span className="text-xl font-bold tracking-tight text-base-content group-hover:text-primary transition-colors truncate">
                    {title}
                </span>
                <p className="text-xs text-base-content/40 truncate mt-1 italic">"{prompt.text}"</p>
            </div>
            <div className="hidden md:flex col-span-3 items-center gap-4">
                <div className="flex flex-col">
                    <span className="text-[9px] uppercase font-black tracking-widest text-base-content/30">Target System</span>
                    <span className="text-[10px] font-mono font-bold text-base-content/60">{prompt.targetAI || 'GENERAL'}</span>
                </div>
            </div>
            <div className="col-span-12 md:col-span-2 flex justify-end items-center gap-4 mt-4 md:mt-0">
                <span className="text-[10px] font-mono text-base-content/30 whitespace-nowrap">
                    {new Date(prompt.createdAt).toLocaleDateString()}
                </span>
                <button 
                    onClick={handleCopy}
                    className={`btn btn-ghost btn-xs btn-square ${copied ? 'text-success' : 'text-base-content/20'}`}
                    title="Copy Specimen"
                >
                    {copied ? <div className="text-[8px] font-bold">OK</div> : <CopyIcon className="w-4 h-4" />}
                </button>
            </div>
        </div>
    );
};

const JournalTile: React.FC<{ item: GalleryItem; onNavigate: () => void }> = ({ item, onNavigate }) => {
    const [mediaUrl, setMediaUrl] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        let objectUrl: string | null = null;
        
        const loadMedia = async () => {
            if (!item.urls[0]) return;
            try {
                const blob = await fileSystemManager.getFileAsBlob(item.urls[0]);
                if (isMounted && blob) {
                    objectUrl = URL.createObjectURL(blob);
                    setMediaUrl(objectUrl);
                }
            } catch (err) { console.error(err); }
        };
        
        loadMedia();
        return () => { isMounted = false; if(objectUrl) URL.revokeObjectURL(objectUrl); }
    }, [item.urls]);

    if (!mediaUrl) return <div className="w-full aspect-square bg-base-300 animate-pulse border border-base-300"></div>;

    return (
        <button 
            onClick={onNavigate} 
            className="relative group w-full aspect-square bg-black border border-base-300 overflow-hidden"
        >
            {item.type === 'video' ? (
                <video src={mediaUrl} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" muted loop autoPlay />
            ) : (
                <img src={mediaUrl} alt={item.title} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" />
            )}
            <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300 bg-base-100 border-t border-base-300 flex flex-col text-left">
                <span className="text-[10px] font-black uppercase tracking-widest text-primary truncate">{item.title}</span>
                <span className="text-[9px] font-mono text-base-content/40 mt-1 uppercase">{item.type} • {new Date(item.createdAt).toLocaleDateString()}</span>
            </div>
        </button>
    );
};

const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
    const { settings } = useSettings();
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState({
        prompts: [] as SavedPrompt[],
        gallery: [] as GalleryItem[],
        promptCount: 0,
        galleryCount: 0,
        categoryCount: 0
    });

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [prompts, gallery, pCats, gCats] = await Promise.all([
                    loadSavedPrompts(),
                    loadGalleryItems(),
                    loadPromptCategories(),
                    loadGalleryCategories()
                ]);
        
                setData({
                    prompts: prompts.slice(0, 5),
                    gallery: gallery.filter(item => !item.isNsfw).slice(0, 4),
                    promptCount: prompts.length,
                    galleryCount: gallery.length,
                    categoryCount: pCats.length + gCats.length
                });
            } catch(e) {
                console.error("Dashboard load fail:", e);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [settings.features]);

    if (isLoading) return <div className="flex-grow flex items-center justify-center"><LoadingSpinner /></div>;

    return (
        <div className="animate-fade-in bg-base-100 min-h-full flex flex-col">
            {/* Hero Section */}
            <section className="p-10 lg:p-20 border-b border-base-300 bg-base-200/20">
                <div className="max-w-screen-2xl mx-auto flex flex-col md:flex-row items-end justify-between gap-12">
                    <div className="flex-1">
                        <h1 className="text-7xl lg:text-9xl font-black tracking-tighter text-base-content leading-[0.8] mb-6">
                            KOLLEK<br/>TIV.
                        </h1>
                        <p className="text-base font-bold text-base-content/50 uppercase tracking-[0.3em] max-w-md">
                            The professional interface for high-fidelity prompt engineering and visual journaling.
                        </p>
                    </div>
                    <div className="flex bg-base-100 p-8 border border-base-300 shadow-sm">
                        <StatItem label="Inspirations" value={data.promptCount} />
                        <StatItem label="Visual Works" value={data.galleryCount} />
                        <StatItem label="Data Sets" value={data.categoryCount} />
                    </div>
                </div>
            </section>
            
            {/* Module Grid */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-b border-base-300">
                <ActionBlock 
                    title="Builder" 
                    desc="Architect detailed prompts with model-aware logic and visual physics." 
                    icon={<SparklesIcon className="w-full h-full"/>} 
                    onClick={() => onNavigate('prompts')} 
                    colorClass="text-indigo-600"
                />
                <ActionBlock 
                    title="Library" 
                    desc="Maintain a curated repository of high-utility formulas and tokens." 
                    icon={<PromptIcon className="w-full h-full"/>} 
                    onClick={() => onNavigate('prompt')} 
                    colorClass="text-emerald-600"
                />
                <ActionBlock 
                    title="Gallery" 
                    desc="A minimalist visual record of generated temporal and spatial results." 
                    icon={<PhotoIcon className="w-full h-full"/>} 
                    onClick={() => onNavigate('gallery')} 
                    colorClass="text-amber-500"
                />
                <ActionBlock 
                    title="Reference" 
                    desc="Exploration modules for art styles, cinematography, and artists." 
                    icon={<BookOpenIcon className="w-full h-full"/>} 
                    onClick={() => onNavigate('cheatsheet')} 
                    colorClass="text-rose-600"
                />
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-12 max-w-full">
                {/* Specimen Feed */}
                <div className="lg:col-span-8 border-r border-base-300">
                    <div className="p-6 border-b border-base-300 flex justify-between items-center bg-base-200/10">
                        <h2 className="text-xs font-black uppercase tracking-[0.4em] text-base-content/40 flex items-center gap-3">
                            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span> Recent Specimens
                        </h2>
                        <button onClick={() => onNavigate('prompt')} className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline">
                            Open Index
                        </button>
                    </div>
                    
                    <div className="flex flex-col">
                        {data.prompts.length > 0 ? (
                            data.prompts.map(p => <SpecimenRow key={p.id} prompt={p} onNavigate={() => onNavigate('prompt')} />)
                        ) : (
                            <div className="p-20 text-center text-base-content/20 uppercase font-black tracking-widest">
                                Repository Empty
                            </div>
                        )}
                    </div>
                </div>

                {/* Journal View */}
                <div className="lg:col-span-4 bg-base-200/10">
                    <div className="p-6 border-b border-base-300 flex justify-between items-center">
                        <h2 className="text-xs font-black uppercase tracking-[0.4em] text-base-content/40">Visual Journal</h2>
                        <button onClick={() => onNavigate('gallery')} className="text-[10px] font-black uppercase tracking-widest text-base-content/60 hover:text-primary">
                            Full View
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-px bg-base-300">
                        {data.gallery.length > 0 ? (
                            data.gallery.map(item => <JournalTile key={item.id} item={item} onNavigate={() => onNavigate('gallery')} />)
                        ) : (
                            <div className="col-span-2 p-20 text-center text-base-content/20 uppercase font-black tracking-widest bg-base-100">
                                No Data
                            </div>
                        )}
                    </div>

                    <div className="p-10">
                        <div className="p-8 border border-base-300 rounded-none bg-base-100 space-y-6">
                            <h3 className="text-xs font-black uppercase tracking-widest text-base-content/40">System Resources</h3>
                            <div className="space-y-4">
                                <button onClick={() => onNavigate('artstyles')} className="w-full flex items-center justify-between text-left group">
                                    <span className="text-sm font-bold tracking-tight">Art Styles Index</span>
                                    <ChevronRightIcon className="w-4 h-4 opacity-30 group-hover:opacity-100 transition-all" />
                                </button>
                                <button onClick={() => onNavigate('artists')} className="w-full flex items-center justify-between text-left group">
                                    <span className="text-sm font-bold tracking-tight">Artist Specimens</span>
                                    <ChevronRightIcon className="w-4 h-4 opacity-30 group-hover:opacity-100 transition-all" />
                                </button>
                                <button onClick={() => onNavigate('video_to_frames')} className="w-full flex items-center justify-between text-left group">
                                    <span className="text-sm font-bold tracking-tight">Temporal Extractor</span>
                                    <ChevronRightIcon className="w-4 h-4 opacity-30 group-hover:opacity-100 transition-all" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Footer Specifications */}
            <div className="mt-auto border-t border-base-300 p-4 px-10 flex justify-between items-center bg-base-200/50">
                <span className="text-[9px] font-mono font-bold text-base-content/20 tracking-widest uppercase">Kollektiv Platform Interface • Version 1.0.0</span>
                <div className="flex gap-6">
                    <span className="text-[9px] font-mono font-bold text-base-content/20 tracking-widest uppercase">Encryption: Local Only</span>
                    <span className="text-[9px] font-mono font-bold text-base-content/20 tracking-widest uppercase">Status: Connected</span>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;
