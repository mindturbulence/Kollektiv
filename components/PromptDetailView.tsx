
import React, { useState, useEffect, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { dissectPrompt, refineSinglePromptStream } from '../services/llmService';
import type { SavedPrompt, PromptCategory } from '../types';
import { loadPromptCategories } from '../utils/promptStorage';
import {
  ChevronLeftIcon, ChevronRightIcon, CloseIcon, RefreshIcon, DeleteIcon, EditIcon, SparklesIcon, CheckIcon, BookmarkIcon
} from './icons';
import CopyIcon from './CopyIcon';
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

interface PromptAnatomyDisplayProps {
  anatomy: { [key: string]: string } | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  hasPrompt: boolean;
}

const PromptAnatomyDisplay: React.FC<PromptAnatomyDisplayProps> = ({ anatomy, isLoading, error, onRefresh, hasPrompt }) => {
    return (
        <div className="card bg-base-100 shadow-lg flex flex-col flex-grow min-h-0">
            <header className="card-title p-4 text-base justify-between flex-shrink-0 border-b border-base-300">
                <span>
                    Prompt Anatomy
                </span>
                <button onClick={onRefresh} disabled={isLoading || !hasPrompt} className="btn btn-sm btn-ghost btn-square" aria-label="Re-analyze prompt">
                    <RefreshIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
            </header>
            <main className="card-body p-4 overflow-y-auto">
                {isLoading ? <LoadingSpinner/> :
                 error ? <div className="alert alert-error text-sm p-2"><span>{error}</span></div> :
                 anatomy && Object.keys(anatomy).length > 0 ? (
                    <div className="space-y-3">
                        {Object.entries(anatomy).map(([key, value]) => (
                            <div key={key}>
                                <h4 className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">{key}</h4>
                                <p className="text-sm text-base-content">{value}</p>
                            </div>
                        ))}
                    </div>
                 ) : (
                    <div className="p-4 text-center text-sm text-base-content/70">
                        { anatomy ? "No specific components were identified in this prompt." : "Click the refresh icon to analyze the prompt's structure." }
                    </div>
                 )}
            </main>
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
  const prompt = prompts[currentIndex];
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
      if (!text || !text.trim()) {
          setAnatomy(null);
          setErrorAnatomy(null);
          return;
      }
      setIsLoadingAnatomy(true);
      setErrorAnatomy(null);
      setAnatomy(null);
      try {
          const result = await dissectPrompt(text, settings);
          setAnatomy(result);
      } catch (e) {
          setErrorAnatomy(e instanceof Error ? e.message : "An unknown error occurred.");
      } finally {
          setIsLoadingAnatomy(false);
      }
  }, [settings]);
  
  useEffect(() => {
    loadPromptCategories().then(setCategories);
  }, []);
  
  useEffect(() => {
    if (prompt) {
        setEditedText(prompt.text);
        setCopied(false);
        setIsRefinePanelCollapsed(true);
        setIsFormulaPanelCollapsed(true);
        analyzePromptText(prompt.text);
    }
  }, [prompt, analyzePromptText]);

  const handleNavigation = useCallback((direction: 'next' | 'prev') => {
    const newIndex = direction === 'next'
      ? (currentIndex + 1) % prompts.length
      : (currentIndex - 1 + prompts.length) % prompts.length;
    onNavigate(newIndex);
  }, [currentIndex, prompts.length, onNavigate]);

  useEffect(() => {
    const handleKeyDown = (e: any) => {
      const target = e.target as any;
      if (target && ['TEXTAREA', 'INPUT'].includes(target.tagName)) {
          return;
      }
      if (e.key === 'ArrowRight') handleNavigation('next');
      if (e.key === 'ArrowLeft') handleNavigation('prev');
    };
    if (typeof window !== 'undefined') {
        (window as any).document.addEventListener('keydown', handleKeyDown);
        return () => (window as any).document.removeEventListener('keydown', handleKeyDown);
    }
  }, [handleNavigation]);

  const handleCopyToClipboard = (text: string) => {
      if(typeof (window as any).navigator !== 'undefined') {
          (window as any).navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            showGlobalFeedback("Copied to clipboard!");
            setTimeout(() => setCopied(false), 2000);
          });
      }
  };

  const handleSaveChanges = () => {
      if (isDirty) {
          onUpdate(prompt.id, { text: editedText });
          showGlobalFeedback("Changes saved!");
      }
  };
  
  const handleApplyRefinement = (newPrompt: string) => {
    setEditedText(newPrompt);
    setIsRefinePanelCollapsed(true);
    showGlobalFeedback("Refinement applied to editor. Click 'Save Changes' to commit.");
  };

  const handleClipRefinement = (refinedText: string) => {
    if (onClipString) {
        onClipString(refinedText, `Refined: ${prompt.title || 'Prompt'}`);
    }
  };
  
  const isDirty = prompt && editedText.trim() !== prompt.text.trim();
  
  if (!prompt) {
    return (
      <div className="flex h-full items-center justify-center text-base-content/70">
        <p>Prompt not found.</p>
      </div>
    );
  }

  return (
    <>
    <div className="flex flex-col lg:flex-row h-full animate-fade-in bg-base-200 p-6 gap-6">
        {/* Left Column (Main Content) */}
        <div className="w-full lg:w-2/3 flex flex-col gap-6 min-h-0">
            <div className="card bg-base-100 shadow-lg flex flex-col flex-grow min-h-0">
                <header className="flex-shrink-0 p-4 flex justify-between items-center border-b border-base-300">
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold truncate" title={prompt.title || 'Untitled Prompt'}>{prompt.title || 'Untitled Prompt'}</h2>
                    </div>
                     <div className="flex items-center gap-2">
                        <button onClick={() => handleNavigation('prev')} className="btn btn-sm btn-ghost"><ChevronLeftIcon className="w-4 h-4" /></button>
                        <span className="text-sm font-mono text-base-content/70 hidden sm:inline">{currentIndex + 1} / {prompts.length}</span>
                        <button onClick={() => handleNavigation('next')} className="btn btn-sm btn-ghost"><ChevronRightIcon className="w-4 h-4" /></button>
                        <button onClick={onClose} className="btn btn-sm btn-ghost"><CloseIcon className="w-5 h-5"/></button>
                    </div>
                </header>
                <main className="flex-grow p-4">
                    <textarea 
                        value={editedText}
                        onChange={(e) => setEditedText((e.currentTarget as any).value)}
                        className="textarea w-full h-full bg-transparent text-base resize-none focus:outline-none"
                    ></textarea>
                </main>
                <footer className="card-actions justify-between items-center p-4 border-t border-base-300">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setIsEditorModalOpen(true)} className="btn btn-sm btn-ghost" title="Edit Metadata"><EditIcon className="w-4 h-4 mr-1"/> Edit</button>
                        <button onClick={() => onSendToEnhancer(editedText)} className="btn btn-sm btn-ghost" title="Send to Refine"><SparklesIcon className="w-4 h-4 mr-1"/> Refine</button>
                        <button onClick={() => onClip(prompt)} className="btn btn-sm btn-ghost" title="Clip to Clipboard"><BookmarkIcon className="w-4 h-4 mr-1"/> Clip</button>
                        <button onClick={() => onDelete(prompt)} className="btn btn-sm btn-ghost text-error" title="Delete"><DeleteIcon className="w-4 h-4 mr-1"/> Delete</button>
                    </div>
                     <div className="flex items-center gap-2">
                        {isDirty && <button onClick={handleSaveChanges} className="btn btn-sm btn-success">Save Changes</button>}
                        <button onClick={() => handleCopyToClipboard(editedText)} className="btn btn-sm btn-ghost" title={copied ? 'Copied!' : 'Copy to Clipboard'}>
                            {copied ? <><CheckIcon className="w-4 h-4 mr-1"/>Copied!</> : <><CopyIcon className="w-4 h-4 mr-1"/>Copy</>}
                        </button>
                    </div>
                </footer>
            </div>
             <PromptRefinePanel 
                promptText={editedText} 
                onApplyRefinement={handleApplyRefinement}
                isCollapsed={isRefinePanelCollapsed}
                setIsCollapsed={setIsRefinePanelCollapsed}
                onClip={onClipString ? handleClipRefinement : undefined}
            />
        </div>
        {/* Right Column (Analysis Panels) */}
        <div className="w-full lg:w-1/3 flex flex-col gap-6 min-h-0">
            <PromptAnatomyDisplay
                anatomy={anatomy}
                isLoading={isLoadingAnatomy}
                error={errorAnatomy}
                onRefresh={() => analyzePromptText(editedText)}
                hasPrompt={!!editedText}
            />
            <PromptFormulaPanel 
                promptText={editedText}
                showGlobalFeedback={showGlobalFeedback}
                isCollapsed={isFormulaPanelCollapsed}
                setIsCollapsed={setIsFormulaPanelCollapsed}
            />
        </div>
    </div>
    <PromptEditorModal
        isOpen={isEditorModalOpen}
        onClose={() => setIsEditorModalOpen(false)}
        onSave={async (data) => {
            onUpdate(prompt.id, data);
            showGlobalFeedback("Metadata updated!");
        }}
        categories={categories}
        editingPrompt={prompt}
    />
    </>
  );
};

export default PromptDetailView;
