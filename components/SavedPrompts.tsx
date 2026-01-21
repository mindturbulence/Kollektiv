import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
    loadSavedPrompts,
    deleteSavedPrompt,
    addSavedPrompt,
    updateSavedPrompt,
    loadPromptCategories,
    savePromptCategoriesOrder
} from '../utils/promptStorage';
import type { SavedPrompt, PromptCategory, Idea } from '../types';
import { PromptIcon, ArrowsUpDownIcon, FolderClosedIcon } from './icons';
import ConfirmationModal from './ConfirmationModal';
import SavedPromptCard from './SavedPromptCard';
import TreeView, { TreeViewItem } from './TreeView';
import CategoryPanelToggle from './CategoryPanelToggle';
import PromptEditorModal from './PromptEditorModal';
import LoadingSpinner from './LoadingSpinner';
import PromptDetailView from './PromptDetailView';

interface SavedPromptsProps {
  onSendToEnhancer: (prompt: string) => void;
  isCategoryPanelCollapsed: boolean;
  onToggleCategoryPanel: () => void;
  showGlobalFeedback: (message: string) => void;
  onClipIdea: (idea: Idea) => void;
}

type SortOrder = 'newest' | 'oldest' | 'title';

const getColumnCount = () => {
    if (typeof window === 'undefined') return 1;
    if ((window as any).matchMedia('(min-width: 1536px)').matches) return 4;
    if ((window as any).matchMedia('(min-width: 1280px)').matches) return 3;
    if ((window as any).matchMedia('(min-width: 768px)').matches) return 2;
    return 1;
};

