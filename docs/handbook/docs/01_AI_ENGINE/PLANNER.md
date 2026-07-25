# Planner

## Intent Detection

The planner interprets the user’s request before execution. It looks at the requested operation, the active modality, and any attached files or modifiers, then classifies the task as prompt refinement, assistant action, media generation, analysis, or retrieval.

## Retrieval Policy

The planner should prefer the most relevant local context first:

1. current prompt and vault metadata
2. conversation history and active notes
3. gallery or prompt-library assets that match the intent
4. remote provider data only when local context is insufficient

This keeps the experience grounded in the user’s own workspace rather than relying purely on remote memory.

## Execution Planning

Plans are deliberately lightweight. A typical job is broken into steps such as context assembly, provider call, response cleanup, and optional persistence. The planner should be explicit about the expected output and any follow-up actions.

## Provider Selection

Provider selection is determined by modality, capability support, cost sensitivity, and latency. For example, text-heavy refinement may use a provider with strong prompt-following behavior, while image workflows may use a provider that explicitly supports visual generation.

## Planning Heuristics

The current app architecture is intentionally simple rather than a full agent scheduler. The planner should therefore favor a small decision tree:

- If the user asks for a prompt transformation, route to the refinement/refactoring path.
- If the user asks to do something in the app, route to the assistant tool loop.
- If the user provides an image or wants visual analysis, route through the multimodal analysis path.
- If the task is purely informational and local context is enough, use the local assistant path and keep the answer concise.

## Output Expectations

The planner should always make the downstream contract explicit:

- what the expected output is
- whether the workflow needs user confirmation
- whether the operation should persist data or simply return a response
- whether the task may require fallback if the preferred provider is unavailable
