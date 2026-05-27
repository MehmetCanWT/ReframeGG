import { useState, useEffect, useRef, useCallback } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./i18n";
import { Layer, MaskShape, defaultPresets } from "./presets";
import { 
  Play, Pause, Sparkles, Image as ImageIcon, Crop, Move, Scissors, 
  Save, FolderOpen, Undo, Redo, Trash, Eye, EyeOff, Plus, Check, X, RotateCcw,
  Sliders, Layers
} from "lucide-react";
import {
  ReactFlow,
  ReactFlowProvider,
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
import { nodeTypes } from "./nodes";
import "./App.css";

function FlowEditor({ 
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

  // Context Menu State
  const [menuPos, setMenuPos] = useState<{x: number, y: number} | null>(null);
  const [connectingHandle, setConnectingHandle] = useState<any>(null);

  // Mask Editor State
  const [editingMaskNode, setEditingMaskNode] = useState<{id: string, data: any} | null>(null);
  const [selectedMaskId, setSelectedMaskId] = useState<string>("");
  const [maskUndoStack, setMaskUndoStack] = useState<MaskShape[][]>([]);
  const [maskRedoStack, setMaskRedoStack] = useState<MaskShape[][]>([]);
  const [editorTool, setEditorTool] = useState<"select" | "rect" | "circle">("select");
  
  // Drag/Resize in Mask Editor
  const [draggedMaskId, setDraggedMaskId] = useState<string>("");
  const [resizeDir, setResizeDir] = useState<string>("");
  const [startMousePos, setStartMousePos] = useState({ x: 0, y: 0 });
  const [startMaskPos, setStartMaskPos] = useState({ x: 0, y: 0, w: 0, h: 0 });

  useEffect(() => {
    const handleOpenMask = (e: any) => {
      const nodeData = e.detail.data;
      // Initialize masks if empty
      if (!nodeData.masks || nodeData.masks.length === 0) {
        nodeData.masks = [
          {
            id: `mask_init_${Date.now()}`,
            type: nodeData.shape || "circle",
            x: 200, y: 200, w: 200, h: 200,
            opacity: 1.0,
            feather: 0,
            roundness: 0,
            subtractMode: false
          }
        ];
      }
      setEditingMaskNode({ id: e.detail.nodeId, data: JSON.parse(JSON.stringify(nodeData)) });
      setSelectedMaskId(nodeData.masks[0].id);
      setMaskUndoStack([JSON.parse(JSON.stringify(nodeData.masks))]);
      setMaskRedoStack([]);
      setEditorTool("select");
    };
    window.addEventListener('openMaskEditor', handleOpenMask);
    return () => window.removeEventListener('openMaskEditor', handleOpenMask);
  }, []);

  // Internal Compiled Layers for Rendering
  const [compiledLayers, setCompiledLayers] = useState<Layer[]>([]);

  // Initialize default graph on load
  useEffect(() => {
    if (videoPath && nodes.length === 0) {
      const defaultNodes: Node[] = [
        { id: "source_1", type: "source", position: { x: 50, y: 200 }, data: { videoName } },
        { id: "mask_1", type: "mask", position: { x: 300, y: 200 }, data: { shape: "circle", masks: [] } },
        { id: "crop_1", type: "crop", position: { x: 550, y: 200 }, data: { top: 0, bottom: 0, left: 0, right: 0 } },
        { id: "transform_1", type: "transform", position: { x: 800, y: 200 }, data: { x: 0, y: 0, scaleX: 1, scaleY: 1, lockAspectRatio: true } },
        { id: "blend_1", type: "blend", position: { x: 1100, y: 200 }, data: {} },
        { id: "output_1", type: "output", position: { x: 1400, y: 200 }, data: {} }
      ];
      const defaultEdges: Edge[] = [
        { id: "e_src_mask", source: "source_1", target: "mask_1" },
        { id: "e_mask_crop", source: "mask_1", target: "crop_1" },
        { id: "e_crop_trans", source: "crop_1", target: "transform_1" },
        { id: "e_trans_blend", source: "transform_1", target: "blend_1", targetHandle: "layer_0" },
        { id: "e_blend_out", source: "blend_1", sourceHandle: "mix", target: "output_1" }
      ];
      setNodes(defaultNodes);
      setEdges(defaultEdges);
      setHistory([{ nodes: defaultNodes, edges: defaultEdges }]);
      setHistoryIndex(0);
    }
  }, [videoPath]);

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

  // Radial quick node creation menu trigger
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

  // --- THE COMPILER ---
  useEffect(() => {
    const blendNode = nodes.find(n => n.type === "blend");
    if (!blendNode) {
      setCompiledLayers([]);
      return;
    }

    const newLayers: Layer[] = [];
    
    // Trace back from each input port on the blend node
    for (let i = 0; i < 5; i++) {
      const handleId = `layer_${i}`;
      const connectedEdge = edges.find(e => e.target === blendNode.id && e.targetHandle === handleId);
      
      if (connectedEdge) {
        let currentNodeId: string | null = connectedEdge.source;
        let cropData = { top: 0, bottom: 0, left: 0, right: 0 };
        let transData = { x: 0, y: 0, scaleX: 1, scaleY: 1 };
        let maskShape = "square";
        let masksList: MaskShape[] = [];

        // Walk backwards
        while (currentNodeId) {
          const node = nodes.find(n => n.id === currentNodeId);
          if (!node) break;

          if (node.type === "crop") {
            cropData = { ...cropData, ...node.data };
          } else if (node.type === "transform") {
            transData = { ...transData, ...node.data };
          } else if (node.type === "mask") {
            maskShape = (node.data.shape as string) || "square";
            masksList = node.data.masks || [];
          }

          const upstreamEdge = edges.find(e => e.target === currentNodeId);
          currentNodeId = upstreamEdge ? upstreamEdge.source : null;
        }

        const cropArea = {
          x: cropData.left,
          y: cropData.top,
          w: Math.max(1, 1920 - cropData.left - cropData.right),
          h: Math.max(1, 1080 - cropData.top - cropData.bottom)
        };

        const canvasPos = {
          x: transData.x,
          y: transData.y,
          w: cropArea.w * transData.scaleX,
          h: cropArea.h * transData.scaleY
        };

        newLayers.push({
          id: `layer_${i}`,
          label: `Layer ${i+1}`,
          cropArea,
          canvasPos,
          locked: false,
          visible: true,
          maskShape: maskShape as any,
          masks: masksList
        });
      }
    }
    
    setCompiledLayers(newLayers);
  }, [nodes, edges]);

  // --- PRESET ACTIONS ---
  const savePreset = () => {
    const data = { nodes, edges };
    localStorage.setItem("reframegg_active_preset", JSON.stringify(data));
    alert("Şablon başarıyla yerel depolamaya (LocalStorage) kaydedildi!");
  };

  const loadPreset = () => {
    const dataStr = localStorage.getItem("reframegg_active_preset");
    if (dataStr) {
      try {
        const { nodes: loadedNodes, edges: loadedEdges } = JSON.parse(dataStr);
        setNodes(loadedNodes);
        setEdges(loadedEdges);
        saveHistory(loadedNodes, loadedEdges);
      } catch(_) {
        alert("Kayıtlı şablon yüklenirken bir hata oluştu.");
      }
    } else {
      // Fallback to Valorant Default
      const valPreset = defaultPresets[0];
      alert(`Hazır Valorant Şablonu Yükleniyor: ${valPreset.presetName}`);
      // Generate default Valorant Node graph based on layers
      const valNodes: Node[] = [
        { id: "source_1", type: "source", position: { x: 50, y: 200 }, data: { videoName } }
      ];
      const valEdges: Edge[] = [];

      valPreset.layers.forEach((layer, idx) => {
        const cropId = `crop_${idx}`;
        const transId = `trans_${idx}`;
        const maskId = `mask_${idx}`;

        valNodes.push(
          { id: maskId, type: "mask", position: { x: 300, y: 100 + idx*180 }, data: { shape: layer.maskShape || "square", masks: [] } },
          { id: cropId, type: "crop", position: { x: 550, y: 100 + idx*180 }, data: { top: layer.cropArea.y, bottom: 1080 - layer.cropArea.y - layer.cropArea.h, left: layer.cropArea.x, right: 1920 - layer.cropArea.x - layer.cropArea.w } },
          { id: transId, type: "transform", position: { x: 800, y: 100 + idx*180 }, data: { x: layer.canvasPos.x, y: layer.canvasPos.y, scaleX: layer.canvasPos.w / layer.cropArea.w, scaleY: layer.canvasPos.h / layer.cropArea.h, lockAspectRatio: true } }
        );

        valEdges.push(
          { id: `e_src_mask_${idx}`, source: "source_1", target: maskId },
          { id: `e_mask_crop_${idx}`, source: maskId, target: cropId },
          { id: `e_crop_trans_${idx}`, source: cropId, target: transId },
          { id: `e_trans_blend_${idx}`, source: transId, target: "blend_1", targetHandle: `layer_${idx}` }
        );
      });

      valNodes.push(
        { id: "blend_1", type: "blend", position: { x: 1100, y: 200 }, data: {} },
        { id: "output_1", type: "output", position: { x: 1400, y: 200 }, data: {} }
      );

      valEdges.push(
        { id: "e_blend_out", source: "blend_1", sourceHandle: "mix", target: "output_1" }
      );

      setNodes(valNodes);
      setEdges(valEdges);
      saveHistory(valNodes, valEdges);
    }
  };

  // --- RENDERING CANVAS DRAW LOOP (rAF) ---
  useEffect(() => {
    let animFrameId: number;
    
    const drawCanvasFrames = () => {
      const master = masterVideoRef.current;
      if (master) {
        // 1. Output preview background blur (left bar)
        const bgCanvas = document.querySelector(".bg-blur-canvas") as HTMLCanvasElement | null;
        if (bgCanvas) {
          const bgCtx = bgCanvas.getContext("2d");
          if (bgCtx) {
            try { bgCtx.drawImage(master, 0, 0, bgCanvas.width, bgCanvas.height); } catch(_) {}
          }
        }

        // 2. Left Preview screen layers
        const canvases = document.querySelectorAll(".layer-canvas") as NodeListOf<HTMLCanvasElement>;
        canvases.forEach((canvas) => {
          const layerId = canvas.getAttribute("data-layer-id");
          const layer = compiledLayers.find(l => l.id === layerId);
          if (layer && layer.visible) {
            const ctx = canvas.getContext("2d");
            if (ctx) {
              try {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.save();
                
                // Draw custom multi-shape masks
                if (layer.masks && layer.masks.length > 0) {
                  layer.masks.forEach(m => {
                    ctx.beginPath();
                    if (m.type === "circle") {
                      // Circle relative to the current cropArea width/height
                      const rx = (m.x / 1920) * canvas.width;
                      const ry = (m.y / 1080) * canvas.height;
                      const rw = (m.w / 1920) * canvas.width;
                      const rh = (m.h / 1080) * canvas.height;
                      ctx.arc(rx + rw/2, ry + rh/2, Math.min(rw, rh)/2, 0, Math.PI*2);
                    } else {
                      const rx = (m.x / 1920) * canvas.width;
                      const ry = (m.y / 1080) * canvas.height;
                      const rw = (m.w / 1920) * canvas.width;
                      const rh = (m.h / 1080) * canvas.height;
                      ctx.rect(rx, ry, rw, rh);
                    }
                    ctx.clip();
                  });
                } else if (layer.maskShape === "circle") {
                  ctx.beginPath();
                  ctx.arc(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) / 2, 0, Math.PI * 2);
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
                  0, 0, canvas.width, canvas.height
                );
                ctx.restore();
              } catch (_) {}
            }
          }
        });

        // 3. Node canvases preview (realtime node composing preview)
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
                const left = node.data.left || 0;
                const top = node.data.top || 0;
                const w = Math.max(1, 1920 - left - (node.data.right || 0));
                const h = Math.max(1, 1080 - top - (node.data.bottom || 0));
                ctx.drawImage(master, left * scaleX, top * scaleY, w * scaleX, h * scaleY, 0, 0, canvas.width, canvas.height);
              } 
              else if (node.type === "mask") {
                ctx.save();
                ctx.fillStyle = "#050505";
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                const activeMasks = node.data.masks || [];
                if (activeMasks.length > 0) {
                  activeMasks.forEach((m: any) => {
                    ctx.beginPath();
                    const mx = (m.x / 1920) * canvas.width;
                    const my = (m.y / 1080) * canvas.height;
                    const mw = (m.w / 1920) * canvas.width;
                    const mh = (m.h / 1080) * canvas.height;
                    
                    if (m.type === "circle") {
                      ctx.arc(mx + mw/2, my + mh/2, Math.min(mw, mh)/2, 0, Math.PI*2);
                    } else {
                      ctx.rect(mx, my, mw, mh);
                    }
                    ctx.clip();
                  });
                } else if (node.data.shape === "circle") {
                  ctx.beginPath();
                  ctx.arc(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) / 2, 0, Math.PI * 2);
                  ctx.clip();
                }

                ctx.drawImage(master, 0, 0, master.videoWidth, master.videoHeight, 0, 0, canvas.width, canvas.height);
                ctx.restore();
              } 
              else if (node.type === "transform") {
                const layer = compiledLayers.find(l => {
                  const edgeToBlend = edges.find(e => e.source === node.id);
                  if (edgeToBlend) {
                    let nextId = edgeToBlend.target;
                    let currentHandle = edgeToBlend.targetHandle || "";
                    while (nextId) {
                      const nextNode = nodes.find(n => n.id === nextId);
                      if (nextNode && nextNode.type === "blend") return l.id === currentHandle;
                      const edge = edges.find(e => e.source === nextId);
                      nextId = edge ? edge.target : "";
                      currentHandle = edge ? (edge.targetHandle || "") : "";
                    }
                  }
                  return false;
                });

                ctx.fillStyle = "#07080a";
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                if (layer) {
                  ctx.save();
                  const px = (layer.canvasPos.x / 1080) * canvas.width;
                  const py = (layer.canvasPos.y / 1920) * canvas.height;
                  const pw = (layer.canvasPos.w / 1080) * canvas.width;
                  const ph = (layer.canvasPos.h / 1920) * canvas.height;

                  if (layer.maskShape === "circle") {
                    ctx.beginPath();
                    ctx.arc(px + pw/2, py + ph/2, Math.min(pw, ph) / 2, 0, Math.PI * 2);
                    ctx.clip();
                  }

                  ctx.drawImage(
                    master, 
                    layer.cropArea.x * scaleX, 
                    layer.cropArea.y * scaleY, 
                    layer.cropArea.w * scaleX, 
                    layer.cropArea.h * scaleY, 
                    px, py, pw, ph
                  );
                  ctx.restore();
                }
              } 
              else if (node.type === "blend" || node.type === "output") {
                ctx.fillStyle = "#07080a";
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                ctx.save();
                ctx.filter = "blur(12px) brightness(0.5)";
                ctx.drawImage(master, 0, 0, canvas.width, canvas.height);
                ctx.restore();

                compiledLayers.forEach(layer => {
                  if (layer.visible) {
                    ctx.save();
                    const px = (layer.canvasPos.x / 1080) * canvas.width;
                    const py = (layer.canvasPos.y / 1920) * canvas.height;
                    const pw = (layer.canvasPos.w / 1080) * canvas.width;
                    const ph = (layer.canvasPos.h / 1920) * canvas.height;

                    if (layer.masks && layer.masks.length > 0) {
                      layer.masks.forEach(m => {
                        ctx.beginPath();
                        const rx = px + (m.x / 1920) * pw;
                        const ry = py + (m.y / 1080) * ph;
                        const rw = (m.w / 1920) * pw;
                        const rh = (m.h / 1080) * ph;
                        
                        if (m.type === "circle") {
                          ctx.arc(rx + rw/2, ry + rh/2, Math.min(rw, rh)/2, 0, Math.PI*2);
                        } else {
                          ctx.rect(rx, ry, rw, rh);
                        }
                        ctx.clip();
                      });
                    } else if (layer.maskShape === "circle") {
                      ctx.beginPath();
                      ctx.arc(px + pw/2, py + ph/2, Math.min(pw, ph) / 2, 0, Math.PI * 2);
                      ctx.clip();
                    }

                    ctx.drawImage(
                      master, 
                      layer.cropArea.x * scaleX, 
                      layer.cropArea.y * scaleY, 
                      layer.cropArea.w * scaleX, 
                      layer.cropArea.h * scaleY, 
                      px, py, pw, ph
                    );
                    ctx.restore();
                  }
                });
              }
            }
          }
        });

        // 4. Modal Mask Editor Previews
        const meVideoCanvas = document.querySelector(".mask-editor-video-canvas") as HTMLCanvasElement | null;
        if (meVideoCanvas) {
          const meCtx = meVideoCanvas.getContext("2d");
          if (meCtx) {
            meCtx.drawImage(master, 0, 0, meVideoCanvas.width, meVideoCanvas.height);
          }
        }

        const mePreviewCanvas = document.querySelector(".mask-editor-preview-canvas") as HTMLCanvasElement | null;
        if (mePreviewCanvas && editingMaskNode) {
          const mePCtx = mePreviewCanvas.getContext("2d");
          if (mePCtx) {
            mePCtx.fillStyle = "#000000";
            mePCtx.fillRect(0, 0, mePreviewCanvas.width, mePreviewCanvas.height);

            mePCtx.save();
            const activeMasks = editingMaskNode.data.masks || [];
            if (activeMasks.length > 0) {
              activeMasks.forEach((m: any) => {
                mePCtx.beginPath();
                const mx = (m.x / 1920) * mePreviewCanvas.width;
                const my = (m.y / 1080) * mePreviewCanvas.height;
                const mw = (m.w / 1920) * mePreviewCanvas.width;
                const mh = (m.h / 1080) * mePreviewCanvas.height;
                
                if (m.type === "circle") {
                  mePCtx.arc(mx + mw/2, my + mh/2, Math.min(mw, mh)/2, 0, Math.PI*2);
                } else {
                  mePCtx.rect(mx, my, mw, mh);
                }
                mePCtx.clip();
              });
            }

            mePCtx.drawImage(master, 0, 0, master.videoWidth, master.videoHeight, 0, 0, mePreviewCanvas.width, mePreviewCanvas.height);
            mePCtx.restore();
          }
        }
      }
      animFrameId = requestAnimationFrame(drawCanvasFrames);
    };

    if (videoPath) {
      animFrameId = requestAnimationFrame(drawCanvasFrames);
    }
    return () => cancelAnimationFrame(animFrameId);
  }, [videoPath, compiledLayers, editingMaskNode, nodes, edges]);

  // --- MASK EDITOR MOUSE ACTIONS (DRAG & RESIZE) ---
  const handleEditorMouseDown = (e: React.MouseEvent, maskId: string, dir: string = "") => {
    e.stopPropagation();
    if (!editingMaskNode) return;
    
    setSelectedMaskId(maskId);
    setDraggedMaskId(maskId);
    setResizeDir(dir);
    setStartMousePos({ x: e.clientX, y: e.clientY });

    const mask = editingMaskNode.data.masks.find((m: any) => m.id === maskId);
    if (mask) {
      setStartMaskPos({ x: mask.x, y: mask.y, w: mask.w, h: mask.h });
    }
  };

  const handleEditorMouseMove = (e: React.MouseEvent) => {
    if (!draggedMaskId || !editingMaskNode) return;

    const bounds = e.currentTarget.getBoundingClientRect();
    const scaleX = 1920 / bounds.width;
    const scaleY = 1080 / bounds.height;

    const dx = (e.clientX - startMousePos.x) * scaleX;
    const dy = (e.clientY - startMousePos.y) * scaleY;

    const updatedMasks = editingMaskNode.data.masks.map((m: MaskShape) => {
      if (m.id !== draggedMaskId) return m;

      let { x, y, w, h } = startMaskPos;

      if (resizeDir === "") {
        // Drag body
        x = Math.max(0, Math.min(1920 - w, startMaskPos.x + dx));
        y = Math.max(0, Math.min(1080 - h, startMaskPos.y + dy));
      } else {
        // Resize handles
        if (resizeDir.includes("right")) {
          w = Math.max(20, Math.min(1920 - x, startMaskPos.w + dx));
        }
        if (resizeDir.includes("bottom")) {
          h = Math.max(20, Math.min(1080 - y, startMaskPos.h + dy));
        }
        if (resizeDir.includes("left")) {
          const newW = Math.max(20, startMaskPos.w - dx);
          x = startMaskPos.x + (startMaskPos.w - newW);
          w = newW;
        }
        if (resizeDir.includes("top")) {
          const newH = Math.max(20, startMaskPos.h - dy);
          y = startMaskPos.y + (startMaskPos.h - newH);
          h = newH;
        }
      }

      return { ...m, x, y, w, h };
    });

    setEditingMaskNode({
      ...editingMaskNode,
      data: { ...editingMaskNode.data, masks: updatedMasks }
    });
  };

  const handleEditorMouseUp = () => {
    if (draggedMaskId && editingMaskNode) {
      // Save mask change history
      setMaskUndoStack(prev => [...prev, JSON.parse(JSON.stringify(editingMaskNode.data.masks))]);
      setMaskRedoStack([]);
    }
    setDraggedMaskId("");
    setResizeDir("");
  };

  const addMaskShape = (type: "rect" | "circle") => {
    if (!editingMaskNode) return;
    
    const newMask: MaskShape = {
      id: `mask_${Date.now()}`,
      type,
      x: 800, y: 400, w: 300, h: 300,
      opacity: 1.0,
      feather: 0,
      roundness: 0,
      subtractMode: false
    };

    const nextMasks = [...(editingMaskNode.data.masks || []), newMask];
    setEditingMaskNode({
      ...editingMaskNode,
      data: { ...editingMaskNode.data, masks: nextMasks }
    });
    setSelectedMaskId(newMask.id);
    setMaskUndoStack(prev => [...prev, nextMasks]);
    setMaskRedoStack([]);
  };

  const deleteMaskShape = (maskId: string) => {
    if (!editingMaskNode) return;
    const nextMasks = editingMaskNode.data.masks.filter((m: any) => m.id !== maskId);
    setEditingMaskNode({
      ...editingMaskNode,
      data: { ...editingMaskNode.data, masks: nextMasks }
    });
    if (selectedMaskId === maskId && nextMasks.length > 0) {
      setSelectedMaskId(nextMasks[0].id);
    }
    setMaskUndoStack(prev => [...prev, nextMasks]);
    setMaskRedoStack([]);
  };

  const undoMask = () => {
    if (maskUndoStack.length > 1 && editingMaskNode) {
      const nextStack = maskUndoStack.slice(0, -1);
      const prevMasks = nextStack[nextStack.length - 1];
      
      setMaskRedoStack(prev => [...prev, editingMaskNode.data.masks]);
      setEditingMaskNode({
        ...editingMaskNode,
        data: { ...editingMaskNode.data, masks: prevMasks }
      });
      setMaskUndoStack(nextStack);
    }
  };

  const redoMask = () => {
    if (maskRedoStack.length > 0 && editingMaskNode) {
      const nextMasks = maskRedoStack[maskRedoStack.length - 1];
      
      setMaskUndoStack(prev => [...prev, nextMasks]);
      setEditingMaskNode({
        ...editingMaskNode,
        data: { ...editingMaskNode.data, masks: nextMasks }
      });
      setMaskRedoStack(prev => prev.slice(0, -1));
    }
  };

  const selectedMask = editingMaskNode?.data.masks.find((m: any) => m.id === selectedMaskId);

  const TGT_SCALE = 270 / 1080;

  return (
    <div className="flow-editor-wrapper">
      
      {/* HEADER CONTROL BAR */}
      <div className="flow-header">
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <div className="logo-glow">R</div>
          <span className="brand-title">ReframeGG Compositor</span>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button onClick={undo} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.08)", padding: "8px", borderRadius: "6px", color: "white", cursor: "pointer" }}>
            <RotateCcw size={14}/>
          </button>
          <button onClick={savePreset} className="preset-action-btn">
            <Save size={14} style={{ marginRight: 6 }} />
            SAVE PRESET
          </button>
          <button onClick={loadPreset} className="preset-action-btn load-btn">
            <FolderOpen size={14} style={{ marginRight: 6 }} />
            LOAD PRESETS
          </button>
        </div>
      </div>

      <div style={{ display: "flex", height: "calc(100vh - 60px)", width: "100vw", background: "#07080a" }}>
        
        {/* LEFT PANEL: PREVIEW */}
        <div className="sidebar" style={{ height: "100%", width: "380px" }}>
          <div className="sidebar-header">
            <Sliders size={16} style={{ color: "#a855f7" }} />
            <span style={{ fontWeight: "700", fontSize: "14px", color: "#e4e4e7" }}>OUTPUT PREVIEW</span>
          </div>
          
          <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", background: "#000", overflow: "hidden", position: "relative" }}>
            <div style={{ width: "270px", height: "480px", position: "relative", background: "#050505", borderRadius: "16px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 10px 40px rgba(0,0,0,0.8)" }}>
              
              {/* Master Video element (hidden) */}
              <video
                ref={masterVideoRef}
                src={videoPath ? convertFileSrc(videoPath) : undefined}
                muted
                playsInline
                style={{ display: "none" }}
              />

              {/* Background Blur Canvas */}
              <canvas
                className="bg-blur-canvas"
                width={270}
                height={480}
                style={{
                  position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                  filter: "blur(18px) brightness(0.55) saturate(1.3)",
                  transform: "scale(1.1)", zIndex: 0
                }}
              />

              {/* Rendered Compiled Layers */}
              {compiledLayers.map(layer => {
                const canvasPxW = Math.max(2, Math.round(layer.canvasPos.w));
                const canvasPxH = Math.max(2, Math.round(layer.canvasPos.h));

                return (
                  <div key={layer.id} style={{
                    position: "absolute",
                    left: layer.canvasPos.x * TGT_SCALE,
                    top: layer.canvasPos.y * TGT_SCALE,
                    width: layer.canvasPos.w * TGT_SCALE,
                    height: layer.canvasPos.h * TGT_SCALE,
                    overflow: "hidden",
                    zIndex: 2,
                    boxShadow: "0 0 10px rgba(0,0,0,0.5)"
                  }}>
                    <canvas
                      className="layer-canvas"
                      data-layer-id={layer.id}
                      width={canvasPxW}
                      height={canvasPxH}
                      style={{ width: "100%", height: "100%", display: "block" }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* TIMELINE CONTROLS */}
          <div className="timeline-panel" style={{ height: "130px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="timeline-upper">
              <div className="playback-controls">
                <button 
                  onClick={() => setIsPlaying(!isPlaying)}
                  style={{ background: "linear-gradient(135deg, #8a2be2, #00bfff)", border: "none", color: "white", width: "32px", height: "32px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 10px rgba(138,43,226,0.4)" }}
                >
                  {isPlaying ? <Pause size={14}/> : <Play size={14}/>}
                </button>
                <span style={{ color: "#949ca9", fontSize: "12px", fontWeight: "600" }}>
                  {Math.floor(currentTime)}s / {Math.floor(duration)}s
                </span>
              </div>
            </div>
            
            <div className="timeline-slider-container">
              <div 
                className="timeline-track"
                onClick={(e) => {
                  const bounds = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - bounds.left) / bounds.width;
                  if (masterVideoRef.current) {
                    masterVideoRef.current.currentTime = pct * duration;
                    setCurrentTime(pct * duration);
                  }
                }}
              >
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${(currentTime / duration) * 100}%`, background: "linear-gradient(90deg, #8a2be2, #00bfff)", borderRadius: "3px" }} />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: NODE EDITOR */}
        <div style={{ flex: 1, position: "relative" }}>
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
            <MiniMap style={{ background: "#111318", border: "1px solid rgba(255,255,255,0.08)" }} />
          </ReactFlow>

          {/* RADIAL / QUICK CREATION CONTEXT MENU */}
          {menuPos && (
            <div className="radial-menu" style={{
              position: "fixed", left: menuPos.x - 70, top: menuPos.y - 70, zIndex: 1000
            }}>
              <div className="radial-center" onClick={() => setMenuPos(null)}>
                <Check size={16} />
              </div>
              {[
                { type: "source", label: "Source", icon: <ImageIcon size={12}/>, color: "#10b981", angle: 0 },
                { type: "mask", label: "Mask", icon: <Scissors size={12}/>, color: "#ec4899", angle: 72 },
                { type: "crop", label: "Crop", icon: <Crop size={12}/>, color: "#f59e0b", angle: 144 },
                { type: "transform", label: "Transform", icon: <Move size={12}/>, color: "#3b82f6", angle: 216 },
                { type: "blend", label: "Blend", icon: <Layers size={12}/>, color: "#a855f7", angle: 288 }
              ].map(item => {
                const radius = 65; 
                const rad = (item.angle * Math.PI) / 180;
                const lx = radius * Math.cos(rad);
                const ly = radius * Math.sin(rad);

                return (
                  <button 
                    key={item.type}
                    onClick={() => {
                      if(reactFlowInstance.current) {
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
                          
                          // Auto connect if triggered from handle drag
                          if (connectingHandle) {
                            const newEdge: Edge = {
                              id: `e_${connectingHandle.nodeId}_${newNodeId}`,
                              source: connectingHandle.nodeId,
                              sourceHandle: connectingHandle.handleId,
                              target: newNodeId,
                              targetHandle: item.type === "blend" ? "layer_0" : "in"
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
                    className="radial-item"
                    style={{
                      transform: `translate(${lx}px, ${ly}px)`,
                      border: `1.5px solid ${item.color}`,
                      boxShadow: `0 0 10px ${item.color}33`
                    }}
                  >
                    {item.icon}
                  </button>
                );
              })}
            </div>
          )}

          {/* RENDER VIDEO FLOATING BUTTON */}
          <div style={{ position: "absolute", top: 20, right: 20, zIndex: 10 }}>
            <button className="render-btn" style={{ padding: "12px 24px" }} onClick={async () => {
              try {
                alert("Render başlatılıyor! Lütfen arka plan işleminin tamamlanmasını bekleyin...");
                await invoke("reframe_video", {
                  videoPath,
                  layers: compiledLayers,
                  trimStart,
                  trimEnd,
                  outputRes: "1080x1920",
                  outputFps: 30,
                  backgroundMode: "blur",
                  useGpu: true,
                  outputExt: "mp4"
                });
                alert("Render Başarıyla Tamamlandı! Dosya video dizinine kaydedildi.");
              } catch(e) {
                alert("Render sırasında bir hata oluştu: " + e);
              }
            }}>
              <Sparkles size={16} />
              RENDER VIDEO
            </button>
          </div>
        </div>

      </div>

      {/* FULLSCREEN MASK EDITOR */}
      {editingMaskNode && (
        <div className="mask-editor-overlay">
          <div className="mask-editor-header">
            <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
              <Scissors size={18} style={{ color: "#ec4899" }} />
              <span style={{ fontWeight: "700", color: "#f5f6f8" }}>COMPLEX MASK EDITOR</span>
            </div>
            
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <button onClick={undoMask} className="mask-bar-btn"><Undo size={14}/></button>
              <button onClick={redoMask} className="mask-bar-btn"><Redo size={14}/></button>
              <div className="mask-divider" />
              <button onClick={() => setEditingMaskNode(null)} className="mask-bar-btn discard">Discard</button>
              <button 
                onClick={() => {
                  setNodes((nds: Node[]) => {
                    const next = nds.map((n: Node) => n.id === editingMaskNode.id ? { ...n, data: editingMaskNode.data } : n);
                    saveHistory(next, edges);
                    return next;
                  });
                  setEditingMaskNode(null);
                }} 
                className="mask-save-btn"
              >
                <Check size={16} style={{ marginRight: 6 }} />
                Save & Close
              </button>
            </div>
          </div>

          <div className="mask-editor-workspace">
            {/* Left: Toolbar */}
            <div className="mask-editor-toolbar">
              <button onClick={() => setEditorTool("select")} className={`tool-btn ${editorTool === "select" ? "active" : ""}`} title="Selection Tool"><Move size={16}/></button>
              <button onClick={() => addMaskShape("rect")} className="tool-btn add" title="Add Rectangle Shape"><Plus size={14} style={{ marginRight: 4 }}/>Rect</button>
              <button onClick={() => addMaskShape("circle")} className="tool-btn add circle" title="Add Circle Shape"><Plus size={14} style={{ marginRight: 4 }}/>Circle</button>
            </div>

            {/* Middle: Canvas Edit View */}
            <div className="mask-editor-middle">
              <span className="panel-title">EDIT VIEW (SOURCE)</span>
              
              <div 
                className="mask-canvas-container"
                onMouseMove={handleEditorMouseMove}
                onMouseUp={handleEditorMouseUp}
                onMouseLeave={handleEditorMouseUp}
              >
                {/* Live Video Canvas */}
                <canvas className="mask-editor-video-canvas" width={1920} height={1080} />

                {/* Svg interaction overlays */}
                <svg className="mask-editor-svg" viewBox="0 0 1920 1080">
                  {editingMaskNode.data.masks.map((m: MaskShape) => {
                    const isSelected = m.id === selectedMaskId;
                    return (
                      <g key={m.id}>
                        {m.type === "circle" ? (
                          <ellipse
                            cx={m.x + m.w / 2}
                            cy={m.y + m.h / 2}
                            rx={m.w / 2}
                            ry={m.h / 2}
                            fill={m.subtractMode ? "rgba(7, 8, 10, 0.75)" : "rgba(236, 72, 153, 0.15)"}
                            stroke={isSelected ? "#ec4899" : "rgba(236,72,153,0.5)"}
                            strokeWidth={isSelected ? 3 : 1.5}
                            onMouseDown={(e) => handleEditorMouseDown(e, m.id)}
                            style={{ cursor: "move" }}
                          />
                        ) : (
                          <rect
                            x={m.x}
                            y={m.y}
                            width={m.w}
                            height={m.h}
                            rx={m.roundness}
                            ry={m.roundness}
                            fill={m.subtractMode ? "rgba(7, 8, 10, 0.75)" : "rgba(236, 72, 153, 0.15)"}
                            stroke={isSelected ? "#ec4899" : "rgba(236,72,153,0.5)"}
                            strokeWidth={isSelected ? 3 : 1.5}
                            onMouseDown={(e) => handleEditorMouseDown(e, m.id)}
                            style={{ cursor: "move" }}
                          />
                        )}
                        
                        {/* Selected Transform Handles */}
                        {isSelected && (
                          <>
                            {/* Top Left */}
                            <rect x={m.x - 8} y={m.y - 8} width={16} height={16} fill="white" stroke="#ec4899" strokeWidth={2} onMouseDown={(e) => handleEditorMouseDown(e, m.id, "top-left")} style={{ cursor: "nwse-resize" }} />
                            {/* Top Right */}
                            <rect x={m.x + m.w - 8} y={m.y - 8} width={16} height={16} fill="white" stroke="#ec4899" strokeWidth={2} onMouseDown={(e) => handleEditorMouseDown(e, m.id, "top-right")} style={{ cursor: "nesw-resize" }} />
                            {/* Bottom Left */}
                            <rect x={m.x - 8} y={m.y + m.h - 8} width={16} height={16} fill="white" stroke="#ec4899" strokeWidth={2} onMouseDown={(e) => handleEditorMouseDown(e, m.id, "bottom-left")} style={{ cursor: "nesw-resize" }} />
                            {/* Bottom Right */}
                            <rect x={m.x + m.w - 8} y={m.y + m.h - 8} width={16} height={16} fill="white" stroke="#ec4899" strokeWidth={2} onMouseDown={(e) => handleEditorMouseDown(e, m.id, "bottom-right")} style={{ cursor: "nwse-resize" }} />
                          </>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Right Panel: Previews, Layers & Settings */}
            <div className="mask-editor-sidebar">
              
              {/* Preview screen */}
              <div style={{ flex: "0 0 200px" }}>
                <span className="panel-title">MASK PREVIEW</span>
                <div className="mask-side-preview">
                  <canvas className="mask-editor-preview-canvas" width={1920} height={1080} />
                </div>
              </div>

              {/* Layers List */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "150px" }}>
                <span className="panel-title">MASK LAYERS</span>
                <div className="mask-layers-list">
                  {editingMaskNode.data.masks.map((m: MaskShape) => {
                    const isSelected = m.id === selectedMaskId;
                    return (
                      <div key={m.id} className={`mask-layer-item ${isSelected ? "active" : ""}`} onClick={() => setSelectedMaskId(m.id)}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div className={`layer-badge ${m.type}`} />
                          <span style={{ color: "#e4e4e7", fontWeight: "600" }}>{m.type === "circle" ? "Circle Mask" : "Rectangle Mask"}</span>
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button onClick={(e) => {
                            e.stopPropagation();
                            const updated = editingMaskNode.data.masks.map((item: any) => item.id === m.id ? { ...item, subtractMode: !item.subtractMode } : item);
                            setEditingMaskNode({ ...editingMaskNode, data: { ...editingMaskNode.data, masks: updated } });
                          }} className={`mask-btn ${m.subtractMode ? "active" : ""}`} title="Subtract Mode">
                            Sub
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); deleteMaskShape(m.id); }} className="mask-btn delete" title="Delete Shape"><Trash size={12}/></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Settings Panel */}
              {selectedMask && (
                <div style={{ flex: "0 0 220px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "12px" }}>
                  <span className="panel-title">SHAPE SETTINGS</span>
                  
                  <div className="mask-settings-panel">
                    <div>
                      <span className="slider-label">Opacity: {selectedMask.opacity}</span>
                      <input 
                        type="range" min="0" max="1" step="0.05"
                        value={selectedMask.opacity}
                        onChange={(e) => {
                          const updated = editingMaskNode.data.masks.map((item: any) => item.id === selectedMaskId ? { ...item, opacity: parseFloat(e.target.value) } : item);
                          setEditingMaskNode({ ...editingMaskNode, data: { ...editingMaskNode.data, masks: updated } });
                        }}
                        style={{ accentColor: "#ec4899" }}
                      />
                    </div>
                    <div>
                      <span className="slider-label">Feather: {selectedMask.feather}px</span>
                      <input 
                        type="range" min="0" max="100" step="1"
                        value={selectedMask.feather}
                        onChange={(e) => {
                          const updated = editingMaskNode.data.masks.map((item: any) => item.id === selectedMaskId ? { ...item, feather: parseInt(e.target.value) } : item);
                          setEditingMaskNode({ ...editingMaskNode, data: { ...editingMaskNode.data, masks: updated } });
                        }}
                        style={{ accentColor: "#ec4899" }}
                      />
                    </div>
                    {selectedMask.type === "rect" && (
                      <div>
                        <span className="slider-label">Roundness: {selectedMask.roundness}px</span>
                        <input 
                          type="range" min="0" max="100" step="1"
                          value={selectedMask.roundness}
                          onChange={(e) => {
                            const updated = editingMaskNode.data.masks.map((item: any) => item.id === selectedMaskId ? { ...item, roundness: parseInt(e.target.value) } : item);
                            setEditingMaskNode({ ...editingMaskNode, data: { ...editingMaskNode.data, masks: updated } });
                          }}
                          style={{ accentColor: "#ec4899" }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default function App() {
  const [isDragging, setIsDragging] = useState(false);
  const [videoPath, setVideoPath] = useState("");
  const [videoName, setVideoName] = useState("");
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(10);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(10);
  
  const masterVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let unlistenDrop: any;
    let unlistenEnter: any;
    let unlistenLeave: any;
    const setup = async () => {
      unlistenEnter = await listen("tauri://drag-enter", () => setIsDragging(true));
      unlistenLeave = await listen("tauri://drag-leave", () => setIsDragging(false));
      unlistenDrop = await listen("tauri://drag-drop", (event: any) => {
        setIsDragging(false);
        const paths = event.payload.paths as string[];
        if (paths && paths.length > 0) handleVideoLoaded(paths[0]);
      });
    };
    setup();
    return () => {
      if(unlistenEnter) unlistenEnter();
      if(unlistenLeave) unlistenLeave();
      if(unlistenDrop) unlistenDrop();
    };
  }, []);

  const handleVideoLoaded = async (path: string) => {
    const name = path.split(/[\\/]/).pop() || "video.mp4";
    setVideoName(name);
    setVideoPath(path);
    try {
      const info = await invoke<{ duration: number }>("get_video_info", { path });
      if (info && info.duration) {
        setDuration(info.duration);
        setTrimStart(0);
        setTrimEnd(info.duration);
      }
    } catch (e) {
      setDuration(30); setTrimStart(0); setTrimEnd(30);
    }
  };

  const handleManualVideoSelect = async () => {
    try {
      const selected = await invoke<string>("select_video_file");
      if (selected) handleVideoLoaded(selected);
    } catch (err) {}
  };

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

  useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        const master = masterVideoRef.current;
        if (master) {
          setCurrentTime(master.currentTime);
          if (master.currentTime >= trimEnd) {
            master.currentTime = trimStart;
            setCurrentTime(trimStart);
          }
        }
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying, trimStart, trimEnd]);

  if (!videoPath) {
    return (
      <div 
        onClick={handleManualVideoSelect}
        style={{
          width: "100vw", height: "100vh", 
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          backgroundColor: "#07080a", color: "#f5f6f8", position: "relative", cursor: "pointer",
          backgroundImage: "radial-gradient(circle at center, rgba(138, 43, 226, 0.08) 0%, rgba(0,0,0,0) 70%)"
        }}
      >
        {isDragging && (
          <div style={{
            position: "absolute", inset: 0, 
            backgroundColor: "rgba(138,43,226,0.12)", border: "4px dashed #8a2be2",
            zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "2rem", fontWeight: "800", color: "#8a2be2", backdropFilter: "blur(4px)"
          }}>
            DROP VIDEO HERE
          </div>
        )}
        <div className="logo-glow" style={{ width: "90px", height: "90px", fontSize: "3rem", marginBottom: "24px" }}>R</div>
        <h1 className="brand-title" style={{ fontSize: "2.8rem", marginBottom: "12px", fontWeight: "800" }}>ReframeGG Compositor</h1>
        <p style={{ color: "#949ca9", fontSize: "1.1rem", fontWeight: "500" }}>Sürükle & bırak veya seçmek için tıklayın</p>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <FlowEditor 
        videoPath={videoPath}
        videoName={videoName}
        duration={duration}
        trimStart={trimStart}
        trimEnd={trimEnd}
        currentTime={currentTime}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        setTrimStart={setTrimStart}
        setTrimEnd={setTrimEnd}
        setCurrentTime={setCurrentTime}
        masterVideoRef={masterVideoRef}
      />
    </ReactFlowProvider>
  );
}