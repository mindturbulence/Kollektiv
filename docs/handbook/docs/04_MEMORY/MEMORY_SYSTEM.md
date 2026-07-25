# Memory System

## Working Memory

Working memory holds the current task context: the active prompt, the active asset, the current assistant conversation, and any transient user intent from the current session. It is the short-lived substrate for immediate reasoning and tool execution.

## Long-term Memory

Long-term memory stores durable preferences and recurring patterns that should survive beyond a single session. This may include user style preferences, preferred providers, or repeated prompt structure choices that influence future refinement.

## Knowledge Memory

Knowledge memory is the higher-level record of stable facts, successful workflows, and reusable project context. It should support retrieval of related prompts, useful notes, and prior outcomes so that the system improves over time rather than starting from scratch each session.

## Current Repository Alignment

The implementation already supports memory-like behavior through [../../../utils/memoryStorage.ts](../../../utils/memoryStorage.ts) and [../../../utils/notesStorage.ts](../../../utils/notesStorage.ts). These are the natural persistence anchors for future memory retrieval, memory summarization, and cross-session personalization workflows.
