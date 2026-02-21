# Kollektiv.
### Neural Utility Suite & Creative Asset Vault

Kollektiv is a high-performance, local-first application designed for prompt engineers, visual artists, and AI researchers. It synthesizes advanced linguistic refinement with a robust media management system, allowing you to bridge the gap between abstract concepts and production-ready generative artifacts.

---

## ⚡ Core Features

### 1. Neural Workspace
*   **Prompt Crafter**: Build dynamic prompt templates using a deep wildcard system. Supports nesting and recursive file scanning.
*   **AI Refinement**: Multi-engine support (Gemini 3, Ollama Local/Cloud) to transform raw ideas into model-specific formulas (Flux, Midjourney, Video AI, etc.).
*   **Prompt Anatomy**: Real-time deconstruction of prompts into thematic components with AI-suggested variations.
*   **Neural Abstractor**: Extract descriptive tokens directly from uploaded images or video frames.

### 2. The Vault (Local-First Storage)
*   **File System Access**: Directly manages files on your local machine. No cloud storage, no privacy compromises.
*   **Media Gallery**: High-performance masonry grid for archiving images and videos with metadata persistence.
*   **Prompt Library**: Organize thousands of prompt tokens in a nested folder hierarchy.
*   **Neural Integrity**: Automatic manifest repair and database reconstruction tools to keep your archival records healthy.

### 3. Creative Utilities
*   **Grid Composer**: Build professional image grids and contact sheets with custom matting and typography.
*   **Palette Extractor**: Deconstruct visual artifacts into precise chromatic tokens and atmospheric mood data.
*   **Video-to-Frames**: Precision frame extraction and video joining for temporal consistency studies.
*   **Image Compare**: Synchronized viewports for pixel-accurate evaluation of model outputs.

### 4. Storyboard AI
*   Sequence narrative nodes for video generation.
*   Translate narrative intent into cinematic prompts optimized for engines like Google Veo, Luma, and Kling.

---

## 🛠 Tech Stack

*   **Frontend**: React 19, TypeScript, Vite
*   **Styling**: Tailwind CSS, DaisyUI
*   **Animation**: GSAP (GreenSock) for high-fidelity cinematic transitions.
*   **AI Engines**: Google Gemini API (@google/genai), Ollama (REST API)
*   **Storage**: Browser File System Access API, IndexedDB (idb)
*   **Utilities**: JSZip, FFmpeg (WASM), Lottie-web

---

## 🚀 Setup & Installation

### Prerequisites
*   [Node.js](https://nodejs.org/) (Latest LTS)
*   Google Gemini API Key (Optional, for Cloud AI features)
*   Ollama (Optional, for local LLM execution)

### Local Development

1.  **Clone & Install**:
    ```bash
    git clone https://github.com/mindturbulence/Kollektiv.git
    cd Kollektiv
    npm install
    ```

2.  **Environment Configuration**:
    Create a `.env.local` file in the root directory:
    ```env
    GEMINI_API_KEY=your_gemini_api_key_here
    YOUTUBE_CLIENT_ID=your_google_oauth_client_id_here
    ```

3.  **Launch**:
    ```bash
    npm run dev
    ```

### 🔐 Storage Setup
Upon first launch, Kollektiv will prompt you to **Select a Storage Folder**. 
*   This folder acts as your **Vault**.
*   All images, videos, and prompt metadata are stored here as raw files (`.jpg`, `.mp4`, `.json`, `.txt`).
*   **Privacy Note**: Your data never leaves your machine unless you explicitly use the "Publish to YouTube" integration.

---

## 🎨 Theme Support
Kollektiv includes a range of specialized UI environments, including:
*   **Abyss**: Deep dark mode for focus.
*   **Pip-Boy**: Retro-futuristic CRT aesthetic with digital jitter.
*   **Starfield**: NASAPUNK-inspired industrial interface.
*   **Explorer**: Technical research grid layout.

---

Developed by **mndtrblnc** | [Civitai](https://civitai.com/user/mndtrblnc) | [Ko-fi](https://ko-fi.com/mindturbulence)