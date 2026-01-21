import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { GalleryItem, GalleryCategory } from '../types';
import { loadGalleryItems, addItemToGallery, updateItemInGallery, deleteItemFromGallery, loadPinnedItemIds, savePinnedItemIds, loadCategories } from '../utils/galleryStorage';
import { fileSystemManager } from '../utils/fileUtils';
import ImageCard from './ImageCard';
import TreeView, { TreeViewItem } from './TreeView';
import { ArrowsUpDownIcon, PhotoIcon } from './icons';
import CategoryPanelToggle from './CategoryPanelToggle';
import ItemDetailView from './ItemDetailView';
import ConfirmationModal from './ConfirmationModal';
import LoadingSpinner from './LoadingSpinner';
import AddItemModal from './AddItemModal';

interface ImageGalleryProps {
  isCategoryPanelCollapsed: boolean;
  onToggleCategoryPanel: () => void;
  isSidebarPinned: boolean;
  showGlobalFeedback: (message: string, isError?: boolean) => void;
}

const getColumnCount = (isSidebarPinned: boolean) => {
    if (typeof window === 'undefined') return 2;
    const sidebarWidth = 384; // Corresponding to w-96
    const isDesktop = (window as any).innerWidth >= 1024;
    const effectiveWidth = isSidebarPinned && isDesktop ? (window as any).innerWidth - sidebarWidth : (window as any).innerWidth;
    if (effectiveWidth >= 1536) return 6;
    if (effectiveWidth >= 1280) return 5;
    if (effectiveWidth >= 1024) return 4;
    if (effectiveWidth >= 768) return 3;
    return 2;
};

