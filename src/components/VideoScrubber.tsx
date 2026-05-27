import React from "react";

interface VideoScrubberProps {
  duration: number;
  currentTime: number;
  trimStart: number;
  trimEnd: number;
  setTrimStart: (val: number) => void;
  setTrimEnd: (val: number) => void;
  setCurrentTime: (val: number) => void;
  masterVideoRef: React.RefObject<HTMLVideoElement | null>;
}

export function VideoScrubber({
  duration,
  currentTime,
  trimStart,
  trimEnd,
  setTrimStart,
  setTrimEnd,
  setCurrentTime,
  masterVideoRef
}: VideoScrubberProps) {
  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = String(Math.floor(time % 60)).padStart(2, "0");
    return `${mins}:${secs}`;
  };

  return (
    <div className="h-[60px] border-t border-white/8 px-4 flex flex-col justify-center bg-[#111318] select-none">
      <div className="flex items-center gap-3">
        {/* Trim Start Time Label */}
        <span className="text-[#ea580c] text-[11px] font-bold w-[35px] text-left">
          {formatTime(trimStart)}
        </span>
        
        {/* Slide Scrubber Range Area */}
        <div className="flex-1 relative h-[18px] flex items-center">
          {/* Base Background Bar */}
          <div className="absolute left-0 right-0 h-1 rounded bg-white/5" />
          
          {/* Selected Video Trim Bar */}
          <div 
            className="absolute h-1 bg-[#ea580c] rounded shadow-[0_0_8px_rgba(234,88,12,0.4)]"
            style={{
              left: `${(trimStart / duration) * 100}%`,
              width: `${((trimEnd - trimStart) / duration) * 100}%`,
            }}
          />

          {/* Current Playhead dot */}
          <div 
            className="absolute w-2.5 h-2.5 rounded-full bg-white -translate-x-[5px] shadow-[0_0_6px_#ffffff] z-10 pointer-events-none"
            style={{
              left: `${(currentTime / duration) * 100}%`,
            }}
          />

          {/* Double Range Sliders (Click-through) */}
          <input 
            type="range" 
            min="0" 
            max={duration} 
            step="0.1"
            value={trimStart}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (val < trimEnd) {
                setTrimStart(val);
                if (masterVideoRef.current) masterVideoRef.current.currentTime = val;
                setCurrentTime(val);
              }
            }}
            className="nodrag absolute w-full h-full bg-none appearance-none outline-none z-20 pointer-events-none range-trim-start"
          />
          <input 
            type="range" 
            min="0" 
            max={duration} 
            step="0.1"
            value={trimEnd}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (val > trimStart) {
                setTrimEnd(val);
              }
            }}
            className="nodrag absolute w-full h-full bg-none appearance-none outline-none z-30 pointer-events-none range-trim-end"
          />
        </div>

        {/* Trim End Time Label */}
        <span className="text-[#ea580c] text-[11px] font-bold w-[35px] text-right">
          {formatTime(trimEnd)}
        </span>
      </div>
    </div>
  );
}
