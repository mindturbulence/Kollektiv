import React, { useState, useEffect, useRef } from 'react';
import { 
    DeleteIcon, ChevronDownIcon, 
    FolderClosedIcon, PlusIcon,
    SearchIcon, RefreshIcon, CloseIcon,
    EditIcon, CheckIcon
} from './icons';
import ConfirmationModal from './ConfirmationModal';
import { audioService } from '../services/audioService';

interface Category {
  id: string;
  name: string;
  parentId?: string;
  order: number;
}

interface NestedCategoryManagerProps {
  title: string;
  type: 'gallery' | 'prompt';
  loadFn: () => Promise<Category[]>;
  addFn: (name: string, parentId?: string) => Promise<Category[]>;
  updateFn: (id: string, updates: any) => Promise<Category[]>;
  deleteFn: (id: string) => Promise<Category[]>;
  saveOrderFn: (categories: Category[]) => Promise<void>;
  deleteConfirmationMessage: (name: string) => string;
}

// Circular-safe helper: find all categories that are NOT the target itself or any of its descendants
const getAvailableParents = (catId: string, allCats: Category[]): Category[] => {
    const descendants = new Set<string>();
    const findDescendants = (id: string) => {
        allCats.forEach(c => {
            if (c.parentId === id) {
                descendants.add(c.id);
                findDescendants(c.id);
            }
        });
    };
    findDescendants(catId);
    return allCats.filter(c => c.id !== catId && !descendants.has(c.id));
};

