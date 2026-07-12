import { fileSystemManager } from '../utils/fileUtils';
import { loadManifestSafe, ManifestWriteBlockedError } from '../utils/manifestStore';

const MANIFEST_NAME = 'modifier_options_manifest.json';

export interface CustomOptionEntry {
  name: string;
  description?: string;
}

export interface ModifierOptionsManifest {
  version: 1;
  custom: Record<string, (string | CustomOptionEntry)[]>;
}

const getManifest = () =>
  loadManifestSafe<ModifierOptionsManifest>(
    MANIFEST_NAME,
    (parsed) => {
      if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) return null;
      if (!parsed.custom || typeof parsed.custom !== 'object') return null;
      return { version: 1, custom: parsed.custom };
    },
    () => ({ version: 1, custom: {} })
  );

export class ModifierOptionsService {
  private async saveManifest(manifest: ModifierOptionsManifest): Promise<void> {
    await fileSystemManager.saveFile(
      MANIFEST_NAME,
      new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })
    );
  }

  /**
   * Load custom options for all modifier categories.
   * Returns empty object when no data directory is selected.
   */
  public async loadCustomOptions(): Promise<Record<string, (string | CustomOptionEntry)[]>> {
    if (!fileSystemManager.isDirectorySelected()) return {};
    const { data: manifest } = await getManifest();
    return manifest.custom;
  }

  /**
   * Add a custom entry to the specified modifier category.
   */
  public async addCustomOption(key: string, entry: string | CustomOptionEntry): Promise<void> {
    if (!fileSystemManager.isDirectorySelected()) {
      throw new Error('Application data directory not selected.');
    }
    const { data: manifest, safeToSave } = await getManifest();
    if (!safeToSave) throw new ManifestWriteBlockedError(MANIFEST_NAME);

    if (!manifest.custom[key]) {
      manifest.custom[key] = [];
    }

    const list = manifest.custom[key];
    const entryName = typeof entry === 'string' ? entry : entry.name;
    const exists = list.some((e) => {
      const existingName = typeof e === 'string' ? e : e.name;
      return existingName.toLowerCase() === entryName.toLowerCase();
    });

    if (!exists) {
      list.push(entry);
    }

    await this.saveManifest(manifest);
  }

  /**
   * Remove a custom entry from the specified modifier category by name.
   */
  public async removeCustomOption(key: string, name: string): Promise<void> {
    if (!fileSystemManager.isDirectorySelected()) {
      throw new Error('Application data directory not selected.');
    }
    const { data: manifest, safeToSave } = await getManifest();
    if (!safeToSave) throw new ManifestWriteBlockedError(MANIFEST_NAME);

    if (!manifest.custom[key]) return;

    manifest.custom[key] = manifest.custom[key].filter((e) => {
      const entryName = typeof e === 'string' ? e : e.name;
      return entryName.toLowerCase() !== name.toLowerCase();
    });

    await this.saveManifest(manifest);
  }

  /**
   * Merge built-in options with custom options, deduplicating case-insensitively.
   * For descriptive entries, custom entry descriptions win on name conflict.
   */
  public mergeOptions(
    builtin: string[],
    custom: (string | CustomOptionEntry)[]
  ): string[] {
    if (!custom || custom.length === 0) return builtin;

    const merged = new Map<string, string>(); // name -> description or ''

    // Add builtins first
    for (const entry of builtin) {
      merged.set(entry.toLowerCase(), entry);
    }

    // Add custom entries (overwrite description if conflict)
    for (const entry of custom) {
      if (typeof entry === 'string') {
        if (!merged.has(entry.toLowerCase())) {
          merged.set(entry.toLowerCase(), entry);
        }
      } else if (typeof entry === 'object' && entry.name) {
        const key = entry.name.toLowerCase();
        merged.set(key, entry.description ? `${entry.name}||${entry.description}` : entry.name);
      }
    }

    // Return as plain strings (descriptive entries with description appended)
    return Array.from(merged.values()).map((v) => v);
  }
}

export const modifierOptionsService = new ModifierOptionsService();
