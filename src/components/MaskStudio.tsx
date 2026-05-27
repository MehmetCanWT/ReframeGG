import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Play, Pause, Undo, Redo, Trash, Move, Crop, Scissors, Maximize, ZoomIn, ZoomOut
} from "lucide-react";
import { Node, Edge } from "@xyflow/react";
import { MaskShape } from "../presets";

interface MaskStudioProps {
  nodes: Node[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  saveHistory: (nds: Node[], eds: Edge[]) => void;
  undo: () => void;
  redo: () => void;
  editingMaskNode: { id: string; data: any } | null;
  setEditingMaskNode: (node: { id: string; data: any } | null) => void;
  maskBackup: { nodes: Node[]; edges: Edge[] } | null;
  selectedMaskId: string;
  setSelectedMaskId: (id: string) => void;
  editorTool: "select" | "rect" | "circle" | "freeform";
  setEditorTool: (tool: "select" | "rect" | "circle" | "freeform") => void;
  currentTime: number;
  duration: number;
  setCurrentTime: (val: number) => void;
  isPlaying: boolean;
  setIsPlaying: (val: boolean) => void;
  masterVideoRef: React.RefObject<HTMLVideoElement | null>;
  updateMaskNodeData: (maskId: string, fields: any) => void;
  allMaskShapes: MaskShape[];
  addMaskShape: (type: "rect" | "circle" | "freeform") => void;
  deleteMaskShape: (maskId: string) => void;
}

const CANVAS_W = 1920;
const CANVAS_H = 1080;

export function MaskStudio({
  nodes,
  edges,
  setNodes,
  setEdges,
  saveHistory,
  undo,
  redo,
  editingMaskNode: _editingMaskNode,
  setEditingMaskNode,
  maskBackup,
  selectedMaskId,
  setSelectedMaskId,
  editorTool,
  setEditorTool,
  currentTime,
  duration,
  setCurrentTime,
  isPlaying,
  setIsPlaying,
  masterVideoRef,
  updateMaskNodeData,
  allMaskShapes,
  addMaskShape,
  deleteMaskShape,
}: MaskStudioProps) {
  const maskColors = ["#3b82f6", "#ec4899", "#10b981", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4"];
  const selectedMask = allMaskShapes.find((m) => m.id === selectedMaskId);

  // ─── Viewport: zoom + pan (mirrors kept in refs to avoid stale closure) ────
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const panStateRef = useRef({ x: 0, y: 0 });

  // Keep refs in sync with state
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panStateRef.current = pan; }, [pan]);

  // ─── Hover edge state (SVG point insertion preview) ───────────────
  const [hoveredEdge, setHoveredEdge] = useState<{
    maskId: string; insertIndex: number; x: number; y: number;
  } | null>(null);

  // ─── Ref-based drag state (NO re-render per frame) ────────────────
  const dragRef = useRef<{
    active: boolean;
    maskId: string;
    pointIndex: number | null;
    resizeDir: string;
    startMouse: { x: number; y: number };
    startShape: { x: number; y: number; w: number; h: number };
    startPoints: { x: number; y: number }[] | null;
    dragOffset: { x: number; y: number };
  }>({
    active: false, maskId: "", pointIndex: null, resizeDir: "",
    startMouse: { x: 0, y: 0 }, startShape: { x: 0, y: 0, w: 0, h: 0 },
    startPoints: null, dragOffset: { x: 0, y: 0 },
  });

  // Viewport pan dragging ref
  const panRef = useRef<{ active: boolean; startMouse: { x: number; y: number }; startPan: { x: number; y: number } }>({
    active: false, startMouse: { x: 0, y: 0 }, startPan: { x: 0, y: 0 },
  });

  const didDragRef = useRef(false);
  const [, forceUpdate] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Ref to always have latest nodes/updateMaskNodeData/saveHistory/edges
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const updateMaskRef = useRef(updateMaskNodeData);
  const saveHistoryRef = useRef(saveHistory);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  useEffect(() => { updateMaskRef.current = updateMaskNodeData; }, [updateMaskNodeData]);
  useEffect(() => { saveHistoryRef.current = saveHistory; }, [saveHistory]);

