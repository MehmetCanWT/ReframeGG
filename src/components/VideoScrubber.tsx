import React from "react";
import { Play, Pause } from "lucide-react";

interface VideoScrubberProps {
  duration: number;
  currentTime: number;
  trimStart: number;
  trimEnd: number;
  setTrimStart: (val: number) => void;
  setTrimEnd: (val: number) => void;
  setCurrentTime: (val: number) => void;
  masterVideoRef: React.RefObject<HTMLVideoElement | null>;
  isPlaying: boolean;
  setIsPlaying: (val: boolean) => void;
}

export function VideoScrubber({
  duration,
  currentTime,
  trimStart,
  trimEnd,
  setTrimStart,
  setTrimEnd,
  setCurrentTime,
  masterVideoRef,
  isPlaying,
  setIsPlaying
}: VideoScrubberProps) {
  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = String(Math.floor(time % 60)).padStart(2, "0");
    return `${mins}:${secs}`;
  };

  const handleSeek = (clientX: number, container: HTMLDivElement) => {
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const time = percent * duration;
    if (masterVideoRef.current) masterVideoRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    container.setPointerCapture(e.pointerId);

    handleSeek(e.clientX, container);

    const onPointerMove = (moveEvent: PointerEvent) => {
      handleSeek(moveEvent.clientX, container);
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      container.releasePointerCapture(upEvent.pointerId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const handleStartPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    
    const container = handle.parentElement;
    if (!container) return;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = moveEvent.clientX - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      const val = parseFloat((percent * duration).toFixed(1));
      if (val < trimEnd - 0.5) {
        setTrimStart(val);
        if (masterVideoRef.current) masterVideoRef.current.currentTime = val;
        setCurrentTime(val);
      }
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      handle.releasePointerCapture(upEvent.pointerId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const handleEndPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    
    const container = handle.parentElement;
    if (!container) return;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = moveEvent.clientX - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      const val = parseFloat((percent * duration).toFixed(1));
      if (val > trimStart + 0.5) {
        setTrimEnd(val);
      }
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      handle.releasePointerCapture(upEvent.pointerId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  return (
    <div className="flex-1 flex items-center gap-3 px-4 h-full">
      <button
        onClick={() => setIsPlaying(!isPlaying)}
        className={`w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center transition cursor-pointer ${
          isPlaying ? "bg-pink-600 text-white shadow-[0_0_12px_rgba(236,72,153,0.4)]" : "bg-[#1f2127] text-zinc-300"
        }`}
      >
        {isPlaying ? <Pause size={14} /> : <Play size={14} />}
      </button>

      <span className="text-zinc-500 font-mono text-[10px] w-10 text-right">
        {formatTime(currentTime)}
      </span>
      
      <div 
        className="flex-1 relative h-6 flex items-center group cursor-pointer select-none"
        onPointerDown={handleTrackPointerDown}
      >
        <div className="absolute left-0 right-0 h-1 rounded bg-white/5" />
        
        <div 
          className="absolute h-1 bg-pink-600/40 rounded pointer-events-none"
          style={{
            left: `${(trimStart / duration) * 100}%`,
            width: `${((trimEnd - trimStart) / duration) * 100}%`,
          }}
        />

        <div 
          className="absolute h-4 w-0.5 bg-pink-500 z-10 pointer-events-none"
          style={{ left: `${(currentTime / duration) * 100}%` }}
        />

        {/* Trim Start Handle */}
        <div 
          className="absolute w-3 h-6 bg-pink-600 hover:bg-pink-500 border border-pink-400/40 rounded-l cursor-ew-resize flex items-center justify-center select-none shadow-[0_0_10px_rgba(236,72,153,0.4)] transition-colors active:scale-105 z-30 touch-none"
          style={{
            left: `${(trimStart / duration) * 100}%`,
            transform: 'translateX(-100%)',
          }}
          onPointerDown={handleStartPointerDown}
        >
          <span className="text-[10px] font-black text-white leading-none">[</span>
        </div>

        {/* Trim End Handle */}
        <div 
          className="absolute w-3 h-6 bg-pink-600 hover:bg-pink-500 border border-pink-400/40 rounded-r cursor-ew-resize flex items-center justify-center select-none shadow-[0_0_10px_rgba(236,72,153,0.4)] transition-colors active:scale-105 z-30 touch-none"
          style={{
            left: `${(trimEnd / duration) * 100}%`,
          }}
          onPointerDown={handleEndPointerDown}
        >
          <span className="text-[10px] font-black text-white leading-none">]</span>
        </div>
      </div>

      <span className="text-zinc-500 font-mono text-[10px] w-10 text-left">
        {formatTime(duration)}
      </span>
    </div>
  );
}
