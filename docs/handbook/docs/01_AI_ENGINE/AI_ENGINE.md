# AI Engine

## Responsibilities

The AI engine in Kollektiv is the orchestration layer that turns user intent into prompt refinement, assistant responses, and media-generation workflows. Its responsibilities include provider selection, prompt composition, streaming output handling, attachment preprocessing, tool grounding, and feature gating based on the selected model provider.

## Concrete Modules

The engine is centered around the provider-agnostic service layer in the services tree:

- [../../../services/llmService.ts](../../../services/llmService.ts): shared orchestration, prompt formatting, model-specific syntax, and provider dispatch
- [../../../services/geminiService.ts](../../../services/geminiService.ts): Gemini-based text, image, and video flows
- [../../../services/ollamaService.ts](../../../services/ollamaService.ts), [../../../services/openrouterService.ts](../../../services/openrouterService.ts), [../../../services/llamacppService.ts](../../../services/llamacppService.ts), and [../../../services/anthropicService.ts](../../../services/anthropicService.ts): provider-specific adapters
- [../../../services/assistantService.ts](../../../services/assistantService.ts) and [../../../services/assistantTools.ts](../../../services/assistantTools.ts): assistant-style tool execution and tool-grounded conversation

## Execution Pipeline

1. The caller submits a prompt, modifiers, attachments, or a structured intent.
2. The engine resolves the active provider and validates whether the requested capability is supported.
3. It assembles a model-specific prompt, system instructions, and contextual metadata for the selected provider.
4. The request is streamed to the selected provider, either directly or through the assistant tool loop.
5. The response is cleaned, parsed, and handed back to the UI or assistant workflow.
6. Outputs can be persisted into the vault, attached to gallery items, or used by downstream tooling.

## Provider Strategy

The engine should remain provider-agnostic at the feature level while still adapting the prompt structure for each model family. This is why the implementation uses a provider router plus model-specific formatting rules rather than one giant branch per feature.

## Interfaces

Key entry points from the caller’s perspective:

- `streamChat` for conversational responses
- prompt transformation helpers such as refinement, reconstruction, and translation
- image/video/audio generation pass-throughs
- provider capability checks that guard unsupported features

## Failure Modes

The engine must handle:

- provider downtime or timeout
- invalid or expired credentials
- models that do not support a requested modality
- malformed or oversized attachments
- response cleanup failures when reasoning blocks or boilerplate text need to be removed

## Tests

The most valuable tests are unit tests for pure transformation and formatting logic, especially response-cleaning helpers, prompt context builders, and provider selection rules. A smoke-level E2E path should also verify the app can boot and reach the primary dashboard.

## Provider Catalog

The engine supports 6 providers, selected via `LLMSettings.activeLLM`:

| Provider ID | Service module | Notes |
|---|---|---|
| `gemini` | `geminiService.ts` | Text, vision, image generation (Imagen, Nano Banana), video (Veo), Live API. Default. |
| `ollama` | `ollamaService.ts` | Local LLM inference. Also covers `ollama_cloud` (collapsed to ollama by `getActiveProvider()`). |
| `openrouter` | `openrouterService.ts` | Remote API, fetches live model list. |
| `llamacpp` | `llamacppService.ts` | Local llama.cpp server. |
| `anthropic` | `anthropicService.ts` | Remote API, uses server-side proxy. |

### Model syntax profiles

`getModelSyntax(model, isVideo, isAudio)` returns `{format, rules}` per model architecture. The engine maintains ~50 profiles covering:

- **Video:** LTX, Veo, Kling, Runway, Luma, Sora, Wan, Pika, Hailuo/MiniMax, Vidu, CogVideo, Higgsfield, Seedance, Mochi, PixVerse
- **Image:** Flux, Imagen, Midjourney, SDXL, Pony/Illustrious, DALL·E, Ideogram, Seedream, Qwen-Image, Nano Banana, Recraft, Lumina, HiDream
- **Audio:** ElevenLabs, Bark, Suno/Udio, Stable Audio, AudioLDM, Lyria, Mureka, MiniMax, Kokoro, Fish Audio, ACE-Step

Model catalogs live in `constants/models.ts` as `TARGET_IMAGE_AI_MODELS`, `TARGET_VIDEO_AI_MODELS`, `TARGET_AUDIO_AI_MODELS`. Audio is further split into `speech|music|sfx` modes.

## Assistant Tool Catalog

The assistant has ~55 built-in tools defined in `assistantTools.ts` (being extracted into `services/tools/`), each with a JSON-Schema-style definition converted per-provider. Categories:

| Category | Tools | Description |
|---|---|---|
| **App control** | `navigate`, `update_settings` | Move between pages, mutate settings |
| **Prompt library** | `search_prompts`, `save_prompt`, `refine_prompt`, `translate_prompt`, `rewrite_prompt`, `analyze_prompt`, `send_to_refiner`, `save_refiner_preset`, `send_to_crafter`, `send_to_prompt_analyzer`, `list_wildcards`, `generate_crafter_prompt` | Prompt CRUD, transformation, routing |
| **Discovery** | `list_discovery_collections`, `search_discovery_prompts`, `search_cheatsheets` | Browse GitHub/HuggingFace collections |
| **Gallery/media** | `search_gallery`, `get_gallery_item`, `save_to_gallery`, `delete_gallery_item`, `abstract_image`, `generate_image` | Media vault operations + generation |
| **Ideas/notes/memory** | `clip_idea`, `save_note`, `list_notes`, `update_note`, `delete_note`, `remember`, `list_memories`, `forget` | Idea clipping, note CRUD, memory |
| **Web** | `web_search`, `fetch_url`, `open_web_page`, `save_file` | Web access |
| **Browser control** | `browser_click`, `browser_type`, `browser_navigate`, `browser_scroll`, etc. (23 tools) | CDP-based browser automation |
| **Obsidian** | `obsidian_search_notes`, `obsidian_get_note`, `obsidian_write_note`, etc. (12 tools) | Obsidian vault search/read/write |
| **Gmail** | `read_gmail`, `send_gmail`, `delete_gmail` | Google Gmail via OAuth token |
| **Tensor Art** | `tensorart_list_models`, `tensorart_generate` | Remote image generation |
| **Research** | `append_findings`, `expand_source` | Research panel findings management |
| **Spotify** | `spotify_list_playlists`, `spotify_get_playlist_tracks`, `spotify_play` | Music playback |

Tools receive a `ToolContext` carrying `settings` and the current turn's image attachments. The assistant loop runs up to `MAX_TOOL_ROUNDS = 8` iterative turns per user request.
