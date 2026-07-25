/**
 * Research tools for the assistant.
 *
 * All tools require an active research project
 * (Research mode, Findings panel).
 */
import type { AssistantTool } from './types';
import { appEventBus } from '../../utils/eventBus';

export const researchTools: AssistantTool[] = [
  {
    name: 'append_findings',
    description: "Append a note to the active research project's findings.md (Research mode, Findings panel). Use when the user says things like 'note that down as a finding' during a research conversation. No-op error if no research project is currently open.",
    parameters: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Markdown text to append as a new finding.' } },
      required: ['text'],
    },
    execute: async ({ text }) => {
      const { getActiveResearchProject, researchVault } = await import('../researchVaultService');
      const slug = getActiveResearchProject();
      if (!slug) return 'Error: no active research project — the user must open one in Research mode first.';
      const { fileSystemManager } = await import('../../utils/fileUtils');
      if (!fileSystemManager.isDirectorySelected()) return 'Error: no vault folder is connected.';
      await researchVault.findings.append(slug, String(text), fileSystemManager);
      appEventBus.emit('research:findingsAppended', { slug });
      return `Appended to findings.md for research project "${slug}".`;
    },
  },
  {
    name: 'expand_source',
    description: "Fetch the full, untruncated content of a research source that was truncated in your context (marked '[...truncated — use expand_source to read full content]'). Reference it by its citation index (e.g. 2 for [2]) or by file name. No-op error if no research project is currently open.",
    parameters: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'Citation index of the source, e.g. 2 for [2]. Use this or fileName.' },
        fileName: { type: 'string', description: 'Source file name (as shown in the Sources panel). Use this or index.' },
      },
    },
    execute: async ({ index, fileName }) => {
      const { getActiveResearchProject, researchVault } = await import('../researchVaultService');
      const slug = getActiveResearchProject();
      if (!slug) return 'Error: no active research project — the user must open one in Research mode first.';
      const { fileSystemManager } = await import('../../utils/fileUtils');
      if (!fileSystemManager.isDirectorySelected()) return 'Error: no vault folder is connected.';
      let targetFileName = fileName ? String(fileName) : undefined;
      if (!targetFileName && index !== undefined) {
        const project = await researchVault.projects.open(slug, fileSystemManager);
        const src = (project.sourceFiles || [])[Number(index) - 1];
        if (!src) return `Error: no source at index ${index}.`;
        targetFileName = src.path.replace(/^sources\//, '');
      }
      if (!targetFileName) return 'Error: provide either index or fileName.';
      try {
        return await researchVault.sources.readContent(slug, targetFileName, fileSystemManager);
      } catch (e: any) {
        return `Error: ${e?.message || e}`;
      }
    },
  },
];
