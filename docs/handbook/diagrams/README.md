# Diagrams

The architecture set should eventually include a small, maintained set of diagrams that mirror the implementation structure and the major runtime flows.

## Available diagrams

| Diagram | File | Description |
|---------|------|-------------|
| MCP CI Pipeline | [mcp-ci-pipeline.md](mcp-ci-pipeline.md) | CI pipeline flow for MCP config validation: commit → lint → validate config → test → build → merge. Mermaid flowchart with gates for each step.

## Suggested diagram set (future work)

- System: a high-level view of the UI shell, services, storage layer, and provider bridge
- Sequence: assistant turn execution, prompt refinement flow, and vault persistence flow
- State: settings and app-state transitions, including provider selection and storage mode changes
- Deployment: local-first browser runtime plus optional local bridge/server services

## Current documentation alignment

The current docs already describe the major flows in prose. The next step is to convert those into concrete diagrams in this folder as the architecture evolves.

## Related

- [MCP_SPEC.md](../docs/05_MCP/MCP_SPEC.md#ci-pipeline--validation-gates) — the CI pipeline and validation gates that `mcp-ci-pipeline.md` visualizes
- [contracts/interfaces.md](../contracts/interfaces.md) §7 — ASCII-form contract flow and assistant execution flow diagrams; the closest thing to the diagrams described above until real ones land here
- [ARCHITECTURE_CONSTITUTION.md](../docs/00_FOUNDATION/ARCHITECTURE_CONSTITUTION.md) — the system overview these diagrams would visualize
