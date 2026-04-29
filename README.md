# Kollektiv.
### Neural Utility Suite & Creative Asset Vault

Kollektiv is a high-performance, local-first application designed for prompt engineers, visual artists, and AI researchers. It synthesizes advanced linguistic refinement with a robust media management system, allowing you to bridge the gap between abstract concepts and production-ready generative artifacts.

---

## ⚡ Core Features

### 1. Neural Workspace
*   **Prompt Crafter**: Build dynamic prompt templates using a deep wildcard system. Features a high-performance workspace with adaptive layout (25% workspace focus) and template management.
*   **AI Refinement & Formula Architecture**: Multi-engine support powered by Google Gemini and Ollama. Transform raw ideas into model-specific formulas for **Image** (Flux, Midjourney, SDXL, Pony), **Video** (Veo, Luma, Kling, Sora), and **Audio** (Udio, Suno).
*   **Prompt Anatomy & Formula Deconstruction**: Real-time deconstruction of prompts into thematic components (Subject, Style, Technical, Lighting) with AI-suggested variations for targeted adjustments.
*   **Neural Abstractor**: Extract descriptive tokens and visual metadata directly from uploaded images or video frames using multimodal vision models.

### 2. The Vault (Local-First Storage)
*   **File System Access API**: Directly manages files on your local machine. Kollektiv operates as a thin client over your chosen local folder, ensuring 100% data sovereignty.
*   **Media Gallery**: High-performance masonry grid for archiving images and videos with persistent metadata stored via IndexedDB and local JSON sidecars.
*   **Prompt Library**: Organize prompt tokens and templates in a nested, searchable hierarchy.
*   **Neural Integrity**: Advanced maintenance tools for manifest repair, database reconstruction, and file verification to maintain long-term archival health.

### 3. Creative Utilities
*   **Grid Composer**: Build professional image grids and contact sheets with custom matting, typography overlays, and ratio control (1:1, 4:5, 9:16).
*   **Palette Extractor**: Deconstruct visual artifacts into precise chromatic tokens and atmospheric mood data.
*   **Video Suite**: Precision frame extraction (via FFmpeg WASM) and a video joiner for temporal consistency studies and sequence merging.
*   **Artifact Comparison**: Synchronized viewports for pixel-accurate, side-by-side evaluation of model outputs and prompt variations.

## 🛠 Tech Stack

*   **Frontend**: React 19, TypeScript, Vite
*   **Styling**: Tailwind CSS 3, DaisyUI
*   **Animation**: GSAP (GreenSock) & Framer Motion for cinematic UI transitions and micro-interactions.
*   **AI Engines**: Google Gemini API (`@google/genai`), Ollama (Local/Remote)
*   **Storage**: Browser File System Access API, IndexedDB (`idb`)
*   **Utilities**: FFmpeg.wasm, JSZip, UUID, Lottie

---

## 🚀 Setup & Installation

### Prerequisites
*   [Node.js](https://nodejs.org/) (Latest LTS)
*   Google Gemini API Key (Required for Neural features)
*   Ollama (Optional, for local LLM execution)

### Local Development

1.  **Clone & Install**:
    ```bash
    git clone https://github.com/mindturbulence/Kollektiv.git
    cd Kollektiv
    npm install
    ```

2.  **Environment Configuration**:
    Create a `.env` file in the root directory:
    ```env
    GEMINI_API_KEY=your_gemini_api_key_here
    ```

3.  **Launch**:
    ```bash
    npm run dev
    ```

### 🔐 Storage Setup
Upon first launch, Kollektiv will prompt you to **Establish Local Vault Connection**. 
*   Select the folder where you want to store your creative assets.
*   **Privacy Note**: Your data never leaves your machine. The app requires permission to write files to your local folder to maintain the Vault.

---

## 🎨 Theme Support
Kollektiv includes specialized UI environments designed for high-focus creative sessions:
*   **MindTurbulence**: Flagship high-contrast, neon-cyberpunk interface with sharp geometric accents.
*   **Pip-Boy**: Retro-futuristic CRT aesthetic with digital jitter and terminal typography.
*   **Abyss**: Deep dark mode for absolute focus.
*   **Explorer**: NASAPUNK-inspired industrial interface for technical research.

---

Developed by **mndtrblnc** | [Civitai](https://civitai.com/user/mndtrblnc) | [Ko-fi](https://ko-fi.com/mindturbulence)
