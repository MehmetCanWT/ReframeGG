
<div align="center">

<br/>

<center>
<pre>
██████╗ ███████╗███████╗██████╗  █████╗ ███╗   ███╗███████╗ ██████╗  ██████╗ 
██╔══██╗██╔════╝██╔════╝██╔══██╗██╔══██╗████╗ ████║██╔════╝ ██╔════╝ ██╔════╝ 
██████╔╝█████╗  █████╗  ██████╔╝███████║██╔████╔██║█████╗  ██║  ███╗██║  ███╗
██╔══██╗██╔══╝  ██╔══╝  ██╔══██╗██╔══██║██║╚██╔╝██║██╔══╝  ██║   ██║██║   ██║
██║  ██║███████╗██║     ██║  ██║██║  ██║██║ ╚═╝ ██║███████╗╚██████╔╝╚██████╔╝
╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝ ╚═════╝  ╚═════╝ 
</pre>
</center>

### *Transform Horizontal Video into Viral Vertical Content — Locally, Instantly.*

<br/>

[![React](https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-0f172a?style=for-the-badge&logo=tailwindcss&logoColor=38bdf8)](https://tailwindcss.com)
[![Tauri v2](https://img.shields.io/badge/Tauri-v2-ffc131?style=for-the-badge&logo=tauri&logoColor=black)](https://tauri.app)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-Engine-007acc?style=for-the-badge&logo=ffmpeg&logoColor=white)](https://ffmpeg.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

<br/>

<p>
  <a href="#-early-access-warning">⚠️ Warning</a> &nbsp;·&nbsp;
  <a href="#-introduction">Intro</a> &nbsp;·&nbsp;
  <a href="#-key-features">Features</a> &nbsp;·&nbsp;
  <a href="#-architecture">Architecture</a> &nbsp;·&nbsp;
  <a href="#-getting-started">Getting Started</a> &nbsp;·&nbsp;
  <a href="#-development">Development</a> &nbsp;·&nbsp;
  <a href="#-custom-presets">Presets</a>
</p>

<br/>

### 📢 Latest Updates (v0.1.2)
- 🖥️ **Custom Frameless Titlebar**: Outdated OS borders have been replaced with a premium, sleek custom application header with full window dragging and custom minimize, maximize, and close controls.
- ⚙️ **Interactive Render Settings**: Export button now opens a high-fidelity dropdown/selection modal to customize output resolution (Portrait 1080p, Portrait 720p, Square, Landscape), framerate (30/60 FPS), background fill (blurred gameplay vs. black cinematic bars), and toggle GPU hardware acceleration.
- 🧹 **Automatic Mask Cleanup**: Temporary `.png` mask files written during rendering are now immediately deleted upon render completion, failure, or cancellation using a robust Rust RAII drop guard, keeping your workspace (and desktop) perfectly tidy!
- 🧲 **Magnetic Pen Snapping**: Added path snapping to the Vector Pen Tool — hovering within 20px of the first point automatically snaps, and a single click closes the path cleanly.
- 📂 **Flexible Save Destination**: Integrated with native OS file dialogs to prompt you exactly where to save and name your output video when clicking "Export Video".
- 🌸 **Premium Pink Theme**: ReframeGG has transitioned from its classic orange highlight to a sweet, high-fidelity premium rose-pink design.
- 📐 **Even-Numbered Scaling Alignment**: Forced even dimensions on all layers to prevent H.264/FFmpeg render pipeline failures, and added dynamic mask resizing during merge operations.
- 🛡️ **Tauri v2 Security Permissions**: Standardized and optimized the capabilities map for local window controls.

<br/>

---

</div>

## ⚠️ Early Access Warning

> **🚧 This project is in very early development — version `v0.1.x`.**

Please read this before downloading or using ReframeGG:

- 🐛 **Bugs are expected.** The application is under active development and may behave unexpectedly.
- 💥 **It may not work at all** on your system. Some features are partially implemented or missing entirely.
- 🔄 **Breaking changes can happen at any time** between versions without prior notice.
- 💾 **Preset data and settings may be wiped** between updates as the schema is still evolving.
- 🖥️ **Only Windows (x86_64) is currently tested.** macOS and Linux builds are not guaranteed to work.

**Use at your own risk.** This is a passion project and not yet production-ready software. Feedback, bug reports, and contributions are warmly welcome — they directly shape the roadmap.

> If you encounter a crash or a broken feature, please [open an issue](../../issues) with your system specs, the video file details, and steps to reproduce. This helps enormously.

---

## ✨ Introduction

**ReframeGG** is a high-performance, locally-hosted desktop application designed to reframe traditional **horizontal (16:9)** videos into vertical **(9:16)** formats optimized for TikTok, YouTube Shorts, and Instagram Reels.

Built for gaming content creators who are tired of clunky cloud tools, slow exports, and privacy concerns — ReframeGG runs entirely on your machine. No uploads. No subscriptions. No waiting.

By combining the lightweight security of **Tauri v2**, the dynamic reactive UI of **React 19**, and the pixel-perfect rendering power of **FFmpeg**, ReframeGG enables complex multi-layer reframing, freeform polygon masking, and GPU-accelerated encoding — all in a sleek desktop interface.

---

## 🚀 Key Features

| Feature | Description |
|---|---|
| 🎨 **Freeform Polygon Masking** | Draw fully custom polygonal masks to isolate facecams, minimaps, health bars, kill feeds, and more |
| ⚡ **Zero-Stutter Preview** | Continuous 60 FPS canvas compositor powered by `requestAnimationFrame` — no dropped frames in preview |
| 🚀 **Hardware Accelerated Export** | Auto-detects NVIDIA/AMD GPU and uses `h264_nvenc` / `vp9_nvenc` for blazing-fast render times |
| 💾 **Custom Preset System** | Save, edit, and auto-load multi-layer layouts per game. Suggestions based on video filename |
| 🎛️ **Micro-Adjustment Controls** | Increment/decrement step buttons on every transform, crop, brightness, contrast, and feather control |
| 🔒 **100% Offline & Private** | Your footage never leaves your machine. Zero cloud. Zero telemetry |

---

## 🛠 Architecture

ReframeGG is split into a reactive frontend and a highly optimized Rust desktop core:

```
┌─────────────────────────────────────┐
│         React 19 Frontend           │
│  (Editor · Preview · Layer Controls)│
└────────────┬────────────────────────┘
             │  Tauri IPC Commands
             ▼
┌─────────────────────────────────────┐
│         Tauri v2 Rust Core          │
│  (File I/O · Dialogs · FFmpeg IPC)  │
└────────────┬────────────────────────┘
             │  Sidecar Execution
             ▼
┌─────────────────────────────────────┐
│         FFmpeg Sidecar Engine       │
│  (filter_complex · NVENC · Output)  │
└─────────────────────────────────────┘
```

- **Frontend (`src/`)** — React 19 + TypeScript + Tailwind CSS v4. Handles the multi-panel editor (Source & Mask Monitor, Silhouette View, Program View), trackbar scrubbing, and active layer controls.
- **Backend (`src-tauri/`)** — Tauri v2 (Rust). Manages local storage, native file dialogs, and constructs advanced FFmpeg `-filter_complex` graphs while streaming real-time progress events back to the UI.

---

## 📦 Getting Started

### Prerequisites

Make sure you have the following installed before building:

1. **Node.js** v18 or higher
2. **Rust Toolchain** (latest stable — install via [rustup](https://rustup.rs))
3. **Tauri Prerequisites** — on Windows, this means the [C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) via Visual Studio Installer
4. **FFmpeg binary** — must be placed at `src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe` (see note below)

> **FFmpeg Note:** ReframeGG bundles FFmpeg as a Tauri sidecar. You must manually place the Windows x86_64 build of `ffmpeg.exe` into the `src-tauri/binaries/` folder and rename it exactly as above. You can grab it from [gyan.dev](https://www.gyan.dev/ffmpeg/builds/).

### Installation

```bash
git clone https://github.com/MehmetCanWT/ReframeGG.git
cd ReframeGG
npm install
```

---

## 💻 Development

Start the Vite hot-reload dev server and open the Tauri desktop window simultaneously:

```bash
npm run dev
```

### Building for Distribution

Bundle the React assets and compile the Tauri Rust app into a production installer:

```bash
npm run tauri build
```

The installer will be output to `src-tauri/target/release/bundle/`.

---

## 🎯 Custom Presets

ReframeGG uses a portable JSON schema for saving and loading layouts. Presets are stored in `localStorage` for automatic recovery on next launch.

```json
[
  {
    "game": "Custom",
    "presetName": "My Layout",
    "sourceResolution": { "w": 1920, "h": 1080 },
    "layers": []
  }
]
```

Auto-suggestions match preset names to game filenames — so loading a `valorant_clip.mp4` can automatically suggest your Valorant layout.

> ⚠️ **Note:** The preset schema may change between early versions. Back up your presets JSON if you've built something complex.

---

## 🤝 Contributing

Contributions, bug reports, and feature requests are all welcome.

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes (`git commit -m 'feat: add my feature'`)
4. Push and open a Pull Request

For major changes, please open an issue first to discuss the direction.

---

## 📜 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for full details.

---

<div align="center">

<br/>

**Made with ❤️ for Gaming Content Creators**

*Early access · Expect bugs · Ship fast · Iterate*

<br/>

</div>
