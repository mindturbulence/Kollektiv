import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import type { DesignCollection, DesignRecipe, RecipePageType } from '../types';
import { loadDesignLibrary, deleteRecipe, findOrphanRecipes, rebuildIndexFromDisk } from '../utils/designLibraryStorage';
import { collectTags, filterRecipes, libraryStats, sortRecipes, topTags, RECIPE_PAGE_TYPES, type RecipeSortMode } from '../utils/designLibraryFilter';
import { buildTree, inCollection, recipeCounts, type CollectionNode } from '../utils/designCollections';
import { audioService } from '../services/audioService';
import { SearchIcon, CloseIcon, GridViewIcon, PaletteIcon, TypeIcon } from './icons';
import EmptyState from './EmptyState';
import ConfirmationModal from './ConfirmationModal';
import Modal from './Modal';
import TreeView, { type TreeViewItem } from './TreeView';
import CategoryPanelToggle from './CategoryPanelToggle';
import DesignLibrarySection from './settings/DesignLibrarySection';
import DesignRecipeAddModal from './DesignRecipeAddModal';
import DesignRecipeDetail from './DesignRecipeDetail';
import UseRecipeModal from './UseRecipeModal';
import DesignRecipeCard from './DesignRecipeCard';
import DesignLibraryList from './DesignLibraryList';
import DesignRecipePreview from './DesignRecipePreview';
import { loadBriefDraft } from '../utils/designExport';
import { compileRecipePrompt } from '../utils/designRecipePrompt';
import { PaperScope } from './PaperScope';
import { useMediaQuery } from '../hooks/useMediaQuery';

interface DesignLibraryProps {
  showGlobalFeedback: (message: string, isError?: boolean) => void;
  /** Notified when a card is opened (the detail editor opens regardless). */
  onOpenRecipe?: (id: string) => void;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; recipes: DesignRecipe[]; collections: DesignCollection[]; safeToSave: boolean };

const TAG_ROW_SIZE = 8;

const SORT_OPTIONS: { mode: RecipeSortMode; label: string }[] = [
  { mode: 'recent', label: 'Recent' },
  { mode: 'az', label: 'A–Z' },
  { mode: 'random', label: 'Random' },
];

type LibraryView = 'gallery' | 'library';

const VIEW_KEY = 'kollektiv.designLibraryView';
const VIEW_OPTIONS: { value: LibraryView; label: string }[] = [
  { value: 'gallery', label: 'Gallery' },
  { value: 'library', label: 'Library' },
];
// Tailwind's `lg`: the master-detail view needs the width, below it the gallery is shown whatever was chosen.
const WIDE_QUERY = '(min-width: 1024px)';
// Tailwind's `md`: below it the collections panel starts collapsed and opens as an overlay.
const MD_QUERY = '(min-width: 768px)';

/** Storage may be blocked or hold junk: any failure yields the default (Gallery). */
const loadView = (): LibraryView => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'library' ? 'library' : 'gallery';
  } catch {
    return 'gallery';
  }
};

const saveView = (view: LibraryView): void => {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Remembering the view is a convenience only.
  }
};

const newSeed = () => Math.floor(Math.random() * 2 ** 31);

const errorText =(e: unknown): string => (e instanceof Error ? e.message : String(e));

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

const toTreeItems = (nodes: CollectionNode[], counts: Map<string, number>): TreeViewItem[] =>
  nodes.map(({ collection, children }) => ({
    id: collection.id,
    name: collection.name,
    icon: 'folder' as const,
    count: counts.get(collection.id) ?? 0,
    children: toTreeItems(children, counts),
  }));

