/**
 * canvas.js — Shared canvas drawing utilities.
 *
 * Heatmap colour scale: Blue → Yellow → Red (matches spec).
 * Dead-zone scale: grey overlay on near-zero traffic cells.
 */

export const GRID_SIZE = 64;
export const IMAGE_SIZE = 1024; // minimap pixel dimensions
export const CELL_PX = IMAGE_SIZE / GRID_SIZE; // 16px per grid cell

/**
 * Map minimap image filenames.
 */
export const MINIMAP_FILES = {
  AmbroseValley: '/minimaps/AmbroseValley_Minimap.png',
  GrandRift:     '/minimaps/GrandRift_Minimap.png',
  Lockdown:      '/minimaps/Lockdown_Minimap.jpg',
};

/**
 * Convert a normalised heat value (0–1) to an RGBA colour string.
 * Scale: Orange (warm) → Red (hot), opacity scales with intensity.
 *
 * @param {number} t   0 = coolest, 1 = hottest
 * @param {number} alpha  overall opacity multiplier (0–1)
 */
export function heatColor(t, alpha = 0.6) {
  // Orange (255,140,0) → Red (255,0,0)
  const r = 255;
  const g = Math.round((1 - t) * 140);
  const b = 0;
  // Opacity scales linearly with intensity
  const a = (alpha * t).toFixed(3);
  return `rgba(${r},${g},${b},${a})`;
}

/**
 * Draw a heatmap grid onto a canvas 2D context.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ cells: number[][], max_value: number }} heatmapData
 */
export function drawHeatmap(ctx, heatmapData) {
  const { cells, max_value } = heatmapData;
  if (!cells || max_value === 0) return;

  // Draw cells onto an offscreen canvas, then blur + composite onto main ctx
  const offscreen = document.createElement('canvas');
  offscreen.width = IMAGE_SIZE;
  offscreen.height = IMAGE_SIZE;
  const off = offscreen.getContext('2d');

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const val = cells[row][col];
      const t = val / max_value;
      if (t < 0.1) continue; // skip cold cells — let map show through
      off.fillStyle = heatColor(t);
      off.fillRect(col * CELL_PX, row * CELL_PX, CELL_PX, CELL_PX);
    }
  }

  // Apply gaussian blur for smooth gradient between cells
  ctx.filter = 'blur(10px)';
  ctx.drawImage(offscreen, 0, 0);
  // Reset state so subsequent draws are unaffected
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
}

/**
 * Draw dead-zone overlay: grey on cells with near-zero traffic.
 * Uses the traffic heatmap as the source of truth.
 *
 * A cell is "dead" if its traffic value is below DEAD_THRESHOLD * max_value.
 */
const DEAD_THRESHOLD = 0.02; // bottom 2% of traffic density

export function drawDeadZones(ctx, trafficData) {
  const { cells, max_value } = trafficData;
  if (!cells || max_value === 0) return;

  ctx.fillStyle = 'rgba(80,80,80,0.45)';
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const val = cells[row][col];
      if (val / max_value < DEAD_THRESHOLD) {
        ctx.fillRect(col * CELL_PX, row * CELL_PX, CELL_PX, CELL_PX);
      }
    }
  }
}

/**
 * Load an image and return a Promise<HTMLImageElement>.
 * Caches results so the same URL isn't fetched twice.
 */
const _imgCache = {};
export function loadImage(src) {
  if (_imgCache[src]) return _imgCache[src];
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  _imgCache[src] = p;
  return p;
}
