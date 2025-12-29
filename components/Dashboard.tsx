
import React, { useState, useEffect } from 'react';
import { loadSavedPrompts } from '../utils/promptStorage';
import { loadGalleryItems } from '../utils/galleryStorage';
import type { SavedPrompt, GalleryItem, ActiveTab } from '../types';
import { PromptIcon, PhotoIcon, SparklesIcon, BookOpenIcon, PaletteIcon, AdjustmentsVerticalIcon } from './icons';
import { fileSystemManager } from '../utils/fileUtils';
import LoadingSpinner from './LoadingSpinner';
import { useSettings } from '../contexts/SettingsContext';

interface DashboardProps {
    onNavigate: (tab: ActiveTab) => void;
}

const RecentPromptItem: React.FC<{ prompt: SavedPrompt; onNavigate: () => void }> = ({ prompt, onNavigate }) => (
    <button onClick={onNavigate} className="w-full text-left p-3 rounded-lg hover:bg-base-200 transition-colors border border-transparent hover:border-base-300">
        <p className="text-base-content font-semibold truncate">{prompt.title || prompt.basePrompt || 'Untitled Prompt'}</p>
        <p className="text-xs text-base-content/70 truncate">{prompt.text}</p>
    </button>
);

const RecentImageItem: React.FC<{ item: GalleryItem; onNavigate: () => void }> = ({ item, onNavigate }) => {
    const [mediaUrl, setMediaUrl] = useState<string | null>(null);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        let objectUrl: string | null = null;
        let isMounted = true;
        
        const loadMedia = async () => {
            if (!item.urls[0]) {
                if (isMounted) setHasError(true);
                return;
            }
            try {
                const blob = await fileSystemManager.getFileAsBlob(item.urls[0]);
                if (isMounted) {
                    if (blob) {
                        objectUrl = URL.createObjectURL(blob);
                        setMediaUrl(objectUrl);
                        setHasError(false);
                    } else {
                        setHasError(true);
                    }
                }
            } catch (err) {
                console.error(`Failed to load recent image for item ${item.id}:`, err);
                if (isMounted) setHasError(true);
            }
        };
        
        loadMedia();
        
        return () => {
            isMounted = false;
            if(objectUrl) URL.revokeObjectURL(objectUrl);
        }
    }, [item.id, item.urls]);

    if (hasError) {
        return (
            <button onClick={onNavigate} className="relative group w-full aspect-square bg-base-200 rounded-lg overflow-hidden flex flex-col items-center justify-center text-error">
                <PhotoIcon className="w-6 h-6" />
                <span className="text-[10px] mt-1">Error</span>
            </button>
        );
    }
    
    if (!mediaUrl) {
        return <div className="w-full aspect-square bg-base-200 rounded-lg animate-pulse"></div>;
    }

    return (
        <button onClick={onNavigate} className="relative group w-full aspect-square bg-base-200 rounded-lg overflow-hidden shadow-sm">
            {item.type === 'video' ? (
                <video src={mediaUrl} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" muted loop autoPlay />
            ) : (
                <img src={mediaUrl} alt={item.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
                <p className="text-white text-[10px] font-semibold truncate">{item.title}</p>
            </div>
        </button>
    );
};

const CompactActionCard: React.FC<{ title: string; icon: React.ReactNode; onClick: () => void; className?: string }> = 
({ title, icon, onClick, className = '' }) => (
    <button onClick={onClick} className={`text-center p-3 rounded-xl shadow-sm hover:shadow-md flex flex-col items-center justify-center gap-2 transition-all duration-300 ease-in-out transform hover:-translate-y-1 group border border-base-300/10 ${className}`}>
        <div className="p-2 rounded-lg bg-base-100/20 group-hover:bg-base-100/40 transition-colors">
            {icon}
        </div>
        <h3 className="text-[10px] sm:text-xs font-bold leading-tight px-1 uppercase tracking-tighter">{title}</h3>
    </button>
);

const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
    const { settings } = useSettings();
    const [isLoading, setIsLoading] = useState(true);
    const [recentPrompts, setRecentPrompts] = useState<SavedPrompt[]>([]);
    const [recentItems, setRecentItems] = useState<GalleryItem[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [prompts, items] = await Promise.all([
                    settings.features.isPromptLibraryEnabled ? loadSavedPrompts() : Promise.resolve([]),
                    settings.features.isGalleryEnabled ? loadGalleryItems() : Promise.resolve([]),
                ]);
        
                setRecentPrompts(prompts.slice(0, 8));
                setRecentItems(items.filter(item => !item.isNsfw).slice(0, 9)); 
            } catch(e) {
                console.error("Dashboard failed to load data:", e);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [settings.features]);

    if (isLoading) {
        return <div className="flex-grow flex items-center justify-center"><LoadingSpinner /></div>;
    }

    return (
        <section className="p-6 animate-fade-in">
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-base-content">Overview</h1>
                <p className="text-base-content/70 mt-1">Quick access to your creative hub.</p>
            </div>
            
            {/* Quick Shortcuts Row - 6 Items */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
                <CompactActionCard title="Refiner" icon={<SparklesIcon className="w-5 h-5"/>} onClick={() => onNavigate('prompts')} className="bg-primary/80 text-primary-content"/>
                {settings.features.isPromptLibraryEnabled && <CompactActionCard title="Library" icon={<PromptIcon className="w-5 h-5"/>} onClick={() => onNavigate('prompt')} className="bg-secondary/80 text-secondary-content"/>}
                {settings.features.isGalleryEnabled && <CompactActionCard title="Gallery" icon={<PhotoIcon className="w-5 h-5"/>} onClick={() => onNavigate('gallery')} className="bg-accent/80 text-accent-content"/>}
                {settings.features.isToolsEnabled && <CompactActionCard title="Tools" icon={<AdjustmentsVerticalIcon className="w-5 h-5"/>} onClick={() => onNavigate('resizer')} className="bg-info/80 text-info-content"/>}
                {settings.features.isCheatsheetsEnabled && (
                    <>
                        <CompactActionCard title="Guide" icon={<BookOpenIcon className="w-5 h-5"/>} onClick={() => onNavigate('cheatsheet')} className="bg-neutral text-neutral-content"/>
                        <CompactActionCard title="Styles" icon={<PaletteIcon className="w-5 h-5"/>} onClick={() => onNavigate('artstyles')} className="bg-neutral text-neutral-content"/>
                    </>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Column: Recent Prompts */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="card bg-base-100 shadow-md border border-base-300">
                        <div className="card-body p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="card-title text-primary text-lg font-bold uppercase tracking-widest">Recent Prompts</h2>
                                <button onClick={() => onNavigate('prompt')} className="btn btn-xs btn-ghost opacity-50 hover:opacity-100">View All</button>
                            </div>
                            <div className="space-y-1">
                                {recentPrompts.length > 0 ? (
                                    recentPrompts.map(p => <RecentPromptItem key={p.id} prompt={p} onNavigate={() => onNavigate('prompt')} />)
                                ) : (
                                    <p className="text-sm text-base-content/50 py-8 text-center italic">No prompts saved yet.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Sidebar Column: Recent Gallery */}
                <div className="space-y-6">
                    {settings.features.isGalleryEnabled && (
                         <div className="card bg-base-100 shadow-md border border-base-300">
                            <div className="card-body p-6">
                               <div className="flex justify-between items-center mb-4">
                                    <h2 className="card-title text-primary text-lg font-bold uppercase tracking-widest">Recent Gallery</h2>
                                    <button onClick={() => onNavigate('gallery')} className="btn btn-xs btn-ghost opacity-50 hover:opacity-100">View All</button>
                               </div>
                                {recentItems.length > 0 ? (
                                    <div className="grid grid-cols-3 gap-2">
                                        {recentItems.map(item => <RecentImageItem key={item.id} item={item} onNavigate={() => onNavigate('gallery')} />)}
                                    </div>
                                ) : (
                                    <p className="text-sm text-base-content/50 py-8 text-center italic">Gallery is empty.</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}

export default Dashboard;
