# Capability Specification

## Manifest

Capabilities should be declared with a compact manifest that describes their identifier, purpose, input contract, output contract, provider requirements, and any safety constraints. A manifest makes the capability easier to discover, validate, and reuse across the app.

## Lifecycle

A capability should move through a predictable lifecycle:

1. Define the capability contract.
2. Validate that the current environment can satisfy it.
3. Execute the capability against the selected provider or local tool.
4. Observe the result and surface any failure state clearly.
5. Persist or hand off the output if the workflow requires it.

## SDK

The capability layer should expose a simple SDK-style surface for callers. That surface should be stable enough for prompts, assistant tools, and UI components to invoke the same capability without caring about the underlying implementation.

## Examples

Representative capabilities include:

- prompt refinement
- prompt deconstruction
- image generation and ingestion
- gallery import or comparison
- vault integrity repair
- browser-control actions for the assistant

## Current Implementation Pattern

The current repository uses the assistant tool registry as the practical capability surface. Built-in capabilities are declared in [services/assistantTools.ts](../../../../services/assistantTools.ts), while the shared execution contract lives in [services/tools/types.ts](../../../../services/tools/types.ts). This keeps the UI and assistant flows aligned while allowing MCP-backed tools to plug into the same model-facing contract.

## Tests

Capability tests should cover contract validation, failure handling, and the happy path for each capability. Where the capability depends on a provider, tests should be written around the contract rather than a single backend implementation.

## Related

- [CREATE_CAPABILITY.md](../10_EXAMPLES/CREATE_CAPABILITY.md) — the worked example for adding a new capability following this spec
- [contracts/interfaces.md](../../contracts/interfaces.md) §4 — the concrete `AssistantTool` contract shape and built-in capability examples
- [AI_ENGINE.md](../01_AI_ENGINE/AI_ENGINE.md) — the full assistant tool catalog (~55+ tools) that implements this spec today