const SavedPrompts: React.FC<SavedPromptsProps> = ({ onSendToEnhancer, isCategoryPanelCollapsed, onToggleCategoryPanel, showGlobalFeedback, onClipIdea }) => {
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [categories, setCategories] = useState<PromptCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
  const [promptToDelete, setPromptToDelete] = useState<SavedPrompt | null>(null);
  const [promptToEdit, setPromptToEdit] = useState<Partial<SavedPrompt> | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [columnCount, setColumnCount] = useState(() => getColumnCount());
  const [detailViewPromptId, setDetailViewPromptId] = useState<string | null>(null);

  useEffect(() => {
    const handleResize = () => setColumnCount(getColumnCount());
    if (typeof window !== 'undefined') {
        (window as any).addEventListener('resize', handleResize);
        return () => (window as any).removeEventListener('resize', handleResize);
    }
  }, []);

  const refreshData = useCallback(async () => {
      setIsLoading(true);
      try {
        const [loadedPrompts, loadedCategories] = await Promise.all([loadSavedPrompts(), loadPromptCategories()]);
        setPrompts(loadedPrompts);
        setCategories(loadedCategories);
      } catch (error) {
          console.error("Failed to load prompts", error);
      } finally {
          setIsLoading(false);
      }
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  const handleSavePrompt = async (promptData: Omit<SavedPrompt, 'id' | 'createdAt'>): Promise<void> => {
    if (promptToEdit && 'id' in promptToEdit) await updateSavedPrompt(promptToEdit.id as string, promptData);
    else await addSavedPrompt(promptData);
    await refreshData();
  };
  
  const handleUpdatePrompt = async (promptId: string, updates: Partial<Omit<SavedPrompt, 'id' | 'createdAt'>>) => {
      const originalPrompt = prompts.find(p => p.id === promptId);
      if (!originalPrompt) return;
      await updateSavedPrompt(promptId, { ...originalPrompt, ...updates });
      await refreshData();
      showGlobalFeedback('Registry updated.');
  };

  const handleConfirmDelete = async () => {
    if (promptToDelete) {
      await deleteSavedPrompt(promptToDelete.id);
      await refreshData();
      setIsDeleteModalOpen(false);
      setPromptToDelete(null);
    }
  };

  const treeItems = useMemo<TreeViewItem[]>(() => {
    const buildTree = (parentId?: string): TreeViewItem[] => {
        return categories
            .filter(cat => cat.parentId === parentId)
            .map(cat => ({
                id: cat.id,
                name: cat.name,
                icon: 'folder',
                count: prompts.filter(p => p.categoryId === cat.id).length,
                children: buildTree(cat.id)
            }));
    };
    
    return [
      { id: 'all', name: 'Global Repository', icon: 'prompt' as const, count: prompts.length },
      ...buildTree(undefined),
      { id: 'uncategorized', name: 'Uncategorized', icon: 'inbox' as const, count: prompts.filter(p => !p.categoryId).length }
    ];
  }, [categories, prompts]);

  const sortedAndFilteredPrompts = useMemo(() => {
      let filtered = (selectedCategoryId === 'all')
        ? prompts
        : (selectedCategoryId === 'uncategorized')
          ? prompts.filter(p => !p.categoryId)
          : prompts.filter(p => p.categoryId === selectedCategoryId);

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(p => (p.title || '').toLowerCase().includes(q) || p.text.toLowerCase().includes(q));
      }
      
      const sorted = [...filtered];
      if (sortOrder === 'oldest') sorted.sort((a, b) => a.createdAt - b.createdAt);
      else if (sortOrder === 'title') sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      else sorted.sort((a, b) => b.createdAt - a.createdAt);
      return sorted;
  }, [prompts, selectedCategoryId, sortOrder, searchQuery]);

  const columns = useMemo(() => {
    const cols: SavedPrompt[][] = Array.from({ length: columnCount }, () => []);
    sortedAndFilteredPrompts.forEach((item, index) => cols[index % columnCount].push(item));
    return cols;
  }, [sortedAndFilteredPrompts, columnCount]);

  if (isLoading) return <div className="flex-grow flex items-center justify-center"><LoadingSpinner /></div>;

  return (
    <>
      <section className="flex flex-row h-full bg-base-100 overflow-hidden">
        <aside className={`relative flex-shrink-0 bg-base-100 border-r border-base-300 transition-all duration-300 ease-in-out ${isCategoryPanelCollapsed ? 'w-0' : 'w-96'}`}>
          <CategoryPanelToggle isCollapsed={isCategoryPanelCollapsed} onToggle={onToggleCategoryPanel} />
          <div className={`h-full overflow-hidden transition-opacity duration-200 ${isCategoryPanelCollapsed ? 'opacity-0 invisible' : 'opacity-100 visible'}`}>
            <div className="h-full overflow-y-auto p-6 w-96 custom-scrollbar">
              <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-base-content/30 mb-6 px-3">Registry Index</h2>
              <TreeView items={treeItems} selectedId={selectedCategoryId} onSelect={setSelectedCategoryId} />
            </div>
          </div>
        </aside>

        <main className="relative flex-grow flex flex-col h-full overflow-y-auto overflow-x-hidden bg-base-100 scroll-smooth custom-scrollbar">
            <section className="p-10 lg:p-16 border-b border-base-300 bg-base-200/20">
                <div className="max-w-screen-2xl mx-auto flex flex-col md:flex-row items-end justify-between gap-12">
                    <div className="flex-1">
                        <h1 className="text-4xl lg:text-5xl font-black tracking-tighter text-base-content leading-tight mb-6">TOKENS<span className="text-primary">.</span></h1>
                        <p className="text-base font-bold text-base-content/40 uppercase tracking-[0.3em] max-w-md">Archival repository for high-fidelity generative formulas.</p>
                    </div>
                </div>
            </section>

            <div className="flex-shrink-0 bg-base-100 px-10 py-6 border-b border-base-300 sticky top-0 z-20 backdrop-blur-md bg-base-100/80">
                <div className="max-w-screen-2xl mx-auto flex flex-wrap items-center justify-between gap-6">
                    <div className="flex items-center gap-4 flex-grow max-w-xl">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></div>
                        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery((e.currentTarget as any).value)} placeholder="Filter sequence..." className="input input-ghost w-full focus:bg-transparent border-none px-0 font-bold text-xl tracking-tight placeholder:opacity-10" />
                    </div>
                    <div className="flex items-center gap-4">
                        <select value={sortOrder} onChange={(e) => setSortOrder((e.currentTarget as any).value as SortOrder)} className="select select-bordered select-sm rounded-none text-[10px] font-black uppercase tracking-widest"><option value="newest">Recent</option><option value="oldest">Oldest</option><option value="title">A-Z</option></select>
                        <button onClick={() => { setPromptToEdit(null); setIsEditorModalOpen(true); }} className="btn btn-primary btn-sm rounded-none font-black text-[10px] tracking-widest px-6 shadow-lg">ARCHIVE NEW</button>
                    </div>
                </div>
            </div>

            <div className="flex-grow p-0 bg-base-200/5 min-h-[400px]">
                {prompts.length === 0 ? (
                    <div className="text-center py-32 flex flex-col items-center opacity-10">
                        <PromptIcon className="mx-auto h-20 w-20" />
                        <h3 className="mt-6 text-2xl font-black uppercase tracking-tighter">Vault Empty</h3>
                    </div>
                ) : sortedAndFilteredPrompts.length > 0 ? (
                    <div className="flex border-r border-base-300">
                        {columns.map((columnItems, colIndex) => (
                            <div key={colIndex} className="flex flex-1 flex-col gap-0 min-w-0 border-l border-base-300 first:border-l-0">
                                {columnItems.map(prompt => (
                                    <SavedPromptCard key={prompt.id} prompt={prompt} categoryName={categories.find(c => c.id === prompt.categoryId)?.name} onDeleteClick={(p) => { setPromptToDelete(p); setIsDeleteModalOpen(true); }} onEditClick={(p) => { setPromptToEdit(p); setIsEditorModalOpen(true); }} onSendToEnhancer={onSendToEnhancer} onOpenDetailView={() => setDetailViewPromptId(prompt.id)} onClip={(p) => onClipIdea({ id: `clipped-${p.id}`, lens: 'Library', title: p.title || 'Artifact', prompt: p.text, source: 'Library' })} />
                                ))}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-32 flex flex-col items-center opacity-10"><h3 className="text-xl font-black uppercase tracking-tighter">No Matches</h3></div>
                )}
            </div>

            {detailViewPromptId && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in flex items-center justify-center p-1 lg:p-2 overflow-hidden">
                    <div className="w-full h-full bg-base-300 rounded-none border border-base-300 shadow-2xl flex flex-col overflow-hidden relative">
                         <PromptDetailView prompts={sortedAndFilteredPrompts} currentIndex={sortedAndFilteredPrompts.findIndex(i => i.id === detailViewPromptId)} onClose={() => setDetailViewPromptId(null)} onNavigate={(idx) => setDetailViewPromptId(sortedAndFilteredPrompts[idx].id)} onDelete={(p) => { setDetailViewPromptId(null); setPromptToDelete(p); setIsDeleteModalOpen(true); }} onUpdate={handleUpdatePrompt} onSendToEnhancer={(text) => { setDetailViewPromptId(null); onSendToEnhancer(text); }} showGlobalFeedback={showGlobalFeedback} onClip={(p) => onClipIdea({ id: `clipped-${p.id}`, lens: 'Library', title: p.title || 'Artifact', prompt: p.text, source: 'Library' })} />
                    </div>
                </div>
            )}
        </main>
      </section>
      <PromptEditorModal isOpen={isEditorModalOpen} onClose={() => setIsEditorModalOpen(false)} onSave={handleSavePrompt} categories={categories} editingPrompt={promptToEdit} />
      <ConfirmationModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={handleConfirmDelete} title="Purge Token" message="Permanently erase this generative formula from the vault?" />
    </>
  );
};

export default SavedPrompts;