// ─── Kollektiv Image Editor — Gallery Bridge ───────────────────────────────
// The ONLY module in image-editor/ permitted to import utils/galleryStorage.
// Keeps the editor core decoupled from the app's gallery persistence layer.

import { addItemToGallery, updateItemInGallery, loadGalleryItems } from '../../utils/galleryStorage';
import { loadLLMSettings } from '../../utils/settingsStorage';
import { fileSystemManager } from '../../utils/fileUtils';
import type { GalleryItem } from '../../types';

export interface SaveToGalleryOptions {
  title: string;
  categoryId?: string;
  /** The SOURCE gallery item's generation record id (E8) — NOT the gallery
   *  item id; lineage lookups join on the Generation record. */
  generationId?: string;
  tags?: string[];
  prompt?: string;
  /** Set on 'Update original' — replaces the source item's image in place. */
  updateItemId?: string;
}

/** Saves a rendered blob into the app gallery, returning the created GalleryItem.
 *  With opts.updateItemId set, the source item is updated in place instead
 *  (Ctrl+S twice no longer duplicates the item, review H10). */
export async function saveToGallery(blob: Blob, opts: SaveToGalleryOptions): Promise<GalleryItem> {
  const url = URL.createObjectURL(blob);
  try {
    if (opts.updateItemId) {
      const items = await loadGalleryItems();
      const existing = items.find((i) => i.id === opts.updateItemId);
      if (!existing) throw new Error('Original gallery item no longer exists');
      await updateItemInGallery(opts.updateItemId, { urls: [url], title: opts.title });
      const updated = (await loadGalleryItems()).find((i) => i.id === opts.updateItemId);
      return updated ?? existing;
    }
    return await addItemToGallery('image', [url], ['Image Editor'], {
      categoryId: opts.categoryId,
      defaultTitle: opts.title,
      generationId: opts.generationId,
      tags: opts.tags,
      prompt: opts.prompt,
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Gallery item URLs are usually vault-relative paths (only data:/http/blob: are
 *  directly fetchable) — resolve them the same way ImageCard does. */
export async function loadGalleryImage(url: string): Promise<Blob> {
  if (/^(data:|https?:|blob:)/.test(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch gallery image: ${res.status}`);
    return res.blob();
  }
  const blob = await fileSystemManager.getFileAsBlob(url);
  if (!blob) throw new Error('Gallery image not found in vault');
  return blob;
}

/** Looks up the metadata of the gallery item an editor session was opened
 *  from, so a re-saved edit can inherit title, category, tags AND lineage
 *  (review H10: the source's own generationId and prompt were dropped, and
 *  the gallery item id was written into generationId, breaking lineage). */
export async function getSourceItemMeta(
  galleryItemId: string,
): Promise<{ title?: string; categoryId?: string; tags?: string[]; generationId?: string; prompt?: string } | null> {
  const items = await loadGalleryItems();
  const item = items.find((i) => i.id === galleryItemId);
  if (!item) return null;
  return {
    title: item.title,
    categoryId: item.categoryId,
    tags: item.tags,
    generationId: item.generationId,
    prompt: item.prompt || undefined,
  };
}

/** Returns true if the current settings would JPEG-convert the saved image (destroying alpha). */
export function willConvertToJpeg(): boolean {
  const settings = loadLLMSettings();
  return settings.storageProvider === 'drive'
    ? (settings.convertImageToJpgDrive ?? true)
    : (settings.convertImageToJpgLocal ?? false);
}
