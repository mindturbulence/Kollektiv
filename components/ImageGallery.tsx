import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { gsap } from 'gsap';
import type { GalleryItem, GalleryCategory } from '../types';
import { loadGalleryItems, addItemToGallery, updateItemInGallery, deleteItemFromGallery, loadPinnedItemIds, savePinnedItemIds, loadCategories } from '../utils/galleryStorage';
import ImageCard from './ImageCard';
import TreeView, { TreeViewItem } from './TreeView';
import { SearchIcon, CloseIcon } from './icons';
import { pageVariants } from './AnimatedPanels';
import CategoryPanelToggle from './CategoryPanelToggle';
import ItemDetailView from './ItemDetailView';
import ConfirmationModal from './ConfirmationModal';
import LoadingSpinner from './LoadingSpinner';
import AddItemModal from './AddItemModal';
import useLocalStorage from '../utils/useLocalStorage';
import { audioService } from '../services/audioService';

interface ImageGalleryProps {
  isCategoryPanelCollapsed: boolean;
  onToggleCategoryPanel: () => void;
  isSidebarPinned: boolean;
  showGlobalFeedback: (message: string, isError?: boolean) => void;
  isExiting?: boolean;
}

export type GalleryViewMode = 'compact' | 'default' | 'focus';

const ImageGallery: React.FC<ImageGalleryProps> = ({
  isCategoryPanelCollapsed,
  onToggleCategoryPanel,
  showGlobalFeedback,
  isExiting = false
}) => {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [categories, setCategories] = useState<GalleryCategory[]>([]);
  const [pinnedItemIds, setPinnedItemIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortOrder] = useState<'newest' | 'oldest' | 'title'>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'video'>('all');
  const [showNsfw, setShowNsfw] = useLocalStorage<boolean>('galleryShowNsfw', false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [detailViewItemId, setDetailViewItemId] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<GalleryItem | null>(null);
  const [viewMode, setViewMode] = useLocalStorage<GalleryViewMode>('galleryViewMode', 'default');

  const [columnCount, setColumnCount] = useState(6);
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [displayCount, setDisplayCount] = useState(120);
  const [targetDisplayCount, setTargetDisplayCount] = useState(120);
  const streamRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (displayCount < targetDisplayCount) {
      const step = () => {
        setDisplayCount(prev => {
          const next = prev + 1;
          if (next >= targetDisplayCount) return targetDisplayCount;
          streamRafRef.current = requestAnimationFrame(step);
          return next;
        });
      };
      streamRafRef.current = requestAnimationFrame(step);
    }
    return () => { if (streamRafRef.current) cancelAnimationFrame(streamRafRef.current); };
  }, [targetDisplayCount, displayCount]);

  useEffect(() => {
    setDetailViewItemId(null);
    setTargetDisplayCount(120);
    setDisplayCount(120);
  }, [selectedCategoryId]);

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

      // Increase sensitivity and responsiveness
      vel += (diff - vel) * 0.2;
      lastY = currentY;

      const clampedVel = gsap.utils.clamp(-60, 60, vel);
      const skewValue = clampedVel * 0.12;
      const scaleValue = 1 - Math.min(0.02, Math.abs(clampedVel) * 0.0002);

      skewSetter(skewValue);
      scaleSetter(scaleValue);

      columnRefs.current.forEach((col, idx) => {
        if (!col) return;
        const factor = ((idx % 3) - 1) * 0.25;
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
  }, [columnCount, viewMode, selectedCategoryId]);

  const getColumnCountForView = useCallback(() => {
    if (typeof window === 'undefined') return 6;
    const w = window.innerWidth;
    if (viewMode === 'compact') {
      if (w >= 1536) return 12;
      if (w >= 1280) return 10;
      if (w >= 1024) return 8;
      if (w >= 768) return 6;
      return 4;
    } else if (viewMode === 'focus') {
      if (w >= 1024) return 3;
      if (w >= 640) return 2;
      return 1;
    } else {
      if (w >= 1536) return 6;
      if (w >= 1280) return 5;
      if (w >= 1024) return 4;
      if (w >= 768) return 3;
      return 2;
    }
  }, [viewMode]);

  useEffect(() => {
    const handleResize = () => setColumnCount(getColumnCountForView());
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [getColumnCountForView]);

  const observer = useRef<IntersectionObserver | null>(null);

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [loadedItems, loadedCategories, loadedPinnedIds] = await Promise.all([loadGalleryItems(), loadCategories(), loadPinnedItemIds()]);
      setItems(loadedItems);
      setCategories(loadedCategories);
      setPinnedItemIds(loadedPinnedIds);
    } catch (error) {
      console.error("Library load failure:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  const handleAddItem = async (type: 'image' | 'video', urls: string[], sources: string[], categoryId?: string, title?: string, tags?: string[], notes?: string, prompt?: string, isNsfw?: boolean) => {
    await addItemToGallery(type, urls, sources, categoryId, title, tags, notes, prompt, isNsfw);
    await refreshData();
  };

  const handleUpdateItem = async (id: string, updates: Partial<GalleryItem>) => {
    await updateItemInGallery(id, updates);
    await refreshData();
  };

  const handleDeleteItem = async (item: GalleryItem) => {
    setDetailViewItemId(null);
    await deleteItemFromGallery(item.id);
    await refreshData();
  };

  const sortedAndFilteredItems = useMemo(() => {
    let filtered = [...items];
    if (selectedCategoryId !== 'all') {
      if (selectedCategoryId === 'uncategorized') filtered = items.filter(i => !i.categoryId);
      else filtered = items.filter(i => i.categoryId === selectedCategoryId);
    }
    if (!showNsfw) { filtered = filtered.filter(i => !i.isNsfw); }
    if (mediaTypeFilter !== 'all') filtered = filtered.filter(i => i.type === mediaTypeFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(item => item.title.toLowerCase().includes(q) || (item.notes && item.notes.toLowerCase().includes(q)) || (item.tags && item.tags.some(t => t.toLowerCase().includes(q))));
    }
    const isPinned = (item: GalleryItem) => pinnedItemIds.includes(item.id);
    filtered.sort((a, b) => {
      if (selectedCategoryId === 'all') {
        if (isPinned(a) && !isPinned(b)) return -1;
        if (!isPinned(a) && isPinned(b)) return 1;
      }
      if (sortOrder === 'oldest') return a.createdAt - b.createdAt;
      if (sortOrder === 'title') return a.title.localeCompare(b.title);
      return b.createdAt - a.createdAt;
    });
    return filtered;
  }, [items, selectedCategoryId, searchQuery, sortOrder, pinnedItemIds, mediaTypeFilter, showNsfw]);

  const displayedItems = useMemo(() => sortedAndFilteredItems.slice(0, displayCount), [sortedAndFilteredItems, displayCount]);

  useEffect(() => {
    if (displayedItems.length > 0 && gridRef.current) {
      // Find all items that are not yet animated
      const items = gridRef.current.querySelectorAll('.elastic-grid-item:not(.animated)');
      if (items.length > 0) {
        gsap.fromTo(items,
          { opacity: 0, y: 50, scale: 0.9 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.8,
            stagger: 0.05,
            ease: "power3.out",
            onComplete: () => {
              items.forEach(el => el.classList.add('animated'));
            }
          }
        );
      }
    }
  }, [displayedItems]);

  const masonryColumns = useMemo(() => {
    const cols: GalleryItem[][] = Array.from({ length: columnCount }, () => []);
    displayedItems.forEach((item, index) => {
      cols[index % columnCount].push(item);
    });
    return cols;
  }, [displayedItems, columnCount]);

  const lastElementRef = useCallback((node: HTMLDivElement | null) => {
    if (isLoading) return;
    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && targetDisplayCount < sortedAndFilteredItems.length) {
        setTargetDisplayCount(prev => prev + 60);
      }
    }, { rootMargin: '0px 0px 2500px 0px' });

    if (node) observer.current.observe(node);
  }, [isLoading, sortedAndFilteredItems.length, targetDisplayCount]);

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
            count: items.filter(i => i.categoryId === cat.id).length,
            children: subTree
          });
        }
      }
      return results;
    };

    const rootItems = buildTree(undefined);
    const globalVaultMatches = !q || 'All Folders'.toLowerCase().includes(q);
    const uncategorizedMatches = !q || 'Uncategorized'.toLowerCase().includes(q);

    const tree: TreeViewItem[] = [];
    if (globalVaultMatches) tree.push({ id: 'all', name: 'All Folders', icon: 'app' as const, count: items.length });
    tree.push(...rootItems);
    if (uncategorizedMatches) tree.push({ id: 'uncategorized', name: 'Uncategorized', icon: 'inbox' as const, count: items.filter(i => !i.categoryId).length });

    return tree;
  }, [categories, items, categorySearchQuery]);

  const currentCategoryName = useMemo(() => {
    if (selectedCategoryId === 'all') return 'Image Library';
    if (selectedCategoryId === 'uncategorized') return 'Uncategorized';
    return categories.find(c => c.id === selectedCategoryId)?.name || 'Image Library';
  }, [selectedCategoryId, categories]);

  const parentCategoryName = useMemo(() => {
    if (selectedCategoryId === 'all' || selectedCategoryId === 'uncategorized') return 'Media Gallery';
    const currentCat = categories.find(c => c.id === selectedCategoryId);
    if (!currentCat || !currentCat.parentId) return 'Media Gallery';
    return categories.find(c => c.id === currentCat.parentId)?.name || 'Media Gallery';
  }, [selectedCategoryId, categories]);

  if (isLoading && items.length === 0) {
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
          <aside className={`relative z-20 flex-shrink-0 transition-all duration-300 ease-in-out flex flex-col overflow-visible ${isCategoryPanelCollapsed ? 'w-0 p-0' : 'w-96 p-[3px] corner-frame'}`}>
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
                    className="form-input w-full h-full bg-transparent border-none focus:outline-none focus:ring-0 pl-12 pr-10 text-[11px] tracking-widest"
                  />
                  {categorySearchQuery && (
                    <button
                      onClick={() => { audioService.playClick(); setCategorySearchQuery(''); }}
                      className="absolute right-7 btn btn-xs btn-ghost btn-circle text-error opacity-40 hover:opacity-100 transition-opacity"
                    >
                      <CloseIcon className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-grow overflow-y-auto p-6 w-full">
                <TreeView items={treeItems} selectedId={selectedCategoryId} onSelect={setSelectedCategoryId} searchActive={!!categorySearchQuery} />
              </div>
            </div>
            </div>
          </aside>
          <main className="relative z-10 flex-1 flex flex-col h-full overflow-visible min-w-0 p-[3px] corner-frame">
            <div className="flex flex-col h-full w-full bg-base-100/50 backdrop-blur-xl relative overflow-hidden">
              <div className="flex flex-col h-full w-full overflow-hidden relative z-10">
              {detailViewItemId && (
                <ItemDetailView
                  items={sortedAndFilteredItems} currentIndex={sortedAndFilteredItems.findIndex(i => i.id === detailViewItemId)} isPinned={pinnedItemIds.includes(detailViewItemId)} categories={categories} onClose={() => setDetailViewItemId(null)} onUpdate={handleUpdateItem} onDelete={(i) => setItemToDelete(i)} onTogglePin={(id) => { const n = pinnedItemIds.includes(id) ? pinnedItemIds.filter(pid => pid !== id) : [id, ...pinnedItemIds]; setPinnedItemIds(n); savePinnedItemIds(n); }} onNavigate={(idx) => setDetailViewItemId(sortedAndFilteredItems[idx].id)} showGlobalFeedback={showGlobalFeedback}
                />
              )}


              <div className={`flex flex-col h-full overflow-hidden transition-all duration-300 ${detailViewItemId ? 'blur-sm pointer-events-none' : ''}`}>
                <div className="relative flex-grow overflow-hidden">
                  <div ref={scrollerRef} className="h-full w-full overflow-y-auto">
                    <header className="bg-transparent">
                      <div className="p-4 md:p-6">
                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                          <div className="space-y-1">
                            <span className="text-[10px] font-black uppercase tracking-[0.6em] text-primary/60 block">{parentCategoryName}</span>
                            <h1 className="text-3xl lg:text-4xl font-black tracking-tighter text-base-content leading-none uppercase font-mono">
                              {currentCategoryName}<span className="text-primary">.</span>
                            </h1>
                          </div>
                          <div className="flex">
                            <div className="px-6 py-2 flex flex-col items-center justify-center">
                              <span className="text-3xl font-black tracking-tighter leading-none">{sortedAndFilteredItems.length}</span>
                              <span className="text-[8px] uppercase font-black text-base-content/30 tracking-[0.2em] mt-1">Images</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </header>

                    <div className="sticky top-0 z-30 bg-base-100/40 backdrop-blur-xl h-14 panel-transparent">
                      <div className="flex items-stretch h-full w-full">
                        <div className="flex-grow flex items-center relative">
                          <SearchIcon className="absolute left-6 w-4 h-4 opacity-20 pointer-events-none" />
                          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="SEARCH IMAGES..." className="form-input input-lg w-full h-full bg-transparent border-none focus:outline-none focus:ring-0 pl-14 pr-12" />
                          {searchQuery && (
                            <button
                              onClick={() => { audioService.playClick(); setSearchQuery(''); }}
                              className="absolute right-4 btn btn-xs btn-ghost btn-circle text-error opacity-40 hover:opacity-100 transition-opacity"
                            >
                              <CloseIcon className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {/* NSFW Toggle */}
                        <div className="flex items-center gap-3 px-6 border-x border-white/10 bg-white/5 mr-px">
                          <span className="text-[10px] font-black uppercase text-base-content/40 tracking-widest">NSFW</span>
                          <input
                            type="checkbox"
                            checked={showNsfw}
                            onChange={(e) => { audioService.playClick(); setShowNsfw(e.target.checked); }}
                            className="toggle toggle-xs toggle-primary border border-white/20"
                          />
                        </div>

                        {/* View Modes and Media Filters */}
                        <div className="flex items-stretch">
                          {/* View Modes */}
                          <div className="form-tab-group h-full rounded-none">
                            <button onClick={() => { audioService.playClick(); setViewMode('compact'); }} className={`btn btn-xs btn-ghost h-full border-none rounded-none px-6 font-black text-[10px] tracking-widest uppercase btn-snake ${viewMode === 'compact' ? 'active bg-primary/10 text-primary no-glow' : 'hover:no-glow'}`}>
                              <span /><span /><span /><span />
                              SML
                            </button>
                            <button onClick={() => { audioService.playClick(); setViewMode('default'); }} className={`btn btn-xs btn-ghost h-full border-none rounded-none px-6 font-black text-[10px] tracking-widest uppercase btn-snake ${viewMode === 'default' ? 'active bg-primary/10 text-primary no-glow' : 'hover:no-glow'}`}>
                              <span /><span /><span /><span />
                              MED
                            </button>
                            <button onClick={() => { audioService.playClick(); setViewMode('focus'); }} className={`btn btn-xs btn-ghost h-full border-none rounded-none px-6 font-black text-[10px] tracking-widest uppercase btn-snake ${viewMode === 'focus' ? 'active bg-primary/10 text-primary no-glow' : 'hover:no-glow'}`}>
                              <span /><span /><span /><span />
                              LRG
                            </button>
                          </div>

                          {/* Media Type Filters */}
                          <div className="form-tab-group h-full rounded-none">
                            <button onClick={() => { audioService.playClick(); setMediaTypeFilter('all'); }} className={`btn btn-xs btn-ghost h-full border-none rounded-none px-6 font-black text-[10px] tracking-widest uppercase btn-snake ${mediaTypeFilter === 'all' ? 'active bg-primary/10 text-primary no-glow' : 'hover:no-glow'}`}>
                              <span /><span /><span /><span />
                              ALL
                            </button>
                            <button onClick={() => { audioService.playClick(); setMediaTypeFilter('image'); }} className={`btn btn-xs btn-ghost h-full border-none rounded-none px-6 font-black text-[10px] tracking-widest uppercase btn-snake ${mediaTypeFilter === 'image' ? 'active bg-primary/10 text-primary no-glow' : 'hover:no-glow'}`}>
                              <span /><span /><span /><span />
                              IMG
                            </button>
                            <button onClick={() => { audioService.playClick(); setMediaTypeFilter('video'); }} className={`btn btn-xs btn-ghost h-full border-none rounded-none px-6 font-black text-[10px] tracking-widest uppercase btn-snake ${mediaTypeFilter === 'video' ? 'active bg-primary/10 text-primary no-glow' : 'hover:no-glow'}`}>
                              <span /><span /><span /><span />
                              VID
                            </button>
                          </div>
                        </div>

                        <button onClick={() => { audioService.playClick(); setIsAddModalOpen(true); }} className="btn btn-sm btn-primary h-full rounded-none border-none px-8 tracking-widest uppercase btn-snake-primary">
                          <span /><span /><span /><span />
                          IMPORT
                        </button>
                      </div>
                    </div>

                    {sortedAndFilteredItems.length > 0 ? (
                      <div key={`grid-${viewMode}-${columnCount}-${selectedCategoryId}`} ref={gridRef} className="flex gap-px elastic-grid-container bg-transparent" style={{ willChange: 'transform' }}>
                        {masonryColumns.map((col, colIdx) => (
                          <div key={`col-${colIdx}`} ref={el => { columnRefs.current[colIdx] = el; }} className="flex-1 flex flex-col gap-px" style={{ contain: 'layout paint' }}>
                            {col.map(item => (
                              <div key={item.id} data-item-id={item.id} className={`elastic-grid-item`}>
                                <ImageCard
                                  item={item}
                                  viewMode={viewMode}
                                  isPinned={pinnedItemIds.includes(item.id)}
                                  onOpenDetailView={() => setDetailViewItemId(item.id)}
                                  categoryName={categories.find(c => c.id === item.categoryId)?.name || 'Uncategorized'}
                                  showCategory={selectedCategoryId === 'all'}
                                />
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-32 flex flex-col items-center opacity-10"><h3 className="text-xl font-black uppercase tracking-tighter">No items found</h3></div>
                    )}
                    {targetDisplayCount < sortedAndFilteredItems.length && (
                      <div ref={lastElementRef} className="py-20 flex justify-center bg-transparent"><span className="loading loading-spinner loading-md opacity-20"></span></div>
                    )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </motion.section>

      <AddItemModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onAddItem={handleAddItem} categories={categories} />
      {itemToDelete && (
        <ConfirmationModal isOpen={!!itemToDelete} onClose={() => setItemToDelete(null)} onConfirm={() => { handleDeleteItem(itemToDelete); setItemToDelete(null); }} title="DELETE ITEM" message={`Permanently delete "${itemToDelete.title}"?`} />
      )}
    </>
  );
};

export default ImageGallery;