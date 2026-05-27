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
  maskPoints?: { x: number; y: number }[]; // 0.0 to 1.0 percentages
  maskBase64?: string; // Used temporarily during render
  masks?: MaskShape[]; // Çoklu gelişmiş maskeler
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
    game: "valorant",
    presetName: "Valorant 1080p Standart",
    sourceResolution: { w: 1920, h: 1080 },
    layers: [
      {
        id: "gameplay",
        label: "Oyun Aksiyonu (Ana)",
        cropArea: { x: 480, y: 0, w: 960, h: 1080 },
        canvasPos: { x: 0, y: 320, w: 1080, h: 1280 },
        locked: true,
        visible: true,
        maskShape: "square"
      },
      {
        id: "minimap",
        label: "Mini Harita (Sol Üst)",
        cropArea: { x: 25, y: 25, w: 280, h: 280 },
        canvasPos: { x: 30, y: 30, w: 320, h: 320 },
        locked: false,
        visible: true,
        maskShape: "circle"
      },
      {
        id: "team_left",
        label: "Dost Skor / Oyuncular",
        cropArea: { x: 670, y: 20, w: 240, h: 60 },
        canvasPos: { x: 40, y: 1650, w: 400, h: 100 },
        locked: false,
        visible: true,
        maskShape: "square"
      },
      {
        id: "team_right",
        label: "Düşman Skor / Oyuncular",
        cropArea: { x: 1010, y: 20, w: 240, h: 60 },
        canvasPos: { x: 640, y: 1650, w: 400, h: 100 },
        locked: false,
        visible: true,
        maskShape: "square"
      },
      {
        id: "timer",
        label: "Süre Sayacı",
        cropArea: { x: 910, y: 20, w: 100, h: 60 },
        canvasPos: { x: 490, y: 1650, w: 100, h: 60 },
        locked: false,
        visible: true,
        maskShape: "square"
      },
      {
        id: "facecam",
        label: "Yüz Kamerası (Facecam)",
        cropArea: { x: 1500, y: 700, w: 380, h: 280 },
        canvasPos: { x: 300, y: 30, w: 480, h: 350 },
        locked: false,
        visible: false,
        maskShape: "square"
      }
    ]
  },
  {
    game: "apex",
    presetName: "Apex Legends 1080p Standart",
    sourceResolution: { w: 1920, h: 1080 },
    layers: [
      {
        id: "gameplay",
        label: "Oyun Aksiyonu (Ana)",
        cropArea: { x: 480, y: 0, w: 960, h: 1080 },
        canvasPos: { x: 0, y: 320, w: 1080, h: 1280 },
        locked: true,
        visible: true,
        maskShape: "square"
      },
      {
        id: "minimap",
        label: "Mini Harita",
        cropArea: { x: 30, y: 30, w: 260, h: 260 },
        canvasPos: { x: 30, y: 30, w: 300, h: 300 },
        locked: false,
        visible: true,
        maskShape: "circle"
      },
      {
        id: "squad_info",
        label: "Kendi Can Barı (HUD)",
        cropArea: { x: 30, y: 880, w: 350, h: 170 },
        canvasPos: { x: 30, y: 1650, w: 400, h: 194 },
        locked: false,
        visible: true,
        maskShape: "square"
      },
      {
        id: "facecam",
        label: "Yüz Kamerası (Facecam)",
        cropArea: { x: 1500, y: 700, w: 380, h: 280 },
        canvasPos: { x: 300, y: 30, w: 480, h: 350 },
        locked: false,
        visible: false,
        maskShape: "square"
      }
    ]
  },
  {
    game: "cs2",
    presetName: "Counter-Strike 2 1080p Standart",
    sourceResolution: { w: 1920, h: 1080 },
    layers: [
      {
        id: "gameplay",
        label: "Oyun Aksiyonu (Ana)",
        cropArea: { x: 480, y: 0, w: 960, h: 1080 },
        canvasPos: { x: 0, y: 320, w: 1080, h: 1280 },
        locked: true,
        visible: true,
        maskShape: "square"
      },
      {
        id: "minimap",
        label: "Radar",
        cropArea: { x: 20, y: 20, w: 270, h: 270 },
        canvasPos: { x: 30, y: 30, w: 300, h: 300 },
        locked: false,
        visible: true,
        maskShape: "circle"
      },
      {
        id: "timer",
        label: "Skor ve Süre Sayacı",
        cropArea: { x: 860, y: 960, w: 200, h: 90 },
        canvasPos: { x: 440, y: 1650, w: 200, h: 90 },
        locked: false,
        visible: true,
        maskShape: "square"
      },
      {
        id: "facecam",
        label: "Yüz Kamerası (Facecam)",
        cropArea: { x: 1500, y: 700, w: 380, h: 280 },
        canvasPos: { x: 300, y: 30, w: 480, h: 350 },
        locked: false,
        visible: false,
        maskShape: "square"
      }
    ]
  }
];
