import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
    loadSavedPrompts,
    deleteSavedPrompt,
    addSavedPrompt,
    updateSavedPrompt,
    loadPromptCategories
} from '../utils/promptStorage';
import type { SavedPrompt, PromptCategory, Idea } from '../types';
import { PromptIcon, ArrowsUpDownIcon } from './icons';
import ConfirmationModal from './ConfirmationModal';
import SavedPromptCard from './SavedPromptCard';
import TreeView, { TreeViewItem } from './TreeView';
import CategoryPanelToggle from './CategoryPanelToggle';
import PromptEditorModal from './PromptEditorModal';
import LoadingSpinner from './LoadingSpinner';
import PromptDetailView from './PromptDetailView';


interface SavedPromptsProps {
  onSendToEnhancer: (prompt: string) => void;
  isCategoryPanelCollapsed: boolean;
  onToggleCategoryPanel: () => void;
  showGlobalFeedback: (message: string) => void;
  onClipIdea: (idea: Idea) => void;
}

type SortOrder = 'newest' | 'oldest' | 'title';

const getColumnCount = () => {
    if (typeof window === 'undefined') return 1;
    if ((window as any).matchMedia('(min-width: 1536px)').matches) return 4; // 2xl - adjusted for text cards
    if ((window as any).matchMedia('(min-width: 1280px)').matches) return 3; // xl
    if ((window as any).matchMedia('(min-width: 1024px)').matches) return 3; // lg
    if ((window as any).matchMedia('(min-width: 768px)').matches) return 2; // md
    if ((window as any).matchMedia('(min-width: 640px)').matches) return 1; // sm
    return 1;
};


