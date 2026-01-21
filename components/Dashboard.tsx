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
        <span className="text-[10px] uppercase font-black text-base-content/30 tracking-[0.2em] mt-1">{label}</span>
    </div>
);

const ActionBlock: React.FC<{ 
    title: string; 
    desc: string; 
    icon: React.ReactNode; 
    onClick: () => void; 
}> = ({ title, desc, icon, onClick }) => (
    <button 
        onClick={onClick}
        className={`group relative flex flex-col justify-between p-8 text-left border border-base-300 transition-all duration-300 hover:bg-base-200 overflow-hidden h-64`}
    >
        <div className="relative z-10">
            <div className="w-10 h-10 text-base-content/20 group-hover:text-primary transition-colors mb-4">
                {icon}
            </div>
            <h3 className="text-2xl font-black tracking-tighter text-base-content leading-none group-hover:translate-x-1 transition-transform uppercase">{title}</h3>
            <p className="text-xs text-base-content/50 font-medium mt-3 max-w-[180px] leading-relaxed">{desc}</p>
        </div>
        <div className="mt-auto flex justify-between items-center relative z-10">
            <span className="text-[10px] font-black uppercase tracking-widest text-base-content/20 group-hover:text-primary transition-colors">Open</span>
            <ChevronRightIcon className="w-4 h-4 text-base-content/10 group-hover:translate-x-1 transition-all" />
        </div>
    </button>
);

const PromptRow: React.FC<{ prompt: SavedPrompt; onNavigate: () => void }> = ({ prompt, onNavigate }) => {
    const [copied, setCopied] = useState(false);
    const title = prompt.title || prompt.basePrompt || 'Untitled Prompt';
    
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
                <span className="text-xl font-bold tracking-tight text-base-content group-hover:text-primary transition-colors truncate uppercase">
                    {title}
                </span>
                <p className="text-xs text-base-content/40 truncate mt-1 italic leading-relaxed">"{prompt.text}"</p>
            </div>
            <div className="hidden md:flex col-span-3 items-center gap-4">
                <div className="flex flex-col">
                    <span className="text-[9px] uppercase font-black tracking-widest text-base-content/20">Target Engine</span>
                    <span className="text-[10px] font-mono font-bold text-base-content/50 uppercase">{prompt.targetAI || 'GENERAL'}</span>
                </div>
            </div>
            <div className="col-span-12 md:col-span-2 flex justify-end items-center gap-4 mt-4 md:mt-0">
                <span className="text-[10px] font-mono text-base-content/20 whitespace-nowrap uppercase">
                    {new Date(prompt.createdAt).toLocaleDateString()}
                </span>
                <button 
                    onClick={handleCopy}
                    className={`btn btn-ghost btn-xs btn-square rounded-none ${copied ? 'text-success' : 'text-base-content/10'}`}
                    title="Copy Prompt"
                >
                    {copied ? <div className="text-[8px] font-black">OK</div> : <CopyIcon className="w-4 h-4" />}
                </button>
            </div>
        </div>
    );
};

const ImageTile: React.FC<{ item: GalleryItem; onNavigate: () => void }> = ({ item, onNavigate }) => {
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
                <span className="text-[9px] font-mono font-bold text-base-content/40 mt-1 uppercase">{item.type} • {new Date(item.createdAt).toLocaleDateString()}</span>
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

    if (isLoading) return (
        <div className="flex-grow flex items-center justify-center w-full h-full">
            <LoadingSpinner />
        </div>
    );

    return (
        <div className="animate-fade-in bg-base-100 min-h-full flex flex-col">
            <section className="p-10 border-b border-base-300 bg-base-200/20">
                <div className="max-w-screen-2xl mx-auto flex flex-col md:flex-row items-end justify-between gap-12">
                    <div className="flex-1">
                        <h1 className="text-4xl lg:text-5xl font-black tracking-tighter text-base-content leading-tight mb-6 uppercase">
                            Home<span className="text-primary">.</span>
                        </h1>
                        <p className="text-base font-bold text-base-content/30 uppercase tracking-[0.3em] max-w-md">
                            Your local workspace for high-fidelity prompt construction and media archival.
                        </p>
                    </div>
                    <div className="flex bg-base-100 p-8 border border-base-300 shadow-sm">
                        <StatItem label="Prompts" value={data.promptCount} />
                        <StatItem label="Items" value={data.galleryCount} />
                        <StatItem label="Folders" value={data.categoryCount} />
                    </div>
                </div>
            </section>
            
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-b border-base-300">
                <ActionBlock 
                    title="Builder" 
                    desc="Construct and refine complex generative formulas with AI assistance." 
                    icon={<SparklesIcon className="w-full h-full"/>} 
                    onClick={() => onNavigate('prompts')} 
                />
                <ActionBlock 
                    title="Library" 
                    desc="Manage your curated collection of saved prompts and formulas." 
                    icon={<PromptIcon className="w-full h-full"/>} 
                    onClick={() => onNavigate('prompt')} 
                />
                <ActionBlock 
                    title="Gallery" 
                    desc="Explore and manage your local visual media repository." 
                    icon={<PhotoIcon className="w-full h-full"/>} 
                    onClick={() => onNavigate('gallery')} 
                />
                <ActionBlock 
                    title="Guides" 
                    desc="Access archival reference data for styles, artists, and techniques." 
                    icon={<BookOpenIcon className="w-full h-full"/>} 
                    onClick={() => onNavigate('cheatsheet')} 
                />
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-12 max-w-full flex-grow">
                <div className="lg:col-span-8 border-r border-base-300">
                    <div className="p-6 border-b border-base-300 flex justify-between items-center bg-base-200/10">
                        <h2 className="text-xs font-black uppercase tracking-[0.4em] text-base-content/40 flex items-center gap-3">
                            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span> Recent Activity
                        </h2>
                        <button onClick={() => onNavigate('prompt')} className="btn btn-sm btn-ghost rounded-none font-black uppercase tracking-widest text-[10px]">
                            View All
                        </button>
                    </div>
                    
                    <div className="flex flex-col">
                        {data.prompts.length > 0 ? (
                            data.prompts.map(p => <PromptRow key={p.id} prompt={p} onNavigate={() => onNavigate('prompt')} />)
                        ) : (
                            <div className="p-20 text-center text-base-content/10 uppercase font-black tracking-widest text-center">
                                Repository empty
                            </div>
                        )}
                    </div>
                </div>

                <div className="lg:col-span-4 bg-base-200/10">
                    <div className="p-6 border-b border-base-300 flex justify-between items-center">
                        <h2 className="text-xs font-black uppercase tracking-[0.4em] text-base-content/40">Media Feed</h2>
                        <button onClick={() => onNavigate('gallery')} className="btn btn-sm btn-ghost rounded-none font-black uppercase tracking-widest text-[10px]">
                            Gallery
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-px bg-base-300">
                        {data.gallery.length > 0 ? (
                            data.gallery.map(item => <ImageTile key={item.id} item={item} onNavigate={() => onNavigate('gallery')} />)
                        ) : (
                            <div className="col-span-2 p-20 text-center text-base-content/10 uppercase font-black tracking-widest bg-base-100">
                                No media
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}

export default Dashboard;