  // ─── Convert screen coords → canvas (1920×1080) coords ───────────
  const screenToCanvas = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const canvasX = (clientX - cx - panStateRef.current.x) / zoomRef.current + CANVAS_W / 2;
    const canvasY = (clientY - cy - panStateRef.current.y) / zoomRef.current + CANVAS_H / 2;
    return { x: canvasX, y: canvasY };
  }, []); // no deps — reads from refs

  // ─── Wheel: zoom ─────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setZoom(z => Math.max(0.15, Math.min(8, z * factor)));
  }, []);

  // ─── Middle mouse pan start ────────────────────────────────────────
  const handleContainerMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      panRef.current = { active: true, startMouse: { x: e.clientX, y: e.clientY }, startPan: { ...pan } };
    }
  }, [pan]);

  // ─── Check polygon edge hover for insertion preview ───────────────
  const checkEdgeHover = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (editorTool !== "freeform" || !selectedMaskId) { setHoveredEdge(null); return; }
    const canvas = screenToCanvas(e.clientX, e.clientY);
    const mask = allMaskShapes.find((m) => m.id === selectedMaskId);
    if (!mask || mask.type !== "freeform" || !mask.points || mask.points.length < 2) {
      setHoveredEdge(null); return;
    }
    let minDist = 18 / zoom; // pixel threshold scaled by zoom
    let best: typeof hoveredEdge = null;
    const pts = mask.points;
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      if (dx === 0 && dy === 0) continue;
      const t = Math.max(0, Math.min(1, ((canvas.x - p1.x) * dx + (canvas.y - p1.y) * dy) / (dx * dx + dy * dy)));
      const cx = p1.x + t * dx, cy = p1.y + t * dy;
      const dist = Math.hypot(canvas.x - cx, canvas.y - cy);
      if (dist < minDist) { minDist = dist; best = { maskId: mask.id, insertIndex: i + 1, x: cx, y: cy }; }
    }
    setHoveredEdge(best);
  }, [editorTool, selectedMaskId, allMaskShapes, screenToCanvas, zoom]);

  // ─── Mouse down on shape (start drag/resize) ─────────────────────
  const handleShapeMouseDown = useCallback((e: React.MouseEvent, maskId: string, resizeDir = "") => {
    e.stopPropagation();
    setSelectedMaskId(maskId);
    didDragRef.current = false;
    const canvas = screenToCanvas(e.clientX, e.clientY);
    const maskNode = nodes.find(n => n.id === maskId);
    const nd = maskNode?.data as any;
    const mx = nd?.maskX ?? nd?.x ?? 200, my = nd?.maskY ?? nd?.y ?? 200;
    const mw = nd?.maskW ?? nd?.w ?? 200, mh = nd?.maskH ?? nd?.h ?? 200;
    dragRef.current = {
      active: true, maskId, pointIndex: null, resizeDir,
      startMouse: canvas, startShape: { x: mx, y: my, w: mw, h: mh },
      startPoints: nd?.points ? nd.points.map((p: any) => ({ ...p })) : null,
      dragOffset: { x: canvas.x - mx, y: canvas.y - my },
    };
  }, [screenToCanvas, nodes, setSelectedMaskId]);

  // ─── Mouse down on vertex ─────────────────────────────────────────
  const handleVertexMouseDown = useCallback((e: React.MouseEvent, maskId: string, ptIdx: number) => {
    e.stopPropagation();
    setSelectedMaskId(maskId);
    didDragRef.current = false;
    const canvas = screenToCanvas(e.clientX, e.clientY);
    const maskNode = nodes.find(n => n.id === maskId);
    const nd = maskNode?.data as any;
    dragRef.current = {
      active: true, maskId, pointIndex: ptIdx, resizeDir: "",
      startMouse: canvas, startShape: { x: 0, y: 0, w: 0, h: 0 },
      startPoints: nd?.points ? nd.points.map((p: any) => ({ ...p })) : null,
      dragOffset: { x: 0, y: 0 },
    };
  }, [screenToCanvas, nodes, setSelectedMaskId]);

  // ─── Global mouse move (attached to window for reliability) ──────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      // Handle viewport pan
      if (panRef.current.active) {
        const dx = e.clientX - panRef.current.startMouse.x;
        const dy = e.clientY - panRef.current.startMouse.y;
        setPan({ x: panRef.current.startPan.x + dx, y: panRef.current.startPan.y + dy });
        return;
      }

      if (!dragRef.current.active) return;

      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      // Use refs to get current zoom/pan — NO stale closure
      const z = zoomRef.current;
      const p = panStateRef.current;
      const canvasX = (e.clientX - cx - p.x) / z + CANVAS_W / 2;
      const canvasY = (e.clientY - cy - p.y) / z + CANVAS_H / 2;

      const dr = dragRef.current;
      didDragRef.current = true;

      if (dr.pointIndex !== null && dr.startPoints) {
        const nextPts = dr.startPoints.map((pt, i) =>
          i === dr.pointIndex ? {
            x: Math.max(0, Math.min(CANVAS_W, canvasX)),
            y: Math.max(0, Math.min(CANVAS_H, canvasY)),
          } : pt
        );
        updateMaskRef.current(dr.maskId, { points: nextPts });
        return;
      }

      const maskNode = nodesRef.current.find(n => n.id === dr.maskId);
      const nd = maskNode?.data as any;

      if (nd?.shape === "freeform" && dr.startPoints) {
        const ddx = canvasX - dr.startMouse.x;
        const ddy = canvasY - dr.startMouse.y;
        const nextPts = dr.startPoints.map((pt) => ({
          x: Math.max(0, Math.min(CANVAS_W, pt.x + ddx)),
          y: Math.max(0, Math.min(CANVAS_H, pt.y + ddy)),
        }));
        updateMaskRef.current(dr.maskId, { points: nextPts });
        return;
      }

      let { x, y, w, h } = dr.startShape;
      const ddx = canvasX - dr.startMouse.x;
      const ddy = canvasY - dr.startMouse.y;

      if (dr.resizeDir === "") {
        x = Math.max(0, Math.min(CANVAS_W - w, Math.round(x + ddx)));
        y = Math.max(0, Math.min(CANVAS_H - h, Math.round(y + ddy)));
      } else {
        if (dr.resizeDir.includes("right"))  w = Math.max(20, Math.min(CANVAS_W - x, Math.round(w + ddx)));
        if (dr.resizeDir.includes("bottom")) h = Math.max(20, Math.min(CANVAS_H - y, Math.round(h + ddy)));
        if (dr.resizeDir.includes("left"))   { const nw = Math.max(20, Math.round(w - ddx)); x = Math.round(x + w - nw); w = nw; }
        if (dr.resizeDir.includes("top"))    { const nh = Math.max(20, Math.round(h - ddy)); y = Math.round(y + h - nh); h = nh; }
      }
      updateMaskRef.current(dr.maskId, { maskX: x, maskY: y, maskW: w, maskH: h, x, y, w, h });
    };

    const onUp = (_e: MouseEvent) => {
      if (panRef.current.active) { panRef.current.active = false; return; }
      if (dragRef.current.active) {
        saveHistoryRef.current(nodesRef.current, edgesRef.current);
        dragRef.current.active = false;
        forceUpdate(n => n + 1);
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []); // Empty deps — everything accessed via refs

  // ─── Click on canvas: add point (freeform) or deselect ───────────
  const handleCanvasClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Suppress if we just dragged
    if (didDragRef.current) { didDragRef.current = false; return; }

    if (editorTool === "freeform" && selectedMaskId) {
      const canvas = screenToCanvas(e.clientX, e.clientY);
      const mask = allMaskShapes.find((m) => m.id === selectedMaskId);
      if (mask && mask.type === "freeform") {
        const pts = mask.points ?? [];
        let nextPts = [...pts];
        if (hoveredEdge && hoveredEdge.maskId === selectedMaskId) {
          nextPts.splice(hoveredEdge.insertIndex, 0, { x: Math.round(canvas.x), y: Math.round(canvas.y) });
          setHoveredEdge(null);
        } else {
          nextPts.push({ x: Math.round(canvas.x), y: Math.round(canvas.y) });
        }
        updateMaskNodeData(selectedMaskId, { points: nextPts });
        saveHistory(nodes, edges);
      }
    }
  }, [editorTool, selectedMaskId, allMaskShapes, hoveredEdge, screenToCanvas, updateMaskNodeData, saveHistory, nodes, edges]);

  const handleSvgMouseDown = useCallback((_e: React.MouseEvent<SVGSVGElement>) => {
    setSelectedMaskId("");
  }, [setSelectedMaskId]);

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-[#07080a] flex flex-col font-sans select-none text-[#f5f6f8]">

      {/* Header */}
      <div className="h-[60px] bg-[#111318] border-b border-white/8 px-6 flex items-center justify-between shadow-lg shrink-0">
        <div className="flex items-center gap-6">
          <span className="text-sm font-bold text-white/80">Mask Studio</span>
          <div className="flex gap-4 text-xs font-semibold text-[#949ca9]">
            <span className="cursor-pointer hover:text-white">File</span>
            <span className="cursor-pointer hover:text-white">Edit</span>
            <span className="cursor-pointer hover:text-white">View</span>
          </div>
        </div>
        <div className="flex gap-3 items-center">
          <button
            onClick={() => { if (maskBackup) { setNodes(maskBackup.nodes); setEdges(maskBackup.edges); } setEditingMaskNode(null); }}
            className="px-4 py-2 text-xs font-semibold border border-white/8 rounded-md bg-transparent text-[#f5f6f8] hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-500 transition duration-200"
          >Discard</button>
          <button
            onClick={() => { saveHistory(nodes, edges); setEditingMaskNode(null); }}
            className="px-5 py-2 text-xs font-bold bg-[#ea580c] rounded-md shadow-[0_4px_15px_rgba(234,88,12,0.35)] hover:scale-[1.02] active:scale-100 transition duration-200"
          >Save & Close</button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* LEFT TOOLBAR */}
        <div className="w-[60px] bg-[#111318] border-r border-white/8 flex flex-col items-center py-4 gap-4 shrink-0">
          <button onClick={() => setEditorTool("select")} title="Selection Tool"
            className={`p-2 rounded-lg cursor-pointer hover:bg-white/5 transition ${editorTool === "select" ? "text-[#ea580c] bg-orange-600/10" : "text-[#949ca9]"}`}>
            <Move size={16} />
          </button>
          <button onClick={() => { addMaskShape("rect"); setEditorTool("select"); }} title="Add Rectangle"
            className="p-2 rounded-lg cursor-pointer hover:bg-white/5 transition text-[#949ca9]">
            <Crop size={16} />
          </button>
          <button onClick={() => { addMaskShape("circle"); setEditorTool("select"); }} title="Add Circle"
            className="p-2 rounded-lg cursor-pointer hover:bg-white/5 transition text-[#949ca9]">
            <Scissors size={16} />
          </button>
          <button onClick={() => { addMaskShape("freeform"); setEditorTool("freeform"); }} title="Vector Pen Tool"
            className={`p-2 rounded-lg cursor-pointer hover:bg-white/5 transition ${editorTool === "freeform" ? "text-[#ea580c] bg-orange-600/10" : "text-[#949ca9]"}`}>
            <Maximize size={16} className="rotate-45" />
          </button>

          <div className="w-6 h-[1px] bg-white/8 my-1" />
          <button onClick={undo} title="Undo" className="p-2 text-[#949ca9] rounded-lg hover:bg-white/5 cursor-pointer transition"><Undo size={16} /></button>
          <button onClick={redo} title="Redo" className="p-2 text-[#949ca9] rounded-lg hover:bg-white/5 cursor-pointer transition"><Redo size={16} /></button>
          <button onClick={() => { if (selectedMaskId) deleteMaskShape(selectedMaskId); }} title="Delete" className="p-2 text-red-500 rounded-lg hover:bg-red-500/10 cursor-pointer transition"><Trash size={16} /></button>

          <div className="w-6 h-[1px] bg-white/8 my-1" />
          <button onClick={() => setZoom(z => Math.min(8, z * 1.25))} title="Zoom In" className="p-2 text-[#949ca9] rounded-lg hover:bg-white/5 cursor-pointer transition"><ZoomIn size={16} /></button>
          <button onClick={() => setZoom(z => Math.max(0.15, z / 1.25))} title="Zoom Out" className="p-2 text-[#949ca9] rounded-lg hover:bg-white/5 cursor-pointer transition"><ZoomOut size={16} /></button>
          <button onClick={resetView} title="Reset View" className="p-1 text-[9px] text-[#949ca9] rounded cursor-pointer hover:text-white transition font-bold">FIT</button>
        </div>

        {/* EDIT VIEW (MIDDLE) */}
        <div className="flex-1 border-r border-white/8 flex flex-col min-w-0">
          <div className="h-8 px-4 flex items-center justify-between border-b border-white/5 shrink-0">
            <span className="text-[10px] text-[#ea580c] font-bold tracking-wider uppercase">EDIT VIEW</span>
            <div className="flex items-center gap-3 text-[10px] text-[#949ca9]">
              <span>{Math.round(zoom * 100)}%</span>
              <span>•</span>
              <span>Scroll: zoom  •  Alt+drag / MMB: pan</span>
              {editorTool === "freeform" && <span className="text-[#ea580c]">• Click: add point  •  Click edge: insert</span>}
            </div>
          </div>

          <div
            ref={containerRef}
            className="flex-1 relative bg-[#0a0b0e] overflow-hidden flex items-center justify-center"
            style={{ cursor: editorTool === "freeform" ? "crosshair" : "default" }}
            onWheel={handleWheel}
            onMouseDown={handleContainerMouseDown}
          >
            {/* Checkerboard pattern */}
            <div className="absolute inset-0 opacity-20" style={{
              backgroundImage: "repeating-conic-gradient(#333 0% 25%, transparent 0% 50%)",
              backgroundSize: "24px 24px"
            }} />

            {/* Zoomable / pannable viewport */}
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "center center",
                width: `${CANVAS_W}px`,
                height: `${CANVAS_H}px`,
                position: "absolute",
              }}
            >
              {/* Live Video Canvas */}
              <canvas
                className="mask-editor-video-canvas absolute inset-0 w-full h-full"
                width={CANVAS_W}
                height={CANVAS_H}
                style={{ imageRendering: "auto" }}
              />

              {/* SVG Interaction Layer */}
              <svg
                ref={svgRef}
                className="mask-editor-svg absolute inset-0"
                width={CANVAS_W}
                height={CANVAS_H}
                viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
                style={{ overflow: "visible" }}
                onMouseMove={checkEdgeHover}
                onMouseLeave={() => setHoveredEdge(null)}
                onClick={handleCanvasClick}
                onMouseDown={handleSvgMouseDown}
              >
                <defs>
                  {allMaskShapes.map(m => (
                    <filter key={`f-${m.id}`} id={`feather-${m.id}`} x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation={Math.max(0, (m.feather ?? 0) / 4)} />
                    </filter>
                  ))}
                </defs>

                {allMaskShapes.map((m: MaskShape, idx) => {
                  const isSelected = m.id === selectedMaskId;
                  const color = maskColors[idx % maskColors.length];
                  const fillColor = m.subtractMode ? "rgba(7,8,10,0.75)" : `${color}26`;
                  const strokeColor = isSelected ? color : `${color}88`;
                  const strokeW = (isSelected ? 2.5 : 1.5) / zoom;
                  const filterUrl = m.feather && m.feather > 0 ? `url(#feather-${m.id})` : undefined;
                  const handleSize = 10 / zoom;

                  return (
                    <g key={m.id}>
                      {/* Shape body */}
                      {m.type === "circle" ? (
                        <ellipse
                          cx={(m.x ?? 0) + (m.w ?? 200) / 2}
                          cy={(m.y ?? 0) + (m.h ?? 200) / 2}
                          rx={(m.w ?? 200) / 2}
                          ry={(m.h ?? 200) / 2}
                          fill={fillColor}
                          stroke={strokeColor}
                          strokeWidth={strokeW}
                          filter={filterUrl}
                          onMouseDown={(e) => handleShapeMouseDown(e, m.id)}
                          style={{ cursor: "move" }}
                        />
                      ) : m.type === "freeform" ? (
                        <polygon
                          points={m.points?.map(p => `${p.x},${p.y}`).join(" ")}
                          fill={fillColor}
                          stroke={strokeColor}
                          strokeWidth={strokeW}
                          filter={filterUrl}
                          onMouseDown={(e) => handleShapeMouseDown(e, m.id)}
                          style={{ cursor: editorTool === "freeform" ? "crosshair" : "move" }}
                        />
                      ) : (
                        <rect
                          x={m.x ?? 0}
                          y={m.y ?? 0}
                          width={m.w ?? 200}
                          height={m.h ?? 200}
                          rx={m.roundness}
                          ry={m.roundness}
                          fill={fillColor}
                          stroke={strokeColor}
                          strokeWidth={strokeW}
                          filter={filterUrl}
                          onMouseDown={(e) => handleShapeMouseDown(e, m.id)}
                          style={{ cursor: "move" }}
                        />
                      )}

                      {/* Resize handles (rect/circle) */}
                      {isSelected && m.type !== "freeform" && (() => {
                        const x = m.x ?? 0, y = m.y ?? 0, w = m.w ?? 200, h = m.h ?? 200;
                        const handles = [
                          { cx: x,     cy: y,     dir: "top-left" },
                          { cx: x+w/2, cy: y,     dir: "top" },
                          { cx: x+w,   cy: y,     dir: "top-right" },
                          { cx: x+w,   cy: y+h/2, dir: "right" },
                          { cx: x+w,   cy: y+h,   dir: "bottom-right" },
                          { cx: x+w/2, cy: y+h,   dir: "bottom" },
                          { cx: x,     cy: y+h,   dir: "bottom-left" },
                          { cx: x,     cy: y+h/2, dir: "left" },
                        ];
                        const cursors: Record<string, string> = {
                          "top-left": "nwse-resize", "top-right": "nesw-resize",
                          "bottom-left": "nesw-resize", "bottom-right": "nwse-resize",
                          "top": "ns-resize", "bottom": "ns-resize",
                          "left": "ew-resize", "right": "ew-resize",
                        };
                        return handles.map(h => (
                          <rect
                            key={h.dir}
                            x={h.cx - handleSize / 2}
                            y={h.cy - handleSize / 2}
                            width={handleSize}
                            height={handleSize}
                            rx={handleSize / 4}
                            fill="white"
                            stroke={color}
                            strokeWidth={1.5 / zoom}
                            onMouseDown={(e) => { e.stopPropagation(); handleShapeMouseDown(e, m.id, h.dir); }}
                            style={{ cursor: cursors[h.dir] }}
                          />
                        ));
                      })()}

                      {/* Freeform vertex handles */}
                      {isSelected && m.type === "freeform" && m.points?.map((p, ptIdx) => (
                        <g key={ptIdx}>
                          {/* Edge lines (clickable for insertion when not on vertex) */}
                          <circle
                            cx={p.x} cy={p.y} r={handleSize * 0.6}
                            fill="white" stroke={color} strokeWidth={1.5 / zoom}
                            onMouseDown={(e) => handleVertexMouseDown(e, m.id, ptIdx)}
                            style={{ cursor: "grab" }}
                          />
                          <text x={p.x + handleSize} y={p.y - handleSize * 0.5}
                            fontSize={10 / zoom} fill={color} style={{ pointerEvents: "none", fontWeight: "bold" }}>
                            {ptIdx + 1}
                          </text>
                        </g>
                      ))}

                      {/* Edge insertion preview dot */}
                      {hoveredEdge && hoveredEdge.maskId === m.id && (
                        <circle
                          cx={hoveredEdge.x} cy={hoveredEdge.y}
                          r={7 / zoom}
                          fill="#ea580c" stroke="white" strokeWidth={2 / zoom}
                          style={{ pointerEvents: "none" }}
                        />
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Zoom indicator */}
            <div className="absolute bottom-3 right-3 text-[10px] text-white/30 font-mono bg-black/40 px-2 py-1 rounded pointer-events-none">
              {Math.round(zoom * 100)}%
            </div>
          </div>
        </div>

        {/* MASK PREVIEW */}
        <div className="w-[280px] border-r border-white/8 flex flex-col min-w-0 shrink-0">
          <div className="h-8 px-4 flex items-center border-b border-white/5 shrink-0">
            <span className="text-[10px] text-[#949ca9] font-bold tracking-wider uppercase">MASK PREVIEW</span>
          </div>
          <div className="flex-1 relative bg-black overflow-hidden flex items-center justify-center">
            <canvas className="mask-editor-preview-canvas w-full h-full object-contain" width={CANVAS_W} height={CANVAS_H} />
          </div>
        </div>

        {/* SIDEBAR: LAYERS + SETTINGS */}
        <div className="w-[300px] bg-[#111318] flex flex-col shrink-0 min-w-0">

          {/* Layers */}
          <div className="h-8 px-4 flex items-center border-b border-white/5 shrink-0">
            <span className="text-[10px] text-[#ea580c] font-bold tracking-wider uppercase">LAYERS</span>
          </div>
          <div className="flex-1 overflow-y-auto flex flex-col gap-1 p-3 min-h-[100px]">
            {allMaskShapes.length === 0 && (
              <div className="text-[11px] text-[#5e6673] italic text-center mt-4">
                No masks yet. Use the toolbar to add shapes.
              </div>
            )}
            {allMaskShapes.map((m: MaskShape, idx: number) => {
              const isSelected = m.id === selectedMaskId;
              const layerColor = maskColors[idx % maskColors.length];
              return (
                <div
                  key={m.id}
                  onClick={() => setSelectedMaskId(m.id)}
                  className={`flex items-center justify-between rounded-lg p-2.5 cursor-pointer border transition duration-200 ${
                    isSelected ? "border-opacity-80 bg-white/4" : "bg-[#171a21]/40 border-white/6 hover:bg-[#171a21]/80"
                  }`}
                  style={{ borderColor: isSelected ? layerColor : undefined }}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: layerColor, boxShadow: `0 0 6px ${layerColor}` }} />
                    <input
                      type="text"
                      value={m.name || ""}
                      placeholder={m.type === "circle" ? "Circle Mask" : m.type === "rect" ? "Rect Mask" : "Freeform Mask"}
                      onChange={(e) => updateMaskNodeData(m.id, { name: e.target.value })}
                      className="bg-transparent border-none text-xs font-semibold text-zinc-100 outline-none w-28 hover:bg-white/5 focus:bg-white/10 px-1 rounded transition duration-200"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    />
                    <span className="text-[9px] text-white/25 shrink-0">{m.type}</span>
                  </div>
                  <div className="flex gap-2 items-center shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); updateMaskNodeData(m.id, { subtractMode: !m.subtractMode }); }}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition ${m.subtractMode ? "bg-[#ea580c] border-[#ea580c] text-white" : "border-white/8 text-[#949ca9] hover:text-white"}`}
                      title="Subtract Mode"
                    >Sub</button>
                    <button onClick={(e) => { e.stopPropagation(); deleteMaskShape(m.id); }} className="text-red-500/50 hover:text-red-500 transition" title="Delete">
                      <Trash size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Settings */}
          <div className="border-t border-white/6 p-3 flex flex-col gap-2 shrink-0">
            <span className="text-[10px] text-[#949ca9] font-bold tracking-wider uppercase">SHAPE SETTINGS</span>
            {selectedMask ? (
              <div className="flex flex-col gap-2 mt-1">
                <label className="text-[10px] text-[#949ca9] flex justify-between">
                  <span>Opacity</span><span>{Math.round((selectedMask.opacity ?? 1) * 100)}%</span>
                </label>
                <input type="range" min="0" max="1" step="0.05"
                  value={selectedMask.opacity ?? 1}
                  onChange={(e) => updateMaskNodeData(selectedMaskId, { opacity: parseFloat(e.target.value) })}
                  className="w-full accent-[#ea580c]" />

                <label className="text-[10px] text-[#949ca9] flex justify-between">
                  <span>Feather</span><span>{selectedMask.feather ?? 0}px</span>
                </label>
                <input type="range" min="0" max="100" step="1"
                  value={selectedMask.feather ?? 0}
                  onChange={(e) => updateMaskNodeData(selectedMaskId, { feather: parseInt(e.target.value) })}
                  className="w-full accent-[#ea580c]" />

                {selectedMask.type === "rect" && (
                  <>
                    <label className="text-[10px] text-[#949ca9] flex justify-between">
                      <span>Roundness</span><span>{selectedMask.roundness ?? 0}px</span>
                    </label>
                    <input type="range" min="0" max="200" step="1"
                      value={selectedMask.roundness ?? 0}
                      onChange={(e) => updateMaskNodeData(selectedMaskId, { roundness: parseInt(e.target.value) })}
                      className="w-full accent-[#ea580c]" />
                  </>
                )}
              </div>
            ) : (
              <div className="text-[#5e6673] text-[11px] italic mt-1">No layer selected</div>
            )}
          </div>
        </div>
      </div>

      {/* FOOTER PLAYBACK */}
      <div className="h-[45px] bg-[#111318] border-t border-white/8 px-6 flex items-center gap-4 shrink-0">
        <button onClick={() => setIsPlaying(!isPlaying)} className="text-white hover:text-[#ea580c] transition cursor-pointer">
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <span className="text-[10px] text-[#949ca9] w-12 text-left">
          {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, "0")}
        </span>
        <div className="flex-1">
          <input type="range" min="0" max={duration} step="0.1" value={currentTime}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (masterVideoRef.current) masterVideoRef.current.currentTime = val;
              setCurrentTime(val);
            }}
            className="w-full accent-[#ea580c]" />
        </div>
        <span className="text-[10px] text-[#949ca9] w-12 text-right">
          {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}
