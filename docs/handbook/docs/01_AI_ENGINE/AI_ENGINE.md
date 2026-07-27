# AI Engine

## Responsibilities

The AI engine in Kollektiv is the orchestration layer that turns user intent into prompt refinement, assistant responses, and media-generation workflows. Its responsibilities include provider selection, prompt composition, streaming output handling, attachment preprocessing, tool grounding, and feature gating based on the selected model provider.

## Concrete Modules

The engine is centered around the provider-agnostic service layer in the services tree:

- [services/llmService.ts](../../../../services/llmService.ts): shared orchestration, prompt formatting, model-specific syntax, and provider dispatch
- [services/geminiService.ts](../../../../services/geminiService.ts): Gemini-based text, image, and video flows
- [services/ollamaService.ts](../../../../services/ollamaService.ts), [services/openrouterService.ts](../../../../services/openrouterService.ts), [services/llamacppService.ts](../../../../services/llamacppService.ts), and [services/anthropicService.ts](../../../../services/anthropicService.ts): provider-specific adapters
- [services/assistantService.ts](../../../../services/assistantService.ts) and [services/assistantTools.ts](../../../../services/assistantTools.ts): assistant-style tool execution and tool-grounded conversation
- [services/turnManager.ts](../../../../services/turnManager.ts): orchestrates multi-turn assistant conversations with tool execution

## Execution Pipeline

1. The caller submits a prompt, modifiers, attachments, or a structured intent.
2. The engine resolves the active provider (via `getActiveProvider(settings)`) and validates capability support.
3. It assembles a model-specific prompt, system instructions (`AI_ROLES.ENHANCER` / `AI_ROLES.REFINER`), and contextual metadata.
4. The request is streamed to the selected provider, either directly or through the assistant tool loop.
5. The response is cleaned (`cleanLLMResponse` strips reasoning tags, markdown fences, and prefix words), parsed, and handed back.
6. Outputs can be persisted into the vault, attached to gallery items, or used by downstream tooling.

## Provider Strategy

