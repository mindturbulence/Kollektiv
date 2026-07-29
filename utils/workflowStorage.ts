/**
 * workflowStorage — Persist/load/delete custom ComfyUI workflow schemas
 * using the existing OPFS-based manifest pattern (same as promptStorage).
 */

import { fileSystemManager } from './fileUtils';
import { loadManifestSafe, type ManifestLoad } from './manifestStore';
import type { SavedWorkflowEntry } from '../services/comfyWorkflowParser';

const MANIFEST_NAME = 'comfy_workflows_manifest.json';
const WORKFLOWS_DIR = 'comfy_workflows';

interface WorkflowManifest {
  entries: SavedWorkflowEntry[];
}

const getManifest = (): Promise<ManifestLoad<WorkflowManifest>> =>
  loadManifestSafe<WorkflowManifest>(
    MANIFEST_NAME,
    (parsed) => {
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return {
        entries: Array.isArray(parsed.entries)
          ? parsed.entries.filter(
              (e: any) => e && typeof e === 'object' && e.id && e.schema && e.schema.rawPromptJson,
            )
          : [],
      };
    },
    () => ({ entries: [] }),
  );

const saveManifest = async (manifest: WorkflowManifest) => {
  await fileSystemManager.saveFile(
    MANIFEST_NAME,
    new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }),
  );
};

/**
 * Load all saved custom workflow entries.
 */
export async function loadWorkflowSchemas(): Promise<SavedWorkflowEntry[]> {
  const { data: manifest } = await getManifest();
  return manifest.entries;
}

/**
 * Save a new custom workflow entry.
 */
export async function saveWorkflowSchema(entry: SavedWorkflowEntry): Promise<void> {
  const { data: manifest } = await getManifest();

  // Replace existing entry with same id if present
  const idx = manifest.entries.findIndex((e) => e.id === entry.id);
  if (idx >= 0) {
    manifest.entries[idx] = entry;
  } else {
    manifest.entries.push(entry);
  }

  // Store the raw JSON as a separate file for easier inspection
  await fileSystemManager.saveFile(
    `${WORKFLOWS_DIR}/${entry.id}.json`,
    new Blob([JSON.stringify(entry.schema.rawPromptJson, null, 2)], {
      type: 'application/json',
    }),
  );

  await saveManifest(manifest);
}

/**
 * Delete a workflow entry by id.
 */
export async function deleteWorkflowSchema(id: string): Promise<void> {
  const { data: manifest, safeToSave } = await getManifest();
  if (!safeToSave) throw new Error('Cannot delete workflow: manifest write blocked');

  manifest.entries = manifest.entries.filter((e) => e.id !== id);
  await fileSystemManager.deleteFile(`${WORKFLOWS_DIR}/${id}.json`);
  await saveManifest(manifest);
}

/**
 * Generate a unique workflow entry id.
 */
export function generateWorkflowId(): string {
  return `wf_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}
