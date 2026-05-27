import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Layer, MaskShape, defaultPresets } from "../presets";
import {
  Play, Pause, Sparkles, Image as ImageIcon, Crop, Scissors,
  Save, FolderOpen, Check, Grid, ChevronDown
} from "lucide-react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeTypes } from "../nodes";
import { OutputPreview } from "./OutputPreview";
import { VideoScrubber } from "./VideoScrubber";
import { MaskStudio } from "./MaskStudio";

const BLEND_PORTS_MAPPING: Record<string, string> = {
  "layer_0": "Main Video",
  "layer_1": "Minimap",
  "layer_2": "Killfeed",
  "layer_3": "My Team",
  "layer_4": "Enemies",
  "layer_5": "Health",
  "layer_6": "Ammo",
  "layer_7": "Timer"
};



const drawImageCover = (ctx: CanvasRenderingContext2D, img: HTMLVideoElement, x: number, y: number, w: number, h: number) => {
  const imgW = img.videoWidth || img.width;
  const imgH = img.videoHeight || img.height;
  if (!imgW || !imgH) return;

  const imgAspect = imgW / imgH;
  const targetAspect = w / h;

  let srcX = 0, srcY = 0, srcW = imgW, srcH = imgH;

  if (imgAspect > targetAspect) {
    srcW = imgH * targetAspect;
    srcX = (imgW - srcW) / 2;
  } else {
    srcH = imgW / targetAspect;
    srcY = (imgH - srcH) / 2;
  }

  ctx.drawImage(img, srcX, srcY, srcW, srcH, x, y, w, h);
};

const findNextFreeOutputPort = (nodes: Node[], edges: Edge[]) => {
  const outputNode = nodes.find(n => n.type === "output");
  if (!outputNode) return null;

  for (let i = 0; i < 9; i++) {
    const portId = `layer_${i}`;
    const isConnected = edges.some(e => e.target === outputNode.id && e.targetHandle === portId);
    if (!isConnected) {
      return portId;
    }
  }
  return null;
};

const traceDownstreamToBlendPort = (nodeId: string, edges: Edge[], nodes: Node[]): string | null => {
  let currentId: string | null = nodeId;
  let currentHandle: string | null = null;

  while (currentId) {
    const edge = edges.find(e => e.source === currentId);
    if (!edge) break;

    const targetNode = nodes.find(n => n.id === edge.target);
    if (!targetNode) break;

    if (targetNode.type === "output") {
      currentHandle = edge.targetHandle || null;
      break;
    }

    currentId = targetNode.id;
  }

  return currentHandle;
};

// Persistent offscreen canvas cache (reused across frames, no GC pressure)
const _offscreenCache = new Map<string, HTMLCanvasElement>();
const getOffscreen = (key: string, w: number, h: number): HTMLCanvasElement => {
  let c = _offscreenCache.get(key);
  if (!c || c.width !== w || c.height !== h) {
    c = document.createElement("canvas");
    c.width = w; c.height = h;
    _offscreenCache.set(key, c);
  }
  return c;
};

// Draw a mask layer into a canvas of size (width x height).
// maskX/Y/W/H are in 1920×1080 source space.
const drawLayerWithFeather = (
  ctx: CanvasRenderingContext2D,
  master: HTMLVideoElement,
  layer: Layer,
  width: number,
  height: number
) => {
  const vW = master.videoWidth;
  const vH = master.videoHeight;
  if (!vW || !vH) return;

  // Scale from source 1920×1080 space → video pixel space
  const svX = vW / 1920;
  const svY = vH / 1080;

  ctx.clearRect(0, 0, width, height);

  if (layer.masks && layer.masks.length > 0) {
    layer.masks.forEach((m, mi) => {
      // Offscreen mask alpha channel
      const maskC = getOffscreen(`mask_${layer.id}_${mi}`, width, height);
      const maskCtx = maskC.getContext("2d")!;
      maskCtx.clearRect(0, 0, width, height);
      maskCtx.fillStyle = "white";
      maskCtx.beginPath();

      if (m.type === "circle") {
        // Position mask in canvas coords
        const mx = (m.x / 1920) * width;
        const my = (m.y / 1080) * height;
        const mw = (m.w / 1920) * width;
        const mh = (m.h / 1080) * height;
        maskCtx.ellipse(mx + mw / 2, my + mh / 2, mw / 2, mh / 2, 0, 0, Math.PI * 2);
      } else if (m.type === "freeform" && m.points && m.points.length > 0) {
        m.points.forEach((p, pidx) => {
          const px = (p.x / 1920) * width;
          const py = (p.y / 1080) * height;
          if (pidx === 0) maskCtx.moveTo(px, py);
          else maskCtx.lineTo(px, py);
        });
        maskCtx.closePath();
      } else {
        const mx = (m.x / 1920) * width;
        const my = (m.y / 1080) * height;
        const mw = (m.w / 1920) * width;
        const mh = (m.h / 1080) * height;
        maskCtx.rect(mx, my, mw, mh);
      }
      maskCtx.fill();

      // Feathering: blur the mask alpha
      const featherVal = m.feather ?? 0;
      if (featherVal > 0) {
        const blurPx = Math.max(0.5, featherVal * (width / 1920));
        const blurC = getOffscreen(`blur_${layer.id}_${mi}`, width, height);
        const blurCtx = blurC.getContext("2d")!;
        blurCtx.clearRect(0, 0, width, height);
        blurCtx.filter = `blur(${blurPx}px)`;
        blurCtx.drawImage(maskC, 0, 0);
        blurCtx.filter = "none";
        maskCtx.clearRect(0, 0, width, height);
        maskCtx.drawImage(blurC, 0, 0);
      }

      // Composite video onto mask
      maskCtx.save();
      maskCtx.globalCompositeOperation = "source-in";
      const fStr = `blur(${layer.blur || 0}px) brightness(${layer.brightness ?? 1}) contrast(${layer.contrast ?? 1})`;
      maskCtx.filter = fStr;
      if (m.type === "freeform") {
        // Full frame for freeform
        maskCtx.drawImage(master, 0, 0, vW, vH, 0, 0, width, height);
      } else {
        // Crop from source region
        maskCtx.drawImage(master, m.x * svX, m.y * svY, m.w * svX, m.h * svY, (m.x / 1920) * width, (m.y / 1080) * height, (m.w / 1920) * width, (m.h / 1080) * height);
      }
      maskCtx.filter = "none";
      maskCtx.restore();

      ctx.globalAlpha = m.opacity ?? 1;
      ctx.drawImage(maskC, 0, 0);
      ctx.globalAlpha = 1;
    });
  } else {
    ctx.save();
    if (layer.maskShape === "circle") {
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, Math.min(width, height) / 2, 0, Math.PI * 2);
      ctx.clip();
    }
    ctx.filter = `blur(${layer.blur || 0}px) brightness(${layer.brightness ?? 1}) contrast(${layer.contrast ?? 1})`;
    ctx.drawImage(master, layer.cropArea.x * svX, layer.cropArea.y * svY, layer.cropArea.w * svX, layer.cropArea.h * svY, 0, 0, width, height);
    ctx.filter = "none";
    ctx.restore();
  }
};

