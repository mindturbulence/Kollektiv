/**
 * designExport — turns a recipe + brief into the `design/` bundle an agent reads, and writes it to a folder
 * the user picked. The bundle builder is pure; the directory writer only ever touches `design/`.
 */

import type { DesignRecipe, RecipeBrief, RecipeMode } from '../types';
import { compileRecipePrompt, renderBriefMd } from './designRecipePrompt';

declare global {
  interface Window {
    /** Chromium only; absent in Firefox/Safari. */
    showDirectoryPicker?: (options?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  }
}

export interface ExportFile {
  path: string;
  content: string | Blob;
}

export interface ExportBundle {
  files: ExportFile[];
  prompt: string;
}

const EXT_BY_TYPE: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

const DESIGN_DIR = 'design';
const REFS_DIR = 'refs';
const KNOWN_FILES = ['DESIGN.md', 'BRIEF.md', 'PROMPT.md'];

export class DesignDirExistsError extends Error {
  constructor() {
    super('design/ already exists in the chosen folder');
    this.name = 'DesignDirExistsError';
  }
}

/** `refs` must be in recipe order; they are renumbered 1..N, keeping each blob's image type. */
export function buildExportBundle(input: {
  recipe: DesignRecipe;
  designMd: string;
  refs: { name: string; blob: Blob }[];
  brief: RecipeBrief;
  mode: RecipeMode;
  zip: boolean;
}): ExportBundle {
  const { recipe, designMd, refs, brief, mode, zip } = input;
  const prompt = compileRecipePrompt(brief, mode, { zip });
  const refFiles = refs.map(({ name, blob }, i): ExportFile => {
    const ext = EXT_BY_TYPE[blob.type];
    if (!ext) throw new Error(`Unsupported reference image type "${blob.type}" for ${recipe.refs[i] ?? name} (use PNG, JPEG or WebP)`);
    return { path: `${DESIGN_DIR}/${REFS_DIR}/${i + 1}.${ext}`, content: blob };
  });
  return {
    files: [
      { path: `${DESIGN_DIR}/DESIGN.md`, content: designMd },
      { path: `${DESIGN_DIR}/BRIEF.md`, content: renderBriefMd(brief) },
      { path: `${DESIGN_DIR}/PROMPT.md`, content: prompt },
      ...refFiles,
    ],
    prompt,
  };
}

/** Name check, not instanceof: DOMException is not an Error subclass in every realm (jsdom). */
const isNotFound = (e: unknown): boolean => typeof e === 'object' && e !== null && 'name' in e && e.name === 'NotFoundError';

/** lib.dom only types the directory iterators under DOM.AsyncIterable, which this repo does not enable. */
type IterableDir = FileSystemDirectoryHandle & { keys(): AsyncIterable<string> };
const isIterableDir = (d: FileSystemDirectoryHandle): d is IterableDir => 'keys' in d && typeof d.keys === 'function';

export async function designDirExists(root: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    await root.getDirectoryHandle(DESIGN_DIR);
    return true;
  } catch (e) {
    if (isNotFound(e)) return false;
    throw e;
  }
}

/** Removes only what a previous export could have written: everything inside design/refs/ and the known files. */
async function clearPreviousExport(design: FileSystemDirectoryHandle, refsDir: FileSystemDirectoryHandle): Promise<void> {
  if (!isIterableDir(refsDir)) throw new Error('This browser cannot list folder contents, so design/refs/ cannot be replaced.');
  const stale: string[] = [];
  for await (const name of refsDir.keys()) stale.push(name);
  for (const name of stale) await refsDir.removeEntry(name, { recursive: true });
  for (const name of KNOWN_FILES) {
    try {
      await design.removeEntry(name);
    } catch (e) {
      if (!isNotFound(e)) throw e;
    }
  }
}

/** Writes `files` (paths starting `design/`) under `root`. Throws DesignDirExistsError if design/ exists and !overwrite. */
export async function writeBundleToDirectory(
  root: FileSystemDirectoryHandle,
  files: ExportFile[],
  { overwrite }: { overwrite: boolean },
): Promise<void> {
  for (const { path } of files) {
    const segments = path.split('/');
    if (segments[0] !== DESIGN_DIR || segments.some((s) => !s || s === '.' || s === '..')) {
      throw new Error(`Refusing to write outside ${DESIGN_DIR}/: ${path}`);
    }
  }
  const existed = await designDirExists(root);
  if (existed && !overwrite) throw new DesignDirExistsError();

  const design = await root.getDirectoryHandle(DESIGN_DIR, { create: true });
  const refsDir = await design.getDirectoryHandle(REFS_DIR, { create: true });
  if (existed) await clearPreviousExport(design, refsDir);

  for (const { path, content } of files) {
    const segments = path.split('/');
    const fileName = segments[segments.length - 1];
    let dir = design;
    for (const seg of segments.slice(1, -1)) dir = await dir.getDirectoryHandle(seg, { create: true });
    const handle = await dir.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(content);
    } finally {
      await writable.close();
    }
  }
}

const DRAFT_KEY = 'kollektiv.designBriefDraft';

export interface BriefDraft {
  brief: RecipeBrief;
  mode: RecipeMode;
}

export const EMPTY_DRAFT: BriefDraft = { brief: { project: '', pages: '' }, mode: 'adapt' };

const BRIEF_KEYS = ['project', 'pages', 'job', 'audience', 'content', 'stack', 'constraints'] as const;

/** Storage may be blocked or hold junk: any failure yields the empty draft. */
export function loadBriefDraft(): BriefDraft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return EMPTY_DRAFT;
    const src = parsed as Record<string, unknown>;
    const brief: RecipeBrief = { project: '', pages: '' };
    for (const key of BRIEF_KEYS) {
      const v = src[key];
      if (typeof v === 'string') brief[key] = v;
    }
    return { brief, mode: src.mode === 'reproduce' ? 'reproduce' : 'adapt' };
  } catch {
    return EMPTY_DRAFT;
  }
}

export function saveBriefDraft({ brief, mode }: BriefDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...brief, mode }));
  } catch {
    // Draft is a convenience only.
  }
}
