import React, { useEffect, useRef } from 'react';
import {
  IMAGE_SIZE,
  MINIMAP_FILES,
  drawHeatmap,
  drawDeadZones,
  loadImage,
} from '../utils/canvas';

/**
 * MapCanvas — renders a minimap with a heatmap overlay on an HTML5 Canvas.
 *
 * The canvas internal resolution is always 1024×1024 (matching the minimap
 * images). CSS scales it to fill the available container width.
 *
 * Props:
 *   mapId          string   "AmbroseValley" | "GrandRift" | "Lockdown"
 *   heatmapData    object   { cells, max_value, grid_size } from /heatmap
 *   trafficData    object   traffic heatmap (used for dead-zone computation)
 *   showDeadZones  bool     whether to render the dead-zone grey overlay
 *   loading        bool     show loading state instead of canvas
 */
export default function MapCanvas({ mapId, heatmapData, trafficData, showDeadZones, loading }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!mapId || !heatmapData || loading) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const src = MINIMAP_FILES[mapId];
    if (!src) return;

    loadImage(src)
      .then((img) => {
        // Clear and draw minimap base
        ctx.clearRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);
        ctx.drawImage(img, 0, 0, IMAGE_SIZE, IMAGE_SIZE);

        // Heatmap overlay
        drawHeatmap(ctx, heatmapData);

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
  }, [mapId, heatmapData, trafficData, showDeadZones, loading]);

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
