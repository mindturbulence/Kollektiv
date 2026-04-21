
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { GalleryItem, GalleryCategory } from '../types';
import { loadGalleryItems, loadCategories } from '../utils/galleryStorage';
import { fileSystemManager } from '../utils/fileUtils';
import { CloseIcon, PhotoIcon, FilmIcon, CheckIcon, SearchIcon } from './icons';
import LoadingSpinner from './LoadingSpinner';
import TreeView, { TreeViewItem } from './TreeView';
import useLocalStorage from '../utils/useLocalStorage';

interface GalleryPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (items: GalleryItem[]) => void;
  selectionMode?: 'single' | 'multiple';
  typeFilter?: 'image' | 'video' | 'all';
  title?: string;
}

const PickerItem: React.FC<{
    item: GalleryItem;
    url: string;
    isSelected: boolean;
    onToggle: () => void;
}> = ({ item, url, isSelected, onToggle }) => {
    const [thumbUrl, setThumbUrl] = useState<string | null>(null);
    const [isInView, setIsInView] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setIsInView(true);
            }
        }, { 
            rootMargin: '100px', 
            threshold: 0.01 
        });

        if (containerRef.current) observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!isInView) return;
        let isActive = true;
        let objectUrl: string | null = null;
        
        const load = async () => {
            if (!url) return;
            
            if (url.startsWith('data:') || url.startsWith('http') || url.startsWith('blob:')) {
                if (isActive) setThumbUrl(url);
                return;
            }

            try {
                const blob = await fileSystemManager.getFileAsBlob(url);
                if (blob && isActive) {
                    objectUrl = URL.createObjectURL(blob);
                    setThumbUrl(objectUrl);
                }
            } catch (error) {
                console.error("Error loading image blob:", error);
            }
        };
        
        // Add minimal delay to prevent overwhelming OPFS
        const timer = setTimeout(() => {
            load();
        }, 10 + Math.random() * 50);

        return () => { 
            isActive = false; 
            clearTimeout(timer);
            if (objectUrl) URL.revokeObjectURL(objectUrl); 
        };
    }, [url, isInView]);

    return (
        <div 
            ref={containerRef}
            onClick={onToggle}
            className={`relative aspect-square bg-transparent cursor-pointer overflow-hidden group border-2 transition-all ${isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-transparent hover:border-primary/50'}`}
        >
            {thumbUrl ? (
                <div className="w-full h-full relative">
                    {item.type === 'video' ? (
                        <video src={thumbUrl} className="w-full h-full object-cover media-monochrome group-hover:filter-none" />
                    ) : (
                        <img src={thumbUrl} className="w-full h-full object-cover media-monochrome group-hover:filter-none" alt={item.title} />
                    )}
                </div>
            ) : (
                <div className="w-full h-full flex items-center justify-center animate-pulse">
                    <PhotoIcon className="w-8 h-8 opacity-10" />
                </div>
            )}
            
            {item.type === 'video' && (
                <div className="absolute top-2 left-2 bg-black/60 p-1 backdrop-blur-md z-10">
                    <FilmIcon className="w-3 h-3 text-white" />
                </div>
            )}

            {isSelected && (
                <div className="absolute inset-0 bg-primary/20 flex items-center justify-center z-10">
                    <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center animate-fade-in">
                        <CheckIcon className="w-5 h-5 text-primary-content" />
                    </div>
                </div>
            )}
            
            <div className="absolute bottom-0 left-0 right-0 p-2 bg-transparent translate-y-full group-hover:translate-y-0 transition-transform z-10">
                <p className="text-[9px] font-black uppercase text-white truncate">{item.title}</p>
            </div>
        </div>
    );
};

