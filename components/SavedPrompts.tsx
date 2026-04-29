import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { gsap } from 'gsap';
import {
    loadSavedPrompts,
    deleteSavedPrompt,
    addSavedPrompt,
    updateSavedPrompt,
    loadPromptCategories,
} from '../utils/promptStorage';
import type { SavedPrompt, PromptCategory, Idea } from '../types';
import { SearchIcon, CloseIcon, PlusIcon, ArchiveIcon } from './icons';
import ConfirmationModal from './ConfirmationModal';
import SavedPromptCard from './SavedPromptCard';
import TreeView, { TreeViewItem } from './TreeView';
import CategoryPanelToggle from './CategoryPanelToggle';
import PromptEditorModal from './PromptEditorModal';
import LoadingSpinner from './LoadingSpinner';
import PromptDetailView from './PromptDetailView';
import { pageVariants } from './AnimatedPanels';

interface SavedPromptsProps {
  onSendToEnhancer: (prompt: string) => void;
  isCategoryPanelCollapsed: boolean;
  onToggleCategoryPanel: () => void;
  showGlobalFeedback: (message: string) => void;
  onClipIdea: (idea: Idea) => void;
  isExiting?: boolean;
}

type SortOrder = 'newest' | 'oldest' | 'title';

const SavedPrompts: React.FC<SavedPromptsProps> = ({ 
    onSendToEnhancer, 
    isCategoryPanelCollapsed, 
    onToggleCategoryPanel, 
    showGlobalFeedback, 
    onClipIdea,
    isExiting = false
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
  const gridRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const grid = gridRef.current;
    if (!scroller || !grid) return;

    let lastY = scroller.scrollTop;
    let vel = 0;
    
    const skewSetter = gsap.quickSetter(grid, "skewY", "deg");
    const scaleSetter = gsap.quickSetter(grid, "scaleY");

    const updateMotion = () => {
        const currentY = scroller.scrollTop;
        const diff = currentY - lastY;
        vel += (diff - vel) * 0.2; 
        lastY = currentY;

        const clampedVel = gsap.utils.clamp(-50, 50, vel);
        const skewValue = clampedVel * 0.1;
        const scaleValue = 1 - Math.min(0.015, Math.abs(clampedVel) * 0.00015);

        skewSetter(skewValue);
        scaleSetter(scaleValue);

        columnRefs.current.forEach((col, idx) => {
            if (!col) return;
            const factor = ((idx % 3) - 1) * 0.2;
            const offset = clampedVel * factor;
            gsap.set(col, { y: offset, force3D: true });
        });

        if (Math.abs(vel) > 0.1) {
            vel *= 0.95;
        } else {
            vel = 0;
            skewSetter(0);
            scaleSetter(1);
            columnRefs.current.forEach(col => col && gsap.set(col, { y: 0 }));
        }
    };

    gsap.ticker.add(updateMotion);
    return () => gsap.ticker.remove(updateMotion);
  }, [columnCount, selectedCategoryId]);

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
            (p.text || '').toLowerCase().includes(q) ||
            p.tags?.some(t => t.toLowerCase().includes(q))
        );
      }

      const sorted = [...filtered];
      if (sortOrder === 'oldest') sorted.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      else if (sortOrder === 'title') sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      else sorted.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return sorted;
  }, [prompts, selectedCategoryId, sortOrder, searchQuery]);

  useEffect(() => {
    const node = gridRef.current;
    if (!node) return;

    const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
            const w = entry.contentRect.width;
            if (w >= 1600) setColumnCount(5);
            else if (w >= 1200) setColumnCount(4);
            else if (w >= 900) setColumnCount(3);
            else if (w >= 600) setColumnCount(2);
            else setColumnCount(1);
        }
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [isLoading, sortedAndFilteredPrompts.length]);

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

  // Masonry Split Logic with Pagination Slicing
  const masonryColumns = useMemo(() => {
    const visiblePrompts = (sortedAndFilteredPrompts || []).slice(0, displayCount);
    if (visiblePrompts.length === 0) return [];
    
    const effectiveColumnCount = Math.min(columnCount, visiblePrompts.length);
    const cols: SavedPrompt[][] = Array.from({ length: effectiveColumnCount }, () => []);
    
    visiblePrompts.forEach((item, index) => {
        if (item) {
            cols[index % effectiveColumnCount].push(item);
        }
    });
    return cols;
  }, [sortedAndFilteredPrompts, columnCount, displayCount]);

  useEffect(() => {
    if (masonryColumns.length > 0 && gridRef.current) {
        const items = gridRef.current.querySelectorAll('.prompt-card-item:not(.animated)');
        if (items && items.length > 0) {
            gsap.fromTo(items, 
                { opacity: 0, y: 40, scale: 0.95 },
                { 
                    opacity: 1, 
                    y: 0, 
                    scale: 1, 
                    duration: 0.7, 
                    stagger: 0.04, 
                    ease: "power2.out",
                    onComplete: () => {
                        items.forEach(el => {
                            if (el && el.classList) el.classList.add('animated');
                        });
                    }
                }
            );
        }
    }
  }, [masonryColumns]);

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
    return <div className="h-full w-full flex items-center justify-center bg-transparent"><LoadingSpinner /></div>;
  }

  return (
    <>
    <motion.section 
        variants={pageVariants}
        initial="hidden"
        animate={isExiting ? "exit" : "visible"}
        exit="exit"
        className="flex flex-col h-full bg-transparent w-full relative overflow-hidden"
    >
        <div className="flex flex-row h-full w-full overflow-hidden relative z-10 gap-6 bg-transparent">
          <aside className={`relative z-20 flex-shrink-0 transition-all duration-300 ease-in-out flex flex-col overflow-visible ${isCategoryPanelCollapsed ? 'w-0 p-0' : 'w-80 p-[3px] corner-frame'}`}>
            <CategoryPanelToggle isCollapsed={isCategoryPanelCollapsed} onToggle={onToggleCategoryPanel} position="right" />
            <div className={`flex flex-col h-full w-full bg-base-100/50 backdrop-blur-xl relative overflow-hidden transition-all duration-300 ${isCategoryPanelCollapsed ? 'opacity-0 invisible' : 'opacity-100 visible'}`}>
              <div className={`flex flex-col h-full w-full overflow-hidden relative z-10 transition-opacity duration-200 ${isCategoryPanelCollapsed ? 'opacity-0 invisible' : 'opacity-100 visible'}`}>
              <div className="flex-shrink-0 h-14 px-6 flex items-center border-b border-white/5">
                <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-primary">Category Folder</h3>
              </div>
              <div className="flex-shrink-0 h-14 px-2 mt-4">
                <div className="flex items-center h-full relative px-4">
                  <SearchIcon className="absolute left-10 w-3.5 h-3.5 opacity-20 pointer-events-none" />
                  <input 
                    type="text" 
                    value={categorySearchQuery}
                    onChange={(e) => setCategorySearchQuery(e.target.value)}
                    placeholder="SEARCH FOLDERS..." 
                    className="form-input w-full h-full bg-transparent border-none focus:outline-none focus:ring-0 pl-12 pr-10"
                  />
                  {categorySearchQuery && (
                    <button onClick={() => setCategorySearchQuery('')} className="absolute right-3 btn btn-xs btn-ghost btn-circle opacity-40">
                      <CloseIcon className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-grow overflow-y-auto p-4">
                <TreeView items={treeItems} selectedId={selectedCategoryId} onSelect={(id) => { setSelectedCategoryId(id); setDisplayCount(30); }} searchActive={!!categorySearchQuery} />
              </div>
            </div>
            </div>
          </aside>
          <main className="relative z-10 flex-1 flex flex-col h-full overflow-visible min-w-0 p-[3px] corner-frame">
            <div className="flex flex-col h-full w-full bg-base-100/50 backdrop-blur-xl relative overflow-hidden">
              <div className="flex flex-col h-full w-full overflow-hidden relative z-10">
          {detailViewPromptId && (
            <PromptDetailView 
              prompts={sortedAndFilteredPrompts} currentIndex={sortedAndFilteredPrompts.findIndex(p => p.id === detailViewPromptId)} 
              categories={categories}
              onClose={() => setDetailViewPromptId(null)} onNavigate={(idx: number) => setDetailViewPromptId(sortedAndFilteredPrompts[idx].id)}
              onDelete={(p: SavedPrompt) => { setPromptToDelete(p); setIsDeleteModalOpen(true); }}
              onUpdate={async (id: string, u: Partial<Omit<SavedPrompt, 'id' | 'createdAt'>>) => { 
                const existing = prompts.find(p => p.id === id);
                if (existing) {
                  await updateSavedPrompt(id, { ...existing, ...u }); 
                  await refreshData(); 
                }
              }}
              showGlobalFeedback={showGlobalFeedback} onClip={handleClip}
            />
          )}


          <div className={`flex flex-col h-full overflow-hidden transition-all duration-300 ${detailViewPromptId ? 'blur-sm pointer-events-none' : ''}`}>
              <div className="relative flex-grow overflow-hidden">
                  <div ref={scrollerRef} className="h-full w-full overflow-y-auto overflow-x-hidden bg-transparent">
                      <header className="bg-transparent">
                      <div className="p-4 md:p-6">
                          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                              <div className="space-y-1">
                                  <span className="text-[10px] font-black uppercase tracking-[0.6em] text-primary/60 block">LIBRARY INDEX</span>
                                  <h1 className="text-3xl lg:text-4xl font-black tracking-tighter text-base-content leading-none uppercase font-sf-mono">
                                      {currentCategoryName}<span className="text-primary">.</span>
                                  </h1>
                              </div>
                              <div className="flex">
                                  <div className="px-6 py-2 flex flex-col items-center justify-center">
                                      <span className="text-3xl font-black tracking-tighter leading-none">{sortedAndFilteredPrompts.length}</span>
                                      <span className="text-[8px] uppercase font-black text-base-content/30 tracking-[0.2em] mt-1">Saved Prompts</span>
                                  </div>
                              </div>
                          </div>
                      </div>
                  </header>

                  <div className="h-14 bg-base-100/40 backdrop-blur-xl flex items-stretch overflow-hidden sticky top-0 z-30 panel-transparent">
                      <div className="flex-grow flex items-center relative min-w-0">
                          <SearchIcon className="absolute left-6 w-4 h-4 opacity-20 pointer-events-none" />
                          <input 
                              type="text" 
                              value={searchQuery} 
                              onChange={(e) => { setSearchQuery(e.target.value); setDisplayCount(30); }} 
                              placeholder="SEARCH LIBRARY BY NAME OR TAG..." 
                              className="form-input input-lg w-full h-full bg-transparent border-none focus:outline-none focus:ring-0 pl-14 pr-12" 
                          />
                          {searchQuery && (
                            <button onClick={() => { setSearchQuery(''); setDisplayCount(30); }} className="absolute right-4 btn btn-xs btn-ghost btn-circle opacity-40">
                              <CloseIcon className="w-4 h-4" />
                            </button>
                          )}
                      </div>
                      
                      <div className="flex items-stretch flex-shrink-0">
                          <div className="form-tab-group h-full rounded-none">
                              <button onClick={() => { setSortOrder('newest'); setDisplayCount(30); }} className={`btn btn-xs btn-ghost h-full border-none rounded-none px-6 font-black text-[10px] tracking-widest uppercase btn-snake ${sortOrder === 'newest' ? 'active bg-primary/10 text-primary no-glow' : 'hover:no-glow'}`}>
                                  <span/><span/><span/><span/>
                                  BY DATE
                              </button>
                              <button onClick={() => { setSortOrder('title'); setDisplayCount(30); }} className={`btn btn-xs btn-ghost h-full border-none rounded-none px-6 font-black text-[10px] tracking-widest uppercase btn-snake ${sortOrder === 'title' ? 'active bg-primary/10 text-primary no-glow' : 'hover:no-glow'}`}>
                                  <span/><span/><span/><span/>
                                  BY NAME
                              </button>
                          </div>
                          <button onClick={() => { setPromptToEdit(null); setIsEditorModalOpen(true); }} className="btn btn-primary h-full rounded-none border-none w-[150px] tracking-widest uppercase flex items-center justify-center gap-2 btn-snake-primary flex-shrink-0">
                              <span/><span/><span/><span/>
                              <PlusIcon className="w-4 h-4" />
                              <span>Add Prompt</span>
                          </button>
                      </div>
                  </div>

                  {sortedAndFilteredPrompts.length > 0 ? (
                      <div ref={gridRef} className="flex justify-center min-h-full w-full bg-transparent" style={{ willChange: 'transform' }}>
                          {masonryColumns.map((col, colIdx) => (
                              <div key={colIdx} ref={el => { columnRefs.current[colIdx] = el; }} className="flex-1 max-w-[450px] min-w-0 flex flex-col border-r border-base-content/5 last:border-r-0">
                                  {col.map((p, pIdx) => (
                                      <div key={p.id} className={`prompt-card-item ${pIdx !== col.length - 1 ? 'border-b border-base-content/5' : ''}`}>
                                          <SavedPromptCard 
                                              prompt={p} 
                                              categoryName={categories.find(c => c.id === p.categoryId)?.name}
                                              onDeleteClick={(p) => { setPromptToDelete(p); setIsDeleteModalOpen(true); }}
                                              onEditClick={(p) => { setPromptToEdit(p); setIsEditorModalOpen(true); }}
                                              onSendToEnhancer={onSendToEnhancer}
                                              onOpenDetailView={() => setDetailViewPromptId(p.id)}
                                              onClip={handleClip}
                                          />
                                      </div>
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
                  <div ref={loadMoreRef} className={`${displayCount < sortedAndFilteredPrompts.length ? 'h-20' : 'h-0'} w-full flex items-center justify-center overflow-hidden`}>
                      {displayCount < sortedAndFilteredPrompts.length && <LoadingSpinner size={24} />}
                  </div>
              </div>
            </div>
          </div>
          </div>
          </div>
        </main>
      </div>
    </motion.section>

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
    </>
  );
};

export default SavedPrompts;
