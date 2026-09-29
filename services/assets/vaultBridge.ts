/**
 * Assets Manager → Vault gallery (plan Tasks 17, 24): saves picked assets into
 * the gallery, into a chosen category, carrying the index's tags and caption.
 * The gallery stores what browsers can show, so RAWs are skipped with a reason
 * (develop them in the Image Editor, then Save to Gallery from there).
 */
import { addItemToGallery } from '../../utils/galleryStorage';
import { fileSystemManager } from '../../utils/fileUtils';
import type { AssetMeta } from './assetLibrary';
import { RAW_EXTS } from './assetFacts';
import type { AssetFile } from './types';

const RAW = new Set<string>(RAW_EXTS);

export interface VaultSaveResult { saved: number; skipped: { name: string; reason: string }[]; failed: { name: string; error: string }[] }

export async function saveToVault(items: { file: AssetFile; meta?: AssetMeta }[], categoryId?: string): Promise<VaultSaveResult> {
  if (!fileSystemManager.isDirectorySelected()) throw new Error('Connect a vault first (Settings) to save into the gallery.');
  const res: VaultSaveResult = { saved: 0, skipped: [], failed: [] };
  for (const { file, meta } of items) {
    if (RAW.has(file.ext)) { res.skipped.push({ name: file.name, reason: 'RAW — develop it in the Image Editor first' }); continue; }
    let url: string | null = null;
    try {
      url = URL.createObjectURL(await file.handle.getFile());
      await addItemToGallery('image', [url], [], {
        categoryId, defaultTitle: file.name.replace(/\.[^.]+$/, ''), tags: meta?.tags, notes: meta?.caption,
      });
      res.saved++;
    } catch (e) {
      res.failed.push({ name: file.name, error: e instanceof Error ? e.message : String(e) });
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }
  return res;
}

/** The vault's gallery folder (or the vault itself) as a browsable handle, when
 *  the vault is a local folder. The Assets Manager adds it as a root. */
export async function vaultGalleryHandle(): Promise<FileSystemDirectoryHandle | null> {
  const fsm = fileSystemManager as { getLocalDirectoryHandle?: () => FileSystemDirectoryHandle | null };
  const vault = typeof fsm.getLocalDirectoryHandle === 'function' ? fsm.getLocalDirectoryHandle() : null;
  if (!vault) return null;
  return vault.getDirectoryHandle('gallery').catch(() => vault);
}
