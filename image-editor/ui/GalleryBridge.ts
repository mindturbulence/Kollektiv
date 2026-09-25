// ─── Kollektiv Image Editor — Gallery Bridge ───────────────────────────────
// The ONLY module in image-editor/ permitted to import utils/galleryStorage.
// Keeps the editor core decoupled from the app's gallery persistence layer.

import { addItemToGallery, loadGalleryItems } from '../../utils/galleryStorage';
import { loadLLMSettings } from '../../utils/settingsStorage';
import { fileSystemManager } from '../../utils/fileUtils';
import type { GalleryItem } from '../../types';

export interface SaveToGalleryOptions {
  title: string;
  categoryId?: string;
  generationId?: string;
  tags?: string[];
}

/** Saves a rendered blob into the app gallery, returning the created GalleryItem. */
export async function saveToGallery(blob: Blob, opts: SaveToGalleryOptions): Promise<GalleryItem> {
  const url = URL.createObjectURL(blob);
  try {
    return await addItemToGallery('image', [url], ['Image Editor'], {
      categoryId: opts.categoryId,
      defaultTitle: opts.title,
      generationId: opts.generationId,
      tags: opts.tags,
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

/** Looks up the title/category/tags of the gallery item an editor session was opened
 *  from, so a re-saved edit can inherit them instead of landing uncategorized. */
export async function getSourceItemMeta(
  galleryItemId: string,
): Promise<{ title?: string; categoryId?: string; tags?: string[] } | null> {
  const items = await loadGalleryItems();
  const item = items.find((i) => i.id === galleryItemId);
  if (!item) return null;
  return { title: item.title, categoryId: item.categoryId, tags: item.tags };
}

/** Returns true if the current settings would JPEG-convert the saved image (destroying alpha). */
export function willConvertToJpeg(): boolean {
  const settings = loadLLMSettings();
  return settings.storageProvider === 'drive'
    ? (settings.convertImageToJpgDrive ?? true)
    : (settings.convertImageToJpgLocal ?? false);
}
