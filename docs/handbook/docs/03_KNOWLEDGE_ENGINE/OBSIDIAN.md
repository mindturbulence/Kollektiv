# Obsidian Integration

## Sync

The Obsidian integration is a knowledge bridge for notes, project context, and research material. The app should be able to export or mirror selected notes into an Obsidian vault so the user can work across tools without losing project context.

## File Watcher

A file watcher should detect note creation, deletion, and update events so that the workspace remains synchronized with the vault. This is especially important for note-backed workflows and cross-tool knowledge continuity.

## Index

The index layer should track note paths, titles, timestamps, tags, and related artifacts so that retrieval remains fast and predictable even as the vault grows.

## Embeddings

Optional embeddings can enrich knowledge retrieval by making semantic search possible on note content. This should remain optional so that the feature can be enabled or disabled based on environment and privacy preferences.

## Recovery

Recovery logic should handle missing files, partial sync failures, and index drift. If the vault becomes inconsistent, the system should be able to rebuild or repair its local index without losing the underlying note content.

## Current Integration Surface

The repository already contains a dedicated Obsidian bridge in [../../../utils/obsidianStorage.ts](../../../utils/obsidianStorage.ts). That storage layer provides the practical integration surface for reading, writing, searching, patching, and tagging notes, which makes it the natural implementation anchor for any future Obsidian-first knowledge workflows.
