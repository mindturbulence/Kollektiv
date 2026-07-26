# TypeScript Contracts

This document is the implementation-facing contract reference for the Kollektiv architecture. It describes the core data shapes, service interfaces, and orchestration boundaries used by the app today, with references to the concrete files that define or consume them.

## 1. Contract map

The architecture is organized around four major contract families:

- AI engine contracts: prompt refinement, chat, assistant orchestration, and provider routing
- Capability contracts: user-facing capabilities exposed by the system and their execution lifecycle
- Knowledge contracts: prompt, note, memory, and gallery data structures used across the workspace
- Provider contracts: adapter interfaces for browser control, MCP, local storage, and external LLM providers

## 2. Core application contracts

### 2.1 Settings and runtime state

Primary definition: [types.ts](../../../types.ts)

The central runtime contract is the settings object, defined in [types.ts](../../../types.ts). It unifies the app configuration across prompt generation, assistant behavior, provider access, storage preferences, gallery behavior, and theme settings.

Key contract surface:

- LLMSettings: the main configuration object for provider selection, API keys, connection mode, storage settings, and UI preferences
- ActiveTab / ActiveSettingsTab: routing and settings-navigation contract for the shell
- AppError: standard error envelope for UI-facing failures
- PromptModifiers: structured modifier payload consumed by prompt refinement and generation paths
- EnhancementResult: output contract for prompt enhancement flows
- GalleryItem: persisted media artifact contract for the gallery and vault

Why it matters:

- Nearly every feature page and service reads from or writes to this contract.
- The contract is the shared language between the UI layer, storage layer, and LLM layer.

### 2.2 Prompt and gallery domain models

Primary definition: [types.ts](../../../types.ts)

The app operates around a set of domain models that shape prompt versioning, prompt organization, and gallery persistence.

Key contracts:

- PromptVersionNode: lineage information for prompt evolution
- SavedPrompt: persisted prompt document with metadata and lineage
- PromptCategory: folder-like structure for prompt organization
- GalleryItem: generated or imported media artifact with metadata and optional publication fields
- GalleryCategory: gallery taxonomy bucket

These contracts are consumed by:

- [components/PromptsPage.tsx](../../../components/PromptsPage.tsx)
- [components/SavedPrompts.tsx](../../../components/SavedPrompts.tsx)
- [components/ImageGallery.tsx](../../../components/ImageGallery.tsx)
- [utils/promptStorage.ts](../../../utils/promptStorage.ts)
- [utils/galleryStorage.ts](../../../utils/galleryStorage.ts)

## 3. AI engine contracts

### 3.1 LLM provider contract

Primary definition: [services/llmService.ts](../../../services/llmService.ts)

The LLM engine exposes a provider-agnostic orchestration interface built around prompt refinement, prompt generation, and streaming output support.

Important contracts:

- LLMProvider: provider identifier union
- getActiveProvider(settings): resolves the effective provider from the active settings object
- ProviderUnsupportedError: explicit contract for unsupported feature/provider combinations
- getModelSyntax(model, isVideo, isAudio): model-specific formatting contract used to tune the prompt structure

How the contract is used:

- The assistant uses the same provider selection path as human prompt workflows.
- Feature pages such as the crafter/refiner and assistant experience all rely on it indirectly through [services/llmService.ts](../../../services/llmService.ts).

### 3.2 Assistant turn contract

Primary definition: [services/assistantService.ts](../../../services/assistantService.ts)

The assistant loop has a streaming event contract that is consumed by the UI layer.

Core event types:

- text: incremental text chunk from the assistant
- tool_start: tool execution has begun
- tool_result: tool execution returned output
- turn_end: a turn is complete and the assistant can continue or yield control

Supporting contract:

- ChatMsg: message envelope for conversation turns
- AssistantProvider: provider selected for assistant reasoning
- buildSystemIdentity(settings, sourceContext): composes the runtime persona and tool context for the model

Key files involved:

- [services/assistantService.ts](../../../services/assistantService.ts)
- [services/assistantTools.ts](../../../services/assistantTools.ts)
- [services/assistantProtocol.ts](../../../services/assistantProtocol.ts)

