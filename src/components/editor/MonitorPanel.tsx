import React from "react";
import { Square, Circle, PenTool } from "lucide-react";
import { ReframeLayer, EditorTool } from "../../types";

interface MonitorPanelProps {
  editorTool: EditorTool;
  setEditorTool: (tool: EditorTool) => void;
  sourceCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  silhouetteCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  programCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  onSourceMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onSourceDoubleClick: () => void;
  onSourceMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
  onSourceMouseLeave: () => void;
  onSilhouetteMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  layers: ReframeLayer[];
  selectedLayerId: string;
  drawingPoints: { x: number; y: number }[];
  mouseHoverPos: { x: number; y: number } | null;
  CANVAS_W: number;
  CANVAS_H: number;
  footerHeight: number;
}

export const MonitorPanel: React.FC<MonitorPanelProps> = ({
  editorTool,
  setEditorTool,
  sourceCanvasRef,
  silhouetteCanvasRef,
  programCanvasRef,
  onSourceMouseDown,
  onSourceDoubleClick,
  onSourceMouseMove,
  onSourceMouseLeave,
  onSilhouetteMouseDown,
  layers,
  selectedLayerId,
  drawingPoints,
  mouseHoverPos,
  CANVAS_W,
  CANVAS_H,
  footerHeight
}) => {
  return (
    <div className="flex-1 flex overflow-hidden w-full bg-[#08090a]">
      {/* PANEL 1: SOURCE MONITOR (Expands to fill) */}
      <div 
        className="flex-1 h-full border-r border-white/6 flex flex-col relative select-none bg-[#0a0b0d]"
      >
        <div className="h-[40px] bg-[#121316] border-b border-white/6 px-4 flex items-center justify-between">
          <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400">
            Source & Mask Monitor (16:9)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setEditorTool(editorTool === "rect" ? "select" : "rect")}
              className={`p-1.5 rounded transition cursor-pointer ${editorTool === "rect" ? "bg-orange-600 text-white animate-pulse" : "hover:bg-white/5 text-zinc-500"}`}
              title="Kare Maske"
            >
              <Square size={13} />
            </button>
            <button
              onClick={() => setEditorTool(editorTool === "circle" ? "select" : "circle")}
              className={`p-1.5 rounded transition cursor-pointer ${editorTool === "circle" ? "bg-orange-600 text-white animate-pulse" : "hover:bg-white/5 text-zinc-500"}`}
              title="Daire Maske"
            >
              <Circle size={13} />
            </button>
            <button
              onClick={() => setEditorTool(editorTool === "freeform" ? "select" : "freeform")}
              className={`p-1.5 rounded transition cursor-pointer ${editorTool === "freeform" ? "bg-orange-600 text-white animate-pulse" : "hover:bg-white/5 text-zinc-500"}`}
              title="Polygon (Serbest Çizim) Maske"
            >
              <PenTool size={13} />
            </button>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden bg-[#050505]">
          <div 
            onMouseDown={onSourceMouseDown}
            onDoubleClick={onSourceDoubleClick}
            onMouseMove={onSourceMouseMove}
            onMouseLeave={onSourceMouseLeave}
            className="relative aspect-video w-full max-h-full bg-zinc-950 border border-white/5 shadow-2xl cursor-crosshair overflow-hidden"
          >
            <canvas
              ref={sourceCanvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              className="w-full h-full block object-contain pointer-events-none"
            />
            {/* SVG OVERLAY for Masks */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}>
               {layers.map(layer => {
                 if (!layer.visible) return null;
                 const isSelected = layer.id === selectedLayerId;
                 const strokeColor = isSelected ? "#ea580c" : "rgba(255,255,255,0.35)";
                 const strokeWidth = isSelected ? "2" : "1";
                 const fillColor = isSelected ? "rgba(234,88,12,0.15)" : "rgba(255,255,255,0.05)";
                 
                 return layer.masks?.map(m => (
                   <React.Fragment key={m.id}>
                     {m.type === "circle" ? (
                       <ellipse cx={m.x + m.w/2} cy={m.y + m.h/2} rx={m.w/2} ry={m.h/2} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />
                     ) : m.type === "freeform" && m.points ? (
                       <path d={m.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z"} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />
                     ) : (
                       <rect x={m.x} y={m.y} width={m.w} height={m.h} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />
                     )}
                   </React.Fragment>
                 ));
               })}
               {/* Drawing Feedback */}
               {editorTool === "freeform" && drawingPoints.length > 0 && (
                 <>
                   <polyline points={drawingPoints.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#ea580c" strokeWidth="2" />
                   {mouseHoverPos && <line x1={drawingPoints[drawingPoints.length-1].x} y1={drawingPoints[drawingPoints.length-1].y} x2={mouseHoverPos.x} y2={mouseHoverPos.y} stroke="#ea580c" strokeWidth="2" strokeDasharray="4,4" opacity="0.6" />}
                 </>
               )}
            </svg>
          </div>
        </div>
      </div>

      {/* PANEL 2: SILHOUETTE (Fixed 9:16) */}
      <div 
        style={{ width: `calc((100vh - ${111 + footerHeight}px) * (9/16) + 16px)` }}
        className="h-full border-r border-white/6 flex flex-col relative select-none bg-[#0a0b0d]"
      >
        <div className="h-[40px] bg-[#121316] border-b border-white/6 px-4 flex items-center">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
            Silhouette (9:16)
          </span>
        </div>
        <div className="flex-1 bg-[#050505] flex items-center justify-center p-2">
          <div className="relative w-full h-full bg-black shadow-2xl overflow-hidden">
            <canvas
              ref={silhouetteCanvasRef}
              width={360}
              height={640}
              onMouseDown={onSilhouetteMouseDown}
              className="w-full h-full block cursor-move"
            />
          </div>
        </div>
      </div>

      {/* PANEL 3: PROGRAM (Fixed 9:16) */}
      <div 
        style={{ width: `calc((100vh - ${111 + footerHeight}px) * (9/16) + 16px)` }}
        className="h-full flex flex-col relative select-none bg-[#0a0b0d]"
      >
        <div className="h-[40px] bg-[#121316] border-b border-white/6 px-4 flex items-center">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
            Program (9:16)
          </span>
        </div>
        <div className="flex-1 bg-[#050505] flex items-center justify-center p-2">
          <div className="relative w-full h-full bg-zinc-950 shadow-2xl overflow-hidden">
            <canvas
              ref={programCanvasRef}
              width={540}
              height={960}
              className="w-full h-full block pointer-events-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
