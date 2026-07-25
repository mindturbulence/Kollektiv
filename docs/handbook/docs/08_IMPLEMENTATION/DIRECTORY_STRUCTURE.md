# Directory Structure

## Repository layout

This repository is organized around a single app root rather than a formal monorepo. The implementation lives at the repository root, with feature-oriented folders for UI, services, state, utilities, and constants.

- components/: React UI shell and feature screens
- services/: provider integrations, assistant orchestration, and non-UI logic
- contexts/: shared React state providers
- utils/: helpers, storage, event bus, parsers, and integrity logic
- constants/: defaults, model catalogs, themes, presets, and modifier data
- docs/: architecture notes, plans, and project documentation

## Naming

- React components use PascalCase and live in the components tree.
- Feature logic and helper modules use camelCase file names.
- Shared types and schema-like structures are centralized in types.ts and the constants modules.
- New additions should follow the existing folder shape rather than introducing a second parallel structure.