The engine is provider-agnostic at the feature level while adapting prompt structure per model family. Model-specific formatting rules (`constants/modelProfiles.ts`) handle dispatch; the active provider itself is a direct, explicit user choice via `getActiveProvider(settings)` in `services/llmService.ts` (`services/providerRouter.ts`, a cost/latency-aware auto-selection layer, was found built-but-disconnected — a literal stub — in a 2026-07-25 audit and deleted 2026-07-26 rather than wired, since auto-fallback conflicts with the user's explicit provider choice; see ARCHITECTURE_CONSTITUTION.md § Built But Not Wired).

## Interfaces

Key entry points from the caller's perspective:

- `streamChat` for conversational responses (via `services/turnManager.ts`)
- `enhancePromptStream` / `refineSinglePrompt` / `refineSinglePromptStream` for prompt transformation
- `translateToEnglish` / `reconstructFromIntent` / `dissectPrompt` / `generateFocusedVariations` / `replaceComponentInPrompt`
- `generateWithImagen` / `generateWithNanoBanana` / `generateWithVeo` for media generation
- `abstractImage` / `analyzePaletteMood` / `generateArtistDescription` for analysis
- Provider capability checks that guard unsupported features (via `requireProvider`)

## Failure Modes

The engine must handle:
- provider downtime or timeout (graceful error messages)
- invalid or expired credentials (per-provider validation)
- models that do not support a requested modality (`ProviderUnsupportedError`)
- malformed or oversized attachments
- response cleanup failures (`cleanLLMResponse` strips reasoning blocks, boilerplate)

## Tests

- `services/llmService.test.ts` — provider selection, context building, response cleaning
- `services/assistantTools.test.ts` — tool execution (31+ tests)
- `services/assistantProtocol.test.ts` — action parsing protocol

## Provider Catalog

The engine supports 5 providers, selected via `LLMSettings.activeLLM`:

| Provider ID | Service module | Notes |
|---|---|---|
| `gemini` | `geminiService.ts` | Text, vision, image gen (Imagen, Nano Banana), video (Veo), Live API, web search grounding. Default. |
| `ollama` | `ollamaService.ts` | Local LLM. Also covers `ollama_cloud` (collapsed by `getActiveProvider()`). |
| `openrouter` | `openrouterService.ts` | Remote API, fetches live model list via `availableOpenRouterModels`. |
| `llamacpp` | `llamacppService.ts` | Local llama.cpp server with API key auth. |
| `anthropic` | `anthropicService.ts` | Remote API via server-side proxy (`/api/anthropic/chat` on server.ts). Supports API key + subscription modes. |

### Model syntax profiles

`lookupModelProfile(model, isVideo, isAudio)` returns `{format, rules}` from `constants/modelProfiles.ts`. The engine maintains ~50 profiles covering:

- **Image:** Flux (pro/dev/klein), Imagen (3/4), Midjourney (6.1/7/8), Stable Diffusion (3.5/4.0/XL), Pony/Illustrious, Ideogram, Recraft, DALL-E, Seedream, HiDream, Qwen-Image, Lumina, Z-Image, Photoshop, Adobe Firefly, Grok, Janus, Chroma, Playground, HunYuan DiT, WAN Image
- **Video:** LTX, Veo (2/3), Kling, Runway, Luma/Sora, MiniMax/Hailuo, Seedance, WAN, Pika, HunYuan, Vidu, HiDream, CogVideoX, Mochi, PixVerse
- **Audio:** ElevenLabs (TTS/Music), Suno, Udio, Stable Audio, AudioLDM, Bark, MiniMax, Mureka, Lyria, Kokoro, Fish Audio, ACE-Step, MMAudio

## Model & Modality Detection

The engine detects audio sub-modes via `getAudioMode(model)`:
- `music`: ElevenLabs Music, Suno, Udio, Stable Audio, ACE-Step, Lyria, Mureka, MiniMax Music
- `speech`: ElevenLabs TTS, Bark, Kokoro, Fish Audio, MiniMax Speech, Qwen3-TTS
- `sfx`: MMAudio, AudioLDM, AudioBox

Media detection uses `TARGET_IMAGE_AI_MODELS`, `TARGET_VIDEO_AI_MODELS`, and `TARGET_AUDIO_AI_MODELS` (all defined in `constants/models.ts`) to determine modality by matching against the selected target model string.

## AI Roles (Persona System)

The engine builds model-specific system instructions via factory functions:

### ENHANCER role
`AI_ROLES.ENHANCER(model, length, isVideo, isAudio, hasManualCamera, inputType?, modifierCatalog?, masterRole?)`
- Produces a "World-Class Visual Strategist" or "Cinematic Director" or "Audio Producer" persona
- Generates a refined prompt with `---PROMPT_BREAKDOWN---` separator containing structured JSON anatomy
- Adjusts token budget: Short (<40 words), Medium (150-200 words), Long (600+ words)
- Temperature controlled by `modifiers.creativity` (0-100 → 0.0-1.0)

### REFINER role
`AI_ROLES.REFINER(model, isVideo, isAudio, hasManualCamera, inputType?, masterRole?)`
- Lighter persona — "Elite Prompt Refiner and Model Specialist"
- Outputs the refined prompt text only (no breakdown)
- Used by the single-prompt refinement flow

### DECONSTRUCTOR role
`AI_ROLES.DECONSTRUCTOR(wildcards)`
- Converts a prompt into a reusable template with `__wildcard__` placeholders
- Used by the Crafter page

### Media-specific protocols
- **Image:** `IMAGE_GENERATION_WORKFLOW` — 5-step detailed image construction protocol
- **Video:** `VIDEO_MOTION_RULES` — continuous prose with NO timestamps or keyframe labels
- **Audio:** `AUDIO_STRUCTURE_RULES[speech|music|sfx]` — format-specific structure templates
- **I2V:** Tells the model to focus only on motion, not describe static elements

## Assistant Tool Catalog

The assistant has 97 built-in tools (45 defined inline in `services/assistantTools.ts` plus 52 spread in from the category modules below), organized into category-specific modules under `services/tools/`:

### Core tools (in assistantTools.ts)

| Category | Tools | Description |
|---|---|---|
| **App control** | `navigate`, `update_settings` | Move between pages, mutate settings |
| **Media control** | `stop_media`, `get_current_media` | Stop active playback and reset the panel (`stopMedia` bus event); query current playback status (`{ playing: false }` or `{ playing: true, type: "youtube"|"spotify", id, title }` from module-level store). |
| **Prompt library** | `search_prompts`, `save_prompt`, `refine_prompt`, `translate_prompt`, `rewrite_prompt`, `analyze_prompt`, `search_cheatsheets`, `send_to_refiner`, `save_refiner_preset`, `send_to_crafter`, `send_to_prompt_analyzer`, `list_wildcards`, `generate_crafter_prompt` | Prompt CRUD, transformation, routing |
| **Discovery** | `list_discovery_collections`, `search_discovery_prompts` | Browse GitHub/HuggingFace collections |
| **Gallery/media** | `search_gallery`, `get_gallery_item`, `save_to_gallery`, `delete_gallery_item`, `gallery_stats`, `abstract_image`, `generate_image`, `generate_and_ingest` | Media vault operations + generation + compare |
| **Web** | `web_search`, `scrape_url`, `scrape_url_playwright`, `fetch_url`, `open_web_page`, `play_media`, `youtube_search`, `get_weather`, `save_file` | Web access, multi-engine search (free, no API key), page scraping (HTTP + Playwright), file saving. `play_media` classifies URLs: YouTube → center overlay (`playVideo`), Spotify → side panel (`openMediaPanel`), unrecognized → error. |
| **Ideas/notes/memory** | `clip_idea`, `save_note`, `list_notes`, `update_note`, `delete_note`, `remember`, `list_memories`, `forget`, `search_memories`, `knowledge_lifecycle_promote` | Idea clipping, note CRUD, memory, knowledge lifecycle |
| **MCP management** | `list_mcp_servers`, `toggle_mcp_server` | MCP server configuration |
| **Capability introspection** | `capability_search`, `capability_describe`, `capability_execute`, `capability_list`, `capability_health` | MCP architecture capability tools |

`web_search` is free by default (multi-engine scrape via `/api/web-search`: DuckDuckGo + Brave, optionally Exa with `EXA_API_KEY`, no API key required) and only falls back to Gemini Google Search grounding when the free search returns nothing and a Gemini key is configured. The assistant can also specify which engines to use by passing an `engines` array.

**Auto-save to the Assistant Notes panel** — Every web/reach tool (`web_search`, `fetch_url`, `scrape_url`, `scrape_url_playwright`, `open_web_page`, `rss_fetch`, and the other `/api/reach/*`-backed tools) emits its result to the Assistant Notes panel's merged feed (`appEventBus.emit('webSearchResults', …)`) directly from `execute()`, on success, unconditionally — this does **not** depend on the model calling anything afterward. `scrape_url`/`scrape_url_playwright` emit the single fetched page (title, Defuddle-extracted Markdown, author/published/site/image when present). `web_search` emits up to 3 cards: the Defuddle-extracted `fetchedContent` entries when `fetch_content: true` was passed (rich — image/byline included), otherwise the top 3 raw snippets (lightweight, no image). The Gemini last-resort fallback also emits one card (answer + source links). `send_to_web_panel` still exists but is now optional — use it only to post an additional cross-source synthesis beyond what was already auto-saved.

**Auto-fetch mode** — Set `fetch_content=true` to automatically fetch the full page content (as Markdown) of the top 3 search results alongside the title/URL/snippet results. The response includes a `fetchedContent` array with `{url, title, content, excerpt}` for each page. Use this when snippets alone are insufficient to answer the query or when you need the full article text.

Bing is supported as an additional engine but requires Playwright (set `SEARCH_MODE=auto` or `SEARCH_MODE=playwright` to enable). In `request` mode (default), Bing's HTTP endpoint returns a JS shell with no results — it needs a headless browser to render the SERP. The `SEARCH_MODE` env var controls this: `request` (HTTP only), `auto` (try HTTP first, fall back to Playwright), or `playwright` (force Playwright).

**Search engine environment variables:**

| Variable | Default | Purpose |
|---|---|---|
| `DEFAULT_SEARCH_ENGINES` | `duckduckgo,brave` | Default engine set when no explicit `engines` param is passed |
| `ALLOWED_SEARCH_ENGINES` | (all) | Restrict which engines can be invoked at runtime |
| `EXA_API_KEY` | (unset) | Exa search API key; Exa engine is skipped when absent |
| `SEARCH_MODE` | `request` | Controls Bing engine: `request` (HTTP only), `auto` (try HTTP first, fall back to Playwright), `playwright` (force Playwright) |

### Page scraping

Two dedicated scraping tools are available for fetching the full content of any web page:

| Tool | Description | Method | Best for |
|---|---|---|---|
| `scrape_url` | Fetches a URL and returns full clean Markdown content (headings, lists, code blocks preserved) plus metadata | HTTP `fetch()` with retry + exponential backoff + rotating User-Agent, parsed via JSDOM + [Defuddle](https://github.com/kepano/defuddle) (`defuddle/node`) | Most pages — blogs, documentation, articles, landing pages |
| `scrape_url_playwright` | Fetches a URL using a headless Chromium browser and returns the fully rendered content as Markdown plus metadata | Playwright headless browser (`playwright-core`), waits for `networkidle`, then extracts via JSDOM + Defuddle | JavaScript-heavy SPAs (React/Vue/Angular dashboards, modern docs portals, sites where `scrape_url` returns empty content) |

Both tools call server-side endpoints (`/api/scrape-url` and `/api/scrape-url-playwright`) and are rate-limited (60 req/15min). Content is capped at 50,000 characters Markdown. The underlying `scrapeUrl` function (`services/webScraper.ts`) uses Defuddle for extraction — Defuddle handles noise-stripping (nav/footer/aside/ads), thin/empty pages, and metadata extraction (`author`, `published`, `site`, `image`) internally, so there's no separate manual fallback path. `@mozilla/readability` and `turndown` were removed in favor of Defuddle (2026-07-26) since it's a single dependency that does both article extraction and Markdown conversion, plus the metadata Readability didn't provide.

### Dedicated tool modules

| Module | Tools | Description |
|---|---|---|
| `services/tools/browserTools.ts` | `browser_navigate`, `browser_click`, `browser_type`, `browser_scroll`, etc. (21 tools) | CDP-based browser automation |
| `services/tools/obsidianTools.ts` | `obsidian_search_notes`, `obsidian_get_note`, `obsidian_write_note`, etc. (12+ tools) | Obsidian vault access via MCP |
| `services/tools/gmailTools.ts` | `read_gmail`, `send_gmail`, `delete_gmail` | Google Gmail via OAuth token |
| `services/tools/spotifyTools.ts` | `spotify_list_playlists`, `spotify_get_playlist_tracks`, `spotify_play` | Spotify playback. `spotify_play` no longer requires an access token — the embed iframe is public. Auth token still required for `spotify_list_playlists` / `spotify_get_playlist_tracks`. |
| `services/tools/tensorArtTools.ts` | `tensorart_list_models`, `tensorart_generate` | Remote image generation |
| `services/tools/researchTools.ts` | `append_findings`, `expand_source` | Research panel findings management |
| `services/tools/graphTools.ts` | `find_related_knowledge` | Cross-store tag-based relations via `services/relationshipGraph.ts` — finds memories/gallery items/prompts sharing tags with a given item |
| `services/tools/rssTools.ts` | `rss_fetch` | Fetch and parse an RSS/Atom feed (`rss-parser`), via `POST /api/reach/rss`. No API key. |
| `services/tools/githubTools.ts` | `github_get_repo`, `github_search`, `github_get_file` | GitHub REST API v3 via `POST /api/reach/github`. Optional `GITHUB_TOKEN` (60/hr unauthenticated → 5000/hr, shared across all users of this deployment since the route is server-side). |
| `services/tools/exaTools.ts` | `exa_search` | Standalone semantic search via Exa's rich `/search` API (category, date range, domain filters, optional full content), via `POST /api/reach/exa`. Distinct from `web_search`'s built-in Exa engine, which only supports the plain `(query, maxResults)` shape — needs `EXA_API_KEY`. |
| `services/tools/redditTools.ts` | `reddit_fetch` | Subreddit listing, thread + comments, or keyword search via Reddit's public `.json` endpoints (no login/API key), via `POST /api/reach/reddit`. Requires a descriptive `User-Agent` (Reddit 429s generic ones); moderate rate-limit risk from datacenter IPs. |
| `services/tools/youtubeTranscriptTools.ts` | `youtube_get_transcript` | Fetches a video's captions via `POST /api/reach/youtube-transcript`, complementing `youtube_search` (which finds videos but can't read them). Ordered fallback (`services/reachChannels/youtube/`): watch-page caption-track scrape, then the undocumented InnerTube `player` endpoint. **Elevated fragility** — both backends are unversioned and can break without notice; degrades to a clean error, never a crash. |
| `services/tools/twitterTools.ts` | `twitter_get_tweet` | Fetches a single tweet's text/author/metrics/media via `POST /api/reach/twitter` (stricter rate limit than other reach routes). Ordered fallback (`services/reachChannels/twitter/`): the undocumented syndication CDN (rich data), then the public oEmbed endpoint (text + author only). **Highest fragility of any reach channel** — Twitter/X has actively restricted third-party read access since 2023; treat as "works today, may need a fix when it breaks," not durable infrastructure. |

### Tool execution

Tools receive a `ToolContext` carrying `settings` and `attachments`. The assistant loop runs up to `MAX_TOOL_ROUNDS = 8` iterative turns per user request (constant lives in `services/assistantService.ts`, not `assistantTools.ts`). Browser tools require explicit permission via the cursor icon in the header.

`services/relationshipGraph.ts` (entity graph, 52 tests) is now reachable via the `find_related_knowledge` tool below — it was found built-but-disconnected in a 2026-07-25 audit and wired in 2026-07-26. See [ARCHITECTURE_CONSTITUTION.md § Built But Not Wired](../00_FOUNDATION/ARCHITECTURE_CONSTITUTION.md#built-but-not-wired) for the history.

### Tool declarations by provider

- **Gemini:** `geminiToolDeclarations()` — uppercase Type strings, Gemini Schema format
- **Ollama/OpenRouter/llama.cpp:** `ollamaToolDeclarations()` — OpenAI-style function declarations
- **Anthropic:** `fallbackProtocolPrompt()` — `<action>` XML protocol for providers without native function calling

## Response Cleaning

`cleanLLMResponse(text)` applies:
1. Strip `<think>...</think>` and `<thought>...</thought>` reasoning blocks
2. Remove markdown code fences (triple backticks) and inline backticks
3. Strip numbered list prefixes, leading filler words ("Here", "Sure", "Certainly")
4. Remove empty lines and trim whitespace

## Context Building

`buildContextForEnhancer(modifiers, isAudio)` builds an `[Architectural Constraints]` block from the modifier state, covering camera specs, lighting, composition, motion, and audio parameters. `buildMidjourneyParams()` constructs `--ar`, `--s`, `--c`, `--v` etc. flags for Midjourney syntax.

## Related

- [PLANNER.md](PLANNER.md) — how requests are classified and routed before reaching this engine
- [CAPABILITY_SPEC.md](../02_CAPABILITY_PLATFORM/CAPABILITY_SPEC.md) — the assistant tool registry this engine's tool loop executes against
- [VOICE_PIPELINE.md](../06_VOICE/VOICE_PIPELINE.md) — voice input feeds the same planning/tool-loop path described here
- [contracts/interfaces.md](../../contracts/interfaces.md) §3 — the LLM provider and assistant turn contracts in implementation-facing detail
