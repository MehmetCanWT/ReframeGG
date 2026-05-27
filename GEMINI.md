# ReframeGG

## Project Overview
ReframeGG is a desktop application designed to reframe horizontal videos (like 16:9 gaming footage) into vertical videos (9:16) suitable for platforms like TikTok, YouTube Shorts, and Instagram Reels. 

The application is built using a modern desktop stack:
- **Frontend:** React 19, TypeScript, and Vite.
- **Backend:** Tauri v2 (Rust) for native OS interactions.
- **Core Engine:** FFmpeg (shipped as a binary sidecar or via system path) used for all video processing, cropping, and encoding tasks.

## Architecture
- **React Frontend (`src/`):** 
  - Manages the workspace, layer management (e.g., Gameplay, Facecam), and user interactions.
  - Implements a simulated canvas mapping where users adjust crop areas on a 16:9 monitor view, mapping them to coordinates on a 9:16 target view.
  - Communicates with the Rust backend using Tauri's `invoke` API (e.g., selecting files, rendering video).
- **Rust Backend (`src-tauri/src/`):**
  - Exposes Tauri commands such as `select_video_file`, `get_video_info`, `reframe_video`, and `cancel_render`.
  - `ffmpeg.rs` acts as the FFmpeg bridge. It dynamically constructs complex FFmpeg filter strings (`-filter_complex`) to overlay and scale cropped video streams.
  - Streams FFmpeg progress back to the frontend using Tauri events (`render-progress`).
  - Supports GPU-accelerated encoding (`h264_nvenc`, `vp9_nvenc`) and standard CPU fallback.

## Building and Running

Ensure you have Node.js and the Rust toolchain installed, as well as the Tauri v2 prerequisites.

- **Development:**
  ```bash
  npm run dev
  ```
  *Runs the Vite development server and launches the Tauri window.*

- **Production Build:**
  ```bash
  npm run build
  ```
  *Compiles the TypeScript/Vite frontend and packages the Tauri application.*

- **Tauri CLI:**
  ```bash
  npm run tauri
  ```

## Development Conventions

- **Sidecar Execution:** FFmpeg is treated as an external executable sidecar rather than an FFI library. Ensure changes to FFmpeg arguments handle string parsing safely.
- **Error Handling:** Rust errors are propagated back to the frontend as `String` messages and displayed in the UI. 
- **Type Safety:** The frontend adheres strictly to TypeScript interfaces (e.g., `Layer`, `Rect`, `Preset`), while the backend mirrors these structures using `serde` for serialization. Make sure to keep both sides synchronized.
- **Paths and Assets:** Utilize Tauri's `AppHandle` and the `rfd` crate for native, sandboxed file system access, avoiding raw path manipulations where possible.