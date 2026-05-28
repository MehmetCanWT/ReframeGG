export interface MaskShape {
  id: string;
  name: string;
  type: "rect" | "circle" | "freeform";
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
  maskShape?: "square" | "circle" | "freeform";
  maskPoints?: { x: number; y: number }[];
  maskBase64?: string;
  masks?: MaskShape[];
  blur?: number;
  brightness?: number;
  contrast?: number;
}

export interface Preset {
  game: string;
  presetName: string;
  sourceResolution: { w: number; h: number };
  layers: Layer[];
}

export const defaultPresets: Preset[] = [
  {
    game: "Valorant",
    presetName: "Valorant 2K (1440p) Pro Layout",
    sourceResolution: { w: 2560, h: 1440 },
    layers: [
      {
        id: "gameplay",
        label: "Main Gameplay",
        cropArea: { x: 864, y: 0, w: 810, h: 1440 },
        canvasPos: { x: 0, y: 240, w: 1080, h: 1920 },
        locked: false,
        visible: true,
        maskShape: "square"
      },
      {
        id: "minimap",
        label: "Minimap",
        cropArea: { x: 40, y: 40, w: 420, h: 420 },
        canvasPos: { x: 30, y: 30, w: 380, h: 380 },
        locked: false,
        visible: true,
        maskShape: "circle"
      },
      {
        id: "killfeed",
        label: "Kill Feed",
        cropArea: { x: 1980, y: 40, w: 540, h: 400 },
        canvasPos: { x: 650, y: 30, w: 400, h: 300 },
        locked: false,
        visible: true,
        maskShape: "square"
      },
      {
        id: "hud_center",
        label: "Abilities & Ultimate",
        cropArea: { x: 1050, y: 1250, w: 460, h: 120 },
        canvasPos: { x: 310, y: 1750, w: 460, h: 120 },
        locked: false,
        visible: true,
        maskShape: "square"
      },
      {
        id: "hud_health",
        label: "Health & Shield",
        cropArea: { x: 770, y: 1250, w: 320, h: 120 },
        canvasPos: { x: 20, y: 1750, w: 300, h: 110 },
        locked: false,
        visible: true,
        maskShape: "square"
      },
      {
        id: "hud_ammo",
        label: "Ammo & Weapon",
        cropArea: { x: 1470, y: 1250, w: 320, h: 120 },
        canvasPos: { x: 760, y: 1750, w: 300, h: 110 },
        locked: false,
        visible: true,
        maskShape: "square"
      }
    ]
  },
  {
    game: "Valorant",
    presetName: "Valorant 1080p Standard Layout",
    sourceResolution: { w: 1920, h: 1080 },
    layers: [
      {
        id: "gameplay",
        label: "Main Gameplay",
        cropArea: { x: 656, y: 0, w: 608, h: 1080 },
        canvasPos: { x: 0, y: 0, w: 1080, h: 1920 },
        locked: false,
        visible: true,
        maskShape: "square"
      },
      {
        id: "minimap",
        label: "Minimap",
        cropArea: { x: 40, y: 40, w: 280, h: 280 },
        canvasPos: { x: 30, y: 30, w: 260, h: 260 },
        locked: false,
        visible: true,
        maskShape: "circle"
      },
      {
        id: "killfeed",
        label: "Kill Feed",
        cropArea: { x: 1520, y: 45, w: 360, h: 280 },
        canvasPos: { x: 700, y: 30, w: 340, h: 220 },
        locked: false,
        visible: true,
        maskShape: "square"
      },
      {
        id: "hud_center",
        label: "Abilities & Ultimate",
        cropArea: { x: 805, y: 945, w: 310, h: 85 },
        canvasPos: { x: 385, y: 1780, w: 310, h: 85 },
        locked: false,
        visible: true,
        maskShape: "square"
      },
      {
        id: "hud_health",
        label: "Health",
        cropArea: { x: 585, y: 945, w: 220, h: 85 },
        canvasPos: { x: 40, y: 1780, w: 220, h: 85 },
        locked: false,
        visible: true,
        maskShape: "square"
      },
      {
        id: "hud_ammo",
        label: "Ammo",
        cropArea: { x: 1115, y: 945, w: 220, h: 85 },
        canvasPos: { x: 820, y: 1780, w: 220, h: 85 },
        locked: false,
        visible: true,
        maskShape: "square"
      }
    ]
  }
];
