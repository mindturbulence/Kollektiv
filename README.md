# Kollektiv.
### Precision Tools for Creative Minds

Kollektiv is a high-performance, local-first application designed for prompt engineers, visual artists, and AI researchers. It synthesizes advanced linguistic refinement with a robust media management system, allowing you to bridge the gap between abstract concepts and production-ready generative artifacts.

---

## ⚡ Core Features

### 1. Neural Workspace
*   **Prompt Builder**: Build dynamic prompt templates using a deep wildcard system with template management.
*   **AI Refiner**: Multi-engine support powered by Google Gemini and Ollama. Transform raw ideas into model-specific formulas for **Image** (Flux, Midjourney, SDXL, Pony), **Video** (Veo, Luma, Kling, Sora), and **Audio** (Udio, Suno).
*   **Prompt Analyzer**: Real-time deconstruction of prompts into thematic components with AI-suggested variations.
*   **Media Analyzer**: Extract descriptive tokens and visual metadata directly from uploaded images or video frames using multimodal vision models.

### 2. The Vault (Local-First Storage)
*   **File System Access API**: Directly manages files on your local machine. Kollektiv operates as a thin client over your chosen local folder, ensuring 100% data sovereignty.
*   **Media Gallery**: High-performance masonry grid for archiving images and videos.
*   **Prompt Library**: Organize prompt tokens and templates in a nested, searchable hierarchy.
*   **Integrity Tools**: Maintenance tools for manifest repair, database reconstruction, and file verification.

### 3. Creative Utilities
*   **Image Compare**: Synchronized viewports for pixel-accurate, side-by-side evaluation.
*   **Palette Extractor**: Deconstruct visual artifacts into chromatic tokens.
*   **Video Suite**: Frame extraction and video processing utilities.
*   **Image Resizer**: Batch resize with quality control.

---

## 🛠 Tech Stack

*   **Frontend**: React 19, TypeScript, Vite
*   **Styling**: Tailwind CSS, DaisyUI
*   **Animation**: GSAP & Framer Motion
*   **AI Engines**: Google Gemini API, Ollama (Local/Cloud)
*   **Storage**: Browser File System Access API, IndexedDB
*   **Utilities**: FFmpeg.wasm, JSZip, UUID

---

## 🚀 Setup & Installation

### Prerequisites
*   [Node.js](https://nodejs.org/) (Latest LTS)
*   Google Gemini API Key (Required for AI features)
*   Ollama (Optional, for local LLM)

### Local Development

1.  **Clone & Install**:
    ```bash
    git clone https://github.com/mindturbulence/Kollektiv.git
    cd Kollektiv
    npm install
    ```

2.  **Environment Configuration**:
    Create a `.env` file in the root:
    ```env
    GEMINI_API_KEY=your_gemini_api_key_here
    ```

3.  **Launch**:
    ```bash
    npm run dev
    ```

### 🔐 Storage Setup
Upon first launch, Kollektiv will prompt you to **Establish Local Vault Connection**.
*   Select your creative assets folder.
*   **Privacy**: Your data never leaves your machine.

---

## 🎨 Theme Support

Available themes:
*   **MindTurbulence**: Flagship neon-cyberpunk interface.
*   **Pip-Boy**: Retro CRT aesthetic.
*   **Abyss**: Deep dark mode.
*   **Explorer**: Industrial interface.

---

Developed by **MINDTURBULENCE'S** | [Civitai](https://civitai.com/user/mndtrblnc) | [Ko-fi](https://ko-fi.com/mindturbulence)