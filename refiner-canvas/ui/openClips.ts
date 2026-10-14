// Assemble -> Video Editor: resolve each clip's Gallery id to a Blob (session preview first, Gallery file
// otherwise) and hand them to the editor's bridge in the order the Assemble node produced them.

import { loadGalleryItems } from '../../utils/galleryStorage';
import { fileSystemManager } from '../../utils/fileUtils';
import { openInVideoEditor } from '../../video-editor/bridge/openInVideoEditor';
import type { ClipRef } from '../core/types';
import { getPreview } from './media';

async function clipBlob(assetKey: string, items: Awaited<ReturnType<typeof loadGalleryItems>> | null): Promise<Blob | null> {
  const preview = getPreview(assetKey);
  if (preview) {
    try { return await (await fetch(preview)).blob(); } catch { /* object URL revoked: fall through to the Gallery file */ }
  }
  const path = items?.find(i => i.id === assetKey)?.urls[0];
  return path ? fileSystemManager.getFileAsBlob(path) : null;
}

/** Opens the clips in the Video Editor and returns how many were found; throws when none could be read. */
export async function openClipsInVideoEditor(clips: ClipRef[]): Promise<number> {
  if (!clips.length) throw new Error('Run the graph first: no clips to open.');
  const needGallery = clips.some(c => !getPreview(c.assetKey));
  const items = needGallery ? await loadGalleryItems().catch(() => null) : null;
  const files: { blob: Blob; name: string }[] = [];
  for (const [i, c] of clips.entries()) {
    const blob = await clipBlob(c.assetKey, items);
    if (blob) files.push({ blob, name: `canvas-clip-${String(i + 1).padStart(2, '0')}.mp4` });
  }
  if (!files.length) throw new Error('Could not read the clips from the Gallery.');
  openInVideoEditor(files);
  return files.length;
}
