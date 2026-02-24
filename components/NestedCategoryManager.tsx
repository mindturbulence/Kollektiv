import React, { useState, useEffect } from 'react';
import { 
    DeleteIcon, ChevronDownIcon, 
    FolderClosedIcon, PlusIcon,
    SearchIcon, RefreshIcon, CloseIcon, GripVerticalIcon
} from './icons';
import ConfirmationModal from './ConfirmationModal';

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
    onDragReorder: (sourceId: string, targetId: string) => void;
}> = ({ category, allCategories, level, searchQuery, isAllExpanded, onEdit, onDelete, onAddSub, onMove, onReparent, onDragReorder }) => {
    const [isLocalExpanded, setIsLocalExpanded] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(category.name);
    const [isDragOver, setIsDragOver] = useState(false);
    
    useEffect(() => {
        if (searchQuery) setIsLocalExpanded(true);
    }, [searchQuery]);

    useEffect(() => {
        setIsLocalExpanded(isAllExpanded);
    }, [isAllExpanded]);

    const children = allCategories.filter(c => c.parentId === category.id).sort((a, b) => a.order - b.order);
    const siblings = allCategories.filter(c => c.parentId === category.parentId).sort((a, b) => a.order - b.order);
    const index = siblings.findIndex(s => s.id === category.id);
    
    const handleRename = () => {
        if (editValue.trim() && editValue !== category.name) {
            onEdit(category.id, editValue.trim());
        } else {
            setEditValue(category.name);
        }
        setIsEditing(false);
    };

    const isVisible = !searchQuery || 
                      category.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                      children.some(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!isVisible) return null;

    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData('text/plain', category.id);
        e.dataTransfer.effectAllowed = 'move';
        const target = e.currentTarget as HTMLElement;
        // Visual ghost effect
        setTimeout(() => { 
            target.classList.add('opacity-20');
            target.classList.add('border-primary');
        }, 0);
    };

    const handleDragEnd = (e: React.DragEvent) => {
        const target = e.currentTarget as HTMLElement;
        target.classList.remove('opacity-20');
        target.classList.remove('border-primary');
        setIsDragOver(false);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setIsDragOver(true);
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const sourceId = e.dataTransfer.getData('text/plain');
        if (sourceId !== category.id) {
            onDragReorder(sourceId, category.id);
        }
    };

    return (
        <div className="flex flex-col">
            <div 
                draggable={!isEditing}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`group relative flex items-center gap-4 py-3 pr-4 border-b border-base-300/50 transition-all duration-200 
                    ${isEditing ? 'bg-primary/5' : 'hover:bg-base-200/50'} 
                    ${isDragOver ? 'bg-primary/10 ring-2 ring-inset ring-primary z-10' : ''}`}
                style={{ paddingLeft: `${(level * 24) + 12}px` }}
            >
                {/* Visual Connection Line */}
                {level > 0 && (
                    <div className="absolute w-px bg-base-300 left-0 top-0 bottom-0" style={{ left: `${(level * 24) - 12}px` }}></div>
                )}

                <div className="flex items-center gap-2 flex-grow min-w-0">
                    <div className="cursor-grab active:cursor-grabbing text-base-content/20 hover:text-primary transition-colors p-1 -ml-1">
                        <GripVerticalIcon className="w-4 h-4" />
                    </div>

                    <button 
                        onClick={() => setIsLocalExpanded(!isLocalExpanded)}
                        className={`btn btn-xs btn-ghost btn-square transition-transform ${children.length === 0 ? 'opacity-0 pointer-events-none' : ''} ${isLocalExpanded ? 'rotate-0' : '-rotate-90'}`}
                    >
                        <ChevronDownIcon className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex items-center gap-3 flex-grow min-w-0">
                        <FolderClosedIcon className={`w-4 h-4 flex-shrink-0 ${level === 0 ? 'text-primary' : 'text-base-content/40'}`} />
                        
                        {isEditing ? (
                            <input 
                                autoFocus
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={handleRename}
                                onKeyDown={e => e.key === 'Enter' && handleRename()}
                                className="input input-xs input-primary rounded-none font-bold uppercase tracking-tight w-full bg-base-100"
                            />
                        ) : (
                            <span 
                                onClick={() => setIsEditing(true)}
                                className="text-sm font-bold text-base-content truncate cursor-text hover:text-primary transition-colors uppercase tracking-tight"
                            >
                                {category.name}
                            </span>
                        )}
                        <span className="text-[8px] font-mono text-base-content/10 flex-shrink-0">#{category.id.slice(-4)}</span>
                    </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="join bg-base-200 border border-base-300 mr-2">
                        <button onClick={() => onMove(category.id, 'up')} disabled={index === 0} className="btn btn-xs btn-ghost join-item" title="Move Up"><ChevronDownIcon className="w-3 h-3 rotate-180"/></button>
                        <button onClick={() => onMove(category.id, 'down')} disabled={index === siblings.length - 1} className="btn btn-xs btn-ghost join-item" title="Move Down"><ChevronDownIcon className="w-3 h-3"/></button>
                    </div>

                    <button onClick={() => onAddSub(category.id)} className="btn btn-xs btn-ghost btn-square text-primary" title="Add Subfolder"><PlusIcon className="w-3.5 h-3.5"/></button>
                    <button onClick={() => onDelete(category)} className="btn btn-xs btn-ghost btn-square text-error/40 hover:text-error" title="Delete"><DeleteIcon className="w-3.5 h-3.5"/></button>
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
                            onDragReorder={onDragReorder}
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
      const siblings = categories.filter(c => c.parentId === cat.parentId).sort((a, b) => a.order - b.order);
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

  const handleDragReorder = async (sourceId: string, targetId: string) => {
      const sourceCat = categories.find(c => c.id === sourceId);
      const targetCat = categories.find(c => c.id === targetId);
      if (!sourceCat || !targetCat) return;

      let updatedAll = [...categories];

      // Circular check (cannot drag parent into child)
      let tempParent = targetCat.parentId;
      while (tempParent) {
          if (tempParent === sourceId) return;
          tempParent = categories.find(c => c.id === tempParent)?.parentId;
      }

      const newParentId = targetCat.parentId;
      const siblings = updatedAll.filter(c => c.parentId === newParentId).sort((a, b) => a.order - b.order);
      const targetIndex = siblings.findIndex(s => s.id === targetId);

      updatedAll = updatedAll.filter(c => c.id !== sourceId);
      const updatedSource = { ...sourceCat, parentId: newParentId };
      const newSiblings = siblings.filter(s => s.id !== sourceId);
      newSiblings.splice(targetIndex, 0, updatedSource);

      const reorderedSiblings = newSiblings.map((s, i) => ({ ...s, order: i }));

      updatedAll = updatedAll.map(c => {
          const reordered = reorderedSiblings.find(s => s.id === c.id);
          return reordered || c;
      });

      if (!updatedAll.find(c => c.id === sourceId)) {
          const sourceWithOrder = reorderedSiblings.find(s => s.id === sourceId)!;
          updatedAll.push(sourceWithOrder);
      }

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

  const rootCategories = categories.filter(c => !c.parentId).sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col h-full bg-base-100 overflow-hidden">
        <header className="p-6 border-b border-base-300 bg-base-200/10 flex flex-col gap-6 flex-shrink-0">
            <div className="flex justify-between items-center">
                <h3 className="text-xs font-black uppercase tracking-[0.4em] text-primary">{title}</h3>
                <div className="flex gap-2">
                    <button onClick={() => setIsAllExpanded(!isAllExpanded)} className="btn btn-xs btn-ghost font-black text-[9px] tracking-widest uppercase">
                        {isAllExpanded ? 'Collapse All' : 'Expand All'}
                    </button>
                    <button onClick={handleSortAZ} className="btn btn-xs btn-ghost font-black text-[9px] tracking-widest uppercase">
                        <RefreshIcon className="w-3.5 h-3.5 mr-2" />
                        Sort Recursive A-Z
                    </button>
                    <button 
                        onClick={() => { setAddParentId(undefined); setIsAddModalOpen(true); }}
                        className="btn btn-primary btn-sm rounded-none font-black text-[10px] tracking-widest px-6"
                    >
                        NEW FOLDER
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
                    className="input input-sm input-bordered rounded-none w-full pl-10 font-bold uppercase tracking-tight placeholder:text-base-content/10"
                />
                {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 btn btn-xs btn-ghost btn-circle">
                        <CloseIcon className="w-3 h-3" />
                    </button>
                )}
            </div>
        </header>

        <div className="flex-grow overflow-y-auto custom-scrollbar bg-base-100">
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
                            onDragReorder={handleDragReorder}
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
                <div className="bg-base-100 rounded-none border border-base-300 shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
                    <header className="p-8 border-b border-base-300 bg-base-200/20">
                        <h3 className="text-4xl font-black tracking-tighter text-base-content uppercase leading-none">New Folder</h3>
                        {addParentId && <p className="text-[10px] font-black uppercase tracking-widest text-primary mt-2">Nesting under: {categories.find(c => c.id === addParentId)?.name}</p>}
                    </header>
                    <div className="p-8 space-y-6">
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40 mb-2">Folder Name</label>
                            <input type="text" value={addName} onChange={e => setAddName((e.currentTarget as any).value)} className="input input-bordered rounded-none font-bold tracking-tight" autoFocus onKeyDown={e => e.key === 'Enter' && handleConfirmAdd()} />
                        </div>
                    </div>
                    <footer className="p-4 border-t border-base-300 flex justify-end gap-2 bg-base-200/10">
                        <button onClick={() => setIsAddModalOpen(false)} className="btn btn-ghost rounded-none uppercase font-black text-[10px] tracking-widest px-8">Abort</button>
                        <button onClick={handleConfirmAdd} disabled={!addName.trim()} className="btn btn-primary rounded-none uppercase font-black text-[10px] tracking-widest px-8 shadow-lg">Create</button>
                    </footer>
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