This contract is the basis for interactive assistant experiences in the app shell and the live voice integration.

### 3.3 Action protocol contract

Primary definition: [services/assistantProtocol.ts](../../../services/assistantProtocol.ts)

The assistant uses a lightweight `<action>` protocol for providers that do not support native function calling.

Contract shape:

- ActionCall: object containing a tool name and a JSON-serializable args object
- parseActionBlock(text): parses an assistant reply into an executable action
- visibleText(text): ensures the UI only reveals the safe part of a streamed response before the action block is emitted

This is a critical compatibility contract for fallback execution paths.

## 4. Capability contracts

### 4.1 Assistant tool contract

Primary definition: [services/tools/types.ts](../../../services/tools/types.ts)

The assistant tool contract is the most important capability interface in the repository.

Contract shape:

- AssistantTool.name: stable identifier for tool dispatch
- AssistantTool.description: human-readable tool contract for the model
- AssistantTool.parameters: JSON-schema-like parameter contract for tool invocation
- AssistantTool.execute(args, ctx): execution function returning a string result

Context shape:

- ToolContext.settings: current settings snapshot
- ToolContext.attachments: any attachments present on the current chat turn

This contract is implemented by the built-in tool registry in [services/assistantTools.ts](../../../services/assistantTools.ts) and consumed by the assistant service and MCP integration layer.

### 4.2 Built-in capability examples

Primary implementation: [services/assistantTools.ts](../../../services/assistantTools.ts)

Representative capabilities include:

- navigate: moves the user between app pages
- search_prompts: searches the prompt library
- save_prompt: persists a new prompt to the library
- search_gallery: finds gallery assets by content or metadata
- abstract_image: derives a prompt from an attached image
- refine_prompt / translate_prompt / rewrite_prompt: run prompt transformations through the LLM layer
- clip_idea: stores an idea into the app’s clipped-ideas workspace
- update_settings: mutates persistent settings
- browser and media tools: open web pages, play YouTube/Spotify content, and interact with the vault

These capabilities combine UI state changes, persistence, and provider-backed generation. They are the main integration surface for the assistant experience.

### 4.3 Browser operator contract

Primary definition: [services/browserOperator.ts](../../../services/browserOperator.ts)

The browser operator interface defines a uniform control contract for browser automation backends.

Core operations:

- connect / disconnect
- setCaptureSize
- click / doubleClick / rightClick / hover
- type / pressKey
- scroll / scrollTo
- navigate / getUrl
- readContent / readStructure
- captureScreenshot
- optional drag, uploadFile, tab management helpers

Why it matters:

- The assistant can target either an in-app virtual browser or a real CDP-connected browser through the same contract.
- The resolver logic in the browser operator layer chooses the implementation at runtime.

## 5. Knowledge contracts

### 5.1 Vault and file-system contract

Primary definition: [utils/fileUtils.ts](../../../utils/fileUtils.ts)

The vault abstraction is defined by IFileSystemManager, which allows the app to operate against local files, Google Drive-backed files, or a future storage backend with the same interface.

Key methods:

- initialize(settings, auth)
- saveFile / readFile / getFileAsBlob / deleteFile
- listDirectoryContents(path)
- reset / isDirectorySelected / selectAndSetAppDataDirectory / requestExistingPermission
- migrateLocalToDrive / syncDriveToLocal
- calculateTotalSize / scanForKollektivFolder / createKollektivFolder

This contract is a core boundary between the UI and the storage system.

### 5.2 Notes and memory contracts

Primary definitions:

- [utils/notesStorage.ts](../../../utils/notesStorage.ts)
- [utils/memoryStorage.ts](../../../utils/memoryStorage.ts)
- [utils/chatStorage.ts](../../../utils/chatStorage.ts)

These modules define note, memory, and chat persistence contracts used by the assistant and workspace panels.

Representative contract shapes:

- AssistantNote: note content with metadata such as timestamps and title
- MemoryEntry: a memory item that can be recalled or deleted
- ChatMessage / ChatSession: message and session persistence for assistant history

### 5.3 Gallery persistence contract

Primary implementation: [utils/galleryStorage.ts](../../../utils/galleryStorage.ts)

