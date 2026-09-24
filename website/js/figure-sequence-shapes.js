// Keep names and visual rotation periods aligned with internal/figureseq/shapes.go.
export const SHAPES = {
  arrow: { period: 360, path: 'M-11-6H1v-6L12 0 1 12V6h-12Z' },
  triangle: { period: 360, path: 'M0-12 11 10h-22Z' },
  corner: { period: 360, path: 'M-10-11h7v13h13v8h-20Z' },
  chevron: { period: 360, path: 'M-11-8-2 0-11 8-5 12 10 0-5-12Z' },
  square: { period: 90, path: 'M-10-10H10V10H-10Z' },
  hexagon: { period: 180, path: 'M-6-11H6L12 0 6 11H-6L-12 0Z' },
  'diamond-cross': { period: 90 },
  'bent-corner': { period: 360, path: 'M-10-12-3-5V3H5L12 10H-10Z' },
  trapezoid: { period: 360, path: 'M-7-11H7L12 11H-12Z' },
  arch: { period: 360, path: 'M-12 4A12 12 0 0 1 12 4H6A6 6 0 0 0-6 4Z' },
  flag: { period: 360, path: 'M-10-12H11L5-5 11 2H-5V12H-10Z' },
  lightning: { period: 360, path: 'M-2-12H10L2-2H9L-7 12-3 3H-11Z' },
  teardrop: { period: 360, path: 'M0-12C-3-7-10-1-10 4A10 8 0 0 0 10 4C10-1 3-7 0-12Z' },
  crescent: { period: 360, path: 'M7-11A12 12 0 1 0 7 11C-6 7-6-7 7-11Z' },
  'notched-square': { period: 360, path: 'M-11-11H2V-3H11V11H-11Z' },
  hook: { period: 360, path: 'M3-12H10V3A11 11 0 0 1-12 3V0H-5V3A4 4 0 0 0 3 3Z' },
  semicircle: { period: 360, path: 'M-12 6A12 12 0 0 1 12 6Z' },
  fork: { period: 360, path: 'M-11-12H-5V-3H5V-12H11V3H3V12H-3V3H-11Z' },
};

export const COLORS = {
  teal: '#16866f', magenta: '#c64f82', amber: '#f0b429', ink: '#27332b',
  yellow: '#f2e747', white: '#ffffff',
};

export function shapeMarkup(shape, color) {
  const definition = SHAPES[shape];
  if (!definition) throw new Error(`Unsupported figure shape: ${shape}`);
  const common = `fill="${color}" stroke="#17211b" stroke-width="2" stroke-linejoin="round"`;
  if (shape === 'diamond-cross') {
    return `<path fill="#17211b" d="M0-13 13 0 0 13-13 0Z" />
      <path fill="${color}" d="M-3-9H3V-3H9V3H3V9H-3V3H-9V-3H-3Z" />`;
  }
  return `<path ${common} d="${definition.path}" />${shape === 'bent-corner'
    ? '<path fill="#17211b" d="M-10-12-3-5V3H-10Z" />' : ''}`;
}

export function visualFrameKey(frame, actors) {
  return JSON.stringify(frame.figures.map((figure, index) => ({
    ...figure, rotation: figure.rotation % SHAPES[actors[index].shape].period,
  })));
}
