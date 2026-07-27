# Tools Inventory

Complete inventory of all native assistant tools available in the Kollektiv app.

> **Source directory:** `services/tools/*.ts` (per-category tool modules) and `services/assistantTools.ts` (inline definitions + concatenation of all modules into `ASSISTANT_TOOLS`).
> **Type definition:** `services/tools/types.ts` → `AssistantTool` interface.
> **Total tools:** ~100 (verified by `mcp-config.json` validation)

---

## Core App Tools (defined inline in `services/assistantTools.ts`)

### Navigation & Discovery (8 tools)

| Tool | Description |
|------|-------------|
| `navigate` | Navigate the app to a different page/tab |
| `search_prompts` | Search saved prompt library by title or content |
| `save_prompt` | Save a new prompt into the prompt library |
| `search_gallery` | Search media gallery by title, tags, notes, or prompt |
| `abstract_image` | Reverse-engineer a generation prompt from an attached image |
| `search_cheatsheets` | Search style/technique cheatsheets |
| `list_discovery_collections` | List online prompt-discovery collections |
| `search_discovery_prompts` | Fetch prompts from a discovery collection |

### Prompt Engineering (11 tools)

| Tool | Description |
|------|-------------|
| `refine_prompt` | Run raw idea through the Kollektiv refiner engine |
| `translate_prompt` | Translate prompt text to English |
| `rewrite_prompt` | Rewrite/polish prompt text for clarity and detail |
| `clip_idea` | Save text to the Clipped Ideas panel |
| `send_to_refiner` | Open the Refiner page with pre-loaded prompt |
| `save_refiner_preset` | Analyze prompt into structured modifier format and save as preset |
| `send_to_crafter` | Open the Crafter page with idea text appended |
| `list_wildcards` | List Crafter __wildcard__ tokens grouped by category |
| `generate_crafter_prompt` | Resolve wildcards and run through AI polish pipeline |
| `send_to_prompt_analyzer` | Open Prompt Analyzer with pre-loaded prompt |
| `analyze_prompt` | Dissect a prompt into components |

### Web & Media (11 tools)

| Tool | Description |
|------|-------------|
| `web_search` | Search the live web via multiple engines |
| `get_weather` | Get current weather for a city |
| `fetch_url` | Fetch a web page by URL and return readable text |
| `scrape_url` | Fetch URL with full readability extraction (~50k chars) |
| `scrape_url_playwright` | Fetch JS-heavy URL using headless Playwright browser |
| `open_web_page` | Fetch web page and return readable content |
| `send_to_web_panel` | Post custom markdown to the Assistant Notes panel |
| `play_media` | Open YouTube/Spotify URL in the Media Panel |
| `stop_media` | Stop any currently playing media |
| `get_current_media` | Check what media is currently playing |
| `youtube_search` | Search YouTube for videos |

### File & Notes (5 tools)

| Tool | Description |
|------|-------------|
| `save_file` | Save text file to vault under `assistant/` folder |
| `save_note` | Save a note to the Notes panel |
| `list_notes` | List notes in the Notes panel |
| `update_note` | Revise an existing note |
| `delete_note` | Delete a note by id |

### Memory & Knowledge (5 tools)

| Tool | Description |
|------|-------------|
| `remember` | Permanently remember a fact about the user |
| `list_memories` | List all remembered facts |
| `forget` | Delete a remembered fact by id |
| `search_memories` | Search persistent memories by text/category |
| `knowledge_lifecycle_promote` | Move knowledge item between lifecycle stages |

### Generation (2 tools)

| Tool | Description |
|------|-------------|
| `generate_image` | Generate image/video via Imagen, Nano Banana, or Veo |
| `generate_and_ingest` | Full generate loop: refine → render → save to gallery |

### Settings & MCP (3 tools)

| Tool | Description |
|------|-------------|
| `update_settings` | Update one or more app settings |
| `list_mcp_servers` | List MCP server configurations |
| `toggle_mcp_server` | Turn a predefined MCP server on/off |

### Gallery (3 tools)

| Tool | Description |
|------|-------------|
| `get_gallery_item` | Get full details of a gallery item by id |
| `delete_gallery_item` | Delete a gallery item by id |
| `save_to_gallery` | Save note/prompt/media reference to gallery |

### Capability Architecture (5 tools)

| Tool | Description |
|------|-------------|
| `capability_search` | Search registered capabilities by keyword |
| `capability_describe` | Get full contract details for a capability |
| `capability_execute` | Execute a capability by id with args |
| `capability_list` | List all registered capabilities |
| `capability_health` | Check health status of capabilities |

---

## Per-Category Tool Modules

### Browser Tools (`services/tools/browserTools.ts`) — 21 tools

| Tool | Description |
|------|-------------|
| `browser_click_element` | Click a UI element by its data-ai-id |
| `browser_select_option` | Pick an option in a native `<select>` dropdown |
| `browser_click` | Click at pixel coordinates on the screen image |
| `browser_double_click` | Double-click at pixel coordinates |
| `browser_right_click` | Right-click at pixel coordinates |
| `browser_hover` | Hover mouse at a position |
| `browser_type` | Type text into the focused input field |
| `browser_press_key` | Press a named key or key combination |
| `browser_scroll` | Scroll the page by a factor |
| `browser_scroll_to` | Scroll to a specific position |
| `browser_get_url` | Get the current page URL |
| `browser_read_page` | Read visible text from the current page |
| `browser_read_structure` | Scan page and list interactive elements with data-ai-id |
| `browser_navigate` | Navigate browser to a URL |
| `browser_list_tabs` | List open tabs (CDP only) |
| `browser_new_tab` | Open a new tab (CDP only) |
| `browser_switch_tab` | Switch to a different tab (CDP only) |
| `browser_close_tab` | Close a tab (CDP only) |
| `browser_drag` | Drag mouse from one position to another (CDP only) |
| `browser_upload_file` | Upload a file to a file input (CDP only) |
| `browser_complete_task` | Complete a multi-step browser task autonomously |

