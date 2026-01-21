import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { GalleryItem, GalleryCategory } from '../types';
import { loadGalleryItems, loadCategories } from '../utils/galleryStorage';
import { fileSystemManager } from '../utils/fileUtils';
import { CloseIcon, PhotoIcon, FilmIcon, CheckIcon, SearchIcon, FolderClosedIcon } from './icons';
import LoadingSpinner from './LoadingSpinner';

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
    isSelected: boolean;
    onToggle: () => void;
}> = ({ item, isSelected, onToggle }) => {
    const [thumbUrl, setThumbUrl] = useState<string | null>(null);

    useEffect(() => {
        let isActive = true;
        let objectUrl: string | null = null;
        const load = async () => {
            if (!item.urls[0]) return;
            const blob = await fileSystemManager.getFileAsBlob(item.urls[0]);
            if (blob && isActive) {
                objectUrl = URL.createObjectURL(blob);
                setThumbUrl(objectUrl);
            }
        };
        load();
        return () => { isActive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [item.urls]);

    return (
        <div 
            onClick={onToggle}
            className={`relative aspect-square bg-base-300 cursor-pointer overflow-hidden group border-2 transition-all ${isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-transparent hover:border-primary/50'}`}
        >
            {thumbUrl ? (
                item.type === 'video' ? (
                    <video src={thumbUrl} className="w-full h-full object-cover grayscale group-hover:grayscale-0" />
                ) : (
                    <img src={thumbUrl} className="w-full h-full object-cover grayscale group-hover:grayscale-0" alt={item.title} />
                )
            ) : (
                <div className="w-full h-full flex items-center justify-center animate-pulse">
                    <PhotoIcon className="w-8 h-8 opacity-10" />
                </div>
            )}
            
            {item.type === 'video' && (
                <div className="absolute top-2 left-2 bg-black/60 p-1 backdrop-blur-md">
                    <FilmIcon className="w-3 h-3 text-white" />
                </div>
            )}

            {isSelected && (
                <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                    <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center shadow-lg animate-fade-in">
                        <CheckIcon className="w-5 h-5 text-primary-content" />
                    </div>
                </div>
            )}
            
            <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent translate-y-full group-hover:translate-y-0 transition-transform">
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
        let filtered = items.filter(i => !i.isNsfw);
        
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
    }, [items, typeFilter, selectedCategoryId, searchQuery]);

    const handleToggle = (id: string) => {
        if (selectionMode === 'single') {
            setSelectedIds(new Set([id]));
        } else {
            setSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
            });
        }
    };

    const handleConfirm = () => {
        const selectedItems = items.filter(i => selectedIds.has(i.id));
        onSelect(selectedItems);
        onClose();
    };

    if (!isOpen) return null;

    const modalContent = (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 lg:p-12 animate-fade-in" onClick={onClose}>
            <div className="bg-base-100 rounded-none border border-base-300 shadow-2xl w-full max-w-6xl h-full flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <header className="flex-shrink-0 p-8 border-b border-base-300 bg-base-200/20 flex flex-wrap justify-between items-center gap-6">
                    <div>
                        <h3 className="text-4xl font-black tracking-tighter text-base-content leading-none">
                            LIBRARY<span className="text-primary">.</span>
                        </h3>
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-base-content/30 mt-2">{title}</p>
                    </div>
                    <button onClick={onClose} className="btn btn-sm btn-ghost btn-square opacity-40 hover:opacity-100">
                        <CloseIcon className="w-6 h-6" />
                    </button>
                </header>

                <div className="flex-grow flex flex-col lg:flex-row overflow-hidden">
                    <aside className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-base-300 flex-shrink-0 flex flex-col bg-base-200/10">
                        <div className="p-4 space-y-6 overflow-y-auto custom-scrollbar">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40 ml-2">Folders</label>
                                <div className="flex flex-col gap-1">
                                    <button 
                                        onClick={() => setSelectedCategoryId('all')}
                                        className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-tight transition-colors ${selectedCategoryId === 'all' ? 'bg-primary text-primary-content' : 'hover:bg-base-300'}`}
                                    >
                                        <FolderClosedIcon className="w-4 h-4 opacity-40" />
                                        All Files
                                    </button>
                                    {categories.map(cat => (
                                        <button 
                                            key={cat.id}
                                            onClick={() => setSelectedCategoryId(cat.id)}
                                            className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-tight transition-colors ${selectedCategoryId === cat.id ? 'bg-primary text-primary-content' : 'hover:bg-base-300'}`}
                                        >
                                            <FolderClosedIcon className="w-4 h-4 opacity-40" />
                                            {cat.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </aside>

                    <main className="flex-grow flex flex-col overflow-hidden bg-base-100">
                        <div className="p-4 border-b border-base-300 bg-base-200/5 flex gap-4">
                            <div className="relative flex-grow">
                                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-20" />
                                <input 
                                    type="text" 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search library..."
                                    className="input input-sm input-bordered rounded-none w-full pl-10 font-bold tracking-tight uppercase placeholder:text-base-content/10"
                                />
                            </div>
                        </div>

                        <div className="flex-grow overflow-y-auto p-4 custom-scrollbar">
                            {isLoading ? (
                                <div className="h-full w-full flex items-center justify-center">
                                    <LoadingSpinner />
                                </div>
                            ) : filteredItems.length > 0 ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                                    {filteredItems.map(item => (
                                        <PickerItem 
                                            key={item.id} 
                                            item={item} 
                                            isSelected={selectedIds.has(item.id)}
                                            onToggle={() => handleToggle(item.id)}
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
                    </main>
                </div>

                <footer className="flex-shrink-0 p-6 border-t border-base-300 bg-base-200/20 flex justify-between items-center">
                    <span className="text-[10px] font-mono font-bold text-base-content/30 uppercase">
                        {selectedIds.size} File{selectedIds.size !== 1 ? 's' : ''} Selected
                    </span>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="btn btn-ghost rounded-none uppercase font-black text-[10px] tracking-widest px-8">Cancel</button>
                        <button 
                            onClick={handleConfirm}
                            disabled={selectedIds.size === 0}
                            className="btn btn-primary rounded-none uppercase font-black text-[10px] tracking-widest px-12 shadow-lg"
                        >
                            Select
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );

    if (typeof (window as any).document !== 'undefined' && (window as any).document.body) {
        return createPortal(modalContent, (window as any).document.body);
    }
    return null;
};

export default GalleryPickerModal;