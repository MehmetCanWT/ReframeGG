"use client";

import React, { useState } from "react";
import Image from "next/image";
import { 
  Sparkles, 
  Cpu, 
  ShieldCheck, 
  PenTool, 
  Scissors, 
  FolderOpen, 
  Download, 
  ExternalLink,
  Laptop,
  ChevronLeft,
  ChevronRight,
  X
} from "lucide-react";

interface LandingClientProps {
  screenshots: string[];
}

const GithubIcon: React.FC<{ size?: number; className?: string }> = ({ size = 16, className }) => (
  <svg
    height={size}
    width={size}
    className={className}
    viewBox="0 0 16 16"
    version="1.1"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.35 3.1 1.07 0 .67.01 1.3.01 1.48 0 .21-.15.46-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
  </svg>
);

export default function LandingClient({ screenshots }: LandingClientProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const basePath = process.env.NODE_ENV === "production" ? "/ReframeGG" : "";

  const handlePrev = () => {
    setActiveIndex((prev) => (prev === 0 ? screenshots.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setActiveIndex((prev) => (prev === screenshots.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className="min-h-screen bg-[#070809] text-zinc-100 overflow-x-hidden selection:bg-pink-500 selection:text-white">
      {/* ─── BACKGROUND DECORATIVE GLOWS ─── */}
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-pink-900/10 rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="absolute top-[30%] right-[-10%] w-[45vw] h-[45vw] bg-fuchsia-900/10 rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] left-[20%] w-[50vw] h-[50vw] bg-pink-900/5 rounded-full blur-[120px] pointer-events-none z-0" />

      {/* ─── HEADER / NAVIGATION ─── */}
      <header className="border-b border-white/5 bg-[#0b0c0e]/60 backdrop-blur-md sticky top-0 z-50 transition duration-300">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-black text-lg tracking-wider bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent uppercase">
              ReframeGG
            </span>
            <span className="px-2 py-0.5 rounded bg-pink-500/10 border border-pink-500/20 text-[9px] font-black text-pink-500 tracking-widest uppercase">
              v0.1.2
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-xs font-black tracking-widest uppercase text-zinc-400">
            <a href="#features" className="hover:text-pink-500 transition">Features</a>
            <a href="#showcase" className="hover:text-pink-500 transition">Interface</a>
            <a href="#getting-started" className="hover:text-pink-500 transition">Getting Started</a>
          </nav>

          <div className="flex items-center gap-3">
            <a
              href="https://github.com/MehmetCanWT/ReframeGG"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 border border-white/5 hover:border-white/10 rounded-lg transition duration-200"
              title="GitHub Repository"
            >
              <GithubIcon size={16} />
            </a>
            <a
              href="https://github.com/MehmetCanWT/ReframeGG/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 text-[10px] font-black tracking-widest uppercase bg-gradient-to-r from-pink-600 to-fuchsia-500 hover:from-pink-500 hover:to-fuchsia-400 text-white rounded-lg transition duration-300 shadow-[0_4px_15px_rgba(236,72,153,0.2)] hover:scale-[1.02] active:scale-100 flex items-center gap-1.5"
            >
              <Download size={12} />
              DOWNLOAD NOW
            </a>
          </div>
        </div>
      </header>

      {/* ─── HERO SECTION ─── */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-semibold text-zinc-300 mb-6 backdrop-blur-sm">
          <Sparkles size={12} className="text-pink-500" />
          <span>Transform Video into Viral Vertical Content</span>
        </div>

        <h1 className="text-4xl sm:text-6xl md:text-7xl font-black uppercase tracking-tight leading-tight text-white mb-6">
          RE-IMAGINE YOUR <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-pink-500 via-fuchsia-500 to-rose-400 bg-clip-text text-transparent">
            GAMEPLAY CLIPS
          </span>
        </h1>

        <p className="max-w-2xl mx-auto text-sm sm:text-base text-zinc-400 font-medium leading-relaxed mb-10">
          ReframeGG is a powerful, locally-hosted desktop application designed to reframe traditional 
          horizontal (16:9) video content into vertical (9:16) formats suitable for TikTok, YouTube Shorts, 
          and Instagram Reels. Free, fast, and completely offline.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="https://github.com/MehmetCanWT/ReframeGG/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-8 py-3.5 text-xs font-black tracking-widest uppercase bg-gradient-to-r from-pink-600 to-fuchsia-500 hover:from-pink-500 hover:to-fuchsia-400 text-white rounded-xl transition duration-300 shadow-[0_4px_20px_rgba(236,72,153,0.3)] hover:scale-[1.02] flex items-center justify-center gap-2"
          >
            <Download size={14} />
            DOWNLOAD NOW (v0.1.2)
          </a>
          <a
            href="#getting-started"
            className="w-full sm:w-auto px-8 py-3.5 text-xs font-black tracking-widest uppercase bg-zinc-900 hover:bg-zinc-800 border border-white/5 hover:border-pink-500/30 text-zinc-300 hover:text-white rounded-xl transition duration-300 flex items-center justify-center gap-2"
          >
            GETTING STARTED
          </a>
          <a
            href="https://github.com/MehmetCanWT/ReframeGG"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-8 py-3.5 text-xs font-black tracking-widest uppercase bg-zinc-900 hover:bg-zinc-800 border border-white/5 hover:border-pink-500/30 text-zinc-300 hover:text-white rounded-xl transition duration-300 flex items-center justify-center gap-2"
          >
            <GithubIcon size={14} />
            VIEW SOURCE
          </a>
        </div>
      </section>

      {/* ─── INTERFACE SHOWCASE SECTION (SLIDER) ─── */}
      <section id="showcase" className="relative z-10 max-w-6xl mx-auto px-6 py-12">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-xs font-black tracking-widest text-pink-500 uppercase mb-3">WORKSPACE INTERFACE</h2>
          <p className="text-2xl sm:text-3xl font-black uppercase text-white tracking-tight">
            EXPLORE THE WORKSPACE PREVIEW
          </p>
        </div>

        <div className="bg-[#0b0c0e]/80 border border-white/10 rounded-2xl p-3 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden">
          {/* Frameless window look */}
          <div className="flex items-center justify-between border-b border-white/5 pb-3 px-3 mb-3 select-none">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
              <span className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
              <span className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
            </div>
            <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1">
              <Laptop size={10} className="text-pink-500" />
              Workspace View ({activeIndex + 1} of {screenshots.length})
            </div>
            <div className="w-[40px]" />
          </div>

          {/* Interactive Slider Container */}
          <div className="relative aspect-video w-full bg-zinc-950/60 rounded-xl overflow-hidden group border border-white/5">
            {/* Main Active Image */}
            <div className="absolute inset-0 z-0">
              <Image 
                src={`${basePath}/${screenshots[activeIndex]}`}
                alt={`ReframeGG Workspace View ${activeIndex + 1}`}
                fill
                priority
                className="object-contain transition-opacity duration-300"
              />
            </div>

            {/* Slider Left Arrow */}
            {screenshots.length > 1 && (
              <button
                onClick={handlePrev}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-xl bg-black/60 hover:bg-pink-600/80 border border-white/10 hover:border-pink-500 text-white flex items-center justify-center cursor-pointer transition shadow-lg opacity-0 group-hover:opacity-100 duration-200"
                title="Previous Screenshot"
              >
                <ChevronLeft size={20} />
              </button>
            )}

            {/* Slider Right Arrow */}
            {screenshots.length > 1 && (
              <button
                onClick={handleNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-xl bg-black/60 hover:bg-pink-600/80 border border-white/10 hover:border-pink-500 text-white flex items-center justify-center cursor-pointer transition shadow-lg opacity-0 group-hover:opacity-100 duration-200"
                title="Next Screenshot"
              >
                <ChevronRight size={20} />
              </button>
            )}
          </div>
        </div>

        {/* Thumbnail Selector Previews */}
        {screenshots.length > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            {screenshots.map((shot, idx) => (
              <button
                key={idx}
                onClick={() => setActiveIndex(idx)}
                className={`relative w-24 h-14 rounded-lg overflow-hidden border cursor-pointer transition-all duration-200 ${
                  activeIndex === idx
                    ? "border-pink-500 scale-[1.04] shadow-[0_0_12px_rgba(236,72,153,0.3)] bg-pink-500/10"
                    : "border-white/10 opacity-60 hover:opacity-100 bg-[#0b0c0e]"
                }`}
              >
                <Image
                  src={`${basePath}/${shot}`}
                  alt={`Screenshot ${idx + 1}`}
                  fill
                  className="object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ─── CORE FEATURES GRID ─── */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-6 py-16">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-xs font-black tracking-widest text-pink-500 uppercase mb-3">HIGH PERFORMANCE FEATURES</h2>
          <p className="text-3xl sm:text-4xl font-black uppercase text-white tracking-tight">
            ENGINEERED FOR MODERN CONTENT CREATION
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: <PenTool className="text-pink-500" size={20} />,
              title: "Freeform Masking",
              desc: "Draw fully custom polygonal masks using our Vector Pen Tool. Keep your facecam, health bars, or maps perfectly isolated in vertical layers."
            },
            {
              icon: <Cpu className="text-pink-500" size={20} />,
              title: "GPU Encoding Acceleration",
              desc: "Auto-detects active NVIDIA or AMD graphics hardware and harnesses h264_nvenc / vp9_nvenc for ultra-fast, local exports."
            },
            {
              icon: <ShieldCheck className="text-pink-500" size={20} />,
              title: "100% Offline & Private",
              desc: "Your source footage and exported videos never leave your PC. Runs fully locally with zero external server queues or subscriptions."
            },
            {
              icon: <Scissors className="text-pink-500" size={20} />,
              title: "Scrubber timeline loops",
              desc: "Precision loop trimming on the scrubber timeline. Drag boundaries to frame specific sequences of gameplay effortlessly."
            },
            {
              icon: <FolderOpen className="text-pink-500" size={20} />,
              title: "Presets Auto-matching",
              desc: "Store and edit multi-layer custom gaming presets. Filename game detection suggests CS2, Valorant, or League overlays instantly."
            },
            {
              icon: <Sparkles className="text-pink-500" size={20} />,
              title: "Sleek Custom Header",
              desc: "A gorgeous, responsive frameless titlebar with magnetic snapping. Complete layout controls fit for a premium experience."
            }
          ].map((feat, idx) => (
            <div 
              key={idx} 
              className="bg-[#0b0c0e]/60 border border-white/5 hover:border-pink-500/30 p-6 rounded-2xl transition duration-300 hover:translate-y-[-2px] group"
            >
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 group-hover:border-pink-500/20 group-hover:bg-pink-500/10 flex items-center justify-center mb-5 transition duration-300">
                {feat.icon}
              </div>
              <h3 className="text-sm font-black uppercase text-white tracking-wide mb-3 group-hover:text-pink-500 transition duration-200">{feat.title}</h3>
              <p className="text-zinc-500 text-xs font-semibold leading-relaxed">{feat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── GETTING STARTED / INSTALLATION ─── */}
      <section id="getting-started" className="relative z-10 max-w-4xl mx-auto px-6 py-20 text-center">
        <div className="bg-gradient-to-tr from-[#0b0c0e]/80 to-[#121316]/50 border border-white/10 rounded-3xl p-8 sm:p-12 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-[200px] h-[200px] bg-pink-500/5 rounded-full blur-[50px] pointer-events-none" />

          <h2 className="text-xs font-black tracking-widest text-pink-500 uppercase mb-3">GETTING STARTED</h2>
          <p className="text-2xl sm:text-3xl font-black uppercase text-white tracking-tight mb-8">
            RUN REFRAMEGG IN A FEW CLICKS
          </p>

          <div className="text-left max-w-xl mx-auto mb-10 space-y-4">
            {[
              { step: "1", title: "Verify Prerequisites", desc: "Ensure you have Node.js 18+ and Rust installed on your computer." },
              { step: "2", title: "Clone and Install Dependencies", desc: "Clone from GitHub and run 'npm install' to fetch packages." },
              { step: "3", title: "Place FFmpeg Binary Sidecar", desc: "Place 'ffmpeg-x86_64-pc-windows-msvc.exe' in 'src-tauri/binaries/' or make sure FFmpeg is in system PATH." },
              { step: "4", title: "Run Development Server", desc: "Launch the hot-reloading compositor window with 'npm run dev'." }
            ].map((st, idx) => (
              <div key={idx} className="flex gap-4 items-start bg-black/40 border border-white/5 rounded-xl p-4">
                <div className="w-6 h-6 rounded-full bg-pink-600/20 border border-pink-500/30 flex items-center justify-center text-[10px] font-black text-pink-500 flex-shrink-0">
                  {st.step}
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase text-white tracking-wide mb-1">{st.title}</h4>
                  <p className="text-zinc-500 text-[11px] font-semibold leading-relaxed">{st.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://github.com/MehmetCanWT/ReframeGG/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-8 py-3.5 bg-pink-600 hover:bg-pink-500 text-white font-black text-xs tracking-widest uppercase rounded-xl transition duration-300 flex items-center justify-center gap-2 shadow-lg shadow-pink-600/30"
            >
              <Download size={14} />
              DOWNLOAD LATEST RELEASE
            </a>
            <a
              href="https://github.com/MehmetCanWT/ReframeGG"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-8 py-3.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white font-black text-xs tracking-widest uppercase rounded-xl border border-white/5 hover:border-pink-500/30 transition duration-300 flex items-center justify-center gap-2"
            >
              <GithubIcon size={14} />
              CLONE REPOSITORY
            </a>
            <a
              href="https://github.com/MehmetCanWT/ReframeGG/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-8 py-3.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white font-black text-xs tracking-widest uppercase rounded-xl border border-white/5 hover:border-pink-500/30 transition duration-300 flex items-center justify-center gap-2"
            >
              REPORT AN ISSUE
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-white/5 bg-[#050607] relative z-10 py-12 text-center text-xs text-zinc-500 font-semibold uppercase tracking-wider">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <span className="font-black text-sm tracking-widest text-zinc-400">ReframeGG</span>
            <span className="text-[10px] text-zinc-600">|</span>
            <span>Free & Open Source</span>
          </div>

          <div className="flex items-center gap-6">
            <a href="https://github.com/MehmetCanWT/ReframeGG" target="_blank" rel="noopener noreferrer" className="hover:text-white transition">GitHub</a>
            <a href="https://github.com/MehmetCanWT/ReframeGG/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="hover:text-white transition">License</a>
          </div>

          <div>
            Made with 💖 by the gaming community
          </div>
        </div>
      </footer>
    </div>
  );
}
