/**
 * Obsidian integration tools for the assistant.
 *
 * Requires the Obsidian vault to be connected via the Obsidian panel.
 * All tools gate on isObsidianConnected() before proceeding.
 */
import {
  isObsidianConnected,
  searchNotes,
  getNote,
  writeNote,
  listNotes,
  listTags,
  appendToNote,
  deleteNoteByPath,
  replaceInNote,
  setFrontmatterKey,
  deleteFrontmatterKey,
  manageTags,
  openNoteInPanel,
} from '../../utils/obsidianStorage';
import type { AssistantTool } from './types';

export const obsidianTools: AssistantTool[] = [
  {
    name: 'obsidian_search_notes',
    description: 'Search all markdown notes in your Obsidian vault by query text. Returns a JSON list of matching notes with paths, titles, and snippets. Use when the user asks you to find a note, search for something, or look something up in their notes.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query text.' },
        maxResults: { type: 'number', description: 'Maximum results (default 20).' },
      },
      required: ['query'],
    },
    execute: async ({ query, maxResults }) => {
      if (!isObsidianConnected()) return 'Error: Obsidian vault is not connected. Ask the user to connect it in Settings > Integrations > Obsidian Second Brain.';
      const results = await searchNotes(String(query), maxResults ? Number(maxResults) : 20);
      if (results.length === 0) return 'No matching notes found.';
      return JSON.stringify(results);
    },
  },
  {
    name: 'obsidian_get_note',
    description: 'Read the full content of a specific note from your Obsidian vault by its path. Returns the note title, tags, frontmatter, and body. Path is relative to vault root (e.g. "projects/ideas.md").',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the note within the vault (e.g. "projects/ideas.md").' },
      },
      required: ['path'],
    },
    execute: async ({ path }) => {
      if (!isObsidianConnected()) return 'Error: Obsidian vault is not connected.';
      const note = await getNote(String(path));
      if (!note) return `Error: Note not found at "${path}".`;
      return JSON.stringify(note);
    },
  },
  {
    name: 'obsidian_write_note',
    description: 'Create or overwrite a note in your Obsidian vault. Include frontmatter in the content if desired (e.g. "---\ntags: [...]\n---\n\n# Title"). Use overwrite=true to replace an existing note.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path (e.g. "projects/new-idea.md").' },
        content: { type: 'string', description: 'Full markdown content.' },
        overwrite: { type: 'boolean', description: 'Overwrite if exists (default false).' },
      },
      required: ['path', 'content'],
    },
    execute: async ({ path, content, overwrite }) => {
      if (!isObsidianConnected()) return 'Error: Obsidian vault is not connected.';
      if (!overwrite) {
        const existing = await getNote(String(path));
        if (existing) return `Error: Note already exists at "${path}". Set overwrite=true to replace.`;
      }
      await writeNote(String(path), String(content));
      return JSON.stringify({ path: String(path), created: true });
    },
  },
  {
    name: 'obsidian_list_notes',
    description: 'List all markdown notes in your Obsidian vault, optionally filtered by a path prefix. Returns JSON array of {path, title}. Useful when the user wants to browse their vault.',
    parameters: {
      type: 'object',
      properties: {
        prefix: { type: 'string', description: 'Optional path prefix filter (e.g. "projects/").' },
      },
    },
    execute: async ({ prefix }) => {
      if (!isObsidianConnected()) return 'Error: Obsidian vault is not connected.';
      const paths = await listNotes(prefix ? String(prefix) : undefined);
      return JSON.stringify(paths.map((p: string) => ({ path: p, title: p.replace(/\.md$/, '').split('/').pop() })));
    },
  },
  {
    name: 'obsidian_list_tags',
    description: 'List all tags used across your Obsidian vault with their frequency counts. Returns JSON array of {tag, count} sorted by most used. Useful for navigation and discovery.',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
      if (!isObsidianConnected()) return 'Error: Obsidian vault is not connected.';
      const tags = await listTags();
      return JSON.stringify(tags);
    },
  },
  {
    name: 'obsidian_append_to_note',
    description: 'Append content to an existing note in your Obsidian vault. If heading is provided, appends after that heading. If the note does not exist, creates it.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the note.' },
        content: { type: 'string', description: 'Content to append.' },
        heading: { type: 'string', description: 'Optional heading to append after (e.g. "References").' },
      },
      required: ['path', 'content'],
    },
    execute: async ({ path, content, heading }) => {
      if (!isObsidianConnected()) return 'Error: Obsidian vault is not connected.';
      await appendToNote(String(path), String(content), heading ? String(heading) : undefined);
      return JSON.stringify({ path: String(path), appended: true });
    },
  },
  {
    name: 'obsidian_delete_note',
    description: 'Permanently delete a note from your Obsidian vault by its path. Use with caution — this cannot be undone.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the note to delete.' },
      },
      required: ['path'],
    },
    execute: async ({ path }) => {
      if (!isObsidianConnected()) return 'Error: Obsidian vault is not connected.';
      await deleteNoteByPath(String(path));
      return JSON.stringify({ deleted: true });
    },
  },
  {
    name: 'obsidian_patch_note',
    description: 'Perform surgical edits on a note: find-and-replace text (supports regex) across the entire note. Use for targeted modifications. Returns whether any replacements were made.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the note.' },
        pattern: { type: 'string', description: 'Text or regex pattern to find.' },
        replacement: { type: 'string', description: 'Replacement text.' },
        isRegex: { type: 'boolean', description: 'Whether pattern is a regex (default false).' },
      },
      required: ['path', 'pattern', 'replacement'],
    },
    execute: async ({ path, pattern, replacement, isRegex }) => {
      if (!isObsidianConnected()) return 'Error: Obsidian vault is not connected.';
      const changed = await replaceInNote(String(path), String(pattern), String(replacement), !!isRegex);
      return changed ? 'Note updated.' : 'No matches found — note unchanged.';
    },
  },
  {
    name: 'obsidian_replace_in_note',
    description: 'Alias for obsidian_patch_note — find-and-replace text across a note.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the note.' },
        pattern: { type: 'string', description: 'Text or regex pattern to find.' },
        replacement: { type: 'string', description: 'Replacement text.' },
        isRegex: { type: 'boolean', description: 'Whether pattern is a regex (default false).' },
      },
      required: ['path', 'pattern', 'replacement'],
    },
    execute: async ({ path, pattern, replacement, isRegex }) => {
      if (!isObsidianConnected()) return 'Error: Obsidian vault is not connected.';
      const changed = await replaceInNote(String(path), String(pattern), String(replacement), !!isRegex);
      return changed ? 'Note updated.' : 'No matches found — note unchanged.';
    },
  },
  {
    name: 'obsidian_manage_frontmatter',
    description: 'Set or delete a frontmatter key in a note. If value is provided, sets the key. If value is omitted/empty, deletes the key. Returns the old and new values.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the note.' },
        key: { type: 'string', description: 'Frontmatter key to set or delete.' },
        value: { type: 'string', description: 'Value to set. Omit to delete the key.' },
      },
      required: ['path', 'key'],
    },
    execute: async ({ path, key, value }) => {
      if (!isObsidianConnected()) return 'Error: Obsidian vault is not connected.';
      const oldFm = await getNote(String(path)).then((n: any) => n?.frontmatter?.[String(key)]);
      if (value !== undefined && value !== null && String(value).trim()) {
        await setFrontmatterKey(String(path), String(key), String(value));
      } else {
        await deleteFrontmatterKey(String(path), String(key));
      }
      return JSON.stringify({ key: String(key), oldValue: oldFm, newValue: value || null });
    },
  },
  {
    name: 'obsidian_manage_tags',
    description: 'Add, remove, or list tags in a note. Use operation "list" to get current tags, "add" to add a tag, "remove" to remove a tag. Returns the updated tags array.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the note.' },
        operation: { type: 'string', enum: ['add', 'remove', 'list'], description: 'What to do.' },
        tag: { type: 'string', description: 'Tag to add/remove (required for add/remove).' },
      },
      required: ['path', 'operation'],
    },
    execute: async ({ path, operation, tag }) => {
      if (!isObsidianConnected()) return 'Error: Obsidian vault is not connected.';
      const op = String(operation) as 'add' | 'remove' | 'list';
      const tags = await manageTags(String(path), op, tag ? String(tag) : undefined);
      return JSON.stringify({ tags });
    },
  },
  {
    name: 'obsidian_open_in_ui',
    description: 'Display a note from your Obsidian vault in the in-app viewer panel. Use when the user asks to see, open, or view a note.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to the note within the vault.' },
      },
      required: ['path'],
    },
    execute: async ({ path }) => {
      const note = await getNote(String(path));
      if (!note) return `Error: Note "${path}" not found.`;
      openNoteInPanel(note);
      return `Opened "${note.title}" in the viewer panel.`;
    },
  },
];
