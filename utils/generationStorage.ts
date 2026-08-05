/**
 * Generation Storage — WP3 of the Adaptation Roadmap.
 *
 * Durable record of generation runs. Follows the presetStorage.ts pattern
 * (loadManifestSafe + ManifestWriteBlockedError).
 *
 * Each Generation captures the full context of a generation run so outputs
 * are reproducible from the vault. One Generation → N GalleryItems.
 */

import { v4 as uuidv4 } from 'uuid';
import { fileSystemManager } from './fileUtils';
import { loadManifestSafe, ManifestWriteBlockedError, stampSchemaVersion, type ManifestLoad } from './manifestStore';
import type { Generation } from '../types';
import type { GenerateParams } from '../services/generationBackend';

// ── Types ──────────────────────────────────────────────────────────────

interface GenerationManifest {
  entries: Generation[];
}

// ── Constants ──────────────────────────────────────────────────────────

const MANIFEST_NAME = 'generations.json';

// ── Internal helpers ───────────────────────────────────────────────────

const isGeneration = (obj: any): obj is Generation =>
  obj != null && typeof obj === 'object' && typeof obj.id === 'string' && typeof obj.createdAt === 'number';

const getManifest = (): Promise<ManifestLoad<GenerationManifest>> =>
  loadManifestSafe<GenerationManifest>(
    MANIFEST_NAME,
    (parsed) => {
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return { entries: Array.isArray(parsed.entries) ? parsed.entries.filter(isGeneration) : [] };
    },
    () => ({ entries: [] }),
  );

const saveManifest = async (manifest: GenerationManifest) => {
  await fileSystemManager.saveFile(
    MANIFEST_NAME,
    new Blob([JSON.stringify(stampSchemaVersion(manifest as any), null, 2)], { type: 'application/json' }),
  );
};

// ── Public API ─────────────────────────────────────────────────────────

/** Load all generation records. */
export async function loadGenerations(): Promise<Generation[]> {
  const { data: manifest } = await getManifest();
  return manifest.entries;
}

/** Get a single generation by id. */
export async function getGeneration(id: string): Promise<Generation | undefined> {
  const { data: manifest } = await getManifest();
  return manifest.entries.find((e) => e.id === id);
}

/** Get all generations that reference a given gallery item. */
export async function getGenerationsForItem(itemId: string): Promise<Generation[]> {
  const { data: manifest } = await getManifest();
  return manifest.entries.filter((g) => g.resultItemIds.includes(itemId));
}

/** Save a new generation record, or replace an existing one with the same id. */
export async function saveGeneration(gen: Generation): Promise<void> {
  const { data: manifest, safeToSave } = await getManifest();
  if (!safeToSave) throw new ManifestWriteBlockedError(MANIFEST_NAME);

  const idx = manifest.entries.findIndex((e) => e.id === gen.id);
  if (idx >= 0) manifest.entries[idx] = gen;
  else manifest.entries.unshift(gen);

  await saveManifest(manifest);
}

/** Delete a generation by id. Returns true if it existed. */
export async function deleteGeneration(id: string): Promise<boolean> {
  const { data: manifest, safeToSave } = await getManifest();
  if (!safeToSave) throw new ManifestWriteBlockedError(MANIFEST_NAME);

  const idx = manifest.entries.findIndex((e) => e.id === id);
  if (idx === -1) return false;

  manifest.entries.splice(idx, 1);
  await saveManifest(manifest);
  return true;
}

/** Create a Generation record with a generated id and timestamp. */
export function createGeneration(params: {
  promptText: string;
  negativePromptText?: string;
  modifiers?: Record<string, any>;
  backendId: string;
  params: GenerateParams;
  resolvedSeed?: number;
  status?: 'ok' | 'failed' | 'cancelled';
  error?: string;
  batchId?: string;
  parentGenerationId?: string;
  promptId?: string;
  projectId?: string;
}): Generation {
  return {
    id: `gen_${Date.now()}_${uuidv4().substring(0, 8)}`,
    createdAt: Date.now(),
    promptText: params.promptText,
    negativePromptText: params.negativePromptText,
    modifiers: params.modifiers as any,
    backendId: params.backendId,
    params: params.params,
    resolvedSeed: params.resolvedSeed,
    resultItemIds: [],
    status: params.status ?? 'ok',
    error: params.error,
    batchId: params.batchId,
    parentGenerationId: params.parentGenerationId,
    promptId: params.promptId,
    projectId: params.projectId,
  };
}
