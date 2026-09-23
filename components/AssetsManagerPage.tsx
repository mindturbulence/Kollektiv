import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { TerminalText, PanelLine, ScanLine, panelVariants, sectionWipeVariants, contentVariants } from './AnimatedPanels';
import { useObjectUrls } from '../utils/useObjectUrls';
import { listRoots, addRoot, addRootFromHandle, removeRoot, requestRootPermission } from '../services/assets/assetRootManager';
import { scanDirectoryTree, listFolderFiles } from '../services/assets/directoryScanner';
import { moveFilesToFolder } from '../services/assets/fileOps';
import type { AssetFile, AssetRootState, DirectoryNode, ScanProgress } from '../services/assets/types';
import { IMAGE_SOURCE_EXTS } from '../constants/converterFormats';
import { downloadZip } from '../utils/zipDownload';
import { appEventBus } from '../utils/eventBus';
import { FolderClosedIcon, FolderOpenIcon, ChevronRightIcon, ChevronDownIcon, CloseIcon, ChevronLeftIcon, CenterIcon, DownloadIcon, CheckIcon, EditIcon, RefreshIcon } from './icons';
import LoadingSpinner from './LoadingSpinner';

// ── Constants ─────────────────────────────────────────────────────────

const IMAGE_EXT_SET = new Set(IMAGE_SOURCE_EXTS);
// ponytail: page cap keeps 10k+ image folders from choking the grid; bump if
// virtualization is ever needed instead.
const PAGE_SIZE = 200;

