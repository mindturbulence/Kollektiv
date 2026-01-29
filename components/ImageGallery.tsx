import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { gsap } from 'gsap';
import type { GalleryItem, GalleryCategory } from '../types';
import { loadGalleryItems, addItemToGallery, updateItemInGallery, deleteItemFromGallery, loadPinnedItemIds, savePinnedItemIds, loadCategories } from '../utils/galleryStorage';
import ImageCard from './ImageCard';
import TreeView, { TreeViewItem } from './TreeView';
import { ArrowsUpDownIcon, PhotoIcon, LayoutGridSmIcon, LayoutGridMdIcon, LayoutGridLgIcon, SearchIcon, CloseIcon, FilmIcon } from './icons';
import CategoryPanelToggle from './CategoryPanelToggle';
import ItemDetailView from './ItemDetailView';
import ConfirmationModal from './ConfirmationModal';
import LoadingSpinner from './LoadingSpinner';
import AddItemModal from './AddItemModal';
import useLocalStorage from '../utils/useLocalStorage';

interface ImageGalleryProps {
  isCategoryPanelCollapsed: boolean;
  onToggleCategoryPanel: () => void;
  isSidebarPinned: boolean;
  showGlobalFeedback: (message: string, isError?: boolean) => void;
}

type GalleryViewMode = 'compact' | 'default' | 'focus';

