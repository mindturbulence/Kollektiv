import React, { useState, useMemo, useEffect, ComponentType, useRef } from 'react';
import type { CheatsheetCategory, CheatsheetItem } from '../types';
import TreeView, { TreeViewItem } from './TreeView';
import CategoryPanelToggle from './CategoryPanelToggle';
import LoadingSpinner from './LoadingSpinner';
import CheatsheetDetailView from './CheatsheetDetailView';

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
    if ((window as any).matchMedia('(min-width: 1536px)').matches) return 4;
    if ((window as any).matchMedia('(min-width: 1280px)').matches) return 3;
    if ((window as any).matchMedia('(min-width: 1024px)').matches) return 3;
    if ((window as any).matchMedia('(min-width: 768px)').matches) return 2;
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
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [columnCount, setColumnCount] = useState(() => getColumnCount());
  const [detailViewItemId, setDetailViewItemId] = useState<string | null>(null);
  const mainContentRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleResize = () => setColumnCount(getColumnCount());
    if (typeof window !== 'undefined') {
        (window as any).addEventListener('resize', handleResize);
        return () => (window as any).removeEventListener('resize', handleResize);
    }
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

  const treeItems = useMemo<TreeViewItem[]>(() => {
    const totalItems = data.reduce((acc, cat) => acc + cat.items.length, 0);
    const categoryNodes: TreeViewItem[] = data.map(cat => ({
      id: cat.category,
      name: cat.category,
      icon: 'folder' as const,
      count: cat.items.length,
    }));
    return [
      { id: 'all', name: 'Global Archive', icon: 'app' as const, count: totalItems },
      ...categoryNodes.sort((a, b) => a.name.localeCompare(b.name)),
    ];
  }, [data]);

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

  const detailViewIndex = useMemo(() => {
    if (!detailViewItemId) return null;
    const index = allItems.findIndex(item => item.id === detailViewItemId);
    return index !== -1 ? index : null;
  }, [detailViewItemId, allItems]);

  const handleUpdateItem = async (itemId: string, updates: Partial<CheatsheetItem>) => {
    const updatedData = await updateDataFn(itemId, updates);
    setData(updatedData);
  };
  
  const handleSelectCategory = (id: string) => {
    setSelectedCategoryId(id);
    if(mainContentRef.current) {
        (mainContentRef.current as any).scrollTop = 0;
    }
  };

  const handleInject = (item: CheatsheetItem) => {
      const category = data.find(c => c.items.some(i => i.id === item.id))?.category || 'Uncategorized';
      onSendToPromptsPage?.(item, category);
  };

  const currentCategoryCount = allItems.length;

  return (
    <section className="flex flex-row h-full bg-base-100 overflow-hidden">
      <aside className={`relative flex-shrink-0 bg-base-100 border-r border-base-300 transition-all duration-300 ease-in-out ${isCategoryPanelCollapsed ? 'w-0' : 'w-96'}`}>
        <CategoryPanelToggle isCollapsed={isCategoryPanelCollapsed} onToggle={onToggleCategoryPanel} />
        <div className={`h-full overflow-hidden transition-opacity duration-200 ${isCategoryPanelCollapsed ? 'opacity-0 invisible' : 'opacity-100 visible'}`}>
            <div className="h-full overflow-y-auto p-6 w-96">
                <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-base-content/30 mb-6 px-3">Registry Index</h2>
                <TreeView items={treeItems} selectedId={selectedCategoryId} onSelect={handleSelectCategory} />
            </div>
        </div>
      </aside>

      <main ref={mainContentRef} className="relative flex-grow flex flex-col h-full overflow-y-auto overflow-x-hidden bg-base-100 scroll-smooth custom-scrollbar">
        {/* Artifact Hero Section */}
        <section className="p-10 lg:p-16 border-b border-base-300 bg-base-200/20">
            <div className="max-w-screen-2xl mx-auto flex flex-col md:flex-row items-end justify-between gap-12">
                <div className="flex-1">
                    <h1 className="text-4xl lg:text-5xl font-black tracking-tighter text-base-content leading-tight mb-6">
                        {heroText}<span className="text-primary">.</span>
                    </h1>
                    <p className="text-base font-bold text-base-content/40 uppercase tracking-[0.3em] max-w-md">
                        {subtitle || "A curated repository of high-utility visual formulas and creative tokens."}
                    </p>
                </div>
                <div className="flex bg-base-100 p-8 border border-base-300 shadow-sm">
                    <div className="flex flex-col px-6 border-r border-base-300 last:border-r-0">
                        <span className="text-3xl font-black tracking-tighter leading-none">{currentCategoryCount}</span>
                        <span className="text-[10px] uppercase font-bold text-base-content/40 tracking-[0.2em] mt-1">Artifacts</span>
                    </div>
                    <div className="flex flex-col px-6 border-r border-base-300 last:border-r-0">
                        <span className="text-3xl font-black tracking-tighter leading-none">{selectedCategoryId === 'all' ? data.length : 1}</span>
                        <span className="text-[10px] uppercase font-bold text-base-content/40 tracking-[0.2em] mt-1">Datasets</span>
                    </div>
                </div>
            </div>
        </section>

        <div className="flex-shrink-0 bg-base-100 px-10 py-6 border-b border-base-300 sticky top-0 z-20 backdrop-blur-md bg-base-100/80">
          <div className="max-w-screen-2xl mx-auto flex gap-4 items-center">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
            <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery((e.currentTarget as any).value)}
                placeholder={searchPlaceholder}
                className="input input-ghost w-full focus:bg-transparent border-none px-0 font-bold text-xl tracking-tight placeholder:text-base-content/10"
            />
          </div>
        </div>
        
        <div className="flex-grow p-0 bg-base-200/5 min-h-[400px]">
          {isLoading ? <div className="h-64 flex items-center justify-center"><LoadingSpinner /></div> :
           error ? <div className="alert alert-error rounded-none border-2"><span>{error}</span></div> :
           allItems.length > 0 ? (
            layout === 'grid' ? (
                <div className="flex border-r border-base-300">
                    {columns.map((columnItems, colIndex) => (
                        <div key={colIndex} className="flex flex-1 flex-col gap-0 min-w-0 border-l border-base-300 first:border-l-0">
                            {columnItems.map(item => (
                                <div key={item.id}>
                                    <CardComponent 
                                        item={item} 
                                        onUpdateImages={(newUrls) => handleUpdateItem(item.id, { imageUrls: newUrls })} 
                                        onSelectItem={(i) => setDetailViewItemId(i.id)}
                                        onInject={handleInject}
                                    />
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-12 py-10 px-10">
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
              <p className="mt-2 text-xs font-bold uppercase tracking-widest text-base-content/20">
                No artifacts match your current filter sequence.
              </p>
            </div>
          )}
        </div>
      </main>

      {detailViewIndex !== null && allItems[detailViewIndex] && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in flex items-center justify-center p-1 lg:p-2 overflow-hidden">
                <div className="w-full h-full bg-base-300 rounded-none border border-base-300 shadow-2xl flex flex-col overflow-hidden relative">
                    <CheatsheetDetailView 
                        items={allItems}
                        currentIndex={detailViewIndex}
                        onClose={() => setDetailViewItemId(null)}
                        onNavigate={(idx) => setDetailViewItemId(allItems[idx].id)}
                        onInject={handleInject}
                        onUpdateItem={handleUpdateItem}
                    />
                </div>
          </div>
      )}
    </section>
  );
};