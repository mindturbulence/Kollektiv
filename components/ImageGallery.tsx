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
    if (typeof window === 'undefined') return 2; // Default for non-browser
    const sidebarWidth = 320; // w-80 is 20rem = 320px
    const isDesktop = (window as any).innerWidth >= 1024; // lg breakpoint
    const effectiveWidth = isSidebarPinned && isDesktop ? (window as any).innerWidth - sidebarWidth : (window as any).innerWidth;

    if (effectiveWidth >= 1536) return 6; // 2xl
    if (effectiveWidth >= 1280) return 5; // xl
    if (effectiveWidth >= 1024) return 4; // lg
    if (effectiveWidth >= 768) return 3; // md
    if (effectiveWidth >= 640) return 2; // sm
    return 2; // mobile
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

  useEffect(() => {
    const handleResize = () => setColumnCount(getColumnCount(isSidebarPinned));
    if (typeof window !== 'undefined') {
        (window as any).addEventListener('resize', handleResize);
        handleResize(); // Recalculate on pin state change
        return () => (window as any).removeEventListener('resize', handleResize);
    }
  }, [isSidebarPinned]);

  const refreshData = useCallback(async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [loadedItems, loadedCategories, loadedPinnedIds] = await Promise.all([
            loadGalleryItems(),
            loadCategories(),
            loadPinnedItemIds()
        ]);
        setItems(loadedItems);
        setCategories(loadedCategories);
        setPinnedItemIds(loadedPinnedIds);
      } catch (error) {
          const errorMessage = "Failed to load gallery. Please ensure a storage directory is selected in Settings.";
          console.error(errorMessage, error);
          setLoadError(errorMessage);
      } finally {
          setIsLoading(false);
      }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);
  
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

  const handleTogglePin = async (id: string) => {
    const newPinnedIds = pinnedItemIds.includes(id)
        ? pinnedItemIds.filter(pid => pid !== id)
        : [...pinnedItemIds, id];
    await savePinnedItemIds(newPinnedIds);
    setPinnedItemIds(newPinnedIds);
  };
  
  const treeItems = useMemo<TreeViewItem[]>(() => {
    const allItemsCount = items.filter(i => !i.isNsfw).length;
    const uncategorizedCount = items.filter(i => !i.categoryId && !i.isNsfw).length;
    
    const categoryNodes: TreeViewItem[] = categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        icon: 'folder',
        count: items.filter(i => i.categoryId === cat.id).length
    }));
    
    return [
        { id: 'all', name: 'All Items', icon: 'app', count: allItemsCount },
        ...categoryNodes.sort((a, b) => a.name.localeCompare(b.name)),
        { id: 'uncategorized', name: 'Uncategorized', icon: 'inbox', count: uncategorizedCount },
    ];
  }, [items, categories]);
  
  const sortedAndFilteredItems = useMemo(() => {
    let filtered;
    switch (selectedCategoryId) {
        case 'all':
            filtered = items.filter(i => !i.isNsfw);
            break;
        case 'uncategorized':
            filtered = items.filter(i => !i.categoryId && !i.isNsfw);
            break;
        default:
            filtered = items.filter(i => i.categoryId === selectedCategoryId);
    }
    
    if (mediaTypeFilter !== 'all') {
        filtered = filtered.filter(i => i.type === mediaTypeFilter);
    }

    if (searchQuery.trim()) {
        const lowerQuery = searchQuery.toLowerCase();
        filtered = filtered.filter(item => 
            item.title.toLowerCase().includes(lowerQuery) ||
            (item.notes && item.notes.toLowerCase().includes(lowerQuery)) ||
            (item.tags && item.tags.some(tag => tag.toLowerCase().includes(lowerQuery)))
        );
    }
    
    const isPinned = (item: GalleryItem) => pinnedItemIds.includes(item.id);

    filtered.sort((a, b) => {
        if (selectedCategoryId === 'all') {
            if (isPinned(a) && !isPinned(b)) return -1;
            if (!isPinned(a) && isPinned(b)) return 1;
        }

        switch(sortOrder) {
            case 'oldest': return a.createdAt - b.createdAt;
            case 'title': return a.title.localeCompare(b.title);
            case 'newest':
            default: return b.createdAt - a.createdAt;
        }
    });
    
    return filtered;
  }, [items, selectedCategoryId, searchQuery, sortOrder, pinnedItemIds, mediaTypeFilter]);

  const columns = useMemo(() => {
    const cols: GalleryItem[][] = Array.from({ length: columnCount }, () => []);
    sortedAndFilteredItems.forEach((item, index) => {
        cols[index % columnCount].push(item);
    });
    return cols;
  }, [sortedAndFilteredItems, columnCount]);

  const currentCategoryName = useMemo(() => {
      if (selectedCategoryId === 'all') return 'All Items';
      if (selectedCategoryId === 'pinned') return 'Pinned Items';
      if (selectedCategoryId === 'uncategorized') return 'Uncategorized';
      return categories.find(c => c.id === selectedCategoryId)?.name || 'Category';
  }, [selectedCategoryId, categories]);

  const detailViewIndex = useMemo(() => {
    if (!detailViewItemId) return null;
    const index = sortedAndFilteredItems.findIndex(item => item.id === detailViewItemId);
    return index > -1 ? index : null;
  }, [detailViewItemId, sortedAndFilteredItems]);


  if (isLoading) return <div className="flex-grow flex items-center justify-center"><LoadingSpinner /></div>;

  if(loadError) {
      return (
          <div className="flex flex-col items-center justify-center text-center p-4">
              <h2 className="text-xl font-bold text-error mb-2">Error</h2>
              <p className="text-base-content/70 max-w-md">{loadError}</p>
          </div>
      );
  }

  return (
    <>
      <section className="flex flex-row h-full">
        <aside className={`relative flex-shrink-0 bg-base-100 transition-all duration-300 ease-in-out ${isCategoryPanelCollapsed ? 'w-0' : 'w-80'}`}>
          <CategoryPanelToggle isCollapsed={isCategoryPanelCollapsed} onToggle={onToggleCategoryPanel} />
          <div className={`h-full overflow-y-auto p-4 transition-opacity duration-200 ${isCategoryPanelCollapsed ? 'opacity-0' : 'opacity-100'}`}>
              <h2 className="px-3 pt-2 pb-2 text-xs font-semibold text-base-content/60 uppercase tracking-wider">
                Categories
              </h2>
              <TreeView items={treeItems} selectedId={selectedCategoryId} onSelect={setSelectedCategoryId} />
          </div>
        </aside>

        <main className="relative flex-grow flex flex-col h-full overflow-hidden">
          {items.length === 0 ? (
              <div className="text-center py-16 px-6 flex flex-col items-center justify-center h-full">
                  <PhotoIcon className="mx-auto h-12 w-12 text-base-content/40" />
                  <h3 className="mt-2 text-xl font-medium text-base-content">Your Gallery is Empty</h3>
                  <p className="mt-1 text-base-content/70">
                      Add your first image or video to get started.
                  </p>
                  <div className="mt-6">
                      <button onClick={() => setIsAddModalOpen(true)} className="btn btn-primary btn-sm">
                          Add New Item
                      </button>
                  </div>
              </div>
          ) : (
              <>
                  {/* Controls Bar */}
                  <div className="flex-shrink-0 bg-base-100 px-6 py-4 border-b border-l border-base-300 flex flex-wrap items-center gap-4">
                      <div className="flex-grow">
                          <input
                              type="text"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery((e.currentTarget as any).value)}
                              placeholder={`Search in ${currentCategoryName}...`}
                              className="input input-bordered w-full input-sm"
                          />
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                          <div className="relative">
                              <select value={sortOrder} onChange={(e) => setSortOrder((e.currentTarget as any).value as 'newest' | 'oldest' | 'title')} className="select select-bordered select-sm">
                                  <option value="newest">Newest</option>
                                  <option value="oldest">Oldest</option>
                                  <option value="title">Title</option>
                              </select>
                              <ArrowsUpDownIcon className="w-4 h-4 text-base-content/40 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                           <div className="join">
                              <button onClick={() => setMediaTypeFilter('all')} className={`btn btn-sm join-item ${mediaTypeFilter === 'all' ? 'btn-active' : ''}`}>All</button>
                              <button onClick={() => setMediaTypeFilter('image')} className={`btn btn-sm join-item ${mediaTypeFilter === 'image' ? 'btn-active' : ''}`}>Images</button>
                              <button onClick={() => setMediaTypeFilter('video')} className={`btn btn-sm join-item ${mediaTypeFilter === 'video' ? 'btn-active' : ''}`}>Videos</button>
                          </div>
                          <button onClick={() => setIsAddModalOpen(true)} className="btn btn-primary btn-sm flex-shrink-0">
                              Add Item
                          </button>
                      </div>
                  </div>
                  <div className="flex-grow overflow-y-auto">
                    <div className={`p-6 transition-all duration-300 ${detailViewIndex !== null ? 'blur-sm pointer-events-none' : ''}`}>
                        {sortedAndFilteredItems.length > 0 ? (
                              <div className="flex gap-4">
                                  {columns.map((columnItems, colIndex) => (
                                      <div key={colIndex} className="flex flex-1 flex-col gap-4">
                                          {columnItems.map(item => (
                                              <ImageCard
                                                  key={item.id}
                                                  item={item}
                                                  onOpenDetailView={() => setDetailViewItemId(item.id)}
                                                  onDeleteItem={() => setItemToDelete(item)}
                                                  onTogglePin={handleTogglePin}
                                                  isPinned={pinnedItemIds.includes(item.id)}
                                              />
                                          ))}
                                      </div>
                                  ))}
                              </div>
                          ) : (
                              <div className="text-center py-16">
                                  <h3 className="text-lg font-medium">No items found</h3>
                                  <p className="text-base-content/70">Try adjusting your search or filters.</p>
                              </div>
                          )}
                    </div>
                     {detailViewItemId && detailViewIndex !== null && (
                        <ItemDetailView
                            items={sortedAndFilteredItems}
                            currentIndex={detailViewIndex!}
                            isPinned={pinnedItemIds.includes(detailViewItemId!)}
                            categories={categories}
                            onClose={() => setDetailViewItemId(null)}
                            onUpdate={handleUpdateItem}
                            onDelete={(item) => setItemToDelete(item)}
                            onTogglePin={handleTogglePin}
                            onNavigate={(newIndex) => {
                                const newItem = sortedAndFilteredItems[newIndex];
                                if(newItem) setDetailViewItemId(newItem.id);
                            }}
                            showGlobalFeedback={showGlobalFeedback}
                        />
                    )}
                  </div>
              </>
          )}
        </main>
      </section>

      <AddItemModal 
          isOpen={isAddModalOpen} 
          onClose={() => setIsAddModalOpen(false)} 
          onAddItem={handleAddItem}
          categories={categories}
      />
      
      {itemToDelete && (
          <ConfirmationModal 
              isOpen={!!itemToDelete}
              onClose={() => setItemToDelete(null)}
              onConfirm={() => { handleDeleteItem(itemToDelete); setItemToDelete(null); }}
              title={`Delete "${itemToDelete.title}"?`}
              message="Are you sure? This will permanently delete the item and all its media files."
          />
      )}
    </>
  );
};

export default ImageGallery;