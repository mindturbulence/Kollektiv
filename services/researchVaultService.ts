import { ResearchVaultError, ResearchProject, ProjectSummary, SourceInput } from '../types';
import type { IFileSystemManager } from '../utils/fileUtils';

// ── Active project tracker (module-level, for assistant tools) ────────

let activeProjectSlug: string | null = null;

export const setActiveProject = (slug: string | null) => { activeProjectSlug = slug; };
export const getActiveResearchProject = () => activeProjectSlug;

// ── Path helpers ──────────────────────────────────────────────────────

const RESEARCH_DIR = 'research-projects';

const chatJsonPath = (slug: string) => `${RESEARCH_DIR}/${slug}/chat.json`;
const findingsPath = (slug: string) => `${RESEARCH_DIR}/${slug}/findings.md`;
const sourceFilePath = (slug: string, fileName: string) => `${RESEARCH_DIR}/${slug}/sources/${fileName}`;
const indexFilePath = () => `${RESEARCH_DIR}/projects-index.json`;

// ── Slug generation ───────────────────────────────────────────────────

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── Index helpers ─────────────────────────────────────────────────────

async function readIndex(fm: IFileSystemManager): Promise<ProjectSummary[]> {
  try {
    const raw = await fm.readFile(indexFilePath());
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeIndex(fm: IFileSystemManager, index: ProjectSummary[]): Promise<void> {
  await fm.saveFile(indexFilePath(), new Blob([JSON.stringify(index, null, 2)], { type: 'application/json' }));
}

async function updateIndexForProject(fm: IFileSystemManager, slug: string, patch: Partial<ProjectSummary>): Promise<void> {
  const index = await readIndex(fm);
  const idx = index.findIndex(p => p.slug === slug);
  if (idx !== -1) {
    index[idx] = { ...index[idx], ...patch };
  }
  await writeIndex(fm, index);
}

// ── Vault operations ──────────────────────────────────────────────────

export const researchVault = {
  projects: {
    async list(fm: IFileSystemManager): Promise<ProjectSummary[]> {
      return readIndex(fm);
    },

    async open(slug: string, fm: IFileSystemManager): Promise<ResearchProject> {
      try {
        const raw = await fm.readFile(chatJsonPath(slug));
        if (!raw) throw new ResearchVaultError('NOT_FOUND', `Project "${slug}" not found.`);
        return JSON.parse(raw) as ResearchProject;
      } catch (e) {
        if (e instanceof ResearchVaultError) throw e;
        throw new ResearchVaultError('IO_ERROR', `Failed to open project "${slug}": ${(e as Error).message}`);
      }
    },

    async create(title: string, fm: IFileSystemManager): Promise<string> {
      let slug = slugify(title);
      if (!slug) slug = 'project-' + Date.now();

      // Check for existing
      const existing = await fm.readFile(chatJsonPath(slug));
      if (existing) {
        throw new ResearchVaultError('ALREADY_EXISTS', `Project "${slug}" already exists.`);
      }

      const now = new Date().toISOString();
      const project: ResearchProject = {
        title,
        slug,
        createdAt: now,
        updatedAt: now,
        messages: [],
        sourceFiles: [],
      };

      await fm.saveFile(chatJsonPath(slug), new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }));
      await fm.saveFile(findingsPath(slug), new Blob([''], { type: 'text/markdown' }));

      // Update index
      const index = await readIndex(fm);
      index.push({
        slug,
        title,
        createdAt: now,
        updatedAt: now,
        sourceCount: 0,
        messageCount: 0,
      });
      await writeIndex(fm, index);

      return slug;
    },

    async save(slug: string, data: ResearchProject, fm: IFileSystemManager): Promise<void> {
      data.updatedAt = new Date().toISOString();
      await fm.saveFile(chatJsonPath(slug), new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      await updateIndexForProject(fm, slug, {
        updatedAt: data.updatedAt,
        messageCount: data.messages.length,
        sourceCount: data.sourceFiles.length,
      });
    },

    async delete(slug: string, fm: IFileSystemManager): Promise<void> {
      // Remove files — the file system API may not support recursive delete,
      // so we remove the files we know about and update the index.
      try {
        await fm.deleteFile(chatJsonPath(slug));
      } catch { /* ignore */ }
      try {
        await fm.deleteFile(findingsPath(slug));
      } catch { /* ignore */ }

      // Remove from index
      const index = await readIndex(fm);
      const filtered = index.filter(p => p.slug !== slug);
      await writeIndex(fm, filtered);
    },
  },

  sources: {
    async add(slug: string, input: SourceInput, fm: IFileSystemManager): Promise<void> {
      let content = '';
      let fileName = '';

      switch (input.kind) {
        case 'url': {
          // Fetch via proxy and save as markdown
          const urlValue = input.value!;
          try {
            const parsed = new URL(urlValue);
            const res = await fetch(`/proxy-remote${parsed.pathname}${parsed.search}`, {
              headers: { 'x-target-url': parsed.origin },
            });
            if (!res.ok) {
              throw new ResearchVaultError('FETCH_FAILED', `URL fetch returned ${res.status}: ${res.statusText}`);
            }
            const html = await res.text();
            // Simple HTML-to-text conversion
            const doc = new DOMParser().parseFromString(html, 'text/html');
            doc.querySelectorAll('script, style, nav, footer, header, noscript, svg').forEach(el => el.remove());
            const text = (doc.body?.textContent || html).replace(/\s{3,}/g, '\n').trim();
            content = `# ${urlValue}\n\n> Captured from ${urlValue}\n\n${text}`;
            fileName = `web-capture-${Date.now()}.md`;
          } catch (e) {
            if (e instanceof ResearchVaultError) throw e;
            throw new ResearchVaultError('FETCH_FAILED', `Failed to fetch URL: ${(e as Error).message}`);
          }
          break;
        }
        case 'vault-file': {
          const vp = input.vaultPath!;
          try {
            const raw = await fm.readFile(vp);
            if (!raw) throw new ResearchVaultError('NOT_FOUND', `Vault file "${vp}" not found.`);
            content = raw;
            fileName = vp.split('/').pop() || `source-${Date.now()}.md`;
          } catch (e) {
            if (e instanceof ResearchVaultError) throw e;
            throw new ResearchVaultError('IO_ERROR', `Failed to read vault file: ${(e as Error).message}`);
          }
          break;
        }
        case 'upload': {
          const uploadFile = input.file!;
          const uploadFileName = input.fileName || uploadFile.name || `upload-${Date.now()}.md`;
          // Read uploaded file content
          content = await uploadFile.text();
          fileName = uploadFileName;
          break;
        }
      }

      // Save the source file
      await fm.saveFile(sourceFilePath(slug, fileName), new Blob([content], { type: 'text/markdown' }));

      // Update project's sourceFiles array
      const project = await researchVault.projects.open(slug, fm);
      project.sourceFiles = project.sourceFiles || [];
      project.sourceFiles.push({
        path: `sources/${fileName}`,
        title: fileName.replace(/\.(md|txt)$/i, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        addedAt: new Date().toISOString(),
      });
      await researchVault.projects.save(slug, project, fm);
    },

    async remove(slug: string, fileName: string, fm: IFileSystemManager): Promise<void> {
      try {
        await fm.deleteFile(sourceFilePath(slug, fileName));
      } catch { /* ignore if already gone */ }

      // Update project's sourceFiles array
      const project = await researchVault.projects.open(slug, fm);
      project.sourceFiles = (project.sourceFiles || []).filter(s => s.path !== `sources/${fileName}`);
      await researchVault.projects.save(slug, project, fm);
    },

    async readContent(slug: string, fileName: string, fm: IFileSystemManager): Promise<string> {
      const raw = await fm.readFile(sourceFilePath(slug, fileName));
      if (!raw) {
        // Try just the file name without the sources/ prefix
        const alt = await fm.readFile(fileName);
        if (!alt) throw new ResearchVaultError('NOT_FOUND', `Source "${fileName}" not found.`);
        return alt;
      }
      return raw;
    },
  },

  findings: {
    async load(slug: string, fm: IFileSystemManager): Promise<string> {
      try {
        const raw = await fm.readFile(findingsPath(slug));
        return raw || '';
      } catch {
        return '';
      }
    },

    async append(slug: string, text: string, fm: IFileSystemManager): Promise<void> {
      const existing = await researchVault.findings.load(slug, fm);
      const updated = existing ? `${existing}\n\n---\n\n${text}` : text;
      await fm.saveFile(findingsPath(slug), new Blob([updated], { type: 'text/markdown' }));
    },

    async save(slug: string, text: string, fm: IFileSystemManager): Promise<void> {
      await fm.saveFile(findingsPath(slug), new Blob([text], { type: 'text/markdown' }));
    },
  },
};
