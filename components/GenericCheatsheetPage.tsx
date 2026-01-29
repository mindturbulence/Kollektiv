import React, { useState, useMemo, useEffect, ComponentType, useRef } from 'react';
import type { CheatsheetCategory, CheatsheetItem } from '../types';
import TreeView, { TreeViewItem } from './TreeView';
import CategoryPanelToggle from './CategoryPanelToggle';
import LoadingSpinner from './LoadingSpinner';
import CheatsheetDetailView from './CheatsheetDetailView';
import { SearchIcon, CloseIcon } from './icons';

interface GenericCheatsheetPageProps {
  title: string;
  subtitle?: string;
  heroText: string;
  searchPlaceholder: string;
  loadDataFn: () => Promise<CheatsheetCategory[]>;
  updateDataFn: (itemId: string, updates: Partial<CheatsheetItem>) => Promise<CheatsheetCategory[]>;
  CardComponent: ComponentType<{ 
    item: CheatsheetItem; 
    onUpdateImages: (newImageUrls: string[]) => void;
    onSelectItem: (item: CheatsheetItem) => void;
    onInject: (item: CheatsheetItem) => void;
  }>;
  onSendToPromptsPage?: (item: CheatsheetItem, category: string) => void;
  isCategoryPanelCollapsed: boolean;
  onToggleCategoryPanel: () => void;
  isSidebarPinned: boolean;
  EmptyIcon: ComponentType<React.SVGProps<SVGSVGElement>>;
  layout?: 'grid' | 'article';
}

const getColumnCount = () => {
    if (typeof window === 'undefined') return 1;
    const w = window.innerWidth;
    if (w >= 1536) return 4;
    if (w >= 1280) return 3;
    if (w >= 1024) return 3;
    if (w >= 768) return 2;
    return 1;
};

