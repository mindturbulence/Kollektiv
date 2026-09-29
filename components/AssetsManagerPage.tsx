import React, { useState, useRef, useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { TerminalText, PanelLine, ScanLine, panelVariants, sectionWipeVariants, contentVariants } from './AnimatedPanels';
import { useObjectUrls } from '../utils/useObjectUrls';
import { listRoots, addRoot, addRootFromHandle, removeRoot, requestRootPermission, ensureWritable } from '../services/assets/assetRootManager';
import { scanDirectoryTree, listFolderFiles } from '../services/assets/directoryScanner';
import { transferFiles, resolveDir, resolveFile, moveOne, type ConflictPolicy, type Transferred } from '../services/assets/fileOps';
import { indexFiles, RAW_EXTS, relocateCachedFacts, type AssetFacts } from '../services/assets/assetFacts';
import {
  getLibrary, getLibraryStatus, subscribeLibrary, loadLibrary, updateMeta, relocate, copyMeta, deleteCollection,
  type ColorLabel, type FilterCriteria, type AssetMeta,
} from '../services/assets/assetLibrary';
import { matches, sortEntries, type AssetEntry, type SortKey } from '../services/assets/assetFilter';
import { groupDuplicates } from '../services/assets/duplicates';
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
import { FolderClosedIcon, FolderOpenIcon, ChevronRightIcon, ChevronDownIcon, CloseIcon, ChevronLeftIcon, CenterIcon, DownloadIcon, CheckIcon, EditIcon, RefreshIcon, FilmIcon } from './icons';
import LoadingSpinner from './LoadingSpinner';
import FilterBar, { LABEL_COLORS } from './assets/FilterBar';
import AssetInspector from './assets/AssetInspector';
import { BatchRenameModal, CopyMoveModal, DuplicatesModal, VaultSaveModal } from './assets/AssetDialogs';

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
// Bridge keys: 1–5 rate, 0 clears; 6–9 red/yellow/green/blue.
const LABEL_KEYS: Record<string, ColorLabel> = { '6': 'red', '7': 'yellow', '8': 'green', '9': 'blue' };

const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const joinPath = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface AssetsManagerPageProps {
  isExiting?: boolean;
  showGlobalFeedback?: (msg: string) => void;
}

type View = { kind: 'folder' } | { kind: 'collection'; id: string };

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
  const [isListingFolder, setIsListingFolder] = useState(false);
  const [listProgress, setListProgress] = useState<ScanProgress | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [objectUrls, setObjectUrls] = useState<Map<string, string>>(new Map());
  const [facts, setFacts] = useState<Map<string, AssetFacts>>(new Map());
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<{ id: string; url: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBusy, setIsBusy] = useState(false);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [isDraggingRootDrop, setIsDraggingRootDrop] = useState(false);
  const [criteria, setCriteria] = useState<FilterCriteria>({});
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [descending, setDescending] = useState(false);
  const [expandedStacks, setExpandedStacks] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<null | 'rename' | 'copymove' | 'duplicates' | 'vault'>(null);
  const [undoEntry, setUndoEntry] = useState<JournalEntry | null>(null);
  const [missingInCollection, setMissingInCollection] = useState(0);

  const library = useSyncExternalStore(subscribeLibrary, getLibrary);
  const libStatus = useSyncExternalStore(subscribeLibrary, getLibraryStatus);

  const { track, revoke } = useObjectUrls();
  // Generation counter guards against stale async resolutions (listing,
  // indexing, URL creation) landing after the user switched folders/roots.
  const generationRef = useRef(0);
  const objectUrlsRef = useRef<Map<string, string>>(new Map());
  objectUrlsRef.current = objectUrls;
  const lastClickedIndexRef = useRef<number | null>(null);
  // Drag payload travels out-of-band (native dataTransfer can't carry object
  // refs) — a ref survives the drag gesture without triggering re-renders.
  const draggedFileIdsRef = useRef<string[]>([]);

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
    lastClickedIndexRef.current = null;

    if (view.kind === 'collection') {
      // A collection spans folders and roots: resolve each member by path.
      const collection = library.collections.find(c => c.id === view.id);
      if (!collection) { setFolderFiles([]); return; }
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
      })();
      return;
    }

    if (!selectedRoot || selectedRoot.status !== 'granted' || !tree) {
      setFolderFiles([]);
      return;
    }

    const targetNode = findNodeByPath(tree, selectedFolderPath);
    if (!targetNode) {
      setFolderFiles([]);
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
    });
    // Collection membership changes re-list only when that collection is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoot, tree, selectedFolderPath, refreshTick, view, view.kind === 'collection' ? library.collections : null]);

  // Index the listed files (plan Tasks 5/6): cached facts resolve at once,
  // new/changed files decode once for dimensions, thumbnail and dHash.
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
    }, () => myGeneration !== generationRef.current).then(flush);
    return () => { if (timer) clearTimeout(timer); };
  }, [folderFiles]);

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
    const list = sortEntries(entries.filter(e => !hidden.has(e.file.id) && matches(e, criteria)), sortKey, descending);
    return { shownEntries: list, stackInfo: info };
  }, [entries, folderFiles, library.stacks, expandedStacks, criteria, sortKey, descending]);

  const visibleFiles = useMemo(() => shownEntries.slice(0, visibleCount).map(e => e.file), [shownEntries, visibleCount]);
  const loadedThumbCount = visibleFiles.filter(f => objectUrls.has(f.id) || (facts.has(f.id) && !facts.get(f.id)!.thumb && !BROWSER_SHOWS.has(f.ext))).length;
  const isDecodingThumbs = !isListingFolder && visibleFiles.length > 0 && loadedThumbCount < visibleFiles.length;
  const decodePercent = visibleFiles.length > 0 ? Math.round((loadedThumbCount / visibleFiles.length) * 100) : 0;
  const folderExts = useMemo(() => [...new Set(folderFiles.map(f => f.ext))].sort(), [folderFiles]);
  const vocabulary = useMemo(() => [...new Set(Object.values(library.assets).flatMap(m => m.tags ?? []))].sort(), [library.assets]);

  // Card images for the visible slice: the cached thumbnail when there is one,
  // else (facts known, no thumbnail) the file itself if the browser can show it.
  useEffect(() => {
    const myGeneration = generationRef.current;
    const add = (id: string, url: string) => setObjectUrls(prev => { const next = new Map(prev); next.set(id, url); return next; });
    visibleFiles.forEach(file => {
      if (objectUrlsRef.current.has(file.id)) return;
      const f = facts.get(file.id);
      if (!f) return;
      if (f.thumb) {
        const url = track(URL.createObjectURL(f.thumb));
        objectUrlsRef.current.set(file.id, url);
        add(file.id, url);
      } else if (BROWSER_SHOWS.has(file.ext)) {
        objectUrlsRef.current.set(file.id, '');
        void file.handle.getFile().then(blob => {
          if (myGeneration !== generationRef.current) return; // stale — folder switched under us
          const url = track(URL.createObjectURL(blob));
          objectUrlsRef.current.set(file.id, url);
          add(file.id, url);
        }).catch(() => { /* unreadable file — card shows its type badge */ });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleFiles, selectedIds]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  const selectedEntries = useMemo(() => entries.filter(e => selectedIds.has(e.file.id)), [entries, selectedIds]);

  // Keyboard (plan Tasks 10, 25): rate/label the selection, select all, clear.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (lightboxIndex !== null || dialog) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && visibleFiles.length) {
        e.preventDefault();
        setSelectedIds(new Set(visibleFiles.map(f => f.id)));
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || selectedIds.size === 0) return;
      const ids = [...selectedIds];
      if (/^[0-5]$/.test(e.key)) updateMeta(ids, { rating: Number(e.key) || undefined });
      else if (LABEL_KEYS[e.key]) updateMeta(ids, m => ({ ...m, label: ids.length === 1 && m.label === LABEL_KEYS[e.key] ? undefined : LABEL_KEYS[e.key] }));
      else if (e.key === 'Escape') clearSelection();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds, visibleFiles, lightboxIndex, dialog, clearSelection]);

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
    if (ids.length === 0 || !selectedRoot) return;
    if (view.kind === 'folder' && targetNode.path === selectedFolderPath) return; // dropped on the folder they're already in
    const filesToMove = folderFiles.filter(f => ids.includes(f.id));
    if (filesToMove.length === 0) return;
    await runTransfer(filesToMove, { rootId: selectedRoot.id, path: targetNode.path, handle: targetNode.handle }, 'move', 'keep-both', targetNode.name);
  }, [selectedRoot, view.kind, selectedFolderPath, folderFiles, runTransfer]);

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

  const duplicateGroups = useMemo(() => {
    if (dialog !== 'duplicates') return [];
    const hashed = shownEntries.filter(e => e.facts?.dhash).map(e => ({ id: e.file.id, dhash: e.facts!.dhash! }));
    const px = (e: AssetEntry) => (e.facts?.width ?? 0) * (e.facts?.height ?? 0);
    return groupDuplicates(hashed).map(g => g.map(id => entryById.get(id)!).sort((a, b) => px(b) - px(a)));
  }, [dialog, shownEntries, entryById]);

  const activeCollection = view.kind === 'collection' ? library.collections.find(c => c.id === view.id) : undefined;
  const headerTitle = activeCollection ? `COLLECTION · ${activeCollection.name}` : (selectedFolderPath || (selectedRoot ? selectedRoot.name : 'NO FOLDER SELECTED'));
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
      <div className="flex-grow flex min-h-0 px-6 py-4 gap-4">
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
            <div className="p-4 bg-base-100/10 flex justify-between items-center">
              <TerminalText text="ASSET ROOTS" delay={0.6} className="text-xs font-black uppercase text-primary" />
              <div className="flex gap-1">
                <button className="form-btn h-7 px-2 text-2xs" onClick={() => void handleAddVaultRoot()} aria-label="Add the vault gallery as a root" title="Browse the Vault gallery folder here">
                  + VAULT
                </button>
                <button className="form-btn h-7 px-2 text-2xs" onClick={() => void handleAddRoot()} aria-label="Add folder root">
                  + ADD
                </button>
              </div>
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
                  selected={root.id === selectedRootId && view.kind === 'folder'}
                  onSelect={() => { if (root.status === 'granted') { setSelectedRootId(root.id); setView({ kind: 'folder' }); } }}
                  onReconnect={() => void handleReconnect(root)}
                  onRemove={() => void handleRemoveRoot(root.id)}
                />
              ))}
              {roots.length === 0 && (
                <p className="text-2xs font-mono uppercase text-base-content/60 p-1">Drop a folder here, or ADD above.</p>
              )}
            </div>
            <div className="flex-grow overflow-y-auto p-2 relative">
              {isScanningTree && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
                  <LoadingSpinner size={40} />
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
              <motion.header variants={sectionWipeVariants} custom={1.2} initial="hidden" animate="visible" className="p-4 bg-base-100/10 flex justify-between items-center gap-3">
                <TerminalText text={headerTitle} delay={0.8} className="text-2xs font-black uppercase text-primary truncate" />
                <div className="flex items-center gap-2 flex-shrink-0">
                  {undoEntry && (
                    <button type="button" disabled={isBusy} className="form-btn h-7 px-2 text-2xs" title="Undo the last file operation (survives restarts)" onClick={() => void handleUndo()}>
                      UNDO: {undoEntry.op.label}
                    </button>
                  )}
                  <button type="button" disabled={!shownEntries.some(e => e.facts?.dhash)} className="form-btn h-7 px-2 text-2xs" onClick={() => setDialog('duplicates')}>
                    DUPLICATES
                  </button>
                  <span className="text-2xs font-mono font-bold text-base-content/60 uppercase">
                    {folderFiles.length} IMAGE{folderFiles.length === 1 ? '' : 'S'}
                  </span>
                </div>
              </motion.header>
              {libStatus.kind !== 'saved' && (
                <p role="status" className="px-4 py-1.5 text-2xs font-mono uppercase text-warning border-b border-base-content/10">
                  {libStatus.kind === 'no-vault'
                    ? 'Ratings, tags and collections are kept for this session only — connect a vault to save them.'
                    : libStatus.reason}
                </p>
              )}
              {missingInCollection > 0 && view.kind === 'collection' && (
                <p className="px-4 py-1.5 text-2xs font-mono uppercase text-warning border-b border-base-content/10">
                  {missingInCollection} item{missingInCollection === 1 ? '' : 's'} of this collection can't be found (moved outside the manager, or its root isn't connected).
                </p>
              )}
              <FilterBar criteria={criteria} onChange={c => { setCriteria(c); setVisibleCount(PAGE_SIZE); }} sort={sortKey} descending={descending}
                onSort={(k, d) => { setSortKey(k); setDescending(d); }} exts={folderExts} saved={library.filters}
                shown={shownEntries.length} total={folderFiles.length} />
              <motion.div variants={contentVariants} custom={2.2} initial="hidden" animate="visible" className="flex-grow overflow-y-auto p-3" aria-live="polite">
                {isListingFolder ? (
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
                    <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-2" data-testid="asset-grid">
                      {visibleFiles.map((file, idx) => (
                        <AssetCard
                          key={file.id}
                          file={file}
                          url={objectUrls.get(file.id) || undefined}
                          noPreview={facts.has(file.id) && !facts.get(file.id)!.thumb && !BROWSER_SHOWS.has(file.ext)}
                          meta={library.assets[file.id]}
                          stack={stackInfo.get(file.id)}
                          onToggleStack={id => setExpandedStacks(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
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
                  <LoadingSpinner size={56} />
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

      <AnimatePresence>
        {selectedIds.size > 0 && (
          <SelectionToolbar
            count={selectedIds.size}
            busy={isBusy}
            onExport={() => void handleExport()}
            onConvert={() => void handleSendToConverter()}
            onEdit={selectedIds.size === 1 ? () => void handleEditInImageEditor() : undefined}
            onOpenInVideoEditor={getSelectedFiles().every(f => VIDEO_EDITOR_EXT_SET.has(f.ext)) ? () => void handleOpenInVideoEditor() : undefined}
            onResize={() => void handleSendTo('resizer')}
            onAnalyze={selectedIds.size === 1 ? () => void handleSendTo('media_analyzer') : undefined}
            onSaveToVault={() => setDialog('vault')}
            onDeselect={clearSelection}
          />
        )}
      </AnimatePresence>

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

      <BatchRenameModal isOpen={dialog === 'rename'} entries={renameEntries} otherNames={renameOthers} busy={isBusy}
        onClose={() => setDialog(null)} onApply={plan => void handleRename(plan)} />
      <CopyMoveModal isOpen={dialog === 'copymove'} count={selectedIds.size} roots={roots} initialRootId={selectedRootId} busy={isBusy}
        onClose={() => setDialog(null)}
        onApply={(dest, mode, policy) => void runTransfer(getSelectedFiles(), { rootId: dest.root.id, path: dest.node.path, handle: dest.node.handle }, mode, policy, dest.node.name)} />
      <VaultSaveModal isOpen={dialog === 'vault'} count={selectedIds.size} busy={isBusy} onClose={() => setDialog(null)}
        onSave={categoryId => void handleSaveToVault(categoryId)} />
      <DuplicatesModal isOpen={dialog === 'duplicates'} groups={duplicateGroups} thumbUrl={id => objectUrls.get(id) || undefined}
        onClose={() => setDialog(null)} onSelectExtras={ids => { setSelectedIds(new Set(ids)); setDialog(null); }} />
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
  /** Facts are in and there's no preview the browser can show (TIFF/HEIC/…). */
  noPreview: boolean;
  meta: AssetMeta | undefined;
  stack: { stackId: string; count: number; expanded: boolean } | undefined;
  onToggleStack: (stackId: string) => void;
  selected: boolean;
  hasSelection: boolean;
  onClick: (e: React.MouseEvent) => void;
  onToggleSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
}> = ({ file, url, noPreview, meta, stack, onToggleStack, selected, hasSelection, onClick, onToggleSelect, onDragStart }) => (
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
      className="fixed inset-0 bg-black/95 z-modal select-none overflow-hidden"
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
          <LoadingSpinner size={32} />
        )}
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

      {files.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-raised text-2xs font-mono uppercase bg-black/40 py-1 px-3 rounded-full text-white/70">
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
  onOpenInVideoEditor: (() => void) | undefined;
  onResize: () => void;
  onAnalyze: (() => void) | undefined;
  onSaveToVault: () => void;
  onDeselect: () => void;
}> = ({ count, busy, onExport, onConvert, onEdit, onOpenInVideoEditor, onResize, onAnalyze, onSaveToVault, onDeselect }) => {
  const content = (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-overlay flex flex-wrap items-center justify-center gap-x-1 gap-y-1 max-w-[calc(100vw-3rem)] bg-base-300/95 backdrop-blur-xl border border-base-content/10 rounded-3xl px-4 py-2 shadow-xl"
      role="toolbar"
      aria-label="Selection actions"
    >
      <span className="text-2xs font-mono font-black uppercase text-primary pl-2">{count} SELECTED</span>
      <div className="w-px h-5 bg-base-content/10" />
      <button disabled={busy} onClick={onExport} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-2xs font-mono uppercase text-base-content/70 hover:text-primary hover:bg-base-100/40 transition-colors disabled:opacity-40">
        <DownloadIcon className="w-4 h-4" /> Export
      </button>
      <button disabled={busy} onClick={onConvert} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-2xs font-mono uppercase text-base-content/70 hover:text-primary hover:bg-base-100/40 transition-colors disabled:opacity-40">
        <RefreshIcon className="w-4 h-4" /> Convert
      </button>
      <button
        disabled={busy || !onEdit}
        onClick={onEdit}
        title={onEdit ? undefined : 'Select exactly one image to edit'}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-2xs font-mono uppercase text-base-content/70 hover:text-primary hover:bg-base-100/40 transition-colors disabled:opacity-40"
      >
        <EditIcon className="w-4 h-4" /> Edit
      </button>
      <button
        disabled={busy || !onOpenInVideoEditor}
        onClick={onOpenInVideoEditor}
        title={onOpenInVideoEditor ? undefined : 'Select video, image or audio files to open in the video editor'}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-2xs font-mono uppercase text-base-content/70 hover:text-primary hover:bg-base-100/40 transition-colors disabled:opacity-40"
      >
        <FilmIcon className="w-4 h-4" /> Video Editor
      </button>
      <button disabled={busy} onClick={onResize} className="px-3 py-1.5 rounded-full text-2xs font-mono uppercase text-base-content/70 hover:text-primary hover:bg-base-100/40 transition-colors disabled:opacity-40">
        Resize
      </button>
      <button disabled={busy || !onAnalyze} onClick={onAnalyze} title={onAnalyze ? undefined : 'Select exactly one image to analyze'}
        className="px-3 py-1.5 rounded-full text-2xs font-mono uppercase text-base-content/70 hover:text-primary hover:bg-base-100/40 transition-colors disabled:opacity-40">
        Analyze
      </button>
      <button disabled={busy} onClick={onSaveToVault} title="Save into the Vault gallery with tags and caption"
        className="px-3 py-1.5 rounded-full text-2xs font-mono uppercase text-base-content/70 hover:text-primary hover:bg-base-100/40 transition-colors disabled:opacity-40">
        To Vault
      </button>
      <div className="w-px h-5 bg-base-content/10" />
      <button onClick={onDeselect} className="p-1.5 text-base-content/60 hover:text-error transition-colors" aria-label="Deselect all">
        <CloseIcon className="w-4 h-4" />
      </button>
    </motion.div>
  );

  if (typeof document === 'undefined' || !document.body) return null;
  return createPortal(content, document.body);
};

export default AssetsManagerPage;
