import { ReframeLayer } from "../types";

const _offscreenCache = new Map<string, HTMLCanvasElement>();

const getOffscreen = (key: string, w: number, h: number): HTMLCanvasElement => {
  let c = _offscreenCache.get(key);
  if (!c || c.width !== w || c.height !== h) {
    c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    _offscreenCache.set(key, c);
  }
  return c;
};

/**
 * Draws a single layer with its masks applied as a cutout.
 * Uses 1920x1080 source coordinates for mask logic.
 *
 * For "mask" layers: renders CLEAN (unblurred) video inside the mask shapes.
 * Blur is NOT applied to mask layer overlays — instead, blur is applied
 * to the corresponding region on the main crop layer via renderProgram.
 */
export const drawLayerWithMasks = (
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
    // ── Mask Layer: draw CLEAN (unblurred) video, cut out by mask shapes ──
    // Only brightness/contrast are applied, blur is intentionally excluded.
    const cleanC = getOffscreen(`clean_${layer.id}`, width, height);
    const cleanCtx = cleanC.getContext("2d")!;
    cleanCtx.clearRect(0, 0, width, height);
    cleanCtx.save();
    // Apply brightness & contrast but NO blur — overlay must be sharp
    cleanCtx.filter = `brightness(${layer.brightness}) contrast(${layer.contrast})`;
    cleanCtx.drawImage(
      master,
      layer.cropArea.x * svX, layer.cropArea.y * svY,
      layer.cropArea.w * svX, layer.cropArea.h * svY,
      0, 0, width, height
    );
    cleanCtx.restore();

    // Draw masks as cutout path
    const maskC = getOffscreen(`mask_buffer_${layer.id}`, width, height);
    const maskCtx = maskC.getContext("2d")!;
    maskCtx.clearRect(0, 0, width, height);
    maskCtx.fillStyle = "white";

    layer.masks.forEach(m => {
      maskCtx.beginPath();
      const mx = ((m.x - layer.cropArea.x) / layer.cropArea.w) * width;
      const my = ((m.y - layer.cropArea.y) / layer.cropArea.h) * height;
      const mw = (m.w / layer.cropArea.w) * width;
      const mh = (m.h / layer.cropArea.h) * height;

      if (m.type === "circle") {
        maskCtx.ellipse(mx + mw / 2, my + mh / 2, mw / 2, mh / 2, 0, 0, Math.PI * 2);
      } else if (m.type === "triangle") {
        maskCtx.moveTo(mx + mw / 2, my);
        maskCtx.lineTo(mx + mw, my + mh);
        maskCtx.lineTo(mx, my + mh);
        maskCtx.closePath();
      } else if (m.type === "star") {
        const cx = mx + mw / 2;
        const cy = my + mh / 2;
        const spikes = 5;
        const outerRadius = Math.min(mw, mh) / 2;
        const innerRadius = outerRadius * 0.4;
        let rot = (Math.PI / 2) * 3;
        const step = Math.PI / spikes;
        maskCtx.moveTo(cx, cy - outerRadius);
        for (let i = 0; i < spikes; i++) {
          let x = cx + Math.cos(rot) * outerRadius;
          let y = cy + Math.sin(rot) * outerRadius;
          maskCtx.lineTo(x, y);
          rot += step;
          x = cx + Math.cos(rot) * innerRadius;
          y = cy + Math.sin(rot) * innerRadius;
          maskCtx.lineTo(x, y);
          rot += step;
        }
        maskCtx.closePath();
      } else if (m.type === "freeform" && m.points) {
        m.points.forEach((p, i) => {
          const px = ((p.x - layer.cropArea.x) / layer.cropArea.w) * width;
          const py = ((p.y - layer.cropArea.y) / layer.cropArea.h) * height;
          if (i === 0) maskCtx.moveTo(px, py);
          else maskCtx.lineTo(px, py);
        });
        maskCtx.closePath();
      } else {
        maskCtx.rect(mx, my, mw, mh);
      }
      maskCtx.fill();
    });

    // Merge clean canvas with masks (source-in = keep only pixels inside mask shapes)
    maskCtx.save();
    maskCtx.globalCompositeOperation = "source-in";
    maskCtx.drawImage(cleanC, 0, 0);
    maskCtx.restore();

    ctx.save();
    ctx.drawImage(maskC, 0, 0);
    ctx.restore();
  } else {
    // ── Crop layer ──
    const hasCensorMasks = layer.masks && layer.masks.length > 0;
    const globalBlur = hasCensorMasks ? 0 : layer.blur;

    // Draw the base cropped video
    ctx.save();
    ctx.filter = `blur(${globalBlur}px) brightness(${layer.brightness}) contrast(${layer.contrast})`;
    ctx.drawImage(
      master,
      layer.cropArea.x * svX, layer.cropArea.y * svY,
      layer.cropArea.w * svX, layer.cropArea.h * svY,
      0, 0, width, height
    );
    ctx.restore();

    // If there are censor masks, draw blurred censor regions on top
    if (hasCensorMasks) {
      const crop = layer.cropArea;
      const blurredC = getOffscreen(`blurred_censor_${layer.id}`, width, height);
      const blurredCtx = blurredC.getContext("2d")!;
      blurredCtx.clearRect(0, 0, width, height);
      blurredCtx.save();
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

/**
 * Renders the SOURCE monitor — full 16:9 frame with mask outlines and blur preview.
 * For mask layers: blurs the mask regions on the source to show what will be hidden.
 */
export const renderSource = (
  ctx: CanvasRenderingContext2D,
  master: HTMLVideoElement,
  layers: ReframeLayer[],
  selectedLayerId: string,
  width: number,
  height: number
) => {
  // Source is ALWAYS full 16:9, no scaling or positioning applied
  ctx.drawImage(master, 0, 0, width, height);
  
  const selectedLayer = layers.find(l => l.id === selectedLayerId);

  // For crop layers with censor masks: show blur preview on source
  if (selectedLayer && selectedLayer.visible && selectedLayer.type === "crop" && selectedLayer.masks && selectedLayer.masks.length > 0) {
    selectedLayer.masks.forEach(m => {
      ctx.save();
      ctx.beginPath();

      if (m.type === "circle") {
        ctx.ellipse(m.x + m.w / 2, m.y + m.h / 2, m.w / 2, m.h / 2, 0, 0, Math.PI * 2);
      } else if (m.type === "triangle") {
        ctx.moveTo(m.x + m.w / 2, m.y);
        ctx.lineTo(m.x + m.w, m.y + m.h);
        ctx.lineTo(m.x, m.y + m.h);
        ctx.closePath();
      } else if (m.type === "star") {
        const cx = m.x + m.w / 2;
        const cy = m.y + m.h / 2;
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
      } else if (m.type === "freeform" && m.points && m.points.length > 0) {
        m.points.forEach((p, pidx) => {
          if (pidx === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
      } else {
        ctx.rect(m.x, m.y, m.w, m.h);
      }

      ctx.clip();
      ctx.filter = "blur(15px)";
      ctx.drawImage(master, 0, 0, width, height);
      ctx.restore();
    });
  }

  // For mask layers: blur the mask regions on source to preview what gets hidden
  layers.forEach(layer => {
    if (!layer.visible || layer.type !== "mask" || !layer.masks || layer.masks.length === 0) return;

    const blurAmount = layer.blur > 0 ? layer.blur : 15;
    layer.masks.forEach(m => {
      ctx.save();
      ctx.beginPath();

      // Mask coordinates are in 1920x1080 source space, scale to canvas
      const sx = width / 1920;
      const sy = height / 1080;
      const mx = m.x * sx;
      const my = m.y * sy;
      const mw = m.w * sx;
      const mh = m.h * sy;

      if (m.type === "circle") {
        ctx.ellipse(mx + mw / 2, my + mh / 2, mw / 2, mh / 2, 0, 0, Math.PI * 2);
      } else if (m.type === "triangle") {
        ctx.moveTo(mx + mw / 2, my);
        ctx.lineTo(mx + mw, my + mh);
        ctx.lineTo(mx, my + mh);
        ctx.closePath();
      } else if (m.type === "star") {
        const cx = mx + mw / 2;
        const cy = my + mh / 2;
        const spikes = 5;
        const outerRadius = Math.min(mw, mh) / 2;
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
      } else if (m.type === "freeform" && m.points && m.points.length > 0) {
        m.points.forEach((p, pidx) => {
          const px = p.x * sx;
          const py = p.y * sy;
          if (pidx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
      } else {
        ctx.rect(mx, my, mw, mh);
      }

      ctx.clip();
      ctx.filter = `blur(${blurAmount}px)`;
      ctx.drawImage(master, 0, 0, width, height);
      ctx.restore();
    });
  });

  // Draw mask visual feedback for ALL visible layers on top
  layers.forEach(layer => {
    if (!layer.visible) return;
    const isSelected = layer.id === selectedLayerId;
    ctx.save();
    ctx.strokeStyle = isSelected ? "#ec4899" : "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = isSelected ? 2 : 1;
    
    if (layer.masks) {
      layer.masks.forEach(m => {
         if (m.type === "circle") {
            ctx.beginPath();
            ctx.ellipse(m.x + m.w/2, m.y + m.h/2, m.w/2, m.h/2, 0, 0, Math.PI * 2);
            ctx.stroke();
         } else if (m.type === "triangle") {
            ctx.beginPath();
            ctx.moveTo(m.x + m.w / 2, m.y);
            ctx.lineTo(m.x + m.w, m.y + m.h);
            ctx.lineTo(m.x, m.y + m.h);
            ctx.closePath();
            ctx.stroke();
         } else if (m.type === "star") {
            ctx.beginPath();
            const cx = m.x + m.w / 2;
            const cy = m.y + m.h / 2;
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
            ctx.stroke();
         } else if (m.type === "freeform" && m.points) {
            ctx.beginPath();
            m.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
            ctx.closePath();
            ctx.stroke();
         } else {
            ctx.strokeRect(m.x, m.y, m.w, m.h);
         }
      });
    }
    ctx.restore();
  });
};

export const renderSilhouette = (
  ctx: CanvasRenderingContext2D,
  layers: ReframeLayer[],
  selectedLayerId: string,
  width: number,
  height: number
) => {
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, width, height);

  layers.forEach(layer => {
    if (!layer.visible) return;
    const isSelected = layer.id === selectedLayerId;

    const s = layer.scale;
    const baseScale = layer.baseScale ?? s;
    const drawX = layer.x - (layer.cropArea.w * (s - baseScale)) / 2;
    const drawY = layer.y - (layer.cropArea.h * (s - baseScale)) / 2;

    const px = (drawX / 1080) * width;
    const py = (drawY / 1920) * height;
    const pw = (layer.cropArea.w * s / 1080) * width;
    const ph = (layer.cropArea.h * s / 1920) * height;

    ctx.fillStyle = isSelected ? "white" : "rgba(255,255,255,0.2)";
    
    if (layer.masks && layer.masks.length > 0) {
      layer.masks.forEach(m => {
        ctx.beginPath();
        const mx = px + ((m.x - layer.cropArea.x) / layer.cropArea.w) * pw;
        const my = py + ((m.y - layer.cropArea.y) / layer.cropArea.h) * ph;
        const mw = (m.w / layer.cropArea.w) * pw;
        const mh = (m.h / layer.cropArea.h) * ph;

        if (m.type === "circle") {
          ctx.ellipse(mx + mw/2, my + mh/2, mw/2, mh/2, 0, 0, Math.PI * 2);
        } else if (m.type === "triangle") {
          ctx.moveTo(mx + mw / 2, my);
          ctx.lineTo(mx + mw, my + mh);
          ctx.lineTo(mx, my + mh);
          ctx.closePath();
        } else if (m.type === "star") {
          const cx = mx + mw / 2;
          const cy = my + mh / 2;
          const spikes = 5;
          const outerRadius = Math.min(mw, mh) / 2;
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
          m.points.forEach((p, i) => {
            const lx = px + ((p.x - layer.cropArea.x) / layer.cropArea.w) * pw;
            const ly = py + ((p.y - layer.cropArea.y) / layer.cropArea.h) * ph;
            if (i === 0) ctx.moveTo(lx, ly); else ctx.lineTo(lx, ly);
          });
          ctx.closePath();
        } else {
          ctx.rect(mx, my, mw, mh);
        }
        ctx.fill();
      });
    } else {
      ctx.fillRect(px, py, pw, ph);
    }
  });
};

/**
 * Renders the PROGRAM monitor — the final 9:16 output preview.
 * 
 * For mask layers: the overlay is drawn clean/sharp (no blur).
 * The blur from mask layers is applied to the CROP layer underneath,
 * so the masked region on the main video appears blurred while the
 * overlay remains crisp.
 */
export const renderProgram = (
  ctx: CanvasRenderingContext2D,
  master: HTMLVideoElement,
  layers: ReframeLayer[],
  width: number,
  height: number
) => {
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, width, height);

  // Background blur layer (Auto)
  const mainLayer = layers[0];
  if (mainLayer) {
    ctx.save();
    ctx.filter = "blur(30px) brightness(0.3) saturate(1.2)";
    ctx.drawImage(master, 0, 0, width, height);
    ctx.restore();
  }

  // Collect all mask layers to apply their blur to crop layers
  const maskLayers = layers.filter(l => l.visible && l.type === "mask" && l.masks && l.masks.length > 0);

  layers.forEach(layer => {
    if (!layer.visible) return;

    const lw = Math.max(1, Math.round(layer.cropArea.w * layer.scale));
    const lh = Math.max(1, Math.round(layer.cropArea.h * layer.scale));

    const layerC = getOffscreen(`render_${layer.id}`, lw, lh);
    const layerCtx = layerC.getContext("2d")!;
    
    drawLayerWithMasks(layerCtx, master, layer, lw, lh);

    // ── For crop layers: apply blur from mask layers onto the crop ──
    // This creates the "blurred region where the mask will overlay clean content" effect.
    if (layer.type === "crop" && maskLayers.length > 0) {
      const vW = master.videoWidth;
      const vH = master.videoHeight;
      const svX = vW / 1920;
      const svY = vH / 1080;

      maskLayers.forEach(maskLayer => {
        const blurAmount = maskLayer.blur > 0 ? maskLayer.blur : 15;
        
        // Create a blurred version of the crop area
        const blurC = getOffscreen(`crop_blur_${layer.id}_${maskLayer.id}`, lw, lh);
        const blurCtx = blurC.getContext("2d")!;
        blurCtx.clearRect(0, 0, lw, lh);
        blurCtx.save();
        blurCtx.filter = `blur(${blurAmount}px) brightness(${layer.brightness}) contrast(${layer.contrast})`;
        blurCtx.drawImage(
          master,
          layer.cropArea.x * svX, layer.cropArea.y * svY,
          layer.cropArea.w * svX, layer.cropArea.h * svY,
          0, 0, lw, lh
        );
        blurCtx.restore();

        // For each mask in the mask layer, draw the blurred content in the corresponding
        // region on the crop layer
        maskLayer.masks.forEach((m, mi) => {
          // Convert mask coordinates (1920x1080 source space) to crop-layer-local space
          const mx = ((m.x - layer.cropArea.x) / layer.cropArea.w) * lw;
          const my = ((m.y - layer.cropArea.y) / layer.cropArea.h) * lh;
          const mw = (m.w / layer.cropArea.w) * lw;
          const mh = (m.h / layer.cropArea.h) * lh;

          const regionC = getOffscreen(`crop_blur_region_${layer.id}_${maskLayer.id}_${mi}`, lw, lh);
          const regionCtx = regionC.getContext("2d")!;
          regionCtx.clearRect(0, 0, lw, lh);

          // Draw mask shape
          regionCtx.fillStyle = "white";
          regionCtx.beginPath();
          if (m.type === "circle") {
            regionCtx.ellipse(mx + mw / 2, my + mh / 2, mw / 2, mh / 2, 0, 0, Math.PI * 2);
          } else if (m.type === "triangle") {
            regionCtx.moveTo(mx + mw / 2, my);
            regionCtx.lineTo(mx + mw, my + mh);
            regionCtx.lineTo(mx, my + mh);
            regionCtx.closePath();
          } else if (m.type === "star") {
            const cx = mx + mw / 2;
            const cy = my + mh / 2;
            const spikes = 5;
            const outerRadius = Math.min(mw, mh) / 2;
            const innerRadius = outerRadius * 0.4;
            let rot = (Math.PI / 2) * 3;
            const step = Math.PI / spikes;
            regionCtx.moveTo(cx, cy - outerRadius);
            for (let i = 0; i < spikes; i++) {
              let x = cx + Math.cos(rot) * outerRadius;
              let y = cy + Math.sin(rot) * outerRadius;
              regionCtx.lineTo(x, y);
              rot += step;
              x = cx + Math.cos(rot) * innerRadius;
              y = cy + Math.sin(rot) * innerRadius;
              regionCtx.lineTo(x, y);
              rot += step;
            }
            regionCtx.closePath();
          } else if (m.type === "freeform" && m.points && m.points.length > 0) {
            m.points.forEach((p, pidx) => {
              const px = ((p.x - layer.cropArea.x) / layer.cropArea.w) * lw;
              const py = ((p.y - layer.cropArea.y) / layer.cropArea.h) * lh;
              if (pidx === 0) regionCtx.moveTo(px, py);
              else regionCtx.lineTo(px, py);
            });
            regionCtx.closePath();
          } else {
            regionCtx.rect(mx, my, mw, mh);
          }
          regionCtx.fill();

          // Cut blurred pixels to mask shape
          regionCtx.save();
          regionCtx.globalCompositeOperation = "source-in";
          regionCtx.drawImage(blurC, 0, 0);
          regionCtx.restore();

          // Composite onto the crop layer canvas
          layerCtx.save();
          layerCtx.drawImage(regionC, 0, 0);
          layerCtx.restore();
        });
      });
    }

    const baseScale = layer.baseScale ?? layer.scale;
    const drawX = layer.x - (layer.cropArea.w * (layer.scale - baseScale)) / 2;
    const drawY = layer.y - (layer.cropArea.h * (layer.scale - baseScale)) / 2;

    const px = (drawX / 1080) * width;
    const py = (drawY / 1920) * height;
    const pw = (lw / 1080) * width;
    const ph = (lh / 1920) * height;

    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.drawImage(layerC, px, py, pw, ph);
    ctx.restore();
  });
};