const ImageGallery: React.FC<ImageGalleryProps> = ({ isCategoryPanelCollapsed, onToggleCategoryPanel, isSidebarPinned, showGlobalFeedback }) => {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [categories, setCategories] = useState<GalleryCategory[]>([]);
  const [pinnedItemIds, setPinnedItemIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'title'>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'video'>('all');
  const [showNsfw, setShowNsfw] = useLocalStorage<boolean>('galleryShowNsfw', false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [detailViewItemId, setDetailViewItemId] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<GalleryItem | null>(null);
  const [viewMode, setViewMode] = useLocalStorage<GalleryViewMode>('galleryViewMode', 'default');

  // --- Layout State ---
  const [columnCount, setColumnCount] = useState(6);
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<HTMLDivElement[]>([]);

  // Force close detail view when category changes to prevent UI blocking
  useEffect(() => {
    setDetailViewItemId(null);
  }, [selectedCategoryId]);

  // --- GSAP Scroll Smoothing Engine ---
  useEffect(() => {
    const scroller = scrollerRef.current;
    const grid = gridRef.current;
    if (!scroller || !grid) return;

    let lastY = scroller.scrollTop;
    let vel = 0;
    
    // Quick setters for performance
    const skewSetter = gsap.quickSetter(grid, "skewY", "deg");
    const scaleSetter = gsap.quickSetter(grid, "scaleY");

    const updateMotion = () => {
        const currentY = scroller.scrollTop;
        const diff = currentY - lastY;
        
        // Smooth out the velocity calculation
        vel += (diff - vel) * 0.15;
        lastY = currentY;

        // Apply skew and scale based on momentum
        const skewValue = gsap.utils.clamp(-10, 10, vel * 0.12);
        const scaleValue = 1 - Math.min(0.08, Math.abs(vel) * 0.0006);

        skewSetter(skewValue);
        scaleSetter(scaleValue);

        // Apply parallax to columns
        columnRefs.current.forEach((col, idx) => {
            if (!col) return;
            const factor = (idx % 3 - 1) * 0.15; // Alternating speeds per column
            const offset = vel * factor;
            gsap.set(col, { y: offset, force3D: true });
        });

        if (Math.abs(vel) > 0.01) {
            vel *= 0.92; // Friction
        } else {
            vel = 0;
            skewSetter(0);
            scaleSetter(1);
            columnRefs.current.forEach(col => col && gsap.set(col, { y: 0 }));
        }
    };

    gsap.ticker.add(updateMotion);
    return () => gsap.ticker.remove(updateMotion);
  }, [columnCount]);

  // --- Dynamic Column Calculation ---
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

  const [displayCount, setDisplayCount] = useState(30);
  const observer = useRef<IntersectionObserver | null>(null);

  const refreshData = useCallback(async () => {
      setIsLoading(true);
      try {
        const [loadedItems, loadedCategories, loadedPinnedIds] = await Promise.all([loadGalleryItems(), loadCategories(), loadPinnedItemIds()]);
        setItems(loadedItems);
        setCategories(loadedCategories);
        setPinnedItemIds(loadedPinnedIds);
      } catch (error) {
          console.error("Gallery Refresh Error:", error);
      } finally {
          setIsLoading(false);
      }
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  const handleAddItem = async (
    type: 'image' | 'video', 
    urls: string[], 
    sources: string[], 
    categoryId?: string, 
    title?: string, 
    tags?: string[], 
    notes?: string,
    prompt?: string,
    isNsfw?: boolean
  ) => {
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

  const masonryColumns = useMemo(() => {
    const cols: GalleryItem[][] = Array.from({ length: columnCount }, () => []);
    displayedItems.forEach((item, index) => {
        cols[index % columnCount].push(item);
    });
    return cols;
  }, [displayedItems, columnCount]);

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
    const globalVaultMatches = !q || 'Global Vault'.toLowerCase().includes(q);
    const uncategorizedMatches = !q || 'Uncategorized'.toLowerCase().includes(q);

    const tree: TreeViewItem[] = [];
    if (globalVaultMatches) tree.push({ id: 'all', name: 'Global Vault', icon: 'app' as const, count: items.length });
    tree.push(...rootItems);
    if (uncategorizedMatches) tree.push({ id: 'uncategorized', name: 'Uncategorized', icon: 'inbox' as const, count: items.filter(i => !i.categoryId).length });

    return tree;
  }, [categories, items, categorySearchQuery]);

  const lastElementRef = useCallback((node: HTMLDivElement | null) => {
    if (isLoading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && displayCount < sortedAndFilteredItems.length) {
        setDisplayCount(prevCount => prevCount + 20);
      }
    });
    if (node) observer.current.observe(node);
  }, [isLoading, sortedAndFilteredItems.length, displayCount]);

  const currentCategoryName = useMemo(() => {
    if (selectedCategoryId === 'all') return 'Media Vault';
    if (selectedCategoryId === 'uncategorized') return 'Uncategorized';
    return categories.find(c => c.id === selectedCategoryId)?.name || 'Media Vault';
  }, [selectedCategoryId, categories]);

  if (isLoading && items.length === 0) {
    return <div className="h-full w-full flex items-center justify-center bg-base-100"><LoadingSpinner /></div>;
  }

  return (
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
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-base-content/30 mb-6 px-3">Gallery Index</h2>
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
        {detailViewItemId && (
          <ItemDetailView 
            items={sortedAndFilteredItems}
            currentIndex={sortedAndFilteredItems.findIndex(i => i.id === detailViewItemId)}
            isPinned={pinnedItemIds.includes(detailViewItemId)}
            categories={categories}
            onClose={() => setDetailViewItemId(null)}
            onUpdate={handleUpdateItem}
            onDelete={(i) => { setItemToDelete(i); }}
            onTogglePin={(id) => { const n = pinnedItemIds.includes(id) ? pinnedItemIds.filter(pid=>pid!==id) : [id, ...pinnedItemIds]; setPinnedItemIds(n); savePinnedItemIds(n); }}
            onNavigate={(idx) => setDetailViewItemId(sortedAndFilteredItems[idx].id)}
            showGlobalFeedback={showGlobalFeedback}
          />
        )}

        <div className={`flex flex-col h-full overflow-hidden transition-all duration-300 ${detailViewItemId ? 'blur-sm pointer-events-none' : ''}`}>
            <section className="flex-shrink-0 p-10 border-b border-base-300 bg-base-200/20">
                <div className="w-full flex flex-col gap-1">
                    <div className="flex flex-col md:flex-row md:items-stretch justify-between gap-6">
                        <h1 className="text-2xl lg:text-3xl font-black tracking-tighter text-base-content leading-none flex items-center uppercase">{currentCategoryName}<span className="text-primary">.</span></h1>
                        <div className="flex bg-base-100 px-6 py-2 border border-base-300 shadow-sm self-start md:self-auto min-h-full">
                            <div className="flex flex-col border-r border-base-300 px-6 last:border-r-0 justify-center">
                                <span className="text-2xl font-black tracking-tighter leading-none">{sortedAndFilteredItems.length}</span>
                                <span className="text-[8px] uppercase font-black text-base-content/30 tracking-[0.2em] mt-0.5">Artifacts</span>
                            </div>
                        </div>
                    </div>
                    <p className="text-[11px] font-bold text-base-content/30 uppercase tracking-[0.3em] w-full">Local visual media repository and processed generative outcomes.</p>
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
                            placeholder="SEARCH VAULT..."
                            className="w-full h-full bg-transparent border-none focus:outline-none focus:ring-0 pl-14 pr-6 font-bold uppercase tracking-tight text-sm placeholder:text-base-content/10"
                        />
                    </div>
                    <div className="flex items-stretch border-r border-base-300">
                        <div className="join h-full rounded-none bg-base-100">
                            <button onClick={() => setMediaTypeFilter('all')} className={`join-item btn btn-ghost h-full border-none rounded-none px-6 font-black uppercase text-[9px] tracking-widest ${mediaTypeFilter === 'all' ? 'bg-primary/10 text-primary' : 'opacity-40'}`}>ALL</button>
                            <button onClick={() => setMediaTypeFilter('image')} className={`join-item btn btn-ghost h-full border-none rounded-none px-6 font-black uppercase text-[9px] tracking-widest ${mediaTypeFilter === 'image' ? 'bg-primary/10 text-primary' : 'opacity-40'}`}>IMG</button>
                            <button onClick={() => setMediaTypeFilter('video')} className={`join-item btn btn-ghost h-full border-none rounded-none px-6 font-black uppercase text-[9px] tracking-widest ${mediaTypeFilter === 'video' ? 'bg-primary/10 text-primary' : 'opacity-40'}`}>VID</button>
                        </div>
                    </div>
                    <div className="flex items-center px-6 border-r border-base-300 gap-4">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <span className="text-[10px] font-black uppercase text-base-content/40 tracking-widest">NSFW</span>
                            <input type="checkbox" checked={showNsfw} onChange={(e) => setShowNsfw(e.target.checked)} className="toggle toggle-xs toggle-primary" />
                        </label>
                    </div>
                    <select
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value as any)}
                        className="select select-ghost rounded-none border-none border-r border-base-300 focus:outline-none h-full px-8 text-[10px] font-black uppercase tracking-widest bg-base-100 hover:bg-base-200"
                    >
                        <option value="newest">Recent</option>
                        <option value="oldest">Oldest</option>
                        <option value="title">A-Z</option>
                    </select>
                    <div className="join h-full border-r border-base-300 rounded-none bg-base-100">
                        <button onClick={() => setViewMode('compact')} className={`join-item btn btn-ghost h-full border-none rounded-none px-4 ${viewMode === 'compact' ? 'bg-primary/10 text-primary' : 'opacity-40'}`} title="Compact"><LayoutGridSmIcon className="w-4 h-4" /></button>
                        <button onClick={() => setViewMode('default')} className={`join-item btn btn-ghost h-full border-none rounded-none px-4 ${viewMode === 'default' ? 'bg-primary/10 text-primary' : 'opacity-40'}`} title="Default"><LayoutGridMdIcon className="w-4 h-4" /></button>
                        <button onClick={() => setViewMode('focus')} className={`join-item btn btn-ghost h-full border-none rounded-none px-4 ${viewMode === 'focus' ? 'bg-primary/10 text-primary' : 'opacity-40'}`} title="Detailed"><LayoutGridLgIcon className="w-4 h-4" /></button>
                    </div>
                    <button onClick={() => setIsAddModalOpen(true)} className="btn btn-primary rounded-none h-full border-none px-10 font-black text-[10px] tracking-[0.2em] shadow-none uppercase">IMPORT</button>
                </div>
            </div>

            <div ref={scrollerRef} className="flex-grow overflow-y-auto scroll-smooth custom-scrollbar bg-base-300">
                {items.length === 0 ? (
                    <div className="text-center py-32 flex flex-col items-center opacity-10">
                        <PhotoIcon className="mx-auto h-20 w-20" />
                        <h3 className="text-2xl font-black uppercase tracking-tighter">Vault Empty</h3>
                    </div>
                ) : sortedAndFilteredItems.length > 0 ? (
                    <div ref={gridRef} className="flex bg-base-300 border-r border-base-300 elastic-grid-container" style={{ willChange: 'transform' }}>
                        {masonryColumns.map((col, colIdx) => (
                            <div 
                                key={colIdx} 
                                ref={el => { if (el) columnRefs.current[colIdx] = el; }}
                                className="flex-1 flex flex-col gap-px border-l border-base-300 first:border-l-0"
                            >
                                {col.map(item => (
                                    <div key={item.id} data-item-id={item.id} className="elastic-grid-item">
                                        <ImageCard 
                                            item={item} 
                                            isPinned={pinnedItemIds.includes(item.id)}
                                            onOpenDetailView={() => setDetailViewItemId(item.id)}
                                            onDeleteItem={(i) => setItemToDelete(i)}
                                            onTogglePin={(id) => { const n = pinnedItemIds.includes(id) ? pinnedItemIds.filter(pid=>pid!==id) : [id, ...pinnedItemIds]; setPinnedItemIds(n); savePinnedItemIds(n); }}
                                            categoryName={categories.find(c => c.id === item.categoryId)?.name || 'Uncategorized'}
                                            showCategory={selectedCategoryId === 'all'}
                                        />
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-32 flex flex-col items-center opacity-10"><h3 className="text-xl font-black uppercase tracking-tighter">No matches in sequence</h3></div>
                )}
                {displayedItems.length < sortedAndFilteredItems.length && (
                    <div ref={lastElementRef} className="py-20 flex justify-center bg-base-100">
                        <span className="loading loading-spinner loading-md opacity-20"></span>
                    </div>
                )}
            </div>
        </div>
      </main>

      <AddItemModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onAddItem={handleAddItem} categories={categories} />
      {itemToDelete && (
          <ConfirmationModal 
            isOpen={!!itemToDelete} 
            onClose={() => setDetailViewItemId(null)} 
            onConfirm={() => { handleDeleteItem(itemToDelete); setItemToDelete(null); }} 
            title="DELETE ARTIFACT" 
            message={`Permanently erase artifact "${itemToDelete.title}"? Local files will be deleted.`} 
          />
      )}
    </section>
  );
};

export default ImageGallery;