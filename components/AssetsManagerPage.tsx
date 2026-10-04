import React, { useState, useRef, useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ScramblingText } from './FullscreenViewer';
import { TerminalText, PanelLine, ScanLine, panelVariants, sectionWipeVariants, contentVariants } from './AnimatedPanels';
import { useObjectUrls } from '../utils/useObjectUrls';
import { listRoots, addRoot, addRootFromHandle, removeRoot, requestRootPermission, ensureWritable } from '../services/assets/assetRootManager';
import { scanDirectoryTree, listFolderFiles } from '../services/assets/directoryScanner';
import { transferFiles, resolveDir, resolveFile, moveOne, type ConflictPolicy, type Transferred } from '../services/assets/fileOps';
import { extractFacts, gridThumbTarget, indexFiles, putCachedFacts, RAW_EXTS, relocateCachedFacts, scaledThumbSize, type AssetFacts } from '../services/assets/assetFacts';
import {
  getLibrary, getLibraryStatus, subscribeLibrary, loadLibrary, updateMeta, updateMetaMany, relocate, copyMeta, deleteCollection,
  type ColorLabel, type FilterCriteria, type AssetMeta,
} from '../services/assets/assetLibrary';
import { matches, sortEntries, type AssetEntry, type SortKey } from '../services/assets/assetFilter';
import { findSimilar, groupDuplicates } from '../services/assets/duplicates';
import { canWriteMetadata, readXmpFields, sameMeta, writeMetadata } from '../services/assets/metadataWriter';
import { latestOp, onJournalChanged, recordOp, undoOp, type JournalEntry } from '../services/assets/undoJournal';
import type { RenamePlanItem } from '../services/assets/batchRename';
import { saveToVault, vaultGalleryHandle } from '../services/assets/vaultBridge';
import type { AssetFile, AssetRootState, DirectoryNode, ScanProgress } from '../services/assets/types';
import { IMAGE_SOURCE_EXTS, SUPPORTED_SOURCE_EXTS } from '../constants/converterFormats';
import { downloadZip } from '../utils/zipDownload';
import { appEventBus } from '../utils/eventBus';
import { largestEmbeddedJpeg } from '../utils/jpegScan';
import { setPendingFiles, type HandoffTarget } from '../utils/pendingHandoff';
import { openInVideoEditor } from '../video-editor/bridge/openInVideoEditor';
import { FolderClosedIcon, FolderOpenIcon, ChevronRightIcon, ChevronDownIcon, CloseIcon, ChevronLeftIcon, CenterIcon, DownloadIcon, CheckIcon, DeleteIcon, RefreshIcon, EditIcon, FilmIcon, AspectRatioIcon, SparklesIcon, ArchiveIcon, MenuIcon, UndoIcon, CopyIcon, KeyboardIcon, GridViewIcon, ListViewIcon } from './icons';
import LoadingSpinner from './LoadingSpinner';
import { ThinkingOrb } from 'thinking-orbs';
import FilterBar, { LABEL_COLORS } from './assets/FilterBar';
import AssetInspector from './assets/AssetInspector';
import { useAsk } from './assets/AskDialog';
import { BatchRenameModal, CopyMoveModal, DuplicatesModal, ShortcutsModal, VaultSaveModal } from './assets/AssetDialogs';
import ContextMenu, { type MenuItem } from './ContextMenu';
import { clipboardCopy, clipboardCut, clipboardContent, clipboardClear, clipboardHasContent } from '../services/assets/clipboard';
import { createFolder, renameFolder, deleteFolder, FolderNotEmptyError } from '../services/assets/folderOps';
import { moveToTrash, listTrash, restoreFromTrash, deleteForever, emptyTrash, purgeTrash, type TrashedEntry } from '../services/assets/trash';
import { moveFolder, isInvalidFolderDrop, type FolderMoveProgress } from '../services/assets/folderMove';

// ── Constants ─────────────────────────────────────────────────────────

// Browser-decodable images plus camera RAWs (thumbnails from embedded JPEGs).
const LISTED_EXT_SET = new Set<string>([...IMAGE_SOURCE_EXTS, ...RAW_EXTS]);
const RAW_EXT_SET = new Set<string>(RAW_EXTS);
// What an <img> can show when a file has no cached thumbnail (yet, or ever).
const BROWSER_SHOWS = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'bmp']);
// Video, image and audio — everything the converter can already read.
const VIDEO_EDITOR_EXT_SET = new Set(SUPPORTED_SOURCE_EXTS);
// ponytail: page cap keeps 10k+ image folders from choking the grid; bump if
// virtualization is ever needed instead.
const PAGE_SIZE = 200;
// Concurrent card extractions: each reads the whole file (RAW decodes too),
// so unbounded fan-out on a 10k folder thrashes the disk.
const EXTRACT_CONCURRENCY = 6;
// Bridge keys: 1–5 rate, 0 clears; 6–9 red/yellow/green/blue.
const LABEL_KEYS: Record<string, ColorLabel> = { '6': 'red', '7': 'yellow', '8': 'green', '9': 'blue' };

const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const joinPath = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface AssetsManagerPageProps {
  isExiting?: boolean;
  showGlobalFeedback?: (msg: string) => void;
}

type View = { kind: 'folder' } | { kind: 'collection'; id: string } | { kind: 'trash' };
const VIEW_KEY = 'assets.viewPrefs';
const GRID_SIZE_MIN = 120, GRID_SIZE_MAX = 420, GRID_SIZE_DEFAULT = 220;
/** Per-viewer convenience (a remembered view), so a storage failure is harmless. */
function loadViewPrefs(): { mode: 'grid' | 'list'; size: number } {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}');
    const size = typeof v.size === 'number' ? Math.min(GRID_SIZE_MAX, Math.max(GRID_SIZE_MIN, v.size)) : GRID_SIZE_DEFAULT;
    return { mode: v.mode === 'list' ? 'list' : 'grid', size };
  } catch { return { mode: 'grid', size: GRID_SIZE_DEFAULT }; }
}
/** A find-similar result: the target and its neighbours with their hash distances. */
interface SimilarState { targetId: string; distances: Map<string, number> }

// ── Component ─────────────────────────────────────────────────────────