const GalleryPickerModal: React.FC<GalleryPickerModalProps> = ({ 
    isOpen, onClose, onSelect, selectionMode = 'single', typeFilter = 'all', title = 'Select from Library' 
}) => {
    const [items, setItems] = useState<GalleryItem[]>([]);
    const [categories, setCategories] = useState<GalleryCategory[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [folderSearchQuery, setFolderSearchQuery] = useState('');
    const [showNsfw, setShowNsfw] = useLocalStorage<boolean>('galleryShowNsfw', false);
    const [selectedCategoryId, setSelectedCategoryId] = useState('all');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (isOpen) {
            setIsLoading(true);
            Promise.all([loadGalleryItems(), loadCategories()]).then(([loadedItems, loadedCats]) => {
                setItems(loadedItems);
                setCategories(loadedCats);
                setIsLoading(false);
            });
            setSelectedIds(new Set());
        }
    }, [isOpen]);

    const filteredItems = useMemo(() => {
        let filtered = items;
        
        if (!showNsfw) {
            filtered = filtered.filter(i => !i.isNsfw);
        }
        
        if (typeFilter !== 'all') {
            filtered = filtered.filter(i => i.type === typeFilter);
        }

        if (selectedCategoryId !== 'all') {
            if (selectedCategoryId === 'uncategorized') {
                filtered = filtered.filter(i => !i.categoryId);
            } else {
                filtered = filtered.filter(i => i.categoryId === selectedCategoryId);
            }
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(i => 
                i.title.toLowerCase().includes(q) || 
                i.tags?.some(t => t.toLowerCase().includes(q))
            );
        }

        return filtered;
    }, [items, typeFilter, selectedCategoryId, searchQuery, showNsfw]);

    const treeItems = useMemo<TreeViewItem[]>(() => {
        const q = folderSearchQuery.toLowerCase().trim();

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
    }, [categories, items, folderSearchQuery]);

    const displayUnits = useMemo(() => {
        return filteredItems.flatMap(item => 
            item.urls.map((url, index) => ({
                displayId: `${item.id}-${index}`,
                item,
                url,
                index
            }))
        );
    }, [filteredItems]);

    const handleToggle = (displayId: string) => {
        if (selectionMode === 'single') {
            setSelectedIds(new Set([displayId]));
        } else {
            setSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(displayId)) next.delete(displayId);
                else next.add(displayId);
                return next;
            });
        }
    };

    const handleConfirm = () => {
        const selectedItems = displayUnits
            .filter(u => selectedIds.has(u.displayId))
            .map(u => ({
                ...u.item,
                urls: [u.url],
                sources: [u.item.sources?.[u.index] || u.url]
            }));
        onSelect(selectedItems);
        onClose();
    };

    if (!isOpen) return null;

    const modalContent = (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl z-[100] flex items-center justify-center p-4 lg:p-12 animate-fade-in" onClick={onClose}>
        <div className="w-full max-w-6xl h-[90vh] flex flex-col relative p-[3px] corner-frame overflow-visible shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="bg-base-100/40 backdrop-blur-xl rounded-none w-full h-full flex flex-col overflow-hidden relative z-10">
                <header className="px-8 py-4 panel-header bg-transparent relative flex-shrink-0 flex items-center justify-between">
                    <div className="flex flex-col">
                        <h3 className="text-xl font-black tracking-tighter text-base-content leading-none uppercase">
                            LIBRARY<span className="text-primary">.</span>
                        </h3>
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/30 mt-1.5">{title}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-error/30 hover:text-error transition-all hover:scale-110">
                        <CloseIcon className="w-6 h-6" />
                    </button>
                </header>

                <div className="flex-grow flex flex-col lg:flex-row overflow-hidden p-6 gap-6">
                    <aside className="w-full lg:w-72 flex-shrink-0 flex flex-col relative overflow-visible">
                        <div className="flex flex-col h-full w-full overflow-hidden relative z-10 bg-transparent">
                            <div className="flex-shrink-0 bg-transparent h-14">
                                <div className="flex items-center h-full relative">
                                    <SearchIcon className="absolute left-6 w-4 h-4 opacity-20 pointer-events-none" />
                                    <input 
                                        type="text" 
                                        value={folderSearchQuery}
                                        onChange={(e) => setFolderSearchQuery(e.target.value)}
                                        placeholder="FIND FOLDER..."
                                        className="form-input w-full h-full border-none pl-14 pr-12"
                                    />
                                    {folderSearchQuery && (
                                        <button onClick={() => setFolderSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 form-btn h-6 w-6 text-error opacity-40 hover:opacity-100 transition-opacity">
                                            <CloseIcon className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="flex-grow overflow-y-auto p-4">
                                <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-base-content/30 mb-6 px-3">Library Folders</h2>
                                <TreeView 
                                    items={treeItems} 
                                    selectedId={selectedCategoryId} 
                                    onSelect={setSelectedCategoryId} 
                                    searchActive={!!folderSearchQuery}
                                />
                            </div>
                        </div>
                    </aside>

                    <main className="flex-grow flex flex-col relative overflow-visible">
                        <div className="flex flex-col h-full w-full overflow-hidden relative z-10 bg-transparent">
                            <div className="flex-shrink-0 bg-transparent h-14 flex items-center">
                                <div className="flex items-center h-full relative flex-grow">
                                    <SearchIcon className="absolute left-6 w-4 h-4 opacity-20 pointer-events-none" />
                                    <input 
                                        type="text" 
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="SEARCH IMAGES..."
                                        className="form-input w-full h-full border-none pl-14 pr-12"
                                    />
                                    {searchQuery && (
                                        <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 form-btn h-6 w-6 text-error opacity-40 hover:opacity-100 transition-opacity">
                                            <CloseIcon className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                                <div className="flex items-center h-full gap-3 bg-transparent px-6">
                                    <span className="text-[10px] font-black uppercase text-base-content/40 tracking-widest">NSFW</span>
                                    <input 
                                        type="checkbox" 
                                        checked={showNsfw} 
                                        onChange={(e) => setShowNsfw(e.target.checked)} 
                                        className="toggle toggle-xs toggle-primary" 
                                    />
                                </div>
                            </div>

                            <div className="flex-grow overflow-y-auto p-6 bg-transparent">
                                {isLoading ? (
                                    <div className="h-full w-full flex items-center justify-center">
                                        <LoadingSpinner />
                                    </div>
                                ) : displayUnits.length > 0 ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                                        {displayUnits.map(unit => (
                                            <PickerItem 
                                                key={unit.displayId} 
                                                item={unit.item}
                                                url={unit.url}
                                                isSelected={selectedIds.has(unit.displayId)}
                                                onToggle={() => handleToggle(unit.displayId)}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-center opacity-10 py-12">
                                        <PhotoIcon className="w-16 h-16 mb-4" />
                                        <p className="text-xl font-black uppercase tracking-widest">No matching files found</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </main>
                </div>

                <footer className="h-14 flex items-stretch bg-base-100/10 backdrop-blur-md p-1.5 gap-1.5 flex-shrink-0 panel-footer">
                    <div className="flex items-center px-6 border-r border-base-content/5">
                        <span className="text-[10px] font-mono font-bold text-base-content/30 uppercase tracking-widest leading-none">
                            {selectedIds.size} SELECTED
                        </span>
                    </div>
                    <button onClick={onClose} className="btn btn-sm btn-ghost h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake font-display">
                        <span/><span/><span/><span/>
                        ABORT
                    </button>
                    <button 
                        onClick={handleConfirm}
                        disabled={selectedIds.size === 0}
                        className="btn btn-sm btn-primary h-full flex-1 rounded-none font-normal text-[13px] tracking-wider uppercase btn-snake-primary font-display"
                    >
                        <span/><span/><span/><span/>
                        SELECT ITEMS
                    </button>
                </footer>
            </div>
            {/* Manual Corner Accents */}
            <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t border-l border-primary/15 z-20 pointer-events-none" />
            <div className="absolute -top-[1px] -right-[1px] w-3 h-3 border-t border-r border-primary/15 z-20 pointer-events-none" />
            <div className="absolute -bottom-[1px] -left-[1px] w-3 h-3 border-b border-l border-primary/15 z-20 pointer-events-none" />
            <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b border-r border-primary/15 z-20 pointer-events-none" />
        </div>
        </div>
    );

    if (typeof (window as any).document !== 'undefined' && (window as any).document.body) {
        return createPortal(modalContent, (window as any).document.body);
    }
    return null;
};

export default GalleryPickerModal;
