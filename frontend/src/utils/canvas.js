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
 * Scale: Blue (cold) → Yellow (mid) → Red (hot).
 *
 * @param {number} t   0 = coldest, 1 = hottest
 * @param {number} alpha  overall opacity multiplier (0–1)
 */
export function heatColor(t, alpha = 0.6) {
  let r, g, b;
  if (t < 0.5) {
    // Blue → Yellow
    const s = t * 2; // 0→1
    r = Math.round(s * 255);
    g = Math.round(s * 255);
    b = Math.round((1 - s) * 255);
  } else {
    // Yellow → Red
    const s = (t - 0.5) * 2; // 0→1
    r = 255;
    g = Math.round((1 - s) * 255);
    b = 0;
  }
  // Use a non-linear opacity curve so sparse cells stay visible but not loud
  const a = (alpha * (0.2 + 0.8 * t)).toFixed(3);
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

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const val = cells[row][col];
      if (val === 0) continue;
      const t = val / max_value;
      ctx.fillStyle = heatColor(t);
      ctx.fillRect(col * CELL_PX, row * CELL_PX, CELL_PX, CELL_PX);
    }
  }
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
