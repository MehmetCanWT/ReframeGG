import { MaskShape } from "./presets";

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

export type EditorTool = "select" | "rect" | "circle" | "freeform";

export interface ModalState {
  type: "alert" | "confirm" | "prompt";
  title: string;
  message: string;
  defaultValue?: string;
  onConfirm?: (val?: string) => void;
  onCancel?: () => void;
}

export interface PanelWidths {
  left: number;
  middle: number;
}

export type RenderEvent = 
  | { type: "Progress"; data: { progress: number; status: string } }
  | { type: "Complete"; data: { path: string } }
  | { type: "Error"; data: { message: string } };

