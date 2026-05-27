# ReframeGG 🎬

ReframeGG is a powerful, locally-hosted desktop application designed to reframe horizontal (16:9) video content into vertical (9:16) formats suitable for TikTok, YouTube Shorts, and Instagram Reels. 

By leveraging the power of **Tauri**, **React**, and **FFmpeg**, it provides a high-performance, pixel-perfect, and ultra-fast rendering experience directly on your machine—complete with hardware acceleration (NVENC).

![ReframeGG Workspace](https://via.placeholder.com/1000x500.png?text=ReframeGG+Workspace+Screenshot)

## 🌟 Key Features

*   **Freeform Masking:** Not just squares and circles! Draw completely custom polygonal masks to extract any shape you want.
*   **Zero-Stutter Canvas Previews:** Experience real-time playback and pixel-perfect cropping overlays using native HTML5 Canvas `requestAnimationFrame`—no heavy re-renders or bloated memory usage.
*   **Hardware Accelerated:** Seamlessly hooks into FFmpeg with GPU acceleration (`h264_nvenc`, `vp9_nvenc`) for blazing-fast exports.
*   **Multi-Language (i18n):** Native support for English and Turkish.
*   **Preset Management:** Comes with built-in game presets (Valorant, CS2, Apex) and allows you to build, save, and persist your custom layouts locally.
*   **Local Processing:** 100% private. Your videos never leave your local machine.

## 🚀 Getting Started

### Prerequisites
1.  **Node.js** (v18+ recommended)
2.  **Rust Toolchain** (latest stable)
3.  **FFmpeg** (Ensure FFmpeg is installed and added to your System PATH or placed inside `src-tauri/binaries/`).
4.  **Tauri Prerequisites** depending on your OS (e.g., MSVC C++ build tools for Windows).

### Installation

Clone the repository and install the frontend dependencies:

```bash
git clone https://github.com/yourusername/reframegg.git
cd reframegg
npm install
```

### Development

To start the development server and the Tauri window simultaneously:

```bash
npm run dev
```

### Building for Production

To compile the TypeScript/React frontend and package the Tauri Rust application into an installer/executable:

```bash
npm run build
```

## 🛠 Architecture

*   **Frontend (`src/`):** React 19 + TypeScript + Vite. Manages the intuitive design editor, canvas projections, and local storage state.
*   **Backend (`src-tauri/src/`):** Tauri v2 (Rust). Handles file system picking via `rfd` and acts as the bridge for spawning complex `FFmpeg` shell processes.
*   **FFmpeg Engine:** Dynamically constructs `-filter_complex` graphs to slice, blur, mask, and overlay streams in one pass.

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.
