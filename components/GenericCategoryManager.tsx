import React, { useState, useEffect } from 'react';
import { EditIcon, DeleteIcon, CheckIcon, PlusIcon } from './icons';
import ConfirmationModal from './ConfirmationModal';

interface Category {
  id: string;
  name: string;
}

interface GenericCategoryManagerProps {
  title: string;
  loadFn: () => Category[] | Promise<Category[]>;
  addFn: (name: string) => Category[] | Promise<Category[]>;
  updateFn: (id: string, name: string) => Category[] | Promise<Category[]>;
  deleteFn: (id: string) => Category[] | Promise<Category[]>;
  deleteConfirmationMessage: (name: string) => string;
}

const GenericCategoryManager: React.FC<GenericCategoryManagerProps> = ({
  title,
  loadFn,
  addFn,
  updateFn,
  deleteFn,
  deleteConfirmationMessage,
}) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);

  useEffect(() => {
    Promise.resolve(loadFn()).then(setCategories);
  }, [loadFn]);

  const showFeedback = (message: string) => {
    setFeedback(message);
    setTimeout(() => setFeedback(''), 3000);
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newCategoryName.trim()) {
      const updated = await addFn(newCategoryName.trim());
      setCategories(updated);
      setNewCategoryName('');
      showFeedback(`Folder "${newCategoryName.trim()}" added.`);
    }
  };

  const handleEditStart = (category: Category) => {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
  };

  const handleEditCancel = () => {
    setEditingCategoryId(null);
    setEditingCategoryName('');
  };

  const handleEditSave = async (id: string) => {
    if (editingCategoryName.trim()) {
      const updated = await updateFn(id, editingCategoryName.trim());
      setCategories(updated);
      handleEditCancel();
      showFeedback(`Folder renamed to "${editingCategoryName.trim()}".`);
    }
  };

  const handleDeleteClick = (category: Category) => {
    setCategoryToDelete(category);
    setIsModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (categoryToDelete) {
      const updated = await deleteFn(categoryToDelete.id);
      setCategories(updated);
      showFeedback(`Folder "${categoryToDelete.name}" deleted.`);
    }
  };

  return (
    <>
      <div className="flex flex-col h-full bg-base-100/40 backdrop-blur-xl">
        <header className="p-6">
            <h3 className="text-xs font-black uppercase tracking-[0.4em] text-primary">{title}</h3>
        </header>

        <form onSubmit={handleAddCategory} className="p-6 flex gap-4 items-center">
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName((e.currentTarget as any).value)}
            placeholder="Enter new folder name..."
            className="form-input flex-grow"
          />
          <button
            type="submit"
            className="p-2 text-primary hover:text-primary-focus transition-colors"
            title="Create Folder"
          >
            <PlusIcon className="w-6 h-6" />
          </button>
        </form>

        <div className="flex-grow overflow-y-auto">
          {categories.length > 0 ? (
            <div className="flex flex-col">
                {categories.map((cat) => (
                <div key={cat.id} className="p-6 flex items-center justify-between hover:bg-base-200/30 transition-all">
                    {editingCategoryId === cat.id ? (
                    <input
                        type="text"
                        value={editingCategoryName}
                        onChange={(e) => setEditingCategoryName((e.currentTarget as any).value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleEditSave(cat.id)}
                        onBlur={() => handleEditSave(cat.id)}
                        autoFocus
                        className="form-input flex-grow"
                    />
                    ) : (
                    <div className="flex flex-col min-w-0">
                         <span className="text-[9px] font-black uppercase tracking-widest text-base-content/20 mb-1">ID: {cat.id.slice(-6)}</span>
                         <span className="text-xl font-bold text-base-content truncate">{cat.name}</span>
                    </div>
                    )}
                    <div className="flex items-center gap-2 ml-4">
                    {editingCategoryId === cat.id ? (
                        <button onClick={() => handleEditSave(cat.id)} title="Save" className="p-1.5 text-success/40 hover:text-success transition-colors">
                        <CheckIcon className="w-5 h-5" />
                        </button>
                    ) : (
                        <button onClick={() => handleEditStart(cat)} title="Rename" className="p-1.5 opacity-20 hover:opacity-100 transition-opacity">
                        <EditIcon className="w-5 h-5" />
                        </button>
                    )}
                    <button onClick={() => handleDeleteClick(cat)} title="Delete" className="p-1.5 text-error/20 hover:text-error transition-colors">
                        <DeleteIcon className="w-5 h-5" />
                    </button>
                    </div>
                </div>
                ))}
            </div>
          ) : (
            <div className="p-20 text-center">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-base-content/20">No folders created yet.</p>
            </div>
          )}
        </div>

        {feedback && (
          <div className="p-4 bg-success/10 border-t border-success/20 text-success text-[10px] font-black uppercase tracking-widest text-center">
            {feedback}
          </div>
        )}
      </div>
      <ConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Folder"
        message={categoryToDelete ? deleteConfirmationMessage(categoryToDelete.name) : ''}
      />
    </>
  );
};

export default GenericCategoryManager;