const CategoryItem: React.FC<{
    category: Category;
    allCategories: Category[];
    level: number;
    searchQuery: string;
    isAllExpanded: boolean;
    onEdit: (id: string, name: string) => void;
    onDelete: (cat: Category) => void;
    onAddSub: (parentId: string) => void;
    onMove: (id: string, direction: 'up' | 'down' | 'top' | 'bottom') => void;
    onReparent: (id: string, newParentId?: string) => void;
}> = ({ category, allCategories, level, searchQuery, isAllExpanded, onEdit, onDelete, onAddSub, onMove, onReparent }) => {
    const [isLocalExpanded, setIsLocalExpanded] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(category.name);
    const savingRef = useRef(false);
    
    useEffect(() => {
        if (searchQuery) setIsLocalExpanded(true);
    }, [searchQuery]);

    useEffect(() => {
        setIsLocalExpanded(isAllExpanded);
    }, [isAllExpanded]);

    const children = allCategories.filter(c => c.parentId === category.id).sort((a, b) => (a.order || 0) - (b.order || 0));
    const siblings = allCategories.filter(c => c.parentId === category.parentId).sort((a, b) => (a.order || 0) - (b.order || 0));
    const index = siblings.findIndex(s => s.id === category.id);
    
    const handleRename = () => {
        if (savingRef.current) return;
        const trimmed = editValue.trim();
        if (trimmed && trimmed !== category.name) {
            savingRef.current = true;
            onEdit(category.id, trimmed);
            savingRef.current = false;
        } else {
            setEditValue(category.name);
        }
        setIsEditing(false);
    };

    const isVisible = !searchQuery || 
                      category.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                      children.some(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!isVisible) return null;

    const availableParents = getAvailableParents(category.id, allCategories);

    return (
        <div className="flex flex-col">
            <div 
                className={`group relative flex flex-col md:flex-row md:items-center justify-between gap-4 py-3 pr-4 border-b border-base-300/45 transition-all duration-200 
                    ${isEditing ? 'bg-primary/5' : 'hover:bg-base-200/40'}`}
                style={{ paddingLeft: `${(level * 24) + 12}px` }}
            >
                {/* Visual Connection Line */}
                {level > 0 && (
                    <div className="absolute w-px bg-base-300 left-0 top-0 bottom-0" style={{ left: `${(level * 24) - 12}px` }}></div>
                )}

                {/* Left Side: Folder Toggle Expand & Folder Icon & Name/Input */}
                <div className="flex items-center gap-2 flex-grow min-w-0">
                    <button 
                        onClick={() => { audioService.playClick(); setIsLocalExpanded(!isLocalExpanded); }}
                        className={`p-1.5 transition-transform text-base-content/40 hover:text-primary ${children.length === 0 ? 'opacity-0 pointer-events-none' : ''} ${isLocalExpanded ? 'rotate-0' : '-rotate-90'}`}
                    >
                        <ChevronDownIcon className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex items-center gap-3 flex-grow min-w-0">
                        <FolderClosedIcon className={`w-4 h-4 flex-shrink-0 ${level === 0 ? 'text-primary' : 'text-base-content/45'}`} />
                        
                        {isEditing ? (
                            <div className="flex items-center gap-1.5 flex-grow max-w-sm">
                                <input 
                                    autoFocus
                                    value={editValue}
                                    onChange={e => setEditValue(e.target.value)}
                                    onKeyDown={e => { 
                                        if (e.key === 'Enter') { 
                                            audioService.playClick(); 
                                            handleRename(); 
                                        } else if (e.key === 'Escape') {
                                            audioService.playClick();
                                            setIsEditing(false);
                                            setEditValue(category.name);
                                        }
                                    }}
                                    className="form-input h-8 w-full font-bold uppercase text-[11px] focus:outline-none"
                                    placeholder="Enter category name..."
                                />
                                <button 
                                    onClick={() => { audioService.playClick(); handleRename(); }}
                                    className="p-1 px-2.5 h-8 bg-success/20 hover:bg-success/30 text-success border border-success/30 transition-colors uppercase font-bold text-[10px] flex items-center justify-center"
                                    title="Save Rename"
                                >
                                    <CheckIcon className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                    onClick={() => { 
                                        audioService.playClick(); 
                                        setIsEditing(false); 
                                        setEditValue(category.name); 
                                    }}
                                    className="p-1 px-2.5 h-8 bg-base-300 hover:bg-base-200 text-base-content/60 border border-base-300 transition-colors uppercase font-bold text-[10px] flex items-center justify-center"
                                    title="Cancel"
                                >
                                    <CloseIcon className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 min-w-0">
                                <span 
                                    onClick={() => { audioService.playClick(); setIsLocalExpanded(!isLocalExpanded); }}
                                    className="text-sm font-black text-base-content truncate hover:text-primary transition-colors uppercase tracking-tight cursor-pointer"
                                    title={`Click to expansion toggle. ID: ${category.id}`}
                                >
                                    {category.name}
                                </span>
                                <span className="text-[8px] font-mono text-base-content/20 flex-shrink-0">#{category.id.slice(-4)}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Side: Reorganizing parent dropdown, Sibling movers, and Action Buttons */}
                <div className="flex items-center gap-4 flex-wrap md:flex-nowrap">
                    {/* Parent Selector (reparenting) - 100% stable folder moves */}
                    {!isEditing && (
                        <div className="flex items-center gap-2">
                            <span className="text-[9px] font-mono text-base-content/40 uppercase tracking-wider hidden md:inline">Folder Placement:</span>
                            <select
                                value={category.parentId || ''}
                                onChange={(e) => {
                                    audioService.playClick();
                                    const val = e.target.value;
                                    onReparent(category.id, val ? val : undefined);
                                }}
                                className="select select-xs select-bordered font-mono text-[9px] uppercase font-bold tracking-wider h-7 bg-base-200/50 hover:bg-base-200 border-base-300/50 rounded-none max-w-[150px] focus:outline-none"
                                title="Move folder to another placement in tree"
                            >
                                <option value="">[ROOT DIRECTORY]</option>
                                {availableParents.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {p.name.toUpperCase()}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Sibling Sort Sequence Moves */}
                    <div className="flex bg-base-200/50 border border-base-300/30">
                        <button 
                            onClick={() => { audioService.playClick(); onMove(category.id, 'up'); }} 
                            disabled={index === 0} 
                            className="p-1 px-2.5 text-base-content/50 hover:text-primary disabled:opacity-10 disabled:pointer-events-none transition-colors border-r border-base-300/30" 
                            title="Sort Up"
                        >
                            <ChevronDownIcon className="w-3.5 h-3.5 rotate-180"/>
                        </button>
                        <button 
                            onClick={() => { audioService.playClick(); onMove(category.id, 'down'); }} 
                            disabled={index === siblings.length - 1} 
                            className="p-1 px-2.5 text-base-content/50 hover:text-primary disabled:opacity-10 disabled:pointer-events-none transition-colors" 
                            title="Sort Down"
                        >
                            <ChevronDownIcon className="w-3.5 h-3.5"/>
                        </button>
                    </div>

                    {/* Direct modification triggers */}
                    <div className="flex items-center gap-1 border-l border-base-300/40 pl-3">
                        <button 
                            onClick={() => { audioService.playClick(); onAddSub(category.id); }} 
                            className="p-1.5 bg-primary/5 hover:bg-primary/10 text-primary border border-primary/20 transition-all flex items-center justify-center" 
                            title="New Nest Subfolder"
                        >
                            <PlusIcon className="w-3.5 h-3.5"/>
                        </button>
                        
                        {!isEditing && (
                            <button 
                                onClick={() => { audioService.playClick(); setIsEditing(true); }} 
                                className="p-1.5 bg-info/5 hover:bg-info/10 text-info border border-info/20 transition-all flex items-center justify-center" 
                                title="Rename Folder"
                            >
                                <EditIcon className="w-3.5 h-3.5"/>
                            </button>
                        )}
                        
                        <button 
                            onClick={() => { audioService.playClick(); onDelete(category); }} 
                            className="p-1.5 bg-error/5 hover:bg-error/10 text-error border border-error/20 transition-all flex items-center justify-center" 
                            title="Purge Empty or Filled Folder"
                        >
                            <DeleteIcon className="w-3.5 h-3.5"/>
                        </button>
                    </div>
                </div>
            </div>
            
            {isLocalExpanded && children.length > 0 && (
                <div className="relative">
                    {children.map(child => (
                        <CategoryItem 
                            key={child.id} 
                            category={child} 
                            allCategories={allCategories} 
                            level={level + 1} 
                            searchQuery={searchQuery}
                            isAllExpanded={isAllExpanded}
                            onEdit={onEdit} 
                            onDelete={onDelete} 
                            onAddSub={onAddSub}
                            onMove={onMove}
                            onReparent={onReparent}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export const NestedCategoryManager: React.FC<NestedCategoryManagerProps> = ({
  title, loadFn, addFn, updateFn, deleteFn, saveOrderFn, deleteConfirmationMessage,
}) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [isAllExpanded, setIsAllExpanded] = useState(true);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addParentId, setAddParentId] = useState<string | undefined>(undefined);
  const [addName, setAddName] = useState('');

  useEffect(() => {
    loadFn().then(setCategories);
  }, [loadFn]);

  const handleReorder = async (id: string, direction: 'up' | 'down' | 'top' | 'bottom') => {
      const cat = categories.find(c => c.id === id);
      if (!cat) return;
      const siblings = categories.filter(c => c.parentId === cat.parentId).sort((a, b) => (a.order || 0) - (b.order || 0));
      const index = siblings.findIndex(s => s.id === id);
      
      let targetIndex = -1;
      if (direction === 'up') targetIndex = index - 1;
      else if (direction === 'down') targetIndex = index + 1;
      else if (direction === 'top') targetIndex = 0;
      else if (direction === 'bottom') targetIndex = siblings.length - 1;
      
      if (targetIndex < 0 || targetIndex >= siblings.length || targetIndex === index) return;
      
      const newSiblings = [...siblings];
      const [moved] = newSiblings.splice(index, 1);
      newSiblings.splice(targetIndex, 0, moved);
      
      const updatedSiblings = newSiblings.map((s, i) => ({ ...s, order: i }));
      
      const updatedAll = categories.map(c => {
          const updated = updatedSiblings.find(s => s.id === c.id);
          return updated || c;
      });
      
      setCategories(updatedAll);
      await saveOrderFn(updatedAll);
  };

  const handleSortAZ = async () => {
      const allSorted = [...categories];
      const sortRecursively = (parentId?: string) => {
          const children = allSorted
              .filter(c => c.parentId === parentId)
              .sort((a, b) => a.name.localeCompare(b.name));

          children.forEach((child, index) => {
              const originalIndex = allSorted.findIndex(c => c.id === child.id);
              allSorted[originalIndex] = { ...allSorted[originalIndex], order: index };
              sortRecursively(child.id);
          });
      };
      sortRecursively(undefined);
      setCategories(allSorted);
      await saveOrderFn(allSorted);
  };

  const handleReparent = async (id: string, newParentId?: string) => {
      const updated = await updateFn(id, { parentId: newParentId });
      setCategories(updated);
  };

  const handleInlineRename = async (id: string, newName: string) => {
      const updated = await updateFn(id, { name: newName });
      setCategories(updated);
  };

  const handleConfirmAdd = async () => {
      if (addName.trim()) {
          const updated = await addFn(addName.trim(), addParentId);
          setCategories(updated);
          setIsAddModalOpen(false);
          setAddName('');
          setAddParentId(undefined);
      }
  };

  const rootCategories = categories.filter(c => !c.parentId).sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className="flex flex-col h-full bg-base-100/40 backdrop-blur-xl overflow-hidden">
        <header className="p-6 flex flex-col gap-6 flex-shrink-0">
            <div className="flex justify-between items-center">
                <h3 className="text-xs font-black uppercase tracking-[0.4em] text-primary">{title}</h3>
                <div className="flex gap-1.5">
                    <button onClick={() => { audioService.playClick(); setIsAllExpanded(!isAllExpanded); }} className="p-2 text-primary/40 hover:text-primary transition-colors" title={isAllExpanded ? 'Collapse All' : 'Expand All'}>
                        <ChevronDownIcon className={`w-5 h-5 transition-transform ${isAllExpanded ? 'rotate-0' : '-rotate-90'}`} />
                    </button>
                    <button onClick={() => { audioService.playClick(); handleSortAZ(); }} className="p-2 text-primary/40 hover:text-primary transition-colors" title="Sort Recursive A-Z">
                        <RefreshIcon className="w-5 h-5" />
                    </button>
                    <button 
                        onClick={() => { audioService.playClick(); setAddParentId(undefined); setIsAddModalOpen(true); }}
                        className="p-2 text-primary hover:text-primary-focus transition-colors"
                        title="New Folder"
                    >
                        <PlusIcon className="w-6 h-6" />
                    </button>
                </div>
            </div>

            <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-20" />
                <input 
                    type="text" 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search folder registry..."
                    className="form-input w-full pl-10"
                />
                {searchQuery && (
                    <button onClick={() => { audioService.playClick(); setSearchQuery(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 form-btn h-6 w-6 text-error">
                        <CloseIcon className="w-3 h-3" />
                    </button>
                )}
            </div>
        </header>

        <div className="flex-grow overflow-y-auto bg-transparent">
            {categories.length > 0 ? (
                <div className="flex flex-col pb-20">
                    {rootCategories.map(cat => (
                        <CategoryItem 
                            key={cat.id} 
                            category={cat} 
                            allCategories={categories} 
                            level={0}
                            searchQuery={searchQuery}
                            isAllExpanded={isAllExpanded}
                            onEdit={handleInlineRename}
                            onDelete={(c) => { setCategoryToDelete(c); setIsModalOpen(true); }}
                            onAddSub={(pid) => { setAddParentId(pid); setIsAddModalOpen(true); }}
                            onMove={handleReorder}
                            onReparent={handleReparent}
                        />
                    ))}
                </div>
            ) : (
                <div className="p-20 text-center opacity-20">
                    <FolderClosedIcon className="w-16 h-16 mx-auto mb-4" />
                    <p className="text-xs font-bold uppercase tracking-[0.2em]">Registry Empty</p>
                </div>
            )}
        </div>

        {isAddModalOpen && (
            <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 animate-fade-in" onClick={() => setIsAddModalOpen(false)}>
                <div className="flex flex-col bg-transparent w-full max-w-lg mx-auto relative p-[3px] corner-frame overflow-visible" onClick={e => e.stopPropagation()}>
                    <div className="bg-base-100/40 backdrop-blur-xl rounded-none w-full overflow-hidden relative z-10">
                        <header className="p-8 border-b border-base-300 bg-transparent">
                            <h3 className="text-4xl font-black tracking-tighter text-base-content uppercase leading-none">New Folder</h3>
                            {addParentId && <p className="text-[10px] font-black uppercase tracking-widest text-primary mt-2">Nesting under: {categories.find(c => c.id === addParentId)?.name}</p>}
                        </header>
                        <div className="p-8 space-y-6">
                            <div className="form-control">
                                <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40 mb-2">Folder Name</label>
                                <input type="text" value={addName} onChange={e => setAddName((e.currentTarget as any).value)} className="form-input w-full" autoFocus onKeyDown={e => e.key === 'Enter' && handleConfirmAdd()} />
                            </div>
                        </div>
                        <footer className="p-4 border-t border-base-300 flex justify-end gap-2 bg-transparent">
                            <button onClick={() => { audioService.playClick(); setIsAddModalOpen(false); }} className="form-btn px-8">Abort</button>
                            <button onClick={() => { audioService.playClick(); handleConfirmAdd(); }} disabled={!addName.trim()} className="form-btn form-btn-primary px-8 shadow-lg">Create</button>
                        </footer>
                    </div>
                </div>
            </div>
        )}

        <ConfirmationModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onConfirm={async () => { if(categoryToDelete) { const updated = await deleteFn(categoryToDelete.id); setCategories(updated); } setIsModalOpen(false); }}
            title="Purge Folder"
            message={categoryToDelete ? deleteConfirmationMessage(categoryToDelete.name) : ''}
        />
    </div>
  );
};
