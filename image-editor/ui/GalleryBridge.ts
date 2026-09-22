// ─── Kollektiv Image Editor — Gallery Bridge ───────────────────────────────
// The ONLY module in image-editor/ permitted to import utils/galleryStorage.
// Keeps the editor core decoupled from the app's gallery persistence layer.

import { addItemToGallery } from '../../utils/galleryStorage';
import { loadLLMSettings } from '../../utils/settingsStorage';
import type { GalleryItem } from '../../types';

export interface SaveToGalleryOptions {
  title: string;
  categoryId?: string;
  generationId?: string;
}

/** Saves a rendered blob into the app gallery, returning the created GalleryItem. */
export async function saveToGallery(blob: Blob, opts: SaveToGalleryOptions): Promise<GalleryItem> {
  const url = URL.createObjectURL(blob);
  try {
    return await addItemToGallery('image', [url], ['Image Editor'], {
      categoryId: opts.categoryId,
      defaultTitle: opts.title,
      generationId: opts.generationId,
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Returns true if the current settings would JPEG-convert the saved image (destroying alpha). */
export function willConvertToJpeg(): boolean {
  const settings = loadLLMSettings();
  return settings.storageProvider === 'drive'
    ? (settings.convertImageToJpgDrive ?? true)
    : (settings.convertImageToJpgLocal ?? false);
}