### Gmail Tools (`services/tools/gmailTools.ts`) — 3 tools

| Tool | Description |
|------|-------------|
| `read_gmail` | Read Gmail inbox — list, search, or read full email |
| `send_gmail` | Send an email from the connected Gmail account |
| `delete_gmail` | Trash or permanently delete a Gmail message |

### Spotify Tools (`services/tools/spotifyTools.ts`) — 3 tools

| Tool | Description |
|------|-------------|
| `spotify_list_playlists` | List authenticated user's Spotify playlists |
| `spotify_get_playlist_tracks` | Get tracks from a Spotify playlist |
| `spotify_play` | Play a Spotify track/album/playlist in the Media Panel |

### Obsidian Vault Tools (`services/tools/obsidianTools.ts`) — 12 tools

| Tool | Description |
|------|-------------|
| `obsidian_search_notes` | Search vault notes by query text |
| `obsidian_get_note` | Read full content of a specific vault note by path |
| `obsidian_write_note` | Create or overwrite a vault note (with overwrite flag) |
| `obsidian_list_notes` | List markdown notes in the vault, optionally filtered by prefix |
| `obsidian_list_tags` | List all unique tags across vault notes with frequency counts |
| `obsidian_append_to_note` | Append content to an existing note, optionally after a heading |
| `obsidian_delete_note` | Permanently delete a vault note by path |
| `obsidian_patch_note` | Find-and-replace text in a note (supports regex) |
| `obsidian_replace_in_note` | Alias for `obsidian_patch_note` |
| `obsidian_manage_frontmatter` | Set or delete a frontmatter key in a note |
| `obsidian_manage_tags` | Add, remove, or list tags in a note |
| `obsidian_open_in_ui` | Display a vault note in the in-app viewer panel |

> **Note:** `obsidian_read_note` was renamed to `obsidian_get_note`. `obsidian_list_files` was replaced by `obsidian_list_notes`. 5 new tools were added: `obsidian_append_to_note`, `obsidian_patch_note`, `obsidian_replace_in_note`, `obsidian_manage_frontmatter`, `obsidian_manage_tags`, and `obsidian_open_in_ui`.

### Research Tools (`services/tools/researchTools.ts`) — 2 tools

| Tool | Description |
|------|-------------|
| `append_findings` | Append a finding to the active research project |
| `expand_source` | Fetch full untruncated content of a research source |

### GitHub Tools (`services/tools/githubTools.ts`) — 3 tools

| Tool | Description |
|------|-------------|
| `github_get_repo` | Get metadata for a GitHub repository |
| `github_search` | Search GitHub for repos, code, or issues/PRs |
| `github_get_file` | Fetch raw content of a file from a repo |

### Web Integration Tools

| Tool | Description | Source File |
|------|-------------|-------------|
| `rss_fetch` | Fetch and parse an RSS/Atom feed URL | `services/tools/rssTools.ts` |
| `exa_search` | Semantic web search via Exa with filters | `services/tools/exaTools.ts` |
| `reddit_fetch` | Fetch Reddit data (subreddit, thread, search) | `services/tools/redditTools.ts` |
| `youtube_get_transcript` | Fetch YouTube video transcript/captions | `services/tools/youtubeTranscriptTools.ts` |
| `twitter_get_tweet` | Fetch a tweet by ID or URL | `services/tools/twitterTools.ts` |

### Knowledge Graph Tools (`services/tools/graphTools.ts`) — 1 tool

| Tool | Description |
|------|-------------|
| `find_related_knowledge` | Find items sharing tags across memory/gallery/prompt stores |

### Tensor Art Tools (`services/tools/tensorArtTools.ts`) — 2 tools

| Tool | Description |
|------|-------------|
| `tensorart_list_models` | List available Tensor Art models with costs |
| `tensorart_generate` | Generate image/video using a Tensor Art model |

---

## Architecture Summary

```
services/
├── assistantTools.ts           ← Single point of assembly: concatenates ALL tools
│   └── ASSISTANT_TOOLS[]       ← ~100 tools, the canonical array
├── tools/
│   ├── types.ts                ← AssistantTool + ToolContext interfaces
│   ├── browserTools.ts         ← 21 browser control tools
│   ├── obsidianTools.ts        ← 12 vault tools
│   ├── gmailTools.ts           ← 3 Gmail tools
│   ├── spotifyTools.ts         ← 3 Spotify tools
│   ├── tensorArtTools.ts       ← 2 Tensor Art tools
│   ├── researchTools.ts        ← 2 research tools
│   ├── graphTools.ts           ← 1 knowledge graph tool
│   ├── rssTools.ts             ← 1 RSS tool
│   ├── githubTools.ts          ← 3 GitHub tools
│   ├── exaTools.ts             ← 1 Exa search tool
│   ├── redditTools.ts          ← 1 Reddit tool
│   ├── youtubeTranscriptTools.ts ← 1 transcript tool
│   └── twitterTools.ts         ← 1 Twitter/X tool
└── capabilityRegistry.ts       ← Layer 1: capability definitions (40+ capabilities)
```

## MCP Integration

Native tools ARE exposed via MCP protocol. All ~100 tools are registered with the built-in Kollektiv MCP server (`services/kollektivMcp.ts`, port 3012) via `mcp-config.json`. Server-side executors are wired for weather, GitHub, RSS, Exa, Reddit, YouTube transcripts, Twitter/X, URL scraping, and web search tools. See [docs/mcp-tools.md](mcp-tools.md) for details.
