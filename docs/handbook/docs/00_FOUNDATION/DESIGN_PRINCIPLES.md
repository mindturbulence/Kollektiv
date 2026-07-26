# Design Principles

## 1. Local-first and privacy-preserving

Kollektiv should favor local storage, local tooling, and user-controlled files before introducing remote dependencies. The vault and prompt workspace are designed to work even when the user is offline or operating in a restricted environment.

- Rationale: the product is a creative tool, and creators often need to work with sensitive or large local assets.
- Examples: File System Access API vault access, IndexedDB handle persistence, local prompt and media storage.
- Anti-patterns: silently pushing user files to a remote service, or making the app unusable without a cloud backend.

## 2. Progressive disclosure over overload

The interface should expose power without requiring every user to understand every subsystem at once. Advanced features should be reachable, but the default experience should remain understandable.

- Rationale: prompt engineering and generative media already carry enough complexity by themselves.
- Examples: specialized pages for prompts, gallery, composer, and assistant rather than one monolithic editor.
- Anti-patterns: exposing every advanced setting at once without context or guidance.

## 3. Composability over monolithic implementation

The product should break into focused modules that can be tested, evolved, and composed independently. This is especially important for providers, storage adapters, and assistant capabilities.

- Rationale: provider support and storage backends change over time; the architecture should absorb those changes without rewriting the whole app.
- Examples: a provider abstraction layer, a storage manager interface, and modular UI pages.
- Anti-patterns: provider-specific logic spread across unrelated components.

## 4. Resilience and clear failure states

When a provider is down, an API key is invalid, or a file fails to load, the app should surface a clear, actionable message instead of silently failing.

- Rationale: AI workflows are inherently flaky and transient; the experience should stay trustworthy under partial failure.
- Examples: explicit provider warnings, persistent error boundaries, and repair-oriented vault checks.
- Anti-patterns: blank states, vague errors, or forced resets when a smaller recovery path exists.

## 5. Maintainability through explicit conventions

The codebase should remain understandable to future contributors. Naming, state placement, and settings persistence should follow existing patterns rather than introducing one-off shortcuts.

- Rationale: the project is actively evolving, and strong conventions reduce the cost of change.
- Examples: shared settings object, centralized constants, and documented development standards.
- Anti-patterns: ad-hoc state variables, duplicated provider logic, or hidden persistence paths.

## Related

- [VISION.md](VISION.md) — the product goals these principles serve
- [ARCHITECTURE_CONSTITUTION.md](ARCHITECTURE_CONSTITUTION.md) — where these principles are (and aren't yet) fully realized in the current codebase
- [AI_WORKER_RULES.md](../09_AI_WORKER/AI_WORKER_RULES.md) — the concrete, enforced version of principle 5 (maintainability through explicit conventions)