const DesignLibraryView: React.FC<DesignLibraryProps> = ({ showGlobalFeedback, onOpenRecipe }) => {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [query, setQuery] = useState('');
  const [pageType, setPageType] = useState<'all' | RecipePageType>('all');
  const [tag, setTag] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [toDelete, setToDelete] = useState<DesignRecipe | null>(null);
  const [toUse, setToUse] = useState<DesignRecipe | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState('all');
  const [view, setView] = useState<LibraryView>(loadView);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const isWide = useMediaQuery(WIDE_QUERY);
  const isMd = useMediaQuery(MD_QUERY);
  // Library view gives the preview the width and a phone has none to spare, so the collections panel starts collapsed there (not persisted).
  const [panelCollapsed, setPanelCollapsed] = useState(() => view === 'library' || !isMd);
  const [manageOpen, setManageOpen] = useState(false);
  const [sortMode, setSortMode] = useState<RecipeSortMode>('recent');
  const [seed, setSeed] = useState(1);
  const [showAllTags, setShowAllTags] = useState(false);

  const [orphanCount, setOrphanCount] = useState(0);
  const [rebuilding, setRebuilding] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { recipes, collections, safeToSave } = await loadDesignLibrary();
      setState({ status: 'ready', recipes: [...recipes].sort((a, b) => b.createdAt - a.createdAt), collections, safeToSave });
    } catch (e) {
      setState({ status: 'error', message: errorText(e) });
      return;
    }
    // The orphan scan is a safety net only: any failure counts as "none" and never affects the page.
    try {
      setOrphanCount((await findOrphanRecipes()).orphans.length);
    } catch {
      setOrphanCount(0);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const recipes = state.status === 'ready' ? state.recipes : [];
  const collections = state.status === 'ready' ? state.collections : [];
  const safeToSave = state.status === 'ready' && state.safeToSave;
  const tags = useMemo(() => collectTags(recipes), [recipes]);
  // A tag chosen earlier may vanish after a delete/reload; treat it as unset instead of showing an empty grid.
  const activeTag = tag && tags.some((t) => t.toLowerCase() === tag.toLowerCase()) ? tag : null;
  // Same for the selected collection: once it is gone (deleted in Manage) the view falls back to All.
  const activeSelection = selectedId === 'unsorted' || collections.some((c) => c.id === selectedId) ? selectedId : 'all';
  const inScope = useMemo(() => inCollection(recipes, collections, activeSelection), [recipes, collections, activeSelection]);
  const visible = useMemo(() => filterRecipes(inScope, { query, pageType, tag: activeTag }), [inScope, query, pageType, activeTag]);
  const sorted = useMemo(() => sortRecipes(visible, sortMode, seed), [visible, sortMode, seed]);
  // Stats describe the collection scope, not the filtered grid, so the tiles stay put while typing.
  const stats = useMemo(() => libraryStats(inScope), [inScope]);
  const statTiles = [
    { label: 'Recipes', value: stats.recipes, Icon: GridViewIcon },
    { label: 'Colours', value: stats.colours, Icon: PaletteIcon },
    { label: 'Fonts', value: stats.fonts, Icon: TypeIcon },
  ];
  // Collapsed row keeps the most-used tags; a selected tag outside it is pinned at the end so the active filter stays visible.
  const { tagChips, hiddenTagCount } = useMemo(() => {
    const { shown, hiddenCount } = topTags(tags, TAG_ROW_SIZE);
    if (showAllTags) return { tagChips: tags, hiddenTagCount: 0 };
    const pinned = activeTag && !shown.some((t) => t.toLowerCase() === activeTag.toLowerCase()) ? [activeTag] : [];
    return { tagChips: [...shown, ...pinned], hiddenTagCount: hiddenCount - pinned.length };
  }, [tags, activeTag, showAllTags]);
  const treeItems = useMemo<TreeViewItem[]>(() => [
    { id: 'all', name: 'All recipes', icon: 'app', count: recipes.length },
    { id: 'unsorted', name: 'Unsorted', icon: 'inbox', count: inCollection(recipes, collections, 'unsorted').length },
    ...toTreeItems(buildTree(collections), recipeCounts(collections, recipes)),
  ], [recipes, collections]);

  const isLibrary = view === 'library' && isWide;
  // A selection that is filtered out, deleted or not yet made falls back to the first row shown.
  const selected = sorted.find((r) => r.id === selectedRecipeId) ?? sorted[0];

  const changeView = (next: LibraryView) => {
    audioService.playClick();
    setView(next);
    saveView(next);
    setPanelCollapsed(next === 'library');
  };
  // The phone overlay would keep covering the list the user just chose from.
  const selectCollection = (id: string) => { setSelectedId(id); if (!isMd) setPanelCollapsed(true); };
  const openRecipe = (id: string) => { audioService.playClick(); setOpenId(id); onOpenRecipe?.(id); };
  const closeDetail = () => { setOpenId(null); void refresh(); };
  const closeManage = () => { setManageOpen(false); void refresh(); };

  const openAdd = () => { audioService.playClick(); setActionError(null); setIsAddOpen(true); };

  const rebuildIndex = async () => {
    audioService.playClick();
    setActionError(null);
    setRebuilding(true);
    try {
      const { recovered, unreadable } = await rebuildIndexFromDisk();
      showGlobalFeedback(`Recovered ${plural(recovered, 'recipe')}${unreadable > 0 ? `, ${unreadable} could not be read` : ''}`);
    } catch (e) {
      setActionError(`Could not rebuild the library index: ${errorText(e)}`);
    }
    setRebuilding(false);
    await refresh();
  };

  const confirmDelete = async (recipe: DesignRecipe) => {
    setToDelete(null);
    try {
      await deleteRecipe(recipe.id);
      showGlobalFeedback(`Deleted "${recipe.title}"`);
    } catch (e) {
      setActionError(`Could not delete "${recipe.title}": ${errorText(e)}`);
    }
    await refresh();
  };

  // Copies the saved brief's prompt; any gap (no draft, no clipboard, write refused) falls back to the Use dialog, which asks for the brief.
  const copyPrompt = async (recipe: DesignRecipe) => {
    audioService.playClick();
    const { brief, mode } = loadBriefDraft();
    if (!brief.project.trim() || !brief.pages.trim()) { setToUse(recipe); return; }
    try {
      await navigator.clipboard.writeText(compileRecipePrompt(brief, mode, { zip: false }));
      showGlobalFeedback('Prompt copied. Export the files too so the agent can see the screenshots.');
    } catch {
      showGlobalFeedback('Could not copy — open Use recipe instead.', true);
      setToUse(recipe);
    }
  };

  if (openId) {
    return <DesignRecipeDetail recipeId={openId} onBack={closeDetail} showGlobalFeedback={showGlobalFeedback} />;
  }

  if (state.status === 'loading') {
    return <div className="h-full w-full flex items-center justify-center bg-transparent"><ThinkingOrb state="working" size={64} /></div>;
  }

  if (state.status === 'error') {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <EmptyState
          icon="◨"
          title="Library unavailable"
          body={`The design library could not be read. Make sure your vault folder is connected and accessible. (${state.message})`}
          action={{ label: 'Retry', onClick: () => { setState({ status: 'loading' }); void refresh(); } }}
        />
      </div>
    );
  }

  return (
    <section className="flex flex-col h-full w-full relative overflow-hidden">
      <div className={`flex flex-row h-full w-full overflow-hidden relative z-raised gap-6 p-2 ${isLibrary ? 'md:p-3' : 'md:p-6'}`}>
      {/* Below md the panel is an overlay (out of flow), so collapsed it costs the content no width. */}
      <aside className={`absolute inset-y-2 left-2 md:relative md:inset-auto z-dropdown flex-shrink-0 transition-[width] duration-300 ease-in-out flex flex-col overflow-visible ${panelCollapsed ? 'w-0' : 'w-64'}`}>
        <CategoryPanelToggle isCollapsed={panelCollapsed} onToggle={() => setPanelCollapsed((c) => !c)} position="right" />
        <div className={`paper-card flex flex-col h-full w-full relative transition-opacity duration-300 ${panelCollapsed ? 'opacity-0 invisible' : 'opacity-100 visible'}`}>
          <div className="flex-shrink-0 h-12 px-4 flex items-center justify-between border-b border-base-content/10">
            <h2 className="text-sm font-semibold">Collections</h2>
            <button
              type="button"
              onClick={() => { audioService.playClick(); setManageOpen(true); }}
              className="paper-btn paper-btn-ghost paper-btn-sm"
            >
              Manage
            </button>
          </div>
          <div className="flex-grow overflow-y-auto p-3 w-full">
            <TreeView items={treeItems} selectedId={activeSelection} onSelect={selectCollection} />
          </div>
        </div>
      </aside>
      <div className="relative z-raised flex-1 flex flex-col h-full min-w-0 overflow-hidden">
          {/* Library view: the panes get at least 24rem and share the column's height; when the viewport is too short for chrome + panes the whole column scrolls instead of squeezing them. */}
          <div className={`h-full w-full overflow-y-auto ${isLibrary ? 'flex flex-col' : ''}`}>
            <header className={`shrink-0 ${isLibrary ? 'pb-2' : 'pb-4 md:pb-6'}`}>
              <div className={isLibrary ? 'flex items-center justify-between gap-3' : 'flex flex-col lg:flex-row lg:items-end justify-between gap-3 lg:gap-4'}>
                <div className="space-y-1 min-w-0">
                  {!isLibrary && <span className="text-xs font-medium text-base-content/60 block">Vault</span>}
                  <h1 className={`paper-title leading-none ${isLibrary ? 'text-3xl' : 'text-2xl md:text-3xl lg:text-4xl'}`}>Web Design</h1>
                  {!isLibrary && <p className="text-sm text-base-content/60 pt-1">Reference designs you can turn into a prompt for your coding agent.</p>}
                </div>
                <dl className={`grid grid-cols-3 shrink-0 ${isLibrary ? 'gap-2' : 'gap-2 md:gap-3'}`}>
                  {statTiles.map(({ label, value, Icon }) => (
                    <div key={label} className={`paper-card flex items-start justify-between gap-2 ${isLibrary ? 'px-3 py-1.5' : 'px-3 py-2 md:min-w-28 lg:gap-4 lg:px-4 lg:py-3'}`}>
                      <div className={`flex ${isLibrary ? 'flex-row-reverse items-baseline gap-1.5' : 'flex-col-reverse'}`}>
                        <dt className={`text-xs text-base-content/60 ${isLibrary ? '' : 'mt-1'}`}>{label}</dt>
                        <dd className={`font-semibold leading-none ${isLibrary ? 'text-lg' : 'text-2xl'}`}>{value}</dd>
                      </div>
                      {!isLibrary && <Icon className="w-4 h-4 text-base-content/40" aria-hidden="true" />}
                    </div>
                  ))}
                </dl>
              </div>
            </header>

            {!safeToSave && (
              <p role="status" className="paper-notice mb-3 border border-warning/30 bg-warning/10 text-warning">
                The library manifest could not be read safely, so it is read-only to protect your existing recipes. Reconnect your vault or restore the manifest, then reload.
              </p>
            )}
            {actionError && (
              <div role="alert" className="paper-notice mb-3 flex items-center gap-3 border border-error/30 bg-error/10 text-error">
                <span className="flex-1 break-words">{actionError}</span>
                <button type="button" aria-label="Dismiss" onClick={() => setActionError(null)} className="paper-btn paper-btn-ghost paper-btn-icon"><CloseIcon className="w-3 h-3" /></button>
              </div>
            )}
            {orphanCount > 0 && (
              <div role="status" className="paper-notice mb-3 flex flex-wrap items-center gap-3 border border-warning/30 bg-warning/10 text-warning">
                <span className="flex-1 min-w-48">
                  Found {plural(orphanCount, 'recipe folder')} that {orphanCount === 1 ? 'is' : 'are'} not in the library index.
                </span>
                <button
                  type="button"
                  onClick={() => { void rebuildIndex(); }}
                  disabled={!safeToSave || rebuilding}
                  title={safeToSave ? undefined : 'The library manifest is read-only; reconnect your vault or restore it first.'}
                  className="paper-btn paper-btn-sm shrink-0"
                >
                  {rebuilding ? 'Rebuilding…' : 'Rebuild index'}
                </button>
              </div>
            )}

            <div className={`flex flex-col border-b border-base-content/10 ${isLibrary ? 'shrink-0 gap-1.5 pb-2' : 'sticky top-0 z-raised bg-base-100/90 backdrop-blur-xl gap-2 py-3 md:gap-3'}`}>
              <div className="flex flex-wrap items-center gap-3 w-full">
                <div className="flex-1 min-w-48 flex items-center relative">
                  <SearchIcon className="absolute left-3 w-4 h-4 text-base-content/50 pointer-events-none" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search recipes…"
                    aria-label="Search recipes"
                    className="paper-input paper-input-search w-full"
                  />
                  {query && (
                    <button
                      type="button"
                      aria-label="Clear search"
                      onClick={() => { audioService.playClick(); setQuery(''); }}
                      className="absolute right-2 paper-btn paper-btn-ghost paper-btn-icon"
                    >
                      <CloseIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={openAdd}
                  disabled={!safeToSave}
                  className="paper-btn paper-btn-primary shrink-0 ml-auto"
                >
                  Add recipe
                </button>
              </div>

              {/* Rows that can overflow scroll sideways with the scrollbar hidden. Their p-1 gutter keeps focus rings from being
                  clipped; -ml-1 -my-1 cancels it so the text still lines up (a negative right margin would widen the column). */}
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-x-4">
                <div className="flex min-w-0 gap-5 overflow-x-auto scrollbar-hide p-1 -ml-1 -my-1 lg:flex-1" role="group" aria-label="Page type">
                  {(['all', ...RECIPE_PAGE_TYPES] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={pageType === p}
                      onClick={() => { audioService.playClick(); setPageType(p); }}
                      className="paper-tab"
                    >
                      <span className="capitalize">{p}</span>
                    </button>
                  ))}
                </div>

                <div className="flex max-w-full shrink-0 items-center gap-x-4 overflow-x-auto scrollbar-hide p-1 -ml-1 -my-1">
                  <div className="hidden lg:flex items-center gap-1.5" role="group" aria-label="View">
                    {VIEW_OPTIONS.map(({ value, label }) => (
                      <button key={value} type="button" aria-pressed={view === value} onClick={() => changeView(value)} className="paper-chip shrink-0">
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5" role="group" aria-label="Sort">
                    {SORT_OPTIONS.map(({ mode, label }) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={sortMode === mode}
                        onClick={() => {
                          audioService.playClick();
                          setSortMode(mode);
                          if (mode === 'random') setSeed(newSeed());
                        }}
                        className="paper-chip shrink-0"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {tags.length > 0 && (
                <div
                  className={`flex items-center gap-1.5 p-1 -ml-1 -my-1 ${showAllTags ? 'flex-wrap' : 'overflow-x-auto scrollbar-hide'}`}
                  role="group"
                  aria-label="Tags"
                >
                  {tagChips.map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={activeTag?.toLowerCase() === t.toLowerCase()}
                      onClick={() => { audioService.playClick(); setTag(activeTag?.toLowerCase() === t.toLowerCase() ? null : t); }}
                      className="paper-chip shrink-0"
                    >
                      {t}
                    </button>
                  ))}
                  {tags.length > TAG_ROW_SIZE && (
                    <button
                      type="button"
                      onClick={() => { audioService.playClick(); setShowAllTags((s) => !s); }}
                      className="paper-chip shrink-0"
                    >
                      {showAllTags ? 'Show less' : `+${hiddenTagCount} more`}
                    </button>
                  )}
                </div>
              )}
            </div>

            {visible.length === 0 ? (
              recipes.length === 0 ? (
                <EmptyState
                  icon="◨"
                  title="No recipes yet"
                  body="Add reference screenshots to start your design library."
                  action={safeToSave ? { label: 'Add recipe', onClick: openAdd } : undefined}
                  className="py-32"
                />
              ) : (
                <EmptyState title="No matches" body="Try another search, page type, or tag." className="py-32" />
              )
            ) : isLibrary ? (
              <div className="flex flex-1 min-h-[24rem] gap-4 pt-3">
                <div className="w-[22rem] shrink-0 min-h-0">
                  <DesignLibraryList recipes={sorted} selectedId={selected.id} onSelect={setSelectedRecipeId} />
                </div>
                <div className="flex-1 min-w-0 overflow-y-auto">
                  <DesignRecipePreview
                    recipe={selected}
                    deleteDisabled={!safeToSave}
                    onUse={(r) => { audioService.playClick(); setToUse(r); }}
                    onCopyPrompt={(r) => { void copyPrompt(r); }}
                    onEdit={(r) => openRecipe(r.id)}
                    onDelete={(r) => { audioService.playClick(); setToDelete(r); }}
                  />
                </div>
              </div>
            ) : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5 pt-4 md:pt-6">
                {sorted.map((r) => (
                  <DesignRecipeCard
                    key={r.id}
                    recipe={r}
                    deleteDisabled={!safeToSave}
                    onOpen={() => openRecipe(r.id)}
                    onUse={() => { audioService.playClick(); setToUse(r); }}
                    onCopyPrompt={() => { void copyPrompt(r); }}
                    onDelete={() => { audioService.playClick(); setToDelete(r); }}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <DesignRecipeAddModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreated={() => { showGlobalFeedback('Recipe added'); void refresh(); }}
        collections={collections}
        defaultCollectionId={collections.some((c) => c.id === activeSelection) ? activeSelection : undefined}
      />
      {manageOpen && (
        <Modal isOpen onClose={closeManage} title="Manage collections" size="4xl">
          <div className="h-[70vh]"><DesignLibrarySection /></div>
        </Modal>
      )}
      {toUse && (
        <UseRecipeModal recipeId={toUse.id} recipeTitle={toUse.title} onClose={() => setToUse(null)} showGlobalFeedback={showGlobalFeedback} />
      )}
      {toDelete && (
        <ConfirmationModal
          isOpen
          onClose={() => setToDelete(null)}
          onConfirm={() => { void confirmDelete(toDelete); }}
          title="Delete recipe"
          message={`Permanently delete "${toDelete.title}" and its screenshots?`}
          heading="Delete this recipe?"
          confirmLabel="Delete"
          cancelLabel="Cancel"
        />
      )}
    </section>
  );
};

const DesignLibrary: React.FC<DesignLibraryProps> = (props) => (
  <PaperScope><DesignLibraryView {...props} /></PaperScope>
);

export default DesignLibrary;
