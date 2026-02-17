import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    loadSavedPrompts,
    deleteSavedPrompt,
    addSavedPrompt,
    updateSavedPrompt,
    loadPromptCategories,
} from '../utils/promptStorage';
import type { SavedPrompt, PromptCategory, Idea } from '../types';
import { SearchIcon, CloseIcon, PlusIcon, FolderClosedIcon, ArchiveIcon } from './icons';
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

const SavedPrompts: React.FC<SavedPromptsProps> = ({ 
    onSendToEnhancer, 
    isCategoryPanelCollapsed, 
    onToggleCategoryPanel, 
    showGlobalFeedback, 
    onClipIdea 
}) => {
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
  const [detailViewPromptId, setDetailViewPromptId] = useState<string | null>(null);
  const [columnCount, setColumnCount] = useState(3);

  // Pagination/Memory Management
  const [displayCount, setDisplayCount] = useState(30);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const observer = useRef<IntersectionObserver | null>(null);

  const refreshData = useCallback(async () => {
      setIsLoading(true);
      try {
        const [loadedPrompts, loadedCategories] = await Promise.all([
            loadSavedPrompts(), 
            loadPromptCategories()
        ]);
        setPrompts(loadedPrompts);
        setCategories(loadedCategories);
      } catch (error) {
          console.error("Registry load failure:", error);
      } finally {
          setIsLoading(false);
      }
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  // Responsive column count logic
  useEffect(() => {
    const handleResize = () => {
        const w = window.innerWidth;
        if (w >= 1280) setColumnCount(3);
        else if (w >= 768) setColumnCount(2);
        else setColumnCount(1);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Intersection Observer for Infinite Scroll
  useEffect(() => {
    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !isLoading && displayCount < sortedAndFilteredPrompts.length) {
            setDisplayCount(prev => prev + 30);
        }
    }, { threshold: 0.1, rootMargin: '400px' });

    if (loadMoreRef.current) {
        observer.current.observe(loadMoreRef.current);
    }

    return () => observer.current?.disconnect();
  }, [isLoading, displayCount, prompts.length, searchQuery, selectedCategoryId]);

  const sortedAndFilteredPrompts = useMemo(() => {
      let filtered = (selectedCategoryId === 'all') 
        ? prompts 
        : (selectedCategoryId === 'uncategorized') 
            ? prompts.filter(p => !p.categoryId) 
            : prompts.filter(p => p.categoryId === selectedCategoryId);

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(p => 
            (p.title || '').toLowerCase().includes(q) || 
            p.text.toLowerCase().includes(q) ||
            p.tags?.some(t => t.toLowerCase().includes(q))
        );
      }

      const sorted = [...filtered];
      if (sortOrder === 'oldest') sorted.sort((a, b) => a.createdAt - b.createdAt);
      else if (sortOrder === 'title') sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      else sorted.sort((a, b) => b.createdAt - a.createdAt);
      return sorted;
  }, [prompts, selectedCategoryId, sortOrder, searchQuery]);

  // Masonry Split Logic with Pagination Slicing
  const masonryColumns = useMemo(() => {
    const visiblePrompts = sortedAndFilteredPrompts.slice(0, displayCount);
    const cols: SavedPrompt[][] = Array.from({ length: columnCount }, () => []);
    visiblePrompts.forEach((item, index) => {
        cols[index % columnCount].push(item);
    });
    return cols;
  }, [sortedAndFilteredPrompts, columnCount, displayCount]);

  const handleClip = (p: SavedPrompt) => {
      onClipIdea({
          id: p.id,
          lens: 'Archived',
          title: p.title || 'Untitled Prompt',
          prompt: p.text,
          source: 'Library'
      });
  };

  const treeItems = useMemo<TreeViewItem[]>(() => {
    const q = categorySearchQuery.toLowerCase().trim();
    const buildTree = (parentId?: string): TreeViewItem[] => {
      const children = categories.filter(cat => cat.parentId === parentId);
      const results: TreeViewItem[] = [];
      for (const cat of children) {
        const subTree = buildTree(cat.id);
        if (!q || cat.name.toLowerCase().includes(q) || subTree.length > 0) {
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
    const tree: TreeViewItem[] = [];
    if (!q || 'All Prompts'.toLowerCase().includes(q)) tree.push({ id: 'all', name: 'All Prompts', icon: 'prompt' as const, count: prompts.length });
    tree.push(...buildTree(undefined));
    if (!q || 'Uncategorized'.toLowerCase().includes(q)) tree.push({ id: 'uncategorized', name: 'Uncategorized', icon: 'inbox' as const, count: prompts.filter(p => !p.categoryId).length });
    return tree;
  }, [categories, prompts, categorySearchQuery]);

  const currentCategoryName = useMemo(() => {
    if (selectedCategoryId === 'all') return 'Prompt Library';
    if (selectedCategoryId === 'uncategorized') return 'Uncategorized';
    return categories.find(c => c.id === selectedCategoryId)?.name || 'Library';
  }, [selectedCategoryId, categories]);

  if (isLoading && prompts.length === 0) {
    return <div className="h-full w-full flex items-center justify-center bg-base-100"><LoadingSpinner /></div>;
  }

  return (
    <section className="flex flex-row h-full bg-base-100 overflow-hidden w-full">
      <aside className={`relative flex-shrink-0 bg-base-100 border-r border-base-300 transition-all duration-300 ease-in-out flex flex-col ${isCategoryPanelCollapsed ? 'w-0' : 'w-80'}`}>
        <CategoryPanelToggle isCollapsed={isCategoryPanelCollapsed} onToggle={onToggleCategoryPanel} position="right" />
        <div className={`flex flex-col h-full overflow-hidden transition-opacity duration-200 ${isCategoryPanelCollapsed ? 'opacity-0 invisible' : 'opacity-100 visible'}`}>
          <div className="flex-shrink-0 bg-base-200/50 border-b border-base-300 h-16 flex items-center px-4">
             <div className="flex items-center gap-3">
                <FolderClosedIcon className="w-5 h-5 text-primary/40" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em]">Folders</span>
             </div>
          </div>
          <div className="flex-shrink-0 bg-base-100 border-b border-base-300 h-12">
            <div className="flex items-center h-full relative">
              <SearchIcon className="absolute left-4 w-3.5 h-3.5 opacity-20 pointer-events-none" />
              <input 
                type="text" 
                value={categorySearchQuery}
                onChange={(e) => setCategorySearchQuery(e.target.value)}
                placeholder="SEARCH FOLDERS..." 
                className="w-full h-full bg-transparent border-none focus:outline-none focus:ring-0 pl-10 pr-10 font-bold uppercase tracking-tight text-[10px] placeholder:text-base-content/10"
              />
              {categorySearchQuery && (
                <button onClick={() => setCategorySearchQuery('')} className="absolute right-3 btn btn-xs btn-ghost btn-circle opacity-40">
                  <CloseIcon className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
          <div className="flex-grow overflow-y-auto p-4 custom-scrollbar">
            <TreeView items={treeItems} selectedId={selectedCategoryId} onSelect={(id) => { setSelectedCategoryId(id); setDisplayCount(30); }} searchActive={!!categorySearchQuery} />
          </div>
        </div>
      </aside>

      <main className="relative flex-1 flex flex-col h-full overflow-hidden bg-base-100 min-w-0">
        {detailViewPromptId && (
          <PromptDetailView 
            prompts={sortedAndFilteredPrompts} currentIndex={sortedAndFilteredPrompts.findIndex(p => p.id === detailViewPromptId)} 
            onClose={() => setDetailViewPromptId(null)} onNavigate={(idx) => setDetailViewPromptId(sortedAndFilteredPrompts[idx].id)}
            onDelete={(p) => { setPromptToDelete(p); setIsDeleteModalOpen(true); }}
            onUpdate={async (id, u) => { await updateSavedPrompt(id, { ...prompts.find(p=>p.id===id)!, ...u }); await refreshData(); }}
            onSendToEnhancer={onSendToEnhancer} showGlobalFeedback={showGlobalFeedback} onClip={handleClip}
          />
        )}

        <div className={`flex flex-col h-full overflow-hidden transition-all duration-300 ${detailViewPromptId ? 'blur-sm pointer-events-none' : ''}`}>
            <header className="flex-shrink-0 bg-base-200/20 border-b border-base-300">
                <div className="p-10">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div className="space-y-2">
                            <span className="text-[10px] font-black uppercase tracking-[0.6em] text-primary/60 block">LIBRARY INDEX</span>
                            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter text-base-content leading-none uppercase">
                                {currentCategoryName}<span className="text-primary">.</span>
                            </h1>
                        </div>
                        <div className="flex bg-base-100 border border-base-300 shadow-sm">
                            <div className="px-8 py-3 flex flex-col items-center justify-center">
                                <span className="text-3xl font-black tracking-tighter leading-none">{sortedAndFilteredPrompts.length}</span>
                                <span className="text-[8px] uppercase font-black text-base-content/30 tracking-[0.2em] mt-1">Saved Prompts</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="h-16 border-t border-base-300 bg-base-100 flex items-stretch overflow-hidden">
                    <div className="flex-grow flex items-center relative border-r border-base-300 min-w-0">
                        <SearchIcon className="absolute left-8 w-4 h-4 opacity-20 pointer-events-none" />
                        <input 
                            type="text" 
                            value={searchQuery} 
                            onChange={(e) => { setSearchQuery(e.target.value); setDisplayCount(30); }} 
                            placeholder="SEARCH LIBRARY BY NAME OR TAG..." 
                            className="w-full h-full bg-transparent border-none focus:outline-none focus:ring-0 pl-16 pr-12 font-bold uppercase tracking-tight text-sm placeholder:text-base-content/10" 
                        />
                        {searchQuery && (
                          <button onClick={() => { setSearchQuery(''); setDisplayCount(30); }} className="absolute right-6 btn btn-xs btn-ghost btn-circle opacity-40">
                            <CloseIcon className="w-4 h-4" />
                          </button>
                        )}
                    </div>
                    
                    <div className="flex items-stretch flex-shrink-0 bg-base-100">
                        <div className="join h-full rounded-none">
                            <button onClick={() => { setSortOrder('newest'); setDisplayCount(30); }} className={`join-item btn btn-ghost h-full border-none border-l border-base-300 rounded-none px-8 font-black uppercase text-[10px] tracking-widest ${sortOrder === 'newest' ? 'bg-primary/5 text-primary' : 'opacity-40'}`}>BY DATE</button>
                            <button onClick={() => { setSortOrder('title'); setDisplayCount(30); }} className={`join-item btn btn-ghost h-full border-none border-l border-base-300 rounded-none px-8 font-black uppercase text-[10px] tracking-widest ${sortOrder === 'title' ? 'bg-primary/5 text-primary' : 'opacity-40'}`}>BY NAME</button>
                        </div>
                        <button onClick={() => { setPromptToEdit(null); setIsEditorModalOpen(true); }} className="btn btn-primary h-full rounded-none border-none border-l border-base-300 px-8 font-black text-[10px] tracking-widest uppercase flex items-center gap-2">
                            <PlusIcon className="w-4 h-4" />
                            <span>Add Prompt</span>
                        </button>
                    </div>
                </div>
            </header>

            <div className="flex-grow overflow-y-auto overflow-x-hidden custom-scrollbar bg-base-100">
                {sortedAndFilteredPrompts.length > 0 ? (
                    <div className="flex bg-base-300 border-b border-base-300 min-h-full">
                        {masonryColumns.map((col, colIdx) => (
                            <div key={colIdx} className="flex-1 flex flex-col gap-px border-r border-base-300 last:border-r-0">
                                {col.map(p => (
                                    <SavedPromptCard 
                                        key={p.id} 
                                        prompt={p} 
                                        categoryName={categories.find(c => c.id === p.categoryId)?.name}
                                        onDeleteClick={(p) => { setPromptToDelete(p); setIsDeleteModalOpen(true); }}
                                        onEditClick={(p) => { setPromptToEdit(p); setIsEditorModalOpen(true); }}
                                        onSendToEnhancer={onSendToEnhancer}
                                        onOpenDetailView={() => setDetailViewPromptId(p.id)}
                                        onClip={handleClip}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center py-40 opacity-10">
                        <ArchiveIcon className="w-20 h-20 mb-6" />
                        <h3 className="text-3xl font-black uppercase tracking-widest">Library Empty</h3>
                        <p className="text-[10px] font-bold uppercase tracking-[0.3em] mt-4">Awaiting content input</p>
                    </div>
                )}
                
                {/* Scroll Target for Infinite Loading */}
                <div ref={loadMoreRef} className="h-20 w-full flex items-center justify-center">
                    {displayCount < sortedAndFilteredPrompts.length && <LoadingSpinner size={24} />}
                </div>
            </div>
        </div>
      </main>

      <PromptEditorModal 
          isOpen={isEditorModalOpen} onClose={() => setIsEditorModalOpen(false)} 
          onSave={async (d) => { if(promptToEdit?.id) await updateSavedPrompt(promptToEdit.id, d); else await addSavedPrompt(d); await refreshData(); }} 
          categories={categories} editingPrompt={promptToEdit}
      />

      <ConfirmationModal 
        isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} 
        onConfirm={async () => { if(promptToDelete) await deleteSavedPrompt(promptToDelete.id); await refreshData(); setIsDeleteModalOpen(false); }} 
        title="DELETE PROMPT" message={`Permanently remove "${promptToDelete?.title || 'Untitled'}"?`} 
      />
    </section>
  );
};

export default SavedPrompts;
