import React, { useState, useMemo, useEffect, ComponentType, useRef } from 'react';
import type { CheatsheetCategory, CheatsheetItem } from '../types';
import TreeView, { TreeViewItem } from './TreeView';
import CategoryPanelToggle from './CategoryPanelToggle';
import LoadingSpinner from './LoadingSpinner';

interface GenericCheatsheetPageProps {
  title: string;
  searchPlaceholder: string;
  loadDataFn: () => Promise<CheatsheetCategory[]>;
  updateDataFn: (itemId: string, newImageUrls: string[]) => Promise<CheatsheetCategory[]>;
  CardComponent: ComponentType<{ item: CheatsheetItem; onUpdateImages: (newImageUrls: string[]) => void; }>;
  onSendToPromptsPage?: (item: CheatsheetItem, category: string) => void;
  isCategoryPanelCollapsed: boolean;
  onToggleCategoryPanel: () => void;
  isSidebarPinned: boolean;
  EmptyIcon: ComponentType<React.SVGProps<SVGSVGElement>>;
  layout?: 'grid' | 'article';
}

export const GenericCheatsheetPage: React.FC<GenericCheatsheetPageProps> = ({
  title,
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
  const [columnCount, setColumnCount] = useState(3);
  const mainContentRef = useRef<HTMLElement>(null);

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

  useEffect(() => {
    const getColumnCount = () => {
        if (typeof window === 'undefined') return 2;
        
        const mainSidebarWidth = 256; // w-64
        const categoryPanelWidth = 320; // w-80
        const isDesktop = (window as any).innerWidth >= 1024; // lg breakpoint

        let availableWidth = (window as any).innerWidth;
        if (isSidebarPinned && isDesktop) {
            availableWidth -= mainSidebarWidth;
        }
        if (!isCategoryPanelCollapsed && isDesktop) { // Category panel collapses into overlay on mobile
            availableWidth -= categoryPanelWidth;
        }

        // Adjust for padding/margins
        availableWidth -= 48; // p-6

        if (availableWidth >= 1536) return 5; // 2xl
        if (availableWidth >= 1280) return 4; // xl
        if (availableWidth >= 1024) return 3; // lg
        if (availableWidth >= 768) return 2; // md
        return 1; // sm and below
    };

    const handleResize = () => {
        setColumnCount(getColumnCount());
    };

    if (typeof window !== 'undefined') {
        (window as any).addEventListener('resize', handleResize);
        handleResize(); // Set initial value
        return () => (window as any).removeEventListener('resize', handleResize);
    }
  }, [isSidebarPinned, isCategoryPanelCollapsed]);

  const treeItems = useMemo<TreeViewItem[]>(() => {
    const totalItems = data.reduce((acc, cat) => acc + cat.items.length, 0);
    const categoryNodes: TreeViewItem[] = data.map(cat => ({
      id: cat.category,
      name: cat.category,
      icon: 'folder',
      count: cat.items.length,
    }));
    return [
      { id: 'all', name: 'All', icon: 'app', count: totalItems },
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

  const handleUpdateImages = async (itemId: string, newImageUrls: string[]) => {
    const updatedData = await updateDataFn(itemId, newImageUrls);
    setData(updatedData);
  };
  
  const handleSelectCategory = (id: string) => {
    setSelectedCategoryId(id);
    if(mainContentRef.current) {
        (mainContentRef.current as any).scrollTop = 0;
    }
  };

  const articleLayoutClasses = "space-y-8 divide-y divide-base-300";

  const allItems = useMemo(() => {
    return filteredData.flatMap(category => category.items);
  }, [filteredData]);

  const columns = useMemo(() => {
    const cols: CheatsheetItem[][] = Array.from({ length: columnCount }, () => []);
    if (layout === 'grid') {
      allItems.forEach((item, index) => {
        cols[index % columnCount].push(item);
      });
    }
    return cols;
  }, [allItems, columnCount, layout]);

  return (
    <section className="flex flex-row h-full">
      <aside className={`relative flex-shrink-0 bg-base-100 transition-all duration-300 ease-in-out ${isCategoryPanelCollapsed ? 'w-0' : 'w-80'}`}>
        <CategoryPanelToggle isCollapsed={isCategoryPanelCollapsed} onToggle={onToggleCategoryPanel} />
        <div className={`h-full overflow-y-auto p-4 transition-opacity duration-200 ${isCategoryPanelCollapsed ? 'opacity-0' : 'opacity-100'}`}>
          <h2 className="px-3 pt-2 pb-2 text-xs font-semibold text-base-content/60 uppercase tracking-wider">
            Categories
          </h2>
          <TreeView items={treeItems} selectedId={selectedCategoryId} onSelect={handleSelectCategory} />
        </div>
      </aside>

      <main ref={mainContentRef} className="relative flex-grow flex flex-col h-full overflow-y-auto">
        <div className="flex-shrink-0 bg-base-100/80 backdrop-blur-sm px-6 py-4 border-b border-l border-base-300 sticky top-0 z-10">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery((e.currentTarget as any).value)}
            placeholder={searchPlaceholder}
            className="input input-bordered w-full input-sm"
          />
        </div>
        
        <div className="flex-grow p-6">
          {isLoading ? <LoadingSpinner /> :
           error ? <div className="alert alert-error"><span>{error}</span></div> :
           allItems.length > 0 ? (
            layout === 'grid' ? (
                <div className="flex gap-6">
                    {columns.map((columnItems, colIndex) => (
                        <div key={colIndex} className="flex flex-1 flex-col gap-6 min-w-0">
                            {columnItems.map(item => (
                                <CardComponent 
                                    key={item.id}
                                    item={item} 
                                    onUpdateImages={(newUrls) => handleUpdateImages(item.id, newUrls)} 
                                />
                            ))}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-8">
                {filteredData.map(category => (
                    <section key={category.category} id={category.category}>
                    <h2 className="text-2xl font-bold mb-4 text-primary">{category.category}</h2>
                    <div className={articleLayoutClasses}>
                        {category.items.map(item => (
                        <div key={item.id} className={'pt-8 first:pt-0'}>
                            <CardComponent 
                                item={item} 
                                onUpdateImages={(newUrls) => handleUpdateImages(item.id, newUrls)} 
                            />
                        </div>
                        ))}
                    </div>
                    </section>
                ))}
                </div>
            )
          ) : (
            <div className="text-center py-16 px-6 flex flex-col items-center">
              <EmptyIcon className="mx-auto h-12 w-12 text-base-content/40" />
              <h3 className="mt-2 text-xl font-medium text-base-content">No Results Found</h3>
              <p className="mt-1 text-base-content/70">
                Try adjusting your search or filters.
              </p>
            </div>
          )}
        </div>
      </main>
    </section>
  );
};