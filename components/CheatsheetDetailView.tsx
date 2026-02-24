import React, { useState, useEffect } from 'react';
import type { CheatsheetItem } from '../types';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, PhotoIcon, SparklesIcon, RefreshIcon } from './icons';
import { fileSystemManager } from '../utils/fileUtils';
import { ImageManagementModal } from './ImageManagementModal';
import { generateArtistDescription } from '../services/llmService';
import { useSettings } from '../contexts/SettingsContext';
import LoadingSpinner from './LoadingSpinner';

interface CheatsheetDetailViewProps {
  items: CheatsheetItem[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onInject: (item: CheatsheetItem) => void;
  onUpdateItem: (itemId: string, updates: Partial<CheatsheetItem>) => void;
}

const ArtifactPreview: React.FC<{ url: string }> = ({ url }) => {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    useEffect(() => {
        let isActive = true;
        let objectUrl: string | null = null;
        const load = async () => {
            if (url.startsWith('data:') || url.startsWith('http')) {
                setBlobUrl(url); return;
            }
            const blob = await fileSystemManager.getFileAsBlob(url);
            if (blob && isActive) {
                objectUrl = URL.createObjectURL(blob);
                setBlobUrl(objectUrl);
            }
        };
        load();
        return () => { isActive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [url]);
    if (!blobUrl) return <div className="aspect-square bg-base-200 animate-pulse" />;
    return <img src={blobUrl} className="w-full h-full object-cover" alt="artifact" />;
};

const CheatsheetDetailView: React.FC<CheatsheetDetailViewProps> = ({
  items, currentIndex, onClose, onNavigate, onInject, onUpdateItem
}) => {
  const item = items[currentIndex] || null;
  const { settings } = useSettings();
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [isSyncingDescription, setIsSyncingDescription] = useState(false);

  const handleNavigate = (direction: 'next' | 'prev') => {
    const nextIdx = direction === 'next' ? (currentIndex + 1) % items.length : (currentIndex - 1 + items.length) % items.length;
    onNavigate(nextIdx);
  };

  const handleManualSync = async () => {
      setIsSyncingDescription(true);
      try {
          const desc = await generateArtistDescription(item.name, settings);
          if (desc) { 
              onUpdateItem(item.id, { description: desc });
          }
      } catch (e) { console.error("AI Sync failed", e); } finally { setIsSyncingDescription(false); }
  };

  if (!item) return null;

  return (
    <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm animate-fade-in flex items-center justify-center p-2 lg:p-4 overflow-hidden" onClick={onClose}>
        <div className="w-full h-full bg-base-100 rounded-none border border-base-300 shadow-2xl flex flex-col overflow-hidden relative" onClick={e => e.stopPropagation()}>
            <header className="flex-shrink-0 px-8 h-16 border-b border-base-300 bg-base-100 flex justify-between items-center gap-6">
                <div className="min-w-0"><h2 className="text-xl lg:text-2xl font-black tracking-tighter text-base-content leading-none truncate max-w-2xl uppercase">{item.name}</h2></div>
                <div className="flex items-center gap-4">
                    <div className="join bg-base-200 border border-base-300">
                        <button onClick={() => handleNavigate('prev')} className="btn btn-xs btn-ghost join-item"><ChevronLeftIcon className="w-4 h-4" /></button>
                        <span className="join-item flex items-center px-4 font-mono text-[10px] font-bold text-base-content/40">{currentIndex + 1} / {items.length}</span>
                        <button onClick={() => handleNavigate('next')} className="btn btn-xs btn-ghost join-item"><ChevronRightIcon className="w-4 h-4" /></button>
                    </div>
                    <button onClick={onClose} className="btn btn-sm btn-ghost btn-square opacity-40 hover:opacity-100"><CloseIcon className="w-6 h-6"/></button>
                </div>
            </header>
            <div className="flex-grow flex flex-col lg:flex-row overflow-hidden">
                <main className="flex-1 flex flex-col overflow-y-auto custom-scrollbar bg-base-200/50 p-8 lg:p-12">
                    <div className="max-w-screen-xl mx-auto w-full space-y-12">
                        <div className="space-y-4">
                            <div className="flex justify-between items-end"><span className="text-[10px] font-black uppercase tracking-widest text-primary/60">Style Description</span>
                                <button onClick={handleManualSync} disabled={isSyncingDescription} className="btn btn-xs btn-ghost gap-2 text-[10px] font-black uppercase tracking-widest hover:text-primary">{isSyncingDescription ? <LoadingSpinner size={16} /> : <RefreshIcon className="w-3 h-3" />}AI Sync</button>
                            </div>
                            <p className="text-2xl font-medium leading-relaxed italic text-base-content/70">"{item.description || 'No descriptive data archived.'}"</p>
                        </div>
                        <div className="space-y-6">
                            <div className="flex justify-between items-end"><span className="text-[10px] font-black uppercase tracking-widest text-base-content/20">Archived Samples</span><button onClick={() => setIsManageModalOpen(true)} className="btn btn-xs btn-ghost text-[10px] font-black uppercase tracking-widest">Manage</button></div>
                            {item.imageUrls.length > 0 ? (
                                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-px bg-base-300 border border-base-300">{item.imageUrls.map((url, idx) => (<div key={idx} className="aspect-square bg-base-100 overflow-hidden"><ArtifactPreview url={url} /></div>))}</div>
                            ) : (<div className="py-32 flex flex-col items-center justify-center border-2 border-dashed border-base-300 rounded-none opacity-20"><PhotoIcon className="w-16 h-16 mb-4"/><span className="text-xs font-black uppercase tracking-widest">Empty Cache</span></div>)}
                        </div>
                    </div>
                </main>
                <aside className="w-full lg:w-96 flex-shrink-0 bg-base-100 border-l border-base-300 flex flex-col">
                    <div className="p-8 space-y-8 flex-grow overflow-y-auto"><div className="space-y-4"><span className="text-[10px] font-black uppercase tracking-widest text-base-content/30">Registry Info</span><div className="p-4 bg-base-200/50 border border-base-300 rounded-none space-y-4"><div><h4 className="text-[9px] font-black uppercase text-primary/60 mb-1">Frequency</h4><p className="text-sm font-mono font-bold">{item.imageUrls.length} Samples</p></div></div></div></div>
                    <footer className="border-t border-base-300 flex bg-base-200/5 p-0 overflow-hidden flex-shrink-0"><button onClick={() => { onInject(item); onClose(); }} className="btn btn-primary flex-1 rounded-none font-black text-[10px] tracking-[0.2em] shadow-lg transition-colors hover:brightness-110"><SparklesIcon className="w-5 h-5 mr-3 inline-block"/>INJECT</button></footer>
                </aside>
            </div>
            <ImageManagementModal isOpen={isManageModalOpen} onClose={() => setIsManageModalOpen(false)} item={item} onSave={(urls) => onUpdateItem(item.id, { imageUrls: urls })} />
        </div>
    </div>
  );
};
export default CheatsheetDetailView;