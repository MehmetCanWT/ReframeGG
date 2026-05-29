export interface MaskShape {
  id: string;
  name: string;
  type: "rect" | "circle" | "freeform" | "triangle" | "star";
  x: number;
  y: number;
  w: number;
  h: number;
  points?: { x: number; y: number }[];
  opacity: number;
  feather: number;
  roundness: number;
  subtractMode: boolean;
}

export interface Layer {
  id: string;
  label: string;
  cropArea: { x: number; y: number; w: number; h: number };
  canvasPos: { x: number; y: number; w: number; h: number };
  locked: boolean;
  visible: boolean;
  maskShape?: "square" | "circle" | "freeform" | "triangle" | "star";
  maskPoints?: { x: number; y: number }[];
  maskBase64?: string;
  masks?: MaskShape[];
  blur?: number;
  brightness?: number;
  contrast?: number;
}

export interface Preset {
  id?: string;
  game: string;
  presetName: string;
  sourceResolution: { w: number; h: number };
  layers: Layer[];
}

import presetsJson from "./presets.json";

export const defaultPresets: Preset[] = presetsJson as Preset[];
