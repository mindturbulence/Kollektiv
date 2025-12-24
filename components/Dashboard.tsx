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
    <button onClick={onNavigate} className="w-full text-left p-3 rounded-lg hover:bg-base-200 transition-colors">
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
                <PhotoIcon className="w-8 h-8" />
                <span className="text-xs mt-1">Load failed</span>
            </button>
        );
    }
    
    if (!mediaUrl) {
        return <div className="w-full aspect-square bg-base-200 rounded-lg animate-pulse"></div>;
    }

    return (
        <button onClick={onNavigate} className="relative group w-full aspect-square bg-base-200 rounded-lg overflow-hidden">
            {item.type === 'video' ? (
                <video src={mediaUrl} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" muted loop autoPlay />
            ) : (
                <img src={mediaUrl} alt={item.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex items-end p-2">
                <p className="text-white text-xs font-semibold truncate">{item.title}</p>
            </div>
        </button>
    );
};

const ActionCard: React.FC<{ title: string; description: string; icon: React.ReactNode; onClick: () => void; className?: string }> = 
({ title, description, icon, onClick, className = '' }) => (
    <button onClick={onClick} className={`text-left p-6 rounded-xl shadow-lg hover:shadow-2xl flex flex-col justify-between gap-4 transition-all duration-300 ease-in-out transform hover:-translate-y-1 ${className}`}>
        <div>
            <div className="p-3 inline-block rounded-full bg-base-100/80 mb-4">
                {icon}
            </div>
            <h3 className="text-lg font-bold">{title}</h3>
            <p className="text-sm opacity-80 mt-1">{description}</p>
        </div>
        <div className="text-right font-semibold text-sm">→</div>
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
        
                setRecentPrompts(prompts.slice(0, 5));
                setRecentItems(items.filter(item => !item.isNsfw).slice(0, 4));
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
        <section className="p-4 sm:p-6 lg:p-8 animate-fade-in">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-base-content">Dashboard</h1>
                <p className="text-base-content/70 mt-1">Welcome back! Here's a quick overview of your creative workspace.</p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Column */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <ActionCard title="AI Prompt Refiner" description="Let Gemini enhance your creative ideas into powerful prompts." icon={<SparklesIcon className="w-8 h-8 text-primary"/>} onClick={() => onNavigate('prompts')} className="bg-primary/80 text-primary-content"/>
                        {settings.features.isPromptLibraryEnabled && <ActionCard title="Prompt Library" description="Browse and manage your collection of saved prompts." icon={<PromptIcon className="w-8 h-8 text-secondary"/>} onClick={() => onNavigate('prompt')} className="bg-secondary/80 text-secondary-content"/>}
                        {settings.features.isGalleryEnabled && <ActionCard title="Gallery" description="Organize and view your generated images and videos." icon={<PhotoIcon className="w-8 h-8 text-accent"/>} onClick={() => onNavigate('gallery')} className="bg-accent/80 text-accent-content"/>}
                        {settings.features.isToolsEnabled && <ActionCard title="Creative Tools" description="Use utilities like the resizer, color extractor, and more." icon={<AdjustmentsVerticalIcon className="w-8 h-8 text-info"/>} onClick={() => onNavigate('resizer')} className="bg-info/80 text-info-content"/>}
                    </div>

                    {settings.features.isPromptLibraryEnabled && recentPrompts.length > 0 && (
                        <div className="card bg-base-100 shadow-lg">
                            <div className="card-body">
                                <h2 className="card-title text-primary">Recent Prompts</h2>
                                <div className="space-y-2">
                                    {recentPrompts.map(p => <RecentPromptItem key={p.id} prompt={p} onNavigate={() => onNavigate('prompt')} />)}
                                </div>
                            </div>
                        </div>
                    )}

                    {settings.features.isGalleryEnabled && recentItems.length > 0 && (
                         <div className="card bg-base-100 shadow-lg">
                            <div className="card-body">
                               <h2 className="card-title text-primary">Recent Gallery Items</h2>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    {recentItems.map(item => <RecentImageItem key={item.id} item={item} onNavigate={() => onNavigate('gallery')} />)}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Sidebar Column */}
                <div className="space-y-6">
                    {settings.features.isCheatsheetsEnabled && (
                        <div className="card bg-base-100 shadow-lg">
                            <div className="card-body">
                                <h2 className="card-title text-primary">Cheatsheets</h2>
                                <ul className="menu menu-sm">
                                    <li><a onClick={() => onNavigate('cheatsheet')}><BookOpenIcon className="w-5 h-5"/> Prompting Guide</a></li>
                                    <li><a onClick={() => onNavigate('artstyles')}><PaletteIcon className="w-5 h-5"/> Art Styles</a></li>
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}

export default Dashboard;
