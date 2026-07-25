# Diagrams

The architecture set should eventually include a small, maintained set of diagrams that mirror the implementation structure and the major runtime flows.

## Suggested diagram set

- System: a high-level view of the UI shell, services, storage layer, and provider bridge
- Sequence: assistant turn execution, prompt refinement flow, and vault persistence flow
- State: settings and app-state transitions, including provider selection and storage mode changes
- Deployment: local-first browser runtime plus optional local bridge/server services

## Current documentation alignment

The current docs already describe the major flows in prose. The next step is to convert those into concrete diagrams in this folder as the architecture evolves.