This layer defines how gallery items are loaded, added, updated, and deleted. It is the bridge between the UI gallery experience and the stored artifact metadata in the vault.

## 6. Provider contracts

### 6.1 MCP contract

Primary definition: [services/mcpService.ts](../../../services/mcpService.ts)

The MCP layer exposes a transport-agnostic contract for tools, prompts, and resources.

Contract shapes:

- MCPTool: tool metadata plus input schema
- MCPPrompt: prompt metadata and arguments
- MCPResource: resource URI and metadata

This contract is used by the assistant to discover and invoke MCP-backed capabilities.

### 6.2 Browser control provider contract

Primary definition: [services/externalBrowserService.ts](../../../services/externalBrowserService.ts)

The external browser service is the CDP-facing contract for browser control.

Key methods:

- status / connect / getTargets / selectTarget / disconnect
- click / doubleClick / rightClick / hover
- type / pressKey / scroll / scrollTo
- navigate / readContent / readStructure
- launch / launchStatus / openTab / closeTab / switchTab
- drag / uploadFile

This is the server-side bridge contract that the browser operator layer calls into.

## 7. Contract diagrams

### 7.1 High-level contract flow

```text
User Intent
  -> UI Page / Assistant
  -> LLM Orchestrator / Capability Layer
  -> Provider Router / Tool Registry / MCP Adapter
  -> Storage / Vault / Browser Control / External Service
  -> Response + Persistence
```

### 7.2 Assistant execution flow

```text
AssistantService
  -> buildSystemIdentity()
  -> Provider-specific turn executor
  -> parseActionBlock() / native function-calling path
  -> ToolRegistry.execute()
  -> persistence / UI update / external service
```

### 7.3 Storage boundary

```text
UI Components
  -> Settings / Prompt / Gallery / Notes modules
  -> FileSystemManager / Local DB / Drive adapter
  -> Vault files + sidecar metadata
```

## 8. File inventory for contract ownership

The most important files to review when changing or extending contracts are:

- [types.ts](../../../types.ts) — shared domain contracts and settings model
- [services/llmService.ts](../../../services/llmService.ts) — provider and prompt orchestration contract
- [services/assistantService.ts](../../../services/assistantService.ts) — assistant event and turn contract
- [services/assistantTools.ts](../../../services/assistantTools.ts) — built-in assistant capability registry
- [services/tools/types.ts](../../../services/tools/types.ts) — assistant tool interface contract
- [services/browserOperator.ts](../../../services/browserOperator.ts) — browser automation contract
- [services/externalBrowserService.ts](../../../services/externalBrowserService.ts) — CDP bridge contract
- [services/mcpService.ts](../../../services/mcpService.ts) — MCP tool/resource/protocol contract
- [utils/fileUtils.ts](../../../utils/fileUtils.ts) — vault and storage abstraction contract
- [utils/notesStorage.ts](../../../utils/notesStorage.ts), [utils/memoryStorage.ts](../../../utils/memoryStorage.ts), [utils/galleryStorage.ts](../../../utils/galleryStorage.ts) — persistence contracts

## 9. Guidance for extending contracts

When adding a new capability or changing a contract:

1. Update the shared domain types first if the change affects multiple layers.
2. Keep the contract narrow and explicit rather than embedding UI decisions in the core interface.
3. Preserve backward compatibility where possible or document the migration path.
4. Update the implementation and any dependent UI or service module in the same change.
5. Add tests for the contract boundary where practical, especially around parsing, persistence, and provider fallback.

## 10. Related handbook docs

- [CAPABILITY_SPEC.md](../docs/02_CAPABILITY_PLATFORM/CAPABILITY_SPEC.md) — the prose-level lifecycle these contracts implement
- [AI_ENGINE.md](../docs/01_AI_ENGINE/AI_ENGINE.md) — the execution pipeline and provider catalog behind §3
- [MCP_SPEC.md](../docs/05_MCP/MCP_SPEC.md) — the MCP tool/resource contract behind §6.1
- [diagrams/README.md](../diagrams/README.md) — where the §7 ASCII flows above are meant to become real diagrams