const ImageGallery: React.FC<ImageGalleryProps> = ({ isCategoryPanelCollapsed, onToggleCategoryPanel, isSidebarPinned, showGlobalFeedback }) => {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [categories, setCategories] = useState<GalleryCategory[]>([]);
  const [pinnedItemIds, setPinnedItemIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'title'>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'video'>('all');
  const [columnCount, setColumnCount] = useState(() => getColumnCount(isSidebarPinned));
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [detailViewItemId, setDetailViewItemId] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<GalleryItem | null>(null);

  // --- Pagination / Lazy Load State ---
  const [displayCount, setDisplayCount] = useState(20);
  const observer = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const handleResize = () => setColumnCount(getColumnCount(isSidebarPinned));
    if (typeof window !== 'undefined') {
        (window as any).addEventListener('resize', handleResize);
        handleResize();
        return () => (window as any).removeEventListener('resize', handleResize);
    }
  }, [isSidebarPinned]);

  const refreshData = useCallback(async () => {
      setIsLoading(true);
      try {
        const [loadedItems, loadedCategories, loadedPinnedIds] = await Promise.all([loadGalleryItems(), loadCategories(), loadPinnedItemIds()]);
        setItems(loadedItems);
        setCategories(loadedCategories);
        setPinnedItemIds(loadedPinnedIds);
      } catch (error) {
          setLoadError("Ensure storage is selected in Settings.");
      } finally {
          setIsLoading(false);
      }
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  // Reset pagination when filters change
  useEffect(() => {
      setDisplayCount(20);
  }, [selectedCategoryId, searchQuery, sortOrder, mediaTypeFilter]);
  
  const handleAddItem = async (type: 'image' | 'video', urls: string[], sources: string[], categoryId?: string, title?: string, tags?: string[], notes?: string) => {
    await addItemToGallery(type, urls, sources, categoryId, title, tags, notes);
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

  const treeItems = useMemo<TreeViewItem[]>(() => {
    const buildTree = (parentId?: string): TreeViewItem[] => {
        return categories
            .filter(cat => cat.parentId === parentId)
            .map(cat => ({
                id: cat.id,
                name: cat.name,
                icon: 'folder',
                count: items.filter(i => i.categoryId === cat.id).length,
                children: buildTree(cat.id)
            }));
    };
    
    return [
        { id: 'all', name: 'Global Archive', icon: 'app', count: items.filter(i => !i.isNsfw).length },
        ...buildTree(undefined),
        { id: 'uncategorized', name: 'Uncategorized', icon: 'inbox', count: items.filter(i => !i.categoryId && !i.isNsfw).length },
    ];
  }, [items, categories]);
  
  const sortedAndFilteredItems = useMemo(() => {
    let filtered;
    if (selectedCategoryId === 'all') filtered = items.filter(i => !i.isNsfw);
    else if (selectedCategoryId === 'uncategorized') filtered = items.filter(i => !i.categoryId && !i.isNsfw);
    else filtered = items.filter(i => i.categoryId === selectedCategoryId);
    
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
  }, [items, selectedCategoryId, searchQuery, sortOrder, pinnedItemIds, mediaTypeFilter]);

  const displayedItems = useMemo(() => {
      return sortedAndFilteredItems.slice(0, displayCount);
  }, [sortedAndFilteredItems, displayCount]);

  const columns = useMemo(() => {
    const cols: GalleryItem[][] = Array.from({ length: columnCount }, () => []);
    displayedItems.forEach((item, index) => cols[index % columnCount].push(item));
    return cols;
  }, [displayedItems, columnCount]);

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

  if (isLoading && items.length === 0) return <div className="flex-grow flex items-center justify-center"><LoadingSpinner /></div>;

  return (
    <>
      <section className="flex flex-row h-full">
        <aside className={`relative flex-shrink-0 bg-base-100 border-r border-base-300 transition-all duration-300 ease-in-out ${isCategoryPanelCollapsed ? 'w-0' : 'w-96'}`}>
          <CategoryPanelToggle isCollapsed={isCategoryPanelCollapsed} onToggle={onToggleCategoryPanel} />
          <div className={`h-full overflow-y-auto p-4 transition-opacity duration-200 ${isCategoryPanelCollapsed ? 'opacity-0' : 'opacity-100'}`}>
              <h2 className="px-3 pt-2 pb-2 text-[10px] font-black text-base-content/30 uppercase tracking-widest">Navigation</h2>
              <TreeView items={treeItems} selectedId={selectedCategoryId} onSelect={setSelectedCategoryId} />
          </div>
        </aside>

        <main className="relative flex-grow flex flex-col h-full overflow-hidden">
          {items.length === 0 ? (
              <div className="text-center py-16 px-6 flex flex-col items-center justify-center h-full opacity-20">
                  <PhotoIcon className="mx-auto h-20 w-20 text-base-content" />
                  <h3 className="mt-6 text-2xl font-black uppercase tracking-tighter">Repository Empty</h3>
                  <div className="mt-8">
                      <button onClick={() => setIsAddModalOpen(true)} className="btn btn-primary btn-sm rounded-none font-black tracking-widest">IMPORT RELIC</button>
                  </div>
              </div>
          ) : (
              <>
                  <div className="flex-shrink-0 bg-base-100 px-6 py-4 border-b border-base-300 flex flex-wrap items-center gap-4">
                      <div className="flex-grow flex items-center gap-3">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></div>
                          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery((e.currentTarget as any).value)} placeholder="Filter sequence..." className="input input-ghost w-full input-sm font-bold uppercase tracking-tight placeholder:opacity-20" />
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                          <select value={sortOrder} onChange={(e) => setSortOrder((e.currentTarget as any).value as any)} className="select select-bordered select-sm rounded-none text-[10px] font-black uppercase tracking-widest"><option value="newest">Recent</option><option value="oldest">Oldest</option><option value="title">A-Z</option></select>
                           <div className="join">
                              <button onClick={() => setMediaTypeFilter('all')} className={`btn btn-xs join-item rounded-none px-4 font-black text-[9px] ${mediaTypeFilter === 'all' ? 'btn-active' : ''}`}>ALL</button>
                              <button onClick={() => setMediaTypeFilter('image')} className={`btn btn-xs join-item rounded-none px-4 font-black text-[9px] ${mediaTypeFilter === 'image' ? 'btn-active' : ''}`}>IMG</button>
                              <button onClick={() => setMediaTypeFilter('video')} className={`btn btn-xs join-item rounded-none px-4 font-black text-[9px] ${mediaTypeFilter === 'video' ? 'btn-active' : ''}`}>VID</button>
                          </div>
                          <button onClick={() => setIsAddModalOpen(true)} className="btn btn-primary btn-sm rounded-none font-black tracking-widest text-[10px]">IMPORT</button>
                      </div>
                  </div>
                  <div className="flex-grow overflow-y-auto custom-scrollbar bg-base-300">
                    <div className={`transition-all duration-300 ${detailViewItemId ? 'blur-sm pointer-events-none' : ''}`}>
                        <div className="flex gap-px">
                            {columns.map((columnItems, colIndex) => (
                                <div key={colIndex} className="flex flex-1 flex-col gap-px">
                                    {columnItems.map(item => (
                                        <ImageCard key={item.id} item={item} onOpenDetailView={() => setDetailViewItemId(item.id)} onDeleteItem={() => setItemToDelete(item)} onTogglePin={(id) => { const n = pinnedItemIds.includes(id) ? pinnedItemIds.filter(p=>p!==id) : [...pinnedItemIds, id]; setPinnedItemIds(n); savePinnedItemIds(n); }} isPinned={pinnedItemIds.includes(item.id)} />
                                    ))}
                                </div>
                            ))}
                        </div>
                        {/* Sentinel element for infinite scroll */}
                        {displayedItems.length < sortedAndFilteredItems.length && (
                            <div ref={lastElementRef} className="py-20 flex justify-center">
                                <span className="loading loading-spinner loading-md opacity-20"></span>
                            </div>
                        )}
                    </div>
                    {detailViewItemId && (
                        <ItemDetailView items={sortedAndFilteredItems} currentIndex={sortedAndFilteredItems.findIndex(i => i.id === detailViewItemId)} isPinned={pinnedItemIds.includes(detailViewItemId)} categories={categories} onClose={() => setDetailViewItemId(null)} onUpdate={handleUpdateItem} onDelete={(item) => setItemToDelete(item)} onTogglePin={(id) => { const n = pinnedItemIds.includes(id) ? pinnedItemIds.filter(p=>p!==id) : [...pinnedItemIds, id]; setPinnedItemIds(n); savePinnedItemIds(n); }} onNavigate={(idx) => setDetailViewItemId(sortedAndFilteredItems[idx].id)} showGlobalFeedback={showGlobalFeedback} />
                    )}
                  </div>
              </>
          )}
        </main>
      </section>
      <AddItemModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onAddItem={handleAddItem} categories={categories} />
      {itemToDelete && <ConfirmationModal isOpen={!!itemToDelete} onClose={() => setItemToDelete(null)} onConfirm={() => { handleDeleteItem(itemToDelete); setItemToDelete(null); }} title={`Purge sequence`} message={`Permanently erase artifact "${itemToDelete.title}"?`} />}
    </>
  );
};

export default ImageGallery;