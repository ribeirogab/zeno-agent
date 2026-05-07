export type Particle = {
  top: number;
  left: number;
  size: number;
  opacity: number;
  color: string;
};

// 20 static particles, positions copied verbatim from the approved
// Paper artboard `apps-web · landing` (page 1-0, frame `Particles`,
// node id 18VY-0). Anchored to a 1440-wide hero box; positions are
// absolute px relative to the hero's top-left corner.
export const PARTICLES: readonly Particle[] = [
  { top: 64, left: 173, size: 3, opacity: 0.55, color: '#d9b362' },
  { top: 96, left: 403, size: 2, opacity: 0.4, color: '#d9b362' },
  { top: 140, left: 1210, size: 2, opacity: 0.6, color: '#f0cc7a' },
  { top: 180, left: 86, size: 1, opacity: 0.7, color: '#d9b362' },
  { top: 220, left: 1325, size: 3, opacity: 0.35, color: '#d9b362' },
  { top: 80, left: 1037, size: 1, opacity: 0.8, color: '#f0cc7a' },
  { top: 280, left: 259, size: 2, opacity: 0.5, color: '#d9b362' },
  { top: 320, left: 1267, size: 1, opacity: 0.65, color: '#d9b362' },
  { top: 380, left: 115, size: 2, opacity: 0.45, color: '#f0cc7a' },
  { top: 420, left: 1094, size: 3, opacity: 0.3, color: '#d9b362' },
  { top: 460, left: 317, size: 1, opacity: 0.75, color: '#d9b362' },
  { top: 480, left: 922, size: 2, opacity: 0.4, color: '#d9b362' },
  { top: 40, left: 806, size: 1, opacity: 0.85, color: '#f0cc7a' },
  { top: 160, left: 547, size: 1, opacity: 0.7, color: '#d9b362' },
  { top: 240, left: 1152, size: 2, opacity: 0.45, color: '#d9b362' },
  { top: 360, left: 634, size: 1, opacity: 0.6, color: '#d9b362' },
  { top: 200, left: 230, size: 2, opacity: 0.5, color: '#f0cc7a' },
  { top: 300, left: 1008, size: 1, opacity: 0.75, color: '#d9b362' },
  { top: 400, left: 432, size: 1, opacity: 0.55, color: '#d9b362' },
  { top: 120, left: 58, size: 2, opacity: 0.35, color: '#d9b362' },
] as const;
