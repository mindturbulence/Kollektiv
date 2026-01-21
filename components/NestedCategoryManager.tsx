
import React, { useState, useEffect, useMemo } from 'react';
import { 
    EditIcon, DeleteIcon, CheckIcon, ChevronDownIcon, 
    ArrowsUpDownIcon, FolderClosedIcon, GitBranchIcon, PlusIcon
} from './icons';
import ConfirmationModal from './ConfirmationModal';

interface Category {
  id: string;
  name: string;
  parentId?: string;
  order: number;
  isNsfw?: boolean;
}

interface NestedCategoryManagerProps {
  title: string;
  type: 'gallery' | 'prompt';
  loadFn: () => Promise<Category[]>;
  addFn: (name: string, isNsfw: boolean, parentId?: string) => Promise<Category[]>;
  updateFn: (id: string, updates: any) => Promise<Category[]>;
  deleteFn: (id: string) => Promise<Category[]>;
  saveOrderFn: (categories: Category[]) => Promise<void>;
  deleteConfirmationMessage: (name: string) => string;
}

const CategoryItem: React.FC<{
    category: Category;
    allCategories: Category[];
    level: number;
    onEdit: (cat: Category) => void;
    onDelete: (cat: Category) => void;
    onAddSub: (parentId: string) => void;
    onMove: (id: string, direction: 'up' | 'down') => void;
    onReparent: (id: string, newParentId?: string) => void;
}> = ({ category, allCategories, level, onEdit, onDelete, onAddSub, onMove, onReparent }) => {
    const children = allCategories.filter(c => c.parentId === category.id).sort((a, b) => a.order - b.order);
    const siblings = allCategories.filter(c => c.parentId === category.parentId).sort((a, b) => a.order - b.order);
    const index = siblings.findIndex(s => s.id === category.id);
    
    // Valid potential parents: any category that isn't this one or one of its descendants
    const getPotentialParents = () => {
        const descendants = new Set<string>();
        const findDescendants = (id: string) => {
            allCategories.filter(c => c.parentId === id).forEach(child => {
                descendants.add(child.id);
                findDescendants(child.id);
            });
        };
        findDescendants(category.id);
        return allCategories.filter(c => c.id !== category.id && !descendants.has(c.id));
    };

    const potentialParents = getPotentialParents();

    return (
        <div className="flex flex-col">
            <div 
                className="group flex items-center gap-4 p-4 border-b border-base-300 hover:bg-base-200/50 transition-all"
                style={{ paddingLeft: `${(level * 24) + 16}px` }}
            >
                <div className="flex items-center gap-3 flex-grow min-w-0">
                    <div className="flex flex-col gap-1 opacity-20 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => onMove(category.id, 'up')} disabled={index === 0} className="btn btn-xs btn-ghost btn-square disabled:opacity-0"><ChevronDownIcon className="w-3 h-3 rotate-180"/></button>
                        <button onClick={() => onMove(category.id, 'down')} disabled={index === siblings.length - 1} className="btn btn-xs btn-ghost btn-square disabled:opacity-0"><ChevronDownIcon className="w-3 h-3"/></button>
                    </div>
                    
                    <div className="flex flex-col min-w-0">
                         <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-base-content truncate">{category.name}</span>
                            {category.isNsfw && <div className="badge badge-warning badge-xs rounded-none font-black text-[8px]">NSFW</div>}
                         </div>
                         <span className="text-[9px] font-black uppercase tracking-widest text-base-content/20">Level {level} • ID: {category.id.slice(-6)}</span>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <div className="dropdown dropdown-end">
                        <div tabIndex={0} role="button" className="btn btn-xs btn-ghost opacity-40 hover:opacity-100 font-black text-[9px] tracking-widest">MOVE TO</div>
                        <ul tabIndex={0} className="dropdown-content menu p-2 shadow-2xl bg-base-200 rounded-box w-52 z-50 border border-base-300">
                            <li><a onClick={() => onReparent(category.id, undefined)} className="text-xs font-bold uppercase">Root Level</a></li>
                            {potentialParents.map(p => (
                                <li key={p.id}><a onClick={() => onReparent(category.id, p.id)} className={`text-xs font-bold uppercase ${category.parentId === p.id ? 'active' : ''}`}>{p.name}</a></li>
                            ))}
                        </ul>
                    </div>
                    <button onClick={() => onAddSub(category.id)} className="btn btn-sm btn-ghost btn-square opacity-40 hover:opacity-100 text-primary" title="Add Subfolder"><PlusIcon className="w-4 h-4"/></button>
                    <button onClick={() => onEdit(category)} className="btn btn-sm btn-ghost btn-square opacity-40 hover:opacity-100" title="Edit"><EditIcon className="w-4 h-4"/></button>
                    <button onClick={() => onDelete(category)} className="btn btn-sm btn-ghost btn-square opacity-40 hover:opacity-100 text-error" title="Delete"><DeleteIcon className="w-4 h-4"/></button>
                </div>
            </div>
            
            {children.map(child => (
                <CategoryItem 
                    key={child.id} 
                    category={child} 
                    allCategories={allCategories} 
                    level={level + 1} 
                    onEdit={onEdit} 
                    onDelete={onDelete} 
                    onAddSub={onAddSub}
                    onMove={onMove}
                    onReparent={onReparent}
                />
            ))}
        </div>
    );
};

