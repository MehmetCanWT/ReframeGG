# ReframeGG 🎬

ReframeGG is a powerful, locally-hosted desktop application designed to reframe horizontal (16:9) video content into vertical (9:16) formats suitable for TikTok, YouTube Shorts, and Instagram Reels.

## Project Overview

- **Technologies**: React 19, TypeScript, Vite, Tailwind CSS v4, Tauri v2 (Rust), FFmpeg.
- **Architecture**:
    - **Frontend (`src/`)**: A React-based video compositor. It uses HTML5 Canvas for real-time previews and `@xyflow/react` for potential future flow-based editing (currently used for UI).
    - **Backend (`src-tauri/src/`)**: A Tauri Rust application that handles file system operations and manages the FFmpeg lifecycle.
    - **Processing**: FFmpeg is bundled as a sidecar (on Windows) or used from the system path to perform complex video filtering, masking, and encoding with hardware acceleration (NVENC).

## Building and Running

### Prerequisites
- **Node.js**: v18+
- **Rust**: Latest stable toolchain.
- **FFmpeg**: Must be available in the system PATH or placed in `src-tauri/binaries/` (specifically `ffmpeg-x86_64-pc-windows-msvc.exe` for Windows).

### Key Commands
- `npm install`: Install frontend dependencies.
- `npm run dev`: Starts the Vite development server and launches the Tauri window.
- `npm run build`: Builds the production-ready installer/executable.
- `npm run preview`: Previews the built frontend.

## Development Conventions

### Frontend
- **Framework**: React 19 with Functional Components and Hooks.
- **Styling**: Tailwind CSS v4 (via `@tailwindcss/vite`).
- **State Management**: React `useState` and `useRef` for real-time canvas management. Persistent settings (like custom presets) are stored in `localStorage`.
- **Canvas Rendering**: High-performance 60 FPS previews using `requestAnimationFrame` and offscreen canvas caching in `FlowEditor.tsx`.

### Backend (Tauri/Rust)
- **Commands**: Defined in `src-tauri/src/lib.rs` and exposed to the frontend via `invoke`.
- **FFmpeg Integration**: Logic resides in `src-tauri/src/ffmpeg.rs`. It constructs complex `-filter_complex` strings for multi-layer compositing.
- **Progress Tracking**: FFmpeg's `-progress pipe:1` is used to stream real-time progress back to the frontend via Tauri events.

### Project Structure
- `src/components/`: Core UI components like `FlowEditor`, `SourceSelector`, and `VideoScrubber`.
- `src/presets.ts`: Built-in game presets (Valorant, CS2, etc.) and types for layers/masks.
- `src-tauri/binaries/`: Location for FFmpeg sidecars.
- `src-tauri/src/ffmpeg.rs`: The "heart" of the video processing engine.

## Key Features to Remember
- **Freeform Masking**: Users can draw custom polygonal masks which are converted to PNGs and passed to FFmpeg's `alphamerge` filter.
- **GPU Acceleration**: Defaults to `h264_nvenc` or `vp9_nvenc` if `use_gpu` is true.
- **Blur Background**: Automatically handles blurred background scaling to fill the 9:16 frame.
- **Game Detection**: Automatically suggests presets based on filename (e.g., "valorant", "cs2").