const SavedPrompts: React.FC<SavedPromptsProps> = ({ onSendToEnhancer, isCategoryPanelCollapsed, onToggleCategoryPanel, showGlobalFeedback, onClipIdea }) => {
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [categories, setCategories] = useState<PromptCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
  const [promptToDelete, setPromptToDelete] = useState<SavedPrompt | null>(null);
  const [promptToEdit, setPromptToEdit] = useState<Partial<SavedPrompt> | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [columnCount, setColumnCount] = useState(() => getColumnCount());
  const [detailViewPromptId, setDetailViewPromptId] = useState<string | null>(null);

  useEffect(() => {
    const handleResize = () => {
        setColumnCount(getColumnCount());
    };
    if (typeof window !== 'undefined') {
        (window as any).addEventListener('resize', handleResize);
        return () => (window as any).removeEventListener('resize', handleResize);
    }
  }, []);

  const refreshData = useCallback(async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [loadedPrompts, loadedCategories] = await Promise.all([
            loadSavedPrompts(),
            loadPromptCategories()
        ]);
        setPrompts(loadedPrompts);
        setCategories(loadedCategories);
      } catch (error) {
          const errorMessage = "Failed to load prompt library. Please try refreshing the page.";
          console.error(errorMessage, error);
          setLoadError(errorMessage);
      } finally {
          setIsLoading(false);
      }
  }, []);

  const handleAddNewClick = () => {
    setPromptToEdit(null);
    setIsEditorModalOpen(true);
  };

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const handleSavePrompt = async (promptData: Omit<SavedPrompt, 'id' | 'createdAt'>): Promise<void> => {
    if (promptToEdit && 'id' in promptToEdit) {
      await updateSavedPrompt(promptToEdit.id as string, promptData);
    } else {
      await addSavedPrompt(promptData);
    }
    await refreshData();
    // After saving, if detail view was open, find the new index of the item
    if (detailViewPromptId !== null && promptToEdit && 'id' in promptToEdit) {
        // This is complex, for now we just refresh. A better implementation might find the new item.
    }
    setSelectedCategoryId(promptData.categoryId || 'uncategorized');
  };
  
  const handleUpdatePrompt = async (promptId: string, updates: Partial<Omit<SavedPrompt, 'id' | 'createdAt'>>) => {
      const originalPrompt = prompts.find(p => p.id === promptId);
      if (!originalPrompt) return;

      const { id, createdAt, ...rest } = originalPrompt;
      const promptDataToSave = { ...rest, ...updates };

      await updateSavedPrompt(promptId, promptDataToSave);
      await refreshData();
      showGlobalFeedback('Prompt updated successfully!');
  };


  const handleDeleteClick = (prompt: SavedPrompt) => {
    setPromptToDelete(prompt);
    setIsDeleteModalOpen(true);
  };

  const handleEditClick = (prompt: SavedPrompt) => {
    setPromptToEdit(prompt);
    setIsEditorModalOpen(true);
  };
  
  const handleConfirmDelete = async () => {
    if (promptToDelete) {
      await deleteSavedPrompt(promptToDelete.id);
      await refreshData();
      setIsDeleteModalOpen(false);
      setPromptToDelete(null);
    }
  };

  const handleClipPrompt = (prompt: SavedPrompt) => {
    const newIdea: Idea = {
        id: `clipped-prompt-${prompt.id}-${Date.now()}`,
        lens: 'Prompt Library',
        title: prompt.title || `${prompt.text.substring(0, 30)}...`,
        prompt: prompt.text,
        source: 'Prompt Library'
    };
    onClipIdea(newIdea);
  };

  const handleClipString = (text: string, title: string) => {
    const newIdea: Idea = {
        id: `clipped-string-${Date.now()}`,
        lens: 'Refinement',
        title: title,
        prompt: text,
        source: 'Prompt Detail View'
    };
    onClipIdea(newIdea);
  };

  const treeItems = useMemo<TreeViewItem[]>(() => {
    const allPromptsCount = prompts.length;
    const uncategorizedCount = prompts.filter(p => !p.categoryId).length;

    const allPromptsNode: TreeViewItem = { id: 'all', name: 'All Prompts', icon: 'prompt', count: allPromptsCount };
    const uncategorizedNode: TreeViewItem = { id: 'uncategorized', name: 'Uncategorized', icon: 'inbox', count: uncategorizedCount };

    const sortedCategoryItems: TreeViewItem[] = [...categories]
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .map(cat => ({
        id: cat.id,
        name: cat.name,
        icon: 'folder',
        count: prompts.filter(p => p.categoryId === cat.id).length
      }));
      
    return [allPromptsNode, ...sortedCategoryItems, uncategorizedNode];
  }, [categories, prompts]);

  const sortedAndFilteredPrompts = useMemo(() => {
      let filtered = (selectedCategoryId === 'all')
        ? prompts
        : (selectedCategoryId === 'uncategorized')
          ? prompts.filter(p => !p.categoryId)
          : prompts.filter(p => p.categoryId === selectedCategoryId);

      if (searchQuery.trim()) {
        const lowerCaseQuery = searchQuery.toLowerCase();
        filtered = filtered.filter(prompt => 
          (prompt.title || '').toLowerCase().includes(lowerCaseQuery) ||
          prompt.text.toLowerCase().includes(lowerCaseQuery)
        );
      }
      
      let sorted = [...filtered];
      switch (sortOrder) {
          case 'oldest':
              sorted.sort((a, b) => a.createdAt - b.createdAt);
              break;
          case 'title':
              sorted.sort((a, b) => {
                  const titleA = (a.title || a.text).toLowerCase();
                  const titleB = (b.title || b.text).toLowerCase();
                  return titleA.localeCompare(titleB, undefined, { sensitivity: 'base' });
              });
              break;
          case 'newest':
          default:
              sorted.sort((a, b) => b.createdAt - a.createdAt);
              break;
      }
      return sorted;
  }, [prompts, selectedCategoryId, sortOrder, searchQuery]);

  const columns = useMemo(() => {
    const cols: SavedPrompt[][] = Array.from({ length: columnCount }, () => []);
    sortedAndFilteredPrompts.forEach((item, index) => {
        cols[index % columnCount].push(item);
    });
    return cols;
  }, [sortedAndFilteredPrompts, columnCount]);

  const currentCategoryName = useMemo(() => {
      if (selectedCategoryId === 'all') return 'All Prompts';
      if (selectedCategoryId === 'uncategorized') return 'Uncategorized';
      return categories.find(c => c.id === selectedCategoryId)?.name || 'Category';
  }, [selectedCategoryId, categories]);

  const detailViewIndex = useMemo(() => {
    if (!detailViewPromptId) return null;
    const index = sortedAndFilteredPrompts.findIndex(p => p.id === detailViewPromptId);
    return index !== -1 ? index : null;
  }, [detailViewPromptId, sortedAndFilteredPrompts]);

  if (isLoading) return <div className="flex-grow flex items-center justify-center"><LoadingSpinner /></div>;

  if(loadError) {
      return (
          <div className="flex flex-col items-center justify-center text-center p-4">
              <h2 className="text-xl font-bold text-error mb-2">Error</h2>
              <p className="text-base-content/70 max-w-md">{loadError}</p>
          </div>
      );
  }

  const renderGridView = () => (
      <div className="p-6">
          {sortedAndFilteredPrompts.length > 0 ? (
            <div className="flex gap-4">
                {columns.map((columnItems, colIndex) => (
                    <div key={colIndex} className="flex flex-1 flex-col gap-4 min-w-0">
                        {columnItems.map(prompt => (
                            <SavedPromptCard
                                key={prompt.id}
                                prompt={prompt}
                                onDeleteClick={handleDeleteClick}
                                onEditClick={handleEditClick}
                                onSendToEnhancer={onSendToEnhancer}
                                onOpenDetailView={() => setDetailViewPromptId(prompt.id)}
                                onClip={handleClipPrompt}
                            />
                        ))}
                    </div>
                ))}
            </div>
          ) : (
              <div className="text-center py-16 px-6 flex flex-col justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-base-content/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  <h3 className="mt-2 text-xl font-medium text-base-content">No prompts found</h3>
                  <p className="mt-1 text-base-content/70">There are no prompts matching your search in the "{currentCategoryName}" category.</p>
              </div>
          )}
        </div>
  );
  
  const renderDetailView = () => (
      <div className="overflow-hidden h-full">
          <PromptDetailView
              prompts={sortedAndFilteredPrompts}
              currentIndex={detailViewIndex!}
              onClose={() => setDetailViewPromptId(null)}
              onNavigate={(newIndex) => {
                  const newPrompt = sortedAndFilteredPrompts[newIndex];
                  if (newPrompt) setDetailViewPromptId(newPrompt.id);
              }}
              onDelete={(prompt) => {
                  setDetailViewPromptId(null);
                  handleDeleteClick(prompt);
              }}
              onUpdate={handleUpdatePrompt}
              onSendToEnhancer={(text) => {
                  setDetailViewPromptId(null);
                  onSendToEnhancer(text);
              }}
              showGlobalFeedback={showGlobalFeedback}
              onClip={handleClipPrompt}
              onClipString={handleClipString}
          />
      </div>
  );

  return (
    <>
      <section className="flex flex-row h-full">
        <aside className={`relative flex-shrink-0 bg-base-100 transition-all duration-300 ease-in-out ${isCategoryPanelCollapsed ? 'w-0' : 'w-80'}`}>
          <CategoryPanelToggle isCollapsed={isCategoryPanelCollapsed} onToggle={onToggleCategoryPanel} />
          <div className={`h-full overflow-y-auto p-4 transition-opacity duration-200 ${isCategoryPanelCollapsed ? 'opacity-0' : 'opacity-100'}`}>
              <h2 className="px-3 pt-2 pb-2 text-xs font-semibold text-base-content/60 uppercase tracking-wider">
                Categories
              </h2>
              <TreeView
                  items={treeItems}
                  selectedId={selectedCategoryId}
                  onSelect={setSelectedCategoryId}
              />
          </div>
        </aside>

        <main className="relative flex-grow flex flex-col h-full overflow-hidden">
            {prompts.length === 0 ? (
                <div className="text-center py-16 px-6 flex flex-col items-center justify-center h-full">
                    <PromptIcon className="mx-auto h-12 w-12 text-base-content/40" />
                    <h3 className="mt-2 text-xl font-medium text-base-content">Your Prompt Library is Empty</h3>
                    <p className="mt-1 text-base-content/70">
                        Add your first prompt to get started, or save prompts from the 'Refiner' tab.
                    </p>
                    <div className="mt-6">
                        <button
                            onClick={handleAddNewClick}
                            className="btn btn-primary btn-sm"
                        >
                            Add New Prompt
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    {/* Controls Bar */}
                    <div className="flex-shrink-0 bg-base-100 px-6 py-4 border-b border-l border-base-300 flex items-center gap-4">
                        <div className="flex-grow">
                             <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery((e.currentTarget as any).value)}
                                placeholder={`Search in ${currentCategoryName}...`}
                                className="input input-bordered w-full input-sm"
                            />
                        </div>

                        <div className="flex items-center gap-4 flex-shrink-0">
                             <div className="relative">
                                <select 
                                    value={sortOrder}
                                    onChange={(e) => setSortOrder((e.currentTarget as any).value as SortOrder)}
                                    className="select select-bordered select-sm"
                                >
                                    <option value="newest">Newest</option>
                                    <option value="oldest">Oldest</option>
                                    <option value="title">Title</option>
                                </select>
                                <ArrowsUpDownIcon className="w-4 h-4 text-base-content/40 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                            <button 
                                onClick={handleAddNewClick} 
                                className="btn btn-primary btn-sm"
                            >
                                Add New Prompt
                            </button>
                        </div>
                    </div>
                    <div className="flex-grow overflow-y-auto">
                        {detailViewIndex !== null && sortedAndFilteredPrompts[detailViewIndex] ? renderDetailView() : renderGridView()}
                    </div>
                </>
            )}
        </main>
      </section>
      
      <PromptEditorModal
        isOpen={isEditorModalOpen}
        onClose={() => setIsEditorModalOpen(false)}
        onSave={handleSavePrompt}
        categories={categories}
        editingPrompt={promptToEdit}
      />
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Saved Prompt"
        message={`Are you sure you want to permanently delete this prompt? This action cannot be undone.`}
      />
    </>
  );
};

export default SavedPrompts;