export const GenericCheatsheetPage: React.FC<GenericCheatsheetPageProps> = ({
  title,
  heroText,
  subtitle,
  searchPlaceholder,
  loadDataFn,
  updateDataFn,
  CardComponent,
  onSendToPromptsPage,
  isCategoryPanelCollapsed,
  onToggleCategoryPanel,
  isSidebarPinned,
  EmptyIcon,
  layout = 'grid',
}) => {
  const [data, setData] = useState<CheatsheetCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [columnCount, setColumnCount] = useState(() => getColumnCount());
  const [detailViewItemId, setDetailViewItemId] = useState<string | null>(null);
  const mainContentRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleResize = () => setColumnCount(getColumnCount());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const loadedData = await loadDataFn();
        setData(loadedData);
      } catch (e) {
        setError("Failed to load cheatsheet data.");
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [loadDataFn]);

  // --- Recursive Tree Filtering for Cheatsheets ---
  const treeItems = useMemo<TreeViewItem[]>(() => {
    const totalItems = data.reduce((acc, cat) => acc + cat.items.length, 0);
    const q = categorySearchQuery.toLowerCase().trim();

    const categoryNodes: TreeViewItem[] = data
      .filter(cat => !q || cat.category.toLowerCase().includes(q))
      .map(cat => ({
        id: cat.category,
        name: cat.category,
        icon: 'folder' as const,
        count: cat.items.length,
      }));

    const tree: TreeViewItem[] = [];
    
    // Always include Global Archive if it matches or search is empty
    if (!q || 'Global Archive'.toLowerCase().includes(q)) {
        tree.push({ id: 'all', name: 'Global Archive', icon: 'app' as const, count: totalItems });
    }
    
    tree.push(...categoryNodes.sort((a, b) => a.name.localeCompare(b.name)));
    return tree;
  }, [data, categorySearchQuery]);

  const displayHeroTitle = useMemo(() => {
    if (selectedCategoryId === 'all') return heroText;
    const selectedCat = data.find(c => c.category === selectedCategoryId);
    return selectedCat ? selectedCat.category : heroText;
  }, [selectedCategoryId, data, heroText]);

  const filteredData = useMemo(() => {
    let categoriesToShow = data;
    if (selectedCategoryId !== 'all') {
      categoriesToShow = data.filter(cat => cat.category === selectedCategoryId);
    }

    if (searchQuery.trim() === '') {
      return categoriesToShow;
    }

    const lowerCaseQuery = searchQuery.toLowerCase();
    return categoriesToShow
      .map(category => ({
        ...category,
        items: category.items.filter(item =>
          item.name.toLowerCase().includes(lowerCaseQuery) ||
          item.description?.toLowerCase().includes(lowerCaseQuery) ||
          item.keywords?.some(k => k.toLowerCase().includes(lowerCaseQuery))
        ),
      }))
      .filter(category => category.items.length > 0);
  }, [data, selectedCategoryId, searchQuery]);

  const allItems = useMemo(() => {
    return filteredData.flatMap(category => category.items);
  }, [filteredData]);

  const columns = useMemo(() => {
    const cols: CheatsheetItem[][] = Array.from({ length: columnCount }, () => []);
    allItems.forEach((item, index) => cols[index % columnCount].push(item));
    return cols;
  }, [allItems, columnCount]);

  const activeDetailViewIndex = useMemo(() => {
    if (!detailViewItemId) return -1;
    return allItems.findIndex(item => item.id === detailViewItemId);
  }, [detailViewItemId, allItems]);

  const isDetailViewVisible = activeDetailViewIndex !== -1;

  const handleUpdateItem = async (itemId: string, updates: Partial<CheatsheetItem>) => {
    const updatedData = await updateDataFn(itemId, updates);
    setData(updatedData);
  };
  
  const handleSelectCategory = (id: string) => {
    setSelectedCategoryId(id);
    setDetailViewItemId(null); // Force close detail view when switching categories
    if(mainContentRef.current) {
        mainContentRef.current.scrollTop = 0;
    }
  };

  const handleInject = (item: CheatsheetItem) => {
      const category = data.find(c => c.items.some(i => i.id === item.id))?.category || 'Uncategorized';
      onSendToPromptsPage?.(item, category);
  };

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
                        placeholder="FIND DATASET..." 
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
                    onSelect={handleSelectCategory} 
                    searchActive={!!categorySearchQuery}
                />
            </div>
        </div>
      </aside>

      <main ref={mainContentRef} className={`relative flex-grow flex flex-col h-full overflow-x-hidden bg-base-100 scroll-smooth custom-scrollbar ${isDetailViewVisible ? 'overflow-y-hidden' : 'overflow-y-auto'}`}>
        {isDetailViewVisible && (
            <CheatsheetDetailView 
                items={allItems}
                currentIndex={activeDetailViewIndex}
                onClose={() => setDetailViewItemId(null)}
                onNavigate={(idx) => setDetailViewItemId(allItems[idx].id)}
                onInject={handleInject}
                onUpdateItem={handleUpdateItem}
            />
        )}

        {isLoading ? (
            <div className="flex-grow flex items-center justify-center bg-base-100">
                <LoadingSpinner />
            </div>
        ) : error ? (
            <div className="p-8">
                <div className="alert alert-error rounded-none border-2"><span>{error}</span></div>
            </div>
        ) : (
            <>
                <section className="p-10 border-b border-base-300 bg-base-200/20">
                    <div className="w-full flex flex-col gap-1">
                        <div className="flex flex-col md:flex-row md:items-stretch justify-between gap-6">
                            <h1 className="text-2xl lg:text-3xl font-black tracking-tighter text-base-content leading-none flex items-center uppercase">
                                {displayHeroTitle}<span className="text-primary">.</span>
                            </h1>
                            <div className="flex bg-base-100 px-6 py-2 border border-base-300 shadow-sm self-start md:self-auto min-h-full">
                                <div className="flex flex-col px-6 border-r border-base-300 last:border-r-0 justify-center">
                                    <span className="text-2xl font-black tracking-tighter leading-none">{allItems.length}</span>
                                    <span className="text-[8px] uppercase font-bold text-base-content/40 tracking-[0.2em] mt-0.5">Artifacts</span>
                                </div>
                            </div>
                        </div>
                        <p className="text-[11px] font-bold text-base-content/30 uppercase tracking-[0.3em] w-full">
                            {subtitle || "Curated repository of high-utility visual formulas and creative tokens."}
                        </p>
                    </div>
                </section>

                <div className="flex-shrink-0 bg-base-100 border-b border-base-300 sticky top-0 z-20 h-14">
                    <div className="flex items-stretch h-full w-full">
                        <div className="flex-grow flex items-center relative">
                            <SearchIcon className="absolute left-6 w-4 h-4 opacity-20 pointer-events-none" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={searchPlaceholder.toUpperCase()}
                                className="w-full h-full bg-transparent border-none focus:outline-none focus:ring-0 pl-14 pr-6 font-bold uppercase tracking-tight text-sm placeholder:text-base-content/10"
                            />
                        </div>
                    </div>
                </div>
                
                <div className="flex-grow p-0 bg-base-200/5 min-h-[400px] relative">
                  {allItems.length > 0 ? (
                    layout === 'grid' ? (
                        <div className={`flex border-r border-base-300 transition-all duration-300 ${isDetailViewVisible ? 'blur-sm pointer-events-none' : ''}`}>
                            {columns.map((columnItems, colIndex) => (
                                <div key={colIndex} className="flex flex-1 flex-col gap-0 min-w-0 border-l border-base-300 first:border-l-0">
                                    {columnItems.map(item => (
                                        <div key={item.id}>
                                            <CardComponent 
                                                item={item} 
                                                onUpdateImages={(newImageUrls: string[]) => handleUpdateItem(item.id, { imageUrls: newImageUrls })} 
                                                onSelectItem={(i) => setDetailViewItemId(i.id)}
                                                onInject={handleInject}
                                            />
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className={`space-y-12 py-10 px-10 transition-all duration-300 ${isDetailViewVisible ? 'blur-sm pointer-events-none' : ''}`}>
                        {filteredData.map(category => (
                            <section key={category.category} id={category.category}>
                            <h2 className="text-xs font-black uppercase tracking-[0.4em] text-base-content/40 mb-10 flex items-center gap-4">
                                <span className="w-10 h-[1px] bg-base-300"></span> {category.category}
                            </h2>
                            <div className="space-y-12 divide-y divide-base-300">
                                {category.items.map(item => (
                                <div key={item.id} className={'pt-12 first:pt-0'}>
                                    <CardComponent 
                                        item={item} 
                                        onUpdateImages={(newUrls) => handleUpdateItem(item.id, { imageUrls: newUrls })} 
                                        onSelectItem={(i) => setDetailViewItemId(i.id)}
                                        onInject={handleInject}
                                    />
                                </div>
                                ))}
                            </div>
                            </section>
                        ))}
                        </div>
                    )
                  ) : (
                    <div className="text-center py-32 px-6 flex flex-col items-center">
                      <EmptyIcon className="mx-auto h-20 w-20 text-base-content/10" />
                      <h3 className="mt-6 text-2xl font-black uppercase tracking-tighter text-base-content/30">Registry Empty</h3>
                    </div>
                  )}
                </div>
            </>
        )}
      </main>
    </section>
  );
};