// Draw a compiled layer at a specific destination rect on a shared canvas
const drawLayerOnSharedCanvas = (
  ctx: CanvasRenderingContext2D,
  master: HTMLVideoElement,
  layer: Layer,
  px: number, py: number, pw: number, ph: number
) => {
  const vW = master.videoWidth;
  const vH = master.videoHeight;
  if (!vW || !vH || pw <= 0 || ph <= 0) return;
  const svX = vW / 1920, svY = vH / 1080;

  if (layer.masks && layer.masks.length > 0) {
    layer.masks.forEach((m, mi) => {
      const maskC = getOffscreen(`shared_mask_${layer.id}_${mi}`, Math.ceil(pw), Math.ceil(ph));
      const maskCtx = maskC.getContext("2d")!;
      maskCtx.clearRect(0, 0, pw, ph);
      maskCtx.fillStyle = "white";
      maskCtx.beginPath();

      if (m.type === "circle") {
        const mx = (m.x / 1920) * pw, my = (m.y / 1080) * ph;
        const mw = (m.w / 1920) * pw, mh = (m.h / 1080) * ph;
        maskCtx.ellipse(mx + mw / 2, my + mh / 2, mw / 2, mh / 2, 0, 0, Math.PI * 2);
      } else if (m.type === "freeform" && m.points && m.points.length > 0) {
        m.points.forEach((p, pidx) => {
          const rx = (p.x / 1920) * pw, ry = (p.y / 1080) * ph;
          if (pidx === 0) maskCtx.moveTo(rx, ry); else maskCtx.lineTo(rx, ry);
        });
        maskCtx.closePath();
      } else {
        const mx = (m.x / 1920) * pw, my = (m.y / 1080) * ph;
        const mw = (m.w / 1920) * pw, mh = (m.h / 1080) * ph;
        maskCtx.rect(mx, my, mw, mh);
      }
      maskCtx.fill();

      const featherVal = m.feather ?? 0;
      if (featherVal > 0) {
        const blurPx = Math.max(0.5, featherVal * (pw / 1920));
        const blurC = getOffscreen(`shared_blur_${layer.id}_${mi}`, Math.ceil(pw), Math.ceil(ph));
        const blurCtx = blurC.getContext("2d")!;
        blurCtx.clearRect(0, 0, pw, ph);
        blurCtx.filter = `blur(${blurPx}px)`;
        blurCtx.drawImage(maskC, 0, 0);
        blurCtx.filter = "none";
        maskCtx.clearRect(0, 0, pw, ph);
        maskCtx.drawImage(blurC, 0, 0);
      }

      maskCtx.save();
      maskCtx.globalCompositeOperation = "source-in";
      maskCtx.filter = `blur(${layer.blur || 0}px) brightness(${layer.brightness ?? 1}) contrast(${layer.contrast ?? 1})`;
      if (m.type === "freeform") {
        maskCtx.drawImage(master, 0, 0, vW, vH, 0, 0, pw, ph);
      } else {
        maskCtx.drawImage(master, m.x * svX, m.y * svY, m.w * svX, m.h * svY, (m.x / 1920) * pw, (m.y / 1080) * ph, (m.w / 1920) * pw, (m.h / 1080) * ph);
      }
      maskCtx.filter = "none";
      maskCtx.restore();

      ctx.globalAlpha = m.opacity ?? 1;
      ctx.drawImage(maskC, px, py);
      ctx.globalAlpha = 1;
    });
  } else {
    ctx.save();
    if (layer.maskShape === "circle") {
      ctx.beginPath();
      ctx.arc(px + pw / 2, py + ph / 2, Math.min(pw, ph) / 2, 0, Math.PI * 2);
      ctx.clip();
    }
    ctx.filter = `blur(${layer.blur || 0}px) brightness(${layer.brightness ?? 1}) contrast(${layer.contrast ?? 1})`;
    ctx.drawImage(master, layer.cropArea.x * svX, layer.cropArea.y * svY, layer.cropArea.w * svX, layer.cropArea.h * svY, px, py, pw, ph);
    ctx.filter = "none";
    ctx.restore();
  }
};

