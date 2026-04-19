# Kollektiv.
### Neural Utility Suite & Creative Asset Vault

Kollektiv is a high-performance, local-first application designed for prompt engineers, visual artists, and AI researchers. It synthesizes advanced linguistic refinement with a robust media management system, allowing you to bridge the gap between abstract concepts and production-ready generative artifacts.

---

## ⚡ Core Features

### 1. Neural Workspace
*   **Prompt Crafter**: Build dynamic prompt templates using wildcards, variable substitution, and recursive file scanning.
*   **Prompt Anatomy**: Real-time deconstruction of prompts into thematic components with AI-suggested variations.
*   **Prompt Formula**: Transform raw ideas into structured prompts with customizable presets.
*   **AI Refinement**: Multi-engine support (Gemini 3, Ollama) with configurable temperature and model settings.
*   **Wildcard Tree**: Browse and manage nested prompt templates with folder-based organization.
*   **LLM Status**: Switch between AI engines (Gemini, Ollama cloud, Ollama local) with real-time status indicators.

### 2. The Vault (Local-First Storage)
*   **File System Access**: Direct local file management - no cloud storage, no privacy compromises.
*   **Media Gallery**: Masonry grid for images and videos with metadata persistence.
*   **Prompt Library**: Organize prompt tokens in nested folder hierarchies.
*   **Dashboard Gallery**: Quick access to recent and saved media.

### 3. Creative Utilities
*   **Color Palette Extractor**: Extract chromatic tokens from images.
*   **Image Compare**: Synchronized viewports for pixel-accurate comparison.
*   **Image Resizer**: Batch resize with aspect ratio presets.
*   **Video-to-Frames**: Frame extraction for temporal consistency studies.

### 4. Storyboard AI
*   Sequence narrative nodes for video generation.
*   Translate narrative intent into cinematic prompts for Veo, Luma, Kling.

### 5. Cheatsheets & Reference
*   **Artstyle Library**: Curated art movements and aesthetics.
*   **Artist Reference**: Artists with style descriptions.
*   **Layered Cheatsheets**: Multi-level parameter breakdowns.
*   **Generic Categories**: Customizable reference categories.

---

## 🛠 Tech Stack

*   **Frontend**: React 19, TypeScript, Vite
*   **Styling**: Tailwind CSS, DaisyUI
*   **Animation**: GSAP, Framer Motion
*   **AI**: Google Gemini API, Ollama (REST API)
*   **Storage**: File System Access API, IndexedDB
*   **Utilities**: JSZip, FFmpeg (WASM)

---

## 🚀 Setup & Installation

### Prerequisites
*   [Node.js](https://nodejs.org/) (Latest LTS)
*   Google Gemini API Key (Optional)
*   Ollama (Optional, for local AI)

### Local Development

```bash
git clone https://github.com/mindturbulence/Kollektiv.git
cd Kollektiv
npm install
npm run dev
```

### Environment Variables
Create `.env.local`:
```
GEMINI_API_KEY=your_key
YOUTUBE_CLIENT_ID=your_client_id
```

### Build & Deploy
```bash
npm run build
npm run deploy
```

---

## 🎨 Themes
*   **Abyss**: Deep dark mode for focus
*   **Pip-Boy**: Retro-futuristic CRT
*   **Starfield**: NASAPUNK industrial
*   **Explorer**: Technical grid layout

---

## 📁 Project Structure
```
├── components/       # React components (60+ files)
│   ├── prompts/     # Prompt tools (Crafter, Anatomy, Formula, Refine)
│   ├── gallery/   # Media (Gallery, Card, Viewer)
│   ├── utilities/ # Tools (Compare, Resizer, PaletteExtractor)
│   ├── storyboard/# StoryboardPage
│   └── cheatsheets/# Artstyle, Artist, Generic cheatsheets
├── services/        # AI & business logic (8 services)
├── contexts/       # React contexts (Settings, Auth, Busy)
└── utils/          # Helper utilities
```

---

Developed by **mndtrblnc** | [Civitai](https://civitai.com/user/mndtrblnc) | [Ko-fi](https://ko-fi.com/mindturbulence)