export const NestedCategoryManager: React.FC<NestedCategoryManagerProps> = ({
  title, type, loadFn, addFn, updateFn, deleteFn, saveOrderFn, deleteConfirmationMessage,
}) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');
  const [editIsNsfw, setEditIsNsfw] = useState(false);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addParentId, setAddParentId] = useState<string | undefined>(undefined);
  const [addName, setAddName] = useState('');
  const [addIsNsfw, setAddIsNsfw] = useState(false);

  useEffect(() => {
    loadFn().then(setCategories);
  }, [loadFn]);

  const handleReorder = async (id: string, direction: 'up' | 'down') => {
      const cat = categories.find(c => c.id === id);
      if (!cat) return;
      const siblings = categories.filter(c => c.parentId === cat.parentId).sort((a, b) => a.order - b.order);
      const index = siblings.findIndex(s => s.id === id);
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      
      if (targetIndex < 0 || targetIndex >= siblings.length) return;
      
      const targetCat = siblings[targetIndex];
      const newOrderA = targetCat.order;
      const newOrderB = cat.order;
      
      const updated = categories.map(c => {
          if (c.id === cat.id) return { ...c, order: newOrderA };
          if (c.id === targetCat.id) return { ...c, order: newOrderB };
          return c;
      });
      
      setCategories(updated);
      await saveOrderFn(updated);
  };

  const handleReparent = async (id: string, newParentId?: string) => {
      const updated = await updateFn(id, { parentId: newParentId });
      setCategories(updated);
  };

  const handleSaveEdit = async () => {
      if (editingCategory && editName.trim()) {
          const updated = await updateFn(editingCategory.id, { name: editName.trim(), isNsfw: editIsNsfw });
          setCategories(updated);
          setIsEditModalOpen(false);
      }
  };

  const handleConfirmAdd = async () => {
      if (addName.trim()) {
          const updated = await addFn(addName.trim(), addIsNsfw, addParentId);
          setCategories(updated);
          setIsAddModalOpen(false);
          setAddName('');
          setAddIsNsfw(false);
          setAddParentId(undefined);
      }
  };

  const rootCategories = categories.filter(c => !c.parentId).sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col h-full bg-base-100">
        <header className="p-6 border-b border-base-300 bg-base-200/10 flex justify-between items-center">
            <h3 className="text-xs font-black uppercase tracking-[0.4em] text-primary">{title}</h3>
            <button 
                onClick={() => { setAddParentId(undefined); setIsAddModalOpen(true); }}
                className="btn btn-primary btn-sm rounded-none font-black text-[10px] tracking-widest px-6"
            >
                NEW FOLDER
            </button>
        </header>

        <div className="flex-grow overflow-y-auto">
            {categories.length > 0 ? (
                <div className="flex flex-col">
                    {rootCategories.map(cat => (
                        <CategoryItem 
                            key={cat.id} 
                            category={cat} 
                            allCategories={categories} 
                            level={0}
                            onEdit={(c) => { setEditingCategory(c); setEditName(c.name); setEditIsNsfw(!!c.isNsfw); setIsEditModalOpen(true); }}
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
                    <p className="text-xs font-bold uppercase tracking-[0.2em]">Repository Empty</p>
                </div>
            )}
        </div>

        {/* Create/Add Modal */}
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
                            <input type="text" value={addName} onChange={e => setAddName((e.currentTarget as any).value)} className="input input-bordered rounded-none font-bold tracking-tight" autoFocus />
                        </div>
                        {type === 'gallery' && (
                            <label className="label cursor-pointer justify-start gap-4">
                                <span className="text-[10px] font-black uppercase tracking-widest text-base-content/40">NSFW Content</span>
                                <input type="checkbox" checked={addIsNsfw} onChange={e => setAddIsNsfw((e.currentTarget as any).checked)} className="checkbox checkbox-primary rounded-none" />
                            </label>
                        )}
                    </div>
                    <footer className="p-4 border-t border-base-300 flex justify-end gap-2 bg-base-200/10">
                        <button onClick={() => setIsAddModalOpen(false)} className="btn btn-ghost rounded-none uppercase font-black text-[10px] tracking-widest px-8">Abort</button>
                        <button onClick={handleConfirmAdd} disabled={!addName.trim()} className="btn btn-primary rounded-none uppercase font-black text-[10px] tracking-widest px-8">Create</button>
                    </footer>
                </div>
            </div>
        )}

        {/* Edit Modal */}
        {isEditModalOpen && (
            <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 animate-fade-in" onClick={() => setIsEditModalOpen(false)}>
                <div className="bg-base-100 rounded-none border border-base-300 shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
                    <header className="p-8 border-b border-base-300 bg-base-200/20">
                        <h3 className="text-4xl font-black tracking-tighter text-base-content uppercase leading-none">Modify Identity</h3>
                    </header>
                    <div className="p-8 space-y-6">
                        <div className="form-control">
                            <label className="text-[10px] font-black uppercase tracking-widest text-base-content/40 mb-2">Renaming</label>
                            <input type="text" value={editName} onChange={e => setEditName((e.currentTarget as any).value)} className="input input-bordered rounded-none font-bold tracking-tight" autoFocus />
                        </div>
                        {type === 'gallery' && (
                             <label className="label cursor-pointer justify-start gap-4">
                                <span className="text-[10px] font-black uppercase tracking-widest text-base-content/40">NSFW Content</span>
                                <input type="checkbox" checked={editIsNsfw} onChange={e => setEditIsNsfw((e.currentTarget as any).checked)} className="checkbox checkbox-primary rounded-none" />
                            </label>
                        )}
                    </div>
                    <footer className="p-4 border-t border-base-300 flex justify-end gap-2 bg-base-200/10">
                        <button onClick={() => setIsEditModalOpen(false)} className="btn btn-ghost rounded-none uppercase font-black text-[10px] tracking-widest px-8">Discard</button>
                        <button onClick={handleSaveEdit} disabled={!editName.trim()} className="btn btn-primary rounded-none uppercase font-black text-[10px] tracking-widest px-8">Commit</button>
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
