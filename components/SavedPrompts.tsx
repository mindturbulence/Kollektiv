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
import { PromptIcon, ArrowsUpDownIcon, FolderClosedIcon, SearchIcon, CloseIcon } from './icons';
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
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [columnCount, setColumnCount] = useState(() => getColumnCount());
  const [detailViewPromptId, setDetailViewPromptId] = useState<string | null>(null);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // --- Elastic Scroll Logic ---
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    let lastScrollY = scroller.scrollTop;
    let velocity = 0;
    let rafId: number;

    const updateVelocity = () => {
      const currentScrollY = scroller.scrollTop;
      const diff = currentScrollY - lastScrollY;
      velocity += (diff - velocity) * 0.15;
      lastScrollY = currentScrollY;
      const skew = Math.max(-7, Math.min(7, velocity * 0.1));
      const scale = 1 - Math.min(0.05, Math.abs(velocity) * 0.0005);
      if (gridRef.current) {
        gridRef.current.style.setProperty('--scroll-velocity', `${skew}deg`);
        gridRef.current.style.setProperty('--scroll-scale', `${scale}`);
      }
      if (Math.abs(velocity) > 0.01) { velocity *= 0.85; } else { velocity = 0; }
      rafId = requestAnimationFrame(updateVelocity);
    };

    rafId = requestAnimationFrame(updateVelocity);
    return () => cancelAnimationFrame(rafId);
  }, []);

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

  // --- Recursive Tree Filtering ---
  const treeItems = useMemo<TreeViewItem[]>(() => {
    const q = categorySearchQuery.toLowerCase().trim();

    const buildTree = (parentId?: string): TreeViewItem[] => {
      const children = categories.filter(cat => cat.parentId === parentId);
      const results: TreeViewItem[] = [];

      for (const cat of children) {
        const subTree = buildTree(cat.id);
        const nameMatches = cat.name.toLowerCase().includes(q);
        
        if (!q || nameMatches || subTree.length > 0) {
          results.push({
            id: cat.id,
            name: cat.name,
            icon: 'folder' as const,
            count: prompts.filter(p => p.categoryId === cat.id).length,
            children: subTree
          });
        }
      }
      return results;
    };
    
    const rootNodes = buildTree(undefined);
    const globalRepoMatches = !q || 'Global Repository'.toLowerCase().includes(q);
    const uncategorizedMatches = !q || 'Uncategorized'.toLowerCase().includes(q);

    const tree: TreeViewItem[] = [];
    if (globalRepoMatches) tree.push({ id: 'all', name: 'Global Repository', icon: 'prompt' as const, count: prompts.length });
    tree.push(...rootNodes);
    if (uncategorizedMatches) tree.push({ id: 'uncategorized', name: 'Uncategorized', icon: 'inbox' as const, count: prompts.filter(p => !p.categoryId).length });

    return tree;
  }, [categories, prompts, categorySearchQuery]);

  const displayHeroTitle = useMemo(() => {
    if (selectedCategoryId === 'all') return 'Prompt Library';
    if (selectedCategoryId === 'uncategorized') return 'Uncategorized';
    const selectedCat = categories.find(c => c.id === selectedCategoryId);
    return selectedCat ? selectedCat.name : 'Prompt Library';
  }, [selectedCategoryId, categories]);

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

  const activeDetailViewIndex = useMemo(() => {
      if (!detailViewPromptId) return -1;
      return sortedAndFilteredPrompts.findIndex(p => p.id === detailViewPromptId);
  }, [detailViewPromptId, sortedAndFilteredPrompts]);

  const isDetailViewVisible = activeDetailViewIndex !== -1;

  const columns = useMemo(() => {
    const cols: SavedPrompt[][] = Array.from({ length: columnCount }, () => []);
    sortedAndFilteredPrompts.forEach((item, index) => cols[index % columnCount].push(item));
    return cols;
  }, [sortedAndFilteredPrompts, columnCount]);

  if (isLoading) return (
    <div className="h-full w-full flex items-center justify-center bg-base-100">
        <LoadingSpinner />
    </div>
  );

  return (
    <>
      <section className="flex flex-row h-full bg-base-100 overflow-hidden">
        <aside className={`relative flex-shrink-0 bg-base-100 border-r border-base-300 transition-all duration-300 ease-in-out flex flex-col ${isCategoryPanelCollapsed ? 'w-0' : 'w-96'}`}>
          <CategoryPanelToggle isCollapsed={isCategoryPanelCollapsed} onToggle={onToggleCategoryPanel} />
          
          <div className={`flex flex-col h-full overflow-hidden transition-opacity duration-200 ${isCategoryPanelCollapsed ? 'opacity-0 invisible' : 'opacity-100 visible'}`}>
            <div className="flex-shrink-0 bg-base-100 border-b border-base-300 h-14">
                <div className="flex items-center h-full relative">
                    <SearchIcon className="absolute left-6 w-4 h-4 opacity-20 pointer-events-none" />
                    <input 
                        type="text" 
                        value={categorySearchQuery}
                        onChange={(e) => setCategorySearchQuery(e.target.value)}
                        placeholder="FIND FOLDER..." 
                        className="w-full h-full bg-transparent border-none focus:outline-none focus:ring-0 pl-14 pr-12 font-bold uppercase tracking-tight text-[10px] placeholder:text-base-content/10"
                    />
                    {categorySearchQuery && (
                        <button 
                            onClick={() => setCategorySearchQuery('')} 
                            className="absolute right-4 btn btn-xs btn-ghost btn-circle opacity-40 hover:opacity-100 transition-opacity"
                            title="Clear search"
                        >
                            <CloseIcon className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-grow overflow-y-auto p-6 w-96 custom-scrollbar">
              <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-base-content/30 mb-6 px-3">Registry Index</h2>
              <TreeView 
                items={treeItems} 
                selectedId={selectedCategoryId} 
                onSelect={setSelectedCategoryId} 
                searchActive={!!categorySearchQuery}
              />
            </div>
          </div>
        </aside>

        <main className="relative flex-grow flex flex-col h-full overflow-hidden bg-base-100">
            {isDetailViewVisible && (
                <PromptDetailView 
                    prompts={sortedAndFilteredPrompts} 
                    currentIndex={activeDetailViewIndex} 
                    onClose={() => setDetailViewPromptId(null)} 
                    onNavigate={(idx) => setDetailViewPromptId(sortedAndFilteredPrompts[idx].id)} 
                    onDelete={(p) => { setDetailViewPromptId(null); setPromptToDelete(p); setIsDeleteModalOpen(true); }} 
                    onUpdate={handleUpdatePrompt} 
                    onSendToEnhancer={(text) => { setDetailViewPromptId(null); onSendToEnhancer(text); }} 
                    showGlobalFeedback={showGlobalFeedback} 
                    onClip={(p) => onClipIdea({ id: `clipped-${p.id}`, lens: 'Library', title: p.title || 'Artifact', prompt: p.text, source: 'Library' })} 
                />
            )}

            <div className={`flex flex-col h-full overflow-hidden transition-all duration-300 ${isDetailViewVisible ? 'blur-sm pointer-events-none' : ''}`}>
                <section className="flex-shrink-0 p-10 border-b border-base-300 bg-base-200/20">
                    <div className="w-full flex flex-col gap-1">
                        <div className="flex flex-col md:flex-row md:items-stretch justify-between gap-6">
                            <h1 className="text-2xl lg:text-3xl font-black tracking-tighter text-base-content leading-none flex items-center uppercase">{displayHeroTitle}<span className="text-primary">.</span></h1>
                            <div className="flex bg-base-100 px-6 py-2 border border-base-300 shadow-sm self-start md:self-auto min-h-full">
                                <div className="flex flex-col border-r border-base-300 px-6 last:border-r-0 justify-center">
                                    <span className="text-2xl font-black tracking-tighter leading-none">{sortedAndFilteredPrompts.length}</span>
                                    <span className="text-[8px] uppercase font-black text-base-content/30 tracking-[0.2em] mt-0.5">Tokens</span>
                                </div>
                            </div>
                        </div>
                        <p className="text-[11px] font-bold text-base-content/30 uppercase tracking-[0.3em] w-full">Archival repository for high-fidelity generative formulas.</p>
                    </div>
                </section>

                <div className="flex-shrink-0 bg-base-100 border-b border-base-300 sticky top-0 z-20 h-14">
                    <div className="flex items-stretch h-full w-full">
                        <div className="flex-grow flex items-center relative border-r border-base-300">
                            <SearchIcon className="absolute left-6 w-4 h-4 opacity-20 pointer-events-none" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="FILTER SEQUENCE..."
                                className="w-full h-full bg-transparent border-none focus:outline-none focus:ring-0 pl-14 pr-6 font-bold uppercase tracking-tight text-sm placeholder:text-base-content/10"
                            />
                        </div>
                        <div className="flex items-stretch">
                            <select
                                value={sortOrder}
                                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                                className="select select-ghost rounded-none border-none border-r border-base-300 focus:outline-none h-full px-8 text-[10px] font-black uppercase tracking-widest bg-base-100 hover:bg-base-200"
                            >
                                <option value="newest">Recent</option>
                                <option value="oldest">Oldest</option>
                                <option value="title">A-Z</option>
                            </select>
                            <button
                                onClick={() => { setPromptToEdit(null); setIsEditorModalOpen(true); }}
                                className="btn btn-primary rounded-none h-full border-none px-10 font-black text-[10px] tracking-[0.2em] shadow-none uppercase"
                            >
                                ARCHIVE NEW
                            </button>
                        </div>
                    </div>
                </div>

                <div ref={scrollerRef} className="flex-grow overflow-y-auto scroll-smooth custom-scrollbar bg-base-200/5">
                    {prompts.length === 0 ? (
                        <div className="text-center py-32 flex flex-col items-center opacity-10">
                            <PromptIcon className="mx-auto h-20 w-20" />
                            <h3 className="text-2xl font-black uppercase tracking-tighter">Vault Empty</h3>
                        </div>
                    ) : sortedAndFilteredPrompts.length > 0 ? (
                        <div 
                            ref={gridRef}
                            className="flex border-r border-base-300 elastic-grid-container"
                            style={{ 
                                '--scroll-velocity': '0deg',
                                '--scroll-scale': '1'
                            } as any}
                        >
                            {columns.map((columnItems, colIndex) => (
                                <div key={colIndex} className="flex flex-1 flex-col gap-0 min-w-0 border-l border-base-300 first:border-l-0">
                                    {columnItems.map(prompt => (
                                        <div key={prompt.id} className="elastic-grid-item">
                                            <SavedPromptCard prompt={prompt} categoryName={categories.find(c => c.id === prompt.categoryId)?.name} onDeleteClick={(p) => { setPromptToDelete(p); setIsDeleteModalOpen(true); }} onEditClick={(p) => { setPromptToEdit(p); setIsEditorModalOpen(true); }} onSendToEnhancer={onSendToEnhancer} onOpenDetailView={() => setDetailViewPromptId(prompt.id)} onClip={(p) => onClipIdea({ id: `clipped-${p.id}`, lens: 'Library', title: p.title || 'Artifact', prompt: p.text, source: 'Library' })} />
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-32 flex flex-col items-center opacity-10"><h3 className="text-xl font-black uppercase tracking-tighter">No Matches</h3></div>
                    )}
                </div>
            </div>
        </main>
      </section>
      <PromptEditorModal isOpen={isEditorModalOpen} onClose={() => setIsEditorModalOpen(false)} onSave={handleSavePrompt} categories={categories} editingPrompt={promptToEdit} />
      <ConfirmationModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={handleConfirmDelete} title="Purge Token" message="Permanently erase this generative formula from the vault?" />
    </>
  );
};

export default SavedPrompts;