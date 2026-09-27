// ─── Kollektiv Video Editor — Autosave ─────────────────────────────────────
// IDB persistence, same shape as image-editor/core/autosave/AutosaveService.ts:
// debounced save on store mutation while dirty, restore on demand. Unlike the
// image editor, MediaItem.file is already a Blob (not an ImageBitmap), so it
// structured-clones into IDB directly — no PNG re-encode round trip needed.
// Media (blobs + waveforms) is kept in its own store, keyed by mediaId, so a
// project record stays small and multiple projects can share the store cheaply.

import { openDB, type IDBPDatabase } from 'idb';
import type { EditorState, MediaItem, Project } from '../types';
import { getSnapshot as storeGetSnapshot, subscribe as storeSubscribe, dispatch as storeDispatch } from '../store';

const DB_NAME = 'kollektiv-video-editor';
const DB_VERSION = 1;
const PROJECTS_STORE = 'projects';
const MEDIA_STORE = 'media';
const AUTOSAVE_DEBOUNCE_MS = 1500;

/** MediaItem minus the fields that live in the media store. */
type StoredMediaItem = Omit<MediaItem, 'file' | 'waveform'>;
type StoredProject = Omit<Project, 'media'> & { media: StoredMediaItem[] };
interface MediaRecord {
  blob: Blob;
  waveform?: Float32Array;
}

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Guard store creation: re-creating an existing store throws
      // ConstraintError and aborts the whole upgrade, which then fails every
      // later open (fixed in image-editor's v1->v2 bump — same guard here).
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) db.createObjectStore(PROJECTS_STORE);
      if (!db.objectStoreNames.contains(MEDIA_STORE)) db.createObjectStore(MEDIA_STORE);
    },
  });
}

/** Splits a Project into its storable metadata and the per-media blob records. */
export function splitProjectForStorage(project: Project): { stored: StoredProject; media: Map<string, MediaRecord> } {
  const media = new Map<string, MediaRecord>();
  const storedMedia: StoredMediaItem[] = project.media.map(({ file, waveform, ...rest }) => {
    media.set(rest.id, { blob: file, waveform });
    return rest;
  });
  return { stored: { ...project, media: storedMedia }, media };
}

/** Rejoins a stored project with its media blobs. Missing media (deleted /
 *  quota-evicted) becomes an empty Blob rather than throwing — a broken
 *  clip beats losing the whole project. */
export function joinStoredProject(stored: StoredProject, mediaRecords: Map<string, MediaRecord>): Project {
  const media: MediaItem[] = stored.media.map((m) => {
    const rec = mediaRecords.get(m.id);
    return { ...m, file: rec?.blob ?? new Blob(), waveform: rec?.waveform };
  });
  return { ...stored, media };
}

/** Saves project metadata and every media item's blob/waveform. */
export async function saveProject(project: Project): Promise<void> {
  const { stored, media } = splitProjectForStorage(project);
  const db = await getDB();
  const tx = db.transaction([PROJECTS_STORE, MEDIA_STORE], 'readwrite');
  await Promise.all([
    tx.objectStore(PROJECTS_STORE).put(stored, project.id),
    ...Array.from(media.entries()).map(([id, rec]) => tx.objectStore(MEDIA_STORE).put(rec, id)),
  ]);
  await tx.done;
}

/** Loads a project by id, rejoining its media blobs. Returns null if absent. */
export async function loadProject(id: string): Promise<Project | null> {
  const db = await getDB();
  const stored = (await db.get(PROJECTS_STORE, id)) as StoredProject | undefined;
  if (!stored) return null;
  const mediaRecords = new Map<string, MediaRecord>();
  await Promise.all(
    stored.media.map(async (m) => {
      const rec = (await db.get(MEDIA_STORE, m.id)) as MediaRecord | undefined;
      if (rec) mediaRecords.set(m.id, rec);
    }),
  );
  return joinStoredProject(stored, mediaRecords);
}

/** Lists saved projects without touching the (potentially large) media store. */
export async function listProjects(): Promise<ProjectSummary[]> {
  const db = await getDB();
  const all = (await db.getAll(PROJECTS_STORE)) as StoredProject[];
  return all
    .map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Deletes a project record. Its media blobs are left in place: media ids are
 *  not guaranteed unique to one project, and unreferenced-blob GC is out of
 *  scope for v1 (ponytail: add a sweep keyed off listProjects() if IDB quota
 *  pressure shows up in practice). */
export async function deleteProject(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(PROJECTS_STORE, id);
}

interface AutosaveDeps {
  getSnapshot?: () => EditorState;
  subscribe?: (fn: () => void) => () => void;
  save?: (project: Project) => Promise<void>;
  markSaved?: () => void;
  onError?: (err: unknown) => void;
  debounceMs?: number;
}

/**
 * Subscribes to store mutations and debounce-saves the current project
 * `debounceMs` after the last change, whenever the store is dirty. On a save
 * failure the store is left dirty (markSaved is only called after a
 * successful save) so no edit is silently lost to a full-quota or
 * IDB-unavailable browser. Returns an unsubscribe function.
 */
export function startAutosave(deps: AutosaveDeps = {}): () => void {
  const getSnapshot = deps.getSnapshot ?? storeGetSnapshot;
  const subscribe = deps.subscribe ?? storeSubscribe;
  const save = deps.save ?? saveProject;
  const markSaved = deps.markSaved ?? (() => storeDispatch({ type: 'markSaved' }));
  const onError = deps.onError ?? console.error;
  const debounceMs = deps.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;

  let handle: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    clearTimeout(handle);
    handle = setTimeout(() => {
      const { project, isDirty } = getSnapshot();
      if (!project || !isDirty) return;
      save(project).then(markSaved).catch(onError);
    }, debounceMs);
  };

  const unsub = subscribe(schedule);
  return () => {
    unsub();
    clearTimeout(handle);
  };
}
