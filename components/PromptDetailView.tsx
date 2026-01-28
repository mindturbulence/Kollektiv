import React, { useState, useEffect, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { dissectPrompt } from '../services/llmService';
import type { SavedPrompt, PromptCategory } from '../types';
import { loadPromptCategories } from '../utils/promptStorage';
import {
  ChevronLeftIcon, ChevronRightIcon, CloseIcon, RefreshIcon, SparklesIcon
} from './icons';
import LoadingSpinner from './LoadingSpinner';
import PromptEditorModal from './PromptEditorModal';
import PromptFormulaPanel from './PromptFormulaPanel';
import PromptRefinePanel from './PromptRefinePanel';

interface PromptDetailViewProps {
  prompts: SavedPrompt[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onDelete: (prompt: SavedPrompt) => void;
  onUpdate: (id: string, updates: Partial<Omit<SavedPrompt, 'id' | 'createdAt'>>) => void;
  onSendToEnhancer: (text: string) => void;
  showGlobalFeedback: (message: string) => void;
  onClip: (prompt: SavedPrompt) => void;
  onClipString?: (text: string, title: string) => void;
}

const PromptAnatomyDisplay: React.FC<{
  anatomy: { [key: string]: string } | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  hasPrompt: boolean;
}> = ({ anatomy, isLoading, error, onRefresh, hasPrompt }) => {
    return (
        <div className="flex flex-col h-full bg-base-100 overflow-hidden">
            <header className="p-4 border-b border-base-300 bg-base-200/10 flex justify-between items-center">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Prompt Components</h3>
                <button onClick={onRefresh} disabled={isLoading || !hasPrompt} className="btn btn-xs btn-ghost opacity-40 hover:opacity-100">
                    <RefreshIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
            </header>
            <div className="flex-grow p-5 overflow-y-auto custom-scrollbar bg-base-100">
                {isLoading ? <div className="py-12"><LoadingSpinner/></div> :
                 error ? <div className="alert alert-error rounded-none text-xs"><span>{error}</span></div> :
                 anatomy && Object.keys(anatomy).length > 0 ? (
                    <div className="space-y-6">
                        {Object.entries(anatomy).map(([key, value]) => (
                            <div key={key} className="animate-fade-in">
                                <h4 className="text-[9px] font-black uppercase tracking-widest text-base-content/20 mb-1 border-b border-base-300/30 pb-0.5">{key}</h4>
                                <p className="text-sm font-medium leading-relaxed text-base-content/80">{String(value)}</p>
                            </div>
                        ))}
                    </div>
                 ) : (
                    <div className="py-24 text-center text-[10px] font-black uppercase tracking-[0.2em] text-base-content/20">
                        { anatomy ? "No components found in analysis." : "Run component analysis to map prompt parts." }
                    </div>
                 )}
            </div>
        </div>
    );
};

const PromptDetailView: React.FC<PromptDetailViewProps> = ({
  prompts,
  currentIndex,
  onClose,
  onNavigate,
  onDelete,
  onUpdate,
  onSendToEnhancer,
  showGlobalFeedback,
  onClip,
  onClipString
}) => {
  const { settings } = useSettings();
  const prompt = prompts[currentIndex] || null;
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
  const [editedText, setEditedText] = useState(prompt ? prompt.text : '');
  const [categories, setCategories] = useState<PromptCategory[]>([]);
  const [copied, setCopied] = useState(false);
  const [isRefinePanelCollapsed, setIsRefinePanelCollapsed] = useState(true);
  const [isFormulaPanelCollapsed, setIsFormulaPanelCollapsed] = useState(true);

  const [anatomy, setAnatomy] = useState<{ [key: string]: string } | null>(null);
  const [isLoadingAnatomy, setIsLoadingAnatomy] = useState(false);
  const [errorAnatomy, setErrorAnatomy] = useState<string | null>(null);

  const analyzePromptText = useCallback(async (text: string) => {
      if (!text?.trim()) { setAnatomy(null); return; }
      setIsLoadingAnatomy(true);
      setErrorAnatomy(null);
      try {
          const result = await dissectPrompt(text, settings);
          setAnatomy(result || {});
      } catch (e: any) {
          setErrorAnatomy(e.message || "Component analysis failed.");
          setAnatomy(null);
      } finally {
          setIsLoadingAnatomy(false);
      }
  }, [settings]);
  
  useEffect(() => { loadPromptCategories().then(setCategories); }, []);
  
  useEffect(() => {
    if (prompt) {
        setEditedText(prompt.text);
        setCopied(false);
        setIsRefinePanelCollapsed(true);
        setIsFormulaPanelCollapsed(true);
        setAnatomy(null);
    }
  }, [prompt]);

  const handleNavigation = useCallback((direction: 'next' | 'prev') => {
    const newIndex = direction === 'next'
      ? (currentIndex + 1) % prompts.length
      : (currentIndex - 1 + prompts.length) % prompts.length;
    onNavigate(newIndex);
  }, [currentIndex, prompts.length, onNavigate]);

  const handleCopyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        showGlobalFeedback("Prompt copied.");
        setTimeout(() => setCopied(false), 2000);
      });
  };

  const handleSaveChanges = () => {
      if (prompt && editedText.trim() !== prompt.text.trim()) {
          onUpdate(prompt.id, { text: editedText });
          showGlobalFeedback("Changes saved to library.");
      }
  };
  
  if (!prompt) return null;

  return (
    <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm animate-fade-in flex items-center justify-center p-2 lg:p-4 overflow-hidden" onClick={onClose}>
        <div className="w-full h-full bg-base-100 rounded-none border border-base-300 shadow-2xl flex flex-col overflow-hidden relative" onClick={e => e.stopPropagation()}>
            <header className="flex-shrink-0 p-6 lg:px-8 lg:py-6 border-b border-base-300 bg-base-100 flex flex-wrap justify-between items-end gap-6">
                <div className="min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary mb-1 block">LIBRARY ID : {prompt.id.slice(-8)}</span>
                    <h2 className="text-xl lg:text-2xl font-black tracking-tighter text-base-content leading-none truncate max-w-2xl uppercase">
                        {prompt.title || 'Untitled Prompt'}
                    </h2>
                </div>
                <div className="flex items-center gap-4">
                    <div className="join bg-base-200 border border-base-300 shadow-sm">
                        <button onClick={() => handleNavigation('prev')} className="btn btn-sm btn-ghost join-item"><ChevronLeftIcon className="w-4 h-4" /></button>
                        <span className="join-item flex items-center px-6 font-mono text-[10px] font-black text-base-content/40 uppercase tracking-widest border-x border-base-300/30">{currentIndex + 1} / {prompts.length}</span>
                        <button onClick={() => handleNavigation('next')} className="btn btn-sm btn-ghost join-item"><ChevronRightIcon className="w-4 h-4" /></button>
                    </div>
                    <button onClick={onClose} className="btn btn-sm btn-ghost btn-square opacity-40 hover:opacity-100 ml-4">
                        <CloseIcon className="w-6 h-6"/>
                    </button>
                </div>
            </header>

            <div className="flex-grow flex flex-col lg:flex-row overflow-hidden">
                <main className="flex-1 flex flex-col overflow-hidden bg-base-100">
                    <div className={`flex flex-col overflow-hidden transition-all duration-500 ease-in-out ${!isRefinePanelCollapsed ? 'h-1/2' : 'flex-grow'}`}>
                        <div className="flex-grow p-5 lg:p-5 relative overflow-hidden flex flex-col">
                            <span className="text-[9px] font-black uppercase tracking-widest text-primary/40 mb-3 flex items-center gap-3">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span> Original Prompt Text
                            </span>
                            <textarea 
                                value={editedText}
                                onChange={(e) => setEditedText(e.target.value)}
                                className="textarea flex-grow w-full bg-transparent text-sm font-medium leading-relaxed resize-none focus:outline-none p-0 custom-scrollbar border-none shadow-none"
                                placeholder="Type prompt here..."
                            ></textarea>
                        </div>
                    </div>
                    <div className={`overflow-hidden transition-all duration-500 ease-in-out ${!isRefinePanelCollapsed ? 'h-1/2 border-t border-base-300' : 'h-0 opacity-0'}`}>
                        <PromptRefinePanel 
                            promptText={editedText} 
                            onApplyRefinement={(res) => { setEditedText(res); setIsRefinePanelCollapsed(true); showGlobalFeedback("Applied refinement."); }}
                            isCollapsed={isRefinePanelCollapsed}
                            setIsCollapsed={setIsRefinePanelCollapsed}
                            onClip={onClipString ? (res) => onClipString(res, `Refinement: ${prompt.title}`) : undefined}
                        />
                    </div>
                    <footer className="p-4 bg-base-200/20 border-t border-base-300 flex flex-wrap justify-between items-center gap-4">
                        <div className="flex items-center gap-1">
                            <button onClick={() => setIsEditorModalOpen(true)} className="btn btn-sm btn-ghost rounded-none uppercase font-black text-[10px] tracking-widest px-4 hover:bg-base-300">Edit Details</button>
                            <button onClick={() => setIsRefinePanelCollapsed(!isRefinePanelCollapsed)} className={`btn btn-sm rounded-none uppercase font-black text-[10px] tracking-widest px-4 ${!isRefinePanelCollapsed ? 'btn-primary' : 'btn-ghost text-primary hover:bg-primary/10'}`}>AI Refine</button>
                            <button onClick={() => onClip(prompt)} className="btn btn-sm btn-ghost rounded-none uppercase font-black text-[10px] tracking-widest px-4 hover:bg-base-300">Clip</button>
                            <button onClick={() => onDelete(prompt)} className="btn btn-sm btn-ghost rounded-none uppercase font-black text-[10px] tracking-widest px-4 text-error/40 hover:text-error hover:bg-error/10">Delete</button>
                        </div>
                        <div className="flex items-center gap-3">
                            {editedText.trim() !== prompt.text.trim() && (
                                <button onClick={handleSaveChanges} className="btn btn-sm btn-primary rounded-none uppercase font-black text-[10px] tracking-widest px-8 shadow-lg">Save Changes</button>
                            )}
                            <button onClick={() => handleCopyToClipboard(editedText)} className="btn btn-sm btn-ghost rounded-none border border-base-300 bg-base-100 uppercase font-black text-[10px] tracking-widest px-8 hover:bg-base-200">
                                {copied ? 'Copied' : 'Copy Prompt'}
                            </button>
                        </div>
                    </footer>
                </main>
                <aside className="w-full lg:w-[420px] flex-shrink-0 bg-base-100 flex flex-col overflow-hidden border-l border-base-300">
                    <div className="flex-grow flex flex-col min-h-0 divide-y divide-base-300">
                        <PromptAnatomyDisplay anatomy={anatomy} isLoading={isLoadingAnatomy} error={errorAnatomy} onRefresh={() => analyzePromptText(editedText)} hasPrompt={!!editedText} />
                        <PromptFormulaPanel promptText={editedText} showGlobalFeedback={showGlobalFeedback} isCollapsed={isFormulaPanelCollapsed} setIsCollapsed={setIsFormulaPanelCollapsed} />
                    </div>
                </aside>
            </div>
            <PromptEditorModal isOpen={isEditorModalOpen} onClose={() => setIsEditorModalOpen(false)} onSave={async (data) => { onUpdate(prompt.id, data); showGlobalFeedback("Details saved."); }} categories={categories} editingPrompt={prompt} />
        </div>
    </div>
  );
};

export default PromptDetailView;