export function FlowEditor({
  videoPath, videoName, duration,
  currentTime, isPlaying, setIsPlaying,
  masterVideoRef, trimStart, trimEnd, setTrimStart, setTrimEnd, setCurrentTime
}: any) {

  // Graph State
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const reactFlowInstance = useRef<any>(null);

  // Undo/Redo history
  const [history, setHistory] = useState<{ nodes: Node[], edges: Edge[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const saveHistory = useCallback((nds: Node[], eds: Edge[]) => {
    setHistory(prev => {
      const next = prev.slice(0, historyIndex + 1);
      next.push({ nodes: JSON.parse(JSON.stringify(nds)), edges: JSON.parse(JSON.stringify(eds)) });
      return next.slice(-20); // Keep last 20 states
    });
    setHistoryIndex(prev => Math.min(19, prev + 1));
  }, [historyIndex]);

  const undo = () => {
    if (historyIndex > 0) {
      const state = history[historyIndex - 1];
      setNodes(state.nodes);
      setEdges(state.edges);
      setHistoryIndex(historyIndex - 1);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const state = history[historyIndex + 1];
      setNodes(state.nodes);
      setEdges(state.edges);
      setHistoryIndex(historyIndex + 1);
    }
  };

  // Keyboard shortcuts for graph undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
      if (e.ctrlKey && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [historyIndex, history]);

  // Context Menu State
  const [menuPos, setMenuPos] = useState<{ x: number, y: number } | null>(null);
  const [connectingHandle, setConnectingHandle] = useState<any>(null);
  const [maskBackup, setMaskBackup] = useState<{ nodes: Node[], edges: Edge[] } | null>(null);

  // Guides Mode State
  const [guidesActive, setGuidesActive] = useState(false);

  // Output Preview Dragging — ref-based for zero lag
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const outputDragRef = useRef<{
    active: boolean;
    layerId: string;
    nodeId: string;
    nodeType: string;
    startMouse: { x: number; y: number };
    startPos: { x: number; y: number };
    startMasks: { x: number; y: number }[] | null; // freeform/mask shapes
    containerRect: DOMRect | null;
  }>({
    active: false, layerId: "", nodeId: "", nodeType: "",
    startMouse: { x: 0, y: 0 }, startPos: { x: 0, y: 0 },
    startMasks: null, containerRect: null,
  });
  const outputPreviewContainerRef = useRef<HTMLDivElement>(null);

  // Mask Editor State
  const [editingMaskNode, setEditingMaskNode] = useState<{ id: string, data: any } | null>(null);
  const [selectedMaskId, setSelectedMaskId] = useState<string>("");
  const [editorTool, setEditorTool] = useState<"select" | "rect" | "circle" | "freeform">("select");

  const updateMaskNodeData = useCallback((maskId: string, fields: Partial<MaskShape> | any) => {
    setNodes(nds => nds.map(n => {
      if (n.id === maskId) {
        const updatedData = { ...n.data };

        if ((n.data as any).masks && (n.data as any).masks.length > 0) {
          updatedData.masks = (n.data as any).masks.map((m: any) => ({ ...m, ...fields }));
        }

        if (fields.name !== undefined) updatedData.label = fields.name;
        if (fields.type !== undefined) updatedData.shape = fields.type;
        if (fields.x !== undefined) updatedData.maskX = fields.x;
        if (fields.y !== undefined) updatedData.maskY = fields.y;
        if (fields.w !== undefined) updatedData.maskW = fields.w;
        if (fields.h !== undefined) updatedData.maskH = fields.h;
        if (fields.points !== undefined) updatedData.points = fields.points;
        if (fields.opacity !== undefined) updatedData.opacity = fields.opacity;
        if (fields.feather !== undefined) updatedData.feather = fields.feather;
        if (fields.roundness !== undefined) updatedData.roundness = fields.roundness;
        if (fields.subtractMode !== undefined) updatedData.subtractMode = fields.subtractMode;

        for (const key in fields) {
          if (!["id", "name", "type", "x", "y", "w", "h", "points", "opacity", "feather", "roundness", "subtractMode"].includes(key)) {
            updatedData[key] = fields[key];
          }
        }

        return { ...n, data: updatedData };
      }
      return n;
    }));
  }, []);

  const allMaskShapes = nodes
    .filter(n => n.type === "mask")
    .map(n => {
      const nd = n.data as any;
      if (nd.masks && nd.masks.length > 0) {
        const m = nd.masks[0];
        return {
          id: n.id,
          name: nd.label || "Maske",
          type: nd.shape || m.type || "circle",
          x: nd.maskX ?? m.x ?? 200,
          y: nd.maskY ?? m.y ?? 200,
          w: nd.maskW ?? m.w ?? 200,
          h: nd.maskH ?? m.h ?? 200,
          points: nd.points ?? m.points ?? [],
          opacity: nd.opacity ?? m.opacity ?? 1.0,
          feather: nd.feather ?? m.feather ?? 0,
          roundness: nd.roundness ?? m.roundness ?? 0,
          subtractMode: nd.subtractMode ?? m.subtractMode ?? false
        };
      }
      return {
        id: n.id,
        name: nd.label || "Maske",
        type: nd.shape || "circle",
        x: nd.maskX ?? 200,
        y: nd.maskY ?? 200,
        w: nd.maskW ?? 200,
        h: nd.maskH ?? 200,
        points: nd.points || [],
        opacity: nd.opacity ?? 1.0,
        feather: nd.feather ?? 0,
        roundness: nd.roundness ?? 0,
        subtractMode: nd.subtractMode ?? false
      };
    });

  useEffect(() => {
    const handleOpenMask = (e: any) => {
      const nodeId = e.detail.nodeId;
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        const ndata = node.data as any;
        if (ndata.maskX === undefined) {
          ndata.maskX = ndata.masks?.[0]?.x ?? 200;
          ndata.maskY = ndata.masks?.[0]?.y ?? 200;
          ndata.maskW = ndata.masks?.[0]?.w ?? 200;
          ndata.maskH = ndata.masks?.[0]?.h ?? 200;
          ndata.shape = ndata.masks?.[0]?.type ?? ndata.shape ?? "circle";
          ndata.points = ndata.masks?.[0]?.points ?? [];
          ndata.opacity = ndata.masks?.[0]?.opacity ?? 1.0;
          ndata.feather = ndata.masks?.[0]?.feather ?? 0;
          ndata.roundness = ndata.masks?.[0]?.roundness ?? 0;
          ndata.subtractMode = ndata.masks?.[0]?.subtractMode ?? false;
        }

        setEditingMaskNode({ id: nodeId, data: JSON.parse(JSON.stringify(node.data)) });
        setMaskBackup({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) });
        setSelectedMaskId(nodeId);
        setEditorTool("select");
      }
    };
    window.addEventListener('openMaskEditor', handleOpenMask);
    return () => window.removeEventListener('openMaskEditor', handleOpenMask);
  }, [nodes, edges]);

  // Compiled Layers state
  const [compiledLayers, setCompiledLayers] = useState<Layer[]>([]);

  // Default Parallel Graph initialisation
  useEffect(() => {
    if (videoPath && nodes.length === 0) {
      const defaultNodes: Node[] = [
        { id: "source_1", type: "source", position: { x: 50, y: 250 }, data: { videoName } },

        // Gameplay Layer path (Full 9:16 layout)
        { id: "crop_1", type: "crop", position: { x: 350, y: 100 }, data: { label: "Layer 1", top: 0, bottom: 0, left: 480, right: 480, x: 0, y: 0, scaleX: 1.125, scaleY: 1.78, lockAspectRatio: false, blur: 0, brightness: 1, contrast: 1 } },

        // Circle Mini-map Layer path
        {
          id: "mask_2", type: "mask", position: { x: 350, y: 400 }, data: {
            label: "Layer 2",
            shape: "circle",
            masks: [
              {
                id: "mask_minimap_default",
                name: "Mini Harita",
                type: "circle",
                x: 25, y: 25, w: 260, h: 260,
                opacity: 1.0,
                feather: 8,
                roundness: 0,
                subtractMode: false
              }
            ],
            x: 30, y: 30, scaleX: 1.1, scaleY: 1.1, lockAspectRatio: true, blur: 0, brightness: 1, contrast: 1
          }
        },

        { id: "output_1", type: "output", position: { x: 750, y: 250 }, data: {} }
      ];
      const defaultEdges: Edge[] = [
        { id: "e_src_crop1", source: "source_1", target: "crop_1" },
        { id: "e_crop1_out", source: "crop_1", target: "output_1", targetHandle: "layer_0" },

        { id: "e_src_mask2", source: "source_1", target: "mask_2" },
        { id: "e_mask2_out", source: "mask_2", target: "output_1", targetHandle: "layer_1" }
      ];
      setNodes(defaultNodes);
      setEdges(defaultEdges);
      setHistory([{ nodes: defaultNodes, edges: defaultEdges }]);
      setHistoryIndex(0);
    }
  }, [videoPath, videoName, nodes.length]);

  // Sync Node labels to connected blend ports
  useEffect(() => {
    let changed = false;
    const nextNodes = nodes.map(node => {
      if (node.type === "transform" || node.type === "crop" || node.type === "mask") {
        const port = traceDownstreamToBlendPort(node.id, edges, nodes);
        const targetLabel = port ? (BLEND_PORTS_MAPPING[port] || "") : "";
        if (node.data.label !== targetLabel) {
          changed = true;
          return { ...node, data: { ...node.data, label: targetLabel } };
        }
      }
      return node;
    });

    if (changed) {
      setNodes(nextNodes);
    }
  }, [edges, nodes]);

  // Output Preview Dragging Layer actions
  const handleOutputLayerMouseDown = (e: React.MouseEvent, layerId: string) => {
    e.preventDefault();
    e.stopPropagation();

    const outputNode = nodes.find(n => n.type === "output");
    if (!outputNode) return;
    const connectedEdge = edges.find(ed => ed.target === outputNode.id && ed.targetHandle === layerId);
    if (!connectedEdge) return;
    const node = nodes.find(n => n.id === connectedEdge.source);
    if (!node) return;

    const nd = node.data as any;
    const containerEl = outputPreviewContainerRef.current;

    outputDragRef.current = {
      active: true,
      layerId,
      nodeId: node.id,
      nodeType: node.type || "",
      startMouse: { x: e.clientX, y: e.clientY },
      startPos: { x: nd.x ?? 0, y: nd.y ?? 0 },
      // For mask nodes: capture starting mask shape centers for translate
      startMasks: nd.masks ? nd.masks.map((m: any) => ({ x: m.x, y: m.y })) : null,
      containerRect: containerEl ? containerEl.getBoundingClientRect() : null,
    };
    setDraggedLayerId(layerId);
  };

  // Global mousemove/mouseup for output layer drag (mounted once)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const dr = outputDragRef.current;
      if (!dr.active) return;

      const dx = e.clientX - dr.startMouse.x;
      const dy = e.clientY - dr.startMouse.y;

      // Convert pixel delta to 1920×1080 source space
      // Card is aspect 9:16 and fills the container height
      const rect = dr.containerRect;
      const cardH = rect ? rect.height : 576;
      const cardW = cardH * (9 / 16);
      const scaleX = 1920 / cardW; // source px per screen px
      const scaleY = 1080 / cardH;

      const sdx = dx * scaleX;
      const sdy = dy * scaleY;

      setNodes(nds => nds.map(n => {
        if (n.id !== dr.nodeId) return n;
        const nd = n.data as any;

        if (n.type === "mask" && nd.masks && nd.masks.length > 0 && dr.startMasks) {
          // Move all mask shapes together
          const newMasks = nd.masks.map((m: any, i: number) => ({
            ...m,
            x: Math.round(dr.startMasks![i].x + sdx),
            y: Math.round(dr.startMasks![i].y + sdy),
          }));
          return { ...n, data: { ...nd, masks: newMasks } };
        } else if (n.type === "mask" && nd.points && nd.points.length > 0) {
          // Move freeform points
          const newPts = nd.points.map((p: any, i: number) => ({
            x: Math.round((dr.startMasks?.[i]?.x ?? p.x) + sdx),
            y: Math.round((dr.startMasks?.[i]?.y ?? p.y) + sdy),
          }));
          return { ...n, data: { ...nd, points: newPts } };
        } else {
          // Crop / source: move x,y
          return { ...n, data: { ...nd, x: Math.round(dr.startPos.x + sdx), y: Math.round(dr.startPos.y + sdy) } };
        }
      }));
    };

    const onUp = () => {
      if (outputDragRef.current.active) {
        outputDragRef.current.active = false;
        setDraggedLayerId(null);
        // Save history after drop
        setNodes(nds => { saveHistory(nds, edges); return nds; });
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [edges, saveHistory]); // minimal deps, reads refs directly

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => {
        const next = applyNodeChanges(changes, nds);
        saveHistory(next, edges);
        return next;
      });
    },
    [edges, saveHistory]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => {
        const next = applyEdgeChanges(changes, eds);
        saveHistory(nodes, next);
        return next;
      });
    },
    [nodes, saveHistory]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const next = addEdge(params, eds);
        saveHistory(nodes, next);
        return next;
      });
    },
    [nodes, saveHistory]
  );

  const onConnectEnd = useCallback(
    (event: any, connectionState: any) => {
      if (!connectionState.isValid) {
        const { clientX, clientY } = event.touches ? event.touches[0] : event;
        setConnectingHandle(connectionState);
        setMenuPos({ x: clientX, y: clientY });
      }
    },
    []
  );

  // Compile graph states into linear renderable Layers
  useEffect(() => {
    const outputNode = nodes.find(n => n.type === "output");
    if (!outputNode) {
      setCompiledLayers([]);
      return;
    }

    const newLayers: Layer[] = [];

    for (let i = 0; i < 9; i++) {
      const handleId = `layer_${i}`;
      const connectedEdge = edges.find(e => e.target === outputNode.id && e.targetHandle === handleId);

      if (connectedEdge) {
        const node = nodes.find(n => n.id === connectedEdge.source);
        if (!node) continue;

        let cropArea = { x: 0, y: 0, w: 1920, h: 1080 };
        let canvasPos = { x: 0, y: 0, w: 1920, h: 1080 };
        let maskShape = "square";
        let masksList: MaskShape[] = [];

        const ndata = node.data as any;
        const blur = ndata.blur || 0;
        const brightness = ndata.brightness ?? 1.0;
        const contrast = ndata.contrast ?? 1.0;
        const scaleX = ndata.scaleX ?? 1.0;
        const scaleY = ndata.scaleY ?? 1.0;
        const tx = ndata.x ?? 0;
        const ty = ndata.y ?? 0;

        if (node.type === "crop") {
          const left = ndata.left || 0;
          const top = ndata.top || 0;
          const w = Math.max(1, 1920 - left - (ndata.right || 0));
          const h = Math.max(1, 1080 - top - (ndata.bottom || 0));

          cropArea = { x: left, y: top, w, h };
          canvasPos = {
            x: tx,
            y: ty,
            w: w * scaleX,
            h: h * scaleY
          };
        } else if (node.type === "mask") {
          maskShape = ndata.shape || "circle";
          if (ndata.masks && ndata.masks.length > 0) {
            masksList = ndata.masks;
          } else {
            // Build mask from node-level properties
            const mx = ndata.maskX ?? 200;
            const my = ndata.maskY ?? 200;
            const mw = ndata.maskW ?? 200;
            const mh = ndata.maskH ?? 200;
            masksList = [
              {
                id: node.id,
                name: ndata.label || "Maske",
                type: ndata.shape || "circle",
                x: mx, y: my, w: mw, h: mh,
                points: ndata.points || [],
                opacity: ndata.opacity ?? 1.0,
                feather: ndata.feather ?? 0,
                roundness: ndata.roundness ?? 0,
                subtractMode: ndata.subtractMode ?? false
              }
            ];
          }
          // canvasPos: full canvas so layer canvas covers the whole output
          // Individual mask shapes handle their own positioning within
          canvasPos = { x: 0, y: 0, w: 1920, h: 1080 };
        }

        newLayers.push({
          id: `layer_${i}`,
          label: BLEND_PORTS_MAPPING[handleId] || `Layer ${i + 1}`,
          cropArea,
          canvasPos,
          locked: false,
          visible: true,
          maskShape: maskShape as any,
          masks: masksList,
          blur,
          brightness,
          contrast
        });
      }
    }

    setCompiledLayers(newLayers);
  }, [nodes, edges]);

  // Preset operations
  const savePreset = () => {
    const data = { nodes, edges };
    localStorage.setItem("reframegg_active_preset", JSON.stringify(data));
    alert("Şablon başarıyla kaydedildi!");
  };

  const loadPreset = () => {
    const dataStr = localStorage.getItem("reframegg_active_preset");
    if (dataStr) {
      try {
        const { nodes: loadedNodes, edges: loadedEdges } = JSON.parse(dataStr);
        setNodes(loadedNodes);
        setEdges(loadedEdges);
        saveHistory(loadedNodes, loadedEdges);
      } catch (_) {
        alert("Kayıtlı şablon yüklenirken bir hata oluştu.");
      }
    } else {
      const valPreset = defaultPresets[0];
      alert(`Hazır Valorant Şablonu Yükleniyor: ${valPreset.presetName}`);

      const valNodes: Node[] = [
        { id: "source_1", type: "source", position: { x: 50, y: 250 }, data: { videoName } }
      ];
      const valEdges: Edge[] = [];

      valPreset.layers.forEach((layer, idx) => {
        const cropId = `crop_${idx}`;
        const maskId = `mask_${idx}`;

        if (layer.maskShape === "circle" || layer.maskShape === "freeform") {
          valNodes.push({
            id: maskId,
            type: "mask",
            position: { x: 350, y: 100 + idx * 180 },
            data: {
              label: layer.label,
              masks: [
                {
                  id: `mask_preset_${idx}`,
                  name: layer.label,
                  type: "circle",
                  x: layer.cropArea.x,
                  y: layer.cropArea.y,
                  w: layer.cropArea.w,
                  h: layer.cropArea.h,
                  opacity: 1.0,
                  feather: 8,
                  roundness: 0,
                  subtractMode: false
                }
              ],
              x: layer.canvasPos.x,
              y: layer.canvasPos.y,
              scaleX: layer.canvasPos.w / 1920,
              scaleY: layer.canvasPos.h / 1080,
              lockAspectRatio: true,
              blur: 0, brightness: 1, contrast: 1
            }
          });
          valEdges.push(
            { id: `e_src_mask_${idx}`, source: "source_1", target: maskId },
            { id: `e_mask_out_${idx}`, source: maskId, target: "output_1", targetHandle: `layer_${idx}` }
          );
        } else {
          valNodes.push({
            id: cropId,
            type: "crop",
            position: { x: 350, y: 100 + idx * 180 },
            data: {
              label: layer.label,
              top: layer.cropArea.y,
              bottom: 1080 - layer.cropArea.y - layer.cropArea.h,
              left: layer.cropArea.x,
              right: 1920 - layer.cropArea.x - layer.cropArea.w,
              x: layer.canvasPos.x,
              y: layer.canvasPos.y,
              scaleX: layer.canvasPos.w / layer.cropArea.w,
              scaleY: layer.canvasPos.h / layer.cropArea.h,
              lockAspectRatio: true,
              blur: 0, brightness: 1, contrast: 1
            }
          });
          valEdges.push(
            { id: `e_src_crop_${idx}`, source: "source_1", target: cropId },
            { id: `e_crop_out_${idx}`, source: cropId, target: "output_1", targetHandle: `layer_${idx}` }
          );
        }
      });

      valNodes.push(
        { id: "output_1", type: "output", position: { x: 750, y: 250 }, data: {} }
      );

      setNodes(valNodes);
      setEdges(valEdges);
      saveHistory(valNodes, valEdges);
    }
  };

  // High performance Canvas drawing loop (60 FPS, with soft feathering blur)
  useEffect(() => {
    let animFrameId: number;
    let frameCount = 0;

    const drawCanvasFrames = () => {
      frameCount++;
      const master = masterVideoRef.current;
      if (master) {
        // 1. Output preview background blur (fully covers container)
        const bgCanvas = document.querySelector(".bg-blur-canvas") as HTMLCanvasElement | null;
        if (bgCanvas) {
          const bgCtx = bgCanvas.getContext("2d");
          if (bgCtx) {
            try {
              const gp = compiledLayers.find(l => l.id === "layer_0");
              if (gp && gp.cropArea && gp.cropArea.w > 0 && gp.cropArea.h > 0) {
                const scaleX = master.videoWidth / 1920;
                const scaleY = master.videoHeight / 1080;
                bgCtx.drawImage(
                  master,
                  gp.cropArea.x * scaleX,
                  gp.cropArea.y * scaleY,
                  gp.cropArea.w * scaleX,
                  gp.cropArea.h * scaleY,
                  0, 0, bgCanvas.width, bgCanvas.height
                );
              } else {
                drawImageCover(bgCtx, master, 0, 0, bgCanvas.width, bgCanvas.height);
              }
            } catch (_) {
              try { bgCtx.drawImage(master, 0, 0, bgCanvas.width, bgCanvas.height); } catch (__) { }
            }
          }
        }

        // 2. Interactive Layers Composition with soft feathered masks!
        const canvases = document.querySelectorAll(".layer-canvas") as NodeListOf<HTMLCanvasElement>;
        canvases.forEach((canvas) => {
          const layerId = canvas.getAttribute("data-layer-id");
          const layer = compiledLayers.find(l => l.id === layerId);
          if (layer && layer.visible) {
            const ctx = canvas.getContext("2d");
            if (ctx) {
              try {
                drawLayerWithFeather(ctx, master, layer, canvas.width, canvas.height);
              } catch (_) { }
            }
          }
        });

        // 3. ReactFlow Node canvas previews (optimised 20fps throttled logic for extreme 60fps graph sliding)
        if (frameCount % 3 === 0 || !isPlaying) {
          const nodeCanvases = document.querySelectorAll(".node-preview-canvas") as NodeListOf<HTMLCanvasElement>;
          nodeCanvases.forEach((canvas) => {
            const nodeId = canvas.getAttribute("data-node-id");
            const node = nodes.find(n => n.id === nodeId);
            if (node) {
              const ctx = canvas.getContext("2d");
              if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                const scaleX = master.videoWidth / 1920;
                const scaleY = master.videoHeight / 1080;

                if (node.type === "source") {
                  ctx.drawImage(master, 0, 0, canvas.width, canvas.height);
                }
                else if (node.type === "crop") {
                  const ndata = node.data as any;
                  const left = ndata.left || 0;
                  const top = ndata.top || 0;
                  const w = Math.max(1, 1920 - left - (ndata.right || 0));
                  const h = Math.max(1, 1080 - top - (ndata.bottom || 0));
                  ctx.drawImage(master, left * scaleX, top * scaleY, w * scaleX, h * scaleY, 0, 0, canvas.width, canvas.height);
                }
                else if (node.type === "mask") {
                  ctx.fillStyle = "#050505";
                  ctx.fillRect(0, 0, canvas.width, canvas.height);

                  const activeMasks = ((node.data as any).masks || []) as MaskShape[];
                  if (activeMasks.length > 0) {
                    activeMasks.forEach((m: any) => {
                      ctx.save();
                      ctx.beginPath();
                      if (m.type === "circle") {
                        const mx = (m.x / 1920) * canvas.width;
                        const my = (m.y / 1080) * canvas.height;
                        const mw = (m.w / 1920) * canvas.width;
                        const mh = (m.h / 1080) * canvas.height;
                        ctx.arc(mx + mw / 2, my + mh / 2, Math.min(mw, mh) / 2, 0, Math.PI * 2);
                      } else if (m.type === "freeform" && m.points && m.points.length > 0) {
                        m.points.forEach((p: { x: number; y: number }, pidx: number) => {
                          const px = (p.x / 1920) * canvas.width;
                          const py = (p.y / 1080) * canvas.height;
                          if (pidx === 0) ctx.moveTo(px, py);
                          else ctx.lineTo(px, py);
                        });
                      } else {
                        const mx = (m.x / 1920) * canvas.width;
                        const my = (m.y / 1080) * canvas.height;
                        const mw = (m.w / 1920) * canvas.width;
                        const mh = (m.h / 1080) * canvas.height;
                        ctx.rect(mx, my, mw, mh);
                      }
                      ctx.clip();

                      // Draw inside clipping mask
                      if (m.type === "freeform") {
                        ctx.drawImage(master, 0, 0, master.videoWidth, master.videoHeight, 0, 0, canvas.width, canvas.height);
                      } else {
                        ctx.drawImage(
                          master,
                          m.x * scaleX, m.y * scaleY, m.w * scaleX, m.h * scaleY,
                          (m.x / 1920) * canvas.width, (m.y / 1080) * canvas.height,
                          (m.w / 1920) * canvas.width, (m.h / 1080) * canvas.height
                        );
                      }
                      ctx.restore();
                    });
                  } else {
                    ctx.drawImage(master, 0, 0, canvas.width, canvas.height);
                  }
                }
                else if (node.type === "output") {
                  ctx.fillStyle = "#07080a";
                  ctx.fillRect(0, 0, canvas.width, canvas.height);

                  // Blurred output background
                  ctx.save();
                  ctx.filter = "blur(12px) brightness(0.5)";
                  const gp = compiledLayers.find(l => l.id === "layer_0");
                  if (gp && gp.cropArea && gp.cropArea.w > 0 && gp.cropArea.h > 0) {
                    ctx.drawImage(
                      master,
                      gp.cropArea.x * scaleX,
                      gp.cropArea.y * scaleY,
                      gp.cropArea.w * scaleX,
                      gp.cropArea.h * scaleY,
                      0, 0, canvas.width, canvas.height
                    );
                  } else {
                    drawImageCover(ctx, master, 0, 0, canvas.width, canvas.height);
                  }
                  ctx.restore();

                  // Sequence layered outputs on the shared node output canvas
                  compiledLayers.forEach(layer => {
                    if (layer.visible) {
                      // canvasPos is in 1920×1080 source space → scale to output canvas
                      const px = (layer.canvasPos.x / 1920) * canvas.width;
                      const py = (layer.canvasPos.y / 1080) * canvas.height;
                      const pw = (layer.canvasPos.w / 1920) * canvas.width;
                      const ph = (layer.canvasPos.h / 1080) * canvas.height;
                      drawLayerOnSharedCanvas(ctx, master, layer, px, py, pw, ph);
                    }
                  });
                }
              }
            }
          });
        }

        // 4. Modal Mask Editor Previews
        if (editingMaskNode) {
          const meVideoCanvas = document.querySelector(".mask-editor-video-canvas") as HTMLCanvasElement | null;
          if (meVideoCanvas) {
            const meCtx = meVideoCanvas.getContext("2d");
            if (meCtx) {
              meCtx.drawImage(master, 0, 0, meVideoCanvas.width, meVideoCanvas.height);
            }
          }

          const mePreviewCanvas = document.querySelector(".mask-editor-preview-canvas") as HTMLCanvasElement | null;
          if (mePreviewCanvas) {
            const mePCtx = mePreviewCanvas.getContext("2d");
            if (mePCtx) {
              mePCtx.fillStyle = "#000000";
              mePCtx.fillRect(0, 0, mePreviewCanvas.width, mePreviewCanvas.height);

              const activeMasks = allMaskShapes; // show ALL masks in preview
              if (activeMasks.length > 0) {
                activeMasks.forEach((m: any) => {
                  const tempCanvas = document.createElement("canvas");
                  tempCanvas.width = mePreviewCanvas.width;
                  tempCanvas.height = mePreviewCanvas.height;
                  const tempCtx = tempCanvas.getContext("2d");
                  if (tempCtx) {
                    tempCtx.fillStyle = "white";
                    tempCtx.beginPath();
                    if (m.type === "circle") {
                      const mx = (m.x / 1920) * mePreviewCanvas.width;
                      const my = (m.y / 1080) * mePreviewCanvas.height;
                      const mw = (m.w / 1920) * mePreviewCanvas.width;
                      const mh = (m.h / 1080) * mePreviewCanvas.height;
                      tempCtx.arc(mx + mw / 2, my + mh / 2, Math.min(mw, mh) / 2, 0, Math.PI * 2);
                    } else if (m.type === "freeform" && m.points && m.points.length > 0) {
                      m.points.forEach((p: { x: number; y: number }, pidx: number) => {
                        const px = (p.x / 1920) * mePreviewCanvas.width;
                        const py = (p.y / 1080) * mePreviewCanvas.height;
                        if (pidx === 0) tempCtx.moveTo(px, py);
                        else tempCtx.lineTo(px, py);
                      });
                    } else {
                      const mx = (m.x / 1920) * mePreviewCanvas.width;
                      const my = (m.y / 1080) * mePreviewCanvas.height;
                      const mw = (m.w / 1920) * mePreviewCanvas.width;
                      const mh = (m.h / 1080) * mePreviewCanvas.height;
                      tempCtx.rect(mx, my, mw, mh);
                    }
                    tempCtx.fill();

                    const featherVal = m.feather ?? 0;
                    if (featherVal > 0) {
                      const maskFeather = Math.max(1, featherVal * (mePreviewCanvas.width / 1920));
                      const blurCanvas = document.createElement("canvas");
                      blurCanvas.width = mePreviewCanvas.width;
                      blurCanvas.height = mePreviewCanvas.height;
                      const blurCtx = blurCanvas.getContext("2d");
                      if (blurCtx) {
                        blurCtx.filter = `blur(${maskFeather}px)`;
                        blurCtx.drawImage(tempCanvas, 0, 0);
                        tempCtx.clearRect(0, 0, mePreviewCanvas.width, mePreviewCanvas.height);
                        tempCtx.drawImage(blurCanvas, 0, 0);
                      }
                    }

                    tempCtx.save();
                    tempCtx.globalCompositeOperation = "source-in";
                    tempCtx.drawImage(master, 0, 0, master.videoWidth, master.videoHeight, 0, 0, mePreviewCanvas.width, mePreviewCanvas.height);
                    tempCtx.restore();

                    mePCtx.drawImage(tempCanvas, 0, 0);
                  }
                });
              }
            }
          }

          const layerCanvases = document.querySelectorAll(".mask-layer-preview-canvas") as NodeListOf<HTMLCanvasElement>;
          layerCanvases.forEach(canvas => {
            const maskId = canvas.getAttribute("data-mask-id");
            const mask = allMaskShapes.find((m: any) => m.id === maskId);
            if (mask) {
              const mCtx = canvas.getContext("2d");
              if (mCtx) {
                mCtx.clearRect(0, 0, canvas.width, canvas.height);
                const scaleX = master.videoWidth / 1920;
                const scaleY = master.videoHeight / 1080;

                const tempCanvas = document.createElement("canvas");
                tempCanvas.width = canvas.width;
                tempCanvas.height = canvas.height;
                const tempCtx = tempCanvas.getContext("2d");
                if (tempCtx) {
                  tempCtx.fillStyle = "white";
                  tempCtx.beginPath();
                  if (mask.type === "circle") {
                    tempCtx.arc(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) / 2, 0, Math.PI * 2);
                  } else if (mask.type === "freeform" && mask.points && mask.points.length > 0) {
                    mask.points.forEach((p: { x: number; y: number }, pidx: number) => {
                      const px = (p.x / 1920) * canvas.width;
                      const py = (p.y / 1080) * canvas.height;
                      if (pidx === 0) tempCtx.moveTo(px, py);
                      else tempCtx.lineTo(px, py);
                    });
                  } else {
                    tempCtx.rect(0, 0, canvas.width, canvas.height);
                  }
                  tempCtx.fill();

                  const featherVal = mask.feather ?? 0;
                  if (featherVal > 0) {
                    const maskFeather = Math.max(1, featherVal * (canvas.width / 1920));
                    const blurCanvas = document.createElement("canvas");
                    blurCanvas.width = canvas.width;
                    blurCanvas.height = canvas.height;
                    const blurCtx = blurCanvas.getContext("2d");
                    if (blurCtx) {
                      blurCtx.filter = `blur(${maskFeather}px)`;
                      blurCtx.drawImage(tempCanvas, 0, 0);
                      tempCtx.clearRect(0, 0, canvas.width, canvas.height);
                      tempCtx.drawImage(blurCanvas, 0, 0);
                    }
                  }

                  tempCtx.save();
                  tempCtx.globalCompositeOperation = "source-in";
                  if (mask.type === "freeform") {
                    tempCtx.drawImage(master, 0, 0, master.videoWidth, master.videoHeight, 0, 0, canvas.width, canvas.height);
                  } else {
                    tempCtx.drawImage(
                      master,
                      mask.x * scaleX,
                      mask.y * scaleY,
                      mask.w * scaleX,
                      mask.h * scaleY,
                      0, 0, canvas.width, canvas.height
                    );
                  }
                  tempCtx.restore();

                  mCtx.drawImage(tempCanvas, 0, 0);
                }
              }
            }
          });
        }
      }
      animFrameId = requestAnimationFrame(drawCanvasFrames);
    };

    if (videoPath) {
      animFrameId = requestAnimationFrame(drawCanvasFrames);
    }
    return () => cancelAnimationFrame(animFrameId);
  }, [videoPath, compiledLayers, editingMaskNode, allMaskShapes, nodes, edges, isPlaying]);

  const addMaskShape = (type: "rect" | "circle" | "freeform") => {
    const nextPort = findNextFreeOutputPort(nodes, edges);
    if (!nextPort) {
      alert("Maksimum 9 katman sınırına ulaşıldı!");
      return;
    }

    const newNodeId = `mask_${Date.now()}`;
    const newLabel = type === "circle" ? `Daire Maske ${nodes.filter(n => n.type === "mask").length + 1}` :
      type === "rect" ? `Kutu Maske ${nodes.filter(n => n.type === "mask").length + 1}` :
        `Serbest Maske ${nodes.filter(n => n.type === "mask").length + 1}`;

    const newMaskNode: Node = {
      id: newNodeId,
      type: "mask",
      position: { x: 350, y: 150 + nodes.filter(n => n.type === "mask").length * 80 },
      data: {
        label: newLabel,
        shape: type,
        maskX: type === "freeform" ? 0 : 800,
        maskY: type === "freeform" ? 0 : 400,
        maskW: type === "freeform" ? 1920 : 300,
        maskH: type === "freeform" ? 1080 : 300,
        points: type === "freeform" ? [
          { x: 700, y: 350 },
          { x: 1200, y: 350 },
          { x: 1200, y: 700 },
          { x: 700, y: 700 }
        ] : [],
        opacity: 1.0,
        feather: 8, // Set a default soft feathering
        roundness: 0,
        subtractMode: false,
        x: 30, y: 30, scaleX: 1.1, scaleY: 1.1, lockAspectRatio: true, blur: 0, brightness: 1, contrast: 1
      }
    };

    const sourceNode = nodes.find(n => n.type === "source");
    const outputNode = nodes.find(n => n.type === "output");

    const newEdges: Edge[] = [];
    if (sourceNode) {
      newEdges.push({
        id: `e_src_${newNodeId}`,
        source: sourceNode.id,
        target: newNodeId
      });
    }
    if (outputNode) {
      newEdges.push({
        id: `e_${newNodeId}_out`,
        source: newNodeId,
        target: outputNode.id,
        targetHandle: nextPort
      });
    }

    const nextNodes = [...nodes, newMaskNode];
    const nextEdges = [...edges, ...newEdges];

    setNodes(nextNodes);
    setEdges(nextEdges);
    saveHistory(nextNodes, nextEdges);
    setSelectedMaskId(newNodeId);
  };

  const deleteMaskShape = (maskId: string) => {
    const nextNodes = nodes.filter(n => n.id !== maskId);
    const nextEdges = edges.filter(e => e.source !== maskId && e.target !== maskId);

    setNodes(nextNodes);
    setEdges(nextEdges);
    saveHistory(nextNodes, nextEdges);

    const remainingMasks = nextNodes.filter(n => n.type === "mask");
    if (remainingMasks.length > 0) {
      setSelectedMaskId(remainingMasks[0].id);
    } else {
      setSelectedMaskId("");
    }
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-[#07080a] text-[#f5f6f8] overflow-hidden select-none font-sans">

      {/* PREMIUM HEADER */}
      <div className="h-[60px] bg-[#111318]/90 border-b border-white/8 px-6 flex items-center justify-between shadow-lg backdrop-blur-md z-30">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setGuidesActive(!guidesActive)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-2 cursor-pointer transition duration-300 ${guidesActive
              ? "bg-orange-600/10 border-[#ea580c] text-[#ea580c] shadow-[0_0_10px_rgba(234,88,12,0.2)]"
              : "border-white/8 text-[#949ca9] hover:bg-white/5 hover:text-white"
              }`}
          >
            <Grid size={14} />
            <span>Guides</span>
            <ChevronDown size={12} />
          </button>

          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`w-8 h-8 rounded-full border flex items-center justify-center cursor-pointer transition duration-300 ${isPlaying
              ? "bg-orange-600/10 border-[#ea580c] text-[#ea580c] shadow-[0_0_12px_rgba(234,88,12,0.3)] animate-pulse"
              : "border-white/8 text-[#949ca9] hover:bg-white/5 hover:text-white"
              }`}
          >
            {isPlaying ? <Pause size={12} /> : <Play size={12} />}
          </button>
        </div>

        {/* Center: Save Preset Button */}
        <div>
          <button
            onClick={savePreset}
            className="px-4 py-2 text-xs font-extrabold tracking-wider bg-zinc-900 border border-white/8 hover:border-[#ea580c] hover:bg-orange-600/5 hover:text-[#ea580c] rounded-lg cursor-pointer transition duration-300 flex items-center shadow-lg"
          >
            <Save size={14} className="mr-2" />
            SAVE PRESET
          </button>
        </div>

        {/* Right: Load Preset Button */}
        <div>
          <button
            onClick={loadPreset}
            className="px-4 py-2 text-xs font-extrabold tracking-wider bg-orange-600 hover:bg-[#f97316] text-white rounded-lg cursor-pointer transition duration-300 flex items-center shadow-[0_4px_15px_rgba(234,88,12,0.3)] hover:scale-[1.02] active:scale-100"
          >
            <FolderOpen size={14} className="mr-2" />
            LOAD PRESETS
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden w-full h-[calc(100vh-60px)]">

        {/* LEFT SIDEBAR: OUTPUT PREVIEW & SCRUBBER */}
        <div className="w-[360px] h-full bg-[#07080a] border-r border-white/8 flex flex-col select-none relative z-10 shadow-2xl">
          {/* Centered Monitor Preview without extra spacing */}
          <OutputPreview
            videoPath={videoPath}
            compiledLayers={compiledLayers}
            guidesActive={guidesActive}
            draggedLayerId={draggedLayerId}
            masterVideoRef={masterVideoRef}
            handleOutputLayerMouseDown={handleOutputLayerMouseDown}
            containerRef={outputPreviewContainerRef}
          />

          {/* Timeline Panel */}
          <VideoScrubber
            duration={duration}
            currentTime={currentTime}
            trimStart={trimStart}
            trimEnd={trimEnd}
            setTrimStart={setTrimStart}
            setTrimEnd={setTrimEnd}
            setCurrentTime={setCurrentTime}
            masterVideoRef={masterVideoRef}
          />
        </div>

        {/* RIGHT PANEL: REACTFLOW NODE CANVAS */}
        <div className="flex-1 h-full relative z-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectEnd={onConnectEnd}
            nodeTypes={nodeTypes}
            colorMode="dark"
            fitView
            onInit={(rfi) => reactFlowInstance.current = rfi}
            onPaneContextMenu={(e) => {
              e.preventDefault();
              setMenuPos({ x: e.clientX, y: e.clientY });
              setConnectingHandle(null);
            }}
            onPaneClick={() => setMenuPos(null)}
          >
            <Background color="#171a21" gap={18} />
            <Controls />
            <MiniMap className="!bg-[#111318] !border-white/8 rounded-xl shadow-2xl" />
          </ReactFlow>

          {/* Context Quick-node Radial Menu */}
          {menuPos && (
            <div
              className="radial-menu fixed z-[1000] w-[140px] h-[140px] flex items-center justify-center animate-[scaleIn_0.25s_cubic-bezier(0.34,1.56,0.64,1)]"
              style={{ left: menuPos.x - 70, top: menuPos.y - 70 }}
            >
              <div
                className="radial-center w-9 h-9 rounded-full bg-zinc-900 border border-white/10 text-white flex items-center justify-center cursor-pointer shadow-xl z-20 hover:scale-115 transition duration-200"
                onClick={() => setMenuPos(null)}
              >
                <Check size={16} />
              </div>
              {[
                { type: "source", label: "Source", icon: <ImageIcon size={12} />, color: "#10b981", angle: 0 },
                { type: "mask", label: "Mask", icon: <Scissors size={12} />, color: "#ec4899", angle: 90 },
                { type: "crop", label: "Crop", icon: <Crop size={12} />, color: "#f59e0b", angle: 180 },
                { type: "output", label: "Output", icon: <Sparkles size={12} />, color: "#10b981", angle: 270 }
              ].map(item => {
                const radius = 55;
                const rad = (item.angle * Math.PI) / 180;
                const lx = radius * Math.cos(rad);
                const ly = radius * Math.sin(rad);

                return (
                  <button
                    key={item.type}
                    onClick={() => {
                      if (reactFlowInstance.current) {
                        const position = reactFlowInstance.current.screenToFlowPosition({ x: menuPos.x, y: menuPos.y });
                        const newNodeId = `${item.type}_${Date.now()}`;
                        const newNode = {
                          id: newNodeId,
                          type: item.type,
                          position,
                          data: { masks: [] }
                        };

                        setNodes((nds) => {
                          const nextNds = [...nds, newNode as Node];

                          if (connectingHandle) {
                            const newEdge: Edge = {
                              id: `e_${connectingHandle.nodeId}_${newNodeId}`,
                              source: connectingHandle.nodeId,
                              sourceHandle: connectingHandle.handleId,
                              target: newNodeId,
                              targetHandle: item.type === "output" ? "layer_0" : "in"
                            };
                            setEdges(eds => {
                              const nextEds = [...eds, newEdge];
                              saveHistory(nextNds, nextEds);
                              return nextEds;
                            });
                          } else {
                            saveHistory(nextNds, edges);
                          }

                          return nextNds;
                        });

                        setMenuPos(null);
                      }
                    }}
                    className="absolute w-8 h-8 rounded-full bg-zinc-950 flex items-center justify-center cursor-pointer transition duration-300 hover:scale-125 z-10 radial-item hover:bg-zinc-900 border border-white/6"
                    style={{
                      transform: `translate(${lx}px, ${ly}px)`,
                      borderColor: item.color,
                      boxShadow: `0 0 12px ${item.color}44`
                    }}
                  >
                    <span style={{ color: item.color }}>{item.icon}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* RENDER VIDEO FLOATING BUTTON */}
          <div className="absolute top-5 right-5 z-10">
            <button
              className="px-5 py-3 font-black tracking-widest text-xs bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white rounded-xl shadow-[0_4px_25px_rgba(234,88,12,0.4)] hover:scale-[1.03] active:scale-100 cursor-pointer transition duration-300 flex items-center gap-2"
              onClick={async () => {
                try {
                  alert("Render başlatılıyor! Lütfen arka plan işleminin tamamlanmasını bekleyin...");
                  await invoke("reframe_video", {
                    videoPath,
                    layers: compiledLayers,
                    trimStart,
                    trimEnd,
                    outputRes: "1080x1920",
                    outputFps: 60,
                    backgroundMode: "blur",
                    useGpu: true,
                    outputExt: "mp4"
                  });
                  alert("Render Başarıyla Tamamlandı! Dosya video dizinine kaydedildi.");
                } catch (e) {
                  alert("Render sırasında bir hata oluştu: " + e);
                }
              }}
            >
              <Sparkles size={16} className="animate-spin-slow" />
              RENDER VIDEO
            </button>
          </div>
        </div>

      </div>

      {/* FULLSCREEN MASK EDITOR WINDOW */}
      {editingMaskNode && (
        <MaskStudio
          nodes={nodes}
          edges={edges}
          setNodes={setNodes}
          setEdges={setEdges}
          saveHistory={saveHistory}
          undo={undo}
          redo={redo}
          editingMaskNode={editingMaskNode}
          setEditingMaskNode={setEditingMaskNode}
          maskBackup={maskBackup}
          selectedMaskId={selectedMaskId}
          setSelectedMaskId={setSelectedMaskId}
          editorTool={editorTool}
          setEditorTool={setEditorTool}
          currentTime={currentTime}
          duration={duration}
          setCurrentTime={setCurrentTime}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          masterVideoRef={masterVideoRef}
          updateMaskNodeData={updateMaskNodeData}
          allMaskShapes={allMaskShapes}
          addMaskShape={addMaskShape}
          deleteMaskShape={deleteMaskShape}
        />
      )}

    </div>
  );
}
