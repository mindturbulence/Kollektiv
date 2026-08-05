/**
 * Obsidian Second Brain integration — File System Access API layer.
 *
 * Manages a separate directory handle for the user's Obsidian vault and provides
 * file I/O, frontmatter parsing, search, and tag collection utilities.
 * This is independent of the Kollektiv vault managed by fileSystemManager.
 */

import { getHandle, setHandle } from './db';
import { appEventBus } from './eventBus';
import { getSearchIndex, VaultNote } from './vaultSearch';

// ── Types ──────────────────────────────────────────────────────────────

export interface ObsidianNote {
  path: string;
  title: string;
  content: string;
  tags: string[];
  frontmatter: Record<string, any>;
  updatedAt: number | null;
}

interface DirectoryHandle {
  queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  values(): AsyncIterableIterator<{ name: string; kind: 'file' | 'directory' }>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
}

interface FileHandle {
  getFile(): Promise<{ text(): Promise<string> }>;
  createWritable(): Promise<WritableStream>;
}

interface WritableStream {
  write(content: string): Promise<void>;
  close(): Promise<void>;
}

// ── Module-level state ─────────────────────────────────────────────────

let _vaultHandle: DirectoryHandle | null = null;
let _isInitialized = false;

const HANDLE_KEY = 'obsidian-vault-dir';

// ── State management ───────────────────────────────────────────────────

export async function initObsidianVault(): Promise<boolean> {
  if (_vaultHandle) return true;
  try {
    const handle = await getHandle<DirectoryHandle>(HANDLE_KEY);
    if (handle && await verifyObsidianPermission(handle)) {
      _vaultHandle = handle;
      _isInitialized = true;
      // Attempt to load cached search index; will rebuild in background if needed
      initSearchIndex().catch(() => {});
      return true;
    }
  } catch {
    // no handle stored — not connected yet
  }
  return false;
}

export async function pickObsidianVault(): Promise<boolean> {
  try {
    const handle = await (window as any).showDirectoryPicker({
      id: 'kollektiv-obsidian-vault',
      mode: 'readwrite',
    }) as DirectoryHandle;
    const isValid = await verifyObsidianPermission(handle);
    if (!isValid) return false;
    _vaultHandle = handle;
    await setHandle(HANDLE_KEY, handle);
    _isInitialized = true;
    return true;
  } catch {
    return false; // user cancelled picker
  }
}

export function isObsidianConnected(): boolean {
  return _isInitialized && _vaultHandle !== null;
}

export async function disconnectObsidianVault(): Promise<void> {
  _vaultHandle = null;
  _isInitialized = false;
  if (_rebuildTimer !== null) {
    clearTimeout(_rebuildTimer);
    _rebuildTimer = null;
  }
  try {
    const db = await (await import('./db')).getDb();
    await db.delete('keyval', HANDLE_KEY);
  } catch {
    // best-effort
  }
}

// ── Permission ─────────────────────────────────────────────────────────

async function verifyObsidianPermission(
  handle: DirectoryHandle
): Promise<boolean> {
  try {
    const dirs: string[] = [];
    for await (const entry of handle.values()) {
      if (entry.kind === 'directory') dirs.push(entry.name);
      if (dirs.length > 10) break;
    }
    if (!dirs.includes('.obsidian')) {
      console.warn('[obsidian] Folder does not contain .obsidian/ — still allowing access');
    }
  } catch {
    // can't list — allow regardless
  }

  try {
    if (handle.queryPermission) {
      const result = await handle.queryPermission({ mode: 'readwrite' });
      if (result === 'granted') return true;
    }
    if (handle.requestPermission) {
      const result = await handle.requestPermission({ mode: 'readwrite' });
      return result === 'granted';
    }
    return true;
  } catch {
    return true;
  }
}

// ── Internal file I/O (direct FS Access API) ──────────────────────────

async function readFile(relativePath: string): Promise<string | null> {
  if (!_vaultHandle) return null;
  try {
    const parts = relativePath.split('/');
    let handle: DirectoryHandle = _vaultHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      handle = await handle.getDirectoryHandle(parts[i]);
    }
    const fileHandle = await handle.getFileHandle(parts[parts.length - 1]);
    const file = await fileHandle.getFile();
    return await file.text();
  } catch {
    return null;
  }
}

