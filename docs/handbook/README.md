# Kollektiv.

### Neural Utility Suite & Creative Asset Vault

Kollektiv is a high-performance, local-first application designed for prompt engineers, visual artists, and AI researchers. It combines prompt refinement, media vault management, AI-assisted chat and voice workflows, and a suite of generative-media utilities into a single browser-based workspace.

---

## ⚡ Core Features

### 1. Neural Workspace

- **Prompt Crafter**: Build dynamic prompt templates with a deep wildcard system and reusable prompt structures.
- **AI Refinement & Formula Architecture**: Transform raw ideas into model-specific formulas for image, video, and audio generation.
- **Prompt Anatomy & Formula Deconstruction**: Break prompts into structured semantic components and propose targeted variations.
- **Neural Abstractor**: Extract prompts or visual metadata from uploaded images or video frames through multimodal models.

### 2. The Vault (Local-First Storage)

- **File System Access API**: Work directly with a user-selected local folder for durable, privacy-preserving storage.
- **Media Gallery**: Archive images and videos with persistent metadata, tags, and prompt lineage.
- **Prompt Library**: Organize prompts in a nested, searchable hierarchy.
- **Integrity Tools**: Repair, verify, and maintain vault-backed assets over time.

### 3. Creative Utilities

- **Grid Composer**: Build image grids, contact sheets, and composite layouts.
- **Palette Extractor**: Deconstruct a visual artifact into mood and chromatic tokens.
- **Video Suite**: Extract frames, join clips, and compare outputs across prompts or models.
- **Artifact Comparison**: Compare side-by-side outputs with synchronized views.

## 🛠 Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS 3, DaisyUI
- **Animation**: GSAP and Framer Motion
- **AI Engines**: Google Gemini, Ollama, OpenRouter, llama.cpp, Anthropic
- **Storage**: File System Access API, IndexedDB, optional Google Drive integration
- **Utilities**: FFmpeg.wasm, JSZip, UUID, Lottie

---

## 🧭 Architecture Handbook

The architecture set is organized as a practical handbook for contributors and maintainers:

- [docs/00_FOUNDATION/ARCHITECTURE_CONSTITUTION.md](docs/00_FOUNDATION/ARCHITECTURE_CONSTITUTION.md) — the central architecture constitution and project reference
- [docs/00_FOUNDATION/VISION.md](docs/00_FOUNDATION/VISION.md) — product direction and success criteria
- [docs/00_FOUNDATION/DESIGN_PRINCIPLES.md](docs/00_FOUNDATION/DESIGN_PRINCIPLES.md) — design and engineering principles
- [docs/01_AI_ENGINE/AI_ENGINE.md](docs/01_AI_ENGINE/AI_ENGINE.md) and [docs/01_AI_ENGINE/PLANNER.md](docs/01_AI_ENGINE/PLANNER.md) — AI orchestration and planning flow
- [docs/02_CAPABILITY_PLATFORM/CAPABILITY_SPEC.md](docs/02_CAPABILITY_PLATFORM/CAPABILITY_SPEC.md) — capability contracts and lifecycle
- [docs/03_KNOWLEDGE_ENGINE/KNOWLEDGE_ENGINE.md](docs/03_KNOWLEDGE_ENGINE/KNOWLEDGE_ENGINE.md) and [docs/03_KNOWLEDGE_ENGINE/OBSIDIAN.md](docs/03_KNOWLEDGE_ENGINE/OBSIDIAN.md) — knowledge and note-system integration
- [docs/04_MEMORY/MEMORY_SYSTEM.md](docs/04_MEMORY/MEMORY_SYSTEM.md) — working, long-term, and knowledge memory model
- [docs/05_MCP/MCP_SPEC.md](docs/05_MCP/MCP_SPEC.md) — MCP adapter and tool execution contract
- [docs/06_VOICE/VOICE_PIPELINE.md](docs/06_VOICE/VOICE_PIPELINE.md) — voice capture, planning, streaming, and interruption handling
- [docs/07_PROVIDERS/PROVIDER_ROUTER.md](docs/07_PROVIDERS/PROVIDER_ROUTER.md) — routing, cost, latency, and fallback strategy
- [docs/08_IMPLEMENTATION/DIRECTORY_STRUCTURE.md](docs/08_IMPLEMENTATION/DIRECTORY_STRUCTURE.md) — repository layout and conventions
- [docs/09_AI_WORKER/AI_WORKER_RULES.md](docs/09_AI_WORKER/AI_WORKER_RULES.md) — implementation and review rules
- [docs/10_EXAMPLES/CREATE_CAPABILITY.md](docs/10_EXAMPLES/CREATE_CAPABILITY.md) — example path for adding a new capability
- [contracts/interfaces.md](contracts/interfaces.md) — implementation-facing contracts and data shapes
- [diagrams/README.md](diagrams/README.md) — diagram inventory and architecture views
- [schemas/capability.manifest.json](schemas/capability.manifest.json) — example capability manifest schema

## 🧩 Core Schema

The project can be understood through a small set of recurring concepts:

- Product domain: prompt refinement, media vaulting, assistant workflows, and creative generation
- Runtime layers: presentation, state/storage, AI/provider, server bridge, and vault/media
- Primary entities: prompts, gallery assets, settings, memories, notes, capabilities, and provider connections
- Execution flow: user intent → planning → provider selection → tool or generation execution → persistence or handoff

## 🚀 Setup & Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (Latest LTS)
- [pnpm](https://pnpm.io/) (v11 or later)
- Google Gemini API Key (Required for most neural features)
- Ollama (Optional, for local LLM execution)

### Local Development

1. **Clone & Install**:

   ```bash
   git clone https://github.com/mindturbulence/Kollektiv.git
   cd Kollektiv
   pnpm install
   ```

2. **Environment Configuration**:
   Create a `.env` file in the root directory:

   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

3. **Launch**:

   ```bash
   pnpm dev
   ```

### 🔐 Storage Setup

Upon first launch, Kollektiv will prompt you to establish a local vault connection.

- Select the folder where you want to store your creative assets.
- Privacy note: your data remains under your control and the app requires permission to write files to the selected folder.

---

## 🎨 Theme Support

Kollektiv includes specialized UI environments designed for high-focus creative sessions:

- **MindTurbulence**: high-contrast, neon-cyberpunk interface with sharp geometric accents
- **Pip-Boy**: retro-futuristic CRT aesthetic with digital jitter and terminal typography
- **Abyss**: deep dark mode for absolute focus
- **Explorer**: NASAPUNK-inspired industrial interface for technical research

---

Developed by **mndtrblnc** | [Civitai](https://civitai.com/user/mndtrblnc) | [Ko-fi](https://ko-fi.com/mindturbulence)
