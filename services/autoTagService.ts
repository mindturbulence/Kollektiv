/**
 * Auto-tagging — suggests descriptive tags for gallery images.
 *
 * Providers return raw text; all parsing and normalization happens here so
 * the logic is tested in one place rather than duplicated per provider.
 */

import type { GalleryItem, LLMSettings } from '../types';
import { suggestTagsRaw } from './llmService';
import { getActiveFileManager, fileToBase64 } from '../utils/fileUtils';
import { updateItemInGallery } from '../utils/galleryStorage';

/** Tags longer than this are almost always prose the model leaked in. */
const MAX_TAG_WORDS = 3;

/** Upper bound on suggestions shown at once. Keeps the accept/reject UI
 *  scannable and caps the damage from a model that ignores instructions. */
const MAX_SUGGESTIONS = 12;

/** Turn raw model output into candidate tag strings. Defensive: models
 *  ignore format instructions often enough that this cannot assume one shape. */
export function parseTagResponse(text: string): string[] {
  if (!text) return [];
  return text
    .split(/[,\n]/)
    .map(s => s.trim())
    .map(s => s.replace(/^[-*•]\s*/, ''))
    .map(s => s.replace(/^\d+[.)]\s*/, ''))
    .map(s => s.replace(/^["'`]+|["'`]+$/g, ''))
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => !s.endsWith(':'))
    .filter(s => s.split(/\s+/).length <= MAX_TAG_WORDS);
}

/** Canonicalize candidates and drop anything the item already carries. */
export function normalizeTags(candidates: string[], existing: string[] = []): string[] {
  const existingSet = new Set(existing.map(t => t.trim().toLowerCase().replace(/\s+/g, ' ')));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of candidates) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!tag || existingSet.has(tag) || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

/**
 * Suggest tags for one gallery image. Returns candidates only — the caller
 * decides what to accept. Never writes.
 *
 * ProviderUnsupportedError from the dispatcher propagates untouched: a
 * provider without vision is a configuration choice to surface, not a
 * transient failure to route around.
 */
export async function suggestTagsForItem(item: GalleryItem, settings: LLMSettings): Promise<string[]> {
  if (!settings.autoTagEnabled) {
    throw new Error('Auto-tagging is disabled. Enable it in Settings > Integrations > Assistant.');
  }
  if (item.type !== 'image') {
    throw new Error('Tag suggestion supports image items only.');
  }
  const path = item.urls[0];
  if (!path) {
    throw new Error('This item has no image file to analyse.');
  }
  const blob = await getActiveFileManager().getFileAsBlob(path);
  if (!blob) {
    throw new Error(`Image file not found in the vault: ${path}`);
  }
  const base64 = await fileToBase64(blob, true);
  const raw = await suggestTagsRaw(base64, item.prompt || '', settings);
  return normalizeTags(parseTagResponse(raw), item.tags || []);
}

/**
 * Persist the tags the user accepted. Returns the item's full new tag list.
 * Writes nothing when the accepted set adds nothing — a rejected suggestion
 * must leave the stored item untouched.
 */
export async function applyTagsToItem(item: GalleryItem, accepted: string[]): Promise<string[]> {
  const current = item.tags || [];
  const additions = normalizeTags(accepted, current);
  if (additions.length === 0) return current;
  const next = [...current, ...additions];
  await updateItemInGallery(item.id, { tags: next });
  return next;
}