async function writeFile(relativePath: string, content: string): Promise<void> {
  if (!_vaultHandle) throw new Error('Obsidian vault not connected');
  const parts = relativePath.split('/');
  let handle: DirectoryHandle = _vaultHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    handle = await handle.getDirectoryHandle(parts[i], { create: true });
  }
  const fileHandle = await handle.getFileHandle(parts[parts.length - 1], { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function deleteFile(relativePath: string): Promise<void> {
  if (!_vaultHandle) throw new Error('Obsidian vault not connected');
  const parts = relativePath.split('/');
  let handle: DirectoryHandle = _vaultHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    handle = await handle.getDirectoryHandle(parts[i]);
  }
  await handle.removeEntry(parts[parts.length - 1]);
}

// ── Walk ───────────────────────────────────────────────────────────────

async function* walkMdFiles(
  dir?: DirectoryHandle,
  prefix = ''
): AsyncGenerator<string> {
  const handle = dir || _vaultHandle;
  if (!handle) return;
  for await (const entry of handle.values()) {
    if (entry.kind === 'file' && entry.name.endsWith('.md')) {
      yield prefix + entry.name;
    } else if (entry.kind === 'directory' && !entry.name.startsWith('.')) {
      const subHandle = await handle.getDirectoryHandle(entry.name);
      yield* walkMdFiles(subHandle, prefix + entry.name + '/');
    }
  }
}

// ── Frontmatter parsing ────────────────────────────────────────────────

export function parseFrontmatter(
  content: string
): { frontmatter: Record<string, any>; body: string } {
  const match = content.match(/^---\n?([\s\S]*?)\n?---\n*/);
  if (!match) return { frontmatter: {}, body: content };

  const frontmatter: Record<string, any> = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const kv = line.match(/^(\w+):\s*(.*)/);
    if (kv) {
      const value = kv[2].trim();
      if (value.startsWith('[') && value.endsWith(']')) {
        frontmatter[kv[1]] = value
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/['"]/g, ''));
      } else {
        frontmatter[kv[1]] = value.replace(/^['"]|['"]$/g, '');
      }
    }
  }
  return { frontmatter, body: content.slice(match[0].length) };
}

export function serializeWithFrontmatter(
  body: string,
  frontmatter: Record<string, any>
): string {
  const keys = Object.keys(frontmatter);
  if (keys.length === 0) return body;
  const lines: string[] = ['---'];
  for (const key of keys) {
    const val = frontmatter[key];
    if (Array.isArray(val)) {
      lines.push(`${key}: [${val.map((v) => `"${v}"`).join(', ')}]`);
    } else {
      lines.push(`${key}: ${val}`);
    }
  }
  lines.push('---');
  lines.push('');
  return lines.join('\n') + body;
}

// ── Title extraction ──────────────────────────────────────────────────

export function extractTitle(path: string, content: string): string {
  const headingMatch = content.match(/^#\s+(.+)/m);
  if (headingMatch) return headingMatch[1].trim();
  return path.replace(/\.md$/, '').split('/').pop() || path;
}

// ── Wikilinks ──────────────────────────────────────────────────────────

export function extractWikilinks(content: string): string[] {
  const links: string[] = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const target = match[1].split('|')[0].trim();
    if (target) links.push(target);
  }
  return links;
}

// ── Debounced search-index auto-rebuild ──────────────────────────────

/**
 * Schedule a background search-index rebuild after vault mutations.
 * Debounced: if multiple mutations happen in quick succession, the index
 * is only rebuilt once, 3 seconds after the last mutation.
 */
let _rebuildTimer: ReturnType<typeof setTimeout> | null = null;

function _scheduleSearchRebuild(): void {
  if (_rebuildTimer !== null) clearTimeout(_rebuildTimer);
  _rebuildTimer = setTimeout(() => {
    _rebuildTimer = null;
    if (!_isInitialized) return;
    rebuildSearchIndex().catch((e) =>
      console.error('[obsidian] Auto-rebuild failed:', e),
    );
  }, 3000);
}

// ── Note operations ────────────────────────────────────────────────────

export async function getNote(path: string): Promise<ObsidianNote | null> {
  const content = await readFile(path);
  if (content === null) return null;
  const { frontmatter, body } = parseFrontmatter(content);
  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [];
  const title = extractTitle(path, body);
  return {
    path,
    title,
    content: body,
    tags,
    frontmatter,
    updatedAt: null,
  };
}

export async function writeNote(path: string, content: string): Promise<void> {
  await writeFile(path, content);
  _scheduleSearchRebuild();
}

export async function appendToNote(
  path: string,
  content: string,
  heading?: string
): Promise<void> {
  const existing = await readFile(path);
  if (existing === null) {
    await writeFile(path, content);
    _scheduleSearchRebuild();
    return;
  }

  if (heading) {
    const headingRegex = new RegExp(`^(#{1,6}\\s+${escapeRegex(heading)}\\s*)\\n`, 'm');
    const match = existing.match(headingRegex);
    if (match) {
      const insertPos = match.index! + match[0].length;
      const updated =
        existing.slice(0, insertPos) + '\n' + content + '\n' + existing.slice(insertPos);
      await writeFile(path, updated);
      _scheduleSearchRebuild();
      return;
    }
    await writeFile(path, existing + '\n\n' + content);
    _scheduleSearchRebuild();
    return;
  }

  await writeFile(path, existing + '\n\n' + content);
  _scheduleSearchRebuild();
}

export async function deleteNoteByPath(path: string): Promise<void> {
  await deleteFile(path);
  _scheduleSearchRebuild();
}

export async function replaceInNote(
  path: string,
  pattern: string,
  replacement: string,
  isRegex = false
): Promise<boolean> {
  const content = await readFile(path);
  if (content === null) return false;

  let newContent: string;
  if (isRegex) {
    const regex = new RegExp(pattern, 'g');
    newContent = content.replace(regex, replacement);
  } else {
    newContent = content.split(pattern).join(replacement);
  }

  if (newContent === content) return false;
  await writeFile(path, newContent);
  _scheduleSearchRebuild();
  return true;
}

// ── Directory operations ───────────────────────────────────────────────

/**
 * Create any of the given vault-relative folder paths that don't already
 * exist (e.g. the knowledge lifecycle folders). No-op per path that's
 * already there — getDirectoryHandle with create:true is idempotent.
 */
export async function ensureFolders(folders: string[]): Promise<void> {
  if (!_vaultHandle) return;
  for (const folder of folders) {
    let handle: DirectoryHandle = _vaultHandle;
    for (const part of folder.split('/').filter(Boolean)) {
      handle = await handle.getDirectoryHandle(part, { create: true });
    }
  }
}

export async function listNotes(prefix?: string): Promise<string[]> {
  const allPaths: string[] = [];
  for await (const p of walkMdFiles()) {
    allPaths.push(p);
  }
  if (prefix) return allPaths.filter((p) => p.startsWith(prefix));
  return allPaths.sort();
}

export async function searchNotes(
  query: string,
  maxResults = 20
): Promise<{ path: string; title: string; snippet: string }[]> {
  const searchIndex = getSearchIndex();

  // Try the ranked search index first
  if (searchIndex.isBuilt) {
    const ranked = searchIndex.search(query, maxResults);
    if (ranked.length > 0) {
      // WP5 indexed gallery items and saved prompts under gallery://<id> /
      // prompt://<id> pseudo-paths — readFile() only resolves real
      // vault-relative paths, so those always returned null and got dropped.
      // Batch-load their source manifests once (not per hit) and resolve
      // content from there; real vault notes still go through readFile.
      const needsGallery = ranked.some((r) => r.path.startsWith('gallery://'));
      const needsPrompts = ranked.some((r) => r.path.startsWith('prompt://'));
      const [galleryItems, savedPrompts] = await Promise.all([
        needsGallery ? (await import('./galleryStorage')).loadGalleryItems() : Promise.resolve([]),
        needsPrompts ? (await import('./promptStorage')).loadSavedPrompts() : Promise.resolve([]),
      ]);
      const galleryById = new Map(galleryItems.map((i) => [i.id, i]));
      const promptById = new Map(savedPrompts.map((p) => [p.id, p]));

      const resolveDocContent = async (path: string): Promise<string | null> => {
        if (path.startsWith('gallery://')) {
          const item = galleryById.get(path.slice('gallery://'.length));
          if (!item) return null;
          return [item.title, item.prompt, item.notes, item.tags?.join(' ')].filter(Boolean).join('\n');
        }
        if (path.startsWith('prompt://')) {
          const p = promptById.get(path.slice('prompt://'.length));
          if (!p) return null;
          return [p.title, p.text, p.tags?.join(' ')].filter(Boolean).join('\n');
        }
        return readFile(path);
      };

      const resolveDocTitle = (path: string, content: string): string => {
        if (path.startsWith('gallery://')) return galleryById.get(path.slice('gallery://'.length))?.title || path;
        if (path.startsWith('prompt://')) return promptById.get(path.slice('prompt://'.length))?.title || path;
        return extractTitle(path, content);
      };

      // Fill in snippets from the actual content
      const bm25Results: Array<{ path: string; title: string; snippet: string; score: number }> = [];
      for (const r of ranked) {
        const content = await resolveDocContent(r.path);
        if (!content) continue;
        const snippet = searchIndex.generateSnippet(content, query);
        bm25Results.push({ path: r.path, title: r.title, snippet, score: r.score });
      }

      // ── Hybrid ranking: combine BM25 with semantic scores ──────────
      try {
        // Dynamically import to keep hard dependencies optional
        const semanticIndex = await import('./semanticIndex');
        const embedMod = await import('../services/embeddingService');

        const allVectors = await semanticIndex.getAllVectors();
        const settings = (await import('./settingsStorage')).loadLLMSettings();
        const queryVec = await embedMod.embedText(query, settings);

        if (queryVec && queryVec.length > 0 && allVectors.length > 0) {
          const hybrid = semanticIndex.hybridRank(bm25Results, queryVec, allVectors);

          // Re-build results in hybrid order, including semantic-only neighbours
          const pathInfo = new Map(bm25Results.map((r) => [r.path, r]));
          const merged: typeof bm25Results = [];
          for (const h of hybrid) {
            const existing = pathInfo.get(h.path);
            if (existing) {
              merged.push(existing);
            } else {
              // Semantic-only neighbour — fetch content
              const content = await resolveDocContent(h.path);
              if (content) {
                merged.push({
                  path: h.path,
                  title: resolveDocTitle(h.path, content),
                  snippet: searchIndex.generateSnippet(content, query),
                  score: h.hybridScore,
                });
              }
            }
            if (merged.length >= maxResults) break;
          }

          return merged.map(({ path, title, snippet }) => ({ path, title, snippet }));
        }
      } catch {
        // Semantic search unavailable — degrade silently to BM25
      }

      return bm25Results.map(({ path, title, snippet }) => ({ path, title, snippet }));
    }
  }

  // Fallback: brute-force substring search (original behaviour)
  const results: { path: string; title: string; snippet: string }[] = [];
  const q = query.toLowerCase();
  for await (const notePath of walkMdFiles()) {
    if (results.length >= maxResults) break;
    const content = await readFile(notePath);
    if (!content) continue;
    const lower = content.toLowerCase();
    const idx = lower.indexOf(q);
    if (idx === -1) continue;
    const snippet = content.slice(Math.max(0, idx - 100), idx + q.length + 100);
    const title = extractTitle(notePath, content);
    results.push({ path: notePath, title, snippet });
  }
  return results;
}

/**
 * Build the search index from all vault notes.
 * Call this after vault connection, and periodically to refresh the index.
 *
 * If a build is already in progress, this is a no-op (returns false).
 */
export async function rebuildSearchIndex(): Promise<boolean> {
  const searchIndex = getSearchIndex();
  if (searchIndex.isBuilding) {
    console.warn('[obsidian] Search index build already in progress — skipping');
    return false;
  }

  const notes: VaultNote[] = [];

  for await (const notePath of walkMdFiles()) {
    const content = await readFile(notePath);
    if (!content) continue;
    const title = extractTitle(notePath, content);
    notes.push({ path: notePath, title, content });
  }

  await searchIndex.build(notes);
  return true;
}

/**
 * Load the search index from IDB cache (fast) or trigger a background
 * rebuild if no cached index exists.
 */
export async function initSearchIndex(): Promise<void> {
  const searchIndex = getSearchIndex();
  const loaded = await searchIndex.loadFromIdb();

  if (!loaded) {
    // No cached index — rebuild in the background
    rebuildSearchIndex().catch((e) =>
      console.error('[obsidian] Failed to build search index:', e),
    );
  }
}

// ── Frontmatter operations ─────────────────────────────────────────────

export async function getFrontmatter(
  path: string
): Promise<Record<string, any>> {
  const note = await getNote(path);
  if (!note) return {};
  return note.frontmatter;
}

export async function setFrontmatterKey(
  path: string,
  key: string,
  value: any
): Promise<void> {
  const content = await readFile(path);
  if (content === null) return;
  const { frontmatter, body } = parseFrontmatter(content);
  frontmatter[key] = value;
  await writeFile(path, serializeWithFrontmatter(body, frontmatter));
  _scheduleSearchRebuild();
}

export async function deleteFrontmatterKey(
  path: string,
  key: string
): Promise<void> {
  const content = await readFile(path);
  if (content === null) return;
  const { frontmatter, body } = parseFrontmatter(content);
  delete frontmatter[key];
  await writeFile(path, serializeWithFrontmatter(body, frontmatter));
  _scheduleSearchRebuild();
}

export async function listTags(): Promise<{ tag: string; count: number }[]> {
  const tagCounts = new Map<string, number>();
  for await (const notePath of walkMdFiles()) {
    const content = await readFile(notePath);
    if (!content) continue;
    const { frontmatter } = parseFrontmatter(content);
    const tags = frontmatter.tags;
    if (Array.isArray(tags)) {
      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
  }
  return Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

export async function manageTags(
  path: string,
  op: 'add' | 'remove' | 'list',
  tag?: string
): Promise<string[]> {
  const content = await readFile(path);
  if (content === null && op !== 'list') {
    throw new Error(`Note not found: ${path}`);
  }

  if (op === 'list') {
    const fm = await getFrontmatter(path);
    return Array.isArray(fm.tags) ? fm.tags : [];
  }

  if (!tag) throw new Error('Tag is required for add/remove operations');

  const { frontmatter, body } = parseFrontmatter(content ?? '');
  const tags: string[] = Array.isArray(frontmatter.tags) ? [...frontmatter.tags] : [];

  if (op === 'add') {
    if (!tags.includes(tag)) tags.push(tag);
  } else if (op === 'remove') {
    const idx = tags.indexOf(tag);
    if (idx !== -1) tags.splice(idx, 1);
  }

  frontmatter.tags = tags;
  await writeFile(path, serializeWithFrontmatter(body ?? content ?? '', frontmatter));
  _scheduleSearchRebuild();
  return tags;
}

// ── UI panel ───────────────────────────────────────────────────────────

export function openNoteInPanel(note: ObsidianNote): void {
  appEventBus.emit('openObsidianNote', note);
}

// ── Helpers ────────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Wikilink → Relationship Graph indexing (WP1) ─────────────────────

/**
 * Walk all vault notes, extract [[wikilinks]], and add them as explicit
 * edges in the relationship graph.  Edges are weighted above the
 * tag-derived `similar_to` edges so hand-authored links take precedence.
 *
 * Call once at boot after initSearchIndex() succeeds.
 */
export async function indexWikilinksIntoGraph(): Promise<number> {
  const { relationshipGraph } = await import('../services/relationshipGraph');
  let edgeCount = 0;

  // Single pass: read every note once, build a title/filename → path index
  // so target resolution below is an O(1) lookup instead of re-walking the
  // whole vault per wikilink (was O(notes × links)).
  const notes: Array<{ path: string; content: string; title: string; tags: string[] }> = [];
  const byTitle = new Map<string, string>();

  for await (const notePath of walkMdFiles()) {
    const content = await readFile(notePath);
    if (!content) continue;
    const title = extractTitle(notePath, content);
    const { frontmatter } = parseFrontmatter(content);
    const tags: string[] = Array.isArray(frontmatter.tags) ? frontmatter.tags : [];
    notes.push({ path: notePath, content, title, tags });

    const fileName = notePath.split('/').pop()?.replace(/\.md$/, '') || '';
    byTitle.set(title.toLowerCase(), notePath);
    byTitle.set(fileName.toLowerCase(), notePath);
  }

  for (const note of notes) {
    const sourceId = note.path;
    if (!relationshipGraph.hasEntity('vault_note', sourceId)) {
      relationshipGraph.addEntity('vault_note', sourceId, note.title, note.tags);
    }

    const targets = extractWikilinks(note.content);
    for (const targetTitle of targets) {
      const targetPath = byTitle.get(targetTitle.toLowerCase().replace(/\.md$/, ''));
      if (!targetPath) continue; // target doesn't exist in vault
      if (targetPath === sourceId) continue; // skip self-links

      const targetId = targetPath;
      if (!relationshipGraph.hasEntity('vault_note', targetId)) {
        const target = notes.find((n) => n.path === targetPath);
        if (!target) continue;
        relationshipGraph.addEntity('vault_note', targetId, target.title, target.tags);
      }

      // Add explicit wikilink edge (weight 0.8 — above tag-derived 0.5)
      const existing = relationshipGraph.getRelationsBetween(
        'vault_note', sourceId, 'vault_note', targetId,
      );
      const hasWikilink = existing.some((r) => r.type === 'references');
      if (!hasWikilink) {
        relationshipGraph.addRelation(
          'references',
          'vault_note', sourceId,
          'vault_note', targetId,
          0.8,
        );
        edgeCount++;
      }
    }
  }

  console.log(`[obsidian] Indexed ${edgeCount} wikilink edges into relationship graph`);
  return edgeCount;
}

// ── Gallery + Prompt search indexing (WP5) ────────────────────────────

/**
 * Feed gallery items and saved prompts into the BM25 search index as
 * VaultNote-shaped documents with a `kind` discriminator.
 *
 * Call once at boot after initSearchIndex() succeeds.
 */
export async function indexGalleryAndPrompts(): Promise<number> {
  const { getSearchIndex } = await import('./vaultSearch');
  type VaultNote = import('./vaultSearch').VaultNote;
  const searchIndex = getSearchIndex();
  if (!searchIndex.isBuilt) return 0;

  let count = 0;

  // Index gallery items
  try {
    const { loadGalleryItems } = await import('./galleryStorage');
    const items = await loadGalleryItems();
    for (const item of items) {
      const parts: string[] = [];
      if (item.title) parts.push(item.title);
      if (item.prompt) parts.push(item.prompt);
      if (item.notes) parts.push(item.notes);
      if (item.tags?.length) parts.push(item.tags.join(' '));

      const note: VaultNote = {
        path: `gallery://${item.id}`,
        title: item.title || `Gallery Item ${item.id}`,
        content: parts.join('\n'),
        kind: 'gallery_item',
      };
      searchIndex.addDocument(note);
      count++;
    }
  } catch { /* gallery unavailable */ }

  // Index saved prompts
  try {
    const { loadSavedPrompts } = await import('./promptStorage');
    const prompts = await loadSavedPrompts();
    for (const p of prompts) {
      const parts: string[] = [];
      if (p.title) parts.push(p.title);
      if (p.text) parts.push(p.text);
      if (p.tags?.length) parts.push(p.tags.join(' '));

      const note: VaultNote = {
        path: `prompt://${p.id}`,
        title: p.title || `Prompt ${p.id}`,
        content: parts.join('\n'),
        kind: 'prompt',
      };
      searchIndex.addDocument(note);
      count++;
    }
  } catch { /* prompt storage unavailable */ }

  if (count > 0) {
    console.log(`[obsidian] Indexed ${count} gallery/prompt items into search`);
  }
  return count;
}