interface AssetsManagerPageProps {
  isExiting?: boolean;
  showGlobalFeedback?: (msg: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────

const AssetsManagerPage: React.FC<AssetsManagerPageProps> = ({ isExiting = false, showGlobalFeedback }) => {
  const [roots, setRoots] = useState<AssetRootState[]>([]);
  const [rootsLoaded, setRootsLoaded] = useState(false);
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);
  const [tree, setTree] = useState<DirectoryNode | null>(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState<string>('');
  const [folderFiles, setFolderFiles] = useState<AssetFile[]>([]);
  const [isScanningTree, setIsScanningTree] = useState(false);
  const [isListingFolder, setIsListingFolder] = useState(false);
  const [listProgress, setListProgress] = useState<ScanProgress | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [objectUrls, setObjectUrls] = useState<Map<string, string>>(new Map());
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [currentDirHandle, setCurrentDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBusy, setIsBusy] = useState(false);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [isDraggingRootDrop, setIsDraggingRootDrop] = useState(false);

  const { track, revoke } = useObjectUrls();
  // Generation counter guards against stale async getFile() resolutions
  // landing after the user has already switched folders/roots.
  const generationRef = useRef(0);
  const objectUrlsRef = useRef<Map<string, string>>(new Map());
  objectUrlsRef.current = objectUrls;
  const lastClickedIndexRef = useRef<number | null>(null);
  // Drag payload travels out-of-band (native dataTransfer can't carry object
  // refs) — a ref survives the drag gesture without triggering re-renders.
  const draggedFileIdsRef = useRef<string[]>([]);

  const selectedRoot = useMemo(() => roots.find(r => r.id === selectedRootId) ?? null, [roots, selectedRootId]);

  // ── Roots ───────────────────────────────────────────────────────────

  const refreshRoots = useCallback(async () => {
    const list = await listRoots();
    setRoots(list);
    setRootsLoaded(true);
    return list;
  }, []);

  useEffect(() => {
    void refreshRoots().then(list => {
      const firstGranted = list.find(r => r.status === 'granted');
      if (firstGranted) setSelectedRootId(firstGranted.id);
    });
  }, [refreshRoots]);

  const handleAddRoot = useCallback(async () => {
    try {
      const added = await addRoot();
      if (!added) return; // user cancelled the picker
      await refreshRoots();
      setSelectedRootId(added.id);
    } catch (e) {
      showGlobalFeedback?.(e instanceof Error ? e.message : 'Could not add folder.');
    }
  }, [refreshRoots, showGlobalFeedback]);

  const handleRemoveRoot = useCallback(
    async (rootId: string) => {
      await removeRoot(rootId);
      const list = await refreshRoots();
      if (selectedRootId === rootId) {
        setSelectedRootId(list.find(r => r.status === 'granted')?.id ?? null);
        setTree(null);
        setSelectedFolderPath('');
      }
    },
    [refreshRoots, selectedRootId],
  );

  const handleReconnect = useCallback(
    async (root: AssetRootState) => {
      const status = await requestRootPermission(root);
      setRoots(prev => prev.map(r => (r.id === root.id ? { ...r, status } : r)));
      if (status === 'granted') setSelectedRootId(root.id);
    },
    [],
  );

  // ── Directory tree (per root) ────────────────────────────────────────

  useEffect(() => {
    if (!selectedRoot || selectedRoot.status !== 'granted') {
      setTree(null);
      return;
    }
    let cancelled = false;
    setIsScanningTree(true);
    void scanDirectoryTree(selectedRoot.id, selectedRoot.handle).then(result => {
      if (cancelled) return;
      setTree(result);
      setSelectedFolderPath('');
      setIsScanningTree(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedRoot]);

  // ── Folder listing + object URL lifecycle ────────────────────────────

  const revokeAllTracked = useCallback(() => {
    objectUrlsRef.current.forEach(url => revoke(url));
    objectUrlsRef.current = new Map();
    setObjectUrls(new Map());
  }, [revoke]);

  useEffect(() => {
    // New folder/root: invalidate any in-flight getFile() loads and drop
    // every previously created object URL for the folder we're leaving.
    generationRef.current += 1;
    const myGeneration = generationRef.current;
    revokeAllTracked();
    setVisibleCount(PAGE_SIZE);
    setLightboxIndex(null);
    setSelectedIds(new Set());
    lastClickedIndexRef.current = null;

    if (!selectedRoot || selectedRoot.status !== 'granted' || !tree) {
      setFolderFiles([]);
      setCurrentDirHandle(null);
      return;
    }

    const targetNode = findNodeByPath(tree, selectedFolderPath);
    if (!targetNode) {
      setFolderFiles([]);
      setCurrentDirHandle(null);
      return;
    }
    setCurrentDirHandle(targetNode.handle);

    setIsListingFolder(true);
    setListProgress(null);
    void listFolderFiles(selectedRoot.id, targetNode.handle, selectedFolderPath, progress => {
      if (myGeneration !== generationRef.current) return;
      setListProgress(progress);
    }).then(({ files, truncated }) => {
      if (myGeneration !== generationRef.current) return;
      const images = files.filter(f => IMAGE_EXT_SET.has(f.ext));
      setFolderFiles(images);
      setIsListingFolder(false);
      setListProgress(null);
      if (truncated) showGlobalFeedback?.('Folder listing stopped early — permission or read error.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoot, tree, selectedFolderPath, refreshTick]);

  const visibleFiles = folderFiles.slice(0, visibleCount);
  const loadedThumbCount = visibleFiles.filter(f => objectUrls.has(f.id)).length;
  const isDecodingThumbs = !isListingFolder && visibleFiles.length > 0 && loadedThumbCount < visibleFiles.length;
  const decodePercent = visibleFiles.length > 0 ? Math.round((loadedThumbCount / visibleFiles.length) * 100) : 0;

  // Lazily decode object URLs only for the currently visible slice.
  useEffect(() => {
    const myGeneration = generationRef.current;
    visibleFiles.forEach(file => {
      if (objectUrlsRef.current.has(file.id)) return;
      void file.handle.getFile().then(blob => {
        if (myGeneration !== generationRef.current) return; // stale — folder switched under us
        const url = track(URL.createObjectURL(blob));
        setObjectUrls(prev => {
          const next = new Map(prev);
          next.set(file.id, url);
          return next;
        });
      }).catch(() => { /* unreadable file — card shows broken-image fallback */ });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleFiles.map(f => f.id).join(',')]);

  // Unmount teardown — useObjectUrls already revokes tracked URLs, this just
  // clears local bookkeeping.
  useEffect(() => () => { objectUrlsRef.current = new Map(); }, []);

  // ── Selection ──────────────────────────────────────────────────────

  const handleCardClick = useCallback((file: AssetFile, idx: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastClickedIndexRef.current !== null) {
      const [lo, hi] = [lastClickedIndexRef.current, idx].sort((a, b) => a - b);
      setSelectedIds(prev => {
        const next = new Set(prev);
        for (let i = lo; i <= hi; i++) next.add(visibleFiles[i].id);
        return next;
      });
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      lastClickedIndexRef.current = idx;
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(file.id)) next.delete(file.id);
        else next.add(file.id);
        return next;
      });
      return;
    }
    if (selectedIds.size > 0) {
      // A selection is active — a plain click on a card toggles membership
      // instead of opening the lightbox, so touchpad/no-modifier users can
      // still multi-select.
      lastClickedIndexRef.current = idx;
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(file.id)) next.delete(file.id);
        else next.add(file.id);
        return next;
      });
      return;
    }
    setLightboxIndex(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleFiles, selectedIds]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // ── Drag-and-drop: move selected assets into a sidebar folder ────────

  const handleCardDragStart = useCallback((file: AssetFile, e: React.DragEvent) => {
    const ids = selectedIds.has(file.id) && selectedIds.size > 0 ? Array.from(selectedIds) : [file.id];
    draggedFileIdsRef.current = ids;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ids.join(','));
  }, [selectedIds]);

  const handleFolderDrop = useCallback(async (targetNode: DirectoryNode, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverPath(null);
    const ids = draggedFileIdsRef.current;
    draggedFileIdsRef.current = [];
    if (ids.length === 0 || !currentDirHandle) return;
    if (targetNode.path === selectedFolderPath) return; // dropped on the folder they're already in
    const filesToMove = folderFiles.filter(f => ids.includes(f.id));
    if (filesToMove.length === 0) return;

    setIsBusy(true);
    try {
      const result = await moveFilesToFolder(filesToMove, currentDirHandle, targetNode.handle);
      if (result.moved.length > 0) {
        setSelectedIds(new Set());
        setRefreshTick(t => t + 1);
      }
      if (result.failed.length > 0) {
        showGlobalFeedback?.(`Moved ${result.moved.length}, failed ${result.failed.length}: ${result.failed[0].error}`);
      } else if (result.moved.length > 0) {
        showGlobalFeedback?.(`Moved ${result.moved.length} file${result.moved.length === 1 ? '' : 's'} to "${targetNode.name}".`);
      }
    } finally {
      setIsBusy(false);
    }
  }, [currentDirHandle, selectedFolderPath, folderFiles, showGlobalFeedback]);

  // ── Drag-and-drop: drop an OS folder onto the roots panel to add it ──

  const handleRootsDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingRootDrop(false);
    const items = Array.from(e.dataTransfer.items);
    let added = 0;
    for (const item of items) {
      if (item.kind !== 'file') continue;
      const getAsHandle = (item as unknown as { getAsFileSystemHandle?: () => Promise<FileSystemHandle> }).getAsFileSystemHandle;
      if (!getAsHandle) continue;
      try {
        const handle = await getAsHandle.call(item);
        if (handle && handle.kind === 'directory') {
          const added_ = await addRootFromHandle(handle as FileSystemDirectoryHandle);
          setSelectedRootId(added_.id);
          added++;
        }
      } catch (err) {
        showGlobalFeedback?.(err instanceof Error ? err.message : 'Could not add dropped folder.');
      }
    }
    if (added > 0) await refreshRoots();
    else if (items.length > 0) showGlobalFeedback?.('Drop a folder here to add it as a root — individual files can\'t be added directly.');
  }, [refreshRoots, showGlobalFeedback]);

  // ── Selection toolbar actions ─────────────────────────────────────────

  const getSelectedFiles = useCallback(() => folderFiles.filter(f => selectedIds.has(f.id)), [folderFiles, selectedIds]);

  const handleExport = useCallback(async () => {
    const files = getSelectedFiles();
    if (files.length === 0) return;
    setIsBusy(true);
    try {
      if (files.length === 1) {
        const blob = await files[0].handle.getFile();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = files[0].name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const entries = await Promise.all(files.map(async f => ({ name: f.path, content: await f.handle.getFile() })));
        await downloadZip(entries, `assets-export-${Date.now()}.zip`);
      }
    } catch (e) {
      showGlobalFeedback?.(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setIsBusy(false);
    }
  }, [getSelectedFiles, showGlobalFeedback]);

  const handleSendToConverter = useCallback(async () => {
    const files = getSelectedFiles();
    if (files.length === 0) return;
    setIsBusy(true);
    try {
      const nativeFiles = await Promise.all(files.map(f => f.handle.getFile()));
      appEventBus.emit('openInConverter', { files: nativeFiles });
    } catch (e) {
      showGlobalFeedback?.(e instanceof Error ? e.message : 'Could not open in converter.');
    } finally {
      setIsBusy(false);
    }
  }, [getSelectedFiles, showGlobalFeedback]);

  const handleEditInImageEditor = useCallback(async () => {
    const files = getSelectedFiles();
    if (files.length !== 1) return;
    setIsBusy(true);
    try {
      const blob = await files[0].handle.getFile();
      appEventBus.emit('openInEditor', { blob });
    } catch (e) {
      showGlobalFeedback?.(e instanceof Error ? e.message : 'Could not open in editor.');
    } finally {
      setIsBusy(false);
    }
  }, [getSelectedFiles, showGlobalFeedback]);

  // ── Render ──────────────────────────────────────────────────────────

  if (rootsLoaded && roots.length === 0) {
    return <WelcomeState onAddRoot={() => void handleAddRoot()} isExiting={isExiting} />;
  }

  return (
    <div className="h-full w-full flex flex-col relative overflow-hidden">
      <div className="flex-grow flex min-h-0 px-6 py-4 gap-4">
        {/* SIDEBAR: roots + folder tree */}
        <motion.aside
          variants={panelVariants}
          initial="hidden"
          animate={isExiting ? 'exit' : 'visible'}
          className="w-[280px] flex-shrink-0 flex flex-col relative corner-frame"
        >
          <PanelLine position="top" delay={0.4} />
          <PanelLine position="bottom" delay={0.5} />
          <div className="flex flex-col h-full overflow-hidden relative z-10 bg-base-100/40 backdrop-blur-xl">
            <div className="p-4 bg-base-100/10 flex justify-between items-center">
              <TerminalText text="ASSET ROOTS" delay={0.6} className="text-xs font-black uppercase text-primary" />
              <button className="form-btn h-7 px-2 text-[10px]" onClick={() => void handleAddRoot()} aria-label="Add folder root">
                + ADD
              </button>
            </div>
            <div
              className={`overflow-y-auto p-2 border-b flex flex-col gap-1 transition-colors ${isDraggingRootDrop ? 'border-primary bg-primary/5' : 'border-base-content/10'}`}
              onDragOver={e => { e.preventDefault(); setIsDraggingRootDrop(true); }}
              onDragLeave={() => setIsDraggingRootDrop(false)}
              onDrop={e => void handleRootsDrop(e)}
              title="Drop a folder here to add it as a root"
            >
              {roots.map(root => (
                <RootRow
                  key={root.id}
                  root={root}
                  selected={root.id === selectedRootId}
                  onSelect={() => root.status === 'granted' && setSelectedRootId(root.id)}
                  onReconnect={() => void handleReconnect(root)}
                  onRemove={() => void handleRemoveRoot(root.id)}
                />
              ))}
              {roots.length === 0 && (
                <p className="text-[10px] font-mono uppercase text-base-content/30 p-1">Drop a folder here, or ADD above.</p>
              )}
            </div>
            <div className="flex-grow overflow-y-auto p-2">
              {isScanningTree && (
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-base-content/40 p-2">
                  <LoadingSpinner className="w-3 h-3" /> Scanning folders…
                </div>
              )}
              {tree && (
                <FolderTreeNode
                  node={tree}
                  selectedPath={selectedFolderPath}
                  onSelect={setSelectedFolderPath}
                  depth={0}
                  dragOverPath={dragOverPath}
                  onDragOverNode={setDragOverPath}
                  onDropNode={(node, e) => void handleFolderDrop(node, e)}
                />
              )}
              {!selectedRoot && !isScanningTree && (
                <p className="text-[10px] font-mono uppercase text-base-content/30 p-2">Select a root to browse.</p>
              )}
            </div>
          </div>
        </motion.aside>

        {/* GRID */}
        <motion.section
          variants={panelVariants}
          initial="hidden"
          animate={isExiting ? 'exit' : 'visible'}
          className="flex-grow min-w-0 flex flex-col relative corner-frame"
        >
          <PanelLine position="top" delay={0.5} />
          <PanelLine position="bottom" delay={0.6} />
          <PanelLine position="left" delay={0.7} />
          <PanelLine position="right" delay={0.8} />
          <ScanLine delay={3.5} />
          <div className="flex flex-col h-full w-full overflow-hidden relative z-10 bg-base-100/40 backdrop-blur-xl">
            <motion.header variants={sectionWipeVariants} custom={1.2} initial="hidden" animate="visible" className="p-4 bg-base-100/10 flex justify-between items-center">
              <TerminalText text={selectedFolderPath || (selectedRoot ? selectedRoot.name : 'NO FOLDER SELECTED')} delay={0.8} className="text-[10px] font-black uppercase text-primary truncate" />
              <span className="text-[10px] font-mono font-bold text-base-content/20 uppercase flex-shrink-0">
                {folderFiles.length} IMAGE{folderFiles.length === 1 ? '' : 'S'}
              </span>
            </motion.header>
            <motion.div variants={contentVariants} custom={2.2} initial="hidden" animate="visible" className="flex-grow overflow-y-auto p-3" aria-live="polite">
              {isListingFolder ? (
                <div className="h-full min-h-[240px]" />
              ) : folderFiles.length === 0 ? (
                <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center opacity-30">
                  <p className="text-xs font-black uppercase tracking-[0.4em]">No Images Here</p>
                  <p className="text-[9px] font-mono uppercase tracking-widest mt-2">
                    {selectedRoot ? 'Pick another folder in the sidebar' : 'Select a root to begin'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-2" data-testid="asset-grid">
                    {visibleFiles.map((file, idx) => (
                      <AssetCard
                        key={file.id}
                        file={file}
                        url={objectUrls.get(file.id)}
                        selected={selectedIds.has(file.id)}
                        hasSelection={selectedIds.size > 0}
                        onClick={e => handleCardClick(file, idx, e)}
                        onToggleSelect={() => setSelectedIds(prev => {
                          const next = new Set(prev);
                          if (next.has(file.id)) next.delete(file.id);
                          else next.add(file.id);
                          return next;
                        })}
                        onDragStart={e => handleCardDragStart(file, e)}
                      />
                    ))}
                  </div>
                  {visibleCount < folderFiles.length && (
                    <div className="flex justify-center py-4">
                      <button className="form-btn h-9 px-6 text-[10px]" onClick={() => setVisibleCount(v => v + PAGE_SIZE)}>
                        LOAD MORE ({folderFiles.length - visibleCount} remaining)
                      </button>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          </div>
        </motion.section>
      </div>

      <AnimatePresence>
        {(isListingFolder || isDecodingThumbs) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none"
          >
            <div className="flex flex-col items-center gap-3 bg-base-300/80 backdrop-blur-md rounded-lg px-8 py-6 border border-base-content/10">
              <LoadingSpinner className="w-6 h-6" />
              {isListingFolder ? (
                <p className="text-xs font-mono uppercase tracking-widest text-base-content/70">
                  Scanning folder… {listProgress ? `${listProgress.scannedFiles} files found` : ''}
                </p>
              ) : (
                <>
                  <p className="text-xs font-mono uppercase tracking-widest text-base-content/70">
                    Loading assets… {decodePercent}%
                  </p>
                  <div className="w-40 h-1 bg-base-content/10 rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${decodePercent}%` }} />
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedIds.size > 0 && (
          <SelectionToolbar
            count={selectedIds.size}
            busy={isBusy}
            onExport={() => void handleExport()}
            onConvert={() => void handleSendToConverter()}
            onEdit={selectedIds.size === 1 ? () => void handleEditInImageEditor() : undefined}
            onDeselect={clearSelection}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lightboxIndex !== null && (
          <Lightbox
            files={visibleFiles}
            urls={objectUrls}
            index={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            onIndexChange={setLightboxIndex}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Helpers ──────────────────────────────────────────────────────────

function findNodeByPath(tree: DirectoryNode, path: string): DirectoryNode | null {
  if (tree.path === path) return tree;
  for (const child of tree.children) {
    const found = findNodeByPath(child, path);
    if (found) return found;
  }
  return null;
}

// ── Sub-components ───────────────────────────────────────────────────

const WelcomeState: React.FC<{ onAddRoot: () => void; isExiting: boolean }> = ({ onAddRoot, isExiting }) => (
  <motion.div variants={panelVariants} initial="hidden" animate={isExiting ? 'exit' : 'visible'} className="h-full w-full flex flex-col items-center justify-center text-center gap-4 px-6">
    <TerminalText text="ASSETS MANAGER" delay={0.3} className="text-lg font-black uppercase tracking-widest text-primary" centered />
    <p className="text-[11px] font-mono uppercase tracking-widest text-base-content/50 max-w-md">
      Browse any local folder(s) as image roots. Nothing leaves this machine.
    </p>
    <button className="form-btn form-btn-primary h-10 px-6 mt-2" onClick={onAddRoot}>
      SELECT A FOLDER TO BEGIN
    </button>
  </motion.div>
);

const RootRow: React.FC<{
  root: AssetRootState;
  selected: boolean;
  onSelect: () => void;
  onReconnect: () => void;
  onRemove: () => void;
}> = ({ root, selected, onSelect, onReconnect, onRemove }) => (
  <div
    className={`group flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs font-mono uppercase transition-colors ${
      selected ? 'bg-primary/15 text-primary' : 'hover:bg-base-200/50 text-base-content/70'
    }`}
    onClick={onSelect}
  >
    <span
      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${root.status === 'granted' ? 'bg-success' : root.status === 'missing' ? 'bg-error' : 'bg-warning'}`}
      aria-label={root.status}
      title={root.status}
    />
    <span className="truncate flex-grow" title={root.name}>{root.name}</span>
    {root.status !== 'granted' && (
      <button
        className="text-[10px] text-warning hover:text-primary flex-shrink-0"
        onClick={e => { e.stopPropagation(); onReconnect(); }}
        aria-label={`Reconnect ${root.name}`}
      >
        RECONNECT
      </button>
    )}
    <button
      className="w-4 h-4 flex-shrink-0 opacity-0 group-hover:opacity-100 text-base-content/30 hover:text-error"
      onClick={e => { e.stopPropagation(); onRemove(); }}
      aria-label={`Remove root ${root.name}`}
    >
      ✕
    </button>
  </div>
);

const FolderTreeNode: React.FC<{
  node: DirectoryNode;
  selectedPath: string;
  onSelect: (path: string) => void;
  depth: number;
  dragOverPath: string | null;
  onDragOverNode: (path: string | null) => void;
  onDropNode: (node: DirectoryNode, e: React.DragEvent) => void;
}> = ({ node, selectedPath, onSelect, depth, dragOverPath, onDragOverNode, onDropNode }) => {
  const [isOpen, setIsOpen] = useState(depth < 1);
  const isSelected = node.path === selectedPath;
  const isDragOver = dragOverPath === node.path;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 px-1.5 py-1.5 rounded cursor-pointer text-xs font-mono truncate transition-colors ${
          isDragOver ? 'bg-primary/25 ring-1 ring-primary' : isSelected ? 'bg-primary/15 text-primary' : 'hover:bg-base-200/50 text-base-content/70'
        }`}
        onClick={() => onSelect(node.path)}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOverNode(node.path); }}
        onDragLeave={() => onDragOverNode(null)}
        onDrop={e => onDropNode(node, e)}
        title={node.path || node.name}
      >
        {hasChildren ? (
          <button
            onClick={e => { e.stopPropagation(); setIsOpen(v => !v); }}
            className="w-4 h-4 flex-shrink-0 flex items-center justify-center"
            aria-label={isOpen ? 'Collapse folder' : 'Expand folder'}
          >
            {isOpen ? <ChevronDownIcon className="w-3.5 h-3.5" /> : <ChevronRightIcon className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-4 h-4 flex-shrink-0" />
        )}
        {isOpen ? <FolderOpenIcon className="w-4 h-4 flex-shrink-0" /> : <FolderClosedIcon className="w-4 h-4 flex-shrink-0" />}
        <span className="truncate">{node.name}</span>
      </div>
      {isOpen && hasChildren && (
        <div className="pl-3 ml-2 border-l border-base-content/10">
          {node.children.map(child => (
            <FolderTreeNode
              key={child.id}
              node={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              depth={depth + 1}
              dragOverPath={dragOverPath}
              onDragOverNode={onDragOverNode}
              onDropNode={onDropNode}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const AssetCard: React.FC<{
  file: AssetFile;
  url: string | undefined;
  selected: boolean;
  hasSelection: boolean;
  onClick: (e: React.MouseEvent) => void;
  onToggleSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
}> = ({ file, url, selected, hasSelection, onClick, onToggleSelect, onDragStart }) => (
  <button
    onClick={onClick}
    draggable
    onDragStart={onDragStart}
    className={`group relative block w-full mb-2 break-inside-avoid overflow-hidden rounded border transition-colors bg-base-200/30 ${
      selected ? 'border-primary ring-2 ring-primary/50' : 'border-base-content/10 hover:border-primary/50'
    }`}
    aria-label={`Open ${file.name}`}
    aria-pressed={selected}
  >
    {url ? (
      <img src={url} alt={file.name} className="w-full h-auto object-cover" loading="lazy" draggable={false} />
    ) : (
      <div className="w-full aspect-square flex items-center justify-center">
        <LoadingSpinner className="w-4 h-4 opacity-40" />
      </div>
    )}
    <div
      role="checkbox"
      aria-checked={selected}
      aria-label={selected ? `Deselect ${file.name}` : `Select ${file.name}`}
      onClick={e => { e.stopPropagation(); onToggleSelect(); }}
      className={`absolute top-1.5 left-1.5 w-5 h-5 rounded flex items-center justify-center border transition-opacity ${
        selected
          ? 'bg-primary border-primary opacity-100'
          : `bg-black/40 border-white/40 ${hasSelection ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`
      }`}
    >
      {selected && <CheckIcon className="w-3.5 h-3.5 text-primary-content" />}
    </div>
    <div className="absolute inset-0 flex flex-col justify-end p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
      <p className="text-[9px] font-mono truncate text-white text-left" title={file.name}>{file.name}</p>
    </div>
  </button>
);

// Mirrors components/FullscreenViewer.tsx (the Vault's fullscreen viewer):
// portaled to document.body so `position: fixed` is truly viewport-relative
// (this page renders inside App.tsx's route-transition `motion.div`, whose
// transform otherwise re-anchors "fixed" to that box, not the screen) —
// edge-docked prev/next zones, wheel zoom, drag-to-pan, double-click zoom,
// download, reset, top-right controls.
const Lightbox: React.FC<{
  files: AssetFile[];
  urls: Map<string, string>;
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
}> = ({ files, urls, index, onClose, onIndexChange }) => {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  const file = files[index];
  const url = file ? urls.get(file.id) : undefined;

  const resetView = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const goNext = useCallback(() => {
    resetView();
    onIndexChange((index + 1) % files.length);
  }, [index, files.length, onIndexChange, resetView]);

  const goPrev = useCallback(() => {
    resetView();
    onIndexChange((index - 1 + files.length) % files.length);
  }, [index, files.length, onIndexChange, resetView]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, goNext, goPrev]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const scaleAmount = -e.deltaY * 0.005;
    setZoom(prev => {
      const next = Math.max(1, prev + scaleAmount);
      if (next <= 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) setPosition({ x: e.clientX - panStartRef.current.x, y: e.clientY - panStartRef.current.y });
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (zoom > 1) resetView();
    else setZoom(2.5);
  };

  const handleDownload = () => {
    if (!url || !file) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!file) return null;

  const modalContent = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="fixed inset-0 bg-black/95 z-[1000] select-none overflow-hidden"
      onClick={onClose}
      onMouseMove={handleMouseMove}
      onMouseUp={() => setIsPanning(false)}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden" onWheel={handleWheel}>
        {url ? (
          <img
            src={url}
            alt={file.name}
            className="transition-transform duration-100 ease-out select-none"
            style={{
              translate: `${position.x}px ${position.y}px`,
              scale: `${zoom}`,
              maxHeight: '100%',
              maxWidth: 'none',
              width: 'auto',
              height: 'auto',
              cursor: isPanning ? 'grabbing' : zoom > 1 ? 'grab' : 'default',
            }}
            onClick={e => e.stopPropagation()}
            onMouseDown={handleMouseDown}
            onDoubleClick={handleDoubleClick}
            draggable={false}
          />
        ) : (
          <LoadingSpinner className="w-8 h-8" />
        )}
      </div>

      {/* Edge-docked prev/next — same pattern as FullscreenViewer, always vertically centered on the true viewport. */}
      {files.length > 1 && (
        <div className="pointer-events-none absolute inset-0 z-[100]">
          <div className="absolute inset-y-0 left-0 w-32 flex items-center justify-center">
            <button
              onClick={e => { e.stopPropagation(); goPrev(); }}
              className="pointer-events-auto p-4 text-white hover:text-primary transition-all duration-300 opacity-40 hover:opacity-100 scale-100 hover:scale-110"
              aria-label="Previous image"
            >
              <ChevronLeftIcon className="w-12 h-12" />
            </button>
          </div>
          <div className="absolute inset-y-0 right-0 w-32 flex items-center justify-center">
            <button
              onClick={e => { e.stopPropagation(); goNext(); }}
              className="pointer-events-auto p-4 text-white hover:text-primary transition-all duration-300 opacity-40 hover:opacity-100 scale-100 hover:scale-110"
              aria-label="Next image"
            >
              <ChevronRightIcon className="w-12 h-12" />
            </button>
          </div>
        </div>
      )}

      <div className="absolute top-8 right-8 z-[110] flex items-center gap-4 pointer-events-auto">
        <button onClick={e => { e.stopPropagation(); handleDownload(); }} className="p-2 text-white/40 hover:text-white transition-colors" title="Download" aria-label="Download">
          <DownloadIcon className="w-6 h-6" />
        </button>
        <button onClick={e => { e.stopPropagation(); resetView(); }} className="p-2 text-white/40 hover:text-white transition-colors" title="Reset view" aria-label="Reset view">
          <CenterIcon className="w-6 h-6" />
        </button>
        <button onClick={onClose} className="p-2 text-error/40 hover:text-error transition-colors" title="Close" aria-label="Close lightbox">
          <CloseIcon className="w-6 h-6" />
        </button>
      </div>

      {files.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[110] text-[10px] font-mono uppercase bg-black/40 py-1 px-3 rounded-full text-white/70">
          {index + 1} / {files.length}
        </div>
      )}
    </motion.div>
  );

  if (typeof document === 'undefined' || !document.body) return null;
  return createPortal(modalContent, document.body);
};

// Portaled for the same reason as the Lightbox: fixed positioning inside
// App.tsx's transformed route-transition container isn't viewport-relative.
const SelectionToolbar: React.FC<{
  count: number;
  busy: boolean;
  onExport: () => void;
  onConvert: () => void;
  onEdit: (() => void) | undefined;
  onDeselect: () => void;
}> = ({ count, busy, onExport, onConvert, onEdit, onDeselect }) => {
  const content = (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[900] flex items-center gap-3 bg-base-300/95 backdrop-blur-xl border border-base-content/10 rounded-full px-4 py-2 shadow-xl"
      role="toolbar"
      aria-label="Selection actions"
    >
      <span className="text-[10px] font-mono font-black uppercase text-primary pl-2">{count} SELECTED</span>
      <div className="w-px h-5 bg-base-content/10" />
      <button disabled={busy} onClick={onExport} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono uppercase text-base-content/70 hover:text-primary hover:bg-base-100/40 transition-colors disabled:opacity-40">
        <DownloadIcon className="w-4 h-4" /> Export
      </button>
      <button disabled={busy} onClick={onConvert} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono uppercase text-base-content/70 hover:text-primary hover:bg-base-100/40 transition-colors disabled:opacity-40">
        <RefreshIcon className="w-4 h-4" /> Convert
      </button>
      <button
        disabled={busy || !onEdit}
        onClick={onEdit}
        title={onEdit ? undefined : 'Select exactly one image to edit'}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono uppercase text-base-content/70 hover:text-primary hover:bg-base-100/40 transition-colors disabled:opacity-40"
      >
        <EditIcon className="w-4 h-4" /> Edit
      </button>
      <div className="w-px h-5 bg-base-content/10" />
      <button onClick={onDeselect} className="p-1.5 text-base-content/40 hover:text-error transition-colors" aria-label="Deselect all">
        <CloseIcon className="w-4 h-4" />
      </button>
    </motion.div>
  );

  if (typeof document === 'undefined' || !document.body) return null;
  return createPortal(content, document.body);
};

export default AssetsManagerPage;
