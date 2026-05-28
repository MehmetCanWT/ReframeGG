import React from "react";
import { Sparkles, FolderOpen } from "lucide-react";

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
  return (
    <header className="h-[55px] bg-[#121316] border-b border-white/6 px-5 flex items-center justify-between z-20">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-600 to-amber-500 flex items-center justify-center font-black text-white text-base shadow-[0_0_15px_rgba(234,88,12,0.4)]">
          R
        </div>
        <span className="font-black text-base tracking-wider bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent uppercase">
          ReframeGG Compositor
        </span>
        <span className="px-2 py-0.5 text-[9px] font-black tracking-widest text-[#ea580c] bg-orange-600/10 border border-orange-600/20 rounded-md">
          PRO EDITION
        </span>
      </div>

      <div className="text-zinc-500 text-xs font-semibold flex items-center gap-2">
        <span className="w-2 h-2 bg-[#ea580c] rounded-full animate-pulse" />
        {videoName}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onSavePreset}
          className="px-4 py-2 text-xs font-black tracking-wider bg-[#181a1f] hover:bg-[#20232a] border border-white/6 hover:border-orange-500 rounded-lg cursor-pointer transition duration-300 flex items-center gap-2 shadow-lg text-[#ea580c]"
          title="Saves current layer layout as a custom preset"
        >
          <Sparkles size={14} />
          SAVE PRESET
        </button>

        <button
          onClick={onOpenPresets}
          className="px-4 py-2 text-xs font-black tracking-wider bg-[#181a1f] hover:bg-[#20232a] border border-white/6 hover:border-[#ea580c] rounded-lg cursor-pointer transition duration-300 flex items-center gap-2 shadow-lg"
        >
          <FolderOpen size={14} className="text-[#ea580c]" />
          PRESETS
        </button>

        <button
          className="px-4 py-2 font-black tracking-widest text-xs bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white rounded-lg shadow-[0_4px_15px_rgba(234,88,12,0.3)] hover:scale-[1.02] active:scale-100 cursor-pointer transition duration-300 flex items-center gap-2"
          onClick={onRender}
        >
          <Sparkles size={14} className="animate-pulse" />
          RENDER VIDEO
        </button>
      </div>
    </header>
  );
};
