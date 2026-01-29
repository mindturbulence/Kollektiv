
import React, { useState, useEffect, useRef } from 'react';
import { loadSavedPrompts, loadPromptCategories, addSavedPrompt } from '../utils/promptStorage';
import { loadGalleryItems, loadCategories as loadGalleryCategories } from '../utils/galleryStorage';
import type { SavedPrompt, GalleryItem, ActiveTab, Idea } from '../types';
import { 
    PromptIcon, PhotoIcon, SparklesIcon, BookOpenIcon, 
    AdjustmentsVerticalIcon, ClockIcon, FolderClosedIcon, CpuChipIcon,
    RefreshIcon, LayoutDashboardIcon, SearchIcon, CheckIcon, ArchiveIcon
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

const DiagnosticGauge: React.FC<{ label: string; value: string; progress: number; icon: React.ReactNode }> = ({ label, value, progress, icon }) => (
    <div className="flex flex-col p-6 border-r border-b border-base-300 last:border-r-0 group bg-base-100/50 min-h-[140px] relative overflow-hidden">
        <div className="flex items-center justify-between mb-4 relative z-10">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-base-content/40">{label}</span>
            <div className="text-primary opacity-20 group-hover:opacity-100 transition-all duration-700">{icon}</div>
        </div>
        <div className="mt-auto relative z-10">
            <div className="flex items-baseline gap-2 mb-2">
                <span className="text-3xl font-black tracking-tighter leading-none uppercase">{value}</span>
            </div>
            <div className="w-full h-1 bg-base-300 rounded-none overflow-hidden">
                <div 
                    className="h-full bg-primary transition-all duration-1000 ease-out" 
                    style={{ width: `${Math.min(100, Math.max(2, progress))}%` }}
                ></div>
            </div>
        </div>
        <div className="absolute top-0 right-0 p-1 opacity-[0.03] pointer-events-none uppercase font-black text-6xl tracking-tighter -rotate-12 translate-x-4">
            {label.split(' ')[0]}
        </div>
    </div>
);

const ImageTile: React.FC<{ item: GalleryItem; onNavigate: () => void }> = ({ item, onNavigate }) => {
    const [mediaUrl, setMediaUrl] = useState<string | null>(null);
    const [stats, setStats] = useState<string>('ANALYZING...');

    useEffect(() => {
        let isMounted = true;
        const loadMedia = async () => {
            if (!item.urls[0]) return;
            try {
                const blob = await fileSystemManager.getFileAsBlob(item.urls[0]);
                if (isMounted && blob) {
                    setMediaUrl(URL.createObjectURL(blob));
                    setStats(`${formatBytes(blob.size)} • ${item.type.toUpperCase()}`);
                }
            } catch (err) { console.error(err); }
        };
        loadMedia();
        return () => { isMounted = false; };
    }, [item]);

    if (!mediaUrl) return <div className="w-full aspect-square bg-base-200 animate-pulse border-r border-b border-base-300"></div>;

    return (
        <button 
            onClick={onNavigate} 
            className="relative group w-full aspect-square bg-black border-r border-b border-base-300 overflow-hidden"
        >
            {item.type === 'video' ? (
                <video src={mediaUrl} className="w-full h-full object-cover media-monochrome group-hover:filter-none transition-all duration-700 opacity-60 group-hover:opacity-100" muted loop autoPlay />
            ) : (
                <img src={mediaUrl} alt={item.title} className="w-full h-full object-cover media-monochrome group-hover:filter-none transition-all duration-700 opacity-60 group-hover:opacity-100" />
            )}
            <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="absolute inset-0 flex flex-col justify-end p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-500 bg-base-100/90 backdrop-blur-md text-left">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary truncate mb-1">{item.title}</span>
                <span className="text-[8px] font-mono font-bold opacity-40 uppercase">{stats}</span>
            </div>
        </button>
    );
};

const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onClipIdea }) => {
    const { settings } = useSettings();
    const [isLoading, setIsLoading] = useState(true);
    const [quickPrompt, setQuickPrompt] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [uptime, setUptime] = useState(0);
    const [drift, setDrift] = useState('0.000');
    
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

    const [opLog, setOpLog] = useState<{msg: string, time: string}[]>([]);

    const addLog = (msg: string) => {
        setOpLog(prev => [{ msg, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 5));
    };

    useEffect(() => {
        const interval = setInterval(() => {
            setUptime(prev => prev + 1);
            setDrift((Math.random() * 0.9).toFixed(3));
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const fetchData = async () => {
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
            addLog("Registry Synchronized");
        } catch(e) {
            console.error("Dashboard load fail:", e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const handleQuickCommit = async () => {
        if (!quickPrompt.trim()) return;
        setIsSaving(true);
        try {
            await addSavedPrompt({
                text: quickPrompt.trim(),
                title: `QUICK_${Date.now().toString().slice(-4)}`,
                tags: ['Quick Commit']
            });
            setQuickPrompt('');
            addLog(`Committed: ${quickPrompt.slice(0, 15)}...`);
            fetchData();
        } catch (e) {
            addLog("ERR: Commit Failed");
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return (
        <div className="flex-grow flex items-center justify-center w-full h-full bg-base-100">
            <LoadingSpinner />
        </div>
    );

    const storagePercent = data.storageQuota ? (data.storageUsage / data.storageQuota) * 100 : 0;

    return (
        <div className="animate-fade-in bg-base-100 min-h-full flex flex-col font-sans select-none">
            {/* Neural Command Header */}
            <section className="px-10 py-4 border-b border-base-300 bg-base-200/40 flex justify-between items-center overflow-hidden">
                <div className="flex items-center gap-8">
                    <div className="flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full bg-success animate-pulse shadow-[0_0_10px_oklch(var(--s))]"></span>
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/60">System Uplink Active</span>
                    </div>
                    <div className="flex items-center gap-6 border-l border-base-300 pl-8">
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-base-content/20 uppercase tracking-widest">Core Uptime</span>
                            <span className="text-[10px] font-mono font-bold text-primary">{Math.floor(uptime / 60)}m {uptime % 60}s</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-base-content/20 uppercase tracking-widest">Neural Drift</span>
                            <span className="text-[10px] font-mono font-bold text-primary">{drift} MS</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-[9px] font-mono font-bold opacity-30 uppercase tracking-widest">{fileSystemManager.appDirectoryName || 'ARCHIVE_OFFLINE'}</span>
                    <button onClick={fetchData} className="btn btn-ghost btn-xs btn-square opacity-20 hover:opacity-100 hover:text-primary transition-all"><RefreshIcon className="w-3.5 h-3.5"/></button>
                </div>
            </section>
            
            <div className="grid grid-cols-1 lg:grid-cols-12 flex-grow bg-base-300 gap-px">
                {/* Left Column: Intelligence & Intake (7 Span) */}
                <div className="lg:col-span-7 flex flex-col gap-px h-full bg-base-300">
                    
                    {/* Top Group: Telemetry */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-px flex-none items-stretch">
                        <div className="grid grid-cols-2 bg-base-100">
                            <DiagnosticGauge label="Vault Capacity" value={formatBytes(data.vaultSizeBytes).split(' ')[0]} progress={Math.min(100, (data.vaultSizeBytes / (500 * 1024 * 1024)) * 100)} icon={<FolderClosedIcon />} />
                            <DiagnosticGauge label="Host Load" value={formatBytes(data.storageUsage).split(' ')[0]} progress={storagePercent} icon={<AdjustmentsVerticalIcon />} />
                            <DiagnosticGauge label="Neural Sync" value={`${data.deviceMemory} GB`} progress={(data.deviceMemory / 32) * 100} icon={<CpuChipIcon />} />
                            <DiagnosticGauge label="Token Index" value={`${data.promptCount + data.galleryCount}`} progress={((data.promptCount + data.galleryCount) / 1000) * 100} icon={<ArchiveIcon />} />
                        </div>

                        {/* Neural Intake Terminal */}
                        <div className="flex flex-col bg-base-100">
                            <div className="p-4 bg-base-200/50 border-b border-base-300 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <SparklesIcon className="w-4 h-4 text-primary"/>
                                    <h2 className="text-[9px] font-black uppercase tracking-[0.4em] text-base-content/50">Neural Intake</h2>
                                </div>
                                <span className="text-[8px] font-mono font-bold opacity-20 animate-pulse uppercase">Awaiting Stream</span>
                            </div>
                            <div className="p-6 flex flex-col flex-grow bg-base-100 relative">
                                <textarea 
                                    value={quickPrompt}
                                    onChange={e => setQuickPrompt(e.target.value)}
                                    placeholder="Type core concept for rapid archival..."
                                    className="textarea textarea-ghost resize-none flex-grow bg-transparent p-0 font-medium text-sm focus:outline-none placeholder:text-base-content/10 min-h-[80px]"
                                />
                                <div className="mt-4 pt-4 border-t border-base-300/30 flex justify-between items-center">
                                    <span className="text-[8px] font-mono font-bold text-base-content/20 uppercase">Target: Primary Library</span>
                                    <button 
                                        onClick={handleQuickCommit}
                                        disabled={!quickPrompt.trim() || isSaving}
                                        className="btn btn-xs btn-primary rounded-none font-black tracking-widest uppercase px-4 shadow-lg"
                                    >
                                        {isSaving ? 'SYNCING...' : 'COMMIT TOKEN'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Operational Feed & Recent Registry */}
                    <div className="flex flex-col flex-grow bg-base-300 gap-px">
                        <div className="grid grid-cols-1 md:grid-cols-2 flex-grow gap-px bg-base-300">
                             {/* Operational History */}
                            <div className="flex flex-col bg-base-100">
                                <div className="p-6 border-b border-base-300 flex justify-between items-center bg-base-200/10">
                                    <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-base-content/30 flex items-center gap-4">
                                        <span className="w-2.5 h-[1px] bg-primary"></span> Operational History
                                    </h2>
                                </div>
                                <div className="flex-grow p-6 bg-black/5 font-mono text-[10px] flex flex-col gap-3">
                                    {opLog.length > 0 ? opLog.map((log, i) => (
                                        <div key={i} className="flex gap-4 animate-fade-in">
                                            <span className="opacity-20 text-[8px] flex-shrink-0">[{log.time}]</span>
                                            <span className="font-bold text-primary/60 uppercase tracking-tighter">{log.msg}</span>
                                        </div>
                                    )) : (
                                        <div className="opacity-10 text-[8px] uppercase tracking-widest text-center mt-8">System Standby</div>
                                    )}
                                </div>
                            </div>

                            {/* Recent Sequences */}
                            <div className="flex flex-col bg-base-100">
                                <div className="p-6 border-b border-base-300 flex justify-between items-center bg-base-200/10">
                                    <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-base-content/30 flex items-center gap-4">
                                        Recent Sequences
                                    </h2>
                                    <button onClick={() => onNavigate('prompt')} className="text-[9px] font-black uppercase tracking-widest text-primary hover:underline">Registry</button>
                                </div>
                                <div className="flex flex-col divide-y divide-base-300/50 bg-base-100">
                                    {data.prompts.length > 0 ? data.prompts.map(p => (
                                        <button 
                                            key={p.id} 
                                            onClick={() => onNavigate('prompt')}
                                            className="p-4 text-left hover:bg-primary/5 transition-colors group flex items-start gap-4"
                                        >
                                            <div className="w-1 h-8 bg-base-300 group-hover:bg-primary transition-colors flex-shrink-0"></div>
                                            <div className="min-w-0">
                                                <p className="text-xs font-black uppercase tracking-tighter truncate">{p.title || 'Artifact'}</p>
                                                <p className="text-[10px] font-medium text-base-content/40 italic truncate mt-1">"{p.text}"</p>
                                            </div>
                                        </button>
                                    )) : (
                                        <div className="p-20 text-center text-[10px] font-black uppercase tracking-widest opacity-10">Empty Feed</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Tactical Menu Footer */}
                        <div className="grid grid-cols-4 bg-base-100 border-t border-base-300">
                            <button onClick={() => onNavigate('prompts')} className="p-4 flex flex-col items-center justify-center border-r border-base-300 hover:bg-primary/5 transition-all group">
                                <SparklesIcon className="w-5 h-5 mb-2 opacity-20 group-hover:opacity-100 group-hover:text-primary transition-all" />
                                <span className="text-[8px] font-black uppercase tracking-widest opacity-40 group-hover:opacity-100">Builder</span>
                            </button>
                            <button onClick={() => onNavigate('prompt')} className="p-4 flex flex-col items-center justify-center border-r border-base-300 hover:bg-primary/5 transition-all group">
                                <PromptIcon className="w-5 h-5 mb-2 opacity-20 group-hover:opacity-100 group-hover:text-primary transition-all" />
                                <span className="text-[8px] font-black uppercase tracking-widest opacity-40 group-hover:opacity-100">Registry</span>
                            </button>
                            <button onClick={() => onNavigate('gallery')} className="p-4 flex flex-col items-center justify-center border-r border-base-300 hover:bg-primary/5 transition-all group">
                                <PhotoIcon className="w-5 h-5 mb-2 opacity-20 group-hover:opacity-100 group-hover:text-primary transition-all" />
                                <span className="text-[8px] font-black uppercase tracking-widest opacity-40 group-hover:opacity-100">Manifest</span>
                            </button>
                            <button onClick={() => onNavigate('cheatsheet')} className="p-4 flex flex-col items-center justify-center hover:bg-primary/5 transition-all group">
                                <BookOpenIcon className="w-5 h-5 mb-2 opacity-20 group-hover:opacity-100 group-hover:text-primary transition-all" />
                                <span className="text-[8px] font-black uppercase tracking-widest opacity-40 group-hover:opacity-100">Archival</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right Column: Visual Manifest & Global Analytics (5 Span) */}
                <div className="lg:col-span-5 flex flex-col gap-px h-full bg-base-100 border-l border-base-300">
                    <div className="grid grid-cols-3 bg-base-100 border-b border-base-300">
                        <div className="p-8 flex flex-col items-center justify-center border-r border-base-300">
                            <span className="text-4xl font-black tracking-tighter leading-none">{data.promptCount}</span>
                            <span className="text-[9px] font-black uppercase tracking-[0.3em] opacity-40 mt-3">Sequences</span>
                        </div>
                        <div className="p-8 flex flex-col items-center justify-center border-r border-base-300">
                            <span className="text-4xl font-black tracking-tighter leading-none">{data.galleryCount}</span>
                            <span className="text-[9px] font-black uppercase tracking-[0.3em] opacity-40 mt-3">Artifacts</span>
                        </div>
                        <div className="p-8 flex flex-col items-center justify-center">
                            <span className="text-4xl font-black tracking-tighter leading-none">{data.categoryCount}</span>
                            <span className="text-[9px] font-black uppercase tracking-[0.3em] opacity-40 mt-3">Sectors</span>
                        </div>
                    </div>

                    <div className="flex flex-col flex-grow bg-base-100">
                        <div className="p-6 border-b border-base-300 flex justify-between items-center bg-base-200/10">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-base-content/30 flex items-center gap-4">
                                <span className="w-2.5 h-[1px] bg-primary"></span> Visual Manifest
                            </h2>
                            <button onClick={() => onNavigate('gallery')} className="btn btn-xs btn-ghost text-[9px] font-black uppercase tracking-widest text-primary">Access Vault</button>
                        </div>
                        
                        <div className="grid grid-cols-3 bg-base-300 content-start flex-grow">
                            {data.gallery.length > 0 ? (
                                data.gallery.map((item, idx) => (
                                    <div key={item.id} className="relative">
                                        {idx === 0 && (
                                            <div className="absolute top-2 left-2 z-10 flex gap-1 pointer-events-none">
                                                <span className="bg-primary text-primary-content text-[7px] font-black px-1 py-0.5 animate-pulse uppercase">Live Buffer</span>
                                            </div>
                                        )}
                                        <ImageTile item={item} onNavigate={() => onNavigate('gallery')} />
                                    </div>
                                ))
                            ) : (
                                <div className="col-span-3 p-32 text-center text-base-content/5 uppercase font-black tracking-widest h-full flex flex-col items-center justify-center bg-base-100">
                                    <PhotoIcon className="w-16 h-16 mb-4 opacity-5" />
                                    Archives Null
                                </div>
                            )}
                            {Array.from({ length: Math.max(0, 9 - data.gallery.length) }).map((_, i) => (
                                 <div key={i} className="aspect-square bg-base-100 border-r border-b border-base-300/10 opacity-[0.02]"></div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;
