import React from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Layer } from "../presets";

export const TGT_SCALE = 324 / 1080;

interface OutputPreviewProps {
  videoPath: string;
  compiledLayers: Layer[];
  guidesActive: boolean;
  draggedLayerId: string | null;
  masterVideoRef: React.RefObject<HTMLVideoElement | null>;
  handleOutputLayerMouseDown: (e: React.MouseEvent, layerId: string) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function OutputPreview({
  videoPath,
  compiledLayers,
  guidesActive,
  draggedLayerId,
  masterVideoRef,
  handleOutputLayerMouseDown,
  containerRef,
}: OutputPreviewProps) {
  return (
    // This div is the "card container" — fills the flex-1 space above the scrubber
    <div
      ref={containerRef}
      className="flex-1 flex justify-center items-center bg-[#000000] overflow-hidden relative select-none min-h-0"
    >
      {/* Hidden master video */}
      <video
        ref={masterVideoRef}
        src={videoPath ? convertFileSrc(videoPath) : undefined}
        muted
        playsInline
        className="hidden"
      />

      {/*
        9:16 card — fills the available height via aspect-ratio + h-full.
        We use h-full so the card takes the full height of the flex container,
        and aspect-ratio: 9/16 determines the width automatically.
        max-width: 100% prevents overflow if the sidebar is very narrow.
      */}
      <div
        className="relative bg-[#050505] rounded-2xl overflow-hidden border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.85)]"
        style={{
          aspectRatio: "9 / 16",
          height: "100%",
          maxWidth: "100%",
        }}
      >
        {/* Background blur canvas — covers the entire card */}
        <canvas
          className="bg-blur-canvas absolute inset-0 w-full h-full z-0"
          style={{
            filter: "blur(20px) brightness(0.55) saturate(1.3)",
            transform: "scale(1.06)",
            objectFit: "cover",
          }}
          width={324}
          height={576}
        />

        {/* Interactive layer canvases — positioned relative to 1920×1080 source */}
        {compiledLayers.map((layer) => {
          const isSelected = draggedLayerId === layer.id;

          // canvasPos is in 1920×1080 source space → convert to % of output
          // Output is 1920 wide × 1080 tall in source space (9:16 already handled by the card)
          const leftPct  = (layer.canvasPos.x / 1920) * 100;
          const topPct   = (layer.canvasPos.y / 1080) * 100;
          const widthPct = (layer.canvasPos.w / 1920) * 100;
          const heightPct= (layer.canvasPos.h / 1080) * 100;

          // Canvas pixel size — use a manageable resolution for drawing
          const canvasPxW = Math.max(2, Math.round(layer.canvasPos.w * TGT_SCALE));
          const canvasPxH = Math.max(2, Math.round(layer.canvasPos.h * TGT_SCALE));

          return (
            <div
              key={layer.id}
              onMouseDown={(e) => handleOutputLayerMouseDown(e, layer.id)}
              style={{
                position: "absolute",
                left:   `${leftPct}%`,
                top:    `${topPct}%`,
                width:  `${widthPct}%`,
                height: `${heightPct}%`,
                zIndex: layer.id === "layer_0" ? 10 : 20,
                cursor: "move",
              }}
              className={`overflow-hidden transition-shadow duration-150 ${
                isSelected
                  ? "ring-2 ring-[#ea580c] shadow-[0_0_15px_rgba(234,88,12,0.5)]"
                  : ""
              }`}
            >
              <canvas
                className="layer-canvas w-full h-full block"
                data-layer-id={layer.id}
                width={canvasPxW}
                height={canvasPxH}
              />
            </div>
          );
        })}

        {/* Rule of Thirds guides */}
        {guidesActive && (
          <div className="absolute inset-0 pointer-events-none z-50">
            <div className="absolute top-0 bottom-0 left-[33.33%] border-l border-dashed border-white/20" />
            <div className="absolute top-0 bottom-0 left-[66.66%] border-l border-dashed border-white/20" />
            <div className="absolute left-0 right-0 top-[33.33%] border-t border-dashed border-white/20" />
            <div className="absolute left-0 right-0 top-[66.66%] border-t border-dashed border-white/20" />
          </div>
        )}
      </div>
    </div>
  );
}
