
import React, { useState, useEffect, useRef } from 'react';
import { loadSavedPrompts } from '../utils/promptStorage';
import { loadGalleryItems } from '../utils/galleryStorage';
import type { SavedPrompt, GalleryItem, ActiveTab, Idea } from '../types';
import { 
    PhotoIcon, SparklesIcon, BookOpenIcon, 
    FolderClosedIcon, CpuChipIcon,
    RefreshIcon, ChevronRightIcon, ChevronDownIcon
} from './icons';
import { fileSystemManager } from '../utils/fileUtils';
import LoadingSpinner from './LoadingSpinner';
import { useSettings } from '../contexts/SettingsContext';

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

const MetricCard: React.FC<{ label: string; value: string; progress: number; icon: React.ReactNode }> = ({ label, value, progress, icon }) => (
    <div className="flex flex-col p-10 border border-base-300 group bg-base-100 transition-all duration-700 hover:bg-base-200/50 relative overflow-hidden reveal-on-scroll">
        <div className="flex items-start justify-between mb-10 relative z-10">
            <span className="text-[10px] font-black uppercase tracking-[0.5em] text-primary/40 group-hover:text-primary transition-colors">{label}</span>
            <div className="opacity-5 group-hover:opacity-100 transition-all duration-700 scale-75 grayscale group-hover:filter-none">{icon}</div>
        </div>
        <div className="mt-auto relative z-10">
            <div className="flex items-baseline gap-2 mb-6">
                <span className="text-5xl font-black tracking-tighter leading-none uppercase italic">{value}</span>
            </div>
            <div className="w-full h-[1px] bg-base-300 rounded-none overflow-hidden">
                <div 
                    className="h-full bg-primary transition-all duration-1000 ease-out" 
                    style={{ width: `${Math.min(100, Math.max(4, progress))}%` }}
                ></div>
            </div>
        </div>
        <div className="absolute -bottom-6 -right-6 opacity-[0.01] pointer-events-none uppercase font-black text-9xl tracking-tighter group-hover:opacity-[0.04] transition-opacity duration-1000">
            {label.split(' ')[0]}
        </div>
    </div>
);

