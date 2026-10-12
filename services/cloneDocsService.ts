/**
 * Project documents for the clone export (CL-3): one text call to the active AI engine writes PRD, BRD, TASKS and
 * ISSUES; any document the model leaves out, or the whole set when the call fails, comes from the templates.
 */
import type { DesignRecipe, LLMSettings, RecipeBrief } from '../types';
import { fileSystemManager } from '../utils/fileUtils';
import { loadRecipeFile } from '../utils/designLibraryStorage';
import { parseDesignSpec } from '../utils/designSpec';
import { sanitizeMeasurements } from './siteMeasure';
import { buildDocsPrompt, parseDocs, PROJECT_DOCS, templateDocs, type CloneDocContext, type ProjectDocName, type ProjectDocs } from '../utils/cloneExport';
import { streamChat } from './llmService';

export interface GeneratedDocs {
  docs: ProjectDocs;
  /** Documents that came from the templates instead of the model. */
  fromTemplate: ProjectDocName[];
  /** Why the model was not used, when it failed. */
  error?: string;
}

/** Same plain-text error convention as the design spec stream (see llmService.collectDesignSpecStream). */
async function collect(stream: AsyncGenerator<string>): Promise<string> {
  let text = '';
  for await (const chunk of stream) text += chunk;
  const head = text.trimStart();
  if (!head) throw new Error('The model returned no text.');
  if (head.startsWith('System:') || head.startsWith('**Error calling')) throw new Error(head.slice(0, 300));
  return text;
}

export interface CloneSource {
  context: CloneDocContext;
  designMd: string;
  assetsJson: string;
  contentJson: string;
  refs: { name: string; blob: Blob }[];
}

/** Reads everything the export needs from a cloned recipe in the vault. Throws a user-facing message on any gap. */
export async function loadCloneSource(recipe: DesignRecipe, brief: RecipeBrief, permission: boolean): Promise<CloneSource> {
  const [designMd, assetsJson, contentJson, measurementsJson] = await Promise.all([
    fileSystemManager.readFile(`design-library/${recipe.id}/DESIGN.md`),
    loadRecipeFile(recipe.id, 'assets.json'),
    loadRecipeFile(recipe.id, 'content.json'),
    loadRecipeFile(recipe.id, 'measurements.json'),
  ]);
  if (designMd === null) throw new Error('Could not read DESIGN.md of this recipe. Is the vault connected?');
  if (assetsJson === null || contentJson === null || measurementsJson === null) {
    throw new Error('This cloned recipe is missing its data files (assets/content/measurements.json). Clone the site again.');
  }
  const refs: { name: string; blob: Blob }[] = [];
  for (const path of recipe.refs) {
    const blob = await fileSystemManager.getFileAsBlob(path);
    if (!blob) throw new Error(`Could not read reference image ${path}. Is the vault connected?`);
    refs.push({ name: path.split('/').pop() ?? path, blob });
  }

  let measured: { desktop?: unknown; mobile?: unknown } = {};
  try {
    measured = JSON.parse(measurementsJson) as typeof measured;
  } catch {
    throw new Error('measurements.json of this recipe is not valid JSON; clone the site again.');
  }
  const desktop = sanitizeMeasurements(measured.desktop);
  let assetCount = 0;
  try {
    const a = JSON.parse(assetsJson) as { assets?: unknown[] };
    assetCount = Array.isArray(a.assets) ? a.assets.length : 0;
  } catch {
    throw new Error('assets.json of this recipe is not valid JSON; clone the site again.');
  }

  const { sections } = parseDesignSpec(designMd).spec;
  const s = (h: string) => sections[h] ?? '';
  return {
    designMd,
    assetsJson,
    contentJson,
    refs,
    context: {
      title: recipe.title,
      sourceUrl: recipe.sourceUrl,
      brief,
      permission,
      hasMobile: !!measured.mobile && refs.length > 1,
      sections: { overview: s('Overview'), pageComposition: s('Page Composition'), siteMap: s('Site Map'), techStack: s('Tech Stack'), responsive: s('Responsive'), motion: s('Motion') },
      outline: desktop.sections.map((x) => ({ index: x.index, tag: x.tag, heading: x.heading })),
      assetCount,
      routes: [...new Set([...desktop.nav, ...desktop.footer].map((l) => l.path))].filter((p) => p !== '/'),
      tech: recipe.clone?.tech ?? desktop.tech,
    },
  };
}

export async function generateProjectDocs(context: CloneDocContext, settings: LLMSettings): Promise<GeneratedDocs> {
  const templates = templateDocs(context);
  try {
    // The user's master role prompt is a chat persona; it has no place in project documents.
    const raw = await collect(streamChat(
      [{ role: 'system', content: buildDocsPrompt(context) }, { role: 'user', content: 'Write the four documents now.' }],
      { ...settings, masterRolePrompt: '' },
    ));
    const written = parseDocs(raw);
    const fromTemplate = PROJECT_DOCS.filter((d) => !written[d]);
    if (fromTemplate.length === PROJECT_DOCS.length) throw new Error('The answer had none of the expected document markers.');
    return { docs: { ...templates, ...written }, fromTemplate };
  } catch (e) {
    return { docs: templates, fromTemplate: [...PROJECT_DOCS], error: e instanceof Error ? e.message : String(e) };
  }
}
