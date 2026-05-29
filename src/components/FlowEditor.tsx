import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke, Channel, convertFileSrc } from "@tauri-apps/api/core";
import { Trash2 } from "lucide-react";
import { ReframeLayer, EditorTool, ModalState, RenderEvent } from "../types";
import { defaultPresets, Preset, MaskShape } from "../presets";
import { VideoScrubber } from "./VideoScrubber";
import { Header } from "./editor/Header";
import { LayerPanel } from "./editor/LayerPanel";
import { EffectControls } from "./editor/EffectControls";
import { MonitorPanel } from "./editor/MonitorPanel";
import { renderSource, renderSilhouette, renderProgram } from "../utils/canvasRenderer";

const CANVAS_W = 1920;
const CANVAS_H = 1080;
const MAX_HISTORY = 30;

interface FlowEditorProps {
  videoPath: string;
  videoName: string;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  setIsPlaying: (val: boolean) => void;
  masterVideoRef: React.RefObject<HTMLVideoElement | null>;
  trimStart: number;
  trimEnd: number;
  setTrimStart: (val: number) => void;
  setTrimEnd: (val: number) => void;
  setCurrentTime: (val: number) => void;
}

export function FlowEditor({
  videoPath, videoName, duration,
  currentTime, isPlaying, setIsPlaying,
  masterVideoRef, trimStart, trimEnd, setTrimStart, setTrimEnd, setCurrentTime
}: FlowEditorProps) {
  // ─── STATE ───
  const [footerHeight] = useState(240);
  const [layers, setLayers] = useState<ReframeLayer[]>(() => [
    {
      id: "layer_0",
      name: "Main Gameplay",
      type: "crop",
      visible: true,
      cropArea: { x: 656, y: 0, w: 608, h: 1080 },
      x: 0, y: 0, scale: 1.777, baseScale: 1.777,
      rotation: 0, blur: 0, brightness: 1.0, contrast: 1.0, opacity: 1.0, feather: 0, roundness: 0, masks: []
    }
  ]);
  const [selectedLayerId, setSelectedLayerId] = useState<string>("layer_0");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [editorTool, setEditorTool] = useState<EditorTool>("select");
  const [mouseHoverPos, setMouseHoverPos] = useState<{ x: number, y: number } | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<{ x: number, y: number }[]>([]);
  const [renderProgress, setRenderProgress] = useState<{ progress: number, status: string } | null>(null);
  const [customPresets, setCustomPresets] = useState<Preset[]>(() => {
    const saved = localStorage.getItem("customPresets_v2");
    const parsed = saved ? JSON.parse(saved) : [];
    // Migration: make sure all custom presets have a unique ID
    let migrated = false;
    const checked = parsed.map((p: Preset) => {
      if (!p.id) {
        p.id = `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        migrated = true;
      }
      return p;
    });
    if (migrated) {
      localStorage.setItem("customPresets_v2", JSON.stringify(checked));
    }
    return checked;
  });
  const [showPresetLibrary, setShowPresetLibrary] = useState(false);
  
  // ─── SOURCE MONITOR ZOOM & PAN ───
  const [sourceZoom, setSourceZoom] = useState(1);
  const [sourcePanX, setSourcePanX] = useState(0);
  const [sourcePanY, setSourcePanY] = useState(0);
  const altPanRef = useRef<{ active: boolean, startX: number, startY: number, startPanX: number, startPanY: number }>({ active: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 });
  
  // ─── HISTORY (UNDO) ───
  const historyRef = useRef<string[]>([]);
  
  const pushHistory = useCallback((newState: ReframeLayer[]) => {
    const json = JSON.stringify(newState);
    if (historyRef.current[historyRef.current.length - 1] === json) return;
    historyRef.current.push(json);
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
  }, []);

  const handleUndo = useCallback(() => {
    if (historyRef.current.length > 1) {
      historyRef.current.pop(); // Remove current
      const prev = JSON.parse(historyRef.current[historyRef.current.length - 1]);
      setLayers(prev);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo]);

  // Initial history
  useEffect(() => {
    if (historyRef.current.length === 0) historyRef.current.push(JSON.stringify(layers));
  }, []);

  const selectedLayer = layers.find(l => l.id === selectedLayerId) || layers[0];

  // ─── REFS ───
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const silhouetteCanvasRef = useRef<HTMLCanvasElement>(null);
  const programCanvasRef = useRef<HTMLCanvasElement>(null);
  const silDragRef = useRef({ active: false, startX: 0, startY: 0, startLayerX: 0, startLayerY: 0 });
  const maskDragRef = useRef<{ 
    id: string, 
    type: "move" | "resize-br", 
    startX: number, 
    startY: number, 
    startMaskX: number, 
    startMaskY: number, 
    startW: number, 
    startH: number,
    startPoints?: { x: number, y: number }[]
  } | null>(null);
  const creationRef = useRef<{ id: string, startX: number, startY: number } | null>(null);

  // ─── HELPERS ───
  const showModal = useCallback((type: "alert" | "confirm" | "prompt", title: string, message: string, defaultValue?: string): Promise<string | boolean> => {
    return new Promise((resolve) => {
      setModal({
        type, title, message, defaultValue,
        onConfirm: (val) => { setModal(null); resolve(type === "prompt" ? val || "" : true); },
        onCancel: () => { setModal(null); resolve(false); }
      });
    });
  }, []);

  const snapValue = useCallback((val: number, targets: number[], threshold: number = 50) => {
    let snappedVal = val;
    let minDiff = threshold;
    for (const target of targets) {
      const diff = Math.abs(val - target);
      if (diff < minDiff) { minDiff = diff; snappedVal = target; }
    }
    return snappedVal;
  }, []);

  const getMaskBase64 = (layer: ReframeLayer): string | undefined => {
    if (!layer.masks || layer.masks.length === 0) return undefined;
    const canvas = document.createElement("canvas");
    canvas.width = layer.cropArea.w;
    canvas.height = layer.cropArea.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.fillStyle = "white";
    layer.masks.forEach(m => {
      ctx.beginPath();
      const lx = m.x - layer.cropArea.x;
      const ly = m.y - layer.cropArea.y;
      if (m.type === "circle") {
        ctx.ellipse(lx + m.w/2, ly + m.h/2, m.w/2, m.h/2, 0, 0, Math.PI * 2);
      } else if (m.type === "triangle") {
        ctx.moveTo(lx + m.w / 2, ly);
        ctx.lineTo(lx + m.w, ly + m.h);
        ctx.lineTo(lx, ly + m.h);
        ctx.closePath();
      } else if (m.type === "star") {
        const cx = lx + m.w / 2;
        const cy = ly + m.h / 2;
        const spikes = 5;
        const outerRadius = Math.min(m.w, m.h) / 2;
        const innerRadius = outerRadius * 0.4;
        let rot = (Math.PI / 2) * 3;
        const step = Math.PI / spikes;
        ctx.moveTo(cx, cy - outerRadius);
        for (let i = 0; i < spikes; i++) {
          let x = cx + Math.cos(rot) * outerRadius;
          let y = cy + Math.sin(rot) * outerRadius;
          ctx.lineTo(x, y);
          rot += step;
          x = cx + Math.cos(rot) * innerRadius;
          y = cy + Math.sin(rot) * innerRadius;
          ctx.lineTo(x, y);
          rot += step;
        }
        ctx.closePath();
      } else if (m.type === "freeform" && m.points) {
        m.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x - layer.cropArea.x, p.y - layer.cropArea.y) : ctx.lineTo(p.x - layer.cropArea.x, p.y - layer.cropArea.y));
      } else {
        ctx.rect(lx, ly, m.w, m.h);
      }
      ctx.fill();
    });
    return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
  };

  // ─── ACTIONS ───
  const handleUpdateLayer = useCallback((id: string, updates: Partial<ReframeLayer>) => {
    setLayers(prev => {
      const next = prev.map(l => l.id === id ? { ...l, ...updates } : l);
      // We don't push history on every move pixel, only on mouse up (handled in globalUp)
      return next;
    });
  }, []);

  const handleAddMask = useCallback((tool: EditorTool, pos: { x: number, y: number }) => {
    const layerId = `layer_${Date.now()}`;
    const maskId = `mask_${Date.now()}`;
    const newMask: MaskShape = {
      id: maskId, name: `Maske ${layers.length + 1}`, type: tool as MaskShape["type"],
      x: pos.x, y: pos.y, w: 1, h: 1,
      opacity: 1, feather: 8, roundness: 0, subtractMode: false,
      points: tool === "freeform" ? [pos] : undefined
    };

    const s = 0.5625; // default 16:9 vertical fit scale
    const lx = pos.x * s;
    const ly = 420 + pos.y * s;

    const newLayer: ReframeLayer = {
      id: layerId,
      name: `Maske ${layers.length + 1}`,
      type: "mask",
      visible: true,
      cropArea: { x: pos.x, y: pos.y, w: 1, h: 1 },
      x: Math.round(lx),
      y: Math.round(ly),
      scale: s,
      baseScale: s,
      rotation: 0,
      blur: 0,
      brightness: 1.0,
      contrast: 1.0,
      opacity: 1.0,
      feather: 8,
      roundness: 0,
      masks: [newMask]
    };

    const nextLayers = [...layers, newLayer];
    setLayers(nextLayers);
    setSelectedLayerId(layerId);
    pushHistory(nextLayers);
    return layerId;
  }, [layers, pushHistory]);

  const handleSavePreset = async () => {
    const name = await showModal("prompt", "Save Preset", "Enter a name for this preset:", "My Layout") as string;
    if (!name) return;
    const newPreset: Preset = {
      id: `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      game: "Custom",
      presetName: name,
      sourceResolution: { w: 1920, h: 1080 },
      layers: layers.map(l => ({
        id: l.id,
        label: l.name,
        cropArea: l.cropArea,
        canvasPos: { x: Math.round(l.x), y: Math.round(l.y), w: Math.round(l.cropArea.w * l.scale), h: Math.round(l.cropArea.h * l.scale) },
        locked: false,
        visible: l.visible,
        maskShape: l.type === "mask" ? (l.masks[0]?.type as any || "freeform") : undefined,
        masks: l.masks,
        blur: l.blur,
        brightness: l.brightness,
        contrast: l.contrast
      }))
    };
    const updated = [...customPresets, newPreset];
    setCustomPresets(updated);
    localStorage.setItem("customPresets_v2", JSON.stringify(updated));
    showModal("alert", "Success", "Preset saved successfully!");
  };

  const applyPreset = (preset: Preset) => {
    const mapped: ReframeLayer[] = preset.layers.map((l, idx) => {
      const scale = l.canvasPos.w / l.cropArea.w;
      
      // Determine layer type
      const hasMasks = l.masks && l.masks.length > 0;
      const isMaskType = l.maskShape === "circle" || l.maskShape === "freeform" || l.maskShape === "triangle" || l.maskShape === "star" || hasMasks;
      const type = isMaskType ? "mask" : "crop";
      
      const masks: MaskShape[] = type === "mask" ? (l.masks && l.masks.length > 0 ? l.masks : [
        {
          id: `mask_preset_${idx}`,
          name: l.label,
          type: l.maskShape === "circle" ? "circle" : (l.maskShape === "triangle" ? "triangle" : (l.maskShape === "star" ? "star" : "freeform")),
          x: l.cropArea.x,
          y: l.cropArea.y,
          w: l.cropArea.w,
          h: l.cropArea.h,
          opacity: 1.0,
          feather: 8,
          roundness: 0,
          subtractMode: false,
          points: []
        }
      ]) : [];

      return {
        id: l.id, name: l.label, type, visible: true,
        cropArea: l.cropArea, x: l.canvasPos.x, y: l.canvasPos.y,
        scale: scale, baseScale: scale,
        rotation: 0, blur: l.blur || 0, brightness: l.brightness || 1.0, contrast: l.contrast || 1.0,
        opacity: 1.0, feather: 0, roundness: 0, masks
      };
    });
    setLayers(mapped);
    setSelectedLayerId(mapped[0].id);
    pushHistory(mapped);
    setShowPresetLibrary(false);
  };

  const handleDeletePreset = useCallback((e: React.MouseEvent, presetId: string) => {
    e.stopPropagation();
    const next = customPresets.filter(p => p.id !== presetId);
    setCustomPresets(next);
    localStorage.setItem("customPresets_v2", JSON.stringify(next));
  }, [customPresets]);

  const handleRender = async () => {
    try {
      setRenderProgress({ progress: 0, status: "Initializing..." });
      const onEvent = new Channel<RenderEvent>();
      onEvent.onmessage = (event: RenderEvent) => {
        if (event.type === "Progress") setRenderProgress(event.data);
        else if (event.type === "Complete") { setRenderProgress(null); showModal("alert", "Success", "Render complete! File saved."); }
        else if (event.type === "Error") { setRenderProgress(null); showModal("alert", "Error", "Render failed: " + event.data.message); }
      };

      const backendLayers = layers.map(l => ({
        id: l.id,
        label: l.name,
        cropArea: {
          x: Math.round(l.cropArea.x),
          y: Math.round(l.cropArea.y),
          w: Math.round(l.cropArea.w / 2) * 2,
          h: Math.round(l.cropArea.h / 2) * 2
        },
        canvasPos: {
          x: Math.round(l.x),
          y: Math.round(l.y),
          w: Math.round((l.cropArea.w * l.scale) / 2) * 2,
          h: Math.round((l.cropArea.h * l.scale) / 2) * 2
        },
        locked: false,
        visible: l.visible,
        maskShape: l.type === "mask" ? "freeform" : (l.masks.length > 0 ? "censor" : "square"),
        maskBase64: l.masks.length > 0 ? getMaskBase64(l) : undefined,
        blur: l.blur,
        brightness: l.brightness,
        contrast: l.contrast
      }));

      await invoke("reframe_video", {
        videoPath, layers: backendLayers, trimStart, trimEnd,
        outputRes: "1080x1920", outputFps: 60, backgroundMode: "blur", useGpu: true, outputExt: "mp4", onEvent
      });
    } catch (e) {
      setRenderProgress(null);
      showModal("alert", "Error", "Failed to start render: " + e);
    }
  };

  // ─── RENDER LOOP ───
  useEffect(() => {
    let animFrameId: number;
    const renderLoop = () => {
      const master = masterVideoRef.current;
      if (!master || master.readyState < 2 || !programCanvasRef.current) { animFrameId = requestAnimationFrame(renderLoop); return; }
      if (sourceCanvasRef.current) renderSource(sourceCanvasRef.current.getContext("2d")!, master, layers, selectedLayerId, CANVAS_W, CANVAS_H);
      if (silhouetteCanvasRef.current) renderSilhouette(silhouetteCanvasRef.current.getContext("2d")!, layers, selectedLayerId, 360, 640);
      if (programCanvasRef.current) renderProgram(programCanvasRef.current.getContext("2d")!, master, layers, 540, 960);
      animFrameId = requestAnimationFrame(renderLoop);
    };
    animFrameId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animFrameId);
  }, [layers, selectedLayerId, selectedLayer, masterVideoRef]);

  // ─── EVENT HANDLERS ───
  const screenToSourceCanvas = (clientX: number, clientY: number): { x: number; y: number } => {
    const canvas = sourceCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const container = canvas.parentElement?.parentElement;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    const rawX = ((clientX - rect.left) / rect.width) * CANVAS_W;
    const rawY = ((clientY - rect.top) / rect.height) * CANVAS_H;
    const cx = CANVAS_W / 2;
    const cy = CANVAS_H / 2;
    
    // Convert sourcePanX/Y from screen pixels to canvas units (fixes mismatch!)
    const panXCanvas = sourcePanX * (CANVAS_W / rect.width);
    const panYCanvas = sourcePanY * (CANVAS_H / rect.height);
    
    const srcX = (rawX - cx - panXCanvas) / sourceZoom + cx;
    const srcY = (rawY - cy - panYCanvas) / sourceZoom + cy;
    return { 
      x: Math.max(0, Math.min(CANVAS_W, srcX)),
      y: Math.max(0, Math.min(CANVAS_H, srcY))
    };
  };

  const handleSourceMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Alt+click starts panning
    if (e.altKey) {
      e.preventDefault();
      altPanRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        startPanX: sourcePanX,
        startPanY: sourcePanY
      };
      return;
    }

    const coords = screenToSourceCanvas(e.clientX, e.clientY);
    
    if (editorTool === "select") {
       if (!selectedLayer) return;
       for (const m of selectedLayer.masks) {
         if (Math.abs(coords.x - (m.x + m.w)) < 20 && Math.abs(coords.y - (m.y + m.h)) < 20) {
           maskDragRef.current = { 
             id: m.id, 
             type: "resize-br", 
             startX: coords.x, 
             startY: coords.y, 
             startMaskX: m.x, 
             startMaskY: m.y, 
             startW: m.w, 
             startH: m.h,
             startPoints: m.points ? m.points.map(p => ({ ...p })) : undefined
           };
           return;
         }
       }
       const mask = selectedLayer.masks.find(m => coords.x >= m.x && coords.x <= m.x + m.w && coords.y >= m.y && coords.y <= m.y + m.h);
       if (mask) {
         maskDragRef.current = { 
           id: mask.id, 
           type: "move", 
           startX: coords.x, 
           startY: coords.y, 
           startMaskX: mask.x, 
           startMaskY: mask.y, 
           startW: mask.w, 
           startH: mask.h,
           startPoints: mask.points ? mask.points.map(p => ({ ...p })) : undefined
         };
       }
       return;
    }

    if (editorTool === "freeform") {
      if (drawingPoints.length > 2) {
        const dx = coords.x - drawingPoints[0].x;
        const dy = coords.y - drawingPoints[0].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 20) {
          // Snap triggered! Finish path and create mask
          const minX = Math.min(...drawingPoints.map(p => p.x));
          const minY = Math.min(...drawingPoints.map(p => p.y));
          const maxX = Math.max(...drawingPoints.map(p => p.x));
          const maxY = Math.max(...drawingPoints.map(p => p.y));
          const w = Math.max(10, maxX - minX);
          const h = Math.max(10, maxY - minY);
          
          const layerId = `layer_${Date.now()}`;
          const maskId = `mask_${Date.now()}`;
          const newMask: MaskShape = {
            id: maskId, name: `Maske ${layers.length + 1}`, type: "freeform",
            x: minX, y: minY, w, h,
            opacity: 1, feather: 8, roundness: 0, subtractMode: false,
            points: [...drawingPoints]
          };

          const s = 0.5625;
          const lx = minX * s;
          const ly = 420 + minY * s;

          const newLayer: ReframeLayer = {
            id: layerId,
            name: `Maske ${layers.length + 1}`,
            type: "mask",
            visible: true,
            cropArea: { x: minX, y: minY, w, h },
            x: Math.round(lx),
            y: Math.round(ly),
            scale: s,
            baseScale: s,
            rotation: 0,
            blur: 0,
            brightness: 1.0,
            contrast: 1.0,
            opacity: 1.0,
            feather: 8,
            roundness: 0,
            masks: [newMask]
          };

          const next = [...layers, newLayer];
          setLayers(next);
          setSelectedLayerId(layerId);
          pushHistory(next);
          setDrawingPoints([]);
          setEditorTool("select");
          return;
        }
      }
      setDrawingPoints(prev => [...prev, coords]);
    } else {
      const newId = handleAddMask(editorTool, coords);
      creationRef.current = { id: newId, startX: coords.x, startY: coords.y };
    }
  };

  const handleSourceMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    // Alt+drag panning (1:1 with screen pixels for rapid, locked feeling)
    if (altPanRef.current.active) {
      const dx = e.clientX - altPanRef.current.startX;
      const dy = e.clientY - altPanRef.current.startY;
      setSourcePanX(altPanRef.current.startPanX + dx);
      setSourcePanY(altPanRef.current.startPanY + dy);
      return;
    }

    const coords = screenToSourceCanvas(e.clientX, e.clientY);
    
    if (editorTool === "freeform" && drawingPoints.length > 2) {
      const dx = coords.x - drawingPoints[0].x;
      const dy = coords.y - drawingPoints[0].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 20) {
        setMouseHoverPos({ x: drawingPoints[0].x, y: drawingPoints[0].y });
      } else {
        setMouseHoverPos(coords);
      }
    } else {
      setMouseHoverPos(coords);
    }

    if (creationRef.current) {
       const { id, startX, startY } = creationRef.current;
       const x = Math.min(coords.x, startX);
       const y = Math.min(coords.y, startY);
       const w = Math.max(10, Math.abs(coords.x - startX));
       const h = Math.max(10, Math.abs(coords.y - startY));
       
       setLayers(prev => prev.map(l => {
         if (l.id === id) {
           const s = 0.5625;
           const lx = x * s;
           const ly = 420 + y * s;
           const updatedMasks = l.masks.map(m => ({ ...m, x, y, w, h }));
           return {
             ...l,
             cropArea: { x, y, w, h },
             x: Math.round(lx),
             y: Math.round(ly),
             masks: updatedMasks
           };
         }
         return l;
       }));
       return;
    }

    if (maskDragRef.current && selectedLayer) {
      const { id, type, startX, startY, startMaskX, startMaskY, startW, startH, startPoints } = maskDragRef.current;
      const dx = coords.x - startX;
      const dy = coords.y - startY;
      
      if (selectedLayer.type === "mask") {
        if (type === "move") {
          const nx = startMaskX + dx;
          const ny = startMaskY + dy;
          const updated = selectedLayer.masks.map(m => {
            if (m.id === id) {
              const shiftedPoints = startPoints ? startPoints.map(p => ({ x: p.x + dx, y: p.y + dy })) : undefined;
              return { ...m, x: nx, y: ny, points: shiftedPoints };
            }
            return m;
          });
          handleUpdateLayer(selectedLayer.id, { 
            masks: updated,
            cropArea: { ...selectedLayer.cropArea, x: nx, y: ny }
          });
        } else {
          const nw = Math.max(10, startW + dx);
          const nh = Math.max(10, startH + dy);
          const updated = selectedLayer.masks.map(m => {
            if (m.id === id) {
              const scaleX = nw / startW;
              const scaleY = nh / startH;
              const scaledPoints = startPoints ? startPoints.map(p => ({
                x: startMaskX + (p.x - startMaskX) * scaleX,
                y: startMaskY + (p.y - startMaskY) * scaleY
              })) : undefined;
              return { ...m, w: nw, h: nh, points: scaledPoints };
            }
            return m;
          });
          handleUpdateLayer(selectedLayer.id, { 
            masks: updated,
            cropArea: { ...selectedLayer.cropArea, w: nw, h: nh }
          });
        }
      } else {
        if (type === "move") {
          const nx = startMaskX + dx;
          const ny = startMaskY + dy;
          const updated = selectedLayer.masks.map(m => {
            if (m.id === id) {
              const shiftedPoints = startPoints ? startPoints.map(p => ({ x: p.x + dx, y: p.y + dy })) : undefined;
              return { ...m, x: nx, y: ny, points: shiftedPoints };
            }
            return m;
          });
          handleUpdateLayer(selectedLayer.id, { masks: updated });
        } else {
          const nw = Math.max(10, startW + dx);
          const nh = Math.max(10, startH + dy);
          const updated = selectedLayer.masks.map(m => {
            if (m.id === id) {
              const scaleX = nw / startW;
              const scaleY = nh / startH;
              const scaledPoints = startPoints ? startPoints.map(p => ({
                x: startMaskX + (p.x - startMaskX) * scaleX,
                y: startMaskY + (p.y - startMaskY) * scaleY
              })) : undefined;
              return { ...m, w: nw, h: nh, points: scaledPoints };
            }
            return m;
          });
          handleUpdateLayer(selectedLayer.id, { masks: updated });
        }
      }
    }
  };

  const handleSourceDoubleClick = () => {
    if (editorTool === "freeform" && drawingPoints.length > 2) {
      const minX = Math.min(...drawingPoints.map(p => p.x));
      const minY = Math.min(...drawingPoints.map(p => p.y));
      const maxX = Math.max(...drawingPoints.map(p => p.x));
      const maxY = Math.max(...drawingPoints.map(p => p.y));
      const w = Math.max(10, maxX - minX);
      const h = Math.max(10, maxY - minY);
      
      const layerId = `layer_${Date.now()}`;
      const maskId = `mask_${Date.now()}`;
      const newMask: MaskShape = {
        id: maskId, name: `Maske ${layers.length + 1}`, type: "freeform",
        x: minX, y: minY, w, h,
        opacity: 1, feather: 8, roundness: 0, subtractMode: false,
        points: [...drawingPoints]
      };

      const s = 0.5625;
      const lx = minX * s;
      const ly = 420 + minY * s;

      const newLayer: ReframeLayer = {
        id: layerId,
        name: `Maske ${layers.length + 1}`,
        type: "mask",
        visible: true,
        cropArea: { x: minX, y: minY, w, h },
        x: Math.round(lx),
        y: Math.round(ly),
        scale: s,
        baseScale: s,
        rotation: 0,
        blur: 0,
        brightness: 1.0,
        contrast: 1.0,
        opacity: 1.0,
        feather: 8,
        roundness: 0,
        masks: [newMask]
      };

      const next = [...layers, newLayer];
      setLayers(next);
      setSelectedLayerId(layerId);
      pushHistory(next);
      setDrawingPoints([]);
      setEditorTool("select");
    }
  };

  const handleSilhouetteMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!selectedLayer) return;
    const canvas = silhouetteCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    silDragRef.current = {
      active: true,
      startX: ((e.clientX - rect.left) / rect.width) * 1080,
      startY: ((e.clientY - rect.top) / rect.height) * 1920,
      startLayerX: selectedLayer.x,
      startLayerY: selectedLayer.y
    };
  };

  // Source monitor zoom via mouse wheel centering on mouse cursor position
  const handleSourceWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const canvas = sourceCanvasRef.current;
    if (!canvas) return;
    const container = canvas.parentElement?.parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    
    // Get mouse canvas coordinate before zoom
    const coords = screenToSourceCanvas(e.clientX, e.clientY);
    
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    const oldZoom = sourceZoom;
    const newZoom = Math.max(0.5, Math.min(8, oldZoom + delta * oldZoom));
    
    const midX = CANVAS_W / 2;
    const midY = CANVAS_H / 2;
    
    // Zoom to mouse math: newPan_screen = oldPan_screen + (oldZoom - newZoom) * (coords - mid) * (rect_size / CANVAS_size)
    const newPanX = sourcePanX + (oldZoom - newZoom) * (coords.x - midX) * (rect.width / CANVAS_W);
    const newPanY = sourcePanY + (oldZoom - newZoom) * (coords.y - midY) * (rect.height / CANVAS_H);
    
    setSourceZoom(newZoom);
    setSourcePanX(newPanX);
    setSourcePanY(newPanY);
  }, [sourceZoom, sourcePanX, sourcePanY, screenToSourceCanvas]);

  // Reset zoom/pan on double-click with Alt held or middle-click
  const handleSourceZoomReset = useCallback(() => {
    setSourceZoom(1);
    setSourcePanX(0);
    setSourcePanY(0);
  }, []);

  useEffect(() => {
    const handleGlobalMove = (e: MouseEvent) => {
      // Handle Alt+drag panning on source monitor (1:1 with screen pixels)
      if (altPanRef.current.active) {
        const dx = e.clientX - altPanRef.current.startX;
        const dy = e.clientY - altPanRef.current.startY;
        setSourcePanX(altPanRef.current.startPanX + dx);
        setSourcePanY(altPanRef.current.startPanY + dy);
        return;
      }

      if (!silDragRef.current.active || !selectedLayer) return;
      const canvas = silhouetteCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dx = ((e.clientX - rect.left) / rect.width) * 1080 - silDragRef.current.startX;
      const dy = ((e.clientY - rect.top) / rect.height) * 1920 - silDragRef.current.startY;
      const lw = selectedLayer.cropArea.w * selectedLayer.scale;
      const lh = selectedLayer.cropArea.h * selectedLayer.scale;
      // Account for baseScale offset: the rendered position is shifted by this offset
      const baseScale = selectedLayer.baseScale ?? selectedLayer.scale;
      const offsetX = (selectedLayer.cropArea.w * (selectedLayer.scale - baseScale)) / 2;
      const offsetY = (selectedLayer.cropArea.h * (selectedLayer.scale - baseScale)) / 2;
      // Snap targets are for the DRAWN position (top-left of the visible area)
      const rawX = Math.round(silDragRef.current.startLayerX + dx);
      const rawY = Math.round(silDragRef.current.startLayerY + dy);
      const drawnX = rawX - offsetX;
      const drawnY = rawY - offsetY;
      const snappedDrawnX = e.altKey ? drawnX : snapValue(drawnX, [0, 540 - lw/2, 1080 - lw], 50);
      const snappedDrawnY = e.altKey ? drawnY : snapValue(drawnY, [0, 960 - lh/2, 1920 - lh], 50);
      // Convert back to layer.x/y
      const nextX = snappedDrawnX + offsetX;
      const nextY = snappedDrawnY + offsetY;
      handleUpdateLayer(selectedLayer.id, { x: nextX, y: nextY });
    };
    const handleGlobalUp = () => { 
      // End Alt+drag panning
      if (altPanRef.current.active) {
        altPanRef.current.active = false;
      }
      if (silDragRef.current.active || maskDragRef.current || creationRef.current) {
        pushHistory(layers);
      }
      if (creationRef.current) {
        setEditorTool("select");
      }
      silDragRef.current.active = false; maskDragRef.current = null; creationRef.current = null; 
    };
    window.addEventListener("mousemove", handleGlobalMove);
    window.addEventListener("mouseup", handleGlobalUp);
    return () => { window.removeEventListener("mousemove", handleGlobalMove); window.removeEventListener("mouseup", handleGlobalUp); };
  }, [selectedLayerId, selectedLayer, layers, handleUpdateLayer, snapValue, pushHistory, setEditorTool, sourceZoom]);

  return (
    <div className="w-screen h-screen flex flex-col bg-[#0b0c0e] text-[#e4e4e7] overflow-hidden select-none font-sans">
      <video key={videoPath} ref={masterVideoRef} src={convertFileSrc(videoPath)} className="hidden" loop muted playsInline autoPlay={isPlaying} />
      <div className="flex-shrink-0"><Header videoName={videoName} onSavePreset={handleSavePreset} onOpenPresets={() => setShowPresetLibrary(true)} onRender={handleRender} /></div>
      <div className="flex-1 overflow-hidden">
        <MonitorPanel editorTool={editorTool} setEditorTool={setEditorTool} sourceCanvasRef={sourceCanvasRef} silhouetteCanvasRef={silhouetteCanvasRef} programCanvasRef={programCanvasRef} onSourceMouseDown={handleSourceMouseDown} onSourceDoubleClick={handleSourceDoubleClick} onSourceMouseMove={handleSourceMouseMove} onSourceMouseLeave={() => setMouseHoverPos(null)} onSourceWheel={handleSourceWheel} onSourceZoomReset={handleSourceZoomReset} sourceZoom={sourceZoom} sourcePanX={sourcePanX} sourcePanY={sourcePanY} onSilhouetteMouseDown={handleSilhouetteMouseDown} layers={layers} selectedLayerId={selectedLayerId} drawingPoints={drawingPoints} mouseHoverPos={mouseHoverPos} CANVAS_W={CANVAS_W} CANVAS_H={CANVAS_H} footerHeight={footerHeight} />
      </div>
      <footer style={{ height: `${footerHeight}px` }} className="bg-[#121316] border-t border-white/6 flex flex-col z-20 flex-shrink-0">
        <div className="h-[46px] border-b border-white/6 flex items-center bg-[#16181d] flex-shrink-0">
           <VideoScrubber duration={duration} currentTime={currentTime} trimStart={trimStart} trimEnd={trimEnd} masterVideoRef={masterVideoRef} setTrimStart={setTrimStart} setTrimEnd={setTrimEnd} setCurrentTime={setCurrentTime} isPlaying={isPlaying} setIsPlaying={setIsPlaying} />
        </div>
        <div className="flex-1 flex overflow-hidden">
          <LayerPanel layers={layers} selectedLayerId={selectedLayerId} onSelectLayer={setSelectedLayerId} onToggleVisibility={(id: string) => { const next = layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l); setLayers(next); pushHistory(next); }} onRenameLayer={(id: string, name: string) => handleUpdateLayer(id, { name })} onDeleteLayer={(id: string) => { const next = layers.filter(l => l.id !== id); setLayers(next); pushHistory(next); }} onAddLayer={(type: "crop" | "mask") => { const id = `layer_${Date.now()}`; const next = [...layers, { id, name: "New Layer", type, visible: true, cropArea: { x: 656, y: 0, w: 608, h: 1080 }, x: 0, y: 0, scale: 1.777, baseScale: 1.777, rotation: 0, blur: 0, brightness: 1, contrast: 1, opacity: 1, feather: 0, roundness: 0, masks: [] }]; setLayers(next); setSelectedLayerId(id); pushHistory(next); }} />
          <EffectControls selectedLayer={selectedLayer} onUpdateLayer={handleUpdateLayer} snapValue={snapValue} />
        </div>
      </footer>
      {showPresetLibrary && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/90 backdrop-blur-xl">
          <div className="w-[850px] max-h-[85vh] bg-[#111215] border border-white/10 rounded-3xl p-8 shadow-2xl flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-white uppercase tracking-tighter">Preset Library</h2>
              <button onClick={() => setShowPresetLibrary(false)} className="text-zinc-500 hover:text-white transition cursor-pointer font-black text-[10px] tracking-widest bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg">CLOSE</button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-8 custom-scrollbar">
              {/* System Presets Section */}
              <div>
                <h3 className="text-[10px] font-black tracking-[0.2em] text-pink-500/80 uppercase mb-3 border-b border-white/5 pb-1">System Presets</h3>
                <div className="grid grid-cols-2 gap-4">
                  {defaultPresets.map((p, i) => (
                    <div key={i} onClick={() => applyPreset(p)} className="p-5 rounded-2xl bg-[#16181d] border border-white/5 hover:border-pink-500 transition cursor-pointer group flex flex-col gap-2 relative">
                      <div className="text-[13px] font-black text-white group-hover:text-pink-500 uppercase tracking-tight">{p.presetName}</div>
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[8px] font-black text-zinc-500 uppercase tracking-widest">{p.game}</span>
                        <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-wider">{p.layers.length} Layers</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom Presets Section */}
              <div>
                <h3 className="text-[10px] font-black tracking-[0.2em] text-pink-500/80 uppercase mb-3 border-b border-white/5 pb-1">My Presets</h3>
                {customPresets.length === 0 ? (
                  <div className="py-8 text-center text-zinc-600 text-xs font-bold uppercase tracking-wider bg-[#16181d]/50 border border-dashed border-white/5 rounded-2xl">
                    No custom presets saved yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {customPresets.map((p, i) => (
                      <div key={i} onClick={() => applyPreset(p)} className="p-5 rounded-2xl bg-[#16181d] border border-white/5 hover:border-pink-500 transition cursor-pointer group flex flex-col gap-2 relative">
                        <div className="flex justify-between items-start gap-4">
                          <div className="text-[13px] font-black text-white group-hover:text-pink-500 uppercase tracking-tight">{p.presetName}</div>
                          <button
                            onClick={(e) => handleDeletePreset(e, p.id || "")}
                            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white transition cursor-pointer opacity-80 hover:opacity-100"
                            title="Delete Preset"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[8px] font-black text-zinc-500 uppercase tracking-widest">{p.game}</span>
                          <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-wider">{p.layers.length} Layers</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {renderProgress && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="w-[400px] bg-[#111215] border border-pink-500 rounded-2xl p-6 text-center shadow-[0_0_30px_rgba(236,72,153,0.3)]">
            <h2 className="text-white font-black uppercase tracking-tight mb-2">Rendering Video</h2>
            <p className="text-zinc-500 text-[10px] mb-4 uppercase font-bold tracking-widest">{renderProgress.status}</p>
            <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden mb-2"><div className="h-full bg-pink-600 transition-all duration-300" style={{ width: `${renderProgress.progress}%` }} /></div>
            <div className="text-pink-500 font-mono text-xs">{Math.round(renderProgress.progress)}%</div>
            <button onClick={() => invoke("cancel_render")} className="mt-4 px-6 py-2 bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-white rounded-xl text-[10px] font-black transition">CANCEL RENDER</button>
          </div>
        </div>
      )}
      {modal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="w-[420px] bg-[#111215] border border-white/10 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-sm font-black text-white uppercase mb-3 tracking-widest">{modal.title}</h2>
            <p className="text-[#949ca9] text-[11px] font-semibold mb-6 leading-relaxed">{modal.message}</p>
            {modal.type === "prompt" && <input id="modal-prompt-input" autoFocus className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-white text-xs mb-6 focus:outline-none focus:border-pink-500 font-bold" defaultValue={modal.defaultValue} onKeyDown={(e) => { if(e.key === 'Enter') modal.onConfirm?.((e.target as HTMLInputElement).value); }} />}
            <div className="flex gap-2">
              <button onClick={() => modal.onCancel?.()} className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 font-black text-[10px] rounded-xl uppercase tracking-widest transition cursor-pointer">Cancel</button>
              <button onClick={() => { const val = (document.getElementById('modal-prompt-input') as HTMLInputElement)?.value; modal.onConfirm?.(val); }} className="flex-1 py-2.5 bg-pink-600 hover:bg-pink-500 text-white font-black text-[10px] rounded-xl uppercase tracking-widest shadow-lg shadow-pink-600/20 transition cursor-pointer">OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
