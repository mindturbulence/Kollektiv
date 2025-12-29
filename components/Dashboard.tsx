
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

const StatCard: React.FC<{ label: string; value: number | string; icon: React.ReactNode }> = ({ label, value, icon }) => (
    <div className="bg-base-100 border border-base-300 rounded-2xl p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            {icon}
        </div>
        <div>
            <p className="text-2xl font-black tracking-tight">{value}</p>
            <p className="text-[10px] uppercase font-bold text-base-content/50 tracking-widest">{label}</p>
        </div>
    </div>
);

const HeroActionCard: React.FC<{ 
    title: string; 
    desc: string; 
    icon: React.ReactNode; 
    onClick: () => void; 
    colorClass: string 
}> = ({ title, desc, icon, onClick, colorClass }) => (
    <button 
        onClick={onClick}
        className={`group relative overflow-hidden rounded-3xl p-6 text-left transition-all duration-500 hover:scale-[1.02] active:scale-95 shadow-lg hover:shadow-2xl ${colorClass}`}
    >
        <div className="relative z-10 flex flex-col h-full justify-between gap-8">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-inner">
                {icon}
            </div>
            <div>
                <h3 className="text-xl font-black text-white leading-tight">{title}</h3>
                <p className="text-xs text-white/80 font-medium mt-1">{desc}</p>
            </div>
        </div>
        <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-colors"></div>
    </button>
);

const RecentPromptItem: React.FC<{ prompt: SavedPrompt; onNavigate: () => void }> = ({ prompt, onNavigate }) => {
    const [copied, setCopied] = useState(false);
    const title = prompt.title || prompt.basePrompt || 'Untitled Idea';
    
    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        // --- FIX: Safety check for window and navigator.clipboard to avoid WorkerNavigator type issues ---
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
            className="group flex items-center gap-4 p-4 rounded-2xl bg-base-100 border border-base-300 hover:border-primary/50 hover:bg-base-200/50 transition-all cursor-pointer"
        >
            <div className="w-10 h-10 rounded-xl bg-base-200 flex flex-shrink-0 items-center justify-center text-base-content/40 group-hover:bg-primary group-hover:text-primary-content transition-colors">
                <PromptIcon className="w-5 h-5" />
            </div>
            <div className="flex-grow min-w-0">
                <div className="flex justify-between items-start gap-2">
                    <p className="font-bold text-sm truncate">{title}</p>
                    <span className="text-[9px] font-mono text-base-content/40 flex items-center gap-1 whitespace-nowrap">
                        <ClockIcon className="w-3 h-3" /> {new Date(prompt.createdAt).toLocaleDateString()}
                    </span>
                </div>
                <p className="text-xs text-base-content/60 truncate mt-0.5">{prompt.text}</p>
                {prompt.tags && prompt.tags.length > 0 && (
                    <div className="flex gap-1 mt-2">
                        {prompt.tags.slice(0, 2).map(tag => (
                            <span key={tag} className="px-1.5 py-0.5 rounded bg-base-300 text-[9px] font-bold text-base-content/60 uppercase">#{tag}</span>
                        ))}
                    </div>
                )}
            </div>
            <button 
                onClick={handleCopy}
                className={`btn btn-circle btn-xs ${copied ? 'btn-success' : 'btn-ghost'} opacity-0 group-hover:opacity-100 transition-opacity`}
                title="Quick Copy"
            >
                {copied ? <div className="text-[8px] font-bold">OK</div> : <CopyIcon className="w-3 h-3" />}
            </button>
        </div>
    );
};

