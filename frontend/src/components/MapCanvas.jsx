import React, { useEffect, useRef } from 'react';
import {
  IMAGE_SIZE,
  MINIMAP_FILES,
  drawHeatmap,
  drawDeadZones,
  loadImage,
} from '../utils/canvas';

/**
 * MapCanvas — renders a minimap with stacked heatmap overlays on an HTML5 Canvas.
 *
 * The minimap is drawn in greyscale at 65% brightness so heatmap colours
 * dominate. Multiple heatmap layers can be active simultaneously; the caller
 * supplies them in the desired z-order (bottom → top).
 *
 * Props:
 *   mapId          string    "AmbroseValley" | "GrandRift" | "Lockdown"
 *   heatmapLayers  object[]  heatmap objects ({ cells, max_value, type })
 *                            in z-order, bottom to top. May be empty.
 *   trafficData    object    traffic heatmap (used for dead-zone computation)
 *   showDeadZones  bool      whether to render the dead-zone grey overlay
 *   loading        bool      show loading state instead of canvas
 */
export default function MapCanvas({ mapId, heatmapLayers, trafficData, showDeadZones, loading }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!mapId || loading) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const src = MINIMAP_FILES[mapId];
    if (!src) return;

    loadImage(src)
      .then((img) => {
        ctx.clearRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);

        // Greyscale minimap at 65% brightness — geographic skeleton that
        // doesn't compete visually with the heatmap colour overlays
        ctx.filter = 'grayscale(100%) brightness(0.65)';
        ctx.drawImage(img, 0, 0, IMAGE_SIZE, IMAGE_SIZE);
        ctx.filter = 'none';

        // Heatmap layers drawn in z-order (caller pre-sorts: traffic → kills)
        if (heatmapLayers && heatmapLayers.length > 0) {
          for (const layer of heatmapLayers) {
            drawHeatmap(ctx, layer);
          }
        }

        // Dead zones (grey) overlay — requires traffic data
        if (showDeadZones && trafficData) {
          drawDeadZones(ctx, trafficData);
        }
      })
      .catch(() => {
        // Image failed to load — draw a dark placeholder
        ctx.fillStyle = '#18181b';
        ctx.fillRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);
        ctx.fillStyle = '#52525b';
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Minimap unavailable', IMAGE_SIZE / 2, IMAGE_SIZE / 2);
      });
  }, [mapId, heatmapLayers, trafficData, showDeadZones, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-zinc-900">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-red-500" />
          <span className="text-xs text-zinc-500">Loading heatmap…</span>
        </div>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={IMAGE_SIZE}
      height={IMAGE_SIZE}
      className="w-full rounded-xl"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
