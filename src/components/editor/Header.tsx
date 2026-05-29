import React, { useState } from "react";
import { Sparkles, FolderOpen, HelpCircle, Keyboard, X, ExternalLink, BookOpen, Minus, Square } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";



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

interface HeaderProps {
  videoName: string;
  onSavePreset: () => void;
  onOpenPresets: () => void;
  onRender: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  videoName,
  onSavePreset,
  onOpenPresets,
  onRender
}) => {
  const [showDocs, setShowDocs] = useState(false);

  const handleMinimize = () => {
    try {
      getCurrentWindow().minimize();
    } catch (err) {
      console.error("Failed to minimize window:", err);
    }
  };

  const handleMaximize = () => {
    try {
      getCurrentWindow().toggleMaximize();
    } catch (err) {
      console.error("Failed to maximize window:", err);
    }
  };

  const handleClose = () => {
    try {
      getCurrentWindow().close();
    } catch (err) {
      console.error("Failed to close window:", err);
    }
  };

  return (
    <header
      data-tauri-drag-region
      className="h-[55px] bg-[#121316] border-b border-white/6 px-5 flex items-center justify-between z-20 select-none cursor-default"
    >
      <div data-tauri-drag-region className="flex items-center gap-3">
        <span
          data-tauri-drag-region
          className="font-black text-base tracking-wider bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent uppercase"
        >
          ReframeGG
        </span>
        
        <button
          onClick={() => setShowDocs(true)}
          className="ml-3 px-2.5 py-1 text-[10px] font-black tracking-wider bg-white/5 hover:bg-pink-600/10 border border-white/6 hover:border-pink-500/30 text-zinc-400 hover:text-white rounded-md cursor-pointer transition duration-200 flex items-center gap-1.5"
          title="Open Documentation and Shortcuts Menu"
        >
          <HelpCircle size={12} className="text-[#ec4899]" />
          DOCS & KEYBINDS
        </button>
      </div>

      <div
        data-tauri-drag-region
        className="text-zinc-500 text-xs font-semibold flex items-center gap-2"
      >
        <span className="w-2 h-2 bg-[#ec4899] rounded-full animate-pulse" />
        {videoName}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onSavePreset}
            className="px-4 py-2 text-xs font-black tracking-wider bg-[#181a1f] hover:bg-[#20232a] border border-white/6 hover:border-pink-500 rounded-lg cursor-pointer transition duration-300 flex items-center gap-2 shadow-lg text-[#ec4899]"
            title="Saves current layer layout as a custom preset"
          >
            <Sparkles size={14} />
            SAVE PRESET
          </button>

          <button
            onClick={onOpenPresets}
            className="px-4 py-2 text-xs font-black tracking-wider bg-[#181a1f] hover:bg-[#20232a] border border-white/6 hover:border-[#ec4899] rounded-lg cursor-pointer transition duration-300 flex items-center gap-2 shadow-lg"
          >
            <FolderOpen size={14} className="text-[#ec4899]" />
            PRESETS
          </button>

          <button
            className="px-4 py-2 font-black tracking-widest text-xs bg-gradient-to-r from-pink-600 to-fuchsia-400 hover:from-pink-500 hover:to-fuchsia-300 text-white rounded-lg shadow-[0_4px_15px_rgba(236,72,153,0.3)] hover:scale-[1.02] active:scale-100 cursor-pointer transition duration-300 flex items-center gap-2"
            onClick={onRender}
          >
            <Sparkles size={14} className="animate-pulse" />
            RENDER VIDEO
          </button>
        </div>

        {/* Separator */}
        <div className="h-5 w-px bg-white/10" />

        {/* Custom Window Action Controls */}
        <div className="flex items-center -mr-2">
          <button
            onClick={handleMinimize}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/5 transition duration-150 cursor-pointer"
            title="Minimize"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={handleMaximize}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/5 transition duration-150 cursor-pointer"
            title="Maximize"
          >
            <Square size={10} />
          </button>
          <button
            onClick={handleClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-rose-500/80 transition duration-150 cursor-pointer"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* High-Fidelity Glassmorphic Docs Modal */}
      {showDocs && (
        <div className="fixed inset-0 bg-[#0b0c0e]/80 backdrop-blur-md z-[999] flex items-center justify-center animate-in fade-in duration-200">
          <div className="bg-[#121316]/95 border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(236,72,153,0.15)] max-w-lg w-full mx-4 p-6 relative z-[1000] animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-white/6 pb-4 mb-5">
              <div className="flex items-center gap-2">
                <BookOpen className="text-pink-500" size={18} />
                <h2 className="text-xs font-black tracking-wider uppercase text-white">Documentation & Controls</h2>
              </div>
              <button onClick={() => setShowDocs(false)} className="text-zinc-500 hover:text-white cursor-pointer transition duration-150 p-1 hover:bg-white/5 rounded-md">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <h3 className="text-[10px] font-black tracking-widest text-[#ec4899] uppercase mb-2.5 flex items-center gap-1.5">
                  <Keyboard size={14} />
                  Keyboard Shortcuts & Mouse Controls
                </h3>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { keys: ["Alt", "Mouse Drag"], action: "Pan Source Monitor (1:1 Drag)" },
                    { keys: ["Alt", "Drag Layer"], action: "Move mask layer, Snapping Disabled (Silhouette)" },
                    { keys: ["Mouse Wheel"], action: "Zoom to mouse cursor position (Source Monitor)" },
                    { keys: ["Alt + Double Click", "Middle Click"], action: "Reset zoom & pan to 100%" },
                    { keys: ["Spacebar"], action: "Play / Pause video playback" },
                  ].map((kb, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 px-3 bg-[#16181d] border border-white/4 rounded-lg">
                      <span className="text-xs text-zinc-400 font-semibold">{kb.action}</span>
                      <div className="flex gap-1.5">
                        {kb.keys.map((k, kidx) => (
                          <kbd key={kidx} className="px-1.5 py-0.5 text-[9px] font-black font-mono bg-zinc-800 border border-zinc-700 text-zinc-200 rounded shadow-[0_1px_1px_rgba(0,0,0,0.4)]">{k}</kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-[10px] font-black tracking-widest text-[#ec4899] uppercase mb-2.5 flex items-center gap-1.5">
                  <Sparkles size={14} />
                  Features & Tips
                </h3>
                <ul className="space-y-1.5 text-xs text-zinc-400 font-medium list-disc pl-4">
                  <li><strong>Vector Pen Snapping</strong>: Get within 20px of the first point to snap magnetically, then click to close the loop.</li>
                  <li><strong>Timeline Trimming</strong>: Drag left and right handles on the scrubber to set custom loop ranges.</li>
                  <li><strong>Interactive Sliders</strong>: Sliders support full global dragging and direct clicks.</li>
                </ul>
              </div>

              <div className="border-t border-white/6 pt-4 mt-5 flex items-center justify-between">
                <a
                  href="https://github.com/MehmetCanWT/ReframeGG"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs font-black tracking-wider text-[#ec4899] hover:text-pink-400 transition cursor-pointer"
                >
                  <GithubIcon size={16} />
                  GITHUB REPOSITORY
                  <ExternalLink size={12} />
                </a>
                <button
                  onClick={() => setShowDocs(false)}
                  className="px-4 py-1.5 text-xs font-black bg-zinc-800 hover:bg-zinc-700 border border-white/6 text-white rounded-lg transition duration-200 cursor-pointer"
                >
                  CLOSE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