const ImageTile: React.FC<{ item: GalleryItem; onNavigate: () => void; className?: string }> = ({ item, onNavigate, className = "" }) => {
    const [mediaUrl, setMediaUrl] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        const loadMedia = async () => {
            if (!item.urls[0]) return;
            try {
                const blob = await fileSystemManager.getFileAsBlob(item.urls[0]);
                if (isMounted && blob) {
                    setMediaUrl(URL.createObjectURL(blob));
                }
            } catch (err) { console.error(err); }
        };
        loadMedia();
        return () => { isMounted = false; };
    }, [item]);

    if (!mediaUrl) return <div className={`aspect-square bg-base-200 animate-pulse border border-base-300 ${className}`}></div>;

    return (
        <button 
            onClick={onNavigate} 
            className={`relative group overflow-hidden border border-base-300 transition-all duration-1000 hover:shadow-2xl reveal-on-scroll ${className}`}
        >
            <div className="w-full h-full scale-100 group-hover:scale-110 transition-transform duration-[2000ms]">
                {item.type === 'video' ? (
                    <video src={mediaUrl} className="w-full h-full object-cover group-hover:filter-none transition-all duration-1000 opacity-60 group-hover:opacity-100" muted loop autoPlay />
                ) : (
                    <img src={mediaUrl} alt={item.title} className="w-full h-full object-cover group-hover:filter-none transition-all duration-1000 opacity-60 group-hover:opacity-100" />
                )}
            </div>
            <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
            <div className="absolute inset-0 flex flex-col justify-end p-8 translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-700 bg-gradient-to-t from-black/90 via-black/20 to-transparent text-left">
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary truncate mb-2">{item.title}</span>
                <span className="text-[8px] font-mono font-bold text-white/40 uppercase">VIEW IMAGE [01]</span>
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
    const scrollRef = useRef<HTMLDivElement>(null);
    const [scrollProgress, setScrollProgress] = useState(0);
    
    const [data, setData] = useState({
        prompts: [] as SavedPrompt[],
        gallery: [] as GalleryItem[],
        promptCount: 0,
        galleryCount: 0,
        vaultSizeBytes: 0,
        storageUsage: 0,
        storageQuota: 0,
    });

    useEffect(() => {
        const interval = setInterval(() => setUptime(prev => prev + 1), 1000);
        return () => clearInterval(interval);
    }, []);

    const fetchData = async () => {
        try {
            const [prompts, gallery, vaultSize] = await Promise.all([
                loadSavedPrompts(),
                loadGalleryItems(),
                fileSystemManager.calculateTotalSize()
            ]);

            let usage = 0; let quota = 0;
            if (navigator.storage && navigator.storage.estimate) {
                const estimate = await navigator.storage.estimate();
                usage = estimate.usage || 0;
                quota = estimate.quota || 0;
            }

            setData({
                prompts: prompts.slice(0, 5),
                gallery: gallery.filter(item => !item.isNsfw).slice(0, 8),
                promptCount: prompts.length,
                galleryCount: gallery.length,
                vaultSizeBytes: vaultSize,
                storageUsage: usage,
                storageQuota: quota,
            });
        } catch(e) { console.error(e); } finally { setIsLoading(false); }
    };

    useEffect(() => { 
        fetchData();
    }, []);

    // Intersection Observer for reveal animations
    useEffect(() => {
        if (isLoading) return;
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                }
            });
        }, { threshold: 0.1 });

        const targets = document.querySelectorAll('.reveal-on-scroll');
        targets.forEach(t => observer.observe(t));

        return () => observer.disconnect();
    }, [isLoading, data]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        const progress = (target.scrollTop / (target.scrollHeight - target.clientHeight)) * 100;
        setScrollProgress(progress);
    };

    const handleQuickCommit = async () => {
        if (!quickPrompt.trim()) return;
        setIsSaving(true);
        try {
            // Re-use logic or navigate
            setQuickPrompt('');
            onNavigate('prompts');
        } catch (e) { console.error(e); } finally { setIsSaving(false); }
    };

    if (isLoading) return <div className="flex-grow flex items-center justify-center w-full h-full bg-base-100"><LoadingSpinner /></div>;

    return (
        <div 
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex flex-col h-full bg-base-100 select-none overflow-y-auto custom-scrollbar scroll-smooth relative"
        >
            {/* SCROLL PROGRESS INDICATOR */}
            <div className="fixed top-16 left-0 w-full h-[1px] bg-base-300 z-[100] pointer-events-none">
                <div 
                    className="h-full bg-primary transition-all duration-150 ease-out" 
                    style={{ width: `${scrollProgress}%` }}
                ></div>
            </div>

            {/* HERO SECTION 1 */}
            <section className="relative h-[85vh] min-h-[600px] flex flex-col justify-center px-10 md:px-20 border-b border-base-300 overflow-hidden bg-base-100">
                <div 
                    className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]"
                    style={{ transform: `translateY(${scrollProgress * 0.5}px)` }}
                >
                    <h1 className="text-[35vw] font-black tracking-tighter leading-none uppercase select-none">Home</h1>
                </div>
                
                <div className="relative z-10 max-w-screen-2xl mx-auto w-full reveal-on-scroll">
                    <div className="flex items-center gap-6 mb-8">
                        <div className="w-4 h-4 bg-primary animate-pulse shadow-[0_0_20px_oklch(var(--p))]"></div>
                        <span className="text-[12px] font-black uppercase tracking-[0.6em] text-base-content/40">SYSTEM ONLINE</span>
                    </div>
                    <h2 className="text-7xl md:text-9xl font-black tracking-tighter uppercase leading-[0.85] mb-10">
                        Your Creative<br/>
                        Dashboard<br/>
                        <span className="text-primary italic">Library.</span>
                    </h2>
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-10">
                        <p className="max-w-xl text-[12px] font-bold text-base-content/30 uppercase tracking-[0.4em] leading-relaxed">
                            Private space for your prompts and images. <br/>
                            Uptime: <span className="text-primary font-mono">{Math.floor(uptime/3600)}h {Math.floor((uptime%3600)/60)}m {uptime%60}s</span>
                        </p>
                        <div className="flex flex-col items-center gap-4 group opacity-40 hover:opacity-100 transition-opacity text-center">
                            <span className="text-[10px] font-black uppercase tracking-[0.3em]">Scroll for details</span>
                            <ChevronDownIcon className="w-5 h-5 animate-bounce" />
                        </div>
                    </div>
                </div>
            </section>

            {/* METRICS SECTION 2 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-base-300 border-b border-base-300">
                <MetricCard label="Storage Size" value={formatBytes(data.vaultSizeBytes).split(' ')[0]} progress={Math.min(100, (data.vaultSizeBytes / (5 * 1024 * 1024 * 1024)) * 100)} icon={<FolderClosedIcon />} />
                <MetricCard label="Total Items" value={`${data.promptCount + data.galleryCount}`} progress={((data.promptCount + data.galleryCount) / 1000) * 100} icon={<CpuChipIcon />} />
                <div className="lg:col-span-1 md:col-span-2 flex flex-col p-10 bg-base-100 justify-center gap-4 reveal-on-scroll">
                    <span className="text-[10px] font-black uppercase tracking-[0.5em] text-base-content/20">Sync Status</span>
                    <div className="flex items-center gap-4">
                        <div className="badge badge-success rounded-none font-black text-[9px] tracking-widest px-3 py-3">STABLE</div>
                        <div className="badge badge-outline border-base-300 rounded-none font-black text-[9px] tracking-widest px-3 py-3 uppercase">Folder: {fileSystemManager.appDirectoryName?.slice(0,12) || 'NONE'}</div>
                    </div>
                </div>
            </div>

            {/* RECENT PROMPTS SECTION 3 */}
            <section className="bg-base-200/20 py-32 px-10 md:px-20 border-b border-base-300">
                <div className="max-w-screen-2xl mx-auto">
                    <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 mb-20 reveal-on-scroll">
                        <div>
                            <span className="text-[12px] font-black uppercase tracking-[0.6em] text-primary/60 block mb-4">Saved Content</span>
                            <h3 className="text-5xl md:text-7xl font-black tracking-tighter uppercase leading-none">Recent <br/>Prompts.</h3>
                        </div>
                        <button onClick={() => onNavigate('prompt')} className="btn btn-ghost rounded-none font-black text-xs tracking-[0.3em] uppercase group border-b border-base-300 pb-2">
                            Go to Library <ChevronRightIcon className="w-5 h-5 ml-2 group-hover:translate-x-2 transition-transform" />
                        </button>
                    </header>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-20">
                        <div className="space-y-1">
                            {data.prompts.length > 0 ? data.prompts.map((p, i) => (
                                <button 
                                    key={p.id} 
                                    onClick={() => onNavigate('prompt')}
                                    className="w-full p-12 text-left hover:bg-base-100 transition-all group relative overflow-hidden reveal-on-scroll border-b border-base-300 last:border-0"
                                >
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-8xl font-black opacity-[0.02] group-hover:opacity-[0.05] transition-opacity italic pointer-events-none">{String(i+1).padStart(2,'0')}</span>
                                    <div className="relative z-10 pl-6 border-l border-transparent group-hover:border-primary transition-all">
                                        <p className="text-2xl font-black uppercase tracking-tight mb-4 group-hover:text-primary transition-colors">{p.title || 'SAVED_ITEM'}</p>
                                        <p className="text-sm font-medium text-base-content/40 italic line-clamp-2 leading-relaxed max-w-2xl">"{p.text}"</p>
                                    </div>
                                </button>
                            )) : (
                                <div className="p-20 text-center opacity-10">
                                    <span className="text-sm font-black uppercase tracking-widest">No prompts saved yet</span>
                                </div>
                            )}
                        </div>
                        
                        {/* QUICK SAVE CARD */}
                        <div className="bg-base-100 p-12 md:p-16 border border-base-300 shadow-2xl flex flex-col h-full reveal-on-scroll">
                            <header className="flex justify-between items-center mb-12">
                                <span className="text-[10px] font-black uppercase tracking-[0.5em] text-primary/40">Quick Save</span>
                            </header>
                            <textarea 
                                value={quickPrompt}
                                onChange={e => setQuickPrompt(e.target.value)}
                                placeholder="TYPE A NEW IDEA HERE..."
                                className="textarea textarea-ghost resize-none flex-grow bg-transparent p-0 font-bold text-3xl md:text-4xl tracking-tighter focus:outline-none placeholder:text-base-content/5 uppercase italic min-h-[250px]"
                            />
                            <div className="pt-12 border-t border-base-300 mt-12">
                                <button 
                                    onClick={handleQuickCommit}
                                    disabled={!quickPrompt.trim() || isSaving}
                                    className="btn btn-primary btn-lg rounded-none w-full font-black tracking-[0.4em] uppercase h-24 shadow-2xl group text-sm"
                                >
                                    {isSaving ? 'SAVING...' : 'SAVE PROMPT'}
                                    <ChevronRightIcon className="w-6 h-6 ml-4 group-hover:translate-x-2 transition-transform" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* IMAGES SECTION 4 */}
            <section className="bg-base-100 py-32 px-10 md:px-20 overflow-hidden">
                <div className="max-w-screen-2xl mx-auto">
                    <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 mb-20 reveal-on-scroll">
                        <div>
                            <span className="text-[12px] font-black uppercase tracking-[0.6em] text-primary/60 block mb-4">Saved Images</span>
                            <h3 className="text-5xl md:text-7xl font-black tracking-tighter uppercase leading-none">Recent <br/>Images.</h3>
                        </div>
                        <div className="flex gap-4">
                             <button onClick={fetchData} className="btn btn-square btn-ghost border border-base-300 opacity-40 hover:opacity-100"><RefreshIcon className="w-5 h-5"/></button>
                             <button onClick={() => onNavigate('gallery')} className="btn btn-primary rounded-none font-black text-xs tracking-[0.3em] uppercase px-12">View Library</button>
                        </div>
                    </header>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-base-300 border border-base-300">
                        {data.gallery.length > 0 ? (
                            data.gallery.map((item) => (
                                <ImageTile key={item.id} item={item} onNavigate={() => onNavigate('gallery')} className="aspect-[4/5]" />
                            ))
                        ) : (
                            <div className="col-span-full py-40 text-center text-base-content/10 uppercase font-black tracking-widest flex flex-col items-center gap-6">
                                <PhotoIcon className="w-20 h-20 opacity-5" />
                                No images saved yet
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* STATUS BAR FOOTER */}
            <section className="p-16 border-t border-base-300 bg-base-100 flex flex-col md:flex-row justify-between items-center gap-12">
                <div className="flex gap-20">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase text-base-content/20 tracking-widest mb-3">Library Status</span>
                        <span className="text-sm font-mono font-bold text-success uppercase">CONNECTED_AND_SYNCED</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase text-base-content/20 tracking-widest mb-3">Identity</span>
                        <span className="text-sm font-mono font-bold text-primary uppercase">LOCAL_USER</span>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <span className="text-[10px] font-black text-base-content/20 uppercase tracking-[0.6em]">System V2.0.1</span>
                    <div className="w-12 h-12 border border-base-300 flex items-center justify-center">
                        <div className="w-2 h-2 bg-primary animate-ping"></div>
                    </div>
                </div>
            </section>
        </div>
    );
}

export default Dashboard;
