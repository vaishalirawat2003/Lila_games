/**
 * canvas.js — Shared canvas drawing utilities.
 *
 * Each heatmap type has a semantically distinct colour gradient.
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
 * Per-type colour scales.
 * Each entry: low-intensity RGB → peak RGB, with a maxAlpha cap.
 * Alpha scales linearly with heat intensity, so zero-density cells are
 * fully transparent and let the map show through.
 */
const HEATMAP_COLOR_SCALES = {
  kills:   { from: [255, 100,   0], to: [255,   0,   0], maxAlpha: 0.90 }, // orange → red
  deaths:  { from: [200,   0, 255], to: [255,   0, 150], maxAlpha: 0.90 }, // purple → hot pink
  storm:   { from: [  0, 255, 255], to: [  0, 200, 255], maxAlpha: 0.90 }, // cyan → electric blue
  loot:    { from: [180, 255,   0], to: [  0, 255,  80], maxAlpha: 0.90 }, // lime → neon green
  traffic: { from: [255, 220,   0], to: [255, 255, 255], maxAlpha: 0.85 }, // gold → white;
};

const _DEFAULT_SCALE = { from: [255, 140, 0], to: [255, 0, 0], maxAlpha: 0.75 };

/**
 * Return an rgba() string for a given heat intensity and heatmap type.
 *
 * @param {number} t     0 (cold) – 1 (hot)
 * @param {string} type  heatmap type key
 */
export function heatColorForType(t, type) {
  const { from, to, maxAlpha } = HEATMAP_COLOR_SCALES[type] || _DEFAULT_SCALE;
  const r = Math.round(from[0] + (to[0] - from[0]) * t);
  const g = Math.round(from[1] + (to[1] - from[1]) * t);
  const b = Math.round(from[2] + (to[2] - from[2]) * t);
  const a = (maxAlpha * t).toFixed(3);
  return `rgba(${r},${g},${b},${a})`;
}

/**
 * Draw a heatmap grid onto a canvas 2D context.
 * Uses the type stored in heatmapData to select the correct colour scale.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ cells: number[][], max_value: number, type: string }} heatmapData
 */
export function drawHeatmap(ctx, heatmapData) {
  const { cells, max_value, type } = heatmapData;
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
      off.fillStyle = heatColorForType(t, type);
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
 * Draw dead-zone overlay: cold blue-purple fog over cells with near-zero traffic.
 * Uses the traffic heatmap as the source of truth.
 *
 * All dead cells are painted onto an offscreen canvas first, then blurred and
 * composited as a single pass so edges are completely soft — reading as
 * atmospheric shadow rather than a hard grid.
 */
const DEAD_THRESHOLD = 0.02; // bottom 2% of traffic density

export function drawDeadZones(ctx, trafficData) {
  const { cells, max_value } = trafficData;
  if (!cells || max_value === 0) return;

  const offscreen = document.createElement('canvas');
  offscreen.width = IMAGE_SIZE;
  offscreen.height = IMAGE_SIZE;
  const off = offscreen.getContext('2d');

  off.fillStyle = 'rgba(80, 0, 255, 0.35)'; // chromatic blue-purple — visible against greyscale map
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (cells[row][col] / max_value < DEAD_THRESHOLD) {
        off.fillRect(col * CELL_PX, row * CELL_PX, CELL_PX, CELL_PX);
      }
    }
  }

  // Blur before compositing so the overlay reads as soft fog, not a pixel grid
  ctx.filter = 'blur(20px)';
  ctx.drawImage(offscreen, 0, 0);
  ctx.filter = 'none';
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
