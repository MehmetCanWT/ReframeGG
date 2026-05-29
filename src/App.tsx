import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { SourceSelector } from "./components/SourceSelector";
import { FlowEditor } from "./components/FlowEditor";
import "./index.css";

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

  // Set up Tauri drag-and-drop listener channels
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

  const handleManualVideoSelect = useCallback(async () => {
    try {
      const selected = await invoke<string>("select_video_file");
      if (selected) handleVideoLoaded(selected);
    } catch (err) {}
  }, []);

  // Global listener for triggering video selector from custom node buttons
  useEffect(() => {
    const handleTriggerSelect = () => {
      handleManualVideoSelect();
    };
    window.addEventListener("triggerVideoSelect", handleTriggerSelect);
    return () => window.removeEventListener("triggerVideoSelect", handleTriggerSelect);
  }, [handleManualVideoSelect]);

  // Master Video playback state syncing
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

  // Playback timer ticker (approx 30ms updates for highly responsive looping)
  useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        const master = masterVideoRef.current;
        if (master) {
          const curr = master.currentTime;
          if (curr >= trimEnd || curr < trimStart) {
            master.currentTime = trimStart;
            setCurrentTime(trimStart);
          } else {
            setCurrentTime(curr);
          }
        }
      }, 30);
    }
    return () => clearInterval(interval);
  }, [isPlaying, trimStart, trimEnd]);

  if (!videoPath) {
    return (
      <SourceSelector 
        isDragging={isDragging}
        handleManualVideoSelect={handleManualVideoSelect}
      />
    );
  }

  return (
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
  );
}