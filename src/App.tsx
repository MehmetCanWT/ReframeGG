import { useState, useEffect, useRef, Fragment } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import "./i18n";
import { 
  defaultPresets, 
  Preset, 
  Layer 
} from "./presets";
import { 
  Play, 
  Pause, 
  Video, 
  FolderOpen, 
  Layers, 
  Settings, 
  Cpu, 
  Sparkles, 
  Maximize2, 
  Lock, 
  Unlock, 
  Eye, 
  EyeOff, 
  RotateCcw,
  Film,
  Compass,
  Layout
} from "lucide-react";
import "./App.css";

export default function App() {
  const { t, i18n } = useTranslation();
  const [showSettings, setShowSettings] = useState(false);
  // Video states
  const [videoPath, setVideoPath] = useState<string>("");
  const [videoName, setVideoName] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(10); // default mock duration
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(10);
  
  // Refs
  const masterVideoRef = useRef<HTMLVideoElement>(null);

  // Time formatter helper
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return "00:00:00";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Master video timeupdate handler
  const handleMasterTimeUpdate = () => {
    const master = masterVideoRef.current;
    if (!master) return;
    
    // Update React current time
    setCurrentTime(master.currentTime);
    
    // Auto loop within trim boundaries during playback
    if (master.currentTime >= trimEnd) {
      master.currentTime = trimStart;
      setCurrentTime(trimStart);
    }
    
    // Sync all slave videos with dynamic tolerance depending on playing state to prevent constant stuttering seeking
    const slaves = document.querySelectorAll(".slave-video") as NodeListOf<HTMLVideoElement>;
    const tolerance = isPlaying ? 0.4 : 0.02;
    slaves.forEach((slave) => {
      if (Math.abs(slave.currentTime - master.currentTime) > tolerance) {
        slave.currentTime = master.currentTime;
      }
    });
  };
  
  // App preset/layers state
  const getInitialPresets = () => {
    const saved = localStorage.getItem("reframe_presets");
    return saved ? JSON.parse(saved) : defaultPresets;
  };

  const [presets, setPresets] = useState<Preset[]>(getInitialPresets);
  const [activePresetIndex, setActivePresetIndex] = useState<number>(() => {
    const saved = localStorage.getItem("reframe_activePresetIndex");
    return saved ? parseInt(saved, 10) : 0;
  });
  const [layers, setLayers] = useState<Layer[]>(() => {
    const saved = localStorage.getItem("reframe_layers");
    if (saved) return JSON.parse(saved);
    const loadedPresets = getInitialPresets();
    const savedIdx = localStorage.getItem("reframe_activePresetIndex");
    const idx = savedIdx ? parseInt(savedIdx, 10) : 0;
    return JSON.parse(JSON.stringify(loadedPresets[idx]?.layers || []));
  });
  const [selectedLayerId, setSelectedLayerId] = useState<string>(() => {
    return localStorage.getItem("reframe_selectedLayerId") || "gameplay";
  });

  // LocalStorage Sync
  useEffect(() => {
    localStorage.setItem("reframe_presets", JSON.stringify(presets));
  }, [presets]);
  useEffect(() => {
    localStorage.setItem("reframe_activePresetIndex", activePresetIndex.toString());
  }, [activePresetIndex]);
  useEffect(() => {
    localStorage.setItem("reframe_layers", JSON.stringify(layers));
  }, [layers]);
  useEffect(() => {
    localStorage.setItem("reframe_selectedLayerId", selectedLayerId);
  }, [selectedLayerId]);

  // Dynamic workspace zoom
  const [zoom, setZoom] = useState<number>(1.0);

  // Infinite canvas viewport pan
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Floating panel layout translation offsets
  const [panel1Pos, setPanel1Pos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [panel2Pos, setPanel2Pos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [draggedPanel, setDraggedPanel] = useState<"panel1" | "panel2" | null>(null);
  const [panelDragStart, setPanelDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [panelInitialPos, setPanelInitialPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Spacebar pan activator
  const [spacePressed, setSpacePressed] = useState<boolean>(false);

  // Output settings
  const [outputRes, setOutputRes] = useState<string>("1080x1920");
  const [outputFps, setOutputFps] = useState<number>(60);
  const [backgroundMode, setBackgroundMode] = useState<string>("blur");
  const [useGpu, setUseGpu] = useState<boolean>(true);
  const [outputExt, setOutputExt] = useState<string>("mp4");

  // Multipliers relative to 100% viewport dimensions
  const SRC_SCALE = 533 / 1920;
  const TGT_SCALE = 270 / 1080;

  // Render modal state
  const [renderProgress, setRenderProgress] = useState<number>(-1);
  const [renderStatus, setRenderStatus] = useState<string>("");

  // Refs for drag & resize tracking
  const [dragState, setDragState] = useState<{
    layerId: string;
    mode: "crop" | "canvas" | null;
    action: "drag" | "resize" | null;
    resizeDir: string | null;
    pointIndex: number | null;
    startX: number;
    startY: number;
    initialCoords: { x: number; y: number; w: number; h: number };
  }>({
    layerId: "",
    mode: null,
    action: null,
    resizeDir: null,
    pointIndex: null,
    startX: 0,
    startY: 0,
    initialCoords: { x: 0, y: 0, w: 0, h: 0 }
  });

  const activePreset = presets[activePresetIndex];

  const handlePresetChange = (idx: number) => {
    setActivePresetIndex(idx);
    const preset = presets[idx];
    if (preset) {
      setLayers(JSON.parse(JSON.stringify(preset.layers)));
      setSelectedLayerId(preset.layers[0]?.id || "");
    }
  };

  // Listen to render events from Tauri Rust sidecar
  useEffect(() => {
    const unlisten = listen("render-progress", (event: any) => {
      const payload = event.payload as { progress: number; status: string };
      setRenderProgress(payload.progress);
      setRenderStatus(payload.status);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Playback timer simulation (only when NO video is loaded)
  useEffect(() => {
    if (videoPath) return; // Use real video events when video is loaded!
    
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= trimEnd) {
            return trimStart;
          }
          return prev + 0.1;
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying, trimStart, trimEnd, videoPath]);

  // Synchronize HTML5 video play/pause states
  useEffect(() => {
    const master = masterVideoRef.current;
    if (!master) return;
    
    if (isPlaying) {
      if (master.currentTime < trimStart || master.currentTime >= trimEnd) {
        master.currentTime = trimStart;
      }
      master.play().catch(() => {});
    } else {
      master.pause();
    }
  }, [isPlaying, trimStart, trimEnd]);

  // Ultra-high performance requestAnimationFrame Canvas 2D render loop
  useEffect(() => {
    let animFrameId: number;

    const drawCanvasFrames = () => {
      const master = masterVideoRef.current;
      if (master) {
        // Draw blur background canvas (full 9:16 video background)
        const bgCanvas = document.querySelector(".bg-blur-canvas") as HTMLCanvasElement | null;
        if (bgCanvas) {
          const bgCtx = bgCanvas.getContext("2d");
          if (bgCtx) {
            try {
              bgCtx.drawImage(master, 0, 0, bgCanvas.width, bgCanvas.height);
            } catch (_) {}
          }
        }

        // Draw each visible layer canvas
        const canvases = document.querySelectorAll(".layer-canvas") as NodeListOf<HTMLCanvasElement>;
        canvases.forEach((canvas) => {
          const layerId = canvas.getAttribute("data-layer-id");
          const layer = layers.find(l => l.id === layerId);
          if (layer && layer.visible) {
            const ctx = canvas.getContext("2d");
            if (ctx) {
              try {
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                if (layer.maskShape === "circle") {
                  ctx.save();
                  ctx.beginPath();
                  ctx.arc(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) / 2, 0, Math.PI * 2);
                  ctx.clip();
                } else if (layer.maskShape === "freeform" && layer.maskPoints) {
                  ctx.save();
                  ctx.beginPath();
                  layer.maskPoints.forEach((pt, i) => {
                    if (i === 0) ctx.moveTo(pt.x * canvas.width, pt.y * canvas.height);
                    else ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height);
                  });
                  ctx.closePath();
                  ctx.clip();
                }

                const scaleX = master.videoWidth / 1920;
                const scaleY = master.videoHeight / 1080;
                
                ctx.drawImage(
                  master,
                  layer.cropArea.x * scaleX,
                  layer.cropArea.y * scaleY,
                  layer.cropArea.w * scaleX,
                  layer.cropArea.h * scaleY,
                  0,
                  0,
                  canvas.width,
                  canvas.height
                );

                if (layer.maskShape === "circle" || layer.maskShape === "freeform") {
                  ctx.restore();
                }
              } catch (_) {}
            }
          }
        });

        // Draw preview canvases for the bottom panel
        const previewCanvases = document.querySelectorAll(".layer-preview-canvas") as NodeListOf<HTMLCanvasElement>;
        previewCanvases.forEach((canvas) => {
          const layerId = canvas.getAttribute("data-layer-id");
          const layer = layers.find(l => l.id === layerId);
          if (layer && layer.visible) {
            const ctx = canvas.getContext("2d");
            if (ctx) {
              try {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                if (layer.maskShape === "circle") {
                  ctx.save();
                  ctx.beginPath();
                  ctx.arc(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) / 2, 0, Math.PI * 2);
                  ctx.clip();
                } else if (layer.maskShape === "freeform" && layer.maskPoints) {
                  ctx.save();
                  ctx.beginPath();
                  layer.maskPoints.forEach((pt, i) => {
                    if (i === 0) ctx.moveTo(pt.x * canvas.width, pt.y * canvas.height);
                    else ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height);
                  });
                  ctx.closePath();
                  ctx.clip();
                }
                const scaleX = master.videoWidth / 1920;
                const scaleY = master.videoHeight / 1080;

                ctx.drawImage(
                  master,
                  layer.cropArea.x * scaleX,
                  layer.cropArea.y * scaleY,
                  layer.cropArea.w * scaleX,
                  layer.cropArea.h * scaleY,
                  0,
                  0,
                  canvas.width,
                  canvas.height
                );
                if (layer.maskShape === "circle" || layer.maskShape === "freeform") {
                  ctx.restore();
                }
              } catch (_) {}
            }
          }
        });
      }
      animFrameId = requestAnimationFrame(drawCanvasFrames);
    };

    if (videoPath) {
      animFrameId = requestAnimationFrame(drawCanvasFrames);
    }

    return () => {
      cancelAnimationFrame(animFrameId);
    };
  }, [videoPath, layers]);

  // Reference to canvas area for wheel zooming
  const canvasAreaRef = useRef<HTMLDivElement>(null);

  // Monitor Spacebar key down/up for panning cursor & activator
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setSpacePressed(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Safe non-passive wheel event listener for zooming
  useEffect(() => {
    const canvas = canvasAreaRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = 0.05;
      if (e.deltaY < 0) {
        setZoom(prev => Math.min(2.0, prev + zoomFactor));
      } else {
        setZoom(prev => Math.max(0.5, prev - zoomFactor));
      }
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, []);

  // Viewport panning & Floating Panel dragging listeners
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isPanning) {
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;
        setPanOffset({ x: dx, y: dy });
      } else if (draggedPanel) {
        const dx = e.clientX - panelDragStart.x;
        const dy = e.clientY - panelDragStart.y;
        if (draggedPanel === "panel1") {
          setPanel1Pos({
            x: panelInitialPos.x + dx,
            y: panelInitialPos.y + dy
          });
        } else {
          setPanel2Pos({
            x: panelInitialPos.x + dx,
            y: panelInitialPos.y + dy
          });
        }
      }
    };

    const handleGlobalMouseUp = () => {
      setIsPanning(false);
      setDraggedPanel(null);
    };

    if (isPanning || draggedPanel) {
      window.addEventListener("mousemove", handleGlobalMouseMove);
      window.addEventListener("mouseup", handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [isPanning, panStart, draggedPanel, panelDragStart, panelInitialPos]);

  // MouseDown trigger on canvas background
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    const isBackground = e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("canvas-viewport");
    // Start pan on left click on background OR space + left drag OR middle click
    if (isBackground || spacePressed || e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({
        x: e.clientX - panOffset.x,
        y: e.clientY - panOffset.y
      });
    }
  };

  // MouseDown trigger on panel title headers
  const handlePanelMouseDown = (e: React.MouseEvent, panel: "panel1" | "panel2") => {
    e.stopPropagation();
    e.preventDefault();
    setDraggedPanel(panel);
    setPanelDragStart({ x: e.clientX, y: e.clientY });
    setPanelInitialPos(panel === "panel1" ? panel1Pos : panel2Pos);
  };

  // Native File dialog trigger via Tauri Rust RFD
  const handleSelectVideo = async () => {
    try {
      const selected = await invoke<string>("select_video_file");
      if (selected) {
        setVideoPath(selected);
        // Extract file name
        const name = selected.split(/[\\/]/).pop() || "video.mp4";
        setVideoName(name);
        
        // Fetch real duration and set trim boundaries
        const info = await invoke<{ duration: number }>("get_video_info", { path: selected });
        if (info && info.duration) {
          setDuration(info.duration);
          setTrimStart(0);
          setTrimEnd(info.duration);
        }
      }
    } catch (err) {
      console.error("Video secim hatasi:", err);
      // Fallback fallback for UI demonstration if Rust command isn't built yet
      setVideoPath("C:\\Videos\\valorant_clip_1080p.mp4");
      setVideoName("valorant_clip_1080p.mp4");
      setDuration(30);
      setTrimStart(0);
      setTrimEnd(30);
    }
  };

  // Rendering call to Rust backend
  const handleStartRender = async () => {
    if (!videoPath) return;
    
    setRenderProgress(0);
    setRenderStatus("t("render.analyzing")");

    try {
      // Freeform katmanlar icin maske PNG olustur (Base64)
      const payloadLayers = layers.map(layer => {
        if (layer.maskShape === "freeform" && layer.maskPoints) {
          const canvas = document.createElement("canvas");
          canvas.width = layer.canvasPos.w;
          canvas.height = layer.canvasPos.h;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "white";
            ctx.beginPath();
            layer.maskPoints.forEach((pt, i) => {
              if (i === 0) ctx.moveTo(pt.x * canvas.width, pt.y * canvas.height);
              else ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height);
            });
            ctx.closePath();
            ctx.fill();
            const b64 = canvas.toDataURL("image/png").split(",")[1];
            return { ...layer, maskBase64: b64 };
          }
        }
        return layer;
      });

      const output = await invoke<string>("reframe_video", {
        videoPath,
        layers: payloadLayers,
        trimStart,
        trimEnd,
        outputRes,
        outputFps,
        backgroundMode,
        useGpu,
        outputExt
      });
      
      setRenderProgress(100);
      setRenderStatus(t("render.success", { path: output }));
    } catch (err: any) {
      setRenderStatus(t("render.error", { error: err }));
      setRenderProgress(-2); // indicate error
    }
  };

  const handleCancelRender = () => {
    invoke("cancel_render").catch(() => {});
    setRenderProgress(-1);
  };

  // Layer Visibility & Lock toggle
  const toggleLayerVisible = (id: string) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
  };

  const toggleLayerLocked = (id: string) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, locked: !l.locked } : l));
  };

  // Preset management: Save current setup as custom
  const handleSaveCustomPreset = () => {
    const name = prompt(t("prompt.new_preset"), t("prompt.new_preset_def", { name: activePreset.presetName }));
    if (!name) return;

    const newPreset: Preset = {
      game: activePreset.game,
      presetName: name,
      sourceResolution: { ...activePreset.sourceResolution },
      layers: JSON.parse(JSON.stringify(layers))
    };

    setPresets(prev => [...prev, newPreset]);
    setActivePresetIndex(presets.length);
  };

  // Preset deletion — only allow deleting custom presets (index >= defaultPresets.length)
  const BUILTIN_COUNT = 3; // Valorant, Apex, CS2
  const handleDeletePreset = (idx: number) => {
    if (idx < BUILTIN_COUNT) return; // Protect built-in presets
    setPresets(prev => {
      const next = prev.filter((_, i) => i !== idx);
      return next;
    });
    // If active preset was deleted, switch to last valid
    setActivePresetIndex(prev => {
      if (prev === idx) return Math.max(0, idx - 1);
      if (prev > idx) return prev - 1;
      return prev;
    });
  };

  // Add a new custom layer
  const handleAddCustomLayer = (shape: "square" | "circle" | "freeform") => {
    const label = prompt("Yeni Katman İsmi Girin:", shape === "circle" ? "Yuvarlak Katman" : shape === "freeform" ? "{t("sidebar.shape_freeform")}" : "Kare Katman");
    if (!label) return;

    const id = `custom_${Date.now()}`;
    const newLayer: Layer = {
      id,
      label,
      cropArea: { x: 810, y: 390, w: 300, h: 300 }, // Default center of 1920x1080
      canvasPos: { x: 390, y: 810, w: 300, h: 300 }, // Default center of 1080x1920
      locked: false,
      visible: true,
      maskShape: shape,
      maskPoints: shape === "freeform" ? [{x:0, y:0}, {x:1, y:0}, {x:1, y:1}, {x:0, y:1}] : undefined
    };

    setLayers(prev => [...prev, newLayer]);
    setSelectedLayerId(id);
  };

  // Delete a layer (protect gameplay layer)
  const handleDeleteLayer = (id: string) => {
    if (id === "gameplay") {
      alert(t("alert.cant_delete_main"));
      return;
    }
    if (!confirm(t("alert.confirm_delete", { label: layers.find(l => l.id === id)?.label }))) return;

    setLayers(prev => prev.filter(l => l.id !== id));
    if (selectedLayerId === id) {
      setSelectedLayerId("gameplay");
    }
  };

  // Update coordinate inputs directly
  const handleCoordinateChange = (
    layerId: string, 
    mode: "cropArea" | "canvasPos", 
    field: "x" | "y" | "w" | "h", 
    value: number
  ) => {
    setLayers(prev => prev.map(l => {
      if (l.id === layerId) {
        const target = { ...l[mode] };
        target[field] = Math.max(0, value);
        return { ...l, [mode]: target };
      }
      return l;
    }));
  };

  // DRAG & RESIZE MATHS
  const handleMouseDown = (
    e: React.MouseEvent,
    layerId: string,
    mode: "crop" | "canvas",
    action: "drag" | "resize" | "point",
    resizeDir: string | null = null,
    pointIndex: number | null = null
  ) => {
    e.stopPropagation();
    const layer = layers.find(l => l.id === layerId);
    if (!layer || layer.locked) return;

    setSelectedLayerId(layerId);
    
    const coords = mode === "crop" ? layer.cropArea : layer.canvasPos;

    setDragState({
      layerId,
      mode,
      action,
      resizeDir,
      pointIndex,
      startX: e.clientX,
      startY: e.clientY,
      initialCoords: { ...coords }
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState.layerId || !dragState.action) return;

      const layer = layers.find(l => l.id === dragState.layerId);
      if (!layer) return;

      const dxReal = (e.clientX - dragState.startX) / zoom / (dragState.mode === "crop" ? SRC_SCALE : TGT_SCALE);
      const dyReal = (e.clientY - dragState.startY) / zoom / (dragState.mode === "crop" ? SRC_SCALE : TGT_SCALE);

      setLayers(prev => prev.map(l => {
        if (l.id === dragState.layerId) {
          const field = dragState.mode === "crop" ? "cropArea" : "canvasPos";
          const newCoords = { ...l[field] };

          if (dragState.action === "drag") {
            newCoords.x = Math.round(dragState.initialCoords.x + dxReal);
            newCoords.y = Math.round(dragState.initialCoords.y + dyReal);
          } else if (dragState.action === "point" && dragState.pointIndex !== null && l.maskPoints) {
            const dxNorm = dxReal / dragState.initialCoords.w;
            const dyNorm = dyReal / dragState.initialCoords.h;
            const newPoints = [...l.maskPoints];
            newPoints[dragState.pointIndex] = {
              x: Math.max(0, Math.min(1, newPoints[dragState.pointIndex].x + dxNorm)),
              y: Math.max(0, Math.min(1, newPoints[dragState.pointIndex].y + dyNorm))
            };
            return { ...l, maskPoints: newPoints };
          } else if (dragState.action === "resize" && dragState.resizeDir) {
            const dir = dragState.resizeDir;
            if (dir.includes("e")) {
              newCoords.w = Math.max(20, Math.round(dragState.initialCoords.w + dxReal));
            }
            if (dir.includes("s")) {
              newCoords.h = Math.max(20, Math.round(dragState.initialCoords.h + dyReal));
            }
            if (dir.includes("w")) {
              const possibleW = dragState.initialCoords.w - dxReal;
              if (possibleW > 20) {
                newCoords.x = Math.round(dragState.initialCoords.x + dxReal);
                newCoords.w = Math.round(possibleW);
              }
            }
            if (dir.includes("n")) {
              const possibleH = dragState.initialCoords.h - dyReal;
              if (possibleH > 20) {
                newCoords.y = Math.round(dragState.initialCoords.y + dyReal);
                newCoords.h = Math.round(possibleH);
              }
            }
          }

          // Enforce hard bounds to keep boxes strictly inside their respective monitors/canvas
          if (dragState.mode === "crop") {
            // Strictly keep inside 1920x1080 source frame boundaries
            newCoords.x = Math.max(0, Math.min(1920 - newCoords.w, newCoords.x));
            newCoords.y = Math.max(0, Math.min(1080 - newCoords.h, newCoords.y));
          } else if (dragState.mode === "canvas") {
            // Strictly keep inside 1080x1920 vertical output canvas boundaries
            newCoords.x = Math.max(0, Math.min(1080 - newCoords.w, newCoords.x));
            newCoords.y = Math.max(0, Math.min(1920 - newCoords.h, newCoords.y));
          }

          return { ...l, [field]: newCoords };
        }
        return l;
      }));
    };

    const handleMouseUp = () => {
      setDragState({
        layerId: "",
        mode: null,
        action: null,
        resizeDir: null,
    pointIndex: null,
        startX: 0,
        startY: 0,
        initialCoords: { x: 0, y: 0, w: 0, h: 0 }
      });
    };

    if (dragState.layerId) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState]);

  const selectedLayer = layers.find(l => l.id === selectedLayerId);

  return (
    <div className="app-container">
      {/* 1. SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-glow">R</div>
          <h1 className="brand-title">ReframeGG</h1>
        </div>

        <div className="sidebar-content">
          {/* Section 1: Video Import */}
          <div className="section-card">
            <div className="section-title">
              <Video size={16} /> {t("sidebar.video")}
            </div>
            {!videoPath ? (
              <div className="video-select-zone" onClick={handleSelectVideo}>
                <FolderOpen className="video-select-icon" size={32} />
                <p style={{ fontSize: "0.85rem", fontWeight: 600 }}>{t("sidebar.load_video")}</p>
                <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                  {t("sidebar.load_video_desc")}
                </p>
              </div>
            ) : (
              <div className="video-info-box" onClick={handleSelectVideo} style={{ cursor: "pointer" }}>
                <Film size={24} className="video-select-icon" style={{ color: "var(--accent-purple)" }} />
                <div style={{ overflow: "hidden" }}>
                  <p style={{ fontSize: "0.85rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {videoName}
                  </p>
                  <p style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                    {t("sidebar.duration", { time: formatTime(duration) })}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Preset Select */}
          <div className="section-card">
            <div className="section-title">
              <Compass size={16} /> {t("sidebar.preset")}
            </div>
            <div className="preset-grid">
              {presets.map((preset, idx) => (
                <div key={idx} style={{ display: "flex", gap: "6px", alignItems: "stretch" }}>
                  <button
                    className={`preset-button ${activePresetIndex === idx ? "active" : ""}`}
                    style={{ flex: 1 }}
                    onClick={() => handlePresetChange(idx)}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {preset.presetName}
                    </span>
                    <Sparkles size={14} style={{ opacity: activePresetIndex === idx ? 1 : 0.4, flexShrink: 0 }} />
                  </button>
                  {idx >= BUILTIN_COUNT && (
                    <button
                      onClick={() => handleDeletePreset(idx)}
                      title="Şablonu Sil"
                      style={{
                        background: "rgba(255,51,102,0.1)",
                        border: "1px solid rgba(255,51,102,0.3)",
                        borderRadius: "8px",
                        padding: "0 10px",
                        color: "var(--accent-red)",
                        cursor: "pointer",
                        fontSize: "1rem",
                        lineHeight: 1,
                        flexShrink: 0,
                        transition: "var(--transition-smooth)"
                      }}
                      onMouseOver={e => (e.currentTarget.style.background = "rgba(255,51,102,0.25)")}
                      onMouseOut={e => (e.currentTarget.style.background = "rgba(255,51,102,0.1)")}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button 
                onClick={handleSaveCustomPreset}
                style={{
                  marginTop: "8px",
                  fontSize: "0.8rem",
                  background: "rgba(138,43,226,0.1)",
                  border: "1px dashed var(--accent-purple)",
                  borderRadius: "8px",
                  padding: "8px",
                  color: "var(--text-primary)",
                  cursor: "pointer"
                }}
              >
                {t("sidebar.save_preset")}
              </button>
            </div>
          </div>

          {/* Section 3: Layer Manager */}
          <div className="section-card">
            <div className="section-title">
              <Layers size={16} /> {t("sidebar.layers")}
            </div>
            <div className="layer-list">
              {layers.map(layer => (
                <div 
                  key={layer.id} 
                  className={`layer-item ${selectedLayerId === layer.id ? "selected" : ""}`}
                  onClick={() => setSelectedLayerId(layer.id)}
                  style={{ cursor: "pointer" }}
                >
                  <div className="layer-left-info">
                    <span 
                      className="layer-indicator" 
                      style={{ 
                        backgroundColor: layer.id === "gameplay" 
                          ? "var(--accent-blue)" 
                          : layer.id === "facecam" 
                          ? "var(--accent-green)" 
                          : "var(--accent-purple)" 
                      }} 
                    />
                    <span style={{ fontWeight: selectedLayerId === layer.id ? 600 : 400 }}>
                      {layer.label}
                    </span>
                  </div>
                  <div className="layer-actions">
                    <button 
                      className={`layer-action-btn ${layer.visible ? "active" : ""}`}
                      onClick={(e) => { e.stopPropagation(); toggleLayerVisible(layer.id); }}
                      title={layer.visible ? "Katmanı Gizle" : "Katmanı Göster"}
                    >
                      {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button 
                      className={`layer-action-btn ${layer.locked ? "active" : ""}`}
                      onClick={(e) => { e.stopPropagation(); toggleLayerLocked(layer.id); }}
                      title={layer.locked ? "Katman Kilidini Aç" : "Katmanı Kilitle"}
                    >
                      {layer.locked ? <Lock size={14} /> : <Unlock size={14} />}
                    </button>
                    {layer.id !== "gameplay" && (
                      <button 
                        className="layer-action-btn"
                        style={{ color: "var(--accent-red)", marginLeft: "4px" }}
                        onClick={(e) => { e.stopPropagation(); handleDeleteLayer(layer.id); }}
                        title="Katmanı Sil"
                      >
                        <span style={{ fontSize: "1.1rem", fontWeight: "bold", lineHeight: 1 }}>×</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
              <button
                onClick={() => handleAddCustomLayer("square")}
                style={{
                  flex: 1,
                  fontSize: "0.8rem",
                  background: "rgba(0,191,255,0.08)",
                  border: "1px dashed var(--accent-blue)",
                  borderRadius: "8px",
                  padding: "8px",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  transition: "var(--transition-smooth)"
                }}
                onMouseOver={e => (e.currentTarget.style.background = "rgba(0,191,255,0.15)")}
                onMouseOut={e => (e.currentTarget.style.background = "rgba(0,191,255,0.08)")}
              >
                {t("sidebar.add_square")}
              </button>
              <button
                onClick={() => handleAddCustomLayer("freeform")}
                style={{
                  flex: 1,
                  fontSize: "0.8rem",
                  background: "rgba(0,191,255,0.08)",
                  border: "1px dashed var(--accent-blue)",
                  borderRadius: "8px",
                  padding: "8px",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  transition: "var(--transition-smooth)"
                }}
                onMouseOver={e => (e.currentTarget.style.background = "rgba(0,191,255,0.15)")}
                onMouseOut={e => (e.currentTarget.style.background = "rgba(0,191,255,0.08)")}
              >
                {t("sidebar.add_freeform")}
              </button>
              <button
                onClick={() => handleAddCustomLayer("circle")}
                style={{
                  flex: 1,
                  fontSize: "0.8rem",
                  background: "rgba(0,191,255,0.08)",
                  border: "1px dashed var(--accent-blue)",
                  borderRadius: "8px",
                  padding: "8px",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  transition: "var(--transition-smooth)"
                }}
                onMouseOver={e => (e.currentTarget.style.background = "rgba(0,191,255,0.15)")}
                onMouseOut={e => (e.currentTarget.style.background = "rgba(0,191,255,0.08)")}
              >
                {t("sidebar.add_circle")}
              </button>
            </div>
          </div>

          {/* Section 4: Coordinates Calibration */}
          {selectedLayer && (
            <div className="section-card" style={{ borderLeft: "3px solid var(--accent-blue)" }}>
              <div className="section-title" style={{ color: "var(--accent-blue)" }}>
                <Settings size={16} /> {t("sidebar.calibration", { label: selectedLayer.label })}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "0.8rem" }}>
                <div>
                  <p style={{ color: "var(--text-secondary)", marginBottom: "4px" }}>{t("sidebar.crop_x")}</p>
                  <input
                    type="number"
                    className="text-input"
                    value={selectedLayer.cropArea.x}
                    onChange={(e) => handleCoordinateChange(selectedLayer.id, "cropArea", "x", parseInt(e.target.value) || 0)}
                    disabled={selectedLayer.locked}
                  />
                </div>
                <div>
                  <p style={{ color: "var(--text-secondary)", marginBottom: "4px" }}>{t("sidebar.crop_y")}</p>
                  <input
                    type="number"
                    className="text-input"
                    value={selectedLayer.cropArea.y}
                    onChange={(e) => handleCoordinateChange(selectedLayer.id, "cropArea", "y", parseInt(e.target.value) || 0)}
                    disabled={selectedLayer.locked}
                  />
                </div>
                <div>
                  <p style={{ color: "var(--text-secondary)", marginBottom: "4px" }}>{t("sidebar.width")}</p>
                  <input
                    type="number"
                    className="text-input"
                    value={selectedLayer.cropArea.w}
                    onChange={(e) => handleCoordinateChange(selectedLayer.id, "cropArea", "w", parseInt(e.target.value) || 0)}
                    disabled={selectedLayer.locked}
                  />
                </div>
                <div>
                  <p style={{ color: "var(--text-secondary)", marginBottom: "4px" }}>{t("sidebar.height")}</p>
                  <input
                    type="number"
                    className="text-input"
                    value={selectedLayer.cropArea.h}
                    onChange={(e) => handleCoordinateChange(selectedLayer.id, "cropArea", "h", parseInt(e.target.value) || 0)}
                    disabled={selectedLayer.locked}
                  />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "0.8rem", marginTop: "10px", borderTop: "1px solid var(--border-color)", paddingTop: "10px" }}>
                <div>
                  <p style={{ color: "var(--text-secondary)", marginBottom: "4px" }}>{t("sidebar.canvas_x")}</p>
                  <input
                    type="number"
                    className="text-input"
                    value={selectedLayer.canvasPos.x}
                    onChange={(e) => handleCoordinateChange(selectedLayer.id, "canvasPos", "x", parseInt(e.target.value) || 0)}
                    disabled={selectedLayer.locked}
                  />
                </div>
                <div>
                  <p style={{ color: "var(--text-secondary)", marginBottom: "4px" }}>{t("sidebar.canvas_y")}</p>
                  <input
                    type="number"
                    className="text-input"
                    value={selectedLayer.canvasPos.y}
                    onChange={(e) => handleCoordinateChange(selectedLayer.id, "canvasPos", "y", parseInt(e.target.value) || 0)}
                    disabled={selectedLayer.locked}
                  />
                </div>
              </div>

              {/* Mask Shape Selector */}
              <div style={{ marginTop: "10px", borderTop: "1px solid var(--border-color)", paddingTop: "10px", fontSize: "0.8rem" }}>
                {selectedLayer.maskShape === "freeform" && (
                  <div style={{ marginBottom: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "var(--text-secondary)" }}>{t("sidebar.free_points", { count: selectedLayer.maskPoints?.length || 0 })}</span>
                    <button 
                      onClick={() => {
                        setLayers(prev => prev.map(l => {
                          if (l.id === selectedLayer.id && l.maskPoints) {
                            // Add a point in the center
                            return { ...l, maskPoints: [...l.maskPoints, {x: 0.5, y: 0.5}] };
                          }
                          return l;
                        }));
                      }}
                      style={{ fontSize: "0.7rem", padding: "4px 8px", background: "var(--accent-purple)", color: "white", borderRadius: "4px", cursor: "pointer", border: "none" }}
                    >
                      {t("sidebar.new_point")}
                    </button>
                  </div>
                )}
                <p style={{ color: "var(--text-secondary)", marginBottom: "6px" }}>{t("sidebar.mask_shape")}</p>
                <select
                  className="select-input"
                  value={selectedLayer.maskShape || "square"}
                  disabled={selectedLayer.locked}
                  onChange={(e) => {
                    const shape = e.target.value as "square" | "circle";
                    setLayers(prev => prev.map(l =>
                      l.id === selectedLayer.id ? { ...l, maskShape: shape } : l
                    ));
                  }}
                >
                  <option value="square">{t("sidebar.shape_square")}</option>
                  <option value="circle">{t("sidebar.shape_circle")}</option>
                </select>
              </div>
            </div>
          )}

          {/* Section 5: Render Config */}
          <div className="section-card">
            <div className="section-title">
              <Cpu size={16} /> {t("sidebar.render_options")}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.8rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--text-secondary)" }}>{t("sidebar.resolution")}</span>
                <select className="select-input" style={{ width: "120px", padding: "6px" }} value={outputRes} onChange={(e) => setOutputRes(e.target.value)}>
                  <option value="1080x1920">1080p (Dikey)</option>
                  <option value="720x1280">720p (Dikey)</option>
                </select>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--text-secondary)" }}>{t("sidebar.fps")}</span>
                <select className="select-input" style={{ width: "120px", padding: "6px" }} value={outputFps} onChange={(e) => setOutputFps(parseInt(e.target.value))}>
                  <option value={60}>60 FPS</option>
                  <option value={30}>30 FPS</option>
                </select>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--text-secondary)" }}>{t("sidebar.bg_mode")}</span>
                <select className="select-input" style={{ width: "120px", padding: "6px" }} value={backgroundMode} onChange={(e) => setBackgroundMode(e.target.value)}>
                  <option value="blur">{t("sidebar.bg_blur")}</option>
                  <option value="black">{t("sidebar.bg_black")}</option>
                </select>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--text-secondary)" }}>{t("sidebar.format")}</span>
                <select className="select-input" style={{ width: "120px", padding: "6px" }} value={outputExt} onChange={(e) => setOutputExt(e.target.value)}>
                  <option value="mp4">.MP4 (H.264)</option>
                  <option value="mkv">.MKV (H.264)</option>
                  <option value="mov">.MOV (H.264)</option>
                  <option value="webm">.WEBM (VP9)</option>
                </select>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-color)", paddingTop: "8px", marginTop: "4px" }}>
                <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Cpu size={14} style={{ color: "var(--accent-green)" }} /> {t("sidebar.gpu")}
                </span>
                <input type="checkbox" checked={useGpu} onChange={(e) => setUseGpu(e.target.checked)} style={{ cursor: "pointer", width: "16px", height: "16px" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="sidebar-footer">
          <button 
            className="render-btn" 
            onClick={handleStartRender}
            disabled={!videoPath}
          >
            <Sparkles size={18} />
            {t("sidebar.render_btn")}
          </button>
        </div>
      </aside>

      {/* 2. MAIN WORKSPACE */}
      <main className="workspace">
        <header className="workspace-header">
          <div className="workspace-title-text">
            <Layout size={18} style={{ color: "var(--accent-purple)" }} />
            <span>{t("workspace.title")}</span>
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            {/* Zoom Controls */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              border: "1px solid var(--border-color)",
              padding: "4px 8px",
              borderRadius: "8px",
              backgroundColor: "var(--bg-surface)",
              fontSize: "0.85rem"
            }}>
              <span style={{ color: "var(--text-secondary)", marginRight: "4px" }}>{t("workspace.scale")}</span>
              <button 
                className="control-icon-btn" 
                onClick={() => setZoom(prev => Math.max(0.5, prev - 0.25))}
                style={{ padding: "2px 6px", fontWeight: "bold" }}
              >
                -
              </button>
              <span style={{ minWidth: "42px", textAlign: "center", fontWeight: 600 }}>
                {Math.round(zoom * 100)}%
              </span>
              <button 
                className="control-icon-btn" 
                onClick={() => setZoom(prev => Math.min(2.0, prev + 0.25))}
                style={{ padding: "2px 6px", fontWeight: "bold" }}
              >
                +
              </button>
            </div>

            <button 
              className="control-icon-btn" 
              onClick={() => {
                setZoom(1.0);
                setPanOffset({ x: 0, y: 0 });
                setPanel1Pos({ x: 0, y: 0 });
                setPanel2Pos({ x: 0, y: 0 });
              }}
              style={{
                fontSize: "0.8rem",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                border: "1px solid var(--border-color)",
                padding: "6px 12px",
                borderRadius: "8px",
                backgroundColor: "var(--bg-surface)"
              }}
            >
              <Maximize2 size={14} /> Görünümü Sıfırla
            </button>

            <button 
              className="control-icon-btn" 
              onClick={() => setShowSettings(true)}
              style={{
                fontSize: "0.8rem",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                border: "1px solid var(--border-color)",
                padding: "6px 12px",
                borderRadius: "8px",
                backgroundColor: "var(--bg-surface)"
              }}
            >
              <Settings size={14} /> {t("workspace.settings")}
            </button>
            <button 
              className="control-icon-btn" 
              onClick={() => {
                // Reset coordinate changes to original preset defaults
                setLayers(JSON.parse(JSON.stringify(activePreset.layers)));
              }}
              style={{
                fontSize: "0.8rem",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                border: "1px solid var(--border-color)",
                padding: "6px 12px",
                borderRadius: "8px",
                backgroundColor: "var(--bg-surface)"
              }}
            >
              <RotateCcw size={14} /> Şablonu Sıfırla
            </button>
          </div>
        </header>

        <div 
          className="canvas-area"
          ref={canvasAreaRef}
          onMouseDown={handleCanvasMouseDown}
          style={{
            cursor: isPanning ? "grabbing" : spacePressed ? "grab" : "default"
          }}
        >
          <div 
            className="canvas-viewport"
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
              transformOrigin: "center center",
              display: "flex",
              gap: "60px",
              alignItems: "center",
              position: "relative"
            }}
          >
            {/* Column A: Left 16:9 Monitor */}
            <div 
              className="canvas-column"
              style={{
                transform: `translate(${panel1Pos.x}px, ${panel1Pos.y}px)`,
                position: "relative"
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div 
                className="canvas-column-title"
                onMouseDown={(e) => handlePanelMouseDown(e, "panel1")}
              >
                <Maximize2 size={14} style={{ color: "var(--accent-blue)", cursor: "move" }} /> {t("workspace.source_title")}
              </div>
              <div className="monitor-16-9" id="source-monitor">
                {/* Fake Video Preview or static placeholder depending on videoPath */}
                {videoPath ? (
                  <div style={{ width: "100%", height: "100%", position: "relative" }}>
                    <video
                      ref={masterVideoRef}
                      className="master-video"
                      src={convertFileSrc(videoPath)}
                      muted
                      playsInline
                      loop={false}
                      onTimeUpdate={handleMasterTimeUpdate}
                      onSeeked={handleMasterTimeUpdate}
                      style={{ width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#000" }}
                    />
                  </div>
                ) : (
                  <div 
                    style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", cursor: "pointer" }}
                    onClick={handleSelectVideo}
                  >
                    <Video size={48} style={{ marginBottom: "12px", opacity: 0.3 }} />
                    <p style={{ fontSize: "0.85rem" }}>{t("workspace.source_desc")}</p>
                  </div>
                )}

                {/* Render crop boxes overlays */}
                {layers.filter(l => l.visible).map(layer => {
                  const isSelected = selectedLayerId === layer.id;
                  // Position calculations scaled to preview monitor dimensions (533x300)
                  const left = layer.cropArea.x * SRC_SCALE;
                  const top = layer.cropArea.y * SRC_SCALE;
                  const width = layer.cropArea.w * SRC_SCALE;
                  const height = layer.cropArea.h * SRC_SCALE;

                  // Float label above, or below if near top edge of the monitor
                  const isNearTop = top < 25;
                  const isCircle = layer.maskShape === "circle";

                  return (
                    <div
                      key={layer.id}
                      className={`crop-box-overlay ${isSelected ? "active" : ""}`}
                      style={{
                        left,
                        top,
                        width,
                        height,
                        borderRadius: isCircle ? "50%" : "0",
                        borderColor: layer.id === "gameplay" 
                          ? "var(--accent-blue)" 
                          : layer.id === "facecam" 
                          ? "var(--accent-green)" 
                          : "var(--accent-purple)",
                        cursor: layer.locked ? "default" : "move"
                      }}
                      onMouseDown={(e) => handleMouseDown(e, layer.id, "crop", "drag")}
                    >
                      <span 
                        className="crop-box-label" 
                        style={{ 
                          borderColor: isSelected ? "var(--accent-blue)" : "rgba(255,255,255,0.1)",
                          color: isSelected ? "white" : "var(--text-secondary)",
                          position: "absolute",
                          top: isNearTop ? "unset" : "-24px",
                          bottom: isNearTop ? "-24px" : "unset",
                          left: 0,
                          zIndex: 10
                        }}
                      >
                        {layer.label}
                      </span>

                      {/* Freeform Points */}
                      {!layer.locked && isSelected && layer.maskShape === "freeform" && layer.maskPoints && (
                        <>
                          {/* Draw lines between points */}
                          <svg style={{position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 5}}>
                            <polygon 
                              points={layer.maskPoints.map(p => `${p.x * width},${p.y * height}`).join(" ")}
                              fill="rgba(255,255,255,0.1)"
                              stroke="white"
                              strokeWidth="1.5"
                              strokeDasharray="4 4"
                            />
                          </svg>
                          {layer.maskPoints.map((pt, i) => (
                            <div 
                              key={i}
                              style={{ 
                                position: "absolute", 
                                left: `${pt.x * 100}%`, 
                                top: `${pt.y * 100}%`, 
                                width: "12px", 
                                height: "12px", 
                                cursor: "move", 
                                backgroundColor: "var(--accent-purple)", 
                                border: "2px solid white",
                                borderRadius: "50%", 
                                zIndex: 12,
                                transform: "translate(-50%, -50%)",
                                boxShadow: "0 0 4px rgba(0,0,0,0.5)"
                              }}
                              onMouseDown={(e) => handleMouseDown(e, layer.id, "crop", "point", null, i)}
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                if (layer.maskPoints && layer.maskPoints.length > 3) {
                                  const newPts = layer.maskPoints.filter((_, idx) => idx !== i);
                                  setLayers(prev => prev.map(l => l.id === layer.id ? {...l, maskPoints: newPts} : l));
                                }
                              }}
                            />
                          ))}
                        </>
                      )}

                      {/* Resize handles */}
                      {!layer.locked && layer.maskShape !== "freeform" && (
                        <>
                          <div 
                            style={{ 
                              position: "absolute", 
                              bottom: isCircle ? "14%" : 0, 
                              right: isCircle ? "14%" : 0, 
                              width: "12px", 
                              height: "12px", 
                              cursor: "se-resize", 
                              backgroundColor: "white", 
                              borderRadius: "50%", 
                              zIndex: 11,
                              transform: isCircle ? "translate(50%, 50%)" : "none",
                              boxShadow: "0 0 4px rgba(0,0,0,0.5)"
                            }}
                            onMouseDown={(e) => handleMouseDown(e, layer.id, "crop", "resize", "se")}
                          />
                          <div 
                            style={{ 
                              position: "absolute", 
                              top: isCircle ? "14%" : 0, 
                              left: isCircle ? "14%" : 0, 
                              width: "12px", 
                              height: "12px", 
                              cursor: "nw-resize", 
                              backgroundColor: "white", 
                              borderRadius: "50%", 
                              zIndex: 11,
                              transform: isCircle ? "translate(-50%, -50%)" : "none",
                              boxShadow: "0 0 4px rgba(0,0,0,0.5)"
                            }}
                            onMouseDown={(e) => handleMouseDown(e, layer.id, "crop", "resize", "nw")}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "12px", display: "inline-block" }}>
                {t("workspace.source_hint")}
              </span>
            </div>

            {/* Column B: Right 9:16 Monitor */}
            <div 
              className="canvas-column"
              style={{
                transform: `translate(${panel2Pos.x}px, ${panel2Pos.y}px)`,
                position: "relative"
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div 
                className="canvas-column-title"
                onMouseDown={(e) => handlePanelMouseDown(e, "panel2")}
              >
                <Layout size={14} style={{ color: "var(--accent-purple)", cursor: "move" }} /> {t("workspace.target_title")}
              </div>
              <div className="monitor-9-16" id="target-monitor">
                {/* Blur Background — real video blur via rAF canvas */}
                {backgroundMode === "blur" && videoPath ? (
                  <canvas
                    className="bg-blur-canvas"
                    width={270}
                    height={480}
                    style={{
                      position: "absolute",
                      top: 0, left: 0,
                      width: "100%",
                      height: "100%",
                      filter: "blur(18px) brightness(0.55) saturate(1.3)",
                      transform: "scale(1.1)",
                      zIndex: 0,
                      pointerEvents: "none"
                    }}
                  />
                ) : backgroundMode === "blur" ? (
                  <div style={{ 
                    position: "absolute", 
                    top: 0, left: 0, right: 0, bottom: 0, 
                    backgroundColor: "rgba(138,43,226,0.06)",
                    backgroundImage: "radial-gradient(circle at center, rgba(138,43,226,0.15) 0%, transparent 100%)",
                    zIndex: 0
                  }} />
                ) : null}

                {/* Render layer canvas outputs */}
                {layers.filter(l => l.visible).map(layer => {
                  const isSelected = selectedLayerId === layer.id;
                  // Position calculations scaled to target monitor dimensions (270x480)
                  const left = layer.canvasPos.x * TGT_SCALE;
                  const top = layer.canvasPos.y * TGT_SCALE;
                  const width = layer.canvasPos.w * TGT_SCALE;
                  const height = layer.canvasPos.h * TGT_SCALE;

                  // Float label above, or below if near top edge of the monitor
                  const isNearTopTgt = top < 25;

                  // Canvas pixel dimensions — use actual rendered px size for crisp drawing
                  const canvasPxW = Math.max(2, Math.round(layer.canvasPos.w));
                  const canvasPxH = Math.max(2, Math.round(layer.canvasPos.h));
                  const isCircle = layer.maskShape === "circle";

                  return (
                    <Fragment key={layer.id}>
                      <div
                        className={`canvas-box-element ${isSelected ? "active" : ""}`}
                        style={{
                          left,
                          top,
                          width,
                          height,
                          borderRadius: isCircle ? "50%" : "4px",
                          backgroundColor: "transparent",
                          borderColor: layer.id === "gameplay" 
                            ? "var(--accent-blue)" 
                            : layer.id === "facecam" 
                            ? "var(--accent-green)" 
                            : "var(--accent-purple)",
                          cursor: layer.locked ? "default" : "move",
                          overflow: isCircle ? "hidden" : "hidden",
                          zIndex: 2
                        }}
                        onMouseDown={(e) => handleMouseDown(e, layer.id, "canvas", "drag")}
                      >
                        {/* rAF-driven Canvas 2D — zero stutter, zero extra video decoders */}
                        {videoPath ? (
                          <canvas
                            className="layer-canvas"
                            data-layer-id={layer.id}
                            width={canvasPxW}
                            height={canvasPxH}
                            style={{
                              position: "absolute",
                              top: 0, left: 0,
                              width: "100%",
                              height: "100%",
                              borderRadius: isCircle ? "50%" : "0",
                              pointerEvents: "none",
                              display: "block"
                            }}
                          />
                        ) : (
                          <div style={{ 
                            width: "100%", 
                            height: "100%", 
                            opacity: 0.15,
                            borderRadius: isCircle ? "50%" : "0",
                            background: layer.id === "gameplay" 
                              ? "repeating-linear-gradient(45deg, var(--accent-blue) 0px, var(--accent-blue) 10px, transparent 10px, transparent 20px)"
                              : "repeating-linear-gradient(-45deg, var(--accent-purple) 0px, var(--accent-purple) 10px, transparent 10px, transparent 20px)"
                          }} />
                        )}

                        {/* Resize handle */}
                        {!layer.locked && (
                          <div 
                            style={{ position: "absolute", bottom: 0, right: 0, width: "8px", height: "8px", cursor: "se-resize", backgroundColor: "white", borderRadius: "50%", zIndex: 11 }}
                            onMouseDown={(e) => handleMouseDown(e, layer.id, "canvas", "resize", "se")}
                          />
                        )}
                      </div>

                      {/* Floating title rendered outside layer box to prevent clipping by overflow: hidden */}
                      <span 
                        className="canvas-box-title" 
                        style={{ 
                          borderColor: isSelected ? "var(--accent-blue)" : "rgba(255,255,255,0.1)",
                          fontSize: "0.65rem",
                          position: "absolute",
                          left: `${left}px`,
                          top: `${isNearTopTgt ? (top + height + 4) : (top - 20)}px`,
                          zIndex: 10,
                          pointerEvents: "none"
                        }}
                      >
                        {layer.label}
                      </span>
                    </Fragment>
                  );
                })}
              </div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "12px", display: "inline-block" }}>
                {t("workspace.target_hint")}
              </span>
            </div>
          </div>
        </div>

        {/* 2.5. KATMAN ONIZLEMELERI (LAYER PREVIEWS) */}
        <div className="layer-previews-panel" style={{
          padding: "16px 20px",
          borderTop: "1px solid var(--border-color)",
          backgroundColor: "var(--bg-surface)",
          display: "flex",
          gap: "16px",
          overflowX: "auto",
          minHeight: "130px",
          alignItems: "center"
        }}>
          {layers.filter(l => l.visible).map(layer => {
            const isSelected = selectedLayerId === layer.id;
            const aspect = layer.cropArea.w / layer.cropArea.h;
            const previewHeight = 70;
            const previewWidth = previewHeight * aspect;
            const isCircle = layer.maskShape === "circle";
            
            return (
              <div 
                key={`preview-${layer.id}`} 
                onClick={() => setSelectedLayerId(layer.id)}
                style={{
                  display: "flex", 
                  flexDirection: "column", 
                  gap: "8px", 
                  alignItems: "center",
                  cursor: "pointer",
                  opacity: isSelected ? 1 : 0.5,
                  transition: "all 0.2s ease"
                }}
              >
                <span style={{ 
                  fontSize: "0.75rem", 
                  fontWeight: isSelected ? 600 : 400, 
                  color: isSelected ? "var(--accent-blue)" : "var(--text-secondary)",
                  whiteSpace: "nowrap"
                }}>
                  {layer.label}
                </span>
                
                <div style={{
                  width: `${Math.max(40, previewWidth)}px`,
                  height: `${previewHeight}px`,
                  backgroundColor: layer.id === "gameplay" ? "rgba(0,191,255,0.1)" : "rgba(138,43,226,0.1)",
                  border: `2px solid ${isSelected ? (layer.id === "gameplay" ? "var(--accent-blue)" : "var(--accent-purple)") : "var(--border-color)"}`,
                  borderRadius: isCircle ? "50%" : "8px",
                  overflow: "hidden",
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: isSelected ? "0 0 12px rgba(0,0,0,0.3)" : "none"
                }}>
                  {videoPath ? (
                    <canvas
                      className="layer-preview-canvas"
                      data-layer-id={layer.id}
                      width={layer.cropArea.w}
                      height={layer.cropArea.h}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "fill",
                        pointerEvents: "none",
                        display: "block"
                      }}
                    />
                  ) : (
                    <div style={{
                      position: "absolute",
                      inset: 0,
                      background: layer.id === "gameplay" 
                        ? "repeating-linear-gradient(45deg, rgba(0,191,255,0.15) 0px, rgba(0,191,255,0.15) 10px, transparent 10px, transparent 20px)"
                        : "repeating-linear-gradient(-45deg, rgba(138,43,226,0.15) 0px, rgba(138,43,226,0.15) 10px, transparent 10px, transparent 20px)"
                    }} />
                  )}
                  
                  {/* Size Label */}
                  <div style={{
                    position: "absolute",
                    bottom: "4px",
                    backgroundColor: "rgba(0,0,0,0.6)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    fontSize: "0.55rem",
                    color: "white",
                    zIndex: 1,
                    pointerEvents: "none"
                  }}>
                    {layer.cropArea.w}x{layer.cropArea.h}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 3. TIMELINE & TRIM PANEL */}
        <footer className="timeline-panel">
          <div className="timeline-upper">
            <div style={{ display: "flex", gap: "20px" }}>
              <span>{t("timeline.limits")}</span>
              <span style={{ color: "var(--accent-blue)", fontWeight: 600 }}>{t("timeline.start")} {formatTime(trimStart)}</span>
              <span style={{ color: "var(--accent-purple)", fontWeight: 600 }}>{t("timeline.end")} {formatTime(trimEnd)}</span>
            </div>
            <div>
              <span>{t("timeline.duration")}<strong style={{ color: "white" }}>{formatTime(trimEnd - trimStart)}</strong></span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            {/* Play/Pause controls */}
            <div className="playback-controls">
              <button 
                className={`control-icon-btn ${isPlaying ? "play-pulse" : ""}`} 
                onClick={() => setIsPlaying(!isPlaying)}
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              </button>
            </div>

            {/* Slider bar */}
            <div className="timeline-slider-container" style={{ flex: 1 }}>
              <div className="timeline-track">
                {/* Trim region highlight */}
                <div 
                  className="timeline-trim-range" 
                  style={{
                    left: `${(trimStart / duration) * 100}%`,
                    width: `${((trimEnd - trimStart) / duration) * 100}%`
                  }}
                />
                
                {/* Active Playhead */}
                <div 
                  className="timeline-progress-fill" 
                  style={{ 
                    left: `${(trimStart / duration) * 100}%`,
                    width: `${((currentTime - trimStart) / duration) * 100}%` 
                  }} 
                />

                {/* Start Trim Handle */}
                <div 
                  className="timeline-handle" 
                  style={{ 
                    left: `${(trimStart / duration) * 100}%`, 
                    borderColor: "var(--accent-blue)" 
                  }}
                  onMouseDown={(e) => {
                    const trackElement = e.currentTarget.parentElement;
                    const trackWidth = trackElement ? trackElement.clientWidth : 1;
                    const startX = e.clientX;
                    const initialStart = trimStart;
                    const handleMouseMove = (mvEvent: MouseEvent) => {
                      const dx = (mvEvent.clientX - startX) / trackWidth;
                      const newVal = Math.max(0, Math.min(trimEnd - 0.5, initialStart + dx * duration));
                      setTrimStart(newVal);
                      setCurrentTime(newVal);
                      if (masterVideoRef.current) {
                        masterVideoRef.current.currentTime = newVal;
                      }
                    };
                    const handleMouseUp = () => {
                      window.removeEventListener("mousemove", handleMouseMove);
                      window.removeEventListener("mouseup", handleMouseUp);
                    };
                    window.addEventListener("mousemove", handleMouseMove);
                    window.addEventListener("mouseup", handleMouseUp);
                  }}
                />

                {/* End Trim Handle */}
                <div 
                  className="timeline-handle" 
                  style={{ 
                    left: `${(trimEnd / duration) * 100}%`, 
                    borderColor: "var(--accent-purple)" 
                  }}
                  onMouseDown={(e) => {
                    const trackElement = e.currentTarget.parentElement;
                    const trackWidth = trackElement ? trackElement.clientWidth : 1;
                    const startX = e.clientX;
                    const initialEnd = trimEnd;
                    const handleMouseMove = (mvEvent: MouseEvent) => {
                      const dx = (mvEvent.clientX - startX) / trackWidth;
                      const newVal = Math.max(trimStart + 0.5, Math.min(duration, initialEnd + dx * duration));
                      setTrimEnd(newVal);
                      if (masterVideoRef.current && masterVideoRef.current.currentTime > newVal) {
                        masterVideoRef.current.currentTime = newVal;
                        setCurrentTime(newVal);
                      }
                    };
                    const handleMouseUp = () => {
                      window.removeEventListener("mousemove", handleMouseMove);
                      window.removeEventListener("mouseup", handleMouseUp);
                    };
                    window.addEventListener("mousemove", handleMouseMove);
                    window.addEventListener("mouseup", handleMouseUp);
                  }}
                />
              </div>
            </div>
            
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", minWidth: "60px", textAlign: "right" }}>
              {formatTime(currentTime)}
            </div>
          </div>
        </footer>
      </main>

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="render-overlay" onClick={() => setShowSettings(false)}>
          <div className="render-progress-card" onClick={e => e.stopPropagation()} style={{ minWidth: "300px" }}>
            <h2 className="render-status-title">{t("settings.title")}</h2>
            
            <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--text-secondary)" }}>{t("settings.language")}</span>
                <select 
                  className="select-input" 
                  value={i18n.language}
                  onChange={(e) => {
                    i18n.changeLanguage(e.target.value);
                    localStorage.setItem("reframe_lang", e.target.value);
                  }}
                  style={{ width: "120px", padding: "6px" }}
                >
                  <option value="en">English</option>
                  <option value="tr">Türkçe</option>
                </select>
              </label>
            </div>

            <button 
              className="render-cancel-btn" 
              style={{ marginTop: "20px", backgroundColor: "var(--accent-purple)", borderColor: "var(--accent-purple)", color: "white" }} 
              onClick={() => setShowSettings(false)}
            >
              {t("settings.close")}
            </button>
          </div>
        </div>
      )}

      {/* 3. RENDER PROGRESS OVERLAY */}
      {renderProgress >= 0 && (
        <div className="render-overlay">
          <div className="render-progress-card">
            {renderProgress < 100 && <div className="render-spinner" />}
            <h2 className="render-status-title">
              {renderProgress < 100 ? "{t("render.title")}" : "{t("render.title_done")}"}
            </h2>
            <p className="render-status-subtitle">
              {renderStatus}
            </p>

            {renderProgress >= 0 && renderProgress <= 100 && (
              <div className="render-progress-bar-container">
                <div 
                  className="render-progress-bar-fill" 
                  style={{ width: `${renderProgress}%` }}
                />
              </div>
            )}

            <div style={{ fontSize: "1.2rem", fontWeight: 700, margin: "10px 0" }}>
              {renderProgress < 100 ? `${Math.round(renderProgress)}%` : "🎉"}
            </div>

            {renderProgress < 100 ? (
              <button className="render-cancel-btn" onClick={handleCancelRender}>
                {t("render.cancel")}
              </button>
            ) : (
              <button 
                className="render-cancel-btn" 
                style={{ backgroundColor: "var(--accent-purple)", borderColor: "var(--accent-purple)", color: "white" }} 
                onClick={() => setRenderProgress(-1)}
              >
                {t("render.close")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
