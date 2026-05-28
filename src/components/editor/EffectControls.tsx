import React, { useCallback, useRef } from "react";
import { Sliders, Minus, Plus } from "lucide-react";
import { ReframeLayer } from "../../types";

interface EffectControlsProps {
  selectedLayer: ReframeLayer | undefined;
  onUpdateLayer: (id: string, updates: Partial<ReframeLayer>) => void;
  snapValue: (val: number, targets: number[], threshold?: number) => number;
}

/* ── Custom Slider ────────────────────────────────────────────── */
interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
  onSnap?: (v: number) => number;
}

const CustomSlider: React.FC<SliderProps> = React.memo(({
  label, value, min, max, step = 1, suffix = "px", onChange, onSnap
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Clamp + snap helper
  const applyValue = useCallback((raw: number) => {
    // Round to step precision
    const decimals = step < 1 ? Math.max(String(step).split('.')[1]?.length || 0, 2) : 0;
    let val = Math.round(raw / step) * step;
    val = parseFloat(val.toFixed(decimals));
    val = Math.max(min, Math.min(max, val));
    if (onSnap) val = onSnap(val);
    onChange(val);
  }, [min, max, step, onSnap, onChange]);

  // Convert pointer X → value
  const pointerToValue = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    applyValue(min + ratio * (max - min));
  }, [min, max, applyValue]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointerToValue(e.clientX);
  }, [pointerToValue]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    e.preventDefault();
    pointerToValue(e.clientX);
  }, [pointerToValue]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  // +/- step buttons
  const increment = useCallback(() => applyValue(value + step), [value, step, applyValue]);
  const decrement = useCallback(() => applyValue(value - step), [value, step, applyValue]);

  // Progress ratio for the fill bar
  const progress = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const displayValue = step < 1 ? value.toFixed(2) : Math.round(value);

  return (
    <div className="flex flex-col gap-1 select-none">
      {/* Label row */}
      <div className="flex justify-between text-[10px] font-bold text-zinc-400">
        <span>{label}</span>
        <span className="text-orange-500/90 font-mono">{displayValue}{suffix}</span>
      </div>

      {/* Slider row: [-] [track] [+] */}
      <div className="flex items-center gap-1.5">
        {/* Minus button */}
        <button
          type="button"
          onClick={decrement}
          className="ec-step-btn"
          title={`Decrease by ${step}`}
        >
          <Minus size={10} strokeWidth={3} />
        </button>

        {/* Custom track */}
        <div
          ref={trackRef}
          className="ec-track-wrapper"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* Background track */}
          <div className="ec-track-bg" />
          {/* Filled portion */}
          <div className="ec-track-fill" style={{ width: `${progress}%` }} />
          {/* Thumb */}
          <div className="ec-thumb" style={{ left: `${progress}%` }} />
        </div>

        {/* Plus button */}
        <button
          type="button"
          onClick={increment}
          className="ec-step-btn"
          title={`Increase by ${step}`}
        >
          <Plus size={10} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
});

