import { ImageIcon } from "lucide-react";

interface SourceSelectorProps {
  isDragging: boolean;
  handleManualVideoSelect: () => void;
}

export function SourceSelector({ isDragging, handleManualVideoSelect }: SourceSelectorProps) {
  return (
    <div 
      onClick={handleManualVideoSelect}
      className="w-screen h-screen flex flex-col items-center justify-center bg-[#07080a] text-[#f5f6f8] relative cursor-pointer overflow-hidden select-none bg-[radial-gradient(circle_at_center,rgba(236,72,153,0.08)_0%,rgba(0,0,0,0)_70%)]"
    >
      {/* Background Animated Glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-pink-600/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-fuchsia-400/5 rounded-full blur-3xl animate-pulse" />

      {isDragging && (
        <div className="absolute inset-0 bg-pink-600/15 border-4 border-dashed border-[#ec4899] z-50 flex flex-col items-center justify-center text-2xl font-extrabold text-[#ec4899] backdrop-blur-md">
          <ImageIcon className="w-16 h-16 mb-4 text-[#ec4899] animate-bounce" />
          DROP VIDEO HERE
        </div>
      )}

      {/* Premium Logo Glow */}
      <div className="relative mb-6">
        <div className="absolute -inset-1.5 bg-gradient-to-r from-[#ec4899] to-[#f472b6] rounded-2xl blur-lg opacity-75"></div>
        <div className="relative w-24 h-24 text-4xl font-extrabold flex items-center justify-center bg-gradient-to-br from-[#ec4899] to-[#f472b6] rounded-2xl shadow-[0_0_20px_rgba(236,72,153,0.5)] transform transition duration-500 hover:scale-105">
          R
        </div>
      </div>

      <h1 className="text-4xl md:text-5xl font-black mb-3 bg-gradient-to-r from-white via-zinc-200 to-[#ec4899] bg-clip-text text-transparent tracking-tight text-center px-4">
        ReframeGG Compositor
      </h1>
      <p className="text-[#949ca9] text-lg font-medium text-center px-4 transition duration-300 hover:text-zinc-200">
        Drag & drop or click to select
      </p>
    </div>
  );
}