const RecentImageItem: React.FC<{ item: GalleryItem; onNavigate: () => void }> = ({ item, onNavigate }) => {
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

    if (!mediaUrl) return <div className="w-full aspect-square bg-base-300 rounded-xl animate-pulse"></div>;

    return (
        <button 
            onClick={onNavigate} 
            className="relative group w-full aspect-square bg-base-200 rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-500"
        >
            {item.type === 'video' ? (
                <video src={mediaUrl} className="w-full h-full object-cover" muted loop autoPlay />
            ) : (
                <img src={mediaUrl} alt={item.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 text-left">
                <p className="text-white text-[10px] font-black uppercase tracking-tighter truncate">{item.title}</p>
                <div className="flex gap-1 mt-1">
                    <span className="badge badge-xs text-[8px] font-bold border-none bg-white/20 text-white uppercase">{item.type}</span>
                </div>
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
                    prompts: prompts.slice(0, 6),
                    gallery: gallery.filter(item => !item.isNsfw).slice(0, 8),
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
        <div className="p-6 lg:p-10 space-y-10 animate-fade-in bg-base-200/30 min-h-full pb-20">
            {/* Top Bar with Stats */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-black tracking-tighter text-base-content">Creative Studio</h1>
                    <p className="text-base-content/50 font-bold uppercase text-xs tracking-widest mt-1">Welcome back to Kollektiv</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <StatCard label="Inspirations" value={data.promptCount} icon={<BookmarkIcon className="w-6 h-6"/>} />
                    <StatCard label="Creations" value={data.galleryCount} icon={<PhotoIcon className="w-6 h-6"/>} />
                    <StatCard label="Collections" value={data.categoryCount} icon={<FolderClosedIcon className="w-6 h-6"/>} />
                </div>
            </div>
            
            {/* Major Action Area */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <HeroActionCard 
                    title="Prompt Refiner" 
                    desc="Perfect your ideas with AI assistance" 
                    icon={<SparklesIcon className="w-8 h-8"/>} 
                    onClick={() => onNavigate('prompts')} 
                    colorClass="bg-gradient-to-br from-indigo-600 to-violet-700"
                />
                <HeroActionCard 
                    title="Library" 
                    desc="Manage your collection of formulas" 
                    icon={<PromptIcon className="w-8 h-8"/>} 
                    onClick={() => onNavigate('prompt')} 
                    colorClass="bg-gradient-to-br from-emerald-600 to-teal-700"
                />
                <HeroActionCard 
                    title="Visual Gallery" 
                    desc="Showcase your generated results" 
                    icon={<PhotoIcon className="w-8 h-8"/>} 
                    onClick={() => onNavigate('gallery')} 
                    colorClass="bg-gradient-to-br from-amber-500 to-orange-600"
                />
                <HeroActionCard 
                    title="Pro Tools" 
                    desc="Batch resizers and video frames" 
                    icon={<AdjustmentsVerticalIcon className="w-8 h-8"/>} 
                    onClick={() => onNavigate('resizer')} 
                    colorClass="bg-gradient-to-br from-rose-600 to-pink-700"
                />
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                {/* Left: Latest Prompts List */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex justify-between items-center px-2">
                        <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                            <BookmarkIcon className="w-5 h-5 text-primary" /> Latest Inspirations
                        </h2>
                        <button onClick={() => onNavigate('prompt')} className="btn btn-ghost btn-sm text-xs font-bold text-primary group">
                            Full Library <ChevronRightIcon className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {data.prompts.length > 0 ? (
                            data.prompts.map(p => <RecentPromptItem key={p.id} prompt={p} onNavigate={() => onNavigate('prompt')} />)
                        ) : (
                            <div className="md:col-span-2 p-12 text-center bg-base-100 rounded-3xl border-2 border-dashed border-base-300 text-base-content/40">
                                <BookmarkIcon className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                <p className="font-bold">Your library is waiting for its first spark.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Gallery Grid Preview */}
                <div className="space-y-6">
                    <div className="flex justify-between items-center px-2">
                        <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                            <PhotoIcon className="w-5 h-5 text-accent" /> Recent Journal
                        </h2>
                        <button onClick={() => onNavigate('gallery')} className="btn btn-ghost btn-sm text-xs font-bold text-accent group">
                            View All <ChevronRightIcon className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                    
                    <div className="bg-base-100 p-4 rounded-[2rem] border border-base-300 shadow-sm">
                        {data.gallery.length > 0 ? (
                            <div className="grid grid-cols-2 gap-3">
                                {data.gallery.map(item => <RecentImageItem key={item.id} item={item} onNavigate={() => onNavigate('gallery')} />)}
                            </div>
                        ) : (
                            <div className="p-10 text-center text-base-content/40">
                                <PhotoIcon className="w-10 h-10 mx-auto mb-2 opacity-20" />
                                <p className="text-xs font-bold">Gallery is empty.</p>
                            </div>
                        )}
                    </div>

                    {/* Resources Shortcuts */}
                    <div className="bg-neutral text-neutral-content rounded-3xl p-6 shadow-xl space-y-4">
                        <h3 className="text-sm font-black uppercase tracking-widest text-white/50">Quick Reference</h3>
                        <div className="space-y-2">
                            <button onClick={() => onNavigate('cheatsheet')} className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-white/10 transition-colors text-left group">
                                <BookOpenIcon className="w-5 h-5" />
                                <span className="text-sm font-bold flex-grow">Prompting Guide</span>
                                <ChevronRightIcon className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all" />
                            </button>
                            <button onClick={() => onNavigate('artstyles')} className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-white/10 transition-colors text-left group">
                                <PaletteIcon className="w-5 h-5" />
                                <span className="text-sm font-bold flex-grow">Art Styles</span>
                                <ChevronRightIcon className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;
