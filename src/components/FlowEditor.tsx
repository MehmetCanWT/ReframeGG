import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { 
  Play, Pause, Sparkles, Image as ImageIcon, Crop, Scissors,
  FolderOpen, Trash2, Eye, EyeOff, Sliders, Layers
} from "lucide-react";
import { Layer, MaskShape, Preset, defaultPresets } from "../presets";
import { VideoScrubber } from "./VideoScrubber";

// ─── TYPES & INTERFACES ───
export interface ReframeLayer {
  id: string;
  name: string;
  type: "crop" | "mask";
  visible: boolean;
  
  // Crop area on the 16:9 source (1920x1080 pixel coordinates)
  cropArea: { x: number; y: number; w: number; h: number };
  
  // Canvas output coordinates on the 1080x1920 portrait canvas
  x: number;
  y: number;
  scale: number;
  baseScale?: number;
  rotation: number;
  
  // Effects & feathering
  blur: number;
  brightness: number;
  contrast: number;
  opacity: number;
  feather: number;
  roundness: number;
  
  // Individual mask shape list (if type is mask)
  masks: MaskShape[];
}

const CANVAS_W = 1920;
const CANVAS_H = 1080;

// Persistent offscreen canvas cache to prevent GC stuttering at 60 FPS
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

// ─── HIGH PERFORMANCE RENDER HELPERS ───
const drawLayerWithFeather = (
  ctx: CanvasRenderingContext2D,
  master: HTMLVideoElement,
  layer: ReframeLayer,
  width: number,
  height: number
) => {
  const vW = master.videoWidth;
  const vH = master.videoHeight;
  if (!vW || !vH) return;

  const svX = vW / 1920;
  const svY = vH / 1080;

  ctx.clearRect(0, 0, width, height);

  if (layer.type === "mask" && layer.masks && layer.masks.length > 0) {
    const crop = layer.cropArea || { x: 0, y: 0, w: 1920, h: 1080 };
    
    // Draw the cropped source video fully blurred/filtered once
    const blurredC = getOffscreen(`blurred_${layer.id}`, width, height);
    const blurredCtx = blurredC.getContext("2d")!;
    blurredCtx.clearRect(0, 0, width, height);
    blurredCtx.save();
    blurredCtx.filter = `blur(${layer.blur}px) brightness(${layer.brightness}) contrast(${layer.contrast})`;
    blurredCtx.drawImage(
      master, 
      crop.x * svX, crop.y * svY, 
      crop.w * svX, crop.h * svY, 
      0, 0, width, height
    );
    blurredCtx.restore();

    layer.masks.forEach((m, mi) => {
      const maskC = getOffscreen(`mask_${layer.id}_${mi}`, width, height);
      const maskCtx = maskC.getContext("2d")!;
      maskCtx.clearRect(0, 0, width, height);
      maskCtx.fillStyle = "white";
      maskCtx.beginPath();

      const mx = ((m.x - crop.x) / crop.w) * width;
      const my = ((m.y - crop.y) / crop.h) * height;
      const mw = (m.w / crop.w) * width;
      const mh = (m.h / crop.h) * height;

      if (m.type === "circle") {
        maskCtx.ellipse(mx + mw / 2, my + mh / 2, mw / 2, mh / 2, 0, 0, Math.PI * 2);
      } else if (m.type === "freeform" && m.points && m.points.length > 0) {
        m.points.forEach((p, pidx) => {
          const px = ((p.x - crop.x) / crop.w) * width;
          const py = ((p.y - crop.y) / crop.h) * height;
          if (pidx === 0) maskCtx.moveTo(px, py);
          else maskCtx.lineTo(px, py);
        });
        maskCtx.closePath();
      } else {
        maskCtx.rect(mx, my, mw, mh);
      }
      maskCtx.fill();

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

      // Cut out the fully blurred canvas using source-in GCO
      maskCtx.save();
      maskCtx.globalCompositeOperation = "source-in";
      maskCtx.drawImage(blurredC, 0, 0);
      maskCtx.restore();

      ctx.save();
      ctx.globalAlpha = m.opacity ?? 1;
      ctx.drawImage(maskC, 0, 0);
      ctx.restore();
    });
  } else {
    // layer.type === "crop"
    const hasCensorMasks = layer.masks && layer.masks.length > 0;
    const globalBlur = hasCensorMasks ? 0 : layer.blur;

    ctx.save();
    ctx.filter = `blur(${globalBlur}px) brightness(${layer.brightness}) contrast(${layer.contrast})`;
    ctx.drawImage(
      master, 
      layer.cropArea.x * svX, layer.cropArea.y * svY, 
      layer.cropArea.w * svX, layer.cropArea.h * svY, 
      0, 0, width, height
    );
    ctx.filter = "none";
    ctx.restore();

    // If there are censor masks, draw blurred censor regions on top
    if (hasCensorMasks) {
      const crop = layer.cropArea;
      const blurredC = getOffscreen(`blurred_censor_${layer.id}`, width, height);
      const blurredCtx = blurredC.getContext("2d")!;
      blurredCtx.clearRect(0, 0, width, height);
      blurredCtx.save();
      // Default to 20px if layer.blur is 0
      const censorBlur = layer.blur > 0 ? layer.blur : 20;
      blurredCtx.filter = `blur(${censorBlur}px) brightness(${layer.brightness}) contrast(${layer.contrast})`;
      blurredCtx.drawImage(
        master, 
        crop.x * svX, crop.y * svY, 
        crop.w * svX, crop.h * svY, 
        0, 0, width, height
      );
      blurredCtx.restore();

      layer.masks.forEach((m, mi) => {
        const maskC = getOffscreen(`mask_censor_${layer.id}_${mi}`, width, height);
        const maskCtx = maskC.getContext("2d")!;
        maskCtx.clearRect(0, 0, width, height);
        // Fully transparent background
        maskCtx.clearRect(0, 0, width, height);
        maskCtx.fillStyle = "white";
        maskCtx.beginPath();

        const mx = ((m.x - crop.x) / crop.w) * width;
        const my = ((m.y - crop.y) / crop.h) * height;
        const mw = (m.w / crop.w) * width;
        const mh = (m.h / crop.h) * height;

        if (m.type === "circle") {
          maskCtx.ellipse(mx + mw / 2, my + mh / 2, mw / 2, mh / 2, 0, 0, Math.PI * 2);
        } else if (m.type === "freeform" && m.points && m.points.length > 0) {
          m.points.forEach((p, pidx) => {
            const px = ((p.x - crop.x) / crop.w) * width;
            const py = ((p.y - crop.y) / crop.h) * height;
            if (pidx === 0) maskCtx.moveTo(px, py);
            else maskCtx.lineTo(px, py);
          });
          maskCtx.closePath();
        } else {
          maskCtx.rect(mx, my, mw, mh);
        }
        maskCtx.fill();

        const featherVal = m.feather ?? 0;
        if (featherVal > 0) {
          const blurPx = Math.max(0.5, featherVal * (width / 1920));
          const blurC = getOffscreen(`blur_censor_${layer.id}_${mi}`, width, height);
          const blurCtx = blurC.getContext("2d")!;
          blurCtx.clearRect(0, 0, width, height);
          blurCtx.filter = `blur(${blurPx}px)`;
          blurCtx.drawImage(maskC, 0, 0);
          blurCtx.filter = "none";
          maskCtx.clearRect(0, 0, width, height);
          maskCtx.drawImage(blurC, 0, 0);
        }

        // Apply source-in to keep only the blurred pixels inside mask shapes
        maskCtx.save();
        maskCtx.globalCompositeOperation = "source-in";
        maskCtx.drawImage(blurredC, 0, 0);
        maskCtx.restore();

        ctx.save();
        ctx.globalAlpha = m.opacity ?? 1;
        ctx.drawImage(maskC, 0, 0);
        ctx.restore();
      });
    }
  }
};

