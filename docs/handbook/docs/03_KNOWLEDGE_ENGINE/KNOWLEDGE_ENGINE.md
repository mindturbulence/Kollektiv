# Knowledge Engine

## Karpathy Lifecycle

The knowledge engine treats the workspace as a living knowledge base. Information is collected from prompts, gallery assets, notes, and interactions, then moved through a lightweight lifecycle of capture, refinement, storage, and retrieval.

## Promotion

Not every artifact is equally valuable. The system should promote useful material into durable knowledge when it has clear signal: repeated patterns, user preferences, successful prompt formulas, or stable metadata relationships.

## Distillation

Distillation compresses raw material into a simpler form that is easier to reuse. This can mean turning a long prompt history into a shorter preference profile or summarizing successful generation attempts into a reusable pattern.

## Knowledge Graph

The knowledge graph is a lightweight conceptual model over prompts, assets, and relationships. It should connect prompts to styles, images to prompts, and notes to outcomes so that the app can surface meaningful associations.

## Retrieval

Retrieval should favor structured local context over broad remote search. The knowledge engine should be able to find related prompts, similar gallery items, or prior project decisions using tags, metadata, and similarity signals when available.

## Metadata

Metadata is the connective tissue of the knowledge engine. Prompt text, model names, asset hashes, timestamps, and user annotations all become part of the retrieval surface.

## Current Repository Alignment

The current implementation aligns with this model through its prompt-library, gallery, notes, and memory stores. The repository already provides the core primitives needed for a lightweight knowledge layer:

- prompt lineage and saved prompt metadata in [../../../types.ts](../../../types.ts)
- note and memory persistence helpers in [../../../utils/notesStorage.ts](../../../utils/notesStorage.ts) and [../../../utils/memoryStorage.ts](../../../utils/memoryStorage.ts)
- gallery metadata and retrieval in [../../../utils/galleryStorage.ts](../../../utils/galleryStorage.ts)
- assistant capability grounding in [../../../services/assistantService.ts](../../../services/assistantService.ts)