const AssetsManagerPage: React.FC<AssetsManagerPageProps> = ({ isExiting = false, showGlobalFeedback }) => {
  const [roots, setRoots] = useState<AssetRootState[]>([]);
  const [rootsLoaded, setRootsLoaded] = useState(false);
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);
  const [tree, setTree] = useState<DirectoryNode | null>(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState<string>('');
  const [view, setView] = useState<View>({ kind: 'folder' });
  const [folderFiles, setFolderFiles] = useState<AssetFile[]>([]);
  const [isScanningTree, setIsScanningTree] = useState(false);
  const [treeTick, setTreeTick] = useState(0);
  const [trashEntries, setTrashEntries] = useState<TrashedEntry[]>([]);
  const [trashTick, setTrashTick] = useState(0);
  const [isListingFolder, setIsListingFolder] = useState(false);
  const [listProgress, setListProgress] = useState<ScanProgress | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [objectUrls, setObjectUrls] = useState<Map<string, string>>(new Map());
  const [facts, setFacts] = useState<Map<string, AssetFacts>>(new Map());
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<{ id: string; url: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [gridDragOverId, setGridDragOverId] = useState<string | null>(null);
  const [gridDropPosition, setGridDropPosition] = useState<'before' | 'after' | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [folderMoveProgress, setFolderMoveProgress] = useState<FolderMoveProgress | null>(null);
  const [folderMoveCancelling, setFolderMoveCancelling] = useState(false);
  const [isDraggingRootDrop, setIsDraggingRootDrop] = useState(false);
  const [criteria, setCriteria] = useState<FilterCriteria>({});
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [descending, setDescending] = useState(false);
  const [similar, setSimilar] = useState<SimilarState | null>(null);
  const [viewPrefs, setViewPrefs] = useState(loadViewPrefs);
  const updateViewPrefs = useCallback((patch: Partial<{ mode: 'grid' | 'list'; size: number }>) => {
    setViewPrefs(prev => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(VIEW_KEY, JSON.stringify(next)); } catch { /* private mode: not remembered */ }
      return next;
    });
  }, []);
  const [expandedStacks, setExpandedStacks] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<null | 'rename' | 'copymove' | 'duplicates' | 'vault' | 'shortcuts'>(null);
  const [undoEntry, setUndoEntry] = useState<JournalEntry | null>(null);
  const [missingInCollection, setMissingInCollection] = useState(0);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [isFullIndexing, setIsFullIndexing] = useState(false);

  const library = useSyncExternalStore(subscribeLibrary, getLibrary);
  const libStatus = useSyncExternalStore(subscribeLibrary, getLibraryStatus);

  const { ask, dialog: askDialog } = useAsk();
  const { track, revoke } = useObjectUrls();
  // Generation counter guards against stale async resolutions (listing,
  // indexing, URL creation) landing after the user switched folders/roots.
  const generationRef = useRef(0);
  const lastTreeRootIdRef = useRef<string | null>(null);
  const objectUrlsRef = useRef<Map<string, string>>(new Map());
  objectUrlsRef.current = objectUrls;
  const lastClickedIndexRef = useRef<number | null>(null);
  // Drag payload travels out-of-band (native dataTransfer can't carry object
  // refs) — a ref survives the drag gesture without triggering re-renders.
  const draggedFileIdsRef = useRef<string[]>([]);
  const visibleExtractRef = useRef<Set<string>>(new Set());
  const extractQueueRef = useRef<{ jobs: Array<() => Promise<void>>; active: number }>({ jobs: [], active: 0 });
  const fullIndexRef = useRef<Promise<void> | null>(null);
  const draggedFolderRef = useRef<{ path: string; rootId: string } | null>(null);
  const folderCancelRef = useRef(false);
  const lastProgressAtRef = useRef(0);

  const selectedRoot = useMemo(() => roots.find(r => r.id === selectedRootId) ?? null, [roots, selectedRootId]);
  const rootById = useCallback((id: string) => roots.find(r => r.id === id && r.status === 'granted') ?? null, [roots]);

  // ── Library + undo journal ───────────────────────────────────────────

  useEffect(() => { void loadLibrary(); }, []);

  const refreshUndo = useCallback(() => { latestOp().then(e => setUndoEntry(e ?? null), () => setUndoEntry(null)); }, []);
  useEffect(() => { refreshUndo(); return onJournalChanged(refreshUndo); }, [refreshUndo]);

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
      setView({ kind: 'folder' });
    } catch (e) {
      showGlobalFeedback?.(e instanceof Error ? e.message : 'Could not add folder.');
    }
  }, [refreshRoots, showGlobalFeedback]);

  /** The local vault's gallery folder as a root (plan Task 24). */
  const handleAddVaultRoot = useCallback(async () => {
    const handle = await vaultGalleryHandle();
    if (!handle) { showGlobalFeedback?.('The vault is not a local folder (or not connected) — there is nothing to browse here.'); return; }
    const added = await addRootFromHandle(handle);
    await refreshRoots();
    setSelectedRootId(added.id);
    setView({ kind: 'folder' });
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
    const isNewRoot = lastTreeRootIdRef.current !== selectedRoot.id;
    lastTreeRootIdRef.current = selectedRoot.id;
    let cancelled = false;
    setIsScanningTree(true);
    void scanDirectoryTree(selectedRoot.id, selectedRoot.handle).then(result => {
      if (cancelled) return;
      setTree(result);
      if (isNewRoot) setSelectedFolderPath('');
      setIsScanningTree(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedRoot, treeTick]);

  useEffect(() => {
    if (!selectedRoot || selectedRoot.status !== 'granted') {
      setTrashEntries([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try { await purgeTrash(selectedRoot.handle); } catch { /* best-effort, age-based cleanup */ }
      try {
        const entries = await listTrash(selectedRoot.handle);
        if (!cancelled) setTrashEntries(entries);
      } catch { /* trash unreadable — show nothing */ }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedRoot, trashTick]);

  // ── Folder / collection listing + object URL lifecycle ───────────────

  const revokeAllTracked = useCallback(() => {
    objectUrlsRef.current.forEach(url => revoke(url));
    objectUrlsRef.current = new Map();
    setObjectUrls(new Map());
  }, [revoke]);

  useEffect(() => {
    // New folder/root/collection: invalidate in-flight loads and drop every
    // object URL made for what we're leaving.
    generationRef.current += 1;
    const myGeneration = generationRef.current;
    revokeAllTracked();
    setFacts(new Map());
    setVisibleCount(PAGE_SIZE);
    setLightboxIndex(null);
    setSelectedIds(new Set());
    setSimilar(null);
    lastClickedIndexRef.current = null;

    if (view.kind === 'collection') {
      // A collection spans folders and roots: resolve each member by path.
      const collection = library.collections.find(c => c.id === view.id);
      if (!collection) { setFolderFiles([]); setIsListingFolder(false); setListProgress(null); return; }
      setIsListingFolder(true);
      void (async () => {
        const files: AssetFile[] = [];
        let missing = 0;
        for (const id of collection.ids) {
          const sep = id.indexOf(':');
          const root = rootById(id.slice(0, sep));
          const path = id.slice(sep + 1);
          try {
            if (!root) throw new Error('root not connected');
            const { handle, name } = await resolveFile(root.handle, path);
            const dot = name.lastIndexOf('.');
            files.push({ id, rootId: root.id, path, name, ext: dot > 0 ? name.slice(dot + 1).toLowerCase() : '', handle });
          } catch { missing++; }
        }
        if (myGeneration !== generationRef.current) return;
        setFolderFiles(files);
        setMissingInCollection(missing);
        setIsListingFolder(false);
      })().catch(() => {
        // Never leave the "Scanning folder…" overlay up on a resolve error.
        if (myGeneration !== generationRef.current) return;
        setIsListingFolder(false);
      });
      return;
    }

    if (view.kind === 'trash' || !selectedRoot || selectedRoot.status !== 'granted' || !tree) {
      setFolderFiles([]);
      // A listing may have been in flight when the root vanished — the
      // generation guard above stops its .then from clearing the flag.
      setIsListingFolder(false);
      setListProgress(null);
      return;
    }

    const targetNode = findNodeByPath(tree, selectedFolderPath);
    if (!targetNode) {
      setFolderFiles([]);
      setIsListingFolder(false);
      setListProgress(null);
      return;
    }
    setIsListingFolder(true);
    setListProgress(null);
    void listFolderFiles(selectedRoot.id, targetNode.handle, selectedFolderPath, progress => {
      if (myGeneration !== generationRef.current) return;
      setListProgress(progress);
    }).then(({ files, truncated }) => {
      if (myGeneration !== generationRef.current) return;
      setFolderFiles(files.filter(f => LISTED_EXT_SET.has(f.ext)));
      setIsListingFolder(false);
      setListProgress(null);
      if (truncated) showGlobalFeedback?.('Folder listing stopped early — permission or read error.');
    }).catch(() => {
      // A rejected listing (permission error, onProgress throwing outside
      // listFolderFiles' try) must still terminate the overlay — an
      // unhandled rejection here also trips the fatal boot overlay.
      if (myGeneration !== generationRef.current) return;
      setIsListingFolder(false);
      setListProgress(null);
      showGlobalFeedback?.('Folder listing failed — check folder permissions.');
    });
    // Collection membership changes re-list only when that collection is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoot, tree, selectedFolderPath, refreshTick, view, view.kind === 'collection' ? library.collections : null]);

  // ── Indexing (Jev lazy split): upfront pass resolves cache hits and light
  // size/mtime rows only; decoding happens per visible card, or on demand
  // (dimensions sort, duplicates) via runFullIndex.
  useEffect(() => {
    const myGeneration = generationRef.current;
    let buffer = new Map<string, AssetFacts>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      timer = undefined;
      if (myGeneration !== generationRef.current || buffer.size === 0) return;
      const batch = buffer;
      buffer = new Map();
      setFacts(prev => { const next = new Map(prev); batch.forEach((v, k) => next.set(k, v)); return next; });
    };
    void indexFiles(folderFiles, (id, f) => {
      buffer.set(id, f);
      timer ??= setTimeout(flush, 120);
    }, () => myGeneration !== generationRef.current, false)
      .then(flush)
      .catch(() => { /* index is best-effort — never fatal */ });
    return () => { if (timer) clearTimeout(timer); };
  }, [folderFiles]);

  const runFullIndex = useCallback((): Promise<void> => {
    if (fullIndexRef.current) return fullIndexRef.current;
    const myGeneration = generationRef.current;
    let buffer = new Map<string, AssetFacts>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      timer = undefined;
      if (myGeneration !== generationRef.current || buffer.size === 0) return;
      const batch = buffer;
      buffer = new Map();
      setFacts(prev => { const next = new Map(prev); batch.forEach((v, k) => next.set(k, v)); return next; });
    };
    setIsFullIndexing(true);
    const p = indexFiles(folderFiles, (id, f) => {
      buffer.set(id, f);
      timer ??= setTimeout(flush, 120);
    }, () => myGeneration !== generationRef.current, true)
      .then(flush)
      .catch(() => { /* best-effort — callers must never see a rejection */ })
      .finally(() => {
        if (timer) clearTimeout(timer);
        fullIndexRef.current = null;
        setIsFullIndexing(false);
      });
    fullIndexRef.current = p;
    return p;
  }, [folderFiles]);

  const allExtracted = useMemo(
    () => folderFiles.length > 0 && folderFiles.every(f => facts.get(f.id)?.extracted === true),
    [folderFiles, facts],
  );

  useEffect(() => {
    if (sortKey === 'dimensions' && !allExtracted && folderFiles.length > 0) void runFullIndex();
  }, [sortKey, allExtracted, folderFiles, runFullIndex]);

  // ── Entries: facts + metadata, stacks collapsed, filtered and sorted ──

  const entries = useMemo<AssetEntry[]>(
    () => folderFiles.map(file => ({ file, facts: facts.get(file.id), meta: library.assets[file.id] })),
    [folderFiles, facts, library.assets],
  );
  const entryById = useMemo(() => new Map(entries.map(e => [e.file.id, e])), [entries]);

  const { shownEntries, stackInfo } = useMemo(() => {
    const present = new Set(folderFiles.map(f => f.id));
    const hidden = new Set<string>();
    const info = new Map<string, { stackId: string; count: number; expanded: boolean }>();
    for (const s of library.stacks) {
      const members = s.ids.filter(id => present.has(id));
      if (members.length < 2) continue;
      const expanded = expandedStacks.has(s.id);
      info.set(members[0], { stackId: s.id, count: members.length, expanded });
      if (!expanded) members.slice(1).forEach(id => hidden.add(id));
    }
    if (similar) {
      // Find-similar replaces the normal order: closest first, stacks don't hide members.
      const near = entries.filter(e => similar.distances.has(e.file.id) && matches(e, criteria));
      near.sort((a, b) => similar.distances.get(a.file.id)! - similar.distances.get(b.file.id)!);
      return { shownEntries: near, stackInfo: info };
    }
    const list = sortEntries(entries.filter(e => !hidden.has(e.file.id) && matches(e, criteria)), sortKey, descending);
    return { shownEntries: list, stackInfo: info };
  }, [entries, folderFiles, library.stacks, expandedStacks, criteria, sortKey, descending, similar]);

  const visibleFiles = useMemo(() => shownEntries.slice(0, visibleCount).map(e => e.file), [shownEntries, visibleCount]);
  const loadedThumbCount = visibleFiles.filter(f => {
    const row = facts.get(f.id);
    // Settled = has a URL, or no thumb is expected (non-previewable format),
    // or the file failed (badge instead of a spinner) — never count an
    // in-flight full-file fetch as done.
    return objectUrls.has(f.id) || (!!row?.extracted && !row.thumb && (!BROWSER_SHOWS.has(f.ext) || !!row.failed));
  }).length;
  const isDecodingThumbs = !isListingFolder && visibleFiles.length > 0 && loadedThumbCount < visibleFiles.length;
  const decodePercent = visibleFiles.length > 0 ? Math.round((loadedThumbCount / visibleFiles.length) * 100) : 0;
  const folderExts = useMemo(() => [...new Set(folderFiles.map(f => f.ext))].sort(), [folderFiles]);
  const vocabulary = useMemo(() => [...new Set(Object.values(library.assets).flatMap(m => m.tags ?? []))].sort(), [library.assets]);

  // ── Card images for the visible slice (Jev lazy split): extract or upgrade
  // first, then the cached thumb — else (facts known, no thumbnail) the file
  // itself if the browser can show it.

  const pumpExtractQueue = () => {
    const q = extractQueueRef.current;
    while (q.active < EXTRACT_CONCURRENCY && q.jobs.length > 0) {
      const job = q.jobs.shift()!;
      q.active++;
      void job().finally(() => { q.active--; pumpExtractQueue(); });
    }
  };

  useEffect(() => {
    const myGeneration = generationRef.current;
    const add = (id: string, url: string) => setObjectUrls(prev => { const next = new Map(prev); next.set(id, url); return next; });
    const ensureFacts = (file: AssetFile, f: AssetFacts | undefined) => {
      // Generation-scoped guard: a queued job from a previous folder switch
      // must not block the current generation from re-extracting the same file.
      const guardKey = `${myGeneration}:${file.id}`;
      if (visibleExtractRef.current.has(guardKey)) return;
      const target = gridThumbTarget();
      const needsExtract = !f?.extracted;
      // "At spec" means the encoded width matches what scaling the stored
      // dimensions to the target would produce — never the raw target, which
      // loops forever on any image narrower than it (portraits, small files).
      const wantW = f?.width != null && f?.height != null ? scaledThumbSize(f.width, f.height, target).tw : target;
      const needsUpgrade = !!f?.extracted && f.thumb !== undefined && (f.thumbW ?? 0) < wantW;
      if (!needsExtract && !needsUpgrade) return;
      visibleExtractRef.current.add(guardKey);
      extractQueueRef.current.jobs.push(async () => {
        try {
          const src = await file.handle.getFile();
          const fresh = await extractFacts(src, file.ext, f).catch((): AssetFacts => ({ size: src.size, mtime: src.lastModified, extracted: true }));
          if (myGeneration !== generationRef.current) return;
          await putCachedFacts(file.id, fresh);
          if (myGeneration !== generationRef.current) return;
          if (needsUpgrade) {
            const oldUrl = objectUrlsRef.current.get(file.id);
            if (oldUrl) { revoke(oldUrl); objectUrlsRef.current.delete(file.id); }
            setObjectUrls(prev => {
              if (!prev.has(file.id)) return prev;
              const next = new Map(prev);
              next.delete(file.id);
              return next;
            });
          }
          setFacts(prev => { const next = new Map(prev); next.set(file.id, fresh); return next; });
        } catch {
          // Unreadable file (moved/removed under us): settle as failed so the
          // loader terminates and the card shows its type badge — in-memory
          // only, never persisted, so a later rescan retries.
          if (myGeneration !== generationRef.current) return;
          setFacts(prev => {
            const cur = prev.get(file.id);
            if (cur?.failed) return prev;
            const next = new Map(prev);
            next.set(file.id, { ...(cur ?? { size: 0, mtime: 0 }), extracted: true, failed: true });
            return next;
          });
        } finally {
          visibleExtractRef.current.delete(guardKey);
        }
      });
      pumpExtractQueue();
    };
    visibleFiles.forEach(file => {
      ensureFacts(file, facts.get(file.id));
      if (objectUrlsRef.current.has(file.id)) return;
      const f = facts.get(file.id);
      if (!f?.extracted) return;
      if (f.thumb) {
        const url = track(URL.createObjectURL(f.thumb));
        objectUrlsRef.current.set(file.id, url);
        add(file.id, url);
      } else if (BROWSER_SHOWS.has(file.ext) && !f.failed) {
        objectUrlsRef.current.set(file.id, '');
        void file.handle.getFile().then(blob => {
          if (myGeneration !== generationRef.current) return; // stale — folder switched under us
          const url = track(URL.createObjectURL(blob));
          objectUrlsRef.current.set(file.id, url);
          add(file.id, url);
        }).catch(() => {
          // Unreadable file: release the in-flight marker (otherwise this
          // ref blocks every retry) and settle as failed — the card shows
          // its type badge and the loader counts the file as done.
          objectUrlsRef.current.delete(file.id);
          if (myGeneration !== generationRef.current) return;
          setFacts(prev => {
            const cur = prev.get(file.id);
            if (cur?.failed) return prev;
            const next = new Map(prev);
            next.set(file.id, { ...(cur ?? { size: 0, mtime: 0 }), extracted: true, failed: true });
            return next;
          });
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleFiles, facts]);

  // Unmount teardown — useObjectUrls already revokes tracked URLs, this just
  // clears local bookkeeping.
  useEffect(() => () => { objectUrlsRef.current = new Map(); }, []);

  // Full-resolution image for the lightbox (RAW: its embedded preview).
  useEffect(() => {
    const file = lightboxIndex === null ? undefined : visibleFiles[lightboxIndex];
    if (!file) { setLightboxUrl(null); return; }
    let cancelled = false;
    let made: string | null = null;
    void (async () => {
      const blob = await file.handle.getFile();
      let src: Blob = blob;
      if (RAW_EXT_SET.has(file.ext)) {
        const bmp = await largestEmbeddedJpeg(new Uint8Array(await blob.arrayBuffer()));
        if (!bmp) return;
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        c.getContext('2d')!.drawImage(bmp, 0, 0);
        bmp.close();
        src = await c.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
      }
      if (cancelled) return;
      made = track(URL.createObjectURL(src));
      setLightboxUrl({ id: file.id, url: made });
    })().catch(() => { /* keep the thumbnail */ });
    return () => { cancelled = true; if (made) revoke(made); };
  }, [lightboxIndex, visibleFiles, track, revoke]);

  const lightboxUrls = useMemo(() => {
    if (!lightboxUrl) return objectUrls;
    const m = new Map(objectUrls);
    m.set(lightboxUrl.id, lightboxUrl.url);
    return m;
  }, [objectUrls, lightboxUrl]);

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
    }, [visibleFiles, selectedIds]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  const selectedEntries = useMemo(() => entries.filter(e => selectedIds.has(e.file.id)), [entries, selectedIds]);

  // ── File operations (rename / copy / move / write-back / undo) ─────────
  // Each starts with the write-permission request, before any other await,
  // so the click's user gesture is still live when the browser asks.

  const needWrite = useCallback(async (rootIds: string[]): Promise<boolean> => {
    for (const id of [...new Set(rootIds)]) {
      const root = rootById(id);
      if (!root || !(await ensureWritable(root.handle))) {
        showGlobalFeedback?.(`Write access to "${root?.name ?? 'a folder root'}" wasn't granted — nothing was changed.`);
        return false;
      }
    }
    return true;
  }, [rootById, showGlobalFeedback]);

  const applyTransfers = useCallback((done: Transferred[], mode: 'move' | 'copy') => {
    for (const d of done) {
      if (mode === 'move') { relocate(d.fromId, d.toId); void relocateCachedFacts(d.fromId, d.toId); }
      else copyMeta(d.fromId, d.toId);
    }
  }, []);

  const finishOp = useCallback((summary: string) => {
    showGlobalFeedback?.(summary);
    setSelectedIds(new Set());
    setDialog(null);
    setRefreshTick(t => t + 1);
  }, [showGlobalFeedback]);

  const runTransfer = useCallback(async (
    files: AssetFile[], dest: { rootId: string; path: string; handle: FileSystemDirectoryHandle }, mode: 'move' | 'copy', policy: ConflictPolicy, destName: string,
  ) => {
    if (!(await needWrite([dest.rootId, ...(mode === 'move' ? files.map(f => f.rootId) : [])]))) return;
    setIsBusy(true);
    try {
      const items = await Promise.all(files.map(async file => ({ file, srcDir: await resolveDir(rootById(file.rootId)!.handle, parentOf(file.path)) })));
      const res = await transferFiles(items, dest, mode, policy);
      applyTransfers(res.done, mode);
      await recordOp({ kind: 'transfer', mode, label: `${mode === 'move' ? 'Move' : 'Copy'} ${res.done.length} to "${destName}"`, items: res.done }).catch(() => {});
      const verb = mode === 'move' ? 'Moved' : 'Copied';
      finishOp([
        `${verb} ${res.done.length} file${res.done.length === 1 ? '' : 's'} to "${destName}".`,
        res.skipped.length ? `Skipped ${res.skipped.length} (same name exists).` : '',
        res.failed.length ? `Failed ${res.failed.length}: ${res.failed[0].error}` : '',
      ].filter(Boolean).join(' '));
    } catch (e) {
      showGlobalFeedback?.(`${mode === 'move' ? 'Move' : 'Copy'} failed: ${errText(e)}`);
    } finally {
      setIsBusy(false);
    }
  }, [needWrite, rootById, applyTransfers, finishOp, showGlobalFeedback]);

  const handlePaste = useCallback(async (destRootId: string, destPath: string, asCopy = false) => {
    const cb = clipboardContent();
    if (!cb) return;
    const { fileIds, rootId: srcRootId, folderPath, mode } = cb;
    const srcRoot = rootById(srcRootId);
    if (!srcRoot) {
      showGlobalFeedback?.('The source folder is no longer connected.');
      return;
    }
    const destRoot = rootById(destRootId);
    if (!destRoot) {
      showGlobalFeedback?.('The destination folder is no longer connected.');
      return;
    }
    const actualMode: 'copy' | 'move' = asCopy ? 'copy' : mode === 'cut' ? 'move' : 'copy';

    try {
      const srcDir = await resolveDir(srcRoot.handle, folderPath);
      const destDir = await resolveDir(destRoot.handle, destPath);
      const files: AssetFile[] = [];
      for (const id of fileIds) {
        const colon = id.indexOf(':');
        const path = id.slice(colon + 1);
        const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
        const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
        try {
          const handle = await srcDir.getFileHandle(name);
          files.push({ id, rootId: srcRootId, path, name, ext, handle });
        } catch {
          // File might be deleted or moved, ignore
        }
      }
      if (!files.length) return;
      await runTransfer(files, { rootId: destRootId, path: destPath, handle: destDir }, actualMode, 'keep-both', destPath || srcRoot.name || 'Root');
      if (mode === 'cut' && !asCopy) clipboardClear();
    } catch (e) {
      showGlobalFeedback?.(`Could not paste: ${errText(e)}`);
    }
  }, [rootById, runTransfer, showGlobalFeedback]);

  // Keyboard (plan Tasks 10, 25 + Phase 1): rate/label the selection, select
  // all, clear, clipboard. Lives below handlePaste so the deps resolve.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (lightboxIndex !== null || dialog) return;
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setDialog('shortcuts'); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && visibleFiles.length) {
        e.preventDefault();
        setSelectedIds(new Set(visibleFiles.map(f => f.id)));
        return;
      }
      if (e.altKey || selectedIds.size === 0) return;
      const ids = [...selectedIds];
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (selectedRoot) {
          clipboardCopy(ids, selectedRoot.id, selectedFolderPath);
          showGlobalFeedback?.(`Copied ${ids.length} item${ids.length === 1 ? '' : 's'}.`);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        if (selectedRoot) {
          clipboardCut(ids, selectedRoot.id, selectedFolderPath);
          showGlobalFeedback?.(`Cut ${ids.length} item${ids.length === 1 ? '' : 's'}.`);
        }
      } else if (!e.ctrlKey && !e.metaKey && /^[0-5]$/.test(e.key)) {
        updateMeta(ids, { rating: Number(e.key) || undefined });
      } else if (!e.ctrlKey && !e.metaKey && LABEL_KEYS[e.key]) {
        updateMeta(ids, m => ({ ...m, label: ids.length === 1 && m.label === LABEL_KEYS[e.key] ? undefined : LABEL_KEYS[e.key] }));
      } else if (!e.ctrlKey && !e.metaKey && e.key === 'Escape') {
        clearSelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (selectedRoot) {
          void handlePaste(selectedRoot.id, selectedFolderPath, e.shiftKey);
        }
      } else {
        return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds, visibleFiles, lightboxIndex, dialog, clearSelection, handlePaste, selectedRoot, selectedFolderPath, showGlobalFeedback]);

  const handleMoveToTrash = useCallback(async (fileIds: Set<string>) => {
    const root = selectedRoot;
    if (!root || !(await needWrite([root.id]))) return;
    const files = folderFiles.filter(f => fileIds.has(f.id));
    if (!files.length) return;
    const ok = await ask.confirm(files.length > 1 ? `Move ${files.length} files to trash?` : `Move "${files[0]?.name}" to trash?`, 'Move to trash');
    if (!ok) return;
    setIsBusy(true);
    try {
      await moveToTrash(root.handle, files);
      clearSelection();
      setRefreshTick(t => t + 1);
      setTrashTick(t => t + 1);
      finishOp(`Moved ${files.length} file${files.length === 1 ? '' : 's'} to trash.`);
    } catch (e) { showGlobalFeedback?.(`Could not move to trash: ${errText(e)}`); }
    finally { setIsBusy(false); }
  }, [ask, selectedRoot, folderFiles, needWrite, clearSelection, showGlobalFeedback, finishOp]);



  const handleFolderCreate = useCallback(async (parentNode: DirectoryNode) => {
    const root = roots.find(r => r.id === parentNode.rootId);
    if (!root || !(await needWrite([root.id]))) return;
    const name = (await ask.prompt('New folder name', ''))?.trim();
    if (!name) return;
    try {
      await createFolder(root.handle, parentNode.path, name);
      setRefreshTick(t => t + 1);
      setTreeTick(t => t + 1);
      finishOp(`Created folder "${name}".`);
    } catch (e) { showGlobalFeedback?.(`Could not create folder: ${errText(e)}`); }
  }, [ask, roots, needWrite, showGlobalFeedback, finishOp]);

  const handleFolderRename = useCallback(async (node: DirectoryNode) => {
    const root = roots.find(r => r.id === node.rootId);
    if (!root || !(await needWrite([root.id]))) return;
    const parts = node.path.split('/').filter(Boolean);
    const oldName = parts[parts.length - 1] ?? node.name;
    const parentPath = parts.slice(0, -1).join('/');
    const newName = (await ask.prompt('Rename folder to', oldName))?.trim();
    if (!newName || newName === oldName) return;
    try {
      await renameFolder(root.handle, parentPath, oldName, newName);
      setRefreshTick(t => t + 1);
      setTreeTick(t => t + 1);
      finishOp(`Renamed folder to "${newName}".`);
    } catch (e) { showGlobalFeedback?.(`Could not rename folder: ${errText(e)}`); }
  }, [ask, roots, needWrite, showGlobalFeedback, finishOp]);

  const handleFolderDelete = useCallback(async (node: DirectoryNode) => {
    const root = roots.find(r => r.id === node.rootId);
    if (!root || !(await needWrite([root.id]))) return;
    try {
      await deleteFolder(root.handle, node.path, false);
      setRefreshTick(t => t + 1);
      setTreeTick(t => t + 1);
      finishOp(`Deleted folder "${node.name}".`);
    } catch (e) {
      if (e instanceof FolderNotEmptyError) {
        const ok = await ask.confirm(`"${node.name}" is not empty. Delete it and all its contents?`, 'Delete all');
        if (!ok) return;
        try {
          await deleteFolder(root.handle, node.path, true);
          setRefreshTick(t => t + 1);
          setTreeTick(t => t + 1);
          finishOp(`Deleted folder "${node.name}" and its contents.`);
        } catch (e2) { showGlobalFeedback?.(`Could not delete folder: ${errText(e2)}`); }
      } else {
        showGlobalFeedback?.(`Could not delete folder: ${errText(e)}`);
      }
    }
  }, [ask, roots, needWrite, showGlobalFeedback, finishOp]);

  const handleRestoreFromTrash = useCallback(async (entries: TrashedEntry[]) => {
    if (!selectedRoot || entries.length === 0 || !(await needWrite([selectedRoot.id]))) return;
    setIsBusy(true);
    try {
      await restoreFromTrash(selectedRoot.handle, entries);
      setTrashTick(t => t + 1);
      finishOp(entries.length === 1 ? `Restored "${entries[0].name}".` : `Restored ${entries.length} files.`);
    } catch (e) { showGlobalFeedback?.(`Could not restore: ${errText(e)}`); }
    finally { setIsBusy(false); }
  }, [selectedRoot, needWrite, finishOp, showGlobalFeedback]);

  const handleTrashDeleteForever = useCallback(async (entries: TrashedEntry[]) => {
    if (!selectedRoot || entries.length === 0 || !(await needWrite([selectedRoot.id]))) return;
    const label = entries.length === 1 ? `"${entries[0].name}"` : `${entries.length} files`;
    const ok = await ask.confirm(`Permanently delete ${label}? This cannot be undone.`, 'Delete forever');
    if (!ok) return;
    setIsBusy(true);
    try {
      const removed = await deleteForever(selectedRoot.handle, entries);
      setTrashTick(t => t + 1);
      finishOp(`Permanently deleted ${removed} item${removed === 1 ? '' : 's'}.`);
    } catch (e) { showGlobalFeedback?.(`Could not delete: ${errText(e)}`); }
    finally { setIsBusy(false); }
  }, [ask, selectedRoot, needWrite, finishOp, showGlobalFeedback]);

  const handleEmptyTrash = useCallback(async () => {
    const count = trashEntries.length;
    if (!selectedRoot || count === 0 || !(await needWrite([selectedRoot.id]))) return;
    const ok = await ask.confirm(`Empty the trash? ${count} item${count === 1 ? '' : 's'} will be permanently deleted.`, 'Empty trash');
    if (!ok) return;
    setIsBusy(true);
    try {
      await emptyTrash(selectedRoot.handle);
      setTrashTick(t => t + 1);
      finishOp(`Emptied the trash (${count} item${count === 1 ? '' : 's'}).`);
    } catch (e) { showGlobalFeedback?.(`Could not empty the trash: ${errText(e)}`); }
    finally { setIsBusy(false); }
  }, [ask, selectedRoot, trashEntries, needWrite, finishOp, showGlobalFeedback]);



  const buildTreeMenu = useCallback((node: DirectoryNode): MenuItem[] => [
    { kind: 'action', label: 'Open', onSelect: () => { setSelectedFolderPath(node.path); setView({ kind: 'folder' }); } },
    { kind: 'action', label: 'New Folder…', onSelect: () => void handleFolderCreate(node) },
    { kind: 'action', label: 'Paste', disabled: !clipboardHasContent(), onSelect: () => void handlePaste(node.rootId, node.path) },
    { kind: 'action', label: 'Paste as Copy', disabled: !clipboardHasContent(), onSelect: () => void handlePaste(node.rootId, node.path, true) },
    { kind: 'separator' },
    { kind: 'action', label: 'Rename Folder…', onSelect: () => void handleFolderRename(node) },
    { kind: 'separator' },
    { kind: 'action', label: 'Delete Folder', danger: true, onSelect: () => void handleFolderDelete(node) },
  ], [handlePaste, handleFolderCreate, handleFolderRename, handleFolderDelete]);

  const buildTrashMenu = useCallback((): MenuItem[] => [
    { kind: 'action', label: 'Refresh', onSelect: () => setTrashTick(t => t + 1) },
    { kind: 'separator' },
    { kind: 'action', label: 'Empty Trash', danger: true, disabled: trashEntries.length === 0, onSelect: () => void handleEmptyTrash() },
  ], [trashEntries.length, handleEmptyTrash]);

  const buildTrashItemMenu = useCallback((entry: TrashedEntry): MenuItem[] => [
    { kind: 'action', label: 'Restore', onSelect: () => void handleRestoreFromTrash([entry]) },
    { kind: 'separator' },
    { kind: 'action', label: 'Delete Forever', danger: true, onSelect: () => void handleTrashDeleteForever([entry]) },
  ], [handleRestoreFromTrash, handleTrashDeleteForever]);

  const buildGridMenu = useCallback((): MenuItem[] => [
    { kind: 'action', label: 'Paste', disabled: !clipboardHasContent(), shortcut: 'Ctrl+V', onSelect: () => { if (selectedRoot) void handlePaste(selectedRoot.id, selectedFolderPath); } },
    { kind: 'action', label: 'Paste as Copy', disabled: !clipboardHasContent(), shortcut: 'Ctrl+Shift+V', onSelect: () => { if (selectedRoot) void handlePaste(selectedRoot.id, selectedFolderPath, true); } },
    { kind: 'separator' },
    { kind: 'action', label: 'Select All', shortcut: 'Ctrl+A', onSelect: () => setSelectedIds(new Set(visibleFiles.map(f => f.id))) },
    { kind: 'action', label: 'Clear Selection', shortcut: 'Esc', disabled: selectedIds.size === 0, onSelect: clearSelection },
    { kind: 'separator' },
    { kind: 'submenu', label: 'Sort By', children: [
      { kind: 'action', label: sortKey === 'manual' ? '• Manual order' : 'Manual order', onSelect: () => setSortKey('manual') },
      { kind: 'action', label: sortKey === 'name' ? '• Name' : 'Name', onSelect: () => setSortKey('name') },
      { kind: 'action', label: sortKey === 'date' ? '• Date' : 'Date', onSelect: () => setSortKey('date') },
      { kind: 'action', label: sortKey === 'size' ? '• Size' : 'Size', onSelect: () => setSortKey('size') },
      { kind: 'action', label: sortKey === 'rating' ? '• Rating' : 'Rating', onSelect: () => setSortKey('rating') },
      { kind: 'separator' },
      { kind: 'action', label: descending ? '• Descending' : 'Descending', onSelect: () => setDescending(true) },
      { kind: 'action', label: !descending ? '• Ascending' : 'Ascending', onSelect: () => setDescending(false) },
    ] },
      { kind: 'action', label: 'Refresh', onSelect: () => { setRefreshTick(t => t + 1); setTreeTick(t => t + 1); } },
  ], [handlePaste, selectedRoot, selectedFolderPath, visibleFiles, selectedIds.size, clearSelection, sortKey, descending]);

  const buildRootMenu = useCallback((root: AssetRootState): MenuItem[] => [
    { kind: 'action', label: 'Reconnect', disabled: root.status === 'granted', onSelect: () => void handleReconnect(root) },
    { kind: 'separator' },
    { kind: 'action', label: 'Remove Root', danger: true, onSelect: () => void handleRemoveRoot(root.id) },
  ], [handleReconnect, handleRemoveRoot]);

  const handleRename = useCallback(async (plan: RenamePlanItem[]) => {
    const root = selectedRoot;
    if (!root || !(await needWrite([root.id]))) return;
    setIsBusy(true);
    const changing = plan.filter(p => p.newName !== p.entry.file.name);
    const stamp = Date.now();
    const parked: { p: RenamePlanItem; temp: string }[] = [];
    const done: Transferred[] = [];
    try {
      const dir = await resolveDir(root.handle, selectedFolderPath);
      // Two phases (temporary names first) so names swapping within the batch can't collide.
      for (const [i, p] of changing.entries()) {
        const temp = `.kollektiv-rename-${stamp}-${i}`;
        await moveOne(p.entry.file.handle, dir, p.entry.file.name, dir, temp);
        parked.push({ p, temp });
      }
      while (parked.length) {
        const { p, temp } = parked[0];
        await moveOne(await dir.getFileHandle(temp), dir, temp, dir, p.newName);
        parked.shift();
        const toPath = joinPath(selectedFolderPath, p.newName);
        done.push({ fromId: p.entry.file.id, toId: `${root.id}:${toPath}`, fromRootId: root.id, fromPath: p.entry.file.path, toRootId: root.id, toPath });
      }
    } catch (e) {
      // Put any file still parked under a temporary name back where it was.
      const dir = await resolveDir(root.handle, selectedFolderPath).catch(() => null);
      for (const { p, temp } of parked) {
        if (dir) await moveOne(await dir.getFileHandle(temp), dir, temp, dir, p.entry.file.name).catch(() => {});
      }
      showGlobalFeedback?.(`Rename stopped: ${errText(e)}`);
    } finally {
      applyTransfers(done, 'move');
      await recordOp({ kind: 'transfer', mode: 'move', label: `Rename ${done.length}`, items: done }).catch(() => {});
      setIsBusy(false);
      if (done.length) finishOp(`Renamed ${done.length} file${done.length === 1 ? '' : 's'}.`);
    }
  }, [selectedRoot, selectedFolderPath, needWrite, applyTransfers, finishOp, showGlobalFeedback]);

  const handleWriteMetadata = useCallback(async () => {
    const targets = selectedEntries.filter(e => canWriteMetadata(e.file.ext));
    if (!targets.length || !(await needWrite(targets.map(e => e.file.rootId)))) return;
    setIsBusy(true);
    const originals: { rootId: string; path: string; original: Blob }[] = [];
    const failed: string[] = [];
    for (const e of targets) {
      try {
        const original = await e.file.handle.getFile();
        const meta = library.assets[e.file.id] ?? {};
        const out = writeMetadata(new Uint8Array(await original.arrayBuffer()), e.file.ext, meta);
        const w = await e.file.handle.createWritable(); // atomic: the file is swapped on close
        await w.write(out as Uint8Array<ArrayBuffer>);
        await w.close();
        const back = readXmpFields(new Uint8Array(await (await e.file.handle.getFile()).arrayBuffer()), e.file.ext);
        if (!back || !sameMeta(back, meta)) {
          const r = await e.file.handle.createWritable();
          await r.write(original);
          await r.close();
          throw new Error('read-back did not match; the original was restored');
        }
        originals.push({ rootId: e.file.rootId, path: e.file.path, original });
      } catch (err) {
        failed.push(`${e.file.name}: ${errText(err)}`);
      }
    }
    await recordOp({ kind: 'write', label: `Write metadata to ${originals.length}`, files: originals }).catch(() => {});
    setIsBusy(false);
    const skipped = selectedEntries.length - targets.length;
    showGlobalFeedback?.([
      `Wrote metadata into ${originals.length} file${originals.length === 1 ? '' : 's'}.`,
      skipped ? `${skipped} stay index-only (not JPEG/PNG).` : '',
      failed.length ? `Failed: ${failed[0]}` : '',
    ].filter(Boolean).join(' '));
    setRefreshTick(t => t + 1);
  }, [selectedEntries, library.assets, needWrite, showGlobalFeedback]);

  const handleUndo = useCallback(async () => {
    const entry = undoEntry;
    if (!entry) return;
    const op = entry.op;
    const rootIds = op.kind === 'write' ? op.files.map(f => f.rootId) : op.items.flatMap(i => [i.fromRootId, i.toRootId]);
    if (!(await needWrite(rootIds))) return;
    setIsBusy(true);
    try {
      const res = await undoOp(entry, id => rootById(id)?.handle ?? null);
      res.relocations.forEach(r => { relocate(r.from, r.to); void relocateCachedFacts(r.from, r.to); });
      if (res.removed.length) updateMeta(res.removed, () => ({}));
      showGlobalFeedback?.(res.failed.length
        ? `Undo of "${op.label}" was partial — ${res.failed.length} item(s) couldn't be reversed: ${res.failed[0].error}`
        : `Undid "${op.label}".`);
      refreshUndo();
      setRefreshTick(t => t + 1);
    } catch (e) {
      showGlobalFeedback?.(`Undo failed: ${errText(e)}`);
    } finally {
      setIsBusy(false);
    }
  }, [undoEntry, needWrite, rootById, refreshUndo, showGlobalFeedback]);

  // ── Drag-and-drop: move selected assets into a sidebar folder ────────

  const handleCardDragStart = useCallback((file: AssetFile, e: React.DragEvent) => {
    draggedFolderRef.current = null;
    const ids = selectedIds.has(file.id) && selectedIds.size > 0 ? Array.from(selectedIds) : [file.id];
    draggedFileIdsRef.current = ids;
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('text/plain', ids.join(','));

    if (ids.length > 1) {
      const ghost = document.createElement('div');
      ghost.textContent = `Dragging ${ids.length} items`;
      ghost.className = 'px-3 py-1.5 bg-primary text-primary-content text-xs font-mono font-black uppercase rounded shadow-xl z-toast absolute top-[-1000px] left-[-1000px] pointer-events-none whitespace-nowrap';
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, -10, -10);
      setTimeout(() => document.body.removeChild(ghost), 0);
    }
  }, [selectedIds]);

  // ── Drag-and-drop: folder → folder move (plan §4.2 — background + progress) ─

  const runFolderMove = useCallback(async (srcPath: string, targetNode: DirectoryNode) => {
    if (!selectedRoot || folderMoveProgress) return;
    if (!(await needWrite([selectedRoot.id]))) return;
    const rootHandle = rootById(selectedRoot.id)?.handle;
    if (!rootHandle) return;
    const srcName = srcPath.split('/').filter(Boolean).pop() ?? srcPath;
    const destPath = joinPath(targetNode.path, srcName);
    folderCancelRef.current = false;
    setFolderMoveCancelling(false);
    setFolderMoveProgress({ moved: 0, total: 0, currentFile: '' });
    lastProgressAtRef.current = 0;
    try {
      const res = await moveFolder(
        selectedRoot.id, rootHandle, srcPath,
        selectedRoot.id, rootHandle, destPath,
        folderCancelRef,
        p => {
          const now = Date.now();
          if (now - lastProgressAtRef.current < 250) return;
          lastProgressAtRef.current = now;
          setFolderMoveProgress({ moved: p.moved, total: p.total, currentFile: p.currentFile });
        },
      );
      applyTransfers(res.moved, 'move');
      if (selectedFolderPath === srcPath || selectedFolderPath.startsWith(srcPath + '/')) setSelectedFolderPath('');
      setTreeTick(t => t + 1);
      setRefreshTick(t => t + 1);
      const n = res.moved.length;
      const failedNote = res.failed.length ? ` ${res.failed.length} failed.` : '';
      showGlobalFeedback?.(res.cancelled
        ? `Cancelled — ${n} file${n === 1 ? '' : 's'} moved before cancel.${failedNote}`
        : `Moved folder "${srcName}" to "${targetNode.path || targetNode.name}" — ${n} file${n === 1 ? '' : 's'}.${failedNote}`);
    } catch (e) {
      showGlobalFeedback?.(`Folder move failed: ${errText(e)}`);
      setTreeTick(t => t + 1);
      setRefreshTick(t => t + 1);
    } finally {
      setFolderMoveProgress(null);
      setFolderMoveCancelling(false);
    }
  }, [selectedRoot, rootById, needWrite, folderMoveProgress, applyTransfers, selectedFolderPath, showGlobalFeedback]);

  const handleFolderDragStart = useCallback((node: DirectoryNode, e: React.DragEvent) => {
    draggedFileIdsRef.current = [];
    draggedFolderRef.current = { path: node.path, rootId: selectedRoot?.id ?? '' };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', node.path);
  }, [selectedRoot]);

  const handleFolderDragEnd = useCallback(() => { draggedFolderRef.current = null; }, []);

  const canDropFolderOn = useCallback((destPath: string): boolean => {
    const folder = draggedFolderRef.current;
    if (!folder) return true;
    if (selectedRoot && folder.rootId !== selectedRoot.id) return false;
    return !isInvalidFolderDrop(folder.path, destPath);
  }, [selectedRoot]);

  const handleCancelFolderMove = useCallback(() => {
    folderCancelRef.current = true;
    setFolderMoveCancelling(true);
  }, []);

  const handleFolderDrop = useCallback(async (targetNode: DirectoryNode, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverPath(null);
    const folder = draggedFolderRef.current;
    const ids = draggedFileIdsRef.current;
    draggedFolderRef.current = null;
    draggedFileIdsRef.current = [];
    if (folder) {
      if (!selectedRoot || folder.rootId !== selectedRoot.id) return;
      if (isInvalidFolderDrop(folder.path, targetNode.path)) return;
      await runFolderMove(folder.path, targetNode);
      return;
    }
    if (ids.length === 0 || !selectedRoot) return;
    if (view.kind === 'folder' && targetNode.path === selectedFolderPath) return; // dropped on the folder they're already in
    const filesToMove = folderFiles.filter(f => ids.includes(f.id));
    if (filesToMove.length === 0) return;
    const op = e.shiftKey ? 'copy' : 'move';
    await runTransfer(filesToMove, { rootId: selectedRoot.id, path: targetNode.path, handle: targetNode.handle }, op, 'keep-both', targetNode.name);
  }, [selectedRoot, view.kind, selectedFolderPath, folderFiles, runTransfer, runFolderMove]);

  // ── Drag-and-drop: drop an OS folder onto the roots panel to add it ──

  const handleRootsDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingRootDrop(false);
    if (draggedFileIdsRef.current.length || draggedFolderRef.current) return;
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
        const entries_ = await Promise.all(files.map(async f => ({ name: f.path, content: await f.handle.getFile() })));
        await downloadZip(entries_, `assets-export-${Date.now()}.zip`);
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

  const handleOpenInVideoEditor = useCallback(async () => {
    const files = getSelectedFiles();
    if (files.length === 0) return;
    setIsBusy(true);
    try {
      const blobs = await Promise.all(files.map(async (f) => ({ blob: await f.handle.getFile(), name: f.name })));
      openInVideoEditor(blobs);
    } catch (e) {
      showGlobalFeedback?.(e instanceof Error ? e.message : 'Could not open in video editor.');
    } finally {
      setIsBusy(false);
    }
  }, [getSelectedFiles, showGlobalFeedback]);

  /** Resizer / Media Analyzer handoff (plan Task 23): park the files, navigate. */
  const handleSendTo = useCallback(async (target: HandoffTarget) => {
    const files = getSelectedFiles().filter(f => !RAW_EXT_SET.has(f.ext));
    if (files.length === 0) { showGlobalFeedback?.('RAW files can\'t go there — develop them in the Image Editor first.'); return; }
    setIsBusy(true);
    try {
      setPendingFiles(target, await Promise.all(files.map(f => f.handle.getFile())));
      appEventBus.emit('navigate', target);
    } catch (e) {
      showGlobalFeedback?.(`Could not hand the files over: ${errText(e)}`);
    } finally {
      setIsBusy(false);
    }
  }, [getSelectedFiles, showGlobalFeedback]);

  const handleSaveToVault = useCallback(async (categoryId: string | undefined) => {
    setIsBusy(true);
    setDialog(null);
    try {
      const res = await saveToVault(selectedEntries.map(e => ({ file: e.file, meta: e.meta })), categoryId);
      showGlobalFeedback?.([
        `Saved ${res.saved} to the gallery.`,
        res.skipped.length ? `Skipped ${res.skipped.length}: ${res.skipped[0].reason}.` : '',
        res.failed.length ? `Failed ${res.failed.length}: ${res.failed[0].error}` : '',
      ].filter(Boolean).join(' '));
    } catch (e) {
      showGlobalFeedback?.(errText(e));
    } finally {
      setIsBusy(false);
    }
  }, [selectedEntries, showGlobalFeedback]);

  /** Same actions as the inline toolbar, shaped for the mobile (below lg) ContextMenu dropdown (plan §5.1, Jev §2.5). */
  const selectionDropdownItems = useCallback((): MenuItem[] => [
    { kind: 'action', label: 'Export', disabled: isBusy, onSelect: () => void handleExport() },
    { kind: 'action', label: 'Convert', disabled: isBusy, onSelect: () => void handleSendToConverter() },
    { kind: 'action', label: 'Edit', disabled: isBusy || selectedIds.size !== 1, onSelect: () => void handleEditInImageEditor() },
    { kind: 'action', label: 'Video', disabled: isBusy || !getSelectedFiles().every(f => VIDEO_EDITOR_EXT_SET.has(f.ext)), onSelect: () => void handleOpenInVideoEditor() },
    { kind: 'action', label: 'Resize', disabled: isBusy, onSelect: () => void handleSendTo('resizer') },
    { kind: 'action', label: 'Analyze', disabled: isBusy || selectedIds.size !== 1, onSelect: () => void handleSendTo('media_analyzer') },
    { kind: 'action', label: 'To Vault', disabled: isBusy, onSelect: () => setDialog('vault') },
    { kind: 'separator' },
    { kind: 'action', label: 'Deselect', onSelect: clearSelection },
  ], [isBusy, selectedIds.size, getSelectedFiles, handleExport, handleSendToConverter, handleEditInImageEditor, handleOpenInVideoEditor, handleSendTo, clearSelection]);

  /** Find similar (plan Task 21 v1): nearest images by dHash among those in this view. */
  const handleFindSimilar = useCallback((id: string | undefined) => {
    const dhash = id ? entryById.get(id)?.facts?.dhash : undefined;
    if (!id || !dhash) { showGlobalFeedback?.("That image has no fingerprint yet — wait for indexing, or its format can't be decoded."); return; }
    const hashed = entries.filter(e => e.facts?.dhash).map(e => ({ id: e.file.id, dhash: e.facts!.dhash! }));
    const found = findSimilar({ id, dhash }, hashed);
    if (found.length === 0) { showGlobalFeedback?.('No similar images in this view.'); return; }
    setSimilar({ targetId: id, distances: new Map([[id, 0], ...found.map(f => [f.id, f.distance] as [string, number])]) });
    setSelectedIds(new Set());
    setVisibleCount(PAGE_SIZE);
  }, [entries, entryById, showGlobalFeedback]);

  const buildCardMenu = useCallback((effectiveIds: Set<string>): MenuItem[] => {
    const isSingle = effectiveIds.size === 1;
    const files = folderFiles.filter(f => effectiveIds.has(f.id));
    const canVideoEdit = files.length > 0 && files.every(f => VIDEO_EDITOR_EXT_SET.has(f.ext));

    return [
      { kind: 'action', label: 'Open', onSelect: () => setLightboxIndex(visibleFiles.findIndex(f => f.id === files[0]?.id)) },
      { kind: 'action', label: 'Select All', shortcut: 'Ctrl+A', onSelect: () => setSelectedIds(new Set(visibleFiles.map(f => f.id))) },
      { kind: 'action', label: 'Clear Selection', shortcut: 'Esc', disabled: effectiveIds.size === 0, onSelect: clearSelection },
      { kind: 'separator' },
      { kind: 'action', label: 'Rename…', onSelect: () => setDialog('rename') },
      { kind: 'action', label: 'Copy', shortcut: 'Ctrl+C', onSelect: () => { if (selectedRoot) clipboardCopy([...effectiveIds], selectedRoot.id, selectedFolderPath); } },
      { kind: 'action', label: 'Cut', shortcut: 'Ctrl+X', onSelect: () => { if (selectedRoot) clipboardCut([...effectiveIds], selectedRoot.id, selectedFolderPath); } },
      { kind: 'action', label: 'Paste', shortcut: 'Ctrl+V', disabled: !clipboardHasContent(), onSelect: () => { if (selectedRoot) void handlePaste(selectedRoot.id, selectedFolderPath); } },
      { kind: 'separator' },
      { kind: 'action', label: 'Copy to…', onSelect: () => setDialog('copymove') },
      { kind: 'action', label: 'Move to…', onSelect: () => setDialog('copymove') },
      { kind: 'separator' },
      { kind: 'action', label: 'Export…', onSelect: () => void handleExport() },
      { kind: 'action', label: 'Convert…', onSelect: () => void handleSendToConverter() },
      { kind: 'action', label: 'Edit in Image Editor', disabled: !isSingle, onSelect: () => void handleEditInImageEditor() },
      { kind: 'action', label: 'Open in Video Editor', disabled: !canVideoEdit, onSelect: () => void handleOpenInVideoEditor() },
      { kind: 'action', label: 'Resize…', onSelect: () => void handleSendTo('resizer') },
      { kind: 'action', label: 'Analyze…', disabled: !isSingle, onSelect: () => void handleSendTo('media_analyzer') },
      { kind: 'action', label: 'Find Similar', disabled: !isSingle, onSelect: () => handleFindSimilar([...effectiveIds][0]) },
      { kind: 'separator' },
      { kind: 'action', label: 'Save to Vault…', onSelect: () => setDialog('vault') },
      { kind: 'action', label: 'Write Metadata to File', onSelect: () => void handleWriteMetadata() },
      { kind: 'separator' },
      { kind: 'action', label: 'Move to Trash', danger: true, onSelect: () => void handleMoveToTrash(effectiveIds) },
    ];
  }, [folderFiles, visibleFiles, clearSelection, selectedRoot, selectedFolderPath, handleExport, handleSendToConverter, handleEditInImageEditor, handleOpenInVideoEditor, handleSendTo, handleWriteMetadata, handlePaste, handleMoveToTrash, handleFindSimilar]);

  const handleGridDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedFileIdsRef.current.length) return;
    
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setGridDragOverId(id);
    setGridDropPosition(e.clientY < midY ? 'before' : 'after');
  }, []);

  const handleGridDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setGridDragOverId(null);
    setGridDropPosition(null);

    const ids = draggedFileIdsRef.current;
    if (!ids.length || !gridDropPosition) return;
    
    const targetIdx = shownEntries.findIndex(en => en.file.id === targetId);
    if (targetIdx === -1) return;
    
    const draggedEntries = shownEntries.filter(en => ids.includes(en.file.id));
    const nonDragged = shownEntries.filter(en => !ids.includes(en.file.id));
    const newTargetIdx = nonDragged.findIndex(en => en.file.id === targetId);
    if (newTargetIdx === -1) return;
    
    const spliceIdx = gridDropPosition === 'before' ? newTargetIdx : newTargetIdx + 1;
    const newList = [...nonDragged.slice(0, spliceIdx), ...draggedEntries, ...nonDragged.slice(spliceIdx)];
    
    const updates: Record<string, Partial<AssetMeta>> = {};
    newList.forEach((entry, idx) => {
      updates[entry.file.id] = { sortOrder: idx };
    });
    
    updateMetaMany(updates);
    if (sortKey !== 'manual') {
      setSortKey('manual');
      setDescending(false);
      showGlobalFeedback?.('Switched to manual order.');
    }
  }, [gridDropPosition, shownEntries, sortKey, showGlobalFeedback]);
  
  const handleGridDragLeave = useCallback((e: React.DragEvent) => {
    // Ignore moves between the card's own children (img, badges) — otherwise
    // the indicator flickers on every child boundary crossed.
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    e.preventDefault();
    setGridDragOverId(null);
    setGridDropPosition(null);
  }, []);

  const duplicateGroups = useMemo(() => {
    if (dialog !== 'duplicates') return [];
    const hashed = shownEntries.filter(e => e.facts?.dhash).map(e => ({ id: e.file.id, dhash: e.facts!.dhash! }));
    const px = (e: AssetEntry) => (e.facts?.width ?? 0) * (e.facts?.height ?? 0);
    return groupDuplicates(hashed).map(g => g.map(id => entryById.get(id)!).sort((a, b) => px(b) - px(a)));
  }, [dialog, shownEntries, entryById]);

  const activeCollection = view.kind === 'collection' ? library.collections.find(c => c.id === view.id) : undefined;
  const headerTitle = view.kind === 'trash' ? 'TRASH' : activeCollection ? `COLLECTION · ${activeCollection.name}` : (selectedFolderPath || (selectedRoot ? selectedRoot.name : 'NO FOLDER SELECTED'));
  const folderNames = useMemo(() => folderFiles.map(f => f.name), [folderFiles]);
  const renameEntries = useMemo(() => shownEntries.filter(e => selectedIds.has(e.file.id)), [shownEntries, selectedIds]);
  const renameOthers = useMemo(() => {
    const renaming = new Set(renameEntries.map(e => e.file.name));
    return folderNames.filter(n => !renaming.has(n));
  }, [folderNames, renameEntries]);

  // ── Render ──────────────────────────────────────────────────────────

  if (rootsLoaded && roots.length === 0) {
    return <WelcomeState onAddRoot={() => void handleAddRoot()} isExiting={isExiting} />;
  }

  return (
    <div className="h-full w-full flex flex-col relative overflow-hidden">
      <div className="flex-grow flex min-h-0 gap-4">
        {/* SIDEBAR: roots + folder tree + collections */}
        <motion.aside
          variants={panelVariants}
          initial="hidden"
          animate={isExiting ? 'exit' : 'visible'}
          className="w-[280px] flex-shrink-0 flex flex-col relative corner-frame"
        >
          <PanelLine position="top" delay={0.4} />
          <PanelLine position="bottom" delay={0.5} />
          <div className="flex flex-col h-full overflow-hidden relative z-10 bg-base-100/40 backdrop-blur-xl">
            <div className="p-4 bg-base-100/10 flex gap-1">
              <button className="form-btn h-7 flex-1 text-2xs" onClick={() => void handleAddVaultRoot()} aria-label="Add the vault gallery as a root" title="Browse the Vault gallery folder here">
                + VAULT
              </button>
              <button className="form-btn h-7 flex-1 text-2xs" onClick={() => void handleAddRoot()} aria-label="Add folder root" title="Add a folder root">
                + ADD
              </button>
            </div>
            <div
              className={`overflow-y-auto p-2 border-b flex flex-col gap-1 transition-colors ${isDraggingRootDrop ? 'border-primary bg-primary/5' : 'border-base-content/10'}`}
              onDragOver={e => {
                if (draggedFileIdsRef.current.length || draggedFolderRef.current) return;
                e.preventDefault(); setIsDraggingRootDrop(true);
              }}
              onDragLeave={() => setIsDraggingRootDrop(false)}
              onDrop={e => void handleRootsDrop(e)}
              title="Drop a folder here to add it as a root"
            >
              {roots.map(root => (
                <RootRow
                  key={root.id}
                  root={root}
                  selected={root.id === selectedRootId && view.kind === 'folder'}
                  onSelect={() => { if (root.status === 'granted') { setSelectedRootId(root.id); setView({ kind: 'folder' }); } }}
                  onReconnect={() => void handleReconnect(root)}
                  onRemove={() => void handleRemoveRoot(root.id)}
                  onContextMenu={(root, e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCtxMenu({ x: e.clientX, y: e.clientY, items: buildRootMenu(root) });
                  }}
                />
              ))}
              {roots.length === 0 && (
                <p className="text-2xs font-mono uppercase text-base-content/60 p-1">Drop a folder here, or ADD above.</p>
              )}
            </div>
            <div className="flex-grow overflow-y-auto p-2 relative">
              {folderMoveProgress && (
                <div className="mb-2 p-2 rounded border border-primary/40 bg-primary/10" role="status" aria-label="Folder move progress">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-2xs font-mono uppercase text-base-content/80 truncate">
                      {folderMoveProgress.total
                        ? `Moving ${folderMoveProgress.moved}/${folderMoveProgress.total} files…`
                        : 'Moving…'}
                    </p>
                    <button
                      type="button"
                      onClick={handleCancelFolderMove}
                      disabled={folderMoveCancelling}
                      className="form-btn h-6 px-2 text-2xs"
                    >
                      {folderMoveCancelling ? 'Cancelling…' : 'Cancel'}
                    </button>
                  </div>
                  <div className="mt-1.5 h-1 bg-base-content/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-[width]"
                      style={{ width: folderMoveProgress.total ? `${Math.min(100, Math.round((folderMoveProgress.moved / folderMoveProgress.total) * 100))}%` : '0%' }}
                    />
                  </div>
                  {folderMoveProgress.currentFile && (
                    <p className="mt-1 text-2xs font-mono text-base-content/50 truncate">{folderMoveProgress.currentFile}</p>
                  )}
                </div>
              )}
              {isScanningTree && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
                  <ThinkingOrb state="searching" size={64} />
                  <p className="text-2xs font-mono uppercase tracking-widest text-base-content/60">Scanning folders…</p>
                </div>
              )}
              {tree && (
                <FolderTreeNode
                  node={tree}
                  selectedPath={view.kind === 'folder' ? selectedFolderPath : null}
                  onSelect={path => { setSelectedFolderPath(path); setView({ kind: 'folder' }); }}
                  depth={0}
                  dragOverPath={dragOverPath}
                  onDragOverNode={setDragOverPath}
                  onDropNode={(node, e) => void handleFolderDrop(node, e)}
                  onFolderDragStart={handleFolderDragStart}
                  onFolderDragEnd={handleFolderDragEnd}
                  canDropFolderOn={canDropFolderOn}
                  onContextMenu={(node, e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCtxMenu({ x: e.clientX, y: e.clientY, items: buildTreeMenu(node) });
                  }}
                />
              )}
              {!selectedRoot && !isScanningTree && (
                <p className="text-2xs font-mono uppercase text-base-content/60 p-2">Select a root to browse.</p>
              )}
            </div>
            {library.collections.length > 0 && (
              <div className="border-t border-base-content/10 p-2 flex flex-col gap-0.5 max-h-48 overflow-y-auto" aria-label="Collections">
                <span className="text-2xs font-mono font-black uppercase text-primary px-1 pb-1">Collections</span>
                {library.collections.map(c => (
                  <div key={c.id}
                    className={`group flex items-center gap-2 px-2 py-1 rounded text-xs font-mono cursor-pointer ${view.kind === 'collection' && view.id === c.id ? 'bg-primary/15 text-primary' : 'hover:bg-base-200/50 text-base-content/70'}`}
                    onClick={() => setView({ kind: 'collection', id: c.id })}>
                    <span className="truncate flex-grow">{c.name}</span>
                    <span className="text-2xs text-base-content/50">{c.ids.length}</span>
                    <button type="button" aria-label={`Delete collection ${c.name}`} title="Delete the collection (files are untouched)"
                      className="opacity-0 group-hover:opacity-100 text-base-content/60 hover:text-error"
                      onClick={e => { e.stopPropagation(); deleteCollection(c.id); if (view.kind === 'collection' && view.id === c.id) setView({ kind: 'folder' }); }}>✕</button>
                  </div>
                ))}
              </div>
            )}
              {selectedRoot && selectedRoot.status === 'granted' && (
                <div className="shrink-0 p-2 border-t border-base-content/10">
                  <TrashTreeNode
                    count={trashEntries.length}
                    selected={view.kind === 'trash'}
                    onSelect={() => setView({ kind: 'trash' })}
                    onContextMenu={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCtxMenu({ x: e.clientX, y: e.clientY, items: buildTrashMenu() });
                    }}
                  />
                </div>
              )}
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
          <div className="flex h-full w-full overflow-hidden relative z-10 bg-base-100/40 backdrop-blur-xl">
            <div className="flex flex-col flex-grow min-w-0">
              <motion.header variants={sectionWipeVariants} custom={1.2} initial="hidden" animate="visible" className="p-4 bg-base-100/10 flex justify-between items-center gap-3 flex-wrap">
                <TerminalText text={headerTitle} delay={0.8} className="text-2xs font-black uppercase text-primary truncate" />
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                  {undoEntry && (
                    <button type="button" disabled={isBusy} className="form-btn form-btn-icon" aria-label={`UNDO: ${undoEntry.op.label}`} title={`Undo: ${undoEntry.op.label} (survives restarts)`} onClick={() => void handleUndo()}>
                      <UndoIcon className="w-4 h-4" />
                    </button>
                  )}
                  <button type="button" className="form-btn form-btn-icon" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => setDialog('shortcuts')}><KeyboardIcon className="w-4 h-4" /></button>
                  <button
                    type="button"
                    disabled={folderFiles.length === 0 || isFullIndexing}
                    className="form-btn form-btn-icon"
                    aria-label="DUPLICATES"
                    title={isFullIndexing ? 'Indexing files…' : 'Find near-identical files'}
                    onClick={() => { void runFullIndex().then(() => setDialog('duplicates')); }}
                  >
                    <CopyIcon className="w-4 h-4" />
                  </button>
                  {selectedIds.size > 0 && (
                    <>
                      <div className="w-px h-4 bg-base-content/10 mx-1" />
                      <div role="toolbar" aria-label="Selection actions" className="flex items-center gap-2 flex-wrap">
                        <div className="hidden lg:flex items-center gap-1.5">
                          <button disabled={isBusy} onClick={() => void handleExport()} className="form-btn form-btn-icon" aria-label="EXPORT" title="Export">
                            <DownloadIcon className="w-4 h-4" />
                          </button>
                          <button disabled={isBusy} onClick={() => void handleSendToConverter()} className="form-btn form-btn-icon" aria-label="CONVERT" title="Convert">
                            <RefreshIcon className="w-4 h-4" />
                          </button>
                          <button disabled={isBusy || selectedIds.size !== 1} onClick={() => void handleEditInImageEditor()} className="form-btn form-btn-icon" aria-label="EDIT" title="Edit in image editor">
                            <EditIcon className="w-4 h-4" />
                          </button>
                          <button disabled={isBusy || !getSelectedFiles().every(f => VIDEO_EDITOR_EXT_SET.has(f.ext))} onClick={() => void handleOpenInVideoEditor()} className="form-btn form-btn-icon" aria-label="VIDEO" title="Open in video editor">
                            <FilmIcon className="w-4 h-4" />
                          </button>
                          <button disabled={isBusy} onClick={() => void handleSendTo('resizer')} className="form-btn form-btn-icon" aria-label="RESIZE" title="Resize">
                            <AspectRatioIcon className="w-4 h-4" />
                          </button>
                          <button disabled={isBusy || selectedIds.size !== 1} onClick={() => void handleSendTo('media_analyzer')} className="form-btn form-btn-icon" aria-label="ANALYZE" title="Analyze">
                            <SparklesIcon className="w-4 h-4" />
                          </button>
                          <button disabled={isBusy} onClick={() => setDialog('vault')} className="form-btn form-btn-icon" aria-label="To Vault" title="Save to Vault">
                            <ArchiveIcon className="w-4 h-4" />
                          </button>
                        </div>
                        <button
                          type="button"
                          className="lg:hidden form-btn form-btn-icon"
                          aria-label="More selection actions"
                          aria-haspopup="menu"
                          title="More selection actions"
                          onClick={e => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setCtxMenu({ x: rect.left, y: rect.bottom + 4, items: selectionDropdownItems() });
                          }}
                        >
                          <MenuIcon className="w-4 h-4" />
                        </button>
                        <button onClick={clearSelection} className="form-btn form-btn-icon text-base-content/60 hover:text-error" aria-label="Deselect all" title="Deselect all">
                          <CloseIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  )}
                  <span className="text-2xs font-mono font-bold text-base-content/60 uppercase">
                    {view.kind === 'trash' ? `${trashEntries.length} ITEM${trashEntries.length === 1 ? '' : 'S'}` : `${folderFiles.length} IMAGE${folderFiles.length === 1 ? '' : 'S'}`}
                  </span>
                  {selectedIds.size > 0 && (
                    <span className="text-2xs font-mono font-black uppercase text-primary">{selectedIds.size} SELECTED</span>
                  )}
                </div>
              </motion.header>
              {libStatus.kind !== 'saved' && (
                <p role="status" className="px-4 py-1.5 text-2xs font-mono uppercase text-warning border-b border-base-content/10">
                  {libStatus.kind === 'no-vault'
                    ? 'Ratings, tags and collections are kept for this session only — connect a vault to save them.'
                    : libStatus.reason}
                </p>
              )}
              {similar && (
                <div role="status" className="px-4 py-1.5 flex items-center gap-3 text-2xs font-mono uppercase text-primary border-b border-base-content/10">
                  <span className="truncate">Similar to {entryById.get(similar.targetId)?.file.name ?? 'image'} — {similar.distances.size - 1} in this view, closest first</span>
                  <button type="button" className="ml-auto form-btn h-6 px-2 text-2xs" onClick={() => setSimilar(null)}>Clear</button>
                </div>
              )}
              {missingInCollection > 0 && view.kind === 'collection' && (
                <p className="px-4 py-1.5 text-2xs font-mono uppercase text-warning border-b border-base-content/10">
                  {missingInCollection} item{missingInCollection === 1 ? '' : 's'} of this collection can't be found (moved outside the manager, or its root isn't connected).
                </p>
              )}
              {view.kind !== 'trash' && <FilterBar criteria={criteria} onChange={c => { setCriteria(c); setVisibleCount(PAGE_SIZE); }} sort={sortKey} descending={descending}
                onSort={(k, d) => { setSortKey(k); setDescending(d); }} exts={folderExts} saved={library.filters}
                shown={shownEntries.length} total={folderFiles.length}
                trailing={<>
                  <div className="flex items-center gap-1.5" role="radiogroup" aria-label="View mode">
                    {([['grid', GridViewIcon], ['list', ListViewIcon]] as const).map(([m, Icon]) => (
                      <button key={m} type="button" role="radio" aria-checked={viewPrefs.mode === m} aria-label={m.toUpperCase()} title={`${m[0].toUpperCase()}${m.slice(1)} view`}
                        className={`form-btn form-btn-icon ${viewPrefs.mode === m ? 'form-btn-primary' : ''}`}
                        onClick={() => updateViewPrefs({ mode: m })}><Icon className="w-4 h-4" /></button>
                    ))}
                  </div>
                  {viewPrefs.mode === 'grid' && (
                    <input type="range" aria-label="Thumbnail size" className="range range-xs range-primary w-24"
                      min={GRID_SIZE_MIN} max={GRID_SIZE_MAX} step={10} value={viewPrefs.size}
                      onChange={e => updateViewPrefs({ size: Number(e.target.value) })} />
                  )}
                </>} />}
              <motion.div variants={contentVariants} custom={2.2} initial="hidden" animate="visible" className="flex-grow overflow-y-auto p-3" aria-live="polite"
                onContextMenu={e => {
                  if ((e.target as HTMLElement).closest('button')) return;
                  if ((e.target as HTMLElement).closest('.group.relative')) return;
                  e.preventDefault();
                  // Keyboard-triggered contextmenu arrives at 0,0 — anchor to the grid box.
                  const kb = e.clientX === 0 && e.clientY === 0;
                  const rect = e.currentTarget.getBoundingClientRect();
                  setCtxMenu({ x: kb ? rect.left + 8 : e.clientX, y: kb ? rect.top + 8 : e.clientY, items: buildGridMenu() });
                }}
              >
                {view.kind === 'trash' ? (
                  <TrashPanel
                    entries={trashEntries}
                    busy={isBusy}
                    onRestore={entries => void handleRestoreFromTrash(entries)}
                    onDeleteForever={entries => void handleTrashDeleteForever(entries)}
                    onEmpty={() => void handleEmptyTrash()}
                    onItemContextMenu={(entry, e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCtxMenu({ x: e.clientX, y: e.clientY, items: buildTrashItemMenu(entry) });
                    }}
                  />
                ) : isListingFolder ? (
                  <div className="h-full min-h-[240px]" />
                ) : shownEntries.length === 0 ? (
                  <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center opacity-30">
                    <p className="text-xs font-black uppercase tracking-[0.4em]">{folderFiles.length ? 'Nothing Matches' : 'No Images Here'}</p>
                    <p className="text-2xs font-mono uppercase tracking-widest mt-2">
                      {folderFiles.length ? 'Loosen or clear the filters' : selectedRoot ? 'Pick another folder in the sidebar' : 'Select a root to begin'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className={viewPrefs.mode === 'list' ? 'flex flex-col gap-1' : 'gap-2'} style={viewPrefs.mode === 'grid' ? { columnWidth: `${viewPrefs.size}px` } : undefined} data-testid="asset-grid">
                      {visibleFiles.map((file, idx) => (
                        <AssetCard
                          key={file.id}
                          file={file}
                          list={viewPrefs.mode === 'list'}
                          facts={facts.get(file.id)}
                          url={objectUrls.get(file.id) || undefined}
                          width={facts.get(file.id)?.width}
                          height={facts.get(file.id)?.height}
                          noPreview={!!facts.get(file.id)?.extracted && !facts.get(file.id)!.thumb && (!BROWSER_SHOWS.has(file.ext) || !!facts.get(file.id)!.failed)}
                          meta={library.assets[file.id]}
                          stack={stackInfo.get(file.id)}
                          onToggleStack={id => setExpandedStacks(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
                          selected={selectedIds.has(file.id)}
                          hasSelection={selectedIds.size > 0}
                          onClick={e => handleCardClick(file, idx, e)}
                          onContextMenu={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            let effectiveIds = selectedIds;
                            if (!selectedIds.has(file.id)) {
                              effectiveIds = new Set([file.id]);
                              setSelectedIds(effectiveIds);
                            }
                            // Shift+F10 / Menu key fires contextmenu at 0,0 — anchor to the card instead.
                            const kb = e.clientX === 0 && e.clientY === 0;
                            const rect = e.currentTarget.getBoundingClientRect();
                            setCtxMenu({
                              x: kb ? rect.left : e.clientX,
                              y: kb ? rect.bottom : e.clientY,
                              items: buildCardMenu(effectiveIds),
                            });
                          }}
                          onToggleSelect={() => setSelectedIds(prev => {
                            const next = new Set(prev);
                            if (next.has(file.id)) next.delete(file.id);
                            else next.add(file.id);
                            return next;
                          })}
                           onDragStart={e => handleCardDragStart(file, e)}
                           onDragOver={e => handleGridDragOver(e, file.id)}
                           onDrop={e => handleGridDrop(e, file.id)}
                           onDragLeave={handleGridDragLeave}
                           dropIndicator={gridDragOverId === file.id ? gridDropPosition : null}
                         />
                      ))}
                    </div>
                    {visibleCount < shownEntries.length && (
                      <div className="flex justify-center py-4">
                        <button className="form-btn h-9 px-6 text-2xs" onClick={() => setVisibleCount(v => v + PAGE_SIZE)}>
                          LOAD MORE ({shownEntries.length - visibleCount} remaining)
                        </button>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            </div>
            {selectedEntries.length > 0 && (
              <AssetInspector
                entries={selectedEntries}
                library={library}
                vocabulary={vocabulary}
                canRename={view.kind === 'folder'}
                busy={isBusy}
                onRename={() => setDialog('rename')}
                onCopyMove={() => setDialog('copymove')}
                onWriteMetadata={() => void handleWriteMetadata()}
                onClose={clearSelection}
              />
            )}
            <AnimatePresence>
              {(isListingFolder || isDecodingThumbs) && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-raised flex flex-col items-center justify-center gap-3 pointer-events-none"
                >
                  <ThinkingOrb state="searching" size={64} />
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
                        <div className="h-full bg-primary rounded-full transition-[width]" style={{ width: `${decodePercent}%` }} />
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.section>
      </div>

      {/* SelectionToolbar relocated to grid header — see motion.header above (plan Phase 5 / review §6). */}

      <AnimatePresence>
        {lightboxIndex !== null && (
          <Lightbox
            files={visibleFiles}
            urls={lightboxUrls}
            index={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            onIndexChange={setLightboxIndex}
          />
        )}
      </AnimatePresence>

      {askDialog}
      <ShortcutsModal isOpen={dialog === 'shortcuts'} onClose={() => setDialog(null)} />
      <BatchRenameModal isOpen={dialog === 'rename'} entries={renameEntries} otherNames={renameOthers} busy={isBusy}
        onClose={() => setDialog(null)} onApply={plan => void handleRename(plan)} />
      <CopyMoveModal isOpen={dialog === 'copymove'} count={selectedIds.size} roots={roots} initialRootId={selectedRootId} busy={isBusy}
        onClose={() => setDialog(null)}
        onApply={(dest, mode, policy) => void runTransfer(getSelectedFiles(), { rootId: dest.root.id, path: dest.node.path, handle: dest.node.handle }, mode, policy, dest.node.name)} />
      <VaultSaveModal isOpen={dialog === 'vault'} count={selectedIds.size} busy={isBusy} onClose={() => setDialog(null)}
        onSave={categoryId => void handleSaveToVault(categoryId)} />
      <DuplicatesModal isOpen={dialog === 'duplicates'} groups={duplicateGroups} thumbUrl={id => objectUrls.get(id) || undefined}
        onClose={() => setDialog(null)} onSelectExtras={ids => { setSelectedIds(new Set(ids)); setDialog(null); }} />
      {ctxMenu && (
        <ContextMenu
          items={ctxMenu.items}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
        />
      )}
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
    <p className="text-2xs font-mono uppercase tracking-widest text-base-content/60 max-w-md">
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
  onContextMenu?: (root: AssetRootState, e: React.MouseEvent) => void;
}> = ({ root, selected, onSelect, onReconnect, onRemove, onContextMenu }) => (
  <div
    className={`group flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs font-mono uppercase transition-colors ${
      selected ? 'bg-primary/15 text-primary' : 'hover:bg-base-200/50 text-base-content/70'
    }`}
    onClick={onSelect}
    onContextMenu={e => onContextMenu?.(root, e)}
  >
    <span
      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${root.status === 'granted' ? 'bg-success' : root.status === 'missing' ? 'bg-error' : 'bg-warning'}`}
      aria-label={root.status}
      title={root.status}
    />
    <span className="truncate flex-grow" title={root.name}>{root.name}</span>
    {root.status !== 'granted' && (
      <button
        className="text-2xs text-warning hover:text-primary flex-shrink-0"
        onClick={e => { e.stopPropagation(); onReconnect(); }}
        aria-label={`Reconnect ${root.name}`}
      >
        RECONNECT
      </button>
    )}
    <button
      className="w-4 h-4 flex-shrink-0 opacity-0 group-hover:opacity-100 text-base-content/60 hover:text-error"
      onClick={e => { e.stopPropagation(); onRemove(); }}
      aria-label={`Remove root ${root.name}`}
    >
      ✕
    </button>
  </div>
);

const FolderTreeNode: React.FC<{
  node: DirectoryNode;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  depth: number;
  dragOverPath: string | null;
  onDragOverNode: (path: string | null) => void;
  onDropNode: (node: DirectoryNode, e: React.DragEvent) => void;
  onContextMenu?: (node: DirectoryNode, e: React.MouseEvent) => void;
  onFolderDragStart?: (node: DirectoryNode, e: React.DragEvent) => void;
  onFolderDragEnd?: () => void;
  canDropFolderOn?: (destPath: string) => boolean;
}> = ({ node, selectedPath, onSelect, depth, dragOverPath, onDragOverNode, onDropNode, onContextMenu, onFolderDragStart, onFolderDragEnd, canDropFolderOn }) => {
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
        onContextMenu={e => onContextMenu?.(node, e)}
        draggable
        onDragStart={e => onFolderDragStart?.(node, e)}
        onDragEnd={() => onFolderDragEnd?.()}
        onDragOver={e => {
          if (canDropFolderOn && !canDropFolderOn(node.path)) {
            e.dataTransfer.dropEffect = 'none';
            onDragOverNode(null);
            return;
          }
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          onDragOverNode(node.path);
        }}
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
              onContextMenu={onContextMenu}
              onFolderDragStart={onFolderDragStart}
              onFolderDragEnd={onFolderDragEnd}
              canDropFolderOn={canDropFolderOn}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/** Like Windows' Recycle Bin: one row, no children — selecting it opens the contents in the main panel. */
const TrashTreeNode: React.FC<{
  count: number;
  selected: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}> = ({ count, selected, onSelect, onContextMenu }) => (
  <div
    className={`flex items-center gap-1.5 px-1.5 py-1.5 rounded cursor-pointer text-xs font-mono truncate transition-colors ${selected ? 'bg-primary/15 text-primary' : 'hover:bg-base-200/50 text-base-content/70'}`}
    onClick={onSelect}
    onContextMenu={onContextMenu}
    title="Trash"
  >
    <DeleteIcon className="w-4 h-4 flex-shrink-0" />
    <span className="truncate">Trash</span>
    {count > 0 && <span className="ml-auto pl-1 text-2xs text-base-content/50">{count}</span>}
  </div>
);

const TrashPanel: React.FC<{
  entries: TrashedEntry[];
  busy: boolean;
  onRestore: (entries: TrashedEntry[]) => void;
  onDeleteForever: (entries: TrashedEntry[]) => void;
  onEmpty: () => void;
  onItemContextMenu: (entry: TrashedEntry, e: React.MouseEvent) => void;
}> = ({ entries, busy, onRestore, onDeleteForever, onEmpty, onItemContextMenu }) => entries.length === 0 ? (
  <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center opacity-30">
    <p className="text-xs font-black uppercase tracking-[0.4em]">Trash Is Empty</p>
  </div>
) : (
  <div className="flex flex-col gap-1" data-testid="trash-list">
    <div className="flex items-center gap-2 pb-2">
      <button type="button" disabled={busy} className="form-btn h-7 px-2 text-2xs" onClick={() => onRestore(entries)}>RESTORE ALL</button>
      <button type="button" disabled={busy} className="form-btn h-7 px-2 text-2xs text-error" onClick={onEmpty}>EMPTY TRASH</button>
    </div>
    {entries.map(entry => (
      <div
        key={`${entry.batchKey}:${entry.originalPath}`}
        className="flex items-center gap-3 px-2 py-1.5 rounded text-xs font-mono hover:bg-base-200/50"
        onContextMenu={e => onItemContextMenu(entry, e)}
      >
        <span className="truncate w-1/3" title={entry.name}>{entry.name}</span>
        <span className="truncate flex-grow text-base-content/50" title={entry.originalPath}>{entry.originalPath}</span>
        <span className="text-2xs text-base-content/50 flex-shrink-0">{new Date(entry.trashedAt).toLocaleString()}</span>
        <button type="button" disabled={busy} className="form-btn h-6 px-2 text-2xs" onClick={() => onRestore([entry])}>Restore</button>
        <button type="button" disabled={busy} className="form-btn h-6 px-2 text-2xs text-error" onClick={() => onDeleteForever([entry])}>Delete forever</button>
      </div>
    ))}
  </div>
);

const AssetCard: React.FC<{
  file: AssetFile;
  /** One compact row (thumb, name, type, size, dimensions, date, rating) instead of a tile. */
  list?: boolean;
  facts?: AssetFacts;
  url: string | undefined;
  /** Natural dimensions — reserve the box before the thumb decodes. */
  width?: number;
  height?: number;
  /** Facts are in and there's no preview the browser can show (TIFF/HEIC/…). */
  noPreview: boolean;
  meta: AssetMeta | undefined;
  stack: { stackId: string; count: number; expanded: boolean } | undefined;
  onToggleStack: (stackId: string) => void;
  selected: boolean;
  hasSelection: boolean;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onToggleSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  /** Reorder indicator: insertion line at the top/bottom edge of this card. */
  dropIndicator?: 'before' | 'after' | null;
}> = ({ file, list, facts, url, width, height, noPreview, meta, stack, onToggleStack, selected, hasSelection, onClick, onContextMenu, onToggleSelect, onDragStart, onDragOver, onDrop, onDragLeave, dropIndicator }) => list ? (
  <button
    onClick={onClick}
    onContextMenu={onContextMenu}
    draggable
    onDragStart={onDragStart}
    onDragOver={onDragOver}
    onDrop={onDrop}
    onDragLeave={onDragLeave}
    className={`group relative w-full flex items-center gap-3 px-2 py-1 rounded border text-left transition-colors bg-base-200/30 ${
      selected ? 'border-primary ring-1 ring-primary/50' : 'border-base-content/10 hover:border-primary/50'
    }`}
    aria-label={`Open ${file.name}`}
    aria-pressed={selected}
  >
    {dropIndicator === 'before' && <span aria-hidden className="absolute top-0 inset-x-0 z-10 h-0.5 bg-primary" />}
    {dropIndicator === 'after' && <span aria-hidden className="absolute bottom-0 inset-x-0 z-10 h-0.5 bg-primary" />}
    <div
      role="checkbox"
      aria-checked={selected}
      aria-label={selected ? `Deselect ${file.name}` : `Select ${file.name}`}
      onClick={e => { e.stopPropagation(); onToggleSelect(); }}
      className={`w-5 h-5 flex-shrink-0 rounded flex items-center justify-center border ${selected ? 'bg-primary border-primary' : 'border-base-content/30'}`}
    >
      {selected && <CheckIcon className="w-3.5 h-3.5 text-primary-content" />}
    </div>
    <div className="w-10 h-10 flex-shrink-0 overflow-hidden rounded bg-base-300/40 flex items-center justify-center">
      {url ? <img src={url} alt={file.name} className="w-full h-full object-cover" loading="lazy" draggable={false} />
        : noPreview ? <span className="text-2xs font-mono font-black uppercase text-base-content/40">.{file.ext}</span>
        : <LoadingSpinner size={14} className="opacity-40" />}
    </div>
    <span className="flex-1 min-w-0 truncate text-xs font-mono" title={file.name}>{file.name}</span>
    <span className="w-12 text-2xs font-mono uppercase text-base-content/50">{file.ext}{RAW_EXT_SET.has(file.ext) ? ' · RAW' : ''}</span>
    <span className="hidden md:block w-24 text-2xs font-mono text-base-content/60">{facts?.width ? `${facts.width} × ${facts.height}` : '—'}</span>
    <span className="hidden md:block w-16 text-2xs font-mono text-base-content/60">{facts?.size === undefined ? '—' : facts.size < 1048576 ? `${Math.max(1, Math.round(facts.size / 1024))} KB` : `${(facts.size / 1048576).toFixed(1)} MB`}</span>
    <span className="hidden lg:block w-24 text-2xs font-mono text-base-content/60">{facts?.mtime ? new Date(facts.mtime).toLocaleDateString() : '—'}</span>
    <span className="w-16 text-2xs text-warning" aria-label={meta?.rating ? `${meta.rating} stars` : undefined}>{meta?.rating ? '★'.repeat(meta.rating) : ''}</span>
    <span className="w-3 h-3 flex-shrink-0 rounded-full" style={meta?.label ? { background: LABEL_COLORS[meta.label] } : undefined} aria-label={meta?.label ? `${meta.label} label` : undefined} />
    {stack && (
      <span role="button" tabIndex={0} aria-label={stack.expanded ? 'Collapse stack' : `Expand stack of ${stack.count}`}
        className="px-1.5 h-5 flex items-center text-2xs font-mono font-black bg-primary text-primary-content rounded"
        onClick={e => { e.stopPropagation(); onToggleStack(stack.stackId); }}
        onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onToggleStack(stack.stackId); } }}>
        {stack.expanded ? '−' : stack.count}
      </span>
    )}
  </button>
) : (
  <button
    onClick={onClick}
    onContextMenu={onContextMenu}
    draggable
    onDragStart={onDragStart}
    onDragOver={onDragOver}
    onDrop={onDrop}
    onDragLeave={onDragLeave}
    className={`group relative block w-full mb-2 break-inside-avoid overflow-hidden rounded border transition-colors bg-base-200/30 ${
      selected ? 'border-primary ring-2 ring-primary/50' : 'border-base-content/10 hover:border-primary/50'
    }`}
    aria-label={`Open ${file.name}`}
    aria-pressed={selected}
  >
    {dropIndicator === 'before' && (
      <span aria-hidden className="absolute top-0 inset-x-0 z-10 h-0.5 bg-primary" />
    )}
    {dropIndicator === 'after' && (
      <span aria-hidden className="absolute bottom-0 inset-x-0 z-10 h-0.5 bg-primary" />
    )}
    {url ? (
      <img src={url} alt={file.name} width={width} height={height} className="w-full h-auto object-cover" loading="lazy" draggable={false} />
    ) : noPreview ? (
      <div className="w-full aspect-square flex items-center justify-center text-sm font-mono font-black uppercase text-base-content/40">.{file.ext}</div>
    ) : (
      <div className="w-full aspect-square flex items-center justify-center">
        <LoadingSpinner size={16} className="opacity-40" />
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
    {(meta?.label || stack || RAW_EXT_SET.has(file.ext)) && (
      <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
        {RAW_EXT_SET.has(file.ext) && <span className="px-1 text-2xs font-mono font-black bg-black/60 text-white">RAW</span>}
        {stack && (
          <span role="button" tabIndex={0} aria-label={stack.expanded ? 'Collapse stack' : `Expand stack of ${stack.count}`}
            title={stack.expanded ? 'Collapse stack' : 'Show the stacked images'}
            className="px-1.5 h-5 flex items-center text-2xs font-mono font-black bg-primary text-primary-content rounded"
            onClick={e => { e.stopPropagation(); onToggleStack(stack.stackId); }}
            onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onToggleStack(stack.stackId); } }}>
            {stack.expanded ? '−' : stack.count}
          </span>
        )}
        {meta?.label && <span className="w-3 h-3 rounded-full border border-black/40" style={{ background: LABEL_COLORS[meta.label] }} aria-label={`${meta.label} label`} />}
      </div>
    )}
    {meta?.rating ? (
      <span className="absolute bottom-1.5 left-1.5 px-1 text-2xs text-warning bg-black/55 rounded" aria-label={`${meta.rating} stars`}>{'★'.repeat(meta.rating)}</span>
    ) : null}
    <div className="absolute inset-0 flex flex-col justify-end p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
      <p className="text-2xs font-mono truncate text-white text-left" title={file.name}>{file.name}</p>
    </div>
  </button>
);

// Mirrors components/FullscreenViewer.tsx (the Vault's fullscreen viewer):
// portaled to document.body so `position: fixed` is truly viewport-relative
// (this page renders inside App.tsx's route-transition `motion.div`, whose
// transform otherwise re-anchors "fixed" to that box, not the screen) —
// edge-docked prev/next zones, wheel zoom, drag-to-pan, double-click zoom,
// download, reset, top-right controls.
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const aspectRatio = (w: number, h: number) => `${w / gcd(w, h)}:${h / gcd(w, h)}`;
const formatBytes = (n: number) => {
  if (n === 0) return '0 B';
  const i = Math.min(3, Math.floor(Math.log(n) / Math.log(1024)));
  return `${parseFloat((n / 1024 ** i).toFixed(2))} ${['B', 'KB', 'MB', 'GB'][i]}`;
};

const LightboxSpec: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <span className="flex items-center gap-2 whitespace-nowrap">
    <span className="text-white/30">{label}:</span>
    <ScramblingText className="text-white tracking-tighter" text={value} />
  </span>
);

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
  const [dir, setDir] = useState<1 | -1>(1);
  const [info, setInfo] = useState<{ id: string; w?: number; h?: number; size?: number; modified?: number }>({ id: '' });

  const file = files[index];
  const url = file ? urls.get(file.id) : undefined;
  const fileId = file?.id;
  const handle = file?.handle;

  // Size + modified date come from the file itself; dimensions from the decoded <img>.
  useEffect(() => {
    if (!fileId || !handle) return;
    let cancelled = false;
    setInfo({ id: fileId });
    void handle.getFile().then(f => {
      if (!cancelled) setInfo(i => (i.id === fileId ? { ...i, size: f.size, modified: f.lastModified } : i));
    }).catch(() => { /* info bar just shows less */ });
    return () => { cancelled = true; };
  }, [fileId, handle]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const goNext = useCallback(() => {
    resetView();
    setDir(1);
    onIndexChange((index + 1) % files.length);
  }, [index, files.length, onIndexChange, resetView]);

  const goPrev = useCallback(() => {
    resetView();
    setDir(-1);
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
      className="fixed inset-0 bg-black/95 z-modal select-none overflow-hidden"
      onClick={onClose}
      onMouseMove={handleMouseMove}
      onMouseUp={() => setIsPanning(false)}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 overflow-hidden" onWheel={handleWheel}>
        {/* Same slide as the Vault viewer: incoming from the travel side, outgoing shrinks away. The exiting
            layer keeps its already-decoded <img>, so a revoked blob URL can't break it mid-slide. */}
        <AnimatePresence initial={false} custom={dir}>
          <motion.div
            key={file.id}
            custom={dir}
            variants={{
              enter: (d: number) => ({ x: `${d * 100}%`, scale: 1.1, opacity: 0 }),
              center: { x: 0, scale: 1, opacity: 1 },
              exit: (d: number) => ({ x: `${d * -40}%`, scale: 0.8, opacity: 0, transition: { duration: 0.5, ease: [0.76, 0, 0.24, 1] } }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.5, ease: [0.76, 0, 0.24, 1] }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            {url ? (
              <img
                src={url}
                alt={file.name}
                className="transition-transform duration-100 ease-out select-none pointer-events-auto"
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
                onLoad={e => {
                  const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                  setInfo(i => (i.id === file.id ? { ...i, w, h } : i));
                }}
                draggable={false}
              />
            ) : (
              <ThinkingOrb state="working" size={32} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Edge-docked prev/next — same pattern as FullscreenViewer, always vertically centered on the true viewport. */}
      {files.length > 1 && (
        <div className="pointer-events-none absolute inset-0 z-base">
          <div className="absolute inset-y-0 left-0 w-32 flex items-center justify-center">
            <button
              onClick={e => { e.stopPropagation(); goPrev(); }}
              className="pointer-events-auto p-4 text-white hover:text-primary transition-[color,opacity,transform] duration-300 opacity-40 hover:opacity-100 scale-100 hover:scale-110"
              aria-label="Previous image"
            >
              <ChevronLeftIcon className="w-12 h-12" />
            </button>
          </div>
          <div className="absolute inset-y-0 right-0 w-32 flex items-center justify-center">
            <button
              onClick={e => { e.stopPropagation(); goNext(); }}
              className="pointer-events-auto p-4 text-white hover:text-primary transition-[color,opacity,transform] duration-300 opacity-40 hover:opacity-100 scale-100 hover:scale-110"
              aria-label="Next image"
            >
              <ChevronRightIcon className="w-12 h-12" />
            </button>
          </div>
        </div>
      )}

      <div className="absolute top-8 right-8 z-raised flex items-center gap-4 pointer-events-auto">
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

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="absolute bottom-0 left-0 right-0 z-raised bg-gradient-to-t from-black/80 to-transparent pointer-events-none flex items-end px-10 pb-5 h-20"
      >
        <div className="w-full flex items-center justify-between gap-8 pointer-events-auto translate-y-2">
          <span className="min-w-0 text-xs font-mono uppercase tracking-widest text-white truncate" title={file.path}>
            <ScramblingText text={file.path} />
          </span>
          <div className="flex items-center gap-8 shrink-0 text-2xs font-mono uppercase tracking-widest">
            {info.w ? <LightboxSpec label="Resolution" value={`${info.w} × ${info.h}`} /> : null}
            {info.w && info.h ? <LightboxSpec label="Aspect Ratio" value={aspectRatio(info.w, info.h)} /> : null}
            {info.size !== undefined ? <LightboxSpec label="File Size" value={formatBytes(info.size)} /> : null}
            {info.modified ? <LightboxSpec label="Modified" value={new Date(info.modified).toLocaleDateString()} /> : null}
            <LightboxSpec label="Format" value={file.ext} />
            <span className="text-white tracking-tighter">{String(index + 1).padStart(2, '0')} / {String(files.length).padStart(2, '0')}</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );

  if (typeof document === 'undefined' || !document.body) return null;
  return createPortal(modalContent, document.body);
};



export default AssetsManagerPage;