const defaultInitialLayers = (): ReframeLayer[] => [
  {
    id: "layer_0",
    name: "Layer 1 (Main View)",
    type: "crop",
    visible: true,
    cropArea: { x: 0, y: 0, w: 1920, h: 1080 },
    x: 0,
    y: 420,
    scale: 0.5625,
    baseScale: 0.5625,
    rotation: 0,
    blur: 0,
    brightness: 1.0,
    contrast: 1.0,
    opacity: 1.0,
    feather: 0,
    roundness: 0,
    masks: []
  }
];

export function FlowEditor({
  videoPath, videoName, duration,
  currentTime, isPlaying, setIsPlaying,
  masterVideoRef, trimStart, trimEnd, setTrimStart, setTrimEnd, setCurrentTime
}: any) {

  // ─── WORKSPACE PANELS RESIZING STATE ───
  const [panelWidths, setPanelWidths] = useState({ left: 35, middle: 30 }); // percent
  const isResizingLeft = useRef(false);
  const isResizingRight = useRef(false);
  const [footerHeight, setFooterHeight] = useState(280);
  const isResizingFooter = useRef(false);

  // ─── LAYERS & WORKSPACE STATE ───
  const [layers, setLayers] = useState<ReframeLayer[]>(defaultInitialLayers());
  const [selectedLayerId, setSelectedLayerId] = useState<string>("layer_0");
  const selectedLayer = layers.find(l => l.id === selectedLayerId) || layers[0];

  // ─── MODAL & NOTIFICATION STATE ───
  const [modal, setModal] = useState<{
    type: "alert" | "confirm" | "prompt";
    title: string;
    message: string;
    defaultValue?: string;
    onConfirm?: (val?: string) => void;
    onCancel?: () => void;
  } | null>(null);

  const showModal = (type: "alert" | "confirm" | "prompt", title: string, message: string, defaultValue?: string): Promise<string | boolean> => {
    return new Promise((resolve) => {
      setModal({
        type,
        title,
        message,
        defaultValue,
        onConfirm: (val) => {
          setModal(null);
          resolve(type === "prompt" ? val || "" : true);
        },
        onCancel: () => {
          setModal(null);
          resolve(false);
        }
      });
    });
  };

  // ─── SNAPPING HELPER ───
  const snapValue = (val: number, targets: number[], threshold: number = 30) => {
    for (const target of targets) {
      if (Math.abs(val - target) < threshold) return target;
    }
    return val;
  };

  // ─── EDITOR / MASK DRAWING MODES ───
  const [editorTool, setEditorTool] = useState<"select" | "rect" | "circle" | "freeform">("select");
  const [mouseHoverPos, setMouseHoverPos] = useState<{ x: number, y: number } | null>(null);
  
  // Game Detected Modal states
  const [showGameDetectedModal, setShowGameDetectedModal] = useState(false);
  const [detectedGameName, setDetectedGameName] = useState("");
  const [detectedPreset, setDetectedPreset] = useState<Preset | null>(null);

  // Preset Selection Modal
  const [showPresetLibrary, setShowPresetLibrary] = useState(false);
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("reframe_custom_presets");
      if (saved) {
        setCustomPresets(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Error loading custom presets:", e);
    }
  }, []);

  const handleSaveCustomPreset = useCallback((name: string) => {
    if (!name.trim()) return;

    const layersToSave: Layer[] = layers.map((l) => {
      const layerScale = l.scale;
      const w = Math.round(l.cropArea.w * layerScale);
      const h = Math.round(l.cropArea.h * layerScale);
      return {
        id: l.id,
        label: l.name,
        cropArea: { ...l.cropArea },
        canvasPos: { x: l.x, y: l.y, w, h },
        locked: false,
        visible: l.visible,
        maskShape: l.type === "mask" ? (l.masks?.[0]?.type === "circle" ? "circle" : "freeform") : "square",
        masks: l.masks,
        blur: l.blur,
        brightness: l.brightness,
        contrast: l.contrast
      };
    });

    const newPreset: Preset = {
      game: "Custom",
      presetName: name,
      sourceResolution: { w: 1920, h: 1080 },
      layers: layersToSave
    };

    const updated = [...customPresets, newPreset];
    setCustomPresets(updated);
    localStorage.setItem("reframe_custom_presets", JSON.stringify(updated));
    showModal("alert", "Success", `"${name}" preset successfully saved!`);
  }, [layers, customPresets]);

  const handleDeleteCustomPreset = useCallback(async (presetName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = await showModal("confirm", "Delete Preset", `Are you sure you want to delete the "${presetName}" preset?`);
    if (!confirmed) return;
    const updated = customPresets.filter(p => p.presetName !== presetName);
    setCustomPresets(updated);
    localStorage.setItem("reframe_custom_presets", JSON.stringify(updated));
  }, [customPresets]);

  // ─── PANELS RESIZING HANDLERS ───
  const handleMouseDownLeftDivider = () => { isResizingLeft.current = true; };
  const handleMouseDownRightDivider = () => { isResizingRight.current = true; };
  const handleMouseDownFooterDivider = () => { isResizingFooter.current = true; };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (isResizingLeft.current) {
        const leftPercent = Math.max(15, Math.min(60, (e.clientX / w) * 100));
        setPanelWidths(prev => ({ ...prev, left: leftPercent }));
      } else if (isResizingRight.current) {
        const remainingW = w - e.clientX;
        const middlePercent = Math.max(15, Math.min(60, ((w - (panelWidths.left * w / 100) - remainingW) / w) * 100));
        setPanelWidths(prev => ({ ...prev, middle: middlePercent }));
      } else if (isResizingFooter.current) {
        const remainingHeight = h - e.clientY;
        const newHeight = Math.max(150, Math.min(600, remainingHeight));
        setFooterHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      isResizingLeft.current = false;
      isResizingRight.current = false;
      isResizingFooter.current = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [panelWidths.left]);

  // ─── AUTOMATIC GAME DETECTION ON VIDEO LOAD ───
  const lastDetectedVideoPathRef = useRef("");
  useEffect(() => {
    if (videoPath && videoPath !== lastDetectedVideoPathRef.current) {
      lastDetectedVideoPathRef.current = videoPath;

      // Start fresh with clean full-screen vertical layout
      setLayers(defaultInitialLayers());
      setSelectedLayerId("layer_0");

      const lowerName = videoName.toLowerCase();
      let matchedGame = "";
      let matchedPreset: Preset | null = null;

      // Detect based on resolution and filename
      const video = masterVideoRef.current;
      const is2K = video && (video.videoWidth > 2000 || video.videoHeight > 1200);

      if (lowerName.includes("valorant")) {
        matchedGame = "Valorant";
        matchedPreset = is2K ? defaultPresets[0] : defaultPresets[1];
      }

      if (matchedGame && matchedPreset) {
        setDetectedGameName(matchedGame);
        setDetectedPreset(matchedPreset);
        setShowGameDetectedModal(true);
      }
    }
  }, [videoPath, videoName]);

  // ─── APPLY PRESET UTILITY ───
  const applyPreset = useCallback((preset: Preset) => {
    const newLayersList: ReframeLayer[] = preset.layers.map((layer, idx) => {
      const type = (layer.maskShape === "circle" || layer.maskShape === "freeform") ? "mask" : "crop";
      
      const masks: MaskShape[] = type === "mask" ? [
        {
          id: `mask_preset_${idx}`,
          name: layer.label,
          type: layer.maskShape === "circle" ? "circle" : "freeform",
          x: layer.cropArea.x,
          y: layer.cropArea.y,
          w: layer.cropArea.w,
          h: layer.cropArea.h,
          opacity: 1.0,
          feather: 8,
          roundness: 0,
          subtractMode: false,
          points: []
        }
      ] : [];

      return {
        id: `layer_${idx}`,
        name: layer.label,
        type,
        visible: layer.visible,
        cropArea: { ...layer.cropArea },
        x: layer.canvasPos.x,
        y: layer.canvasPos.y,
        scale: layer.canvasPos.w / layer.cropArea.w,
        baseScale: layer.canvasPos.w / layer.cropArea.w,
        rotation: 0,
        blur: layer.blur ?? 0,
        brightness: layer.brightness ?? 1.0,
        contrast: layer.contrast ?? 1.0,
        opacity: 1.0,
        feather: 0,
        roundness: 0,
        masks
      };
    });

    setLayers(newLayersList);
    if (newLayersList.length > 0) {
      setSelectedLayerId(newLayersList[0].id);
    }
  }, []);

  // ─── VIEWPORTS RENDERING LOOPS (60 FPS) ───
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const silhouetteCanvasRef = useRef<HTMLCanvasElement>(null);
  const programCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let animFrameId: number;

    const renderLoop = () => {
      const master = masterVideoRef.current;
      if (!master || master.paused === undefined) {
        animFrameId = requestAnimationFrame(renderLoop);
        return;
      }

      // 1. Source Monitor Canvas (16:9 source frame with real-time blurred mask regions)
      const srcCanvas = sourceCanvasRef.current;
      if (srcCanvas) {
        const ctx = srcCanvas.getContext("2d");
        if (ctx) {
          // Draw clean source first
          ctx.drawImage(master, 0, 0, srcCanvas.width, srcCanvas.height);

          // Overlay real-time blur directly on the mask regions
          if (selectedLayer && selectedLayer.visible && selectedLayer.type === "crop" && selectedLayer.masks && selectedLayer.masks.length > 0) {
            selectedLayer.masks.forEach(m => {
              ctx.save();
              ctx.beginPath();

              if (m.type === "circle") {
                ctx.ellipse(m.x + m.w / 2, m.y + m.h / 2, m.w / 2, m.h / 2, 0, 0, Math.PI * 2);
              } else if (m.type === "freeform" && m.points && m.points.length > 0) {
                m.points.forEach((p, pidx) => {
                  if (pidx === 0) ctx.moveTo(p.x, p.y);
                  else ctx.lineTo(p.x, p.y);
                });
                ctx.closePath();
              } else if (m.type === "rect") {
                ctx.rect(m.x, m.y, m.w, m.h);
              }

              ctx.clip();
              // Apply real-time visual blur filter inside the mask region
              ctx.filter = "blur(15px)";
              ctx.drawImage(master, 0, 0, srcCanvas.width, srcCanvas.height);
              ctx.restore();
            });
          }
        }
      }

      // 2. Silhouette Monitor Canvas (9:16 black-and-white masks outline)
      const silCanvas = silhouetteCanvasRef.current;
      if (silCanvas) {
        const ctx = silCanvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "black";
          ctx.fillRect(0, 0, silCanvas.width, silCanvas.height);

          // Draw active masks of the selected layer in white
          if (selectedLayer && selectedLayer.visible) {
            ctx.fillStyle = "white";
            const layerScale = selectedLayer.scale;
            const baseScale = selectedLayer.baseScale ?? layerScale;
            const drawX = selectedLayer.x - (selectedLayer.cropArea.w * (layerScale - baseScale)) / 2;
            const drawY = selectedLayer.y - (selectedLayer.cropArea.h * (layerScale - baseScale)) / 2;

            if (selectedLayer.type === "mask" && selectedLayer.masks) {
              selectedLayer.masks.forEach(m => {
                ctx.beginPath();
                const rx = drawX + (m.x - selectedLayer.cropArea.x) * layerScale;
                const ry = drawY + (m.y - selectedLayer.cropArea.y) * layerScale;
                const rw = m.w * layerScale;
                const rh = m.h * layerScale;

                // Scale output coordinates to the 180x320 silhouette monitor size
                const px = (rx / 1080) * silCanvas.width;
                const py = (ry / 1920) * silCanvas.height;
                const pw = (rw / 1080) * silCanvas.width;
                const ph = (rh / 1920) * silCanvas.height;

                if (m.type === "circle") {
                  ctx.ellipse(px + pw / 2, py + ph / 2, pw / 2, ph / 2, 0, 0, Math.PI * 2);
                } else if (m.type === "freeform" && m.points) {
                  m.points.forEach((p, pidx) => {
                    const sx = ((drawX + (p.x - selectedLayer.cropArea.x) * layerScale) / 1080) * silCanvas.width;
                    const sy = ((drawY + (p.y - selectedLayer.cropArea.y) * layerScale) / 1920) * silCanvas.height;
                    if (pidx === 0) ctx.moveTo(sx, sy);
                    else ctx.lineTo(sx, sy);
                  });
                  ctx.closePath();
                } else {
                  ctx.rect(px, py, pw, ph);
                }
                ctx.fill();
              });
            } else {
              // Standard crop bounding box in white
              const px = (drawX / 1080) * silCanvas.width;
              const py = (drawY / 1920) * silCanvas.height;
              const pw = ((selectedLayer.cropArea.w * layerScale) / 1080) * silCanvas.width;
              const ph = ((selectedLayer.cropArea.h * layerScale) / 1920) * silCanvas.height;
              ctx.fillRect(px, py, pw, ph);
            }
          }
        }
      }

      // 3. Program Monitor Canvas (9:16 layered output composition)
      const progCanvas = programCanvasRef.current;
      if (progCanvas) {
        const ctx = progCanvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#050505";
          ctx.fillRect(0, 0, progCanvas.width, progCanvas.height);

          // Render blur background from the main layer (layer 0)
          const mainLayer = layers[0];
          if (mainLayer) {
            ctx.save();
            ctx.filter = "blur(20px) brightness(0.4) saturate(1.2)";
            ctx.drawImage(master, 0, 0, progCanvas.width, progCanvas.height);
            ctx.restore();
          }

          // Composite each active visible layer onto the program monitor
          layers.forEach(layer => {
            if (!layer.visible) return;

            // Render layer at 1080x1920 dimensions inside offscreen layer canvas
            const layerScale = layer.scale;
            const w = Math.max(1, Math.round(layer.cropArea.w * layerScale));
            const h = Math.max(1, Math.round(layer.cropArea.h * layerScale));

            const layerC = getOffscreen(`render_${layer.id}`, w, h);
            const layerCtx = layerC.getContext("2d")!;
            
            drawLayerWithFeather(layerCtx, master, layer, w, h);

            // Centering zoom logic (scaling from center of initial container)
            const baseScale = layer.baseScale ?? layerScale;
            const drawX = layer.x - (layer.cropArea.w * (layerScale - baseScale)) / 2;
            const drawY = layer.y - (layer.cropArea.h * (layerScale - baseScale)) / 2;

            // Position and render on the Program Canvas
            const px = (drawX / 1080) * progCanvas.width;
            const py = (drawY / 1920) * progCanvas.height;
            const pw = (w / 1080) * progCanvas.width;
            const ph = (h / 1920) * progCanvas.height;

            ctx.save();
            ctx.globalAlpha = layer.opacity;
            ctx.drawImage(layerC, px, py, pw, ph);
            ctx.restore();
          });
        }
      }

      animFrameId = requestAnimationFrame(renderLoop);
    };

    animFrameId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animFrameId);
  }, [layers, selectedLayerId, selectedLayer]);

  // ─── SILHOUETTE CANVAS MOUSE DRAG POSITIONING ───
  const silDragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    startLayerX: 0,
    startLayerY: 0
  });

  const handleSilhouetteMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!selectedLayer) return;
    const canvas = silhouetteCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * 1080;
    const clickY = ((e.clientY - rect.top) / rect.height) * 1920;

    silDragRef.current = {
      active: true,
      startX: clickX,
      startY: clickY,
      startLayerX: selectedLayer.x,
      startLayerY: selectedLayer.y
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!silDragRef.current.active || !selectedLayer) return;
      const canvas = silhouetteCanvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const currentX = ((e.clientX - rect.left) / rect.width) * 1080;
      const currentY = ((e.clientY - rect.top) / rect.height) * 1920;

      const dx = currentX - silDragRef.current.startX;
      const dy = currentY - silDragRef.current.startY;

      setLayers(prev => prev.map(l => {
        if (l.id === selectedLayer.id) {
          let nextX = Math.round(silDragRef.current.startLayerX + dx);
          let nextY = Math.round(silDragRef.current.startLayerY + dy);

          // Snapping logic for composition position (Left, Center, Right)
          const layerW = l.cropArea.w * l.scale;
          const layerH = l.cropArea.h * l.scale;
          nextX = snapValue(nextX, [0, 540 - layerW / 2, 1080 - layerW], 40);
          nextY = snapValue(nextY, [0, 960 - layerH / 2, 1920 - layerH], 40);

          return {
            ...l,
            x: nextX,
            y: nextY
          };
        }
        return l;
      }));
    };

    const handleMouseUp = () => {
      silDragRef.current.active = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [selectedLayerId, selectedLayer]);

  // ─── 16:9 SOURCE CANVAS MASK DRAWING LOGIC ───
  const [drawingPoints, setDrawingPoints] = useState<{ x: number, y: number }[]>([]);
  const sourceContainerRef = useRef<HTMLDivElement>(null);

  const screenToSourceCanvas = (clientX: number, clientY: number): { x: number; y: number } => {
    const canvas = sourceCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * CANVAS_W;
    const y = ((clientY - rect.top) / rect.height) * CANVAS_H;
    return { x: Math.max(0, Math.min(CANVAS_W, x)), y: Math.max(0, Math.min(CANVAS_H, y)) };
  };

  const closePolygon = useCallback((points: { x: number; y: number }[]) => {
    if (points.length < 3) {
      showModal("alert", "Missing Points", "Please define at least 3 points to complete the polygon.");
      return;
    }

    // Clean up duplicate or extremely close consecutive points
    const cleaned: { x: number; y: number }[] = [];
    points.forEach(p => {
      if (cleaned.length === 0) {
        cleaned.push(p);
      } else {
        const prev = cleaned[cleaned.length - 1];
        if (Math.hypot(p.x - prev.x, p.y - prev.y) > 8) {
          cleaned.push(p);
        }
      }
    });

    // If the last point is close to the first point, pop the duplicate last point
    if (cleaned.length > 2) {
      const first = cleaned[0];
      const last = cleaned[cleaned.length - 1];
      if (Math.hypot(last.x - first.x, last.y - first.y) < 15) {
        cleaned.pop();
      }
    }

    if (cleaned.length < 3) {
      showModal("alert", "Invalid Polygon", "Could not create polygon because points are too close together.");
      return;
    }

    const newMask: MaskShape = {
      id: `mask_${Date.now()}`,
      name: `Mask ${selectedLayer.masks.length + 1}`,
      type: "freeform",
      x: 0, y: 0, w: CANVAS_W, h: CANVAS_H,
      opacity: 1.0,
      feather: 8,
      roundness: 0,
      subtractMode: false,
      points: cleaned
    };

    setLayers(prev => prev.map(l => {
      if (l.id === selectedLayerId) {
        const nextMasks = [...l.masks, newMask];
        if (l.type === "mask") {
          let minX = CANVAS_W, minY = CANVAS_H, maxX = 0, maxY = 0;
          cleaned.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
          });
          const cropArea = { x: minX, y: minY, w: Math.max(20, maxX - minX), h: Math.max(20, maxY - minY) };
          return {
            ...l,
            cropArea,
            masks: nextMasks
          };
        } else {
          return {
            ...l,
            masks: nextMasks
          };
        }
      }
      return l;
    }));

    setDrawingPoints([]);
    setMouseHoverPos(null);
    setEditorTool("select");
  }, [selectedLayerId, selectedLayer]);

  // Keyboard controls for freeform drawing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editorTool !== "freeform") return;
      if (e.key === "Enter") {
        if (drawingPoints.length > 2) {
          closePolygon(drawingPoints);
        }
      } else if (e.key === "Escape") {
        setDrawingPoints([]);
        setMouseHoverPos(null);
        setEditorTool("select");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editorTool, drawingPoints, closePolygon]);

  const handleSourceMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (editorTool === "select") return;

    const coords = screenToSourceCanvas(e.clientX, e.clientY);

    if (editorTool === "freeform") {
      // If clicked close to the first point, close the polygon
      if (drawingPoints.length > 2) {
        const firstPoint = drawingPoints[0];
        const dist = Math.hypot(coords.x - firstPoint.x, coords.y - firstPoint.y);
        if (dist < 20) {
          closePolygon(drawingPoints);
          return;
        }
      }
      setDrawingPoints(prev => [...prev, coords]);
    } else {
      // Rectangle or Circle drag drawing
      const startX = coords.x;
      const startY = coords.y;

      const handleMouseDrag = (moveEvent: MouseEvent) => {
        const moveCoords = screenToSourceCanvas(moveEvent.clientX, moveEvent.clientY);
        const w = Math.abs(moveCoords.x - startX);
        const h = Math.abs(moveCoords.y - startY);
        const x = Math.min(startX, moveCoords.x);
        const y = Math.min(startY, moveCoords.y);

        // Update active mask drawing bounds temporarily
        setDrawingPoints([{ x, y }, { x: w, y: h }]);
      };

      const handleMouseRelease = (upEvent: MouseEvent) => {
        window.removeEventListener("mousemove", handleMouseDrag);
        window.removeEventListener("mouseup", handleMouseRelease);

        const moveCoords = screenToSourceCanvas(upEvent.clientX, upEvent.clientY);
        const w = Math.max(20, Math.abs(moveCoords.x - startX));
        const h = Math.max(20, Math.abs(moveCoords.y - startY));
        const x = Math.min(startX, moveCoords.x);
        const y = Math.min(startY, moveCoords.y);

        // Create new shape mask shape on selected layer
        const newMask: MaskShape = {
          id: `mask_${Date.now()}`,
          name: `Mask ${selectedLayer.masks.length + 1}`,
          type: editorTool === "circle" ? "circle" : "rect",
          x, y, w, h,
          opacity: 1.0,
          feather: 8,
          roundness: 0,
          subtractMode: false,
          points: []
        };

        setLayers(prev => prev.map(l => {
          if (l.id === selectedLayerId) {
            const nextMasks = [...l.masks, newMask];
            if (l.type === "mask") {
              let minX = 1920, minY = 1080, maxX = 0, maxY = 0;
              nextMasks.forEach(m => {
                minX = Math.min(minX, m.x);
                minY = Math.min(minY, m.y);
                maxX = Math.max(maxX, m.x + m.w);
                maxY = Math.max(maxY, m.y + m.h);
              });
              const cropArea = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
              return {
                ...l,
                cropArea,
                masks: nextMasks
              };
            } else {
              return {
                ...l,
                masks: nextMasks
              };
            }
          }
          return l;
        }));

        setDrawingPoints([]);
        setEditorTool("select");
      };

      window.addEventListener("mousemove", handleMouseDrag);
      window.addEventListener("mouseup", handleMouseRelease);
    }
  };

  const handleSourceDoubleClick = () => {
    if (editorTool === "freeform" && drawingPoints.length > 2) {
      closePolygon(drawingPoints);
    }
  };

  // ─── ADD / DELETE / DUPLICATE LAYER FUNCTIONS ───
  const handleAddNewLayer = (type: "crop" | "mask") => {
    const id = `layer_${Date.now()}`;
    const newLayer: ReframeLayer = {
      id,
      name: `${type === "crop" ? "Layer" : "Mask"} ${layers.length + 1}`,
      type,
      visible: true,
      cropArea: { x: 656, y: 0, w: 608, h: 1080 },
      x: 0,
      y: 0,
      scale: 1.7778,
      baseScale: 1.7778,
      rotation: 0,
      blur: 0,
      brightness: 1.0,
      contrast: 1.0,
      opacity: 1.0,
      feather: type === "mask" ? 8 : 0,
      roundness: 0,
      masks: []
    };
    setLayers(prev => [...prev, newLayer]);
    setSelectedLayerId(id);
  };

  const handleDeleteLayer = (id: string) => {
    if (layers.length <= 1) {
      showModal("alert", "Warning", "You cannot delete all layers from the project. At least one layer must remain.");
      return;
    }
    setLayers(prev => prev.filter(l => l.id !== id));
    if (selectedLayerId === id) {
      const remaining = layers.filter(l => l.id !== id);
      setSelectedLayerId(remaining[0].id);
    }
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-[#0b0c0e] text-[#e4e4e7] overflow-hidden select-none font-sans">
      
      {/* ─── TOP HEADER NAVIGATION ─── */}
      <header className="h-[55px] bg-[#121316] border-b border-white/6 px-5 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-600 to-amber-500 flex items-center justify-center font-black text-white text-base shadow-[0_0_15px_rgba(234,88,12,0.4)]">
            R
          </div>
          <span className="font-black text-base tracking-wider bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            REFRAMEGG COMPOSITOR
          </span>
          <span className="px-2 py-0.5 text-[9px] font-black tracking-widest text-[#ea580c] bg-orange-600/10 border border-orange-600/20 rounded-md">
            PRO EDITION
          </span>
        </div>

        {/* Video Scrubber info */}
        <div className="text-zinc-500 text-xs font-semibold flex items-center gap-2">
          <span className="w-2 h-2 bg-[#ea580c] rounded-full animate-pulse" />
          {videoName}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              const name = await showModal("prompt", "Save Preset", "Enter a name for the new preset:", "Custom Preset 1") as string;
              if (name) handleSaveCustomPreset(name);
            }}
            className="px-4 py-2 text-xs font-black tracking-wider bg-[#181a1f] hover:bg-[#20232a] border border-white/6 hover:border-orange-500 rounded-lg cursor-pointer transition duration-300 flex items-center gap-2 shadow-lg text-[#ea580c] font-black"
            title="Saves current layer layout as a custom preset"
          >
            <Sparkles size={14} />
            SAVE PRESET
          </button>

          <button
            onClick={() => setShowPresetLibrary(true)}
            className="px-4 py-2 text-xs font-black tracking-wider bg-[#181a1f] hover:bg-[#20232a] border border-white/6 hover:border-[#ea580c] rounded-lg cursor-pointer transition duration-300 flex items-center gap-2 shadow-lg"
          >
            <FolderOpen size={14} className="text-[#ea580c]" />
            PRESETS
          </button>

          <button
            className="px-4 py-2 font-black tracking-widest text-xs bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white rounded-lg shadow-[0_4px_15px_rgba(234,88,12,0.3)] hover:scale-[1.02] active:scale-100 cursor-pointer transition duration-300 flex items-center gap-2"
            onClick={async () => {
              try {
                showModal("alert", "Render Started", "The render process has started in the background. You can track the progress.");
                
                const getMaskBase64 = (layer: ReframeLayer): string | undefined => {
                  if (!layer.masks || layer.masks.length === 0) return undefined;

                  const canvas = document.createElement("canvas");
                  canvas.width = layer.cropArea.w;
                  canvas.height = layer.cropArea.h;
                  const ctx = canvas.getContext("2d");
                  if (!ctx) return undefined;

                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                  ctx.fillStyle = "white";

                  layer.masks.forEach(m => {
                    ctx.beginPath();
                    const mx = m.x - layer.cropArea.x;
                    const my = m.y - layer.cropArea.y;
                    const mw = m.w;
                    const mh = m.h;

                    if (m.type === "circle") {
                      ctx.ellipse(mx + mw / 2, my + mh / 2, mw / 2, mh / 2, 0, 0, Math.PI * 2);
                    } else if (m.type === "freeform" && m.points && m.points.length > 0) {
                      m.points.forEach((p, pidx) => {
                        const px = p.x - layer.cropArea.x;
                        const py = p.y - layer.cropArea.y;
                        if (pidx === 0) ctx.moveTo(px, py);
                        else ctx.lineTo(px, py);
                      });
                      ctx.closePath();
                    } else {
                      ctx.rect(mx, my, mw, mh);
                    }
                    ctx.fill();
                  });

                  return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
                };

                // Construct standard format layers for backend compatibility
                const backendLayers: any[] = layers.map((l, i) => {
                  const layerScale = l.scale;
                  const w = Math.round(l.cropArea.w * layerScale);
                  const h = Math.round(l.cropArea.h * layerScale);
                  
                  const hasMasks = l.masks && l.masks.length > 0;
                  const maskShape = l.type === "mask" 
                    ? (hasMasks ? "freeform" : undefined)
                    : (hasMasks ? "censor" : "square");
                  const maskBase64 = hasMasks ? getMaskBase64(l) : undefined;

                  return {
                    id: `layer_${i}`,
                    label: l.name,
                    cropArea: l.cropArea,
                    canvasPos: { x: l.x, y: l.y, w, h },
                    locked: false,
                    visible: l.visible,
                    masks: l.masks,
                    maskShape,
                    maskBase64,
                    blur: l.blur,
                    brightness: l.brightness,
                    contrast: l.contrast
                  };
                });

                await invoke("reframe_video", {
                  videoPath,
                  layers: backendLayers,
                  trimStart,
                  trimEnd,
                  outputRes: "1080x1920",
                  outputFps: 60,
                  backgroundMode: "blur",
                  useGpu: true,
                  outputExt: "mp4"
                });
                showModal("alert", "Success", "Render successfully completed! The file has been saved to the video directory.");
              } catch (e) {
                showModal("alert", "Error", "An error occurred during render: " + e);
              }
            }}
          >
            <Sparkles size={14} className="animate-pulse" />
            RENDER VIDEO
          </button>
        </div>
      </header>

      {/* ─── MAIN WORKSPACE CONTENT AREA (Three column resizable viewports) ─── */}
      <div className="flex-1 flex overflow-hidden w-full bg-[#08090a]">
        
        {/* PANEL 1: 16:9 SOURCE MONITOR & DRAWING OVERLAY */}
        <div 
          style={{ width: `${panelWidths.left}%` }}
          className="h-full border-r border-white/6 flex flex-col relative select-none bg-[#0a0b0d]"
        >
          {/* Header Panel */}
          <div className="h-[40px] bg-[#121316] border-b border-white/6 px-4 flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400">
              16:9 Source & Mask Drawing Monitor
            </span>

            {/* Shape Select Buttons */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setEditorTool(editorTool === "rect" ? "select" : "rect")}
                className={`p-1.5 rounded transition ${editorTool === "rect" ? "bg-[#ea580c] text-white" : "hover:bg-white/5 text-zinc-400"}`}
                title="Draw Rectangle Mask"
              >
                <Crop size={13} />
              </button>
              <button
                onClick={() => setEditorTool(editorTool === "circle" ? "select" : "circle")}
                className={`p-1.5 rounded transition ${editorTool === "circle" ? "bg-[#ea580c] text-white" : "hover:bg-white/5 text-zinc-400"}`}
                title="Draw Circle Mask"
              >
                <ImageIcon size={13} />
              </button>
              <button
                onClick={() => setEditorTool(editorTool === "freeform" ? "select" : "freeform")}
                className={`p-1.5 rounded transition ${editorTool === "freeform" ? "bg-[#ea580c] text-white" : "hover:bg-white/5 text-zinc-400"}`}
                title="Draw Freeform Polygon Mask (Double Click to Finish)"
              >
                <Scissors size={13} />
              </button>
            </div>
          </div>

          {/* Canvas Wrapper */}
          <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden bg-[#050505]">
            <div 
              ref={sourceContainerRef}
              onMouseDown={handleSourceMouseDown}
              onDoubleClick={handleSourceDoubleClick}
              onMouseMove={(e) => {
                if (editorTool === "freeform" && drawingPoints.length > 0) {
                  const coords = screenToSourceCanvas(e.clientX, e.clientY);
                  setMouseHoverPos(coords);
                } else if (mouseHoverPos !== null) {
                  setMouseHoverPos(null);
                }
              }}
              onMouseLeave={() => {
                setMouseHoverPos(null);
              }}
              className="relative w-full aspect-video max-w-full max-h-full bg-zinc-950 border border-white/5 shadow-2xl cursor-crosshair"
            >
              {/* Hidden Master Video element source sync */}
              <video
                ref={masterVideoRef}
                src={videoPath ? convertFileSrc(videoPath) : undefined}
                muted
                playsInline
                className="hidden"
              />

              <canvas
                ref={sourceCanvasRef}
                width={CANVAS_W}
                height={CANVAS_H}
                className="w-full h-full block object-contain pointer-events-none"
              />

              {/* Drawing Preview SVG Overlay */}
              <svg 
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
              >
                {/* SVG render of already drawn shape mask contours of selected layer */}
                {selectedLayer && selectedLayer.masks && (
                  selectedLayer.masks.map(m => {
                    if (m.type === "circle") {
                      return (
                        <ellipse
                          key={m.id}
                          cx={m.x + m.w / 2}
                          cy={m.y + m.h / 2}
                          rx={m.w / 2}
                          ry={m.h / 2}
                          fill="rgba(234,88,12,0.1)"
                          stroke="#ea580c"
                          strokeWidth="3"
                        />
                      );
                    } else if (m.type === "freeform" && m.points) {
                      const d = m.points.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";
                      return (
                        <path
                          key={m.id}
                          d={d}
                          fill="rgba(234,88,12,0.1)"
                          stroke="#ea580c"
                          strokeWidth="3"
                        />
                      );
                    } else {
                      return (
                        <rect
                          key={m.id}
                          x={m.x}
                          y={m.y}
                          width={m.w}
                          height={m.h}
                          fill="rgba(234,88,12,0.1)"
                          stroke="#ea580c"
                          strokeWidth="3"
                        />
                      );
                    }
                  })
                )}

                {/* Freeform drawing line indicator */}
                {editorTool === "freeform" && drawingPoints.length > 0 && (
                  <>
                    <polyline
                      points={drawingPoints.map(p => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke="#ea580c"
                      strokeWidth="3"
                    />
                    {/* Live dashed line preview to hover cursor */}
                    {mouseHoverPos && (
                      <>
                        <line
                          x1={drawingPoints[drawingPoints.length - 1].x}
                          y1={drawingPoints[drawingPoints.length - 1].y}
                          x2={mouseHoverPos.x}
                          y2={mouseHoverPos.y}
                          stroke="#ea580c"
                          strokeWidth="3"
                          strokeDasharray="5,5"
                        />
                        <line
                          x1={drawingPoints[0].x}
                          y1={drawingPoints[0].y}
                          x2={mouseHoverPos.x}
                          y2={mouseHoverPos.y}
                          stroke="rgba(234,88,12,0.4)"
                          strokeWidth="2"
                          strokeDasharray="5,5"
                        />
                      </>
                    )}
                    {drawingPoints.map((p, idx) => (
                      <circle
                        key={idx}
                        cx={p.x}
                        cy={p.y}
                        r="6"
                        fill="white"
                        stroke="#ea580c"
                        strokeWidth="2"
                      />
                    ))}
                  </>
                )}

                {/* Rect/Circle drawing drag outline */}
                {(editorTool === "rect" || editorTool === "circle") && drawingPoints.length === 2 && (
                  editorTool === "circle" ? (
                    <ellipse
                      cx={drawingPoints[0].x + drawingPoints[1].x / 2}
                      cy={drawingPoints[0].y + drawingPoints[1].y / 2}
                      rx={drawingPoints[1].x / 2}
                      ry={drawingPoints[1].y / 2}
                      fill="none"
                      stroke="#ea580c"
                      strokeWidth="3"
                      strokeDasharray="5,5"
                    />
                  ) : (
                    <rect
                      x={drawingPoints[0].x}
                      y={drawingPoints[0].y}
                      width={drawingPoints[1].x}
                      height={drawingPoints[1].y}
                      fill="none"
                      stroke="#ea580c"
                      strokeWidth="3"
                      strokeDasharray="5,5"
                    />
                  )
                )}
              </svg>
            </div>
          </div>
        </div>

        {/* DRAGGABLE LEFT PANEL RESIZER BAR */}
        <div 
          onMouseDown={handleMouseDownLeftDivider}
          className="w-1.5 h-full bg-[#121316] hover:bg-[#ea580c]/50 transition cursor-col-resize select-none relative z-10"
        />

        {/* PANEL 2: 9:16 SILHOUETTE MONITOR (Black & White Canvas) */}
        <div 
          style={{ width: `${panelWidths.middle}%` }}
          className="h-full border-r border-white/6 flex flex-col relative select-none bg-[#0a0b0d]"
        >
          {/* Header Panel */}
          <div className="h-[40px] bg-[#121316] border-b border-white/6 px-4 flex items-center">
            <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400">
              9:16 Silhouette / Mask Matte Monitor
            </span>
          </div>

          <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden bg-[#050505]">
            <div className="relative h-full aspect-[9/16] bg-black border border-white/5 shadow-2xl flex items-center justify-center overflow-hidden">
              <canvas
                ref={silhouetteCanvasRef}
                width={360}
                height={640}
                onMouseDown={handleSilhouetteMouseDown}
                className="w-full h-full block cursor-move"
                title="Drag and move masks according to output display."
              />
            </div>
          </div>
        </div>

        {/* DRAGGABLE RIGHT PANEL RESIZER BAR */}
        <div 
          onMouseDown={handleMouseDownRightDivider}
          className="w-1.5 h-full bg-[#121316] hover:bg-[#ea580c]/50 transition cursor-col-resize select-none relative z-10"
        />

        {/* PANEL 3: 9:16 PROGRAM MONITOR (Unified Preview Canvas) */}
        <div 
          className="flex-1 h-full flex flex-col relative select-none bg-[#0a0b0d]"
        >
          {/* Header Panel */}
          <div className="h-[40px] bg-[#121316] border-b border-white/6 px-4 flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400">
              9:16 Program / Vertical Output Preview
            </span>
          </div>

          <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden bg-[#050505]">
            <div className="relative h-full aspect-[9/16] bg-zinc-950 border border-white/5 shadow-2xl flex items-center justify-center overflow-hidden">
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

      {/* DRAGGABLE FOOTER RESIZER BAR */}
      <div 
        onMouseDown={handleMouseDownFooterDivider}
        className="h-1.5 w-full bg-[#121316] hover:bg-[#ea580c]/50 transition cursor-row-resize select-none relative z-30"
        title="Drag vertically to resize bottom panel"
      />

      {/* ─── BOTTOM EDITING CONTROLS PANEL (Timeline, Scrubber, Layers, Sidebar sliders) ─── */}
      <footer style={{ height: `${footerHeight}px` }} className="bg-[#121316] border-t border-white/6 flex flex-col z-20">
        
        {/* TOP SUB-ROW: SCRUBBER TIMELINE */}
        <div className="h-[50px] border-b border-white/6 flex items-center justify-between px-5 bg-[#16181d]">
          {/* Play/Pause Scrubber */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition cursor-pointer ${
                isPlaying ? "bg-orange-600 hover:bg-orange-500 text-white" : "bg-[#1f2127] hover:bg-zinc-800 text-zinc-300"
              }`}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>

            {/* Timecodes */}
            <div className="text-zinc-400 font-mono text-xs font-bold select-none">
              {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
            </div>
          </div>

          {/* Timeline bar */}
          <div className="flex-1 px-8">
            <VideoScrubber
              duration={duration}
              currentTime={currentTime}
              trimStart={trimStart}
              trimEnd={trimEnd}
              masterVideoRef={masterVideoRef}
              setTrimStart={setTrimStart}
              setTrimEnd={setTrimEnd}
              setCurrentTime={setCurrentTime}
            />
          </div>
        </div>

        {/* BOTTOM SUB-ROW: CONTROLS & SIDEBARS */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* LEFT BOTTOM SIDEBAR: TRACK LIST & LAYERS */}
          <div className="w-[320px] border-r border-white/6 flex flex-col bg-[#111215] overflow-hidden">
            <div className="h-[38px] bg-[#16181d] px-4 flex items-center justify-between border-b border-white/5">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                <Layers size={11} className="text-[#ea580c]" />
                Layer Panel
              </span>

              {/* Add Layer Actions */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleAddNewLayer("crop")}
                  className="px-2 py-1 text-[9px] font-extrabold bg-[#1f2127] hover:bg-[#ea580c]/10 hover:text-[#ea580c] border border-white/5 hover:border-[#ea580c]/30 rounded transition cursor-pointer"
                >
                  New Layer
                </button>
                <button
                  onClick={() => handleAddNewLayer("mask")}
                  className="px-2 py-1 text-[9px] font-extrabold bg-[#ea580c]/15 hover:bg-[#ea580c]/25 text-[#ea580c] border border-[#ea580c]/30 rounded transition cursor-pointer"
                >
                  New Mask
                </button>
              </div>
            </div>

            {/* Layers List */}
            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1 pr-1.5">
              {[...layers].reverse().map((layer) => {
                const isSelected = selectedLayerId === layer.id;

                return (
                  <div
                    key={layer.id}
                    onClick={() => setSelectedLayerId(layer.id)}
                    className={`flex items-center justify-between p-2.5 rounded-lg border transition cursor-pointer ${
                      isSelected 
                        ? "bg-orange-600/10 border-[#ea580c] text-white" 
                        : "bg-[#15171c] hover:bg-[#181a20] border-white/5 text-zinc-400"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {/* Visibility Toggle */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, visible: !l.visible } : l));
                        }}
                        className="text-zinc-500 hover:text-white transition p-0.5"
                      >
                        {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                      </button>
                      
                      {/* Icon indicator */}
                      {layer.type === "mask" ? (
                        <Scissors size={12} className="text-[#ec4899]" />
                      ) : (
                        <Crop size={12} className="text-[#f59e0b]" />
                      )}

                      {/* Text label / rename */}
                      <input
                        type="text"
                        value={layer.name}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const val = e.target.value;
                          setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, name: val } : l));
                        }}
                        className="bg-transparent border-none text-xs font-bold text-white focus:outline-none w-[130px] font-sans"
                      />
                    </div>

                    {/* Delete layer button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteLayer(layer.id);
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

          {/* RIGHT BOTTOM PANEL: PREMIERE EFFECT CONTROLS SIDEBAR */}
          <div className="flex-1 flex flex-col bg-[#111215] overflow-hidden">
            <div className="h-[38px] bg-[#16181d] px-4 flex items-center border-b border-white/5">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                <Sliders size={11} className="text-[#ea580c]" />
                Effect Controls
              </span>
            </div>

            {selectedLayer ? (
              <div className="flex-1 overflow-y-auto p-4 grid grid-cols-3 gap-6">
                
                {/* COLUMN 1: Position & Sizing */}
                <div className="flex flex-col gap-4">
                  <span className="text-[10px] font-black tracking-wider text-orange-500 uppercase border-b border-white/5 pb-1">
                    Layout & Scaling
                  </span>

                  {/* Position X */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px] font-bold text-zinc-400">
                      <span>Position X</span>
                      <span className="text-[#ea580c] font-mono">{selectedLayer.x}px</span>
                    </div>
                    <input
                      type="range"
                      min="-1000"
                      max="2000"
                      value={selectedLayer.x}
                      onChange={(e) => {
                        let val = parseInt(e.target.value) || 0;
                        const layerW = selectedLayer.cropArea.w * selectedLayer.scale;
                        val = snapValue(val, [0, 540 - layerW / 2, 1080 - layerW], 40);
                        setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, x: val } : l));
                      }}
                      className="w-full accent-orange-600 h-1 bg-[#1c1d22] rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Position Y */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px] font-bold text-zinc-400">
                      <span>Position Y</span>
                      <span className="text-[#ea580c] font-mono">{selectedLayer.y}px</span>
                    </div>
                    <input
                      type="range"
                      min="-1000"
                      max="2000"
                      value={selectedLayer.y}
                      onChange={(e) => {
                        let val = parseInt(e.target.value) || 0;
                        const layerH = selectedLayer.cropArea.h * selectedLayer.scale;
                        val = snapValue(val, [0, 960 - layerH / 2, 1920 - layerH], 40);
                        setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, y: val } : l));
                      }}
                      className="w-full accent-orange-600 h-1 bg-[#1c1d22] rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Scale */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px] font-bold text-zinc-400">
                      <span>Scaling</span>
                      <span className="text-[#ea580c] font-mono">{selectedLayer.scale.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="3.0"
                      step="0.01"
                      value={selectedLayer.scale}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 1.0;
                        setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, scale: val } : l));
                      }}
                      className="w-full accent-orange-600 h-1 bg-[#1c1d22] rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                {/* COLUMN 2: Crop & Sizing */}
                <div className="flex flex-col gap-4">
                  <span className="text-[10px] font-black tracking-wider text-orange-500 uppercase border-b border-white/5 pb-1">
                    Crop & Sizing
                  </span>

                  {/* Crop Width */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px] font-bold text-zinc-400">
                      <span>Width (Crop)</span>
                      <span className="text-[#ea580c] font-mono">{selectedLayer.cropArea.w}px</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="1920"
                      value={selectedLayer.cropArea.w}
                      onChange={(e) => {
                        let val = parseInt(e.target.value) || 50;
                        val = snapValue(val, [1920], 60);
                        setLayers(prev => prev.map(l => l.id === selectedLayerId ? {
                          ...l,
                          cropArea: { ...l.cropArea, w: val }
                        } : l));
                      }}
                      className="w-full accent-orange-600 h-1 bg-[#1c1d22] rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Crop Height */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px] font-bold text-zinc-400">
                      <span>Height (Crop)</span>
                      <span className="text-[#ea580c] font-mono">{selectedLayer.cropArea.h}px</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="1080"
                      value={selectedLayer.cropArea.h}
                      onChange={(e) => {
                        let val = parseInt(e.target.value) || 50;
                        val = snapValue(val, [1080], 60);
                        setLayers(prev => prev.map(l => l.id === selectedLayerId ? {
                          ...l,
                          cropArea: { ...l.cropArea, h: val }
                        } : l));
                      }}
                      className="w-full accent-orange-600 h-1 bg-[#1c1d22] rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Crop X */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px] font-bold text-zinc-400">
                      <span>Crop Position X</span>
                      <span className="text-[#ea580c] font-mono">{selectedLayer.cropArea.x}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1920"
                      value={selectedLayer.cropArea.x}
                      onChange={(e) => {
                        let val = parseInt(e.target.value) || 0;
                        val = snapValue(val, [0, 1920 - selectedLayer.cropArea.w], 40);
                        setLayers(prev => prev.map(l => l.id === selectedLayerId ? {
                          ...l,
                          cropArea: { ...l.cropArea, x: val }
                        } : l));
                      }}
                      className="w-full accent-orange-600 h-1 bg-[#1c1d22] rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Crop Y */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px] font-bold text-zinc-400">
                      <span>Crop Position Y</span>
                      <span className="text-[#ea580c] font-mono">{selectedLayer.cropArea.y}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1080"
                      value={selectedLayer.cropArea.y}
                      onChange={(e) => {
                        let val = parseInt(e.target.value) || 0;
                        val = snapValue(val, [0, 1080 - selectedLayer.cropArea.h], 40);
                        setLayers(prev => prev.map(l => l.id === selectedLayerId ? {
                          ...l,
                          cropArea: { ...l.cropArea, y: val }
                        } : l));
                      }}
                      className="w-full accent-orange-600 h-1 bg-[#1c1d22] rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                {/* COLUMN 3: Visibility, Color Filters & Effects */}
                <div className="flex flex-col gap-4">
                  <span className="text-[10px] font-black tracking-wider text-orange-500 uppercase border-b border-white/5 pb-1">
                    Filters & Effects
                  </span>

                  {/* Opacity */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px] font-bold text-zinc-400">
                      <span>Opacity (Alpha)</span>
                      <span className="text-[#ea580c] font-mono">{Math.round(selectedLayer.opacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={selectedLayer.opacity}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 1.0;
                        setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, opacity: val } : l));
                      }}
                      className="w-full accent-orange-600 h-1 bg-[#1c1d22] rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Brightness */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px] font-bold text-zinc-400">
                      <span>Brightness</span>
                      <span className="text-[#ea580c] font-mono">{selectedLayer.brightness.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.05"
                      value={selectedLayer.brightness}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 1.0;
                        setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, brightness: val } : l));
                      }}
                      className="w-full accent-orange-600 h-1 bg-[#1c1d22] rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Contrast */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px] font-bold text-zinc-400">
                      <span>Contrast</span>
                      <span className="text-[#ea580c] font-mono">{selectedLayer.contrast.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.05"
                      value={selectedLayer.contrast}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 1.0;
                        setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, contrast: val } : l));
                      }}
                      className="w-full accent-orange-600 h-1 bg-[#1c1d22] rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Blur */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px] font-bold text-zinc-400">
                      <span>Blur</span>
                      <span className="text-[#ea580c] font-mono">{selectedLayer.blur}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      value={selectedLayer.blur}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, blur: val } : l));
                      }}
                      className="w-full accent-orange-600 h-1 bg-[#1c1d22] rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Feather */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px] font-bold text-zinc-400">
                      <span>Edge Smoothing (Feather)</span>
                      <span className="text-[#ea580c] font-mono">{selectedLayer.feather}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      value={selectedLayer.feather}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, feather: val } : l));
                      }}
                      className="w-full accent-orange-600 h-1 bg-[#1c1d22] rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-zinc-600 text-xs font-bold">
                Select a layer from the left panel to edit.
              </div>
            )}
          </div>

        </div>

      </footer>

      {/* ─── MODAL: GAME DETECTED PRESET LOADER ─── */}
      {showGameDetectedModal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="w-[480px] bg-[#111215] border border-orange-600 rounded-2xl p-6 shadow-[0_0_50px_rgba(234,88,12,0.4)] text-center relative overflow-hidden select-none">
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-orange-600/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-orange-600/5 rounded-full blur-3xl" />

            <div className="relative z-10">
              <div className="w-16 h-16 mx-auto mb-4 bg-orange-600/10 border border-orange-600 rounded-full flex items-center justify-center text-orange-500">
                <Sparkles size={28} className="animate-pulse" />
              </div>

              <h2 className="text-xl font-black text-white tracking-tight mb-2">
                Game Clip Detected!
              </h2>
              <p className="text-[#949ca9] text-xs leading-relaxed mb-6">
                We detected that this video is a <strong className="text-orange-500">{detectedGameName}</strong> clip. 
                Would you like to apply the automatic vertical layout preset?
              </p>

              <div className="flex flex-col gap-2.5">
                {detectedPreset && (
                  <button
                    onClick={() => {
                      applyPreset(detectedPreset);
                      setShowGameDetectedModal(false);
                    }}
                    className="w-full py-3 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white font-extrabold text-xs tracking-wider rounded-xl transition duration-300 shadow-lg cursor-pointer uppercase"
                  >
                    Apply Preset ({detectedGameName})
                  </button>
                )}

                <button
                  onClick={() => setShowGameDetectedModal(false)}
                  className="w-full py-2.5 bg-[#181a20] hover:bg-zinc-800 text-white font-bold text-xs rounded-xl border border-white/6 transition cursor-pointer"
                >
                  Start Full Screen Vertical (No Preset)
                </button>

                <button
                  onClick={() => setShowGameDetectedModal(false)}
                  className="w-full py-2.5 text-[10px] text-zinc-500 hover:text-white transition mt-1 font-semibold cursor-pointer"
                >
                  No, Thanks
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: PRESET / TEMPLATE LIBRARY ─── */}
      {showPresetLibrary && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="w-[620px] bg-[#111215] border border-white/8 rounded-2xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.7)] relative overflow-hidden select-none">
            <div className="absolute -top-32 -left-32 w-64 h-64 bg-orange-600/5 rounded-full blur-3xl" />
            <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-orange-600/5 rounded-full blur-3xl" />

            <div className="relative z-10">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-sm font-black text-white tracking-widest flex items-center gap-2 uppercase">
                  <FolderOpen size={16} className="text-[#ea580c]" />
                  Layout Preset Library
                </h2>
                <button
                  onClick={() => setShowPresetLibrary(false)}
                  className="text-zinc-500 hover:text-white transition text-sm font-bold p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 max-h-[380px] overflow-y-auto pr-1">
                {/* ─── CUSTOM PRESETS ─── */}
                {customPresets.map((preset) => (
                  <div
                    key={preset.presetName}
                    onClick={() => {
                      applyPreset(preset);
                      setShowPresetLibrary(false);
                    }}
                    className="bg-orange-600/5 hover:bg-orange-600/10 border border-orange-600/20 hover:border-orange-500 rounded-xl p-4 transition duration-300 cursor-pointer flex flex-col justify-between h-[110px] shadow-lg group relative overflow-hidden"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_#ea580c]" />
                          <span className="text-[9px] text-[#ea580c] font-black uppercase tracking-wider">
                            Custom Preset
                          </span>
                        </div>
                        
                        <button
                          onClick={(e) => handleDeleteCustomPreset(preset.presetName, e)}
                          className="text-zinc-600 hover:text-red-500 transition p-1 rounded hover:bg-white/5"
                          title="Delete Preset"
                        >
                          ✕
                        </button>
                      </div>
                      <h3 className="text-xs font-black text-white leading-snug group-hover:text-orange-500 transition duration-200">
                        {preset.presetName}
                      </h3>
                    </div>
                    <div className="text-[9px] text-zinc-500 font-bold">
                      {preset.layers.length} Layers • Vertical 9:16
                    </div>
                  </div>
                ))}

                {/* ─── BUILT-IN PRESETS ─── */}
                {defaultPresets.map((preset) => {
                  let iconColor = "#ea580c";
                  if (preset.game === "valorant") iconColor = "#ff4655";
                  if (preset.game === "cs2") iconColor = "#f3a51b";
                  if (preset.game === "apex") iconColor = "#ff2e2e";
                  if (preset.game === "siege") iconColor = "#4b7bec";

                  return (
                    <div
                      key={preset.presetName}
                      onClick={() => {
                        applyPreset(preset);
                        setShowPresetLibrary(false);
                      }}
                      className="bg-[#15171c] hover:bg-[#1b1e26] border border-white/5 hover:border-orange-500/50 rounded-xl p-4 transition duration-300 cursor-pointer flex flex-col justify-between h-[110px] shadow-lg group relative overflow-hidden"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: iconColor, boxShadow: `0 0 8px ${iconColor}` }}
                          />
                          <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">
                            {preset.game}
                          </span>
                        </div>
                        <h3 className="text-xs font-black text-white leading-snug group-hover:text-orange-500 transition duration-200">
                          {preset.presetName}
                        </h3>
                      </div>
                      <div className="text-[9px] text-zinc-500 font-bold">
                        {preset.layers.length} Layers • Vertical 9:16
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: CUSTOM ALERT / CONFIRM / PROMPT ─── */}
      {modal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="w-[420px] bg-[#111215] border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden select-none">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-600 to-amber-500" />
            
            <h2 className="text-sm font-black text-white tracking-widest uppercase mb-3 flex items-center gap-2">
              <Sparkles size={14} className="text-orange-500" />
              {modal.title}
            </h2>
            
            <p className="text-[#949ca9] text-xs leading-relaxed mb-6 font-medium">
              {modal.message}
            </p>

            {modal.type === "prompt" && (
              <input
                type="text"
                autoFocus
                defaultValue={modal.defaultValue}
                onKeyDown={(e) => {
                  if (e.key === "Enter") modal.onConfirm?.((e.target as HTMLInputElement).value);
                }}
                className="w-full bg-[#08090a] border border-white/10 rounded-lg px-4 py-2.5 text-xs text-white focus:outline-none focus:border-orange-500/50 mb-6 font-bold"
                id="modal-prompt-input"
              />
            )}

            <div className="flex gap-2">
              {(modal.type === "confirm" || modal.type === "prompt") && (
                <button
                  onClick={() => modal.onCancel?.()}
                  className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-[11px] rounded-xl border border-white/5 transition cursor-pointer uppercase tracking-wider"
                >
                  CANCEL
                </button>
              )}
              <button
                onClick={() => {
                  if (modal.type === "prompt") {
                    const val = (document.getElementById("modal-prompt-input") as HTMLInputElement)?.value;
                    modal.onConfirm?.(val);
                  } else {
                    modal.onConfirm?.();
                  }
                }}
                className="flex-1 py-2.5 bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white font-black text-[11px] rounded-xl shadow-lg transition duration-300 cursor-pointer uppercase tracking-wider"
              >
                {modal.type === "confirm" ? "YES" : "OK"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
