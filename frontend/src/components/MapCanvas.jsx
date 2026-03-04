import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  IMAGE_SIZE,
  MINIMAP_FILES,
  drawHeatmap,
  drawDeadZones,
  loadImage,
} from '../utils/canvas';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.5;
const MINI_PX   = 120; // navigator thumbnail size in CSS px

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp pan so the map never exposes blank space at any edge. */
function clampTransform(scale, x, y) {
  const minOff = IMAGE_SIZE * (1 - scale);
  return {
    scale,
    x: Math.max(minOff, Math.min(0, x)),
    y: Math.max(minOff, Math.min(0, y)),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * MapCanvas
 *
 * Layout contract with parent:
 *   The parent must give this component a defined height (flex-1 min-h-0 etc.).
 *   This component fills that space, centres the square canvas, and positions
 *   all overlays relative to the canvas square — not the outer container.
 */
export default function MapCanvas({ mapId, heatmapLayers, trafficData, showDeadZones, loading }) {
  const canvasRef = useRef(null);
  const miniRef   = useRef(null);

  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const transformRef = useRef(transform);

  const [isPanning, setIsPanning] = useState(false);
  const dragging  = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  // Keep transformRef current for event handlers that can't close over state
  useEffect(() => { transformRef.current = transform; }, [transform]);

  // Reset view whenever the active map changes
  useEffect(() => { setTransform({ scale: 1, x: 0, y: 0 }); }, [mapId]);

  // ── Draw main canvas ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapId || loading) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const src = MINIMAP_FILES[mapId];
    if (!src) return;

    loadImage(src)
      .then((img) => {
        const { scale, x, y } = transform;
        ctx.clearRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);

        // Apply zoom/pan transform — all layers draw inside this so they move together
        ctx.save();
        ctx.setTransform(scale, 0, 0, scale, x, y);

        ctx.filter = 'grayscale(100%) brightness(0.65)';
        ctx.drawImage(img, 0, 0, IMAGE_SIZE, IMAGE_SIZE);
        ctx.filter = 'none';

        for (const layer of heatmapLayers ?? []) {
          drawHeatmap(ctx, layer);
        }
        if (showDeadZones && trafficData) {
          drawDeadZones(ctx, trafficData);
        }

        ctx.restore();
      })
      .catch(() => {
        const ctx2 = canvasRef.current?.getContext('2d');
        if (!ctx2) return;
        ctx2.fillStyle = '#18181b';
        ctx2.fillRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);
        ctx2.fillStyle = '#52525b';
        ctx2.font = '24px sans-serif';
        ctx2.textAlign = 'center';
        ctx2.fillText('Minimap unavailable', IMAGE_SIZE / 2, IMAGE_SIZE / 2);
      });
  }, [mapId, heatmapLayers, trafficData, showDeadZones, loading, transform]);

  // ── Draw navigator thumbnail ───────────────────────────────────────────────

  useEffect(() => {
    const mini = miniRef.current;
    if (!mini || !mapId) return;
    const { scale, x, y } = transform;
    const ctx = mini.getContext('2d');
    const s   = MINI_PX;

    ctx.clearRect(0, 0, s, s);
    if (scale <= 1) return;

    const src = MINIMAP_FILES[mapId];
    if (!src) return;

    loadImage(src).then((img) => {
      ctx.filter = 'grayscale(100%) brightness(0.5)';
      ctx.drawImage(img, 0, 0, s, s);
      ctx.filter = 'none';

      // Viewport rect in navigator coords
      const vpX = (-x / scale) / IMAGE_SIZE * s;
      const vpY = (-y / scale) / IMAGE_SIZE * s;
      const vpW = s / scale;
      const vpH = s / scale;

      ctx.fillStyle   = 'rgba(255,255,255,0.12)';
      ctx.fillRect(vpX, vpY, vpW, vpH);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth   = 1.5;
      ctx.strokeRect(vpX, vpY, vpW, vpH);
    });
  }, [transform, mapId]);

  // ── Scroll-wheel zoom (centred on cursor) ──────────────────────────────────

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect   = canvas.getBoundingClientRect();
    const mx     = (e.clientX - rect.left)  / rect.width  * IMAGE_SIZE;
    const my     = (e.clientY - rect.top)   / rect.height * IMAGE_SIZE;
    const { scale, x, y } = transformRef.current;
    const factor   = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor));
    if (newScale === scale) return;
    const newX = mx - (mx - x) * newScale / scale;
    const newY = my - (my - y) * newScale / scale;
    setTransform(clampTransform(newScale, newX, newY));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  // ── Pan (click-drag with window-level move/up for robustness) ─────────────

  const onMouseDown = useCallback((e) => {
    if (e.button !== 0 || transformRef.current.scale <= 1) return;
    dragging.current  = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setIsPanning(true);
    e.preventDefault(); // prevent text selection while dragging
  }, []);

  // Attach window-level listeners only while dragging — this way the pan
  // continues correctly even if the mouse leaves the canvas mid-drag.
  useEffect(() => {
    if (!isPanning) return;

    const onMove = (e) => {
      if (!dragging.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dx = (e.clientX - lastMouse.current.x) / rect.width  * IMAGE_SIZE;
      const dy = (e.clientY - lastMouse.current.y) / rect.height * IMAGE_SIZE;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      const { scale, x, y } = transformRef.current;
      setTransform(clampTransform(scale, x + dx, y + dy));
    };

    const onUp = () => {
      dragging.current = false;
      setIsPanning(false);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, [isPanning]);

  // ── Navigator click → jump to position ────────────────────────────────────

  const onMiniClick = useCallback((e) => {
    const mini = miniRef.current;
    if (!mini) return;
    const rect     = mini.getBoundingClientRect();
    const cx       = (e.clientX - rect.left) / rect.width;
    const cy       = (e.clientY - rect.top)  / rect.height;
    const { scale } = transformRef.current;
    const newX = IMAGE_SIZE / 2 - cx * IMAGE_SIZE * scale;
    const newY = IMAGE_SIZE / 2 - cy * IMAGE_SIZE * scale;
    setTransform(clampTransform(scale, newX, newY));
  }, []);

  // ── Zoom buttons ───────────────────────────────────────────────────────────

  const zoomBy = useCallback((factor) => {
    const { scale, x, y } = transformRef.current;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor));
    const cx = IMAGE_SIZE / 2;
    const cy = IMAGE_SIZE / 2;
    const newX = cx - (cx - x) * newScale / scale;
    const newY = cy - (cy - y) * newScale / scale;
    setTransform(clampTransform(newScale, newX, newY));
  }, []);

  const resetView = useCallback(() => setTransform({ scale: 1, x: 0, y: 0 }), []);

  // ── Derived ────────────────────────────────────────────────────────────────

  const canPan = transform.scale > 1;
  const cursor = !canPan ? 'default' : isPanning ? 'grabbing' : 'grab';

  const btnCls = [
    'flex h-7 w-7 items-center justify-center rounded',
    'bg-zinc-900/80 backdrop-blur-sm border border-zinc-700',
    'text-zinc-300 text-sm font-bold leading-none',
    'hover:bg-zinc-700 hover:text-white transition select-none',
  ].join(' ');

  // ── Render ─────────────────────────────────────────────────────────────────
  //
  // Layout:
  //   outer — fills parent height/width, centres the square inner wrapper
  //   inner — sized by aspect-ratio + max constraints; always square
  //           canvas and overlays are positioned relative to this square

  const inner = (
    // aspect-square + h-full + max-w-full + max-h-full:
    // resolves to min(containerWidth, containerHeight) as a square.
    // h-full works because the parent (outer) is a flex item with a
    // defined computed height from the flex layout chain.
    <div
      className="relative h-full max-h-full max-w-full aspect-square"
    >
      <canvas
        ref={canvasRef}
        width={IMAGE_SIZE}
        height={IMAGE_SIZE}
        className="block w-full h-full rounded-xl"
        style={{ imageRendering: 'pixelated', cursor }}
        onMouseDown={onMouseDown}
      />

      {/* Bottom-right overlay: zoom buttons + navigator */}
      <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2 pointer-events-none">

        <div className="flex flex-col gap-1 pointer-events-auto">
          <button onClick={() => zoomBy(ZOOM_STEP)}      className={btnCls} title="Zoom in">+</button>
          <button onClick={resetView}                    className={btnCls} title="Reset view">⊡</button>
          <button onClick={() => zoomBy(1 / ZOOM_STEP)}  className={btnCls} title="Zoom out">−</button>
        </div>

        {/* Navigator — always mounted so ref stays attached; hidden at 1× */}
        <div
          className="pointer-events-auto rounded overflow-hidden border border-zinc-700 shadow-lg cursor-crosshair"
          style={{ width: MINI_PX, height: MINI_PX, display: canPan ? 'block' : 'none' }}
        >
          <canvas
            ref={miniRef}
            width={MINI_PX}
            height={MINI_PX}
            onClick={onMiniClick}
            className="block"
            style={{ width: MINI_PX, height: MINI_PX }}
          />
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="relative h-full max-h-full max-w-full aspect-square flex items-center justify-center rounded-xl bg-zinc-900">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-red-500" />
            <span className="text-xs text-zinc-500">Loading heatmap…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex items-center justify-center">
      {inner}
    </div>
  );
}