/* ── Main Component ───────────────────────────────────────────── */
export const EffectControls: React.FC<EffectControlsProps> = React.memo(({
  selectedLayer,
  onUpdateLayer,
  snapValue
}) => {
  if (!selectedLayer) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-600 text-[10px] font-black uppercase tracking-widest">
        Select a layer to adjust effects
      </div>
    );
  }

  const layerW = selectedLayer.cropArea.w * selectedLayer.scale;
  const layerH = selectedLayer.cropArea.h * selectedLayer.scale;

  const ControlGroup = ({ title, children }: { title: string, children: React.ReactNode }) => (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9px] font-black tracking-[0.15em] text-orange-500/80 uppercase border-b border-white/5 pb-0.5">
        {title}
      </span>
      <div className="flex flex-col gap-2">
        {children}
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col bg-[#111215] min-h-0 overflow-hidden">
      <div className="h-[38px] flex-shrink-0 bg-[#16181d] px-4 flex items-center border-b border-white/5">
        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
          <Sliders size={11} className="text-orange-500" />
          Effect Controls
        </span>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5 px-3.5 select-auto">
        <div className="grid grid-cols-3 gap-4 max-w-[1200px] pb-4">
          <ControlGroup title="Transform">
            <CustomSlider label="Position X" value={selectedLayer.x} min={-1000} max={2000} 
              onSnap={(v: number) => snapValue(v, [0, 540 - layerW/2, 1080 - layerW], 40)}
              onChange={(v: number) => onUpdateLayer(selectedLayer.id, { x: v })} />
            
            <CustomSlider label="Position Y" value={selectedLayer.y} min={-1000} max={2000} 
              onSnap={(v: number) => snapValue(v, [0, 960 - layerH/2, 1920 - layerH], 40)}
              onChange={(v: number) => onUpdateLayer(selectedLayer.id, { y: v })} />
            
            <CustomSlider label="Scaling" value={selectedLayer.scale} min={0.1} max={4.0} step={0.01} suffix="x"
              onChange={(v: number) => onUpdateLayer(selectedLayer.id, { scale: v })} />
          </ControlGroup>

          {selectedLayer.type === "crop" ? (
            <ControlGroup title="Crop Area">
              <CustomSlider label="Width" value={selectedLayer.cropArea.w} min={50} max={1920} 
                onSnap={(v: number) => snapValue(v, [1920], 60)}
                onChange={(v: number) => onUpdateLayer(selectedLayer.id, { cropArea: { ...selectedLayer.cropArea, w: v } })} />
              
              <CustomSlider label="Height" value={selectedLayer.cropArea.h} min={50} max={1080} 
                onSnap={(v: number) => snapValue(v, [1080], 60)}
                onChange={(v: number) => onUpdateLayer(selectedLayer.id, { cropArea: { ...selectedLayer.cropArea, h: v } })} />
              
              <CustomSlider label="Offset X" value={selectedLayer.cropArea.x} min={0} max={1920} 
                onSnap={(v: number) => snapValue(v, [0, 1920 - selectedLayer.cropArea.w], 40)}
                onChange={(v: number) => onUpdateLayer(selectedLayer.id, { cropArea: { ...selectedLayer.cropArea, x: v } })} />
              
              <CustomSlider label="Offset Y" value={selectedLayer.cropArea.y} min={0} max={1080} 
                onSnap={(v: number) => snapValue(v, [0, 1080 - selectedLayer.cropArea.h], 40)}
                onChange={(v: number) => onUpdateLayer(selectedLayer.id, { cropArea: { ...selectedLayer.cropArea, y: v } })} />
            </ControlGroup>
          ) : (
            <ControlGroup title="Crop Area">
              <div className="text-zinc-500 text-[9px] font-black uppercase leading-normal tracking-wide bg-[#16181d] border border-white/5 rounded-xl p-3.5 select-none text-center">
                Crop area is managed automatically by the mask shape. <br/><span className="text-orange-500/90">Use Transform controls</span> on the left to scale and position your overlay.
              </div>
            </ControlGroup>
          )}

          <ControlGroup title="Color & Blur">
            <CustomSlider label="Brightness" value={selectedLayer.brightness} min={0.5} max={2.0} step={0.05} suffix="x"
              onChange={(v: number) => onUpdateLayer(selectedLayer.id, { brightness: v })} />
            
            <CustomSlider label="Contrast" value={selectedLayer.contrast} min={0.5} max={2.0} step={0.05} suffix="x"
              onChange={(v: number) => onUpdateLayer(selectedLayer.id, { contrast: v })} />
            
            <CustomSlider label="Blur Amount" value={selectedLayer.blur} min={0} max={60} 
              onChange={(v: number) => onUpdateLayer(selectedLayer.id, { blur: v })} />
            
            <CustomSlider label="Edge Feather" value={selectedLayer.feather} min={0} max={100} 
              onChange={(v: number) => onUpdateLayer(selectedLayer.id, { feather: v })} />
          </ControlGroup>
        </div>
      </div>
    </div>
  );
});
