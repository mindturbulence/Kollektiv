import React, { useState, useEffect } from 'react';
import { EditIcon, DeleteIcon, CheckIcon } from './icons';
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
      showFeedback(`Category "${newCategoryName.trim()}" added.`);
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
      showFeedback(`Category renamed to "${editingCategoryName.trim()}".`);
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
      showFeedback(`Category "${categoryToDelete.name}" deleted.`);
    }
  };

  return (
    <>
      <div className="bg-base-100 p-6 sm:p-8 rounded-xl shadow-2xl h-full flex flex-col">
        <h3 className="text-xl font-semibold text-primary mb-4 flex-shrink-0">{title}</h3>

        <form onSubmit={handleAddCategory} className="flex gap-4 mb-6 flex-shrink-0">
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName((e.currentTarget as any).value)}
            placeholder="New category name"
            className="input input-bordered input-sm flex-grow"
          />
          <button
            type="submit"
            className="btn btn-primary btn-sm"
          >
            Add
          </button>
        </form>

        <div className="space-y-3 flex-grow overflow-y-auto pr-2">
          {categories.length > 0 ? (
            categories.map((cat) => (
              <div key={cat.id} className="p-3 rounded-lg flex items-center justify-between hover:bg-base-200 transition-colors">
                {editingCategoryId === cat.id ? (
                  <input
                    type="text"
                    value={editingCategoryName}
                    onChange={(e) => setEditingCategoryName((e.currentTarget as any).value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleEditSave(cat.id)}
                    onBlur={() => handleEditSave(cat.id)}
                    autoFocus
                    className="flex-grow p-1 bg-base-300 text-base-content border border-primary rounded-md outline-none"
                  />
                ) : (
                  <span className="text-base-content flex-grow">{cat.name}</span>
                )}
                <div className="flex items-center gap-2 ml-4">
                  {editingCategoryId === cat.id ? (
                    <button onClick={() => handleEditSave(cat.id)} title="Save" className="btn btn-sm btn-ghost btn-square text-success">
                      <CheckIcon className="w-5 h-5" />
                    </button>
                  ) : (
                    <button onClick={() => handleEditStart(cat)} title="Rename" className="btn btn-sm btn-ghost btn-square text-primary">
                      <EditIcon className="w-5 h-5" />
                    </button>
                  )}
                  <button onClick={() => handleDeleteClick(cat)} title="Delete" className="btn btn-sm btn-ghost btn-square text-error">
                    <DeleteIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-base-content/70 text-center py-4">No categories created yet. Add one above to get started.</p>
          )}
        </div>

        {feedback && (
          <div className="mt-4 p-3 bg-success/20 border border-success/30 text-success rounded-lg text-center text-sm flex-shrink-0">
            {feedback}
          </div>
        )}
      </div>
      <ConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Category"
        message={categoryToDelete ? deleteConfirmationMessage(categoryToDelete.name) : ''}
      />
    </>
  );
};

export default GenericCategoryManager;