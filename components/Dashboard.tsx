
import React, { useState, useEffect, useMemo } from 'react';
import { loadSavedPrompts, loadPromptCategories } from '../utils/promptStorage';
import { loadGalleryItems, loadCategories as loadGalleryCategories } from '../utils/galleryStorage';
import type { SavedPrompt, GalleryItem, ActiveTab, Idea } from '../types';
import { 
    PromptIcon, PhotoIcon, SparklesIcon, BookOpenIcon, 
    AdjustmentsVerticalIcon, ClockIcon, FolderClosedIcon, CpuChipIcon,
    // Fix: ActivityIcon was removed from icons.tsx or never existed, removing non-existent export import
    RefreshIcon, LayoutDashboardIcon, SearchIcon
} from './icons';
import { fileSystemManager } from '../utils/fileUtils';
import LoadingSpinner from './LoadingSpinner';
import { useSettings } from '../contexts/SettingsContext';
import SavedPromptCard from './SavedPromptCard';

interface DashboardProps {
    onNavigate: (tab: ActiveTab) => void;
    onClipIdea: (idea: Idea) => void;
}

const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const TelemetryItem: React.FC<{ label: string; value: string | number; sub?: string; icon: React.ReactNode }> = ({ label, value, sub, icon }) => (
    <div className="flex flex-col p-6 border-r border-b border-base-300 last:border-r-0 group justify-center bg-base-100/50 min-h-[120px]">
        <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-base-content/40">{label}</span>
            <div className="opacity-10 group-hover:opacity-30 transition-opacity text-primary">{icon}</div>
        </div>
        <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tighter leading-none uppercase">{value}</span>
            {sub && <span className="text-[9px] font-mono font-bold opacity-30 uppercase">{sub}</span>}
        </div>
    </div>
);

const ActionMatrixTile: React.FC<{ 
    title: string; 
    icon: React.ReactNode; 
    desc: string;
    onClick: () => void; 
}> = ({ title, icon, desc, onClick }) => (
    <button 
        onClick={onClick}
        className="group relative flex flex-col items-center justify-center p-8 text-center border-r border-b border-base-300 transition-all duration-500 hover:bg-primary/5 bg-base-100 overflow-hidden"
    >
        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
            <RefreshIcon className="w-3 h-3 text-primary/40" />
        </div>
        <div className="text-base-content/20 group-hover:text-primary transition-all duration-700 group-hover:scale-110 mb-5">
            {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { className: 'w-14 h-14 stroke-[1]' }) : icon}
        </div>
        <span className="text-[10px] font-black uppercase tracking-[0.5em] text-base-content/40 group-hover:text-primary transition-colors mb-2">{title}</span>
        <p className="text-[8px] font-bold text-base-content/10 group-hover:text-base-content/30 uppercase tracking-widest max-w-[120px]">{desc}</p>
    </button>
);

const StatColumn: React.FC<{ label: string; value: number | string }> = ({ label, value }) => (
    <div className="flex flex-col items-center justify-center py-6 flex-1 border-r border-base-300 last:border-r-0 bg-base-100 h-[120px]">
        <span className="text-4xl font-black tracking-tighter leading-none">{value}</span>
        <span className="text-[10px] uppercase font-black text-base-content/40 tracking-[0.3em] mt-3">{label}</span>
    </div>
);

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

    if (!mediaUrl) return <div className="w-full aspect-square bg-base-200 animate-pulse border-r border-b border-base-300"></div>;

    return (
        <button 
            onClick={onNavigate} 
            className="relative group w-full aspect-square bg-black border-r border-b border-base-300 overflow-hidden"
        >
            {item.type === 'video' ? (
                <video src={mediaUrl} className="w-full h-full object-cover media-monochrome group-hover:filter-none transition-all duration-1000 group-hover:opacity-100 opacity-60" muted loop autoPlay />
            ) : (
                <img src={mediaUrl} alt={item.title} className="w-full h-full object-cover media-monochrome group-hover:filter-none transition-all duration-1000 group-hover:opacity-100 opacity-60" />
            )}
            <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-500 bg-base-100/95 backdrop-blur-md flex flex-col text-left border-t border-base-300">
                <span className="text-[9px] font-black uppercase tracking-widest text-primary truncate">{item.title}</span>
            </div>
        </button>
    );
};

