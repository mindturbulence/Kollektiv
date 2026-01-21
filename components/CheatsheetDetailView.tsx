import React, { useState, useEffect, useRef } from 'react';
import type { CheatsheetItem } from '../types';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, PhotoIcon, SparklesIcon, RefreshIcon } from './icons';
import { fileSystemManager } from '../utils/fileUtils';
import { ImageManagementModal } from './ImageManagementModal';
import { generateArtistDescription, reconcileDescriptions } from '../services/llmService';
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
                setBlobUrl(url);
                return;
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
  items,
  currentIndex,
  onClose,
  onNavigate,
  onInject,
  onUpdateItem
}) => {
  const item = items[currentIndex];
  const { settings } = useSettings();
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  
  const [isSyncingDescription, setIsSyncingDescription] = useState(false);
  const [llmResult, setLlmResult] = useState<string | null>(null);
  const [isLlmModalOpen, setIsLlmModalOpen] = useState(false);
  const [isMerging, setIsMerging] = useState(false);

  const handleNavigate = (direction: 'next' | 'prev') => {
    const nextIdx = direction === 'next'
      ? (currentIndex + 1) % items.length
      : (currentIndex - 1 + items.length) % items.length;
    onNavigate(nextIdx);
  };

  const handleManualSync = async () => {
      setIsSyncingDescription(true);
      try {
          const desc = await generateArtistDescription(item.name, settings);
          if (desc) {
              setLlmResult(desc);
              setIsLlmModalOpen(true);
          }
      } catch (e) {
          console.error("AI Sync failed", e);
      } finally {
          setIsSyncingDescription(false);
      }
  };

  const applyLlmResult = async (mode: 'replace' | 'append') => {
      if (!llmResult) return;
      
      let finalDesc = llmResult;
      
      if (mode === 'append') {
          setIsMerging(true);
          try {
              finalDesc = await reconcileDescriptions(item.description || '', llmResult, settings);
          } catch (e) {
              console.error("Description reconciliation failed, falling back to delete append.", e);
              finalDesc = `${item.description || ''}\n\n${llmResult}`.trim();
          } finally {
              setIsMerging(false);
          }
      }
      
      onUpdateItem(item.id, { description: finalDesc });
      setIsLlmModalOpen(false);
      setLlmResult(null);
  };

  if (!item) return null;

  const hasDescription = !!item.description?.trim();

  return (
    <div className="flex flex-col h-full bg-base-300">
        <header className="flex-shrink-0 px-8 h-16 border-b border-base-300 bg-base-100 flex justify-between items-center gap-6">
            <div className="min-w-0">
                <h2 className="text-xl lg:text-2xl font-black tracking-tighter text-base-content leading-none truncate max-w-2xl uppercase">
                    {item.name}
                </h2>
            </div>
             <div className="flex items-center gap-4">
                <div className="join bg-base-200 border border-base-300">
                    <button onClick={() => handleNavigate('prev')} className="btn btn-xs btn-ghost join-item"><ChevronLeftIcon className="w-4 h-4" /></button>
                    <span className="join-item flex items-center px-4 font-mono text-[10px] font-bold text-base-content/40">{currentIndex + 1} / {items.length}</span>
                    <button onClick={() => handleNavigate('next')} className="btn btn-xs btn-ghost join-item"><ChevronRightIcon className="w-4 h-4" /></button>
                </div>
                <button onClick={onClose} className="btn btn-sm btn-ghost btn-square opacity-40 hover:opacity-100">
                    <CloseIcon className="w-6 h-6"/>
                </button>
            </div>
        </header>

        <div className="flex-grow flex flex-col lg:flex-row overflow-hidden">
            <main className="flex-1 flex flex-col overflow-y-auto custom-scrollbar bg-base-200/50 p-8 lg:p-12">
                <div className="max-w-screen-xl mx-auto w-full space-y-12">
                    <div className="space-y-4">
                        <div className="flex justify-between items-end">
                            <span className="text-[10px] font-black uppercase tracking-widest text-primary/60">Style Description</span>
                            <button 
                                onClick={handleManualSync} 
                                disabled={isSyncingDescription}
                                className="btn btn-xs btn-ghost gap-2 text-[10px] font-black uppercase tracking-widest hover:text-primary"
                            >
                                {isSyncingDescription ? <LoadingSpinner size={16} /> : <RefreshIcon className="w-3 h-3" />}
                                Sync with AI
                            </button>
                        </div>
                        <p className="text-2xl font-medium leading-relaxed italic text-base-content/70">
                            "{item.description || 'No descriptive data archived for this identity.'}"
                        </p>
                    </div>

                    <div className="space-y-6">
                         <div className="flex justify-between items-end">
                            <span className="text-[10px] font-black uppercase tracking-widest text-base-content/20">Archived Samples</span>
                            <button onClick={() => setIsManageModalOpen(true)} className="btn btn-xs btn-ghost text-[10px] font-black uppercase tracking-widest">Manage Registry</button>
                         </div>
                         {item.imageUrls.length > 0 ? (
                             <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-px bg-base-300 border border-base-300">
                                {item.imageUrls.map((url, idx) => (
                                    <div key={idx} className="aspect-square bg-base-100 overflow-hidden">
                                        <ArtifactPreview url={url} />
                                    </div>
                                ))}
                             </div>
                         ) : (
                             <div className="py-32 flex flex-col items-center justify-center border-2 border-dashed border-base-300 rounded-none opacity-20">
                                <PhotoIcon className="w-16 h-16 mb-4"/>
                                <span className="text-xs font-black uppercase tracking-widest">Empty Visual Cache</span>
                             </div>
                         )}
                    </div>
                </div>
            </main>

            <aside className="w-full lg:w-96 flex-shrink-0 bg-base-100 border-l border-base-300 flex flex-col">
                <div className="p-8 space-y-8 flex-grow overflow-y-auto">
                    <div className="space-y-4">
                        <span className="text-[10px] font-black uppercase tracking-widest text-base-content/30">System Context</span>
                        <div className="p-4 bg-base-200/50 border border-base-300 rounded-none space-y-4">
                            <div>
                                <h4 className="text-[9px] font-black uppercase text-primary/60 mb-1">Token Length</h4>
                                <p className="text-sm font-mono font-bold">{item.name.length} Tokens</p>
                            </div>
                            <div>
                                <h4 className="text-[9px] font-black uppercase text-primary/60 mb-1">Registry Frequency</h4>
                                <p className="text-sm font-mono font-bold">{item.imageUrls.length} Samples</p>
                            </div>
                        </div>
                    </div>
                </div>

                <footer className="border-t border-base-300 flex bg-base-200/5 p-0 overflow-hidden flex-shrink-0">
                    <button 
                        onClick={() => { onInject(item); onClose(); }}
                        className="btn btn-primary flex-1 rounded-none font-black text-[10px] tracking-[0.2em] shadow-lg transition-colors hover:brightness-110"
                    >
                        <SparklesIcon className="w-5 h-5 mr-3 inline-block"/>
                        INJECT INTO WORKSPACE
                    </button>
                </footer>
            </aside>
        </div>

        <ImageManagementModal 
            isOpen={isManageModalOpen}
            onClose={() => setIsManageModalOpen(false)}
            item={item}
            onSave={(urls) => onUpdateItem(item.id, { imageUrls: urls })}
        />

        {isLlmModalOpen && (
            <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={() => !isMerging && setIsLlmModalOpen(false)}>
                <div className="bg-base-100 rounded-none border border-base-300 shadow-2xl w-full max-w-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                    {isMerging && (
                        <div className="absolute inset-0 bg-base-100/80 z-20 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                            <LoadingSpinner />
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary animate-pulse">Reconciling descriptive data...</p>
                        </div>
                    )}
                    <header className="p-8 border-b border-base-300 bg-base-200/20 relative">
                        <h3 className="text-4xl font-black tracking-tighter text-base-content leading-none uppercase">AI Generation Result</h3>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-base-content/40 mt-2">Source: {settings.activeLLM === 'gemini' ? 'Google Gemini' : 'Local Ollama'}</p>
                    </header>
                    <div className="p-8">
                        <div className="bg-base-200/50 p-6 border border-base-300 rounded-none italic text-lg leading-relaxed text-base-content/80">
                            "{llmResult}"
                        </div>
                    </div>
                    <footer className="border-t border-base-300 flex bg-base-200/5 p-0 overflow-hidden flex-shrink-0">
                        <button onClick={() => setIsLlmModalOpen(false)} disabled={isMerging} className="btn flex-1 rounded-none uppercase font-black text-[10px] tracking-widest border-r border-base-300 transition-colors">Cancel</button>
                        {hasDescription ? (
                            <>
                                <button onClick={() => applyLlmResult('append')} disabled={isMerging} className="btn flex-1 rounded-none border-r border-base-300 uppercase font-black text-[10px] tracking-widest hover:bg-base-200 transition-colors">Append & Merge</button>
                                <button onClick={() => applyLlmResult('replace')} disabled={isMerging} className="btn btn-primary flex-1 rounded-none uppercase font-black text-[10px] tracking-widest transition-colors">Replace All</button>
                            </>
                        ) : (
                            <button onClick={() => applyLlmResult('replace')} disabled={isMerging} className="btn btn-primary flex-1 rounded-none uppercase font-black text-[10px] tracking-widest transition-colors">Add Description</button>
                        )}
                    </footer>
                </div>
            </div>
        )}
    </div>
  );
};

export default CheatsheetDetailView;