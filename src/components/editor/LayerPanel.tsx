import React from "react";
import { Layers, Eye, EyeOff, Scissors, Crop, Trash2 } from "lucide-react";
import { ReframeLayer } from "../../types";

interface LayerPanelProps {
  layers: ReframeLayer[];
  selectedLayerId: string;
  onSelectLayer: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onRenameLayer: (id: string, name: string) => void;
  onDeleteLayer: (id: string) => void;
  onAddLayer: (type: "crop" | "mask") => void;
}

export const LayerPanel: React.FC<LayerPanelProps> = ({
  layers,
  selectedLayerId,
  onSelectLayer,
  onToggleVisibility,
  onRenameLayer,
  onDeleteLayer,
  onAddLayer
}) => {
  return (
    <div className="w-[320px] border-r border-white/6 flex flex-col bg-[#111215] overflow-hidden">
      <div className="h-[38px] bg-[#16181d] px-4 flex items-center justify-between border-b border-white/5">
        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
          <Layers size={11} className="text-[#ec4899]" />
          Layer Panel
        </span>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onAddLayer("crop")}
            className="px-2 py-1 text-[9px] font-extrabold bg-[#1f2127] hover:bg-[#ec4899]/10 hover:text-[#ec4899] border border-white/5 hover:border-[#ec4899]/30 rounded transition cursor-pointer"
          >
            New Layer
          </button>
          <button
            onClick={() => onAddLayer("mask")}
            className="px-2 py-1 text-[9px] font-extrabold bg-[#ec4899]/15 hover:bg-[#ec4899]/25 text-[#ec4899] border border-[#ec4899]/30 rounded transition cursor-pointer"
          >
            New Mask
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1 pr-1.5">
        {[...layers].reverse().map((layer) => {
          const isSelected = selectedLayerId === layer.id;

          return (
            <div
              key={layer.id}
              onClick={() => onSelectLayer(layer.id)}
              className={`flex items-center justify-between p-2.5 rounded-lg border transition cursor-pointer ${
                isSelected 
                  ? "bg-pink-600/10 border-[#ec4899] text-white" 
                  : "bg-[#15171c] hover:bg-[#181a20] border-white/5 text-zinc-400"
              }`}
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleVisibility(layer.id);
                  }}
                  className="text-zinc-500 hover:text-white transition p-0.5"
                >
                  {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
                
                {layer.type === "mask" ? (
                  <Scissors size={12} className="text-[#ec4899]" />
                ) : (
                  <Crop size={12} className="text-[#f59e0b]" />
                )}

                <input
                  type="text"
                  value={layer.name}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onRenameLayer(layer.id, e.target.value)}
                  className="bg-transparent border-none text-[11px] font-black text-white focus:outline-none w-[90px] font-sans truncate"
                />
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteLayer(layer.id);
                }}
                className="text-zinc-600 hover:text-red-500 transition p-0.5"
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