const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onClipIdea }) => {
    const { settings } = useSettings();
    const [isLoading, setIsLoading] = useState(true);
    const [lastSync, setLastSync] = useState(new Date().toLocaleTimeString());
    
    const [data, setData] = useState({
        prompts: [] as SavedPrompt[],
        gallery: [] as GalleryItem[],
        promptCategories: [] as any[],
        promptCount: 0,
        galleryCount: 0,
        categoryCount: 0,
        vaultSizeBytes: 0,
        storageUsage: 0,
        storageQuota: 0,
        deviceMemory: 0
    });

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [prompts, gallery, pCats, gCats, vaultSize] = await Promise.all([
                    loadSavedPrompts(),
                    loadGalleryItems(),
                    loadPromptCategories(),
                    loadGalleryCategories(),
                    fileSystemManager.calculateTotalSize()
                ]);

                let usage = 0;
                let quota = 0;
                if (navigator.storage && navigator.storage.estimate) {
                    const estimate = await navigator.storage.estimate();
                    usage = estimate.usage || 0;
                    quota = estimate.quota || 0;
                }

                setData({
                    prompts: prompts.slice(0, 2),
                    gallery: gallery.filter(item => !item.isNsfw).slice(0, 9),
                    promptCategories: pCats,
                    promptCount: prompts.length,
                    galleryCount: gallery.length,
                    categoryCount: pCats.length + gCats.length,
                    vaultSizeBytes: vaultSize,
                    storageUsage: usage,
                    storageQuota: quota,
                    deviceMemory: (navigator as any).deviceMemory || 0
                });
                setLastSync(new Date().toLocaleTimeString());
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
            {/* Uplink Status Header */}
            <section className="px-10 py-4 border-b border-base-300 bg-base-200/40 flex justify-between items-center overflow-hidden">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                        <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/40">Uplink Active</span>
                    </div>
                    <div className="hidden md:flex items-center gap-2 border-l border-base-300 pl-6">
                        <FolderClosedIcon className="w-3.5 h-3.5 opacity-20" />
                        <span className="text-[9px] font-mono font-bold opacity-30 uppercase truncate max-w-[200px]">{fileSystemManager.appDirectoryName || 'No Vault Linked'}</span>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-[9px] font-mono font-bold opacity-30 uppercase">Last Sync: {lastSync}</span>
                    <button onClick={() => window.location.reload()} className="btn btn-ghost btn-xs btn-square opacity-20 hover:opacity-100"><RefreshIcon className="w-3.5 h-3.5"/></button>
                </div>
            </section>
            
            <div className="grid grid-cols-1 lg:grid-cols-12 flex-grow bg-base-300 gap-px">
                {/* Left Column: Command & Registry (7 Span) */}
                <div className="lg:col-span-7 flex flex-col gap-px h-full">
                    
                    {/* Diagnostic Matrix */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-px flex-none items-stretch">
                        <div className="flex flex-col bg-base-100">
                            <div className="p-4 bg-base-200/50 border-b border-base-300 flex items-center gap-3">
                                <CpuChipIcon className="w-4 h-4 text-primary"/>
                                <h2 className="text-[9px] font-black uppercase tracking-[0.4em] text-base-content/50">Diagnostic Telemetry</h2>
                            </div>
                            <div className="grid grid-cols-2 flex-grow">
                                <TelemetryItem label="Vault Size" value={formatBytes(data.vaultSizeBytes).split(' ')[0]} sub={formatBytes(data.vaultSizeBytes).split(' ')[1]} icon={<FolderClosedIcon />} />
                                <TelemetryItem label="Memory Load" value={data.deviceMemory || '??'} sub="GB RAM" icon={<AdjustmentsVerticalIcon />} />
                                <TelemetryItem label="Host Disk" value={formatBytes(data.storageUsage).split(' ')[0]} sub={formatBytes(data.storageUsage).split(' ')[1]} icon={<ClockIcon />} />
                                <TelemetryItem label="Archives" value={data.promptCount + data.galleryCount} sub="Tokens" icon={<SparklesIcon />} />
                            </div>
                        </div>

                        {/* Action Matrix */}
                        <div className="grid grid-cols-2 bg-base-300 gap-px items-stretch">
                            <ActionMatrixTile title="Builder" icon={<SparklesIcon/>} desc="Neural prompt synthesis" onClick={() => onNavigate('prompts')} />
                            <ActionMatrixTile title="Library" icon={<PromptIcon/>} desc="Registry vault access" onClick={() => onNavigate('prompt')} />
                            <ActionMatrixTile title="Gallery" icon={<PhotoIcon/>} desc="Visual artifact manifest" onClick={() => onNavigate('gallery')} />
                            <ActionMatrixTile title="Guides" icon={<BookOpenIcon/>} desc="Tactical prompt logic" onClick={() => onNavigate('cheatsheet')} />
                        </div>
                    </div>

                    {/* Recent Prompt Registry */}
                    <div className="flex flex-col flex-grow bg-base-100">
                        <div className="p-6 border-b border-base-300 flex justify-between items-center bg-base-100">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-base-content/30 flex items-center gap-4">
                                <span className="w-2.5 h-[1px] bg-primary"></span> Recent Neural Sequences
                            </h2>
                            <button onClick={() => onNavigate('prompt')} className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline">
                                View Full Registry
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 bg-base-300 gap-px flex-grow border-b border-base-300">
                            {data.prompts.length > 0 ? (
                                data.prompts.map(p => (
                                    <div key={p.id} className="bg-base-100">
                                        <SavedPromptCard 
                                            prompt={p} 
                                            categoryName={data.promptCategories.find(c => c.id === p.categoryId)?.name} 
                                            onDeleteClick={() => onNavigate('prompt')} 
                                            onEditClick={() => onNavigate('prompt')} 
                                            onSendToEnhancer={() => onNavigate('prompts')} 
                                            onOpenDetailView={() => onNavigate('prompt')} 
                                            onClip={(prompt) => onClipIdea({ id: `clipped-${prompt.id}`, lens: 'Dashboard', title: prompt.title || 'Artifact', prompt: prompt.text, source: 'Dashboard' })}
                                        />
                                    </div>
                                ))
                            ) : (
                                <div className="col-span-2 p-32 text-center text-base-content/5 uppercase font-black tracking-widest text-3xl bg-base-100 flex flex-col items-center justify-center">
                                    <PromptIcon className="w-16 h-16 mb-4 opacity-5" />
                                    Library Offline
                                </div>
                            )}
                            {data.prompts.length === 1 && (
                                <div className="bg-base-100 border-base-300/30 opacity-5"></div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Manifest & Global Stats (5 Span) */}
                <div className="lg:col-span-5 flex flex-col gap-px h-full bg-base-100">
                    <div className="flex bg-base-100 border-b border-base-300">
                        <StatColumn label="Prompts" value={data.promptCount} />
                        <StatColumn label="Artifacts" value={data.galleryCount} />
                        <StatColumn label="Folders" value={data.categoryCount} />
                    </div>

                    <div className="flex flex-col flex-grow">
                        <div className="p-6 border-b border-base-300 flex justify-between items-center bg-base-100">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-base-content/30 flex items-center gap-4">
                                <span className="w-2.5 h-[1px] bg-primary"></span> Visual Manifest
                            </h2>
                            <button onClick={() => onNavigate('gallery')} className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline">
                                Access Vault
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-3 bg-base-300 content-start flex-grow">
                            {data.gallery.length > 0 ? (
                                data.gallery.map(item => <ImageTile key={item.id} item={item} onNavigate={() => onNavigate('gallery')} />)
                            ) : (
                                <div className="col-span-3 p-32 text-center text-base-content/5 uppercase font-black tracking-widest h-full flex flex-col items-center justify-center bg-base-100">
                                    <PhotoIcon className="w-16 h-16 mb-4 opacity-5" />
                                    Vault Empty
                                </div>
                            )}
                            {Array.from({ length: Math.max(0, 9 - data.gallery.length) }).map((_, i) => (
                                 <div key={i} className="aspect-square bg-base-100 border-r border-b border-base-300/10 opacity-